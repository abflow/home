/**
 * Read SONOFF TRV-ZBT setpoints and temperatures through Zigbee2MQTT.
 *
 * Install the MQTT client once from the repository root:
 *   bun add mqtt
 *
 * Usage:
 *   bun tools/trv.ts trv_salon trv_bureau
 *   MQTT_URL=mqtt://127.0.0.1:1883 bun tools/trv.ts trv_salon
 *
 * Arguments are Zigbee2MQTT friendly names, not device IEEE addresses.
 */
import mqtt from "mqtt";

const devices = [...new Set(process.argv.slice(2))];
if (devices.length === 0) {
  console.error("Usage: bun tools/trv.ts <friendly_name> [friendly_name ...]");
  process.exit(1);
}

const baseTopic = process.env.Z2M_BASE_TOPIC ?? "zigbee2mqtt";
const mqttUrl = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";
const timeoutMs = Number(process.env.TRV_TIMEOUT_MS ?? 10000);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error("TRV_TIMEOUT_MS must be a positive number.");
  process.exit(1);
}

type Reading = {
  occupied_heating_setpoint?: number;
  local_temperature?: number;
};

const readings = new Map<string, Reading>();
const pending = new Set(devices);
const client = mqtt.connect(mqttUrl, { reconnectPeriod: 0, connectTimeout: 5000 });

let finished = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function finish(error?: string) {
  if (finished) return;
  finished = true;
  if (timer) clearTimeout(timer);
  if (error) console.error(error);

  for (const device of devices) {
    const reading = readings.get(device);
    console.log(JSON.stringify({
      device,
      occupied_heating_setpoint: reading?.occupied_heating_setpoint ?? null,
      local_temperature: reading?.local_temperature ?? null,
      complete: !pending.has(device),
    }));
  }

  if (error || pending.size > 0) {
    console.error(`No complete response from: ${[...pending].join(", ")}`);
    process.exitCode = 1;
  }
  client.end(true);
}

client.on("connect", () => {
  const topics = devices.map((device) => `${baseTopic}/${device}`);
  client.subscribe(topics, { qos: 0 }, (err) => {
    if (err) return finish(`MQTT subscription failed: ${err.message}`);

    for (const device of devices) {
      client.publish(`${baseTopic}/${device}/get`, JSON.stringify({
        occupied_heating_setpoint: "",
        local_temperature: "",
      }), { qos: 0 }, (publishError) => {
        if (publishError) finish(`MQTT publish failed: ${publishError.message}`);
      });
    }
    timer = setTimeout(() => finish(), timeoutMs);
  });
});

client.on("message", (topic, payload) => {
  if (finished) return;
  const prefix = `${baseTopic}/`;
  if (!topic.startsWith(prefix)) return;
  const device = topic.slice(prefix.length);
  if (!pending.has(device)) return;

  try {
    const data: unknown = JSON.parse(payload.toString());
    if (typeof data !== "object" || data === null) return;
    const state = data as Record<string, unknown>;
    const reading = readings.get(device) ?? {};
    for (const field of ["occupied_heating_setpoint", "local_temperature"] as const) {
      if (typeof state[field] === "number" && Number.isFinite(state[field])) {
        reading[field] = state[field];
      }
    }
    readings.set(device, reading);
    if (reading.occupied_heating_setpoint !== undefined && reading.local_temperature !== undefined) {
      pending.delete(device);
      if (pending.size === 0) finish();
    }
  } catch {
    // Ignore malformed or non-JSON messages.
  }
});

client.on("error", (error) => finish(`MQTT connection failed: ${error.message}`));

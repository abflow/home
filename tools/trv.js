/**
 * Snapshot of all SONOFF TRV-ZBT valves, including group 1 weekly schedules.
 *
 * Install once: bun add mqtt
 * Run:          bun tools/trv.js
 * Optional:     MQTT_URL=mqtt://127.0.0.1:1883 bun tools/trv.js
 *
 * This tool temporarily selects schedule_group_to_edit=1 (if needed), then
 * restores its original value. It never changes schedule_active_group or
 * the heating setpoint/schedules.
 */
import mqtt from "mqtt";

const base = process.env.Z2M_BASE_TOPIC ?? "zigbee2mqtt";
const client = mqtt.connect(process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883", {
  reconnectPeriod: 0,
  connectTimeout: 5000,
});
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const fields = [
  "occupied_heating_setpoint",
  "local_temperature",
  "system_mode",
  "schedule_active_group",
  "schedule_group_to_edit",
  ...days.map((day) => `weekly_schedule_${day}`),
];
const timeoutMs = Number(process.env.TRV_TIMEOUT_MS ?? 5000);
const pauseMs = Number(process.env.TRV_PAUSE_MS ?? 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listeners = new Set();
let closed = false;

function onMessage(topic, payload, packet) {
  let data;
  try { data = JSON.parse(payload.toString()); } catch { return; }
  for (const callback of listeners) callback(topic, data, packet);
}
client.on("message", onMessage);

function waitFor(topic, check = () => true, timeout = timeoutMs) {
  return new Promise((resolve) => {
    const listener = (messageTopic, data, packet) => {
      if (messageTopic !== topic || packet.retain || !check(data)) return;
      cleanup();
      resolve(data);
    };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeout);
    function cleanup() { clearTimeout(timer); listeners.delete(listener); }
    listeners.add(listener);
  });
}

function publish(topic, data) {
  return new Promise((resolve, reject) =>
    client.publish(topic, JSON.stringify(data), (error) => error ? reject(error) : resolve())
  );
}

async function read(device, key) {
  const topic = `${base}/${device}`;
  const answer = waitFor(topic, (data) => data && Object.hasOwn(data, key));
  await publish(`${topic}/get`, { [key]: "" });
  return (await answer)?.[key] ?? null;
}

async function writeAndConfirm(device, key, value) {
  const topic = `${base}/${device}`;
  const answer = waitFor(topic, (data) => data && String(data[key]) === String(value));
  await publish(`${topic}/set`, { [key]: value });
  return (await answer) !== null;
}

async function inspect(device) {
  const result = {
    name: device.friendly_name,
    ieee_address: device.ieee_address,
    model: device.definition?.model ?? device.model_id,
    occupied_heating_setpoint: null,
    local_temperature: null,
    system_mode: null,
    schedule_active_group: null,
    schedule_group_to_edit_before: null,
    weekly_schedule_group: 1,
    weekly_schedule: Object.fromEntries(days.map((day) => [day, null])),
    warnings: [],
  };

  const name = device.friendly_name;
  for (const key of fields.slice(0, 5)) {
    const value = await read(name, key);
    if (key === "schedule_group_to_edit") result.schedule_group_to_edit_before = value;
    else result[key] = value;
    if (value === null) result.warnings.push(`No response: ${key}`);
    await sleep(pauseMs);
  }

  const original = result.schedule_group_to_edit_before;
  let groupOneSelected = String(original) === "1";
  let changed = false;
  if (original !== null && !groupOneSelected) {
    groupOneSelected = await writeAndConfirm(name, "schedule_group_to_edit", "1");
    changed = groupOneSelected;
    if (!groupOneSelected) result.warnings.push("Could not select schedule group 1");
    await sleep(pauseMs);
  }
  if (original === null) {
    result.warnings.push("Unknown schedule_group_to_edit; schedules not read to avoid attributing the wrong group");
  }

  try {
    if (groupOneSelected) {
      for (const day of days) {
        const key = `weekly_schedule_${day}`;
        result.weekly_schedule[day] = await read(name, key);
        if (result.weekly_schedule[day] === null) result.warnings.push(`No response: ${key}`);
        await sleep(pauseMs);
      }
    }
  } finally {
    if (changed) {
      const restored = await writeAndConfirm(name, "schedule_group_to_edit", original);
      if (!restored) result.warnings.push(`Could not confirm restoration of schedule_group_to_edit=${original}`);
    }
  }
  return result;
}

try {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pauseMs) || pauseMs < 0)
    throw new Error("Invalid TRV_TIMEOUT_MS or TRV_PAUSE_MS");

  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });

  await new Promise((resolve, reject) => {
    client.subscribe([`${base}/bridge/devices`, `${base}/+`, `${base}/#`], (err) => err ? reject(err) : resolve());
  });

  // The bridge/devices topic is retained, so a newly connected client receives it.
  const devices = await new Promise((resolve) => {
    const listener = (topic, data) => {
      if (topic !== `${base}/bridge/devices` || !Array.isArray(data)) return;
      clearTimeout(timer);
      listeners.delete(listener);
      resolve(data);
    };
    listeners.add(listener);
    const timer = setTimeout(() => { listeners.delete(listener); resolve(null); }, timeoutMs);
  });
  if (!devices) throw new Error("No bridge/devices message received. Is Zigbee2MQTT running?");

  const valves = devices.filter((device) =>
    device.type !== "Coordinator" && device.supported !== false && device.disabled !== true &&
    (device.definition?.model === "TRV-ZBT" || device.model_id === "TRV-ZBT")
  );
  const output = [];
  for (const device of valves) {
    output.push(await inspect(device));
  }

  console.log(JSON.stringify({
    captured_at: new Date().toISOString(),
    device_count: output.length,
    devices: output,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (!closed) { closed = true; client.end(true); }
}

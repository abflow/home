/**
 * Read all SONOFF TRV-ZBT valves and group 1 weekly schedules via Zigbee2MQTT.
 * Usage: bun tools/trv.js
 * Install once: bun add mqtt
 * Optional: TRV_TIMEOUT_MS=12000 MQTT_URL=mqtt://127.0.0.1:1883 bun tools/trv.js
 *
 * Queries are batched; at most two TRVs are processed concurrently.
 * Only schedule_group_to_edit may be temporarily changed; it is restored.
 */
import mqtt from "mqtt";

const base = process.env.Z2M_BASE_TOPIC ?? "zigbee2mqtt";
const timeout = Number(process.env.TRV_TIMEOUT_MS ?? 12000);
const maxConcurrent = 2;
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const scheduleFields = days.map(day => `weekly_schedule_${day}`);
const overviewFields = [
  "occupied_heating_setpoint", "local_temperature", "system_mode",
  "schedule_active_group", "schedule_group_to_edit",
];
if (!Number.isFinite(timeout) || timeout < 1000) throw new Error("Invalid TRV_TIMEOUT_MS");

const client = mqtt.connect(process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883", {
  reconnectPeriod: 0,
  connectTimeout: 5000,
});
const watchers = new Set();
client.on("message", (topic, payload, packet) => {
  let state;
  try { state = JSON.parse(payload.toString()); } catch { return; }
  for (const watcher of watchers) watcher(topic, state, packet);
});

async function subscribe(topic) {
  return new Promise((resolve, reject) =>
    client.subscribe(topic, (error) => error ? reject(error) : resolve()));
}
async function publish(topic, value) {
  return new Promise((resolve, reject) =>
    client.publish(topic, JSON.stringify(value), (error) => error ? reject(error) : resolve()));
}
function until(topic, condition, ms = timeout, acceptRetained = false) {
  let timer;
  let listener;
  const promise = new Promise((resolve) => {
    listener = (incoming, data, packet) => {
      if (incoming !== topic || (!acceptRetained && packet.retain) || !condition(data)) return;
      cleanup();
      resolve(data);
    };
    timer = setTimeout(() => { cleanup(); resolve(null); }, ms);
    watchers.add(listener);
  });
  function cleanup() { clearTimeout(timer); watchers.delete(listener); }
  return { promise, cancel: cleanup };
}
async function request(name, keys) {
  const topic = `${base}/${name}`;
  const values = {};
  const needed = new Set(keys);
  const watcher = until(topic, (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    for (const key of [...needed]) {
      if (data[key] !== undefined && data[key] !== null) {
        values[key] = data[key];
        needed.delete(key);
      }
    }
    return needed.size === 0;
  });
  try {
    await publish(`${topic}/get`, Object.fromEntries(keys.map(key => [key, ""])));
    await watcher.promise;
  } finally {
    watcher.cancel();
  }
  return { values, missing: [...needed] };
}
async function selectGroup(name, group) {
  const watcher = until(`${base}/${name}`,
    (data) => String(data?.schedule_group_to_edit) === String(group));
  try {
    await publish(`${base}/${name}/set`, { schedule_group_to_edit: String(group) });
    return (await watcher.promise) !== null;
  } finally {
    watcher.cancel();
  }
}
async function inspect(device) {
  const name = device.friendly_name;
  const result = {
    name,
    ieee_address: device.ieee_address,
    model: device.definition?.model ?? device.model_id,
    occupied_heating_setpoint: null,
    local_temperature: null,
    system_mode: null,
    schedule_active_group: null,
    schedule_group_to_edit_before: null,
    weekly_schedule_group: 1,
    weekly_schedule: Object.fromEntries(days.map(day => [day, null])),
    warnings: [],
  };
  try {
    const overview = await request(name, overviewFields);
    for (const key of overviewFields) {
      if (key === "schedule_group_to_edit") result.schedule_group_to_edit_before = overview.values[key] ?? null;
      else result[key] = overview.values[key] ?? null;
    }
    if (overview.missing.length) result.warnings.push(`Missing overview: ${overview.missing.join(", ")}`);

    const previous = result.schedule_group_to_edit_before;
    let selected = String(previous) === "1";
    let changed = false;
    if (previous !== null && !selected) {
      selected = await selectGroup(name, "1");
      changed = selected;
      if (!selected) result.warnings.push("Could not select schedule group 1");
    } else if (previous === null) {
      result.warnings.push("Unknown group to edit; schedules skipped to avoid wrong attribution");
    }
    try {
      if (selected) {
        const schedules = await request(name, scheduleFields);
        for (const day of days) result.weekly_schedule[day] =
          schedules.values[`weekly_schedule_${day}`] ?? null;
        if (schedules.missing.length)
          result.warnings.push(`Missing schedules: ${schedules.missing.join(", ")}`);
      }
    } finally {
      if (changed && !(await selectGroup(name, previous))) {
        result.warnings.push(`WARNING: could not confirm restoration of schedule_group_to_edit=${previous}`);
      }
    }
  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : String(error));
  }
  return result;
}
try {
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
  // Listen before subscribing, so retained bridge/devices cannot be missed.
  const list = until(`${base}/bridge/devices`, Array.isArray, timeout, true);
  try {
    await subscribe(`${base}/#`);
    const devices = await list.promise;
    if (!devices) throw new Error("No bridge/devices response from Zigbee2MQTT");
    const valves = devices.filter(d =>
      d.type !== "Coordinator" && d.disabled !== true && d.supported !== false &&
      (d.definition?.model === "TRV-ZBT" || d.model_id === "TRV-ZBT")
    );
    const results = new Array(valves.length);
    let next = 0;
    async function worker() {
      while (next < valves.length) {
        const index = next++;
        results[index] = await inspect(valves[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrent, valves.length) }, worker));
    console.log(JSON.stringify({
      captured_at: new Date().toISOString(),
      device_count: results.length,
      devices: results,
    }, null, 2));
  } finally {
    list.cancel();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  client.end(true);
}

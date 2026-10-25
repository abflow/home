import { existsSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { connect } from "node:net";

const root = resolve(import.meta.dir, "..");
const dataDir = resolve(root, "data/zigbee2mqtt");
const config = resolve(dataDir, "configuration.yaml");
const template = resolve(root, "config/zigbee2mqtt.example.yaml");
const entry = resolve(root, "node_modules/zigbee2mqtt/index.js");

mkdirSync(dataDir, { recursive: true });
if (!existsSync(config)) {
  copyFileSync(template, config);
  chmodSync(config, 0o600);
  console.log("Created local Zigbee2MQTT configuration.");
}

const hash = Bun.spawn(["bun", entry, "writehash"], { cwd: root, stdout: "inherit", stderr: "inherit" });
if (await hash.exited !== 0) throw new Error("Zigbee2MQTT hash preparation failed");

const broker = Bun.spawn(["mosquitto", "-c", resolve(root, "config/mosquitto.conf"), "-v"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

function brokerReady() {
  return new Promise((done) => {
    const socket = connect({ host: "127.0.0.1", port: 1883 });
    socket.setTimeout(400);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", () => { socket.destroy(); done(false); });
    socket.once("timeout", () => { socket.destroy(); done(false); });
  });
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  if (broker.exitCode !== null) break;
  if (await brokerReady()) { ready = true; break; }
  await Bun.sleep(100);
}
if (!ready || broker.exitCode !== null) {
  broker.kill();
  throw new Error("Mosquitto did not start. Check the broker logs and port 1883.");
}

const zigbee = Bun.spawn(["bun", entry], {
  cwd: root,
  env: {
    ...process.env,
    ZIGBEE2MQTT_DATA: dataDir,
    Z2M_ONBOARD_URL: "http://127.0.0.1:8081",
  },
  stdout: "inherit",
  stderr: "inherit",
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  zigbee.kill("SIGINT");
  broker.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const result = await Promise.race([
  zigbee.exited.then((code) => ({ name: "Zigbee2MQTT", code })),
  broker.exited.then((code) => ({ name: "Mosquitto", code })),
]);
const unexpected = !stopping;
if (unexpected) console.log(`${result.name} stopped (exit ${result.code}).`);
stop();
await Promise.all([zigbee.exited, broker.exited]);
if (unexpected && result.code !== 0) process.exitCode = result.code;

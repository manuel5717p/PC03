const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTelemetryPacket,
  createTelemetryPlan,
  createTelemetryPressurePlan,
  parseArgs,
  runLocalSimulation,
  simulateTelemetryPressure
} = require("../src/telemetry-stream-simulator");

test("genera packets deterministas para laboratorio", () => {
  const packet = buildTelemetryPacket(2, { baseTimeMs: Date.UTC(2026, 4, 21, 20, 0, 0), droneCount: 3 });

  assert.equal(packet.drone_id, "drone-003");
  assert.equal(packet.timestamp.seconds, 1779393602);
  assert.equal(packet.location.latitude, -34.6035);
  assert.equal(packet.location.longitude, -58.3818);
  assert.equal(packet.battery_level, 93);
});

test("modo normal usa pocos packets y cadencia de un segundo", () => {
  const plan = createTelemetryPlan({ mode: "normal" });

  assert.equal(plan.count, 5);
  assert.equal(plan.intervalMs, 1000);
  assert.equal(plan.packets.length, 5);
});

test("modo concert/burst usa muchos packets sin espera entre envios", () => {
  const plan = createTelemetryPlan({ mode: "concert" });

  assert.equal(plan.count, 250);
  assert.equal(plan.intervalMs, 0);
  assert.equal(plan.packets.length, 250);
});

test("simulacion local reporta resumen sin requerir servidor gRPC", async () => {
  const report = await runLocalSimulation({ mode: "concert", count: 10, skipDelay: true });

  assert.equal(report.transport, "local-lab-simulation");
  assert.equal(report.packetsSent, 10);
  assert.equal(report.firstPacket.drone_id, "drone-001");
  assert.equal(report.lastPacket.drone_id, "drone-005");
});

test("parsea flags del simulador de telemetria", () => {
  const options = parseArgs(["--concert", "--count=25", "--interval-ms=0", "--target=127.0.0.1:50051"]);

  assert.deepEqual(options, {
    skipDelay: false,
    mode: "concert",
    count: 25,
    intervalMs: 0,
    target: "127.0.0.1:50051"
  });
});

test("parsea modos de laboratorio de presion", () => {
  assert.equal(parseArgs(["--saturated"]).mode, "saturated");
  assert.equal(parseArgs(["--controlled"]).mode, "controlled");
  assert.equal(parseArgs(["--mode", "saturated"]).mode, "saturated");
  assert.equal(parseArgs(["controlled"]).mode, "controlled");
});

test("rechaza modos desconocidos de laboratorio de presion", () => {
  assert.throws(
    () => createTelemetryPressurePlan({ mode: "saturted" }),
    /telemetry pressure mode 'saturted' is not supported/
  );
});

test("plan de presion normal tiene consumidor mas rapido que productor", () => {
  const plan = createTelemetryPressurePlan({ mode: "normal" });

  assert.equal(plan.producedPerTick, 2);
  assert.equal(plan.consumerCapacityPerTick, 3);
  assert.equal(plan.strategy, "buffer");
});

test("presion saturada acumula backlog y descarta cuando el buffer se llena", () => {
  const report = simulateTelemetryPressure({
    mode: "saturated",
    producedPerTick: 6,
    consumerCapacityPerTick: 2,
    ticks: 5,
    bufferCapacity: 8
  });

  assert.equal(report.produced, 30);
  assert.equal(report.processed, 10);
  assert.equal(report.buffered, 6);
  assert.equal(report.dropped, 14);
  assert.equal(report.peakBuffered, 8);
  assert.equal(report.lag, 6);
});

test("modo controlado aplica sampling antes de llenar el buffer", () => {
  const report = simulateTelemetryPressure({
    mode: "controlled",
    producedPerTick: 6,
    consumerCapacityPerTick: 2,
    ticks: 5,
    bufferCapacity: 8,
    strategy: "sample",
    sampleEvery: 3
  });

  assert.equal(report.produced, 30);
  assert.equal(report.accepted, 10);
  assert.equal(report.processed, 10);
  assert.equal(report.buffered, 0);
  assert.equal(report.dropped, 0);
  assert.equal(report.sampledOut, 20);
});

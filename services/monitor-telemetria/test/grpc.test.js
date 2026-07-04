const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { buildTelemetryService } = require("../src/telemetry-service");
const { loadProto } = require("../src/server");

test("carga el contrato proto v1", () => {
  const telemetryPackage = loadProto();
  assert.equal(typeof telemetryPackage.TelemetryService.service.StreamTelemetry, "object");
});

test("procesa stream válido y responde ack", async () => {
  const service = buildTelemetryService();
  const call = new EventEmitter();

  const ackPromise = new Promise((resolve) => {
    service.StreamTelemetry(call, (_error, ack) => resolve(ack));
  });

  call.emit("data", { drone_id: "drone-1" });
  call.emit("data", { drone_id: "drone-2" });
  call.emit("end");

  const ack = await ackPromise;
  assert.deepEqual(ack, { success: true, message: "Packets procesados: 2" });
});

test("rechaza packet inválido", async () => {
  const service = buildTelemetryService();
  const call = new EventEmitter();

  const ackPromise = new Promise((resolve) => {
    service.StreamTelemetry(call, (_error, ack) => resolve(ack));
  });

  call.emit("data", { drone_id: "" });

  const ack = await ackPromise;
  assert.deepEqual(ack, { success: false, message: "Packet inválido: drone_id requerido" });
});

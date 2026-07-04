const test = require("node:test");
const assert = require("node:assert/strict");
const { createQueuePressurePlan, parseArgs, runQueuePressureLab } = require("../src/backpressure-lab");

test("plan normal procesa mas rapido de lo que entra", () => {
  const plan = createQueuePressurePlan({ mode: "normal" });

  assert.equal(plan.incomingJobs, 4);
  assert.equal(plan.maxQueued, 8);
  assert.equal(plan.workerCapacity, 4);
});

test("rechaza modos desconocidos de laboratorio de cola", () => {
  assert.throws(
    () => createQueuePressurePlan({ mode: "saturted" }),
    /queue pressure mode 'saturted' is not supported/
  );
});

test("modo saturado muestra rechazos y backlog por worker lento", async () => {
  const report = await runQueuePressureLab({ mode: "saturated" });

  assert.equal(report.incomingJobs, 10);
  assert.equal(report.metrics.enqueued, 4);
  assert.equal(report.metrics.rejected, 6);
  assert.equal(report.metrics.processed, 2);
  assert.equal(report.metrics.queued, 2);
  assert.equal(report.rejectedJobs.length, 6);
});

test("modo controlado reduce tasa y reintenta notificacion fallida", async () => {
  const report = await runQueuePressureLab({ mode: "controlled" });

  assert.equal(report.incomingJobs, 10);
  assert.equal(report.deferredJobs.length, 5);
  assert.equal(report.metrics.enqueued, 5);
  assert.equal(report.metrics.rejected, 0);
  assert.equal(report.metrics.retried, 1);
  assert.equal(report.metrics.processed, 5);
  assert.equal(report.metrics.queued, 0);
});

test("parsea flags del laboratorio de backpressure", () => {
  const options = parseArgs(["--controlled", "--incoming-jobs=12", "--max-queued=4", "--worker-capacity=2", "--accept-every=3", "--fail-first-notification"]);

  assert.deepEqual(options, {
    mode: "controlled",
    incomingJobs: 12,
    maxQueued: 4,
    workerCapacity: 2,
    acceptEvery: 3,
    failFirstNotification: true
  });

  assert.equal(parseArgs(["--mode", "saturated"]).mode, "saturated");
  assert.equal(parseArgs(["controlled"]).mode, "controlled");
});

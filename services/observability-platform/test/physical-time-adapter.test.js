const test = require("node:test");
const assert = require("node:assert/strict");
const { listPhysicalTimeModes, runPhysicalTimeObservabilityLab } = require("../src/adapters/physical-time-adapter");

const expectedModeIds = ["normal", "skew", "drift", "tolerance"];

test("physical time adapter exposes every supported Session 21 mode", () => {
  assert.deepEqual(listPhysicalTimeModes().map((mode) => mode.id), expectedModeIds);
});

test("physical time adapter runs every listed mode through the structured envelope", () => {
  listPhysicalTimeModes().forEach((mode) => {
    const result = runPhysicalTimeObservabilityLab(mode.id);

    assert.equal(result.labId, "physical-time");
    assert.equal(result.session, 21);
    assert.equal(result.mode, mode.id);
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.observations));
    assert.ok(Array.isArray(result.timeline));
    assert.ok(Array.isArray(result.decisions));
    assert.ok(result.decisions.length > 0);
    assert.equal(typeof result.raw, "object");
    assert.equal(result.raw.mode, mode.id);
    assert.equal(typeof result.learning.objective, "string");
    assert.ok(Array.isArray(result.learning.keyMetrics));
    assert.ok(result.learning.keyMetrics.length > 0);
    assert.ok(Array.isArray(result.learning.checklist));
    assert.ok(result.learning.checklist.length >= 2);
    assert.equal(typeof result.learning.takeaway, "string");
  });
});

test("physical time adapter exposes educational decisions for the Session 21 foundation", () => {
  const normal = runPhysicalTimeObservabilityLab("normal");
  const drift = runPhysicalTimeObservabilityLab("drift");

  assert.equal(normal.decisions.find((decision) => decision.id === "monotonic-duration").decision, "usar-tiempo-monotonico");
  assert.equal(normal.decisions.find((decision) => decision.id === "tolerance-validation").decision, "rechazar-fuera-de-tolerancia");
  assert.equal(drift.decisions.find((decision) => decision.id === "drift-uncertainty").decision, "aumentar-incertidumbre-con-drift");
});

test("physical time adapter maps drift data from the monitor telemetry lab", () => {
  const result = runPhysicalTimeObservabilityLab("drift");

  assert.equal(result.metrics.finalClockSkewMs, 65);
  assert.equal(result.metrics.totalErrorGrowthMs, 60);
  assert.equal(result.timeline.length, result.raw.ticks);
});

test("physical time adapter rejects unsupported modes", () => {
  assert.throws(
    () => runPhysicalTimeObservabilityLab("unknown"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

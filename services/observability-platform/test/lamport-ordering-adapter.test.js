const test = require("node:test");
const assert = require("node:assert/strict");
const { listLamportOrderingModes, runLamportOrderingObservabilityLab } = require("../src/adapters/lamport-ordering-adapter");

const expectedModeIds = ["causal-chain", "concurrent-events", "merge-and-tie-break"];

test("lamport ordering adapter exposes every supported Session 23 mode", () => {
  assert.deepEqual(listLamportOrderingModes().map((mode) => mode.id), expectedModeIds);
});

test("lamport ordering adapter runs every listed mode through the structured envelope", () => {
  listLamportOrderingModes().forEach((mode) => {
    const result = runLamportOrderingObservabilityLab(mode.id);

    assert.equal(result.labId, "lamport-ordering");
    assert.equal(result.session, 23);
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

test("lamport ordering adapter exposes causal and concurrency decisions", () => {
  const causal = runLamportOrderingObservabilityLab("causal-chain");
  const concurrent = runLamportOrderingObservabilityLab("concurrent-events");

  assert.equal(causal.decisions.find((decision) => decision.id === "partial-order").decision, "usar-happened-before");
  assert.equal(concurrent.decisions.find((decision) => decision.id === "concurrency-warning").decision, "no-inferir-causalidad");
});

test("lamport ordering adapter rejects unsupported modes", () => {
  assert.throws(
    () => runLamportOrderingObservabilityLab("vector-clocks"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

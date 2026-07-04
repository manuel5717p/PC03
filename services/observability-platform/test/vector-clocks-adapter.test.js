const test = require("node:test");
const assert = require("node:assert/strict");
const { listVectorClocksModes, runVectorClocksObservabilityLab } = require("../src/adapters/vector-clocks-adapter");

const expectedModeIds = ["causal-chain", "concurrent-events", "merge-and-conflict"];

test("vector clocks adapter exposes every supported Session 24 mode", () => {
  assert.deepEqual(listVectorClocksModes().map((mode) => mode.id), expectedModeIds);
});

test("vector clocks adapter runs every listed mode through the structured envelope", () => {
  listVectorClocksModes().forEach((mode) => {
    const result = runVectorClocksObservabilityLab(mode.id);

    assert.equal(result.labId, "vector-clocks");
    assert.equal(result.session, 24);
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

test("vector clocks adapter exposes concurrency and conflict decisions", () => {
  const concurrent = runVectorClocksObservabilityLab("concurrent-events");
  const conflict = runVectorClocksObservabilityLab("merge-and-conflict");

  assert.equal(concurrent.decisions.find((decision) => decision.id === "incomparable-events").decision, "marcar-concurrente");
  assert.equal(conflict.decisions.find((decision) => decision.id === "conflict-detection").decision, "resolver-si-concurrente-y-mismo-dominio");
});

test("vector clocks adapter rejects unsupported modes", () => {
  assert.throws(
    () => runVectorClocksObservabilityLab("mutex"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

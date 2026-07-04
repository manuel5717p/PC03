const test = require("node:test");
const assert = require("node:assert/strict");
const { listMutualExclusionModes, runMutualExclusionObservabilityLab } = require("../src/adapters/mutual-exclusion-adapter");

const expectedModeIds = ["contended-queue", "fairness-rounds", "critical-section-safety", "delay-and-reorder"];

test("mutual exclusion adapter exposes every supported Session 25 mode", () => {
  assert.deepEqual(listMutualExclusionModes().map((mode) => mode.id), expectedModeIds);
});

test("mutual exclusion adapter runs every listed mode through the structured envelope", () => {
  listMutualExclusionModes().forEach((mode) => {
    const result = runMutualExclusionObservabilityLab(mode.id);

    assert.equal(result.labId, "mutual-exclusion");
    assert.equal(result.session, 25);
    assert.equal(result.mode, mode.id);
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.observations));
    assert.ok(Array.isArray(result.timeline));
    assert.ok(Array.isArray(result.decisions));
    assert.equal(result.evidence.safetyHolds, true);
    assert.equal(result.evidence.lifecycleModel, "request -> wait/queued -> grant -> enter-critical-section -> release/exit");
    assert.equal(result.evidence.lifecycleAnswers.whoGrants, "arbitraje-deterministico-simplificado");
    assert.ok(result.timeline.some((entry) => entry.decision === "grant"));
    assert.ok(result.timeline.some((entry) => entry.decision === "release"));
    assert.equal(typeof result.raw, "object");
    assert.equal(result.raw.mode, mode.id);
    assert.equal(typeof result.learning.objective, "string");
    assert.ok(result.learning.keyMetrics.length > 0);
    assert.ok(result.learning.checklist.length >= 2);
  });
});

test("mutual exclusion adapter rejects unsupported modes", () => {
  assert.throws(
    () => runMutualExclusionObservabilityLab("lease"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

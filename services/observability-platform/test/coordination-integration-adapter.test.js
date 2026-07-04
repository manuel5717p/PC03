const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listCoordinationIntegrationModes,
  runCoordinationIntegrationObservabilityLab
} = require("../src/adapters/coordination-integration-adapter");

test("coordination integration adapter lists Session 29 modes", () => {
  assert.deepEqual(listCoordinationIntegrationModes().map((mode) => mode.id), [
    "pc3-ready-happy-path",
    "causal-conflict-review",
    "suspected-leader-compensation"
  ]);
});

test("coordination integration adapter runs deterministic Session 29 lab", () => {
  const result = runCoordinationIntegrationObservabilityLab("causal-conflict-review");

  assert.equal(result.labId, "coordination-integration");
  assert.equal(result.session, 29);
  assert.equal(result.mode, "causal-conflict-review");
  assert.equal(result.evidence.decision, "requires-review");
  assert.equal(result.evidence.confidence, "medium");
  assert.equal(result.metrics.vectorConflictDetected, true);
  assert.match(result.evidence.boundary, /does not implement consensus, quorum/);
});

test("coordination integration adapter rejects unavailable modes", () => {
  assert.throws(
    () => runCoordinationIntegrationObservabilityLab("raft"),
    /not available in the observability platform/
  );
});

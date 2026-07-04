const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listDistributedCoordinationModes,
  runDistributedCoordinationObservabilityLab
} = require("../src/adapters/distributed-coordination-adapter");

test("distributed coordination adapter lists Session 28 modes", () => {
  assert.deepEqual(listDistributedCoordinationModes().map((mode) => mode.id), [
    "coordinated-dispatch-handoff",
    "expired-lease-prevention",
    "degraded-compensation"
  ]);
});

test("distributed coordination adapter runs deterministic Session 28 lab", () => {
  const result = runDistributedCoordinationObservabilityLab("expired-lease-prevention");

  assert.equal(result.labId, "distributed-coordination");
  assert.equal(result.session, 28);
  assert.equal(result.mode, "expired-lease-prevention");
  assert.equal(result.metrics.actionAccepted, false);
  assert.match(result.evidence.boundary, /consensus, quorum/);
});

test("distributed coordination adapter rejects unavailable modes", () => {
  assert.throws(
    () => runDistributedCoordinationObservabilityLab("raft"),
    /not available in the observability platform/
  );
});

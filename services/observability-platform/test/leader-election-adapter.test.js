const test = require("node:test");
const assert = require("node:assert/strict");
const { listLeaderElectionModes, runLeaderElectionObservabilityLab } = require("../src/adapters/leader-election-adapter");

const expectedModeIds = ["stable-leader-heartbeats", "leader-failure-and-reelection", "false-suspicion-timeout", "leader-recovery-rejoin"];

test("leader election adapter exposes every supported Session 27 mode", () => {
  assert.deepEqual(listLeaderElectionModes().map((mode) => mode.id), expectedModeIds);
});

test("leader election adapter runs every listed mode through the structured envelope", () => {
  listLeaderElectionModes().forEach((mode) => {
    const result = runLeaderElectionObservabilityLab(mode.id);

    assert.equal(result.labId, "leader-election");
    assert.equal(result.session, 27);
    assert.equal(result.mode, mode.id);
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.observations));
    assert.ok(Array.isArray(result.timeline));
    assert.ok(Array.isArray(result.decisions));
    assert.equal(result.evidence.clusterId, "aura-coordination-ring");
    assert.equal(result.evidence.detectorType, "heartbeat-timeout-simulated");
    assert.equal(typeof result.evidence.initialLeader, "string");
    assert.equal(typeof result.evidence.finalLeader, "string");
    assert.match(result.evidence.scopeWarning, /out of scope/);
    assert.equal(typeof result.raw, "object");
    assert.equal(result.raw.mode, mode.id);
    assert.equal(typeof result.learning.objective, "string");
    assert.ok(result.learning.keyMetrics.length > 0);
    assert.ok(result.learning.checklist.length >= 2);
  });
});

test("leader election adapter rejects unsupported modes", () => {
  assert.throws(
    () => runLeaderElectionObservabilityLab("raft"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

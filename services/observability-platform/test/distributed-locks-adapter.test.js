const test = require("node:test");
const assert = require("node:assert/strict");
const { listDistributedLocksModes, runDistributedLocksObservabilityLab } = require("../src/adapters/distributed-locks-adapter");

const expectedModeIds = ["lock-acquire-and-hold", "lease-expiry-and-reacquire", "renewal-jitter-and-risk", "stale-owner-and-fencing-warning"];

test("distributed locks adapter exposes every supported Session 26 mode", () => {
  assert.deepEqual(listDistributedLocksModes().map((mode) => mode.id), expectedModeIds);
});

test("distributed locks adapter runs every listed mode through the structured envelope", () => {
  listDistributedLocksModes().forEach((mode) => {
    const result = runDistributedLocksObservabilityLab(mode.id);

    assert.equal(result.labId, "distributed-locks");
    assert.equal(result.session, 26);
    assert.equal(result.mode, mode.id);
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.observations));
    assert.ok(Array.isArray(result.timeline));
    assert.ok(Array.isArray(result.decisions));
    assert.equal(result.evidence.resourceId, "aura-dispatch-window");
    assert.equal(typeof result.evidence.owner, "string");
    assert.equal(typeof result.evidence.leaseDeadline, "number");
    assert.match(result.evidence.scopeWarning, /out of scope/);
    assert.equal(typeof result.raw, "object");
    assert.equal(result.raw.mode, mode.id);
    assert.equal(typeof result.learning.objective, "string");
    assert.ok(result.learning.keyMetrics.length > 0);
    assert.ok(result.learning.checklist.length >= 2);
  });
});

test("distributed locks adapter rejects unsupported modes", () => {
  assert.throws(
    () => runDistributedLocksObservabilityLab("leader-election"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});

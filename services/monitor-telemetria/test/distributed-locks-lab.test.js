const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  DISTRIBUTED_LOCK_MODES,
  createDistributedLocksLabResult,
  createLease,
  parseArgs,
  runDistributedLocksLab,
  simulateAcquireAndHold,
  simulateLeaseExpiryAndReacquire,
  simulateRenewalJitterAndRisk,
  simulateStaleOwnerAndFencingWarning
} = require("../src/distributed-locks-lab");

const labPath = path.join(__dirname, "..", "src", "distributed-locks-lab.js");

test("createLease derives deterministic lease deadlines", () => {
  assert.deepEqual(createLease({ owner: "node-a", acquiredAt: 10, ttlMs: 25, fencingToken: 7 }), {
    resourceId: "aura-dispatch-window",
    owner: "node-a",
    acquiredAt: 10,
    leaseDeadline: 35,
    ttlMs: 25,
    fencingToken: 7
  });
});

test("lock acquire and hold accepts action within TTL", () => {
  const result = simulateAcquireAndHold();

  assert.equal(result.mode, "lock-acquire-and-hold");
  assert.equal(result.action.accepted, true);
  assert.equal(result.action.atMs < result.lease.leaseDeadline, true);
  assert.equal(result.expiredAt, null);
});

test("lease expiry and reacquire assigns a newer fencing token to the candidate", () => {
  const result = simulateLeaseExpiryAndReacquire();

  assert.equal(result.mode, "lease-expiry-and-reacquire");
  assert.equal(result.expiredAt, result.lease.leaseDeadline);
  assert.equal(result.nextLease.owner, result.candidate);
  assert.equal(result.nextLease.fencingToken > result.lease.fencingToken, true);
});

test("renewal jitter exposes near-deadline risk", () => {
  const result = simulateRenewalJitterAndRisk();

  assert.equal(result.mode, "renewal-jitter-and-risk");
  assert.equal(result.renewal.accepted, true);
  assert.equal(result.renewal.renewalSlackMs, 5);
  assert.equal(result.renewal.risk, "near-deadline");
});

test("stale owner action is rejected using fencing token evidence", () => {
  const result = simulateStaleOwnerAndFencingWarning();

  assert.equal(result.mode, "stale-owner-and-fencing-warning");
  assert.equal(result.staleOwnerAction.accepted, false);
  assert.equal(result.staleOwnerAction.providedFencingToken < result.staleOwnerAction.currentFencingToken, true);
  assert.ok(result.timeline.some((entry) => entry.decision === "fencing-warning-rejected"));
});

test("structured result exposes summary, observations, decisions, metrics, evidence, timeline and learning", () => {
  const result = createDistributedLocksLabResult({ mode: "stale-owner-and-fencing-warning" });

  assert.equal(result.labId, "distributed-locks");
  assert.equal(result.session, 26);
  assert.equal(result.metrics.staleOwnerRejected, true);
  assert.equal(result.evidence.owner, "monitor-telemetria");
  assert.equal(result.evidence.candidate, "gestor-flota");
  assert.equal(result.evidence.acquiredAt, 4000);
  assert.equal(result.evidence.leaseDeadline, 4120);
  assert.equal(result.evidence.expiredAt, 4120);
  assert.equal(result.evidence.fencingToken, 71);
  assert.match(result.evidence.scopeWarning, /evidence only/);
  assert.ok(result.timeline.some((entry) => entry.decision === "lock-reacquired"));
  assert.ok(result.decisions.some((decision) => decision.id === "fencing-evidence-only"));
  assert.equal(typeof result.learning.objective, "string");
  assert.ok(result.learning.checklist.length >= 4);
  assert.equal(typeof result.learning.takeaway, "string");
});

test("runDistributedLocksLab supports the four Session 26 modes", () => {
  DISTRIBUTED_LOCK_MODES.forEach((mode) => {
    assert.equal(runDistributedLocksLab({ mode }).mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--lock-acquire-and-hold"]), { mode: "lock-acquire-and-hold" });
  assert.deepEqual(parseArgs(["--lease-expiry-and-reacquire"]), { mode: "lease-expiry-and-reacquire" });
  assert.deepEqual(parseArgs(["renewal-jitter-and-risk"]), { mode: "renewal-jitter-and-risk" });
  assert.deepEqual(parseArgs(["--mode", "stale-owner-and-fencing-warning", "--json", "--timeline"]), { mode: "stale-owner-and-fencing-warning", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--stale-owner-and-fencing-warning", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "distributed-locks");
  assert.equal(payload.mode, "stale-owner-and-fencing-warning");
  assert.equal(payload.metrics.staleOwnerRejected, true);
});

test("CLI default report includes lease and fencing scope evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--lease-expiry-and-reacquire"], { encoding: "utf8" });

  assert.match(output, /Evidencia de lease/);
  assert.match(output, /Owner: monitor-telemetria/);
  assert.match(output, /Candidate: gestor-flota/);
  assert.match(output, /Lease deadline: 2120ms/);
  assert.match(output, /Fencing token: 51/);
  assert.match(output, /leader election, quorum systems and full fencing infrastructure are out of scope/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runDistributedLocksLab({ mode: "leader-election" }),
    /not supported.*lock-acquire-and-hold, lease-expiry-and-reacquire, renewal-jitter-and-risk, stale-owner-and-fencing-warning/
  );
});

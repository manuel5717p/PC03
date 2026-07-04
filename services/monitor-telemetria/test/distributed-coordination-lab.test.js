const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  DISTRIBUTED_COORDINATION_MODES,
  FAILURE_TIMEOUT_MS,
  LEASE_TTL_MS,
  createDistributedCoordinationLabResult,
  createLease,
  parseArgs,
  runDistributedCoordinationLab,
  simulateCoordinatedDispatchHandoff,
  simulateDegradedCompensation,
  simulateExpiredLeasePrevention
} = require("../src/distributed-coordination-lab");

const labPath = path.join(__dirname, "..", "src", "distributed-coordination-lab.js");

test("createLease derives deterministic lease deadlines", () => {
  assert.deepEqual(createLease("monitor-telemetria", 1000, 10), {
    resourceId: "dispatch-window:order-028",
    owner: "monitor-telemetria",
    acquiredAt: 1000,
    leaseDeadline: 1000 + LEASE_TTL_MS,
    ttlMs: LEASE_TTL_MS,
    fencingToken: 10
  });
});

test("coordinated handoff mode accepts dispatch with causal evidence and valid lease", () => {
  const result = simulateCoordinatedDispatchHandoff();

  assert.equal(result.mode, "coordinated-dispatch-handoff");
  assert.equal(result.action.accepted, true);
  assert.equal(result.finalCoordinator, "gestor-flota");
  assert.ok(result.causalEvidence.some((event) => event.dependsOn.includes("leader-dispatch-grant")));
  assert.ok(result.timeline.some((entry) => entry.decision === "handoff-accepted"));
});

test("expired lease mode prevents stale coordination even with causal evidence", () => {
  const result = simulateExpiredLeasePrevention();

  assert.equal(result.mode, "expired-lease-prevention");
  assert.equal(result.action.accepted, false);
  assert.equal(result.action.atMs > result.lease.leaseDeadline, true);
  assert.equal(result.action.reason, "lease-expired-before-action");
  assert.ok(result.timeline.some((entry) => entry.decision === "stale-action-prevented"));
});

test("degraded compensation mode records failure suspicion and compensation", () => {
  const result = simulateDegradedCompensation();

  assert.equal(result.mode, "degraded-compensation");
  assert.equal(result.suspicion.suspected, true);
  assert.equal(result.suspicion.silenceMs, 145);
  assert.equal(result.suspicion.timeoutMs, FAILURE_TIMEOUT_MS);
  assert.equal(result.compensation.action, "pause-dispatch-and-requeue-order");
  assert.equal(result.compensation.userImpact, "dispatch-delayed-not-duplicated");
});

test("structured result exposes deterministic Session 28 envelope", () => {
  const result = createDistributedCoordinationLabResult({ mode: "degraded-compensation" });

  assert.equal(result.labId, "distributed-coordination");
  assert.equal(result.session, 28);
  assert.equal(result.mode, "degraded-compensation");
  assert.equal(result.metrics.leaderSuspected, true);
  assert.equal(result.metrics.compensationApplied, true);
  assert.equal(result.metrics.duplicateDispatchPrevented, true);
  assert.equal(result.evidence.decisionModel, "time-plus-causal-evidence-plus-lease-plus-leader-plus-failure-suspicion");
  assert.match(result.evidence.boundary, /consensus, quorum, Raft\/Paxos and production failover machinery are out of scope/);
  assert.ok(result.decisions.some((decision) => decision.id === "no-consensus-claim"));
  assert.ok(result.learning.checklist.some((item) => item.includes("no implementa consenso")));
});

test("runDistributedCoordinationLab supports every Session 28 mode", () => {
  DISTRIBUTED_COORDINATION_MODES.forEach((mode) => {
    assert.equal(runDistributedCoordinationLab({ mode }).mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--coordinated-dispatch-handoff"]), { mode: "coordinated-dispatch-handoff" });
  assert.deepEqual(parseArgs(["expired-lease-prevention"]), { mode: "expired-lease-prevention" });
  assert.deepEqual(parseArgs(["--mode", "degraded-compensation", "--json", "--timeline"]), { mode: "degraded-compensation", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--expired-lease-prevention", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "distributed-coordination");
  assert.equal(payload.session, 28);
  assert.equal(payload.mode, "expired-lease-prevention");
  assert.equal(payload.metrics.actionAccepted, false);
});

test("CLI default report includes coordination boundary evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--degraded-compensation"], { encoding: "utf8" });

  assert.match(output, /Evidencia de coordinación/);
  assert.match(output, /Líder: monitor-telemetria/);
  assert.match(output, /Acción aceptada: sí/);
  assert.match(output, /consensus, quorum, Raft\/Paxos and production failover machinery are out of scope/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runDistributedCoordinationLab({ mode: "raft" }),
    /not supported.*coordinated-dispatch-handoff, expired-lease-prevention, degraded-compensation/
  );
});

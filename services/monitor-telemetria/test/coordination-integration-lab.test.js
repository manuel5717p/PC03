const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  BOUNDARY,
  COORDINATION_INTEGRATION_MODES,
  FAILURE_TIMEOUT_MS,
  LEASE_TTL_MS,
  createCoordinationIntegrationLabResult,
  createFailureSuspicion,
  createLease,
  parseArgs,
  runCoordinationIntegrationLab,
  simulateCausalConflictReview,
  simulatePc3ReadyHappyPath,
  simulateSuspectedLeaderCompensation
} = require("../src/coordination-integration-lab");

const labPath = path.join(__dirname, "..", "src", "coordination-integration-lab.js");

test("createLease derives deterministic integration lease deadlines", () => {
  assert.deepEqual(createLease("monitor-telemetria", 1000, LEASE_TTL_MS, 10), {
    resourceId: "dispatch-window:pc3-integration",
    owner: "monitor-telemetria",
    acquiredAt: 1000,
    leaseDeadline: 1000 + LEASE_TTL_MS,
    ttlMs: LEASE_TTL_MS,
    fencingToken: 10
  });
});

test("createFailureSuspicion marks leader as suspected after timeout", () => {
  const suspicion = createFailureSuspicion("gestor-flota", "monitor-telemetria", 1000, 1145, FAILURE_TIMEOUT_MS);

  assert.equal(suspicion.silenceMs, 145);
  assert.equal(suspicion.suspected, true);
  assert.equal(suspicion.reason, "leader-silent-beyond-timeout");
});

test("pc3 ready happy path accepts action with high confidence", () => {
  const result = simulatePc3ReadyHappyPath();

  assert.equal(result.mode, "pc3-ready-happy-path");
  assert.equal(result.decision, "accepted");
  assert.equal(result.confidence, "high");
  assert.equal(result.physicalTime.withinTolerance, true);
  assert.equal(result.clockSync.trusted, true);
  assert.equal(result.lamport.consistentOrder, true);
  assert.equal(result.vectorClock.conflictDetected, false);
  assert.equal(result.lease.validAtAction, true);
  assert.equal(result.leader.stable, true);
  assert.equal(result.failureSuspicion.suspected, false);
  assert.equal(result.action.accepted, true);
});

test("causal conflict review requires review with medium confidence", () => {
  const result = simulateCausalConflictReview();

  assert.equal(result.mode, "causal-conflict-review");
  assert.equal(result.decision, "requires-review");
  assert.equal(result.confidence, "medium");
  assert.equal(result.physicalTime.withinTolerance, true);
  assert.equal(result.clockSync.trusted, true);
  assert.equal(result.lamport.consistentOrder, true);
  assert.equal(result.lamport.insufficiency, true);
  assert.equal(result.vectorClock.concurrent, true);
  assert.equal(result.vectorClock.conflictDetected, true);
  assert.equal(result.lease.validAtAction, true);
  assert.equal(result.leader.stable, true);
  assert.equal(result.action.accepted, false);
});

test("suspected leader compensation rejects main action and applies compensation", () => {
  const result = simulateSuspectedLeaderCompensation();

  assert.equal(result.mode, "suspected-leader-compensation");
  assert.equal(result.decision, "compensated");
  assert.equal(result.confidence, "low");
  assert.equal(result.failureSuspicion.suspected, true);
  assert.equal(result.failureSuspicion.silenceMs > result.failureSuspicion.timeoutMs, true);
  assert.equal(result.lease.validAtAction, false);
  assert.equal(result.lease.unsafe, true);
  assert.equal(result.action.accepted, false);
  assert.equal(result.compensation.applied, true);
  assert.equal(result.compensation.action, "pause-dispatch-and-requeue-order");
});

test("structured result exposes deterministic Session 29 envelope and required evidence", () => {
  const result = createCoordinationIntegrationLabResult({ mode: "suspected-leader-compensation" });

  assert.equal(result.labId, "coordination-integration");
  assert.equal(result.session, 29);
  assert.equal(result.mode, "suspected-leader-compensation");
  assert.equal(result.title, "Sesión 29: Laboratorio integrador de sincronización y coordinación");
  assert.equal(result.evidence.decision, "compensated");
  assert.equal(result.evidence.confidence, "low");
  assert.equal(result.evidence.physicalTime.maxSkewMs, 44);
  assert.equal(result.evidence.clockSync.trusted, false);
  assert.equal(result.evidence.lamport.insufficiency, true);
  assert.equal(result.evidence.vectorClock.conflictDetected, true);
  assert.equal(result.evidence.lease.validAtAction, false);
  assert.equal(result.evidence.leader.stable, false);
  assert.equal(result.evidence.failureSuspicion.suspected, true);
  assert.equal(result.evidence.compensation.applied, true);
  assert.match(result.evidence.boundary, /does not implement consensus, quorum, Raft\/Paxos/);
  assert.equal(result.evidence.boundary, BOUNDARY);
  assert.ok(result.decisions.some((decision) => decision.id === "respect-operational-boundaries"));
  assert.ok(result.learning.checklist.some((item) => item.includes("transacciones distribuidas")));
});

test("runCoordinationIntegrationLab supports every Session 29 mode", () => {
  COORDINATION_INTEGRATION_MODES.forEach((mode) => {
    assert.equal(runCoordinationIntegrationLab({ mode }).mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--pc3-ready-happy-path"]), { mode: "pc3-ready-happy-path" });
  assert.deepEqual(parseArgs(["causal-conflict-review"]), { mode: "causal-conflict-review" });
  assert.deepEqual(parseArgs(["--mode", "suspected-leader-compensation", "--json", "--timeline"]), { mode: "suspected-leader-compensation", json: true, timeline: true });
});

test("CLI prints JSON structured Session 29 result", () => {
  const output = execFileSync(process.execPath, [labPath, "--causal-conflict-review", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "coordination-integration");
  assert.equal(payload.session, 29);
  assert.equal(payload.mode, "causal-conflict-review");
  assert.equal(payload.evidence.decision, "requires-review");
  assert.equal(payload.metrics.vectorConflictDetected, true);
});

test("CLI default report includes integration boundary evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--suspected-leader-compensation"], { encoding: "utf8" });

  assert.match(output, /Evidencia integradora/);
  assert.match(output, /Decisión: compensated/);
  assert.match(output, /Confianza: low/);
  assert.match(output, /Lease vigente: no/);
  assert.match(output, /Líder sospechado: sí/);
  assert.match(output, /does not implement consensus, quorum, Raft\/Paxos/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runCoordinationIntegrationLab({ mode: "raft" }),
    /not supported.*pc3-ready-happy-path, causal-conflict-review, suspected-leader-compensation/
  );
});

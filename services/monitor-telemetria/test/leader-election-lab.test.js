const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  FAILURE_TIMEOUT_MS,
  LEADER_ELECTION_MODES,
  createHeartbeat,
  createLeaderElectionLabResult,
  createSuspicion,
  parseArgs,
  runLeaderElectionLab,
  selectLeader,
  simulateFalseSuspicionTimeout,
  simulateLeaderFailureAndReelection,
  simulateLeaderRecoveryRejoin,
  simulateStableLeaderHeartbeats
} = require("../src/leader-election-lab");

const labPath = path.join(__dirname, "..", "src", "leader-election-lab.js");

test("selectLeader chooses the highest-priority healthy node deterministically", () => {
  const candidates = [
    { nodeId: "b", priority: 2 },
    { nodeId: "a", priority: 2 },
    { nodeId: "c", priority: 1 }
  ];

  assert.deepEqual(selectLeader(candidates), { nodeId: "a", priority: 2 });
  assert.deepEqual(selectLeader(candidates, ["a", "b"]), { nodeId: "c", priority: 1 });
});

test("createHeartbeat and createSuspicion derive deterministic detector evidence", () => {
  assert.deepEqual(createHeartbeat("leader", "follower", 10, 23), { from: "leader", to: "follower", sentAt: 10, receivedAt: 23, delayMs: 13 });

  const suspicion = createSuspicion({ observer: "follower", subject: "leader", lastHeartbeatAt: 100, checkedAt: 225, reason: "test" });
  assert.equal(suspicion.timestampBasis, "observer-received-at");
  assert.equal(suspicion.silenceMs, 125);
  assert.equal(suspicion.timeoutMs, FAILURE_TIMEOUT_MS);
  assert.equal(suspicion.suspected, true);
});

test("createSuspicion uses observer-received heartbeat time at timeout boundaries", () => {
  const heartbeat = createHeartbeat("leader", "follower", 2000, 2007);

  const justBelowTimeout = createSuspicion({ observer: "follower", subject: "leader", lastHeartbeatAt: heartbeat.receivedAt, checkedAt: 2126, reason: "boundary-test" });
  const exactlyAtTimeout = createSuspicion({ observer: "follower", subject: "leader", lastHeartbeatAt: heartbeat.receivedAt, checkedAt: 2127, reason: "boundary-test" });
  const aboveTimeout = createSuspicion({ observer: "follower", subject: "leader", lastHeartbeatAt: heartbeat.receivedAt, checkedAt: 2128, reason: "boundary-test" });

  assert.equal(justBelowTimeout.silenceMs, FAILURE_TIMEOUT_MS - 1);
  assert.equal(justBelowTimeout.suspected, false);
  assert.equal(exactlyAtTimeout.silenceMs, FAILURE_TIMEOUT_MS);
  assert.equal(exactlyAtTimeout.suspected, true);
  assert.equal(aboveTimeout.silenceMs, FAILURE_TIMEOUT_MS + 1);
  assert.equal(aboveTimeout.suspected, true);
});

test("stable leader mode keeps the same leader without suspicions", () => {
  const result = simulateStableLeaderHeartbeats();

  assert.equal(result.mode, "stable-leader-heartbeats");
  assert.equal(result.initialLeader, "monitor-telemetria");
  assert.equal(result.finalLeader, result.initialLeader);
  assert.equal(result.suspicions.length, 0);
  assert.ok(result.timeline.some((entry) => entry.decision === "leader-stable"));
});

test("leader failure mode excludes the suspected leader and reelects a coordinator", () => {
  const result = simulateLeaderFailureAndReelection();

  assert.equal(result.mode, "leader-failure-and-reelection");
  assert.equal(result.initialLeader, "monitor-telemetria");
  assert.equal(result.finalLeader, "gestor-flota");
  assert.equal(result.suspicions[0].suspected, true);
  assert.equal(result.suspicions[0].confirmed, true);
  assert.equal(result.suspicions[0].lastHeartbeatAt, result.heartbeats[0].receivedAt);
  assert.equal(result.suspicions[0].silenceMs, FAILURE_TIMEOUT_MS);
  assert.ok(result.timeline.some((entry) => entry.decision === "leader-reelected"));
});

test("false suspicion mode records a timeout false positive", () => {
  const result = simulateFalseSuspicionTimeout();

  assert.equal(result.mode, "false-suspicion-timeout");
  assert.equal(result.suspicions[0].suspected, true);
  assert.equal(result.suspicions[0].confirmed, false);
  assert.equal(result.finalLeader, result.initialLeader);
  assert.ok(result.timeline.some((entry) => entry.decision === "suspicion-cleared"));
});

test("recovery mode rejoins the original leader as follower", () => {
  const result = simulateLeaderRecoveryRejoin();

  assert.equal(result.mode, "leader-recovery-rejoin");
  assert.equal(result.recoveredNode.nodeId, "monitor-telemetria");
  assert.equal(result.recoveredNode.roleAfterRecovery, "follower");
  assert.equal(result.finalLeader, "gestor-flota");
});

test("recovery mode uses received heartbeat evidence for suspicion and failover", () => {
  const raw = simulateLeaderRecoveryRejoin();
  const result = createLeaderElectionLabResult({ mode: "leader-recovery-rejoin" });
  const suspicion = raw.suspicions[0];
  const receivedHeartbeat = raw.heartbeats.find((heartbeat) => heartbeat.from === raw.initialLeader && heartbeat.to === suspicion.observer);
  const reelection = raw.elections.find((election) => election.round === 2);

  assert.ok(receivedHeartbeat);
  assert.equal(suspicion.timestampBasis, "observer-received-at");
  assert.equal(suspicion.lastHeartbeatAt, receivedHeartbeat.receivedAt);
  assert.equal(suspicion.silenceMs, 125);
  assert.equal(result.metrics.failoverMs, reelection.startedAt - receivedHeartbeat.receivedAt);
  assert.equal(result.metrics.failoverMs, 130);
});

test("structured result exposes summary, observations, decisions, metrics, evidence, timeline and learning", () => {
  const result = createLeaderElectionLabResult({ mode: "leader-failure-and-reelection" });

  assert.equal(result.labId, "leader-election");
  assert.equal(result.session, 27);
  assert.equal(result.metrics.leaderChanges, 1);
  assert.equal(result.metrics.confirmedSuspicions, 1);
  assert.equal(result.evidence.initialLeader, "monitor-telemetria");
  assert.equal(result.evidence.finalLeader, "gestor-flota");
  assert.equal(result.evidence.detectorType, "heartbeat-timeout-simulated");
  assert.match(result.evidence.scopeWarning, /consensus, quorum/);
  assert.ok(result.decisions.some((decision) => decision.id === "detector-imperfect"));
  assert.equal(typeof result.learning.objective, "string");
  assert.ok(result.learning.checklist.length >= 4);
});

test("runLeaderElectionLab supports the four Session 27 modes", () => {
  LEADER_ELECTION_MODES.forEach((mode) => {
    assert.equal(runLeaderElectionLab({ mode }).mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--stable-leader-heartbeats"]), { mode: "stable-leader-heartbeats" });
  assert.deepEqual(parseArgs(["--leader-failure-and-reelection"]), { mode: "leader-failure-and-reelection" });
  assert.deepEqual(parseArgs(["false-suspicion-timeout"]), { mode: "false-suspicion-timeout" });
  assert.deepEqual(parseArgs(["--mode", "leader-recovery-rejoin", "--json", "--timeline"]), { mode: "leader-recovery-rejoin", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--leader-failure-and-reelection", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "leader-election");
  assert.equal(payload.mode, "leader-failure-and-reelection");
  assert.equal(payload.metrics.leaderChanges, 1);
});

test("CLI default report includes leader and detector scope evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--leader-failure-and-reelection"], { encoding: "utf8" });

  assert.match(output, /Evidencia de liderazgo/);
  assert.match(output, /Líder inicial: monitor-telemetria/);
  assert.match(output, /Líder final: gestor-flota/);
  assert.match(output, /Detector: heartbeat-timeout-simulated/);
  assert.match(output, /consensus, quorum, production membership, failover and fencing\/lock redesign are out of scope/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runLeaderElectionLab({ mode: "raft" }),
    /not supported.*stable-leader-heartbeats, leader-failure-and-reelection, false-suspicion-timeout, leader-recovery-rejoin/
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createServer } = require("../src/server");

const expectedClockSyncModeIds = [
  "normal",
  "asymmetric-delay",
  "correction-policy",
  "stale-sync",
  "telemetry-impact",
  "scenario-analysis"
];
const expectedPhysicalTimeModeIds = ["normal", "skew", "drift", "tolerance"];
const expectedLamportModeIds = ["causal-chain", "concurrent-events", "merge-and-tie-break"];
const expectedVectorClockModeIds = ["causal-chain", "concurrent-events", "merge-and-conflict"];
const expectedMutualExclusionModeIds = ["contended-queue", "fairness-rounds", "critical-section-safety", "delay-and-reorder"];
const expectedDistributedLocksModeIds = ["lock-acquire-and-hold", "lease-expiry-and-reacquire", "renewal-jitter-and-risk", "stale-owner-and-fencing-warning"];
const expectedLeaderElectionModeIds = ["stable-leader-heartbeats", "leader-failure-and-reelection", "false-suspicion-timeout", "leader-recovery-rejoin"];
const expectedDistributedCoordinationModeIds = ["coordinated-dispatch-handoff", "expired-lease-prevention", "degraded-compensation"];
const expectedCoordinationIntegrationModeIds = ["pc3-ready-happy-path", "causal-conflict-review", "suspected-leader-compensation"];

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function requestRawPath(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({ statusCode: response.statusCode, body });
      });
    });

    request.on("error", reject);
    request.end();
  });
}

test("static server serves public files", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    const indexResponse = await fetch(`http://127.0.0.1:${port}/index.html`);
    const appResponse = await fetch(`http://127.0.0.1:${port}/app.js`);

    assert.equal(rootResponse.status, 200);
    assert.match(await rootResponse.text(), /AURA/);
    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /AURA/);
    assert.equal(appResponse.status, 200);
    assert.match(await appResponse.text(), /loadModes/);
  } finally {
    await close(server);
  }
});

test("health endpoint reports service readiness", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: "ok", service: "observability-platform" });
  } finally {
    await close(server);
  }
});

test("labs endpoint lists Session 21 through Session 29 labs", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.labs.map((lab) => lab.id), ["physical-time", "clock-sync", "lamport-ordering", "vector-clocks", "mutual-exclusion", "distributed-locks", "leader-election", "distributed-coordination", "coordination-integration"]);
    assert.equal(payload.labs.find((lab) => lab.id === "physical-time").session, 21);
    assert.equal(payload.labs.find((lab) => lab.id === "clock-sync").session, 22);
    assert.equal(payload.labs.find((lab) => lab.id === "lamport-ordering").session, 23);
    assert.equal(payload.labs.find((lab) => lab.id === "vector-clocks").session, 24);
    assert.equal(payload.labs.find((lab) => lab.id === "mutual-exclusion").session, 25);
    assert.equal(payload.labs.find((lab) => lab.id === "distributed-locks").session, 26);
    assert.equal(payload.labs.find((lab) => lab.id === "leader-election").session, 27);
    assert.equal(payload.labs.find((lab) => lab.id === "distributed-coordination").session, 28);
    assert.equal(payload.labs.find((lab) => lab.id === "coordination-integration").session, 29);
  } finally {
    await close(server);
  }
});

test("static server rejects traversal and path-prefix escapes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const traversal = await requestRawPath(port, "/../package.json");
    const prefixEscape = await requestRawPath(port, "/../public-malicious/index.html");

    assert.equal(traversal.statusCode, 403);
    assert.deepEqual(JSON.parse(traversal.body), { error: "Forbidden" });
    assert.equal(prefixEscape.statusCode, 403);
    assert.deepEqual(JSON.parse(prefixEscape.body), { error: "Forbidden" });
  } finally {
    await close(server);
  }
});

test("clock sync modes endpoint returns every supported mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedClockSyncModeIds);
  } finally {
    await close(server);
  }
});

test("physical time modes endpoint returns every Session 21 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/physical-time/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedPhysicalTimeModeIds);
  } finally {
    await close(server);
  }
});

test("lamport ordering modes endpoint returns every Session 23 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/lamport-ordering/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedLamportModeIds);
  } finally {
    await close(server);
  }
});

test("vector clocks modes endpoint returns every Session 24 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/vector-clocks/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedVectorClockModeIds);
  } finally {
    await close(server);
  }
});

test("mutual exclusion modes endpoint returns every Session 25 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/mutual-exclusion/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedMutualExclusionModeIds);
  } finally {
    await close(server);
  }
});

test("distributed locks modes endpoint returns every Session 26 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-locks/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedDistributedLocksModeIds);
  } finally {
    await close(server);
  }
});

test("leader election modes endpoint returns every Session 27 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/leader-election/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedLeaderElectionModeIds);
  } finally {
    await close(server);
  }
});

test("distributed coordination modes endpoint returns every Session 28 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-coordination/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedDistributedCoordinationModeIds);
  } finally {
    await close(server);
  }
});

test("coordination integration modes endpoint returns every Session 29 mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/coordination-integration/modes`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.modes.map((mode) => mode.id), expectedCoordinationIntegrationModeIds);
  } finally {
    await close(server);
  }
});

test("physical time run endpoint executes drift mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/physical-time/run?mode=drift`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "physical-time");
    assert.equal(payload.session, 21);
    assert.equal(payload.mode, "drift");
    assert.equal(payload.raw.mode, "drift");
    assert.equal(payload.metrics.finalClockSkewMs, 65);
  } finally {
    await close(server);
  }
});

test("generic lab run endpoint uses each lab default mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const physicalResponse = await fetch(`http://127.0.0.1:${port}/api/labs/physical-time/run`);
    const physicalPayload = await physicalResponse.json();
    const clockResponse = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run`);
    const clockPayload = await clockResponse.json();
    const lamportResponse = await fetch(`http://127.0.0.1:${port}/api/labs/lamport-ordering/run`);
    const lamportPayload = await lamportResponse.json();
    const vectorResponse = await fetch(`http://127.0.0.1:${port}/api/labs/vector-clocks/run`);
    const vectorPayload = await vectorResponse.json();
    const mutualResponse = await fetch(`http://127.0.0.1:${port}/api/labs/mutual-exclusion/run`);
    const mutualPayload = await mutualResponse.json();
    const locksResponse = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-locks/run`);
    const locksPayload = await locksResponse.json();
    const leaderResponse = await fetch(`http://127.0.0.1:${port}/api/labs/leader-election/run`);
    const leaderPayload = await leaderResponse.json();
    const coordinationResponse = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-coordination/run`);
    const coordinationPayload = await coordinationResponse.json();
    const integrationResponse = await fetch(`http://127.0.0.1:${port}/api/labs/coordination-integration/run`);
    const integrationPayload = await integrationResponse.json();

    assert.equal(physicalResponse.status, 200);
    assert.equal(physicalPayload.mode, "normal");
    assert.equal(clockResponse.status, 200);
    assert.equal(clockPayload.mode, "scenario-analysis");
    assert.equal(lamportResponse.status, 200);
    assert.equal(lamportPayload.mode, "causal-chain");
    assert.equal(vectorResponse.status, 200);
    assert.equal(vectorPayload.mode, "causal-chain");
    assert.equal(mutualResponse.status, 200);
    assert.equal(mutualPayload.mode, "contended-queue");
    assert.equal(locksResponse.status, 200);
    assert.equal(locksPayload.mode, "lock-acquire-and-hold");
    assert.equal(leaderResponse.status, 200);
    assert.equal(leaderPayload.mode, "stable-leader-heartbeats");
    assert.equal(coordinationResponse.status, 200);
    assert.equal(coordinationPayload.mode, "coordinated-dispatch-handoff");
    assert.equal(integrationResponse.status, 200);
    assert.equal(integrationPayload.mode, "pc3-ready-happy-path");
  } finally {
    await close(server);
  }
});

test("distributed locks run endpoint executes stale owner and fencing warning mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-locks/run?mode=stale-owner-and-fencing-warning`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "distributed-locks");
    assert.equal(payload.session, 26);
    assert.equal(payload.mode, "stale-owner-and-fencing-warning");
    assert.equal(payload.metrics.staleOwnerRejected, true);
    assert.match(payload.evidence.scopeWarning, /out of scope/);
  } finally {
    await close(server);
  }
});

test("distributed locks run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-locks/run?mode=leader-election`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("leader election run endpoint executes failure and reelection mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/leader-election/run?mode=leader-failure-and-reelection`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "leader-election");
    assert.equal(payload.session, 27);
    assert.equal(payload.mode, "leader-failure-and-reelection");
    assert.equal(payload.metrics.leaderChanges, 1);
    assert.match(payload.evidence.scopeWarning, /out of scope/);
  } finally {
    await close(server);
  }
});

test("leader election run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/leader-election/run?mode=raft`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("distributed coordination run endpoint executes degraded compensation mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-coordination/run?mode=degraded-compensation`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "distributed-coordination");
    assert.equal(payload.session, 28);
    assert.equal(payload.mode, "degraded-compensation");
    assert.equal(payload.metrics.leaderSuspected, true);
    assert.equal(payload.metrics.compensationApplied, true);
    assert.match(payload.evidence.boundary, /out of scope/);
  } finally {
    await close(server);
  }
});

test("distributed coordination run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/distributed-coordination/run?mode=raft`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("coordination integration run endpoint executes suspected leader compensation mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/coordination-integration/run?mode=suspected-leader-compensation`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "coordination-integration");
    assert.equal(payload.session, 29);
    assert.equal(payload.mode, "suspected-leader-compensation");
    assert.equal(payload.evidence.decision, "compensated");
    assert.equal(payload.metrics.leaderSuspected, true);
    assert.equal(payload.metrics.compensationApplied, true);
    assert.match(payload.evidence.boundary, /does not implement consensus, quorum/);
  } finally {
    await close(server);
  }
});

test("coordination integration run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/coordination-integration/run?mode=raft`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("mutual exclusion run endpoint executes delay and reorder mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/mutual-exclusion/run?mode=delay-and-reorder`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "mutual-exclusion");
    assert.equal(payload.session, 25);
    assert.equal(payload.mode, "delay-and-reorder");
    assert.equal(payload.evidence.safetyHolds, true);
    assert.equal(typeof payload.learning.objective, "string");
  } finally {
    await close(server);
  }
});

test("mutual exclusion run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/mutual-exclusion/run?mode=invalid`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("vector clocks run endpoint executes merge and conflict mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/vector-clocks/run?mode=merge-and-conflict`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "vector-clocks");
    assert.equal(payload.session, 24);
    assert.equal(payload.mode, "merge-and-conflict");
    assert.equal(payload.metrics.conflictDetected, true);
    assert.equal(typeof payload.learning.objective, "string");
  } finally {
    await close(server);
  }
});

test("vector clocks run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/vector-clocks/run?mode=invalid`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

test("lamport ordering run endpoint executes concurrent events mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/lamport-ordering/run?mode=concurrent-events`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.labId, "lamport-ordering");
    assert.equal(payload.session, 23);
    assert.equal(payload.mode, "concurrent-events");
    assert.equal(payload.metrics.concurrentPairs, 3);
    assert.equal(typeof payload.learning.objective, "string");
  } finally {
    await close(server);
  }
});

test("clock sync run endpoint executes asymmetric delay mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run?mode=asymmetric-delay`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.mode, "asymmetric-delay");
    assert.equal(payload.raw.mode, "asymmetric-delay");
  } finally {
    await close(server);
  }
});

test("clock sync run endpoint includes learning for normal mode", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run?mode=normal`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.mode, "normal");
    assert.equal(typeof payload.learning.objective, "string");
    assert.ok(payload.learning.keyMetrics.length > 0);
    assert.ok(Array.isArray(payload.learning.checklist));
    assert.ok(payload.learning.checklist.length >= 2);
    assert.equal(typeof payload.learning.takeaway, "string");
  } finally {
    await close(server);
  }
});

test("clock sync run endpoint includes learning for non-scenario and scenario modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const staleResponse = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run?mode=stale-sync`);
    const stalePayload = await staleResponse.json();
    const scenarioResponse = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run?mode=scenario-analysis`);
    const scenarioPayload = await scenarioResponse.json();

    assert.equal(staleResponse.status, 200);
    assert.equal(stalePayload.mode, "stale-sync");
    assert.equal(typeof stalePayload.learning.objective, "string");
    assert.ok(stalePayload.learning.keyMetrics.length > 0);
    assert.ok(Array.isArray(stalePayload.learning.checklist));
    assert.ok(stalePayload.learning.checklist.length >= 2);
    assert.equal(scenarioResponse.status, 200);
    assert.equal(scenarioPayload.mode, "scenario-analysis");
    assert.equal(typeof scenarioPayload.learning.objective, "string");
    assert.ok(scenarioPayload.learning.keyMetrics.length > 0);
    assert.ok(Array.isArray(scenarioPayload.learning.checklist));
    assert.ok(scenarioPayload.learning.checklist.length >= 2);
  } finally {
    await close(server);
  }
});

test("clock sync run endpoint rejects invalid modes", async () => {
  const server = createServer();
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/labs/clock-sync/run?mode=invalid-mode`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /not available/);
  } finally {
    await close(server);
  }
});

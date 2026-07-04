const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  compareRequests,
  createLifecycle,
  createMutualExclusionLabResult,
  createRequest,
  findSafetyViolations,
  parseArgs,
  runMutualExclusionLab,
  scheduleCriticalSection,
  simulateContendedQueue,
  simulateCriticalSectionSafety,
  simulateDelayAndReorder,
  simulateFairnessRounds,
  sortQueue
} = require("../src/mutual-exclusion-lab");

const labPath = path.join(__dirname, "..", "src", "mutual-exclusion-lab.js");

test("compareRequests orders by logical timestamp and nodeId", () => {
  const requests = [createRequest("monitor-telemetria", 5), createRequest("gestor-flota", 4), createRequest("centro-logistica", 4)];

  assert.equal(compareRequests(requests[1], requests[2]) > 0, true);
  assert.deepEqual(sortQueue(requests).map((request) => request.nodeId), ["centro-logistica", "gestor-flota", "monitor-telemetria"]);
});

test("contended queue uses stable ordering for concurrent requests", () => {
  const result = simulateContendedQueue();

  assert.equal(result.mode, "contended-queue");
  assert.deepEqual(result.queue.map((request) => request.nodeId), ["centro-logistica", "gestor-flota", "monitor-telemetria"]);
  assert.deepEqual(result.safetyViolations, []);
});

test("fairness rounds include repeated access without permanent priority", () => {
  const result = simulateFairnessRounds();

  assert.equal(result.mode, "fairness-rounds");
  assert.equal(result.entries.length, 6);
  assert.deepEqual([...new Set(result.entries.map((entry) => entry.nodeId))].sort(), ["centro-logistica", "gestor-flota", "monitor-telemetria"]);
  assert.equal(result.maxTurnsWithoutEntry, 2);
});

test("critical section safety detects overlapping entries", () => {
  const safe = simulateCriticalSectionSafety();
  const unsafe = [
    { requestId: "a", nodeId: "a", resourceId: "aura-dispatch-window", enterAtTick: 1, exitAtTick: 4 },
    { requestId: "b", nodeId: "b", resourceId: "aura-dispatch-window", enterAtTick: 3, exitAtTick: 5 }
  ];

  assert.deepEqual(safe.safetyViolations, []);
  assert.deepEqual(findSafetyViolations(unsafe), [{ left: "a", right: "b", resourceId: "aura-dispatch-window" }]);
});

test("delay and reorder keeps safety and timestamp queue order", () => {
  const result = simulateDelayAndReorder();

  assert.equal(result.mode, "delay-and-reorder");
  assert.equal(result.deliveries.filter((delivery) => delivery.reordered).length, 4);
  assert.deepEqual(result.queue.map((request) => request.nodeId), ["centro-logistica", "gestor-flota", "monitor-telemetria"]);
  assert.deepEqual(result.safetyViolations, []);
});

test("scheduleCriticalSection serializes windows", () => {
  const entries = scheduleCriticalSection([createRequest("b", 2), createRequest("a", 1)], { startTick: 1, durationTicks: 2, gapTicks: 0 });

  assert.deepEqual(entries.map((entry) => entry.nodeId), ["a", "b"]);
  assert.equal(entries[0].exitAtTick, entries[1].enterAtTick);
  assert.deepEqual(findSafetyViolations(entries), []);
});

test("lifecycle exposes request, wait, grant, enter and release stages", () => {
  const requests = [createRequest("monitor-telemetria", 7), createRequest("centro-logistica", 5), createRequest("gestor-flota", 5)];
  const entries = scheduleCriticalSection(requests, { startTick: 10, durationTicks: 2, gapTicks: 1 });
  const lifecycle = createLifecycle(requests, entries);

  assert.deepEqual(lifecycle.map((event) => event.stage).slice(0, 5), ["request", "wait/queued", "grant", "enter-critical-section", "release/exit"]);
  assert.equal(lifecycle.filter((event) => event.decision === "grant").length, 3);
  assert.equal(lifecycle.filter((event) => event.decision === "release").length, 3);
  assert.deepEqual(lifecycle.filter((event) => event.decision === "wait-queued").map((event) => event.nodeId), ["gestor-flota", "monitor-telemetria"]);
  assert.equal(lifecycle.find((event) => event.decision === "grant").grantedBy, "arbitraje-deterministico-simplificado");
});

test("grant precedes enter and release precedes the next grant", () => {
  const result = simulateCriticalSectionSafety();
  const lifecycle = createLifecycle(result.requests, result.entries);

  result.entries.forEach((entry, index) => {
    const grant = lifecycle.find((event) => event.requestId === entry.requestId && event.decision === "grant");
    const enter = lifecycle.find((event) => event.requestId === entry.requestId && event.decision === "enter-critical-section");
    const release = lifecycle.find((event) => event.requestId === entry.requestId && event.decision === "release");

    assert.equal(grant.time, `tick=${entry.enterAtTick}`);
    assert.equal(enter.time, `tick=${entry.enterAtTick}`);
    assert.equal(release.time, `tick=${entry.exitAtTick}`);

    const nextEntry = result.entries[index + 1];
    if (nextEntry) {
      assert.equal(entry.exitAtTick <= nextEntry.enterAtTick, true);
    }
  });
  assert.deepEqual(findSafetyViolations(result.entries), []);
});

test("structured result exposes summary, evidence, decisions, metrics, timeline and learning", () => {
  const result = createMutualExclusionLabResult({ mode: "critical-section-safety" });

  assert.equal(result.labId, "mutual-exclusion");
  assert.equal(result.session, 25);
  assert.equal(result.metrics.safetyViolations, 0);
  assert.equal(result.evidence.safetyHolds, true);
  assert.equal(result.evidence.orderingRule, "logicalTimestamp asc, then nodeId asc");
  assert.equal(result.evidence.lifecycleModel, "request -> wait/queued -> grant -> enter-critical-section -> release/exit");
  assert.equal(result.evidence.grantAuthority, "arbitraje-deterministico-simplificado");
  assert.equal(result.evidence.lifecycleAnswers.whoGrants, "arbitraje-deterministico-simplificado");
  assert.ok(result.evidence.lifecycleAnswers.whenEnter.length > 0);
  assert.ok(result.evidence.lifecycleAnswers.releaseEnables.length > 0);
  assert.match(result.evidence.lifecycleAnswers.whySafetyHolds, /grant/);
  assert.ok(result.timeline.some((entry) => entry.decision === "grant"));
  assert.ok(result.timeline.some((entry) => entry.decision === "release"));
  assert.ok(result.timeline.some((entry) => entry.decision === "wait-queued"));
  assert.ok(result.timeline.some((entry) => entry.decision === "enter-critical-section"));
  assert.equal(typeof result.learning.objective, "string");
  assert.ok(result.learning.checklist.length >= 4);
  assert.equal(typeof result.learning.takeaway, "string");
});

test("runMutualExclusionLab supports the four Session 25 modes", () => {
  ["contended-queue", "fairness-rounds", "critical-section-safety", "delay-and-reorder"].forEach((mode) => {
    assert.equal(runMutualExclusionLab({ mode }).mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--contended-queue"]), { mode: "contended-queue" });
  assert.deepEqual(parseArgs(["--fairness-rounds"]), { mode: "fairness-rounds" });
  assert.deepEqual(parseArgs(["critical-section-safety"]), { mode: "critical-section-safety" });
  assert.deepEqual(parseArgs(["--mode", "delay-and-reorder", "--json", "--timeline"]), { mode: "delay-and-reorder", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--delay-and-reorder", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "mutual-exclusion");
  assert.equal(payload.mode, "delay-and-reorder");
  assert.equal(payload.metrics.reorderedDeliveries, 4);
});

test("CLI default report includes queue and safety evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--contended-queue"], { encoding: "utf8" });

  assert.match(output, /Evidencia de sección crítica/);
  assert.match(output, /Regla de orden: logicalTimestamp asc, then nodeId asc/);
  assert.match(output, /Ciclo: request -> wait\/queued -> grant -> enter-critical-section -> release\/exit/);
  assert.match(output, /Concede: arbitraje-deterministico-simplificado/);
  assert.match(output, /Safety holds: sí/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runMutualExclusionLab({ mode: "lease" }),
    /not supported.*contended-queue, fairness-rounds, critical-section-safety, delay-and-reorder/
  );
});

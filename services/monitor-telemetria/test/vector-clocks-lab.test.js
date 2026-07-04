const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  compareVectors,
  createVectorClocksLabResult,
  createVectorNode,
  localEvent,
  mergeVectors,
  parseArgs,
  receiveEvent,
  runVectorClocksLab,
  sendEvent,
  simulateCausalChain,
  simulateConcurrentEvents,
  simulateMergeAndConflict
} = require("../src/vector-clocks-lab");

const labPath = path.join(__dirname, "..", "src", "vector-clocks-lab.js");

test("compareVectors returns equal, before, after and concurrent", () => {
  assert.equal(compareVectors({ a: 1, b: 0 }, { a: 1, b: 0 }), "equal");
  assert.equal(compareVectors({ a: 1, b: 0 }, { a: 1, b: 1 }), "before");
  assert.equal(compareVectors({ a: 2, b: 1 }, { a: 1, b: 1 }), "after");
  assert.equal(compareVectors({ a: 2, b: 0 }, { a: 1, b: 1 }), "concurrent");
});

test("send and receive merge vectors component-wise before incrementing local component", () => {
  const sender = createVectorNode("centro-logistica");
  const receiver = createVectorNode("gestor-flota");
  const local = localEvent(receiver, "Fleet local preparation");
  const message = sendEvent(sender, "Mission requested");
  const received = receiveEvent(receiver, message, "Mission accepted");

  assert.equal(local.vector["gestor-flota"], 1);
  assert.deepEqual(message.messageVector, { "centro-logistica": 1, "gestor-flota": 0, "monitor-telemetria": 0 });
  assert.deepEqual(received.vector, { "centro-logistica": 1, "gestor-flota": 2, "monitor-telemetria": 0 });
  assert.equal(compareVectors(message.vector, received.vector), "before");
});

test("mergeVectors keeps the maximum value for every known component", () => {
  assert.deepEqual(mergeVectors({ a: 2, b: 0 }, { a: 1, b: 3, c: 1 }), { a: 2, b: 3, c: 1 });
});

test("causal chain exposes happened-before comparisons as before", () => {
  const result = simulateCausalChain();

  assert.equal(result.mode, "causal-chain");
  assert.equal(result.comparisons.length, 3);
  assert.ok(result.comparisons.every((comparison) => comparison.relation === "before"));
  assert.deepEqual(result.events.at(-1).vector, { "centro-logistica": 2, "gestor-flota": 2, "monitor-telemetria": 1 });
});

test("concurrent events are detected as incomparable vector pairs", () => {
  const result = simulateConcurrentEvents();

  assert.equal(result.mode, "concurrent-events");
  assert.equal(result.concurrentPairs.length, 3);
  assert.ok(result.concurrentPairs.every((pair) => pair.relation === "concurrent"));
});

test("merge and conflict detects concurrent updates then exposes causal visibility after merge", () => {
  const result = simulateMergeAndConflict();

  assert.equal(result.mode, "merge-and-conflict");
  assert.equal(result.conflict.relation, "concurrent");
  assert.equal(result.conflict.requiresResolution, true);
  assert.deepEqual(result.conflict.leftVector, { "centro-logistica": 1, "gestor-flota": 0, "monitor-telemetria": 0 });
  assert.deepEqual(result.conflict.rightVector, { "centro-logistica": 0, "gestor-flota": 1, "monitor-telemetria": 0 });
  assert.deepEqual(result.mergedVector, { "centro-logistica": 1, "gestor-flota": 1, "monitor-telemetria": 0 });
  assert.equal(result.visibility.policyVisible, true);
  assert.equal(result.visibility.capacityVisible, true);
  assert.deepEqual(result.visibility.visibleAfterMerge, ["centro-logistica-01", "gestor-flota-01"]);
});

test("structured result exposes summary, observations, decisions, metrics, timeline and learning", () => {
  const result = createVectorClocksLabResult({ mode: "merge-and-conflict" });

  assert.equal(result.labId, "vector-clocks");
  assert.equal(result.session, 24);
  assert.equal(result.mode, "merge-and-conflict");
  assert.equal(typeof result.summary, "string");
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.decisions));
  assert.equal(result.metrics.conflictDetected, true);
  assert.deepEqual(result.evidence.comparedVectors.left, {
    eventId: "centro-logistica-01",
    vector: { "centro-logistica": 1, "gestor-flota": 0, "monitor-telemetria": 0 }
  });
  assert.equal(result.evidence.relationPair, "centro-logistica-01 concurrent gestor-flota-01");
  assert.equal(result.evidence.concurrentRelation, true);
  assert.match(result.evidence.conflictReason, /sin haber visto/);
  assert.deepEqual(result.evidence.mergeVisibility.visibleEvents, ["centro-logistica-01", "gestor-flota-01"]);
  assert.equal(result.timeline.length, result.raw.events.length);
  assert.equal(typeof result.learning.objective, "string");
  assert.ok(result.learning.checklist.length >= 2);
  assert.equal(typeof result.learning.takeaway, "string");
});

test("runVectorClocksLab supports the three Session 24 modes", () => {
  ["causal-chain", "concurrent-events", "merge-and-conflict"].forEach((mode) => {
    const result = runVectorClocksLab({ mode });

    assert.equal(result.mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--causal-chain"]), { mode: "causal-chain" });
  assert.deepEqual(parseArgs(["--concurrent-events"]), { mode: "concurrent-events" });
  assert.deepEqual(parseArgs(["--merge-and-conflict"]), { mode: "merge-and-conflict" });
  assert.deepEqual(parseArgs(["concurrent-events"]), { mode: "concurrent-events" });
  assert.deepEqual(parseArgs(["--mode", "merge-and-conflict"]), { mode: "merge-and-conflict" });
  assert.deepEqual(parseArgs(["--mode=causal-chain", "--json", "--timeline"]), { mode: "causal-chain", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--concurrent-events", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "vector-clocks");
  assert.equal(payload.mode, "concurrent-events");
  assert.equal(payload.metrics.concurrentPairs, 3);
});

test("CLI default merge and conflict report includes concrete vector evidence", () => {
  const output = execFileSync(process.execPath, [labPath, "--merge-and-conflict"], { encoding: "utf8" });

  assert.match(output, /Evidencia causal/);
  assert.match(output, /Vectores comparados: centro-logistica-01=\{"centro-logistica":1,"gestor-flota":0,"monitor-telemetria":0\} vs gestor-flota-01=\{"centro-logistica":0,"gestor-flota":1,"monitor-telemetria":0\}/);
  assert.match(output, /Relación del par: centro-logistica-01 concurrent gestor-flota-01/);
  assert.match(output, /Motivo del conflicto: Las dos ramas modifican criterios operativos relacionados/);
  assert.match(output, /Merge visible: centro-logistica-01, gestor-flota-01 con vector \{"centro-logistica":1,"gestor-flota":1,"monitor-telemetria":0\}/);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runVectorClocksLab({ mode: "mutex" }),
    /not supported.*causal-chain, concurrent-events, merge-and-conflict/
  );
});

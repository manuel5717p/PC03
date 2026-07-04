const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  compareLamportEvents,
  createLamportNode,
  createLamportOrderingLabResult,
  localEvent,
  parseArgs,
  receiveEvent,
  runLamportOrderingLab,
  sendEvent,
  simulateCausalChain,
  simulateConcurrentEvents,
  simulateMergeAndTieBreak
} = require("../src/lamport-ordering-lab");

const labPath = path.join(__dirname, "..", "src", "lamport-ordering-lab.js");

test("send and receive events increment Lamport counters with max(local, message) + 1", () => {
  const sender = createLamportNode("sender", 2);
  const receiver = createLamportNode("receiver", 5);
  const message = sendEvent(sender, "send command");
  const received = receiveEvent(receiver, message, "receive command");

  assert.equal(message.lamport, 3);
  assert.equal(received.lamport, 6);
  assert.deepEqual(received.happenedBefore, [message.id]);
});

test("local events increment only the local node counter", () => {
  const node = createLamportNode("monitor-telemetria");
  const first = localEvent(node, "first");
  const second = localEvent(node, "second");

  assert.equal(first.lamport, 1);
  assert.equal(second.lamport, 2);
  assert.equal(node.counter, 2);
});

test("causal chain preserves happened-before with increasing Lamport counters", () => {
  const result = simulateCausalChain();

  assert.equal(result.mode, "causal-chain");
  assert.equal(result.causalEdges.length, 4);
  assert.deepEqual(
    result.events.map((event) => event.lamport),
    [1, 2, 3, 4, 5]
  );
  assert.equal(result.events.at(-1).happenedBefore[0], result.events.at(-2).id);
});

test("concurrent events keep no causal edges even when sorted for display", () => {
  const result = simulateConcurrentEvents();

  assert.equal(result.mode, "concurrent-events");
  assert.equal(result.concurrentPairs.length, 3);
  assert.ok(result.events.every((event) => event.lamport === 1));
  assert.deepEqual(
    result.totalOrderForDisplay.map((event) => event.nodeId),
    ["gestor-flota", "monitor-telemetria", "planificador-rutas"]
  );
});

test("merge and tie-break compares Lamport counter before node id", () => {
  const lower = { nodeId: "z-node", lamport: 1 };
  const higher = { nodeId: "a-node", lamport: 2 };
  const leftTie = { nodeId: "centro-logistica", lamport: 3 };
  const rightTie = { nodeId: "planificador-rutas", lamport: 3 };

  assert.ok(compareLamportEvents(lower, higher) < 0);
  assert.ok(compareLamportEvents(leftTie, rightTie) < 0);

  const result = simulateMergeAndTieBreak();
  assert.deepEqual(
    result.tiedEvents.map((event) => event.nodeId),
    ["centro-logistica", "planificador-rutas"]
  );
  assert.equal(result.events.at(-1).lamport, 6);
});

test("structured result exposes summary, observations, decisions, metrics, timeline and learning-ready data", () => {
  const result = createLamportOrderingLabResult({ mode: "causal-chain" });

  assert.equal(result.labId, "lamport-ordering");
  assert.equal(result.session, 23);
  assert.equal(result.mode, "causal-chain");
  assert.equal(typeof result.summary, "string");
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.decisions));
  assert.ok(result.decisions.length >= 2);
  assert.equal(result.metrics.causalEdges, 4);
  assert.equal(result.timeline.length, result.raw.events.length);
});

test("runLamportOrderingLab supports the three Session 23 modes", () => {
  ["causal-chain", "concurrent-events", "merge-and-tie-break"].forEach((mode) => {
    const result = runLamportOrderingLab({ mode });

    assert.equal(result.mode, mode);
  });
});

test("parseArgs supports flags, positional modes, json and timeline", () => {
  assert.deepEqual(parseArgs(["--causal-chain"]), { mode: "causal-chain" });
  assert.deepEqual(parseArgs(["--concurrent-events"]), { mode: "concurrent-events" });
  assert.deepEqual(parseArgs(["--merge-and-tie-break"]), { mode: "merge-and-tie-break" });
  assert.deepEqual(parseArgs(["concurrent-events"]), { mode: "concurrent-events" });
  assert.deepEqual(parseArgs(["--mode", "merge-and-tie-break"]), { mode: "merge-and-tie-break" });
  assert.deepEqual(parseArgs(["--mode=causal-chain", "--json", "--timeline"]), { mode: "causal-chain", json: true, timeline: true });
});

test("CLI prints JSON structured result", () => {
  const output = execFileSync(process.execPath, [labPath, "--concurrent-events", "--json"], { encoding: "utf8" });
  const payload = JSON.parse(output);

  assert.equal(payload.labId, "lamport-ordering");
  assert.equal(payload.mode, "concurrent-events");
  assert.equal(payload.metrics.concurrentPairs, 3);
});

test("unsupported mode throws a helpful error", () => {
  assert.throws(
    () => runLamportOrderingLab({ mode: "vector-clocks" }),
    /not supported.*causal-chain, concurrent-events, merge-and-tie-break/
  );
});

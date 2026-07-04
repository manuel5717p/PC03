const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createEventsWithOffsets,
  parseArgs,
  simulateDrift,
  simulateSkew,
  simulateTolerance,
  simulateWallClockVsMonotonic,
  sortByClientReportedAt
} = require("../src/physical-time-lab");

test("genera eventos deterministas con offsets de reloj", () => {
  const events = createEventsWithOffsets({ offsetsMs: [20, -10], thresholdMs: 50 });

  assert.equal(events[0].eventId, "evt-physical-001");
  assert.equal(events[0].nodeId, "node-01");
  assert.equal(events[0].clockSkewMs, 20);
  assert.equal(events[0].acceptedWithinTolerance, true);
  assert.equal(events[1].clientReportedAtMs, events[1].serverReceivedAtMs - 10);
});

test("ordenar por clientReportedAt puede invertir el orden real", () => {
  const report = simulateSkew({ offsetsMs: [120, -90, 20] });

  assert.deepEqual(report.actualOrder, ["evt-physical-001", "evt-physical-002", "evt-physical-003"]);
  assert.deepEqual(report.clientReportedOrder, ["evt-physical-002", "evt-physical-001", "evt-physical-003"]);
  assert.equal(report.clientOrderInvertsActualOrder, true);
});

test("duracion monotonic no cambia por salto del wall-clock", () => {
  const report = simulateWallClockVsMonotonic({ realDurationMs: 250, wallClockJumpMs: -600 });

  assert.equal(report.wallClockDurationMs, -350);
  assert.equal(report.monotonicDurationMs, 250);
});

test("drift acumula skew por tick", () => {
  const report = simulateDrift({ startOffsetMs: 5, driftPerTickMs: 12, ticks: 4 });

  assert.deepEqual(
    report.timeline.map((entry) => entry.clockSkewMs),
    [5, 17, 29, 41]
  );
  assert.equal(report.finalClockSkewMs, 41);
  assert.equal(report.totalErrorGrowthMs, 36);
});

test("ventana de tolerancia acepta y rechaza segun threshold", () => {
  const report = simulateTolerance({ thresholdMs: 100, offsetsMs: [20, -85, 140, -160] });

  assert.equal(report.accepted, 2);
  assert.equal(report.rejected, 2);
  assert.deepEqual(
    report.events.map((event) => event.acceptedWithinTolerance),
    [true, true, false, false]
  );
});

test("parseArgs soporta flags y equivalentes posicionales", () => {
  assert.deepEqual(parseArgs(["--normal"]), { mode: "normal" });
  assert.deepEqual(parseArgs(["--skew"]), { mode: "skew" });
  assert.deepEqual(parseArgs(["--drift"]), { mode: "drift" });
  assert.deepEqual(parseArgs(["--tolerance"]), { mode: "tolerance" });
  assert.deepEqual(parseArgs(["skew"]), { mode: "skew" });
  assert.deepEqual(parseArgs(["--mode", "drift"]), { mode: "drift" });
  assert.deepEqual(parseArgs(["--tolerance", "--threshold-ms=75"]), { mode: "tolerance", thresholdMs: 75 });
});

test("sortByClientReportedAt ordena por timestamp reportado", () => {
  const events = createEventsWithOffsets({ offsetsMs: [120, -90, 20] });
  const ordered = sortByClientReportedAt(events);

  assert.deepEqual(
    ordered.map((event) => event.eventId),
    ["evt-physical-002", "evt-physical-001", "evt-physical-003"]
  );
});

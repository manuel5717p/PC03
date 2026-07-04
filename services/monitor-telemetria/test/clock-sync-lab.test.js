const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  applySlewCorrection,
  applyStepCorrection,
  chooseTimestampForPurpose,
  classifyFutureTimestamp,
  classifyTelemetryPackets,
  compareWithClockUncertainty,
  computeNtpExchange,
  createClockSyncLabResult,
  createNtpTimestamps,
  evaluateAuditConfidence,
  evaluateStaleSync,
  evaluateTelemetryImpact,
  parseArgs,
  runClockSyncLab
} = require("../src/clock-sync-lab");

const clockSyncLabPath = path.join(__dirname, "..", "src", "clock-sync-lab.js");

test("computes NTP round trip delay and estimated offset with four timestamps", () => {
  const exchange = computeNtpExchange({ t0: 1_000, t1: 1_120, t2: 1_130, t3: 1_090 });

  assert.equal(exchange.roundTripDelayMs, 80);
  assert.equal(exchange.estimatedOffsetMs, 80);
});

test("symmetric delay estimates true offset exactly", () => {
  const exchange = createNtpTimestamps({
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 40,
    serverToClientDelayMs: 40,
    serverProcessingMs: 10
  });

  assert.equal(exchange.roundTripDelayMs, 80);
  assert.equal(exchange.estimatedOffsetMs, 80);
  assert.equal(exchange.estimationBiasMs, 0);
});

test("asymmetric delay biases estimated offset", () => {
  const exchange = createNtpTimestamps({
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 20,
    serverToClientDelayMs: 100,
    serverProcessingMs: 10
  });

  assert.equal(exchange.roundTripDelayMs, 120);
  assert.equal(exchange.estimatedOffsetMs, 40);
  assert.equal(exchange.estimationBiasMs, -40);
});

test("step correction applies full correction immediately", () => {
  const correction = applyStepCorrection({ initialOffsetMs: 120, targetOffsetMs: 0 });

  assert.equal(correction.appliedCorrectionMs, -120);
  assert.deepEqual(
    correction.timeline.map((entry) => entry.offsetMs),
    [120, 0]
  );
});

test("slew correction applies gradual corrections and reaches target after ticks", () => {
  const correction = applySlewCorrection({ initialOffsetMs: 120, targetOffsetMs: 0, ticks: 4 });

  assert.equal(correction.correctionPerTickMs, -30);
  assert.deepEqual(
    correction.timeline.map((entry) => entry.offsetMs),
    [120, 90, 60, 30, 0]
  );
});

test("stale sync degrades confidence as estimated error grows", () => {
  const fresh = evaluateStaleSync({
    lastEstimatedErrorMs: 10,
    driftRateMsPerSecond: 0.1,
    syncAgeMs: 10_000,
    toleranceMs: 50
  });
  const stale = evaluateStaleSync({
    lastEstimatedErrorMs: 10,
    driftRateMsPerSecond: 0.1,
    syncAgeMs: 300_000,
    toleranceMs: 50
  });

  assert.equal(fresh.estimatedErrorMs, 11);
  assert.equal(stale.estimatedErrorMs, 40);
  assert.ok(stale.confidence < fresh.confidence);
});

test("telemetry impact marks events trusted or untrusted based on confidence and tolerance", () => {
  const trusted = evaluateTelemetryImpact({
    clockOffsetMs: 18,
    roundTripDelayMs: 40,
    syncAgeMs: 15_000,
    estimatedErrorMs: 12,
    confidence: 0.9,
    toleranceMs: 50
  });
  const untrusted = evaluateTelemetryImpact({
    clockOffsetMs: 45,
    roundTripDelayMs: 120,
    syncAgeMs: 90_000,
    estimatedErrorMs: 20,
    confidence: 0.55,
    toleranceMs: 50
  });

  assert.equal(trusted.trustedForOrdering, true);
  assert.equal(trusted.trustedForSlaWindow, true);
  assert.equal(trusted.trustedForAuditTimeline, true);
  assert.equal(untrusted.trustedForOrdering, false);
  assert.equal(untrusted.trustedForSlaWindow, false);
  assert.equal(untrusted.trustedForAuditTimeline, true);
});

test("parseArgs supports flags and positional modes", () => {
  assert.deepEqual(parseArgs(["--normal"]), { mode: "normal" });
  assert.deepEqual(parseArgs(["--asymmetric-delay"]), { mode: "asymmetric-delay" });
  assert.deepEqual(parseArgs(["--correction-policy"]), { mode: "correction-policy" });
  assert.deepEqual(parseArgs(["--stale-sync"]), { mode: "stale-sync" });
  assert.deepEqual(parseArgs(["--telemetry-impact"]), { mode: "telemetry-impact" });
  assert.deepEqual(parseArgs(["asymmetric-delay"]), { mode: "asymmetric-delay" });
  assert.deepEqual(parseArgs(["--mode", "stale-sync"]), { mode: "stale-sync" });
  assert.deepEqual(parseArgs(["--telemetry-impact", "--tolerance-ms=75"]), { mode: "telemetry-impact", toleranceMs: 75 });
  assert.deepEqual(parseArgs(["--scenario-analysis"]), { mode: "scenario-analysis" });
  assert.deepEqual(parseArgs(["--scenario-analysis", "--json"]), { mode: "scenario-analysis", json: true });
  assert.deepEqual(parseArgs(["--scenario-analysis", "--timeline"]), { mode: "scenario-analysis", timeline: true });
});

test("scenario analysis does not assert battery low before mission assignment inside clock uncertainty", () => {
  const result = compareWithClockUncertainty("10:20:00.100", "10:20:00.130", 80);

  assert.equal(result.differenceMs, 30);
  assert.equal(result.combinedUncertaintyMs, 160);
  assert.equal(result.canEstablishTemporalOrder, false);
  assert.equal(result.decision, "uncertain-order");
  assert.match(result.recommendation, /confirmación de seguridad reciente/);
});

test("temporal order stays uncertain when uncertainty windows overlap", () => {
  const result = compareWithClockUncertainty(0, 100, 80);

  assert.equal(result.differenceMs, 100);
  assert.equal(result.combinedUncertaintyMs, 160);
  assert.equal(result.overlappingWindows, true);
  assert.equal(result.canEstablishTemporalOrder, false);
  assert.equal(result.decision, "uncertain-order");
});

test("temporal order is usable only beyond combined uncertainty", () => {
  const result = compareWithClockUncertainty(0, 161, 80);

  assert.equal(result.differenceMs, 161);
  assert.equal(result.combinedUncertaintyMs, 160);
  assert.equal(result.overlappingWindows, false);
  assert.equal(result.canEstablishTemporalOrder, true);
  assert.equal(result.decision, "timestamp-order-usable");
});

test("scenario analysis marks late telemetry out-of-order without discarding it automatically", () => {
  const packets = classifyTelemetryPackets([
    { id: "P1", occurredAt: "10:20:00.100", receivedAt: "10:20:00.300", battery: 60 },
    { id: "P2", occurredAt: "10:20:00.200", receivedAt: "10:20:00.400", battery: 59 },
    { id: "P3", occurredAt: "10:19:59.900", receivedAt: "10:20:01.000", battery: 62 }
  ]);

  assert.equal(packets[2].id, "P3");
  assert.equal(packets[2].outOfOrder, true);
  assert.equal(packets[2].keepForAudit, true);
  assert.equal(packets[2].staleForOperationalState, true);
});

test("scenario analysis refuses exact incident order when all audit events are within error window", () => {
  const audit = evaluateAuditConfidence(
    [
      { service: "centro-logistica", timestamp: "10:30:00.100", event: "MissionAssigned" },
      { service: "gestor-flota", timestamp: "10:30:00.050", event: "DroneAvailable" },
      { service: "monitor-telemetria", timestamp: "10:30:00.020", event: "BatteryLow" },
      { service: "planificador-rutas", timestamp: "10:30:00.090", event: "RoutePlanned" }
    ],
    100
  );

  assert.equal(audit.exactTotalOrderTrusted, false);
  assert.equal(audit.combinedUncertaintyMs, 200);
  assert.equal(audit.tooClosePairs.length, 6);
  assert.ok(audit.recommendedMetadata.includes("causationId"));
  assert.ok(audit.recommendedMetadata.includes("sourceSequence"));
});

test("audit confidence flags events that overlap within combined uncertainty", () => {
  const audit = evaluateAuditConfidence(
    [
      { service: "left", timestamp: "10:30:00.000", event: "Left" },
      { service: "right", timestamp: "10:30:00.150", event: "Right" }
    ],
    100
  );

  assert.equal(audit.combinedUncertaintyMs, 200);
  assert.equal(audit.exactTotalOrderTrusted, false);
  assert.deepEqual(audit.tooClosePairs, [{ left: "left", right: "right", differenceMs: 150 }]);
});

test("audit confidence trusts total order beyond combined uncertainty", () => {
  const audit = evaluateAuditConfidence(
    [
      { service: "left", timestamp: "10:30:00.000", event: "Left" },
      { service: "right", timestamp: "10:30:00.201", event: "Right" }
    ],
    100
  );

  assert.equal(audit.combinedUncertaintyMs, 200);
  assert.equal(audit.exactTotalOrderTrusted, true);
  assert.deepEqual(audit.tooClosePairs, []);
});

test("scenario analysis uses occurrence time for business SLA and ingestion times for delay", () => {
  const sla = chooseTimestampForPurpose({
    missionStartedOccurredAt: "10:00:00",
    deliveryCompletedOccurredAt: "10:29:58",
    completedReceivedAt: "10:31:10",
    completedProcessedAt: "10:31:30",
    promisedSlaMs: 30 * 60_000
  });

  assert.equal(sla.businessSlaTimestamp, "occurredAt");
  assert.equal(sla.businessDurationMs, 1_798_000);
  assert.equal(sla.metBusinessSla, true);
  assert.equal(sla.ingestionDelayMs, 72_000);
  assert.equal(sla.processingDelayMs, 20_000);
});

test("scenario analysis accepts small future timestamps as skewed instead of invalid", () => {
  const future = classifyFutureTimestamp({
    occurredAt: "10:40:05",
    backendCurrentTime: "10:40:03",
    futureToleranceMs: 5_000
  });

  assert.equal(future.futureByMs, 2_000);
  assert.equal(future.withinFutureTolerance, true);
  assert.equal(future.invalid, false);
  assert.match(future.recommendation, /Acepte con metadatos de incertidumbre/);
});

test("scenario analysis mode returns all teaching scenarios", () => {
  const report = runClockSyncLab({ mode: "scenario-analysis" });

  assert.equal(report.mode, "scenario-analysis");
  assert.equal(report.lowBatteryVsMission.canEstablishTemporalOrder, false);
  assert.deepEqual(report.telemetry.byEventTime, ["P3", "P1", "P2"]);
  assert.equal(report.audit.exactTotalOrderTrusted, false);
  assert.equal(report.deliverySla.metBusinessSla, true);
  assert.equal(report.futureTimestamp.invalid, false);
});

test("scenario analysis JSON CLI returns stable structured contract", () => {
  const output = execFileSync(process.execPath, [clockSyncLabPath, "--scenario-analysis", "--json"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.labId, "clock-sync");
  assert.equal(result.session, 22);
  assert.equal(result.mode, "scenario-analysis");
  assert.equal(typeof result.title, "string");
  assert.equal(typeof result.summary, "string");
  assert.equal(typeof result.inputs, "object");
  assert.equal(result.inputs.json, undefined);
  assert.equal(result.inputs.timeline, undefined);
  assert.equal(typeof result.metrics, "object");
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.decisions));
  assert.ok(Array.isArray(result.timeline));
  assert.ok(Array.isArray(result.recommendations));
  assert.equal(typeof result.raw, "object");
});

test("structured result inputs use the selected mode preset", () => {
  const normal = createClockSyncLabResult({ mode: "normal" });
  const scenario = createClockSyncLabResult({ mode: "scenario-analysis" });

  assert.equal(normal.inputs.clientSendAtMs, 1_000);
  assert.equal(normal.inputs.clockErrorMs, undefined);
  assert.equal(scenario.inputs.clockErrorMs, 80);
});

test("timeline CLI exposes overlapping uncertainty windows and uncertain order", () => {
  const output = execFileSync(process.execPath, [clockSyncLabPath, "--scenario-analysis", "--timeline"], { encoding: "utf8" });

  assert.match(output, /window=\[/);
  assert.match(output, /\+\/-?80ms|\+\/\-80ms/);
  assert.match(output, /overlappingWindows=true/);
  assert.match(output, /decision=uncertain-order/);
});

test("structured scenario result includes five scenarios and key decisions", () => {
  const result = createClockSyncLabResult({ mode: "scenario-analysis" });
  const decisionsById = Object.fromEntries(result.decisions.map((decision) => [decision.id, decision]));

  assert.equal(result.decisions.length, 5);
  assert.equal(decisionsById["battery-vs-mission"].decision, "uncertain-order");
  assert.equal(decisionsById["out-of-order-telemetry"].decision, "keep-for-audit-do-not-overwrite-state");
  assert.equal(decisionsById["incident-audit"].decision, "exact-order-not-trusted");
  assert.equal(decisionsById["delivery-sla"].decision, "business-sla-met-by-occurred-at");
  assert.equal(decisionsById["future-timestamp"].decision, "future-timestamp-accepted-with-uncertainty");
  assert.equal(result.metrics.overlappingWindows, true);
  assert.equal(result.raw.telemetry.packets[2].id, "P3");
  assert.equal(result.raw.telemetry.packets[2].keepForAudit, true);
});

#!/usr/bin/env node

const COORDINATION_INTEGRATION_MODES = ["pc3-ready-happy-path", "causal-conflict-review", "suspected-leader-compensation"];
const INTEGRATION_ID = "aura-pc3-coordination-defense";
const CLOCK_TOLERANCE_MS = 50;
const LEASE_TTL_MS = 150;
const FAILURE_TIMEOUT_MS = 140;
const BOUNDARY = "Session 29 integrates synchronization and coordination reasoning for PC3 defense only; it does not implement consensus, quorum, Raft/Paxos, production membership, distributed transactions, or real failover.";

const ACTORS = {
  telemetry: "monitor-telemetria",
  fleet: "gestor-flota",
  logistics: "centro-logistica",
  planner: "planificador-rutas"
};

function createTimelineEvent(id, label, atMs, decision, detail, extra = {}) {
  return { id, label, time: `t=${atMs}ms`, atMs, decision, detail, ...extra };
}

function createLease(owner, acquiredAt, ttlMs = LEASE_TTL_MS, fencingToken = 129) {
  return {
    resourceId: "dispatch-window:pc3-integration",
    owner,
    acquiredAt,
    leaseDeadline: acquiredAt + ttlMs,
    ttlMs,
    fencingToken
  };
}

function createPhysicalTime(maxSkewMs, observedAtMs, latestWallClock, toleranceMs = CLOCK_TOLERANCE_MS) {
  return {
    latestWallClock,
    observedAtMs,
    maxSkewMs,
    toleranceMs,
    withinTolerance: maxSkewMs <= toleranceMs,
    defense: "El timestamp físico sirve como metadato con tolerancia explícita, no como prueba de orden global."
  };
}

function createClockSync(estimatedOffsetMs, roundTripDelayMs, estimatedErrorMs, trusted) {
  return {
    referenceNode: ACTORS.telemetry,
    estimatedOffsetMs,
    roundTripDelayMs,
    estimatedErrorMs,
    trusted,
    defense: "La sincronización reduce incertidumbre de timestamps, pero no reemplaza causalidad ni ownership temporal."
  };
}

function createLamport(eventId, actor, logicalClock, dependsOn = []) {
  return { eventId, actor, logicalClock, dependsOn };
}

function createVectorEvidence(left, right, relation, conflictDetected, defense) {
  return { left, right, relation, concurrent: relation === "concurrent", conflictDetected, defense };
}

function createFailureSuspicion(observer, subject, lastHeartbeatAt, checkedAt, timeoutMs = FAILURE_TIMEOUT_MS) {
  const silenceMs = checkedAt - lastHeartbeatAt;
  return {
    observer,
    subject,
    lastHeartbeatAt,
    checkedAt,
    silenceMs,
    timeoutMs,
    suspected: silenceMs >= timeoutMs,
    reason: silenceMs >= timeoutMs ? "leader-silent-beyond-timeout" : "heartbeat-within-timeout"
  };
}

function simulatePc3ReadyHappyPath() {
  const lease = createLease(ACTORS.telemetry, 1000, LEASE_TTL_MS, 129);
  const actionAtMs = 1095;
  const lamport = [
    createLamport("route-approved", ACTORS.planner, 18),
    createLamport("lease-confirmed", ACTORS.telemetry, 19, ["route-approved"]),
    createLamport("dispatch-accepted", ACTORS.fleet, 20, ["lease-confirmed"])
  ];

  return {
    mode: "pc3-ready-happy-path",
    summary: "La acción se acepta porque tiempo físico, sincronización, causalidad, lease, líder y detector de fallas apuntan a una decisión consistente.",
    action: { id: "dispatch-drone-pc3", actor: ACTORS.fleet, atMs: actionAtMs, accepted: true, reason: "all-integration-signals-safe" },
    decision: "accepted",
    confidence: "high",
    physicalTime: createPhysicalTime(18, actionAtMs, "2026-07-02T15:00:01.095Z"),
    clockSync: createClockSync(12, 28, 14, true),
    lamport: { events: lamport, consistentOrder: true, insufficiency: false, defense: "Lamport confirma una cadena happened-before compatible con la acción." },
    vectorClock: createVectorEvidence(
      { eventId: "lease-confirmed", vector: { monitor: 5, fleet: 2, logistics: 3, planner: 4 } },
      { eventId: "dispatch-accepted", vector: { monitor: 5, fleet: 3, logistics: 3, planner: 4 } },
      "before",
      false,
      "Vector clocks no muestran concurrencia ni conflicto sobre el despacho."
    ),
    lease: { ...lease, validAtAction: actionAtMs < lease.leaseDeadline, unsafe: false },
    leader: { current: ACTORS.telemetry, stable: true, electionEvidence: "leader-election-session-27-stable-heartbeats" },
    failureSuspicion: createFailureSuspicion(ACTORS.fleet, ACTORS.telemetry, 1080, 1100),
    compensation: { applied: false, action: null, reason: "main-action-safe" },
    risks: ["La decisión sigue siendo local al escenario; no prueba consenso global."],
    defense: [
      "Aceptar no depende de una sola señal: combina tolerancia física, sincronización razonable, happened-before, vector clocks, lease vigente y líder no sospechado.",
      "La evidencia es suficiente para PC3 porque permite explicar por qué la acción fue segura dentro del límite del laboratorio."
    ],
    timeline: [
      createTimelineEvent("clock-sync", "monitor-telemetria sincroniza ventana", 980, "sync-trusted", "offset=12ms, delay=28ms"),
      createTimelineEvent("route-approved", "planificador-rutas aprueba ruta", 990, "causal-fact-recorded", "Lamport=18 inicia precondición", lamport[0]),
      createTimelineEvent("lease-confirmed", "monitor-telemetria confirma lease", 1000, "lease-valid", `deadline=${lease.leaseDeadline}ms`, lease),
      createTimelineEvent("dispatch-accepted", "gestor-flota acepta despacho", actionAtMs, "accepted", "acción dentro del lease y sin sospecha activa", { actionAccepted: true })
    ]
  };
}

function simulateCausalConflictReview() {
  const lease = createLease(ACTORS.telemetry, 2000, LEASE_TTL_MS, 133);
  const actionAtMs = 2090;
  const lamport = [
    createLamport("route-replanned", ACTORS.planner, 31),
    createLamport("battery-reserved", ACTORS.fleet, 32),
    createLamport("dispatch-requested", ACTORS.logistics, 33, ["route-replanned"])
  ];

  return {
    mode: "causal-conflict-review",
    summary: "La hora física y el lease parecen válidos, pero los vector clocks revelan concurrencia: Lamport ordena presentación, no resuelve conflicto causal.",
    action: { id: "dispatch-drone-pc3", actor: ACTORS.logistics, atMs: actionAtMs, accepted: false, reason: "vector-clock-concurrency-requires-human-review" },
    decision: "requires-review",
    confidence: "medium",
    physicalTime: createPhysicalTime(22, actionAtMs, "2026-07-02T15:05:02.090Z"),
    clockSync: createClockSync(15, 34, 17, true),
    lamport: { events: lamport, consistentOrder: true, insufficiency: true, defense: "Lamport da un orden escalar de presentación, pero no distingue si dos hechos son concurrentes." },
    vectorClock: createVectorEvidence(
      { eventId: "route-replanned", vector: { monitor: 7, fleet: 4, logistics: 3, planner: 8 } },
      { eventId: "battery-reserved", vector: { monitor: 7, fleet: 5, logistics: 3, planner: 7 } },
      "concurrent",
      true,
      "Los vectores son incomparables: hay evidencia causal incompleta entre nueva ruta y reserva de batería."
    ),
    lease: { ...lease, validAtAction: actionAtMs < lease.leaseDeadline, unsafe: false },
    leader: { current: ACTORS.telemetry, stable: true, electionEvidence: "leader-election-session-27-stable-heartbeats" },
    failureSuspicion: createFailureSuspicion(ACTORS.fleet, ACTORS.telemetry, 2070, 2100),
    compensation: { applied: false, action: null, reason: "review-before-side-effect" },
    risks: [
      "Aceptar por timestamp y Lamport ocultaría un conflicto causal real.",
      "La revisión debe reconciliar ruta y reserva antes de ejecutar el despacho."
    ],
    defense: [
      "La decisión correcta no es aceptar: los vector clocks agregan evidencia que Lamport no puede expresar.",
      "Requerir revisión preserva safety educativa sin inventar consenso ni transacción distribuida."
    ],
    timeline: [
      createTimelineEvent("clock-sync", "sincronización aceptable", 1980, "sync-trusted", "offset=15ms, delay=34ms"),
      createTimelineEvent("route-replanned", "planificador-rutas propone ruta actualizada", 2040, "causal-fact-recorded", "Lamport=31", lamport[0]),
      createTimelineEvent("battery-reserved", "gestor-flota reserva batería en paralelo", 2045, "concurrent-fact-recorded", "vector concurrente con route-replanned", lamport[1]),
      createTimelineEvent("review-required", "centro-logistica bloquea despacho automático", actionAtMs, "requires-review", "lease vigente, pero causalidad incompleta", { actionAccepted: false })
    ]
  };
}

function simulateSuspectedLeaderCompensation() {
  const lease = createLease(ACTORS.telemetry, 3000, LEASE_TTL_MS, 141);
  const actionAtMs = 3185;
  const suspicion = createFailureSuspicion(ACTORS.fleet, ACTORS.telemetry, 3030, actionAtMs);
  const lamport = [
    createLamport("dispatch-started", ACTORS.telemetry, 44),
    createLamport("fleet-timeout", ACTORS.fleet, 45, ["dispatch-started"]),
    createLamport("compensation-recorded", ACTORS.logistics, 46, ["fleet-timeout"])
  ];
  const compensation = {
    applied: true,
    action: "pause-dispatch-and-requeue-order",
    actor: ACTORS.logistics,
    atMs: 3190,
    reason: "leader-suspected-and-lease-expired",
    userImpact: "dispatch-delayed-not-duplicated"
  };

  return {
    mode: "suspected-leader-compensation",
    summary: "El líder está sospechado, el silencio supera el timeout y el lease ya no es seguro; se rechaza la acción principal y se registra compensación.",
    action: { id: "dispatch-drone-pc3", actor: ACTORS.telemetry, atMs: actionAtMs, accepted: false, reason: "leader-suspected-and-unsafe-lease" },
    decision: "compensated",
    confidence: "low",
    physicalTime: createPhysicalTime(44, actionAtMs, "2026-07-02T15:10:03.185Z"),
    clockSync: createClockSync(29, 76, 38, false),
    lamport: { events: lamport, consistentOrder: false, insufficiency: true, defense: "La cadena lógica contiene un inicio, pero falta confirmación causal del ACK de flota." },
    vectorClock: createVectorEvidence(
      { eventId: "dispatch-started", vector: { monitor: 11, fleet: 6, logistics: 5, planner: 8 } },
      { eventId: "fleet-timeout", vector: { monitor: 10, fleet: 7, logistics: 5, planner: 8 } },
      "concurrent",
      true,
      "La evidencia causal está incompleta durante la sospecha; no se puede probar finalización segura."
    ),
    lease: { ...lease, validAtAction: actionAtMs < lease.leaseDeadline, unsafe: true, expiredByMs: actionAtMs - lease.leaseDeadline },
    leader: { current: ACTORS.telemetry, stable: false, electionEvidence: "leader-election-session-27-timeout-suspicion" },
    failureSuspicion: suspicion,
    compensation,
    risks: [
      "Duplicar despacho sería peor que retrasarlo porque el estado causal está incompleto.",
      "La plataforma no debe prometer failover real ni nueva membresía productiva."
    ],
    defense: [
      "La salida defendible es compensar: pausar y reencolar conserva evidencia y evita efectos duplicados.",
      "La confianza es baja porque sincronización, causalidad, lease y líder no alcanzan para aceptar la acción principal."
    ],
    timeline: [
      createTimelineEvent("lease-acquired", "monitor-telemetria toma lease inicial", lease.acquiredAt, "lease-valid", `deadline=${lease.leaseDeadline}ms`, lease),
      createTimelineEvent("last-heartbeat", "último heartbeat del líder", suspicion.lastHeartbeatAt, "heartbeat-accepted", "todavía no hay sospecha", { from: ACTORS.telemetry, to: ACTORS.fleet }),
      createTimelineEvent("leader-suspected", "gestor-flota sospecha al líder", suspicion.checkedAt, "leader-suspected", `silence=${suspicion.silenceMs}ms >= timeout=${suspicion.timeoutMs}ms`, suspicion),
      createTimelineEvent("compensation", "centro-logistica compensa el flujo", compensation.atMs, "compensated", "pausa despacho y reencola orden", compensation)
    ]
  };
}

function runCoordinationIntegrationLab(options = {}) {
  const mode = options.mode ?? "pc3-ready-happy-path";
  if (mode === "pc3-ready-happy-path") return simulatePc3ReadyHappyPath();
  if (mode === "causal-conflict-review") return simulateCausalConflictReview();
  if (mode === "suspected-leader-compensation") return simulateSuspectedLeaderCompensation();

  throw new Error(`coordination integration mode '${mode}' is not supported. Use one of: ${COORDINATION_INTEGRATION_MODES.join(", ")}`);
}

function createMetrics(raw) {
  return {
    maxClockSkewMs: raw.physicalTime.maxSkewMs,
    clockToleranceMs: raw.physicalTime.toleranceMs,
    clockWithinTolerance: raw.physicalTime.withinTolerance,
    estimatedOffsetMs: raw.clockSync.estimatedOffsetMs,
    roundTripDelayMs: raw.clockSync.roundTripDelayMs,
    clockSyncTrusted: raw.clockSync.trusted,
    lamportConsistent: raw.lamport.consistentOrder,
    lamportInsufficient: raw.lamport.insufficiency,
    vectorConcurrent: raw.vectorClock.concurrent,
    vectorConflictDetected: raw.vectorClock.conflictDetected,
    leaseValid: raw.lease.validAtAction,
    leaderStable: raw.leader.stable,
    leaderSuspected: raw.failureSuspicion.suspected,
    suspicionSilenceMs: raw.failureSuspicion.silenceMs,
    timeoutMs: raw.failureSuspicion.timeoutMs,
    compensationApplied: raw.compensation.applied,
    actionAccepted: raw.action.accepted,
    evidenceComplete: raw.mode === "pc3-ready-happy-path"
  };
}

function createEvidence(raw) {
  return {
    integrationId: INTEGRATION_ID,
    actors: ACTORS,
    decision: raw.decision,
    confidence: raw.confidence,
    physicalTime: raw.physicalTime,
    clockSync: raw.clockSync,
    lamport: raw.lamport,
    vectorClock: raw.vectorClock,
    lease: raw.lease,
    leader: raw.leader,
    failureSuspicion: raw.failureSuspicion,
    compensation: raw.compensation,
    risks: raw.risks,
    defense: raw.defense,
    boundary: BOUNDARY
  };
}

function createObservations(raw) {
  if (raw.mode === "causal-conflict-review") {
    return [
      "El timestamp físico y la sincronización son aceptables, pero no bastan para aceptar el despacho.",
      "Lamport ordena los eventos; vector clocks revelan concurrencia entre ruta y reserva de batería.",
      "La decisión defendible es revisión antes de producir un efecto irreversible."
    ];
  }
  if (raw.mode === "suspected-leader-compensation") {
    return [
      "El silencio del líder supera el timeout y convierte el lease en evidencia insegura para aceptar la acción principal.",
      "La causalidad está incompleta; compensar evita duplicar despacho mientras conserva trazabilidad.",
      "La decisión no es failover real: es degradación controlada para defensa PC3."
    ];
  }
  return [
    "Todas las señales educativas apuntan en la misma dirección: acción aceptada con confianza alta.",
    "La defensa combina evidencia de sesiones 21-28 sin introducir consenso ni quórum.",
    "El lease vigente y el líder estable completan lo que los relojes físicos y lógicos no prueban solos."
  ];
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function createDecisions(raw) {
  return [
    createDecision("defend-with-combined-evidence", "Defensa con evidencia combinada", raw.decision, "No defienda una acción distribuida con una sola señal; cruce tiempo físico, sincronización, Lamport, vector clocks, lease, líder y sospecha."),
    createDecision("respect-causal-boundaries", "Límite causal", raw.vectorClock.conflictDetected ? "review-before-side-effect" : "causality-compatible", "Use vector clocks para detectar concurrencia que Lamport no puede explicar."),
    createDecision("respect-operational-boundaries", "Límite operacional", raw.compensation.applied ? "compensate-not-failover" : "bounded-decision", "Explique explícitamente que el laboratorio no implementa consenso, quórum, transacciones distribuidas ni failover real.")
  ];
}

function createLearning(metrics) {
  return {
    objective: "Defender una decisión distribuida de AURA integrando evidencia de tiempo físico, sincronización, Lamport, vector clocks, leases, líder, sospecha de fallas y compensación.",
    keyMetrics: [
      { label: "Clock within tolerance", value: metrics.clockWithinTolerance, unit: "boolean", meaning: "Indica si el timestamp físico queda dentro del margen aceptable." },
      { label: "Clock sync trusted", value: metrics.clockSyncTrusted, unit: "boolean", meaning: "Resume si offset, delay y error estimado permiten usar timestamps como evidencia auxiliar." },
      { label: "Lamport insufficient", value: metrics.lamportInsufficient, unit: "boolean", meaning: "Recuerda que Lamport puede ordenar sin probar causalidad completa." },
      { label: "Vector conflict detected", value: metrics.vectorConflictDetected, unit: "boolean", meaning: "Señala concurrencia o causalidad incompleta que exige revisión." },
      { label: "Lease valid", value: metrics.leaseValid, unit: "boolean", meaning: "Comprueba si la acción ocurre dentro del ownership temporal." },
      { label: "Leader suspected", value: metrics.leaderSuspected, unit: "boolean", meaning: "Indica si el detector de fallas obliga a degradar la decisión." },
      { label: "Compensation applied", value: metrics.compensationApplied, unit: "boolean", meaning: "Muestra si el sistema pausó/reencoló para evitar efectos duplicados." }
    ],
    checklist: [
      "Valide tolerancia de relojes físicos antes de citar timestamps.",
      "Revise offset, delay y error estimado de sincronización.",
      "Use Lamport para explicar orden parcial, pero no lo venda como causalidad completa.",
      "Use vector clocks para detectar concurrencia o conflicto causal.",
      "Compare la acción con el leaseDeadline y el estado del líder.",
      "Si hay sospecha o causalidad incompleta, rechace o compense antes de duplicar efectos.",
      "Declare el límite: no hay consenso, quórum, Raft/Paxos, membresía productiva, transacciones distribuidas ni failover real."
    ],
    takeaway: "La defensa PC3 no exige una verdad global; exige una decisión limitada, consistente con la evidencia y honesta sobre sus fronteras."
  };
}

function createCoordinationIntegrationLabResult(options = {}) {
  const raw = runCoordinationIntegrationLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions(raw);
  return {
    labId: "coordination-integration",
    session: 29,
    mode: raw.mode,
    title: "Sesión 29: Laboratorio integrador de sincronización y coordinación",
    summary: raw.summary,
    inputs: { mode: raw.mode, integrationId: INTEGRATION_ID, clockToleranceMs: CLOCK_TOLERANCE_MS, leaseTtlMs: LEASE_TTL_MS, failureTimeoutMs: FAILURE_TIMEOUT_MS },
    metrics,
    observations: createObservations(raw),
    decisions,
    evidence: createEvidence(raw),
    timeline: raw.timeline,
    learning: createLearning(metrics),
    recommendations: decisions.map((decision) => decision.recommendation),
    raw
  };
}

function parseArgs(argv) {
  const options = { mode: "pc3-ready-happy-path" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (COORDINATION_INTEGRATION_MODES.map((mode) => `--${mode}`).includes(arg)) {
      options.mode = arg.slice(2);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--timeline") {
      options.timeline = true;
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }
  return options;
}

function printTimeline(result) {
  console.log("Línea de tiempo Integración de sincronización y coordinación");
  result.timeline.forEach((entry) => console.log(`- ${entry.label}: ${entry.time} ${entry.detail}`));
}

function printReport(report) {
  console.log(`Laboratorio integrador de sincronización y coordinación: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Evidencia integradora");
  console.log(`- Integración: ${report.evidence.integrationId}`);
  console.log(`- Decisión: ${report.evidence.decision}`);
  console.log(`- Confianza: ${report.evidence.confidence}`);
  console.log(`- Lease vigente: ${report.evidence.lease.validAtAction ? "sí" : "no"}`);
  console.log(`- Líder sospechado: ${report.evidence.failureSuspicion.suspected ? "sí" : "no"}`);
  console.log(`- Compensación: ${report.evidence.compensation.applied ? report.evidence.compensation.action : "no aplicada"}`);
  console.log(`- Alcance: ${report.evidence.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createCoordinationIntegrationLabResult(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.timeline) {
    printTimeline(result);
    return;
  }
  printReport(result);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  ACTORS,
  BOUNDARY,
  CLOCK_TOLERANCE_MS,
  COORDINATION_INTEGRATION_MODES,
  FAILURE_TIMEOUT_MS,
  INTEGRATION_ID,
  LEASE_TTL_MS,
  createCoordinationIntegrationLabResult,
  createFailureSuspicion,
  createLease,
  parseArgs,
  runCoordinationIntegrationLab,
  simulateCausalConflictReview,
  simulatePc3ReadyHappyPath,
  simulateSuspectedLeaderCompensation
};

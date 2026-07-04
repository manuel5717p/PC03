#!/usr/bin/env node

const DISTRIBUTED_COORDINATION_MODES = ["coordinated-dispatch-handoff", "expired-lease-prevention", "degraded-compensation"];
const COORDINATION_ID = "aura-real-dispatch-coordination";
const LEASE_TTL_MS = 120;
const FAILURE_TIMEOUT_MS = 140;

const ACTORS = {
  leader: "monitor-telemetria",
  fleet: "gestor-flota",
  logistics: "centro-logistica"
};

function createTimelineEvent(id, label, atMs, decision, detail, extra = {}) {
  return { id, label, time: `t=${atMs}ms`, atMs, decision, detail, ...extra };
}

function createLease(owner, acquiredAt, fencingToken) {
  return {
    resourceId: "dispatch-window:order-028",
    owner,
    acquiredAt,
    leaseDeadline: acquiredAt + LEASE_TTL_MS,
    ttlMs: LEASE_TTL_MS,
    fencingToken
  };
}

function createCausalEvidence(eventId, actor, logicalClock, dependsOn = []) {
  return { eventId, actor, logicalClock, dependsOn };
}

function simulateCoordinatedDispatchHandoff() {
  const lease = createLease(ACTORS.leader, 1000, 88);
  const handoffAt = 1080;
  const causalEvidence = [
    createCausalEvidence("order-ready", ACTORS.logistics, 7),
    createCausalEvidence("leader-dispatch-grant", ACTORS.leader, 8, ["order-ready"]),
    createCausalEvidence("fleet-handoff-accepted", ACTORS.fleet, 9, ["leader-dispatch-grant"])
  ];

  return {
    mode: "coordinated-dispatch-handoff",
    description: "El líder coordina un despacho de AURA usando evidencia causal y un lease vigente antes de entregar el control operativo.",
    lease,
    leader: ACTORS.leader,
    finalCoordinator: ACTORS.fleet,
    causalEvidence,
    suspicion: null,
    compensation: null,
    action: { actor: ACTORS.fleet, atMs: handoffAt, accepted: handoffAt < lease.leaseDeadline, reason: "causal-evidence-and-valid-lease" },
    timeline: [
      createTimelineEvent("order-ready", "centro-logistica declara orden lista", 995, "causal-fact-recorded", "Lamport=7 crea evidencia de precondición", causalEvidence[0]),
      createTimelineEvent("lease-acquired", "monitor-telemetria toma lease de despacho", lease.acquiredAt, "lease-valid", `deadline=${lease.leaseDeadline}ms`, lease),
      createTimelineEvent("dispatch-grant", "líder autoriza handoff", 1040, "leader-coordinates", "grant depende de order-ready y lease vigente", causalEvidence[1]),
      createTimelineEvent("handoff", "gestor-flota acepta despacho", handoffAt, "handoff-accepted", "acción antes del leaseDeadline con evidencia causal", { finalCoordinator: ACTORS.fleet })
    ],
    interpretation: "La coordinación aplicada combina tiempo, causalidad, lease y líder; no decide consenso global, solo una acción defendible para este escenario."
  };
}

function simulateExpiredLeasePrevention() {
  const lease = createLease(ACTORS.leader, 2000, 91);
  const staleActionAt = 2130;
  const causalEvidence = [
    createCausalEvidence("route-approved", ACTORS.logistics, 11),
    createCausalEvidence("stale-dispatch-command", ACTORS.leader, 12, ["route-approved"])
  ];

  return {
    mode: "expired-lease-prevention",
    description: "Una orden causalmente válida se bloquea porque el lease expiró antes de actuar; la evidencia causal no reemplaza el ownership temporal.",
    lease,
    leader: ACTORS.leader,
    finalCoordinator: ACTORS.leader,
    causalEvidence,
    suspicion: null,
    compensation: null,
    action: { actor: ACTORS.leader, atMs: staleActionAt, accepted: false, reason: "lease-expired-before-action" },
    timeline: [
      createTimelineEvent("lease-acquired", "monitor-telemetria adquiere lease", lease.acquiredAt, "lease-valid", `deadline=${lease.leaseDeadline}ms`, lease),
      createTimelineEvent("route-approved", "centro-logistica aprueba ruta", 2050, "causal-fact-recorded", "la ruta existe antes del comando", causalEvidence[0]),
      createTimelineEvent("lease-expired", "vence el lease de despacho", lease.leaseDeadline, "lease-expired", "el líder pierde ownership temporal"),
      createTimelineEvent("stale-command", "comando tardío se rechaza", staleActionAt, "stale-action-prevented", "Lamport ayuda a ordenar, pero no revive un lease vencido", { action: "dispatch", accepted: false })
    ],
    interpretation: "El límite práctico importa: una decisión causalmente explicable sigue siendo insegura si llega después del leaseDeadline."
  };
}

function simulateDegradedCompensation() {
  const lease = createLease(ACTORS.leader, 3000, 101);
  const lastHeartbeatAt = 3040;
  const checkedAt = 3185;
  const silenceMs = checkedAt - lastHeartbeatAt;
  const suspicion = {
    observer: ACTORS.fleet,
    subject: ACTORS.leader,
    lastHeartbeatAt,
    checkedAt,
    silenceMs,
    timeoutMs: FAILURE_TIMEOUT_MS,
    suspected: silenceMs >= FAILURE_TIMEOUT_MS,
    reason: "leader-silent-during-dispatch"
  };
  const compensation = {
    action: "pause-dispatch-and-requeue-order",
    actor: ACTORS.logistics,
    atMs: 3190,
    reason: "leader-suspected-after-lease-expiry",
    userImpact: "dispatch-delayed-not-duplicated"
  };

  return {
    mode: "degraded-compensation",
    description: "El líder queda sospechado durante el despacho; AURA degrada el flujo, compensa y evita duplicar acciones mientras conserva evidencia.",
    lease,
    leader: ACTORS.leader,
    finalCoordinator: ACTORS.logistics,
    causalEvidence: [
      createCausalEvidence("dispatch-started", ACTORS.leader, 15),
      createCausalEvidence("fleet-no-ack", ACTORS.fleet, 16, ["dispatch-started"]),
      createCausalEvidence("compensation-recorded", ACTORS.logistics, 17, ["fleet-no-ack"])
    ],
    suspicion,
    compensation,
    action: { actor: ACTORS.logistics, atMs: compensation.atMs, accepted: true, reason: "compensating-action-after-suspicion" },
    timeline: [
      createTimelineEvent("lease-acquired", "monitor-telemetria inicia coordinación", lease.acquiredAt, "lease-valid", `deadline=${lease.leaseDeadline}ms`, lease),
      createTimelineEvent("last-heartbeat", "último heartbeat observado", lastHeartbeatAt, "heartbeat-accepted", "todavía no hay sospecha", { from: ACTORS.leader, to: ACTORS.fleet }),
      createTimelineEvent("leader-suspected", "gestor-flota sospecha al líder", checkedAt, "leader-suspected", `silence=${silenceMs}ms >= timeout=${FAILURE_TIMEOUT_MS}ms`, suspicion),
      createTimelineEvent("compensation", "centro-logistica registra compensación", compensation.atMs, "compensation-applied", "se pausa despacho y se reencola sin duplicar misión", compensation)
    ],
    interpretation: "Cuando la coordinación se degrada, la salida defendible no es failover mágico: es compensar, preservar causalidad y explicar qué no se duplicó."
  };
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function runDistributedCoordinationLab(options = {}) {
  const mode = options.mode ?? "coordinated-dispatch-handoff";
  if (mode === "coordinated-dispatch-handoff") return simulateCoordinatedDispatchHandoff();
  if (mode === "expired-lease-prevention") return simulateExpiredLeasePrevention();
  if (mode === "degraded-compensation") return simulateDegradedCompensation();

  throw new Error(`distributed coordination mode '${mode}' is not supported. Use one of: ${DISTRIBUTED_COORDINATION_MODES.join(", ")}`);
}

function createMetrics(raw) {
  const actionWithinLease = raw.action.atMs < raw.lease.leaseDeadline;
  return {
    leaseTtlMs: raw.lease.ttlMs,
    leaseDeadline: raw.lease.leaseDeadline,
    actionAtMs: raw.action.atMs,
    actionWithinLease,
    actionAccepted: raw.action.accepted,
    causalFacts: raw.causalEvidence.length,
    leaderSuspected: raw.suspicion?.suspected ?? false,
    suspicionSilenceMs: raw.suspicion?.silenceMs ?? null,
    compensationApplied: Boolean(raw.compensation),
    duplicateDispatchPrevented: raw.mode !== "coordinated-dispatch-handoff"
  };
}

function createEvidence(raw) {
  return {
    coordinationId: COORDINATION_ID,
    actors: ACTORS,
    leader: raw.leader,
    finalCoordinator: raw.finalCoordinator,
    resourceId: raw.lease.resourceId,
    lease: raw.lease,
    action: raw.action,
    causalEvidence: raw.causalEvidence,
    suspicion: raw.suspicion,
    compensation: raw.compensation,
    decisionModel: "time-plus-causal-evidence-plus-lease-plus-leader-plus-failure-suspicion",
    boundary: "Session 28 models applied coordination reasoning only; consensus, quorum, Raft/Paxos and production failover machinery are out of scope."
  };
}

function createObservations(raw) {
  if (raw.mode === "expired-lease-prevention") {
    return [
      "La evidencia causal explica por qué se quería despachar, pero no autoriza actuar después del leaseDeadline.",
      "El rechazo de la acción tardía evita duplicar o ejecutar un comando con ownership vencido."
    ];
  }
  if (raw.mode === "degraded-compensation") {
    return [
      "La sospecha por timeout degrada la coordinación: se pausa el despacho y se registra compensación en vez de prometer failover productivo.",
      "La compensación conserva una historia causal defendible y evita duplicar la misión."
    ];
  }
  return [
    "El handoff se acepta porque el líder conserva lease vigente y la cadena causal contiene la precondición de orden lista.",
    "La coordinación aplicada combina conceptos previos sin requerir consenso ni quórum."
  ];
}

function createDecisions() {
  return [
    createDecision("combine-evidence", "Evidencia combinada", "no-decidir-con-una-sola-senal", "Combine tiempo, causalidad, lease vigente, líder y sospecha antes de aceptar una acción coordinada."),
    createDecision("lease-boundary", "Lease como límite operativo", "causalidad-no-revive-ttl", "Rechace acciones causalmente explicables si ocurren después del leaseDeadline."),
    createDecision("degraded-compensation", "Compensación degradada", "pausar-y-reencolar", "Ante sospecha del líder, preserve evidencia y compense antes de duplicar acciones."),
    createDecision("no-consensus-claim", "Límite académico", "coordinacion-no-consenso", "Explique que el laboratorio razona coordinación aplicada, no consenso, quórum ni failover productivo.")
  ];
}

function createLearning(metrics) {
  return {
    objective: "Integrar tiempo, causalidad, leases, líder y sospechas de falla para defender una decisión coordinada de AURA en un escenario realista.",
    keyMetrics: [
      { label: "Lease TTL", value: metrics.leaseTtlMs, unit: "ms", meaning: "Ventana temporal máxima para defender ownership sobre el despacho." },
      { label: "Action within lease", value: metrics.actionWithinLease, unit: "boolean", meaning: "Indica si la acción ocurrió antes del deadline del lease." },
      { label: "Causal facts", value: metrics.causalFacts, unit: "facts", meaning: "Cantidad de hechos causales usados para explicar la decisión." },
      { label: "Leader suspected", value: metrics.leaderSuspected, unit: "boolean", meaning: "Señal de degradación por detector de fallas simulado." },
      { label: "Compensation applied", value: metrics.compensationApplied, unit: "boolean", meaning: "Indica si el flujo se pausó/reencoló para evitar duplicación." }
    ],
    checklist: [
      "Identifique la precondición causal que habilita o bloquea el despacho.",
      "Compare actionAtMs contra leaseDeadline antes de aceptar la acción.",
      "Revise si existe sospecha de líder y qué evidencia temporal la sostiene.",
      "Explique la compensación aplicada cuando la coordinación se degrada.",
      "Defienda por qué el modo no implementa consenso, quórum, Raft/Paxos ni failover productivo."
    ],
    takeaway: "Coordinar en sistemas distribuidos no es encontrar una verdad global: es tomar una decisión limitada, explicable y reversible con la evidencia disponible."
  };
}

function createDistributedCoordinationLabResult(options = {}) {
  const raw = runDistributedCoordinationLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions();
  return {
    labId: "distributed-coordination",
    session: 28,
    mode: raw.mode,
    title: "Sesión 28: Coordinación distribuida en escenarios reales",
    summary: raw.interpretation,
    inputs: { mode: raw.mode, coordinationId: COORDINATION_ID, leaseTtlMs: LEASE_TTL_MS, failureTimeoutMs: FAILURE_TIMEOUT_MS },
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
  const options = { mode: "coordinated-dispatch-handoff" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (DISTRIBUTED_COORDINATION_MODES.map((mode) => `--${mode}`).includes(arg)) {
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
  console.log("Línea de tiempo Coordinación distribuida");
  result.timeline.forEach((entry) => console.log(`- ${entry.label}: ${entry.time} ${entry.detail}`));
}

function printReport(report) {
  console.log(`Laboratorio de Coordinación distribuida: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Evidencia de coordinación");
  console.log(`- Coordinación: ${report.evidence.coordinationId}`);
  console.log(`- Líder: ${report.evidence.leader}`);
  console.log(`- Coordinador final: ${report.evidence.finalCoordinator}`);
  console.log(`- Acción aceptada: ${report.evidence.action.accepted ? "sí" : "no"}`);
  console.log(`- Modelo: ${report.evidence.decisionModel}`);
  console.log(`- Alcance: ${report.evidence.boundary}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createDistributedCoordinationLabResult(options);
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
};

#!/usr/bin/env node

const LEADER_ELECTION_MODES = ["stable-leader-heartbeats", "leader-failure-and-reelection", "false-suspicion-timeout", "leader-recovery-rejoin"];
const CLUSTER_ID = "aura-coordination-ring";
const HEARTBEAT_INTERVAL_MS = 50;
const FAILURE_TIMEOUT_MS = 120;

const NODES = [
  { nodeId: "monitor-telemetria", priority: 3 },
  { nodeId: "gestor-flota", priority: 2 },
  { nodeId: "centro-logistica", priority: 1 }
];

function createTimelineEvent(id, label, atMs, decision, detail, extra = {}) {
  return { id, label, time: `t=${atMs}ms`, atMs, decision, detail, ...extra };
}

function selectLeader(candidates, suspectedNodeIds = []) {
  return [...candidates]
    .filter((candidate) => !suspectedNodeIds.includes(candidate.nodeId))
    .sort((left, right) => right.priority - left.priority || left.nodeId.localeCompare(right.nodeId))[0];
}

function createHeartbeat(from, to, sentAt, receivedAt = sentAt + 8) {
  return { from, to, sentAt, receivedAt, delayMs: receivedAt - sentAt };
}

function createSuspicion({ observer, subject, lastHeartbeatAt, checkedAt, timeoutMs = FAILURE_TIMEOUT_MS, confirmed = true, reason }) {
  const silenceMs = checkedAt - lastHeartbeatAt;
  return {
    observer,
    subject,
    timestampBasis: "observer-received-at",
    lastHeartbeatAt,
    checkedAt,
    silenceMs,
    timeoutMs,
    suspected: silenceMs >= timeoutMs,
    confirmed,
    reason
  };
}

function simulateStableLeaderHeartbeats() {
  const leader = selectLeader(NODES);
  const heartbeats = [
    createHeartbeat(leader.nodeId, "gestor-flota", 1000, 1008),
    createHeartbeat(leader.nodeId, "centro-logistica", 1050, 1057),
    createHeartbeat(leader.nodeId, "gestor-flota", 1100, 1109)
  ];

  return {
    mode: "stable-leader-heartbeats",
    description: "Un líder estable mantiene heartbeats dentro del timeout y no dispara elección nueva.",
    initialLeader: leader.nodeId,
    finalLeader: leader.nodeId,
    heartbeats,
    suspicions: [],
    elections: [{ round: 1, startedAt: 990, candidates: NODES.map((node) => node.nodeId), electedLeader: leader.nodeId, reason: "highest-priority-healthy-node" }],
    recoveredNode: null,
    timeline: [
      createTimelineEvent("initial-election", "elección inicial determinística", 990, "leader-elected", `${leader.nodeId} tiene mayor prioridad`, { leader: leader.nodeId }),
      createTimelineEvent("heartbeat-1", `${leader.nodeId} envía heartbeat`, 1008, "heartbeat-accepted", "delay=8ms dentro del intervalo esperado", heartbeats[0]),
      createTimelineEvent("heartbeat-2", `${leader.nodeId} mantiene liderazgo`, 1057, "heartbeat-accepted", "sin sospechas acumuladas", heartbeats[1]),
      createTimelineEvent("no-election", "no se inicia reelección", 1120, "leader-stable", "ningún follower supera failureTimeoutMs")
    ],
    interpretation: "La elección de líder no es consenso: en esta simulación determinística basta comparar candidatos sanos y sostener evidencia con heartbeats oportunos."
  };
}

function simulateLeaderFailureAndReelection() {
  const initialLeader = selectLeader(NODES);
  const lastHeartbeat = createHeartbeat(initialLeader.nodeId, "gestor-flota", 2000, 2007);
  const checkedAt = 2127;
  const suspicion = createSuspicion({
    observer: "gestor-flota",
    subject: initialLeader.nodeId,
    lastHeartbeatAt: lastHeartbeat.receivedAt,
    checkedAt,
    confirmed: true,
    reason: "heartbeat-timeout-after-leader-stop"
  });
  const nextLeader = selectLeader(NODES, [initialLeader.nodeId]);

  return {
    mode: "leader-failure-and-reelection",
    description: "El líder deja de emitir heartbeats, un follower lo sospecha por timeout y se elige un nuevo coordinador.",
    initialLeader: initialLeader.nodeId,
    finalLeader: nextLeader.nodeId,
    heartbeats: [lastHeartbeat],
    suspicions: [suspicion],
    elections: [
      { round: 1, startedAt: 1990, candidates: NODES.map((node) => node.nodeId), electedLeader: initialLeader.nodeId, reason: "highest-priority-healthy-node" },
      { round: 2, startedAt: 2130, candidates: NODES.filter((node) => node.nodeId !== initialLeader.nodeId).map((node) => node.nodeId), electedLeader: nextLeader.nodeId, reason: "suspected-leader-excluded" }
    ],
    recoveredNode: null,
    timeline: [
      createTimelineEvent("leader-heartbeat", `${initialLeader.nodeId} emite último heartbeat`, lastHeartbeat.receivedAt, "heartbeat-accepted", "última señal recibida por el observador antes de la falla", lastHeartbeat),
      createTimelineEvent("timeout", `${suspicion.observer} sospecha al líder`, checkedAt, "leader-suspected", `silence=${suspicion.silenceMs}ms >= timeout=${suspicion.timeoutMs}ms`, suspicion),
      createTimelineEvent("reelection", `${nextLeader.nodeId} queda como líder`, 2130, "leader-reelected", "se excluye el líder sospechado", { leader: nextLeader.nodeId }),
      createTimelineEvent("new-heartbeat", `${nextLeader.nodeId} confirma liderazgo`, 2180, "heartbeat-accepted", "nuevo líder emite heartbeat determinístico")
    ],
    interpretation: "Un detector de fallas imperfecto produce sospechas; la reelección usa esa evidencia para recuperar coordinación sin prometer consenso ni failover productivo."
  };
}

function simulateFalseSuspicionTimeout() {
  const leader = selectLeader(NODES);
  const previousHeartbeat = createHeartbeat(leader.nodeId, "centro-logistica", 2992, 3000);
  const delayedHeartbeat = createHeartbeat(leader.nodeId, "centro-logistica", 3050, 3125);
  const suspicion = createSuspicion({
    observer: "centro-logistica",
    subject: leader.nodeId,
    lastHeartbeatAt: previousHeartbeat.receivedAt,
    checkedAt: 3121,
    confirmed: false,
    reason: "heartbeat-delayed-but-leader-alive"
  });

  return {
    mode: "false-suspicion-timeout",
    description: "Un heartbeat se retrasa más que el timeout y genera una sospecha falsa antes de llegar la evidencia tardía.",
    initialLeader: leader.nodeId,
    finalLeader: leader.nodeId,
    heartbeats: [previousHeartbeat, delayedHeartbeat],
    suspicions: [suspicion],
    elections: [{ round: 1, startedAt: 2990, candidates: NODES.map((node) => node.nodeId), electedLeader: leader.nodeId, reason: "highest-priority-healthy-node" }],
    recoveredNode: null,
    timeline: [
      createTimelineEvent("heartbeat-sent", `${leader.nodeId} envía heartbeat`, delayedHeartbeat.sentAt, "heartbeat-sent", "la red educativa demora la entrega", delayedHeartbeat),
      createTimelineEvent("false-suspicion", `${suspicion.observer} sospecha por timeout`, suspicion.checkedAt, "false-suspicion", `silence=${suspicion.silenceMs}ms`, suspicion),
      createTimelineEvent("delayed-heartbeat", "heartbeat tardío llega", delayedHeartbeat.receivedAt, "suspicion-cleared", "la sospecha era falsa; el líder seguía vivo", delayedHeartbeat),
      createTimelineEvent("no-leader-change", "se evita cambio definitivo", 3130, "leader-preserved", "la evidencia tardía limpia la sospecha")
    ],
    interpretation: "Un timeout bajo mejora detección rápida pero aumenta falsos positivos; el laboratorio muestra el tradeoff sin implementar detectores productivos adaptativos."
  };
}

function simulateLeaderRecoveryRejoin() {
  const originalLeader = selectLeader(NODES);
  const interimLeader = selectLeader(NODES, [originalLeader.nodeId]);
  const lastOriginalLeaderHeartbeat = createHeartbeat(originalLeader.nodeId, "gestor-flota", 3992, 4000);
  const recoveryAt = 4200;
  const suspicion = createSuspicion({
    observer: "gestor-flota",
    subject: originalLeader.nodeId,
    lastHeartbeatAt: lastOriginalLeaderHeartbeat.receivedAt,
    checkedAt: 4125,
    confirmed: true,
    reason: "leader-missed-timeout-before-recovery"
  });

  return {
    mode: "leader-recovery-rejoin",
    description: "El líder original vuelve después de una reelección, se reincorpora como follower y no desplaza al líder actual.",
    initialLeader: originalLeader.nodeId,
    finalLeader: interimLeader.nodeId,
    heartbeats: [
      lastOriginalLeaderHeartbeat,
      createHeartbeat(interimLeader.nodeId, originalLeader.nodeId, 4210, 4218),
      createHeartbeat(interimLeader.nodeId, "centro-logistica", 4260, 4267)
    ],
    suspicions: [suspicion],
    elections: [
      { round: 1, startedAt: 3990, candidates: NODES.map((node) => node.nodeId), electedLeader: originalLeader.nodeId, reason: "highest-priority-healthy-node" },
      { round: 2, startedAt: 4130, candidates: NODES.filter((node) => node.nodeId !== originalLeader.nodeId).map((node) => node.nodeId), electedLeader: interimLeader.nodeId, reason: "suspected-leader-excluded" }
    ],
    recoveredNode: { nodeId: originalLeader.nodeId, recoveredAt: recoveryAt, roleAfterRecovery: "follower", reason: "avoid-leader-thrashing" },
    timeline: [
      createTimelineEvent("leader-heartbeat", `${originalLeader.nodeId} emite último heartbeat`, lastOriginalLeaderHeartbeat.receivedAt, "heartbeat-accepted", "última señal recibida por el observador antes de la recuperación", lastOriginalLeaderHeartbeat),
      createTimelineEvent("leader-timeout", `${originalLeader.nodeId} es sospechado`, suspicion.checkedAt, "leader-suspected", `silence=${suspicion.silenceMs}ms >= timeout=${suspicion.timeoutMs}ms`, suspicion),
      createTimelineEvent("interim-leader", `${interimLeader.nodeId} queda líder`, 4130, "leader-reelected", "nuevo líder estable", { leader: interimLeader.nodeId }),
      createTimelineEvent("recovery", `${originalLeader.nodeId} vuelve`, recoveryAt, "node-recovered", "se reincorpora como follower para evitar thrashing"),
      createTimelineEvent("rejoin-heartbeat", `${interimLeader.nodeId} confirma liderazgo vigente`, 4218, "rejoin-accepted", "el nodo recuperado acepta al líder actual")
    ],
    interpretation: "La recuperación no debe provocar un salto automático de líder: reincorporar como follower reduce thrashing y mantiene una historia defendible de liderazgo."
  };
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function runLeaderElectionLab(options = {}) {
  const mode = options.mode ?? "stable-leader-heartbeats";
  if (mode === "stable-leader-heartbeats") return simulateStableLeaderHeartbeats();
  if (mode === "leader-failure-and-reelection") return simulateLeaderFailureAndReelection();
  if (mode === "false-suspicion-timeout") return simulateFalseSuspicionTimeout();
  if (mode === "leader-recovery-rejoin") return simulateLeaderRecoveryRejoin();

  throw new Error(`leader election mode '${mode}' is not supported. Use one of: ${LEADER_ELECTION_MODES.join(", ")}`);
}

function createMetrics(raw) {
  const confirmedSuspicions = raw.suspicions.filter((suspicion) => suspicion.suspected && suspicion.confirmed).length;
  const falseSuspicions = raw.suspicions.filter((suspicion) => suspicion.suspected && !suspicion.confirmed).length;
  const lastInitialHeartbeat = raw.heartbeats.find((heartbeat) => heartbeat.from === raw.initialLeader)?.receivedAt ?? null;
  const reelection = raw.elections.find((election) => election.round === 2);

  return {
    clusterSize: NODES.length,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    failureTimeoutMs: FAILURE_TIMEOUT_MS,
    leaderChanges: raw.initialLeader === raw.finalLeader ? 0 : 1,
    suspicionCount: raw.suspicions.length,
    confirmedSuspicions,
    falseSuspicions,
    electionRounds: raw.elections.length,
    failoverMs: reelection && lastInitialHeartbeat !== null ? reelection.startedAt - lastInitialHeartbeat : null,
    recoveryObserved: Boolean(raw.recoveredNode)
  };
}

function createEvidence(raw) {
  return {
    clusterId: CLUSTER_ID,
    detectorType: "heartbeat-timeout-simulated",
    nodes: NODES,
    initialLeader: raw.initialLeader,
    finalLeader: raw.finalLeader,
    suspectedNodes: raw.suspicions.filter((suspicion) => suspicion.suspected).map((suspicion) => suspicion.subject),
    falseSuspicionSubjects: raw.suspicions.filter((suspicion) => suspicion.suspected && !suspicion.confirmed).map((suspicion) => suspicion.subject),
    recoveredNode: raw.recoveredNode,
    timeoutPolicy: { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, failureTimeoutMs: FAILURE_TIMEOUT_MS },
    electionRule: "highest-priority-healthy-node-deterministic",
    scopeWarning: "Session 27 models leader election and failure detector evidence only; consensus, quorum, production membership, failover and fencing/lock redesign are out of scope."
  };
}

function createObservations(raw) {
  if (raw.mode === "leader-failure-and-reelection") {
    return [
      "La ausencia de heartbeats por encima del timeout convierte al líder en sospechoso para el detector.",
      "La reelección recupera coordinación excluyendo al nodo sospechado, pero no prueba consenso global."
    ];
  }
  if (raw.mode === "false-suspicion-timeout") {
    return [
      "Un timeout agresivo puede sospechar a un líder vivo cuando el heartbeat llega tarde.",
      "El detector de fallas es imperfecto: rapidez y falsos positivos deben discutirse juntos."
    ];
  }
  if (raw.mode === "leader-recovery-rejoin") {
    return [
      "Un nodo recuperado no debe desplazar automáticamente al líder vigente si se quiere evitar thrashing.",
      "La reincorporación como follower conserva estabilidad después de la reelección."
    ];
  }
  return [
    "El líder estable se sostiene con heartbeats observables dentro del failureTimeoutMs.",
    "La regla de elección es determinística y educativa; no implementa quórum ni consenso."
  ];
}

function createDecisions() {
  return [
    createDecision("heartbeat-evidence", "Heartbeats como evidencia", "medir-silencio-antes-de-sospechar", "Registre último heartbeat, observador, sujeto y timeout antes de afirmar que un líder falló."),
    createDecision("detector-imperfect", "Detector de fallas imperfecto", "sospecha-no-es-prueba", "Explique los falsos positivos cuando el timeout es menor que la demora observada."),
    createDecision("deterministic-election", "Elección determinística", "prioridad-sobre-candidatos-sanos", "Use una regla estable para el laboratorio y no la confunda con consenso distribuido."),
    createDecision("rejoin-as-follower", "Reincorporación controlada", "recuperado-vuelve-como-follower", "Evite que un nodo recuperado provoque cambios de líder innecesarios.")
  ];
}

function createLearning(metrics) {
  return {
    objective: "Explicar cómo se elige un líder educativo usando heartbeats y sospechas determinísticas, y por qué un detector de fallas puede equivocarse.",
    keyMetrics: [
      { label: "Heartbeat interval", value: metrics.heartbeatIntervalMs, unit: "ms", meaning: "Frecuencia esperada de señales del líder hacia followers." },
      { label: "Failure timeout", value: metrics.failureTimeoutMs, unit: "ms", meaning: "Silencio máximo antes de declarar sospecha en la simulación." },
      { label: "Leader changes", value: metrics.leaderChanges, unit: "count", meaning: "Cantidad de cambios de líder observados en el modo." },
      { label: "False suspicions", value: metrics.falseSuspicions, unit: "count", meaning: "Sospechas generadas contra un líder que seguía vivo." },
      { label: "Failover", value: metrics.failoverMs, unit: "ms", meaning: "Tiempo simulado entre el último heartbeat del líder original y el inicio de reelección." }
    ],
    checklist: [
      "Identifique líder inicial, líder final y regla de elección.",
      "Compare silencio observado contra failureTimeoutMs.",
      "Diferencie sospecha confirmada de sospecha falsa.",
      "Explique por qué recuperación no implica recuperar liderazgo automáticamente.",
      "Defienda que esta sesión no implementa consenso, quórum ni membresía productiva."
    ],
    takeaway: "Elegir líder bajo fallas parciales exige evidencia temporal, tolerar sospechas imperfectas y evitar confundir coordinación educativa con consenso distribuido."
  };
}

function createLeaderElectionLabResult(options = {}) {
  const raw = runLeaderElectionLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions(raw);
  return {
    labId: "leader-election",
    session: 27,
    mode: raw.mode,
    title: "Sesión 27: Elección de líder y detectores de fallas",
    summary: raw.interpretation,
    inputs: { mode: raw.mode, clusterId: CLUSTER_ID, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, failureTimeoutMs: FAILURE_TIMEOUT_MS },
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
  const options = { mode: "stable-leader-heartbeats" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (LEADER_ELECTION_MODES.map((mode) => `--${mode}`).includes(arg)) {
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
  console.log("Línea de tiempo Elección de líder");
  result.timeline.forEach((entry) => console.log(`- ${entry.label}: ${entry.time} ${entry.detail}`));
}

function printReport(report) {
  console.log(`Laboratorio de Elección de líder: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Evidencia de liderazgo");
  console.log(`- Cluster: ${report.evidence.clusterId}`);
  console.log(`- Líder inicial: ${report.evidence.initialLeader}`);
  console.log(`- Líder final: ${report.evidence.finalLeader}`);
  console.log(`- Detector: ${report.evidence.detectorType}`);
  console.log(`- Timeout: ${report.evidence.timeoutPolicy.failureTimeoutMs}ms`);
  console.log(`- Sospechados: ${report.evidence.suspectedNodes.length ? report.evidence.suspectedNodes.join(", ") : "ninguno"}`);
  console.log(`- Alcance: ${report.evidence.scopeWarning}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createLeaderElectionLabResult(options);
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
  FAILURE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
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
};

#!/usr/bin/env node

const MUTUAL_EXCLUSION_MODES = ["contended-queue", "fairness-rounds", "critical-section-safety", "delay-and-reorder"];
const MUTEX_NODES = ["centro-logistica", "gestor-flota", "monitor-telemetria"];
const RESOURCE_ID = "aura-dispatch-window";
const GRANT_AUTHORITY = "arbitraje-deterministico-simplificado";

function compareRequests(left, right) {
  if (left.logicalTimestamp !== right.logicalTimestamp) {
    return left.logicalTimestamp - right.logicalTimestamp;
  }

  return left.nodeId.localeCompare(right.nodeId);
}

function createRequest(nodeId, logicalTimestamp, round = 1) {
  return {
    id: `${nodeId}-r${round}-t${String(logicalTimestamp).padStart(2, "0")}`,
    nodeId,
    round,
    resourceId: RESOURCE_ID,
    logicalTimestamp,
    status: "requested"
  };
}

function sortQueue(requests) {
  return [...requests].sort(compareRequests);
}

function createEntry(request, enterAtTick, durationTicks = 2) {
  return {
    requestId: request.id,
    nodeId: request.nodeId,
    round: request.round,
    resourceId: request.resourceId,
    enterAtTick,
    exitAtTick: enterAtTick + durationTicks,
    logicalTimestamp: request.logicalTimestamp
  };
}

function scheduleCriticalSection(requests, options = {}) {
  const durationTicks = options.durationTicks ?? 2;
  const gapTicks = options.gapTicks ?? 1;
  let cursor = options.startTick ?? 10;

  return sortQueue(requests).map((request) => {
    const entry = createEntry(request, cursor, durationTicks);
    cursor = entry.exitAtTick + gapTicks;
    return entry;
  });
}

function createLifecycle(requests, entries) {
  const entriesByRequest = new Map(entries.map((entry) => [entry.requestId, entry]));
  let previousReleaseTick = null;

  return sortQueue(requests).flatMap((request, index) => {
    const entry = entriesByRequest.get(request.id);
    const queuedBehind = index === 0 ? null : sortQueue(requests)[index - 1].id;
    const waitReason = queuedBehind
      ? `espera release de ${queuedBehind}`
      : "cabeza de cola: no espera pedidos anteriores";
    const grantReason = queuedBehind
      ? `release previo observado en tick=${previousReleaseTick}`
      : "primer request ordenado por la cola determinística";
    const events = [
      {
        id: `request-${request.id}`,
        requestId: request.id,
        nodeId: request.nodeId,
        resourceId: request.resourceId,
        stage: "request",
        decision: "request",
        label: `${request.nodeId} solicita ${request.resourceId}`,
        time: `L=${request.logicalTimestamp}`,
        detail: `round=${request.round}; posición de cola=${index + 1}`
      },
      {
        id: `wait-${request.id}`,
        requestId: request.id,
        nodeId: request.nodeId,
        resourceId: request.resourceId,
        stage: "wait/queued",
        decision: index === 0 ? "queued-head" : "wait-queued",
        label: queuedBehind ? `${request.nodeId} espera en cola` : `${request.nodeId} queda primero en cola`,
        time: `queue-position=${index + 1}`,
        detail: waitReason,
        queuedBehind
      },
      {
        id: `grant-${request.id}`,
        requestId: request.id,
        nodeId: request.nodeId,
        resourceId: request.resourceId,
        stage: "grant",
        decision: "grant",
        label: `${GRANT_AUTHORITY} concede entrada a ${request.nodeId}`,
        time: `tick=${entry.enterAtTick}`,
        detail: grantReason,
        grantedBy: GRANT_AUTHORITY
      },
      {
        id: `enter-${request.id}`,
        requestId: request.id,
        nodeId: request.nodeId,
        resourceId: request.resourceId,
        stage: "enter-critical-section",
        decision: "enter-critical-section",
        label: `${request.nodeId} entra a sección crítica`,
        time: `tick=${entry.enterAtTick}`,
        detail: `${request.resourceId}; request=${request.id}; requiere grant previo`
      },
      {
        id: `release-${request.id}`,
        requestId: request.id,
        nodeId: request.nodeId,
        resourceId: request.resourceId,
        stage: "release/exit",
        decision: "release",
        label: `${request.nodeId} libera ${request.resourceId}`,
        time: `tick=${entry.exitAtTick}`,
        detail: "sale de la sección crítica y habilita evaluar el siguiente request de la cola"
      }
    ];

    previousReleaseTick = entry.exitAtTick;
    return events;
  });
}

function findSafetyViolations(entries) {
  const violations = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const overlaps = left.enterAtTick < right.exitAtTick && right.enterAtTick < left.exitAtTick;
      if (left.resourceId === right.resourceId && overlaps) {
        violations.push({ left: left.requestId, right: right.requestId, resourceId: left.resourceId });
      }
    }
  }

  return violations;
}

function createTimeline(requests, entries, deliveries = []) {
  const lifecycleEvents = createLifecycle(requests, entries);
  const deliveryEvents = deliveries.map((delivery) => ({
    id: `deliver-${delivery.to}-${delivery.requestId}`,
    label: `${delivery.to} recibe ${delivery.requestId}`,
    nodeId: delivery.to,
    time: `delivery=${delivery.deliveryOrder}`,
    decision: delivery.reordered ? "reordered-delivery" : "delivery",
    detail: `request=${delivery.requestId}`
  }));
  return [...lifecycleEvents, ...deliveryEvents];
}

function simulateContendedQueue() {
  const requests = [
    createRequest("monitor-telemetria", 7),
    createRequest("centro-logistica", 5),
    createRequest("gestor-flota", 5)
  ];
  const queue = sortQueue(requests);
  const entries = scheduleCriticalSection(requests);

  return {
    mode: "contended-queue",
    description: "Tres nodos solicitan la ventana de despacho AURA; dos empatan en reloj lógico y se ordenan por nodeId.",
    requests,
    queue,
    entries,
    safetyViolations: findSafetyViolations(entries),
    interpretation: "La cola estable por timestamp lógico y nodeId permite decidir un orden total de entrada sin afirmar causalidad adicional."
  };
}

function simulateFairnessRounds() {
  const requests = [
    createRequest("gestor-flota", 10, 1),
    createRequest("centro-logistica", 11, 1),
    createRequest("monitor-telemetria", 12, 1),
    createRequest("centro-logistica", 20, 2),
    createRequest("gestor-flota", 21, 2),
    createRequest("monitor-telemetria", 22, 2)
  ];
  const entries = scheduleCriticalSection(requests, { startTick: 20, durationTicks: 1, gapTicks: 1 });
  const waitByNode = Object.fromEntries(MUTEX_NODES.map((nodeId) => [nodeId, 0]));
  entries.forEach((entry, index) => {
    waitByNode[entry.nodeId] += index;
  });

  return {
    mode: "fairness-rounds",
    description: "Rondas repetidas donde todos los nodos vuelven a pedir acceso al mismo recurso compartido.",
    requests,
    queue: sortQueue(requests),
    entries,
    waitByNode,
    maxTurnsWithoutEntry: 2,
    safetyViolations: findSafetyViolations(entries),
    interpretation: "Ningún nodo salta pedidos anteriores: la espera surge del orden de cola, no de prioridad permanente."
  };
}

function simulateCriticalSectionSafety() {
  const requests = [
    createRequest("centro-logistica", 30),
    createRequest("gestor-flota", 31),
    createRequest("monitor-telemetria", 32)
  ];
  const entries = scheduleCriticalSection(requests, { startTick: 30, durationTicks: 3, gapTicks: 0 });

  return {
    mode: "critical-section-safety",
    description: "Prueba explícita de seguridad: las ventanas de entrada y salida son contiguas, pero no se solapan.",
    requests,
    queue: sortQueue(requests),
    entries,
    safetyViolations: findSafetyViolations(entries),
    interpretation: "La propiedad mínima es safety: a lo sumo un nodo ocupa la sección crítica del recurso compartido a la vez."
  };
}

function simulateDelayAndReorder() {
  const requests = [
    createRequest("monitor-telemetria", 42),
    createRequest("centro-logistica", 40),
    createRequest("gestor-flota", 41)
  ];
  const deliveries = [
    { deliveryOrder: 1, to: "gestor-flota", requestId: requests[0].id, reordered: true },
    { deliveryOrder: 2, to: "monitor-telemetria", requestId: requests[2].id, reordered: true },
    { deliveryOrder: 3, to: "centro-logistica", requestId: requests[1].id, reordered: false },
    { deliveryOrder: 4, to: "gestor-flota", requestId: requests[1].id, reordered: true },
    { deliveryOrder: 5, to: "monitor-telemetria", requestId: requests[1].id, reordered: true }
  ];
  const entries = scheduleCriticalSection(requests, { startTick: 40, durationTicks: 2, gapTicks: 1 });

  return {
    mode: "delay-and-reorder",
    description: "La entrega de mensajes llega reordenada, pero el criterio de cola usa el timestamp lógico del request y el nodeId.",
    requests,
    deliveries,
    queue: sortQueue(requests),
    entries,
    safetyViolations: findSafetyViolations(entries),
    interpretation: "El orden de llegada no decide la sección crítica; cada nodo reconstruye el orden estable con la metadata lógica del pedido."
  };
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function createMetrics(raw) {
  const waits = raw.entries.map((entry) => entry.enterAtTick - raw.requests.find((request) => request.id === entry.requestId).logicalTimestamp);
  const lifecycle = createLifecycle(raw.requests, raw.entries);
  return {
    requestCount: raw.requests.length,
    criticalSectionEntries: raw.entries.length,
    lifecycleEvents: lifecycle.length,
    queuedWaits: lifecycle.filter((event) => event.decision === "wait-queued").length,
    grantsIssued: lifecycle.filter((event) => event.decision === "grant").length,
    releasesObserved: lifecycle.filter((event) => event.decision === "release").length,
    queueOrder: raw.queue.map((request) => request.nodeId).join(" -> "),
    safetyViolations: raw.safetyViolations.length,
    maxWaitTicks: Math.max(...waits),
    reorderedDeliveries: raw.deliveries?.filter((delivery) => delivery.reordered).length ?? 0
  };
}

function createEvidence(raw) {
  const lifecycle = createLifecycle(raw.requests, raw.entries);
  const grants = lifecycle.filter((event) => event.decision === "grant");
  const releases = lifecycle.filter((event) => event.decision === "release");
  const waits = lifecycle.filter((event) => event.decision === "wait-queued");
  return {
    resourceId: RESOURCE_ID,
    orderingRule: "logicalTimestamp asc, then nodeId asc",
    lifecycleModel: "request -> wait/queued -> grant -> enter-critical-section -> release/exit",
    grantAuthority: GRANT_AUTHORITY,
    queue: raw.queue.map((request, position) => ({ position: position + 1, requestId: request.id, nodeId: request.nodeId, logicalTimestamp: request.logicalTimestamp })),
    lifecycle,
    lifecycleAnswers: {
      whoWaits: waits.map((event) => ({ nodeId: event.nodeId, requestId: event.requestId, queuedBehind: event.queuedBehind })),
      whoGrants: GRANT_AUTHORITY,
      whenEnter: grants.map((grant) => ({ nodeId: grant.nodeId, requestId: grant.requestId, enterAtTick: raw.entries.find((entry) => entry.requestId === grant.requestId).enterAtTick })),
      releaseEnables: releases.map((release, index) => ({ nodeId: release.nodeId, requestId: release.requestId, nextRequestId: raw.queue[index + 1]?.id ?? null })),
      whySafetyHolds: "Cada enter requiere grant de la cabeza de cola y cada release ocurre antes de evaluar la siguiente entrada; por eso las ventanas no se solapan."
    },
    criticalSectionWindows: raw.entries.map((entry) => ({ requestId: entry.requestId, nodeId: entry.nodeId, enterAtTick: entry.enterAtTick, exitAtTick: entry.exitAtTick })),
    safetyHolds: raw.safetyViolations.length === 0,
    violations: raw.safetyViolations
  };
}

function createObservations(raw) {
  if (raw.mode === "delay-and-reorder") {
    return [
      "La entrega reordenada cambia cuándo se observa un request, pero no cambia el orden estable de la cola.",
      "La regla de desempate por nodeId hace reproducible la decisión cuando dos requests tienen el mismo timestamp lógico."
    ];
  }
  if (raw.mode === "fairness-rounds") {
    return [
      "La equidad se observa por rondas: todos los nodos obtienen entrada antes de repetir indefinidamente una prioridad fija.",
      "La espera se mide como posición en cola y no como duración de red real en este laboratorio determinístico."
    ];
  }
  if (raw.mode === "critical-section-safety") {
    return [
      "Las ventanas de sección crítica no se solapan para el mismo recurso compartido.",
      "Cada entrada ocurre después de un grant explícito y cada release habilita evaluar el siguiente request de la cola.",
      "El laboratorio prueba safety; no modela expiración, leases ni recuperación ante caída del dueño."
    ];
  }
  return [
    "Los requests concurrentes necesitan una cola estable para evitar decisiones distintas entre nodos.",
    "Los nodos que no están primeros esperan; el arbitraje determinístico concede grant solo a la cabeza de cola.",
    "Lamport timestamp más nodeId crea orden total de arbitraje sin convertirlo en causalidad física."
  ];
}

function createDecisions(raw) {
  return [
    createDecision("stable-request-order", "Orden estable de requests", "timestamp-logico-mas-nodeId", "Ordene siempre por logicalTimestamp y luego nodeId para que todos los nodos puedan reconstruir la misma cola."),
    createDecision("explicit-lifecycle", "Ciclo request-wait-grant-enter-release", "grant-antes-de-enter-release-antes-del-siguiente", "Defienda quién espera, quién concede, cuándo se entra y qué habilita cada release antes de hablar de tolerancia a fallas."),
    createDecision("single-resource-safety", "Seguridad de sección crítica", "sin-solapamiento", "Antes de optimizar disponibilidad, pruebe que no existen dos entradas simultáneas al mismo recurso."),
    createDecision("no-lease-yet", "Alcance de Sesión 25", "sin-leases-ni-expiracion", "No mezcle este laboratorio con leases, fencing o elección de líder; esos riesgos pertenecen a sesiones posteriores.")
  ];
}

function createLearning(raw, metrics) {
  return {
    objective: "Explicar cómo una cola distribuida determinística protege una sección crítica compartida de AURA.",
    keyMetrics: [
      { label: "Requests", value: metrics.requestCount, unit: "pedidos", meaning: "Cantidad de nodos/rondas que solicitan entrar al recurso compartido." },
      { label: "Grants", value: metrics.grantsIssued, unit: "concesiones", meaning: "Cantidad de entradas concedidas por el arbitraje determinístico simplificado." },
      { label: "Releases", value: metrics.releasesObserved, unit: "liberaciones", meaning: "Cantidad de salidas que habilitan evaluar el siguiente request de la cola." },
      { label: "Violaciones de safety", value: metrics.safetyViolations, unit: "violaciones", meaning: "Debe mantenerse en cero para defender exclusión mutua." },
      { label: "Entregas reordenadas", value: metrics.reorderedDeliveries, unit: "mensajes", meaning: "Mensajes recibidos fuera del orden de emisión en el escenario de demora." }
    ],
    checklist: [
      "Verifique que la cola está ordenada por logicalTimestamp y nodeId.",
      "Identifique qué requests esperan, cuál recibe grant y en qué tick entra a sección crítica.",
      "Explique qué siguiente request queda habilitado después de cada release.",
      "Revise que cada ventana de sección crítica termina antes de la siguiente entrada.",
      "Explique por qué este laboratorio no resuelve expiración de locks ni elección de líder."
    ],
    takeaway: "La exclusión mutua distribuida empieza por una propiedad simple pero obligatoria: nunca dos nodos dentro de la misma sección crítica al mismo tiempo."
  };
}

function runMutualExclusionLab(options = {}) {
  const mode = options.mode ?? "contended-queue";
  if (mode === "contended-queue") return simulateContendedQueue();
  if (mode === "fairness-rounds") return simulateFairnessRounds();
  if (mode === "critical-section-safety") return simulateCriticalSectionSafety();
  if (mode === "delay-and-reorder") return simulateDelayAndReorder();

  throw new Error(`mutual exclusion mode '${mode}' is not supported. Use one of: ${MUTUAL_EXCLUSION_MODES.join(", ")}`);
}

function createMutualExclusionLabResult(options = {}) {
  const raw = runMutualExclusionLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions(raw);
  return {
    labId: "mutual-exclusion",
    session: 25,
    mode: raw.mode,
    title: "Sesión 25: Exclusión mutua distribuida y sección crítica",
    summary: raw.interpretation,
    inputs: { mode: raw.mode, resourceId: RESOURCE_ID },
    metrics,
    observations: createObservations(raw),
    decisions,
    evidence: createEvidence(raw),
    timeline: createTimeline(raw.requests, raw.entries, raw.deliveries),
    learning: createLearning(raw, metrics),
    recommendations: decisions.map((decision) => decision.recommendation),
    raw
  };
}

function parseArgs(argv) {
  const options = { mode: "contended-queue" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (MUTUAL_EXCLUSION_MODES.map((mode) => `--${mode}`).includes(arg)) {
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
  console.log("Línea de tiempo Exclusión mutua");
  result.timeline.forEach((entry) => console.log(`- ${entry.label}: ${entry.time} ${entry.detail}`));
}

function printReport(report) {
  console.log(`Laboratorio de Exclusión mutua: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Métricas");
  Object.entries(report.metrics).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  console.log("Evidencia de sección crítica");
  console.log(`- Recurso: ${report.evidence.resourceId}`);
  console.log(`- Regla de orden: ${report.evidence.orderingRule}`);
  console.log(`- Ciclo: ${report.evidence.lifecycleModel}`);
  console.log(`- Concede: ${report.evidence.grantAuthority}`);
  console.log(`- Cola: ${report.evidence.queue.map((item) => `${item.position}:${item.nodeId}@${item.logicalTimestamp}`).join(" -> ")}`);
  console.log(`- Esperan: ${report.evidence.lifecycleAnswers.whoWaits.map((item) => `${item.nodeId} detrás de ${item.queuedBehind}`).join("; ") || "nadie antes del primer grant"}`);
  console.log(`- Safety holds: ${report.evidence.safetyHolds ? "sí" : "no"}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createMutualExclusionLabResult(options);
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
  MUTUAL_EXCLUSION_MODES,
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
};

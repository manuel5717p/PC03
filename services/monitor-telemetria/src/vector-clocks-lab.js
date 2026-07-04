#!/usr/bin/env node

const VECTOR_CLOCK_MODES = ["causal-chain", "concurrent-events", "merge-and-conflict"];
const VECTOR_NODES = ["centro-logistica", "gestor-flota", "monitor-telemetria"];

function cloneVector(vector) {
  return Object.fromEntries(Object.entries(vector).sort(([left], [right]) => left.localeCompare(right)));
}

function createVectorClock(nodes = VECTOR_NODES) {
  return Object.fromEntries(nodes.map((nodeId) => [nodeId, 0]));
}

function createVectorNode(nodeId, nodes = VECTOR_NODES) {
  return { nodeId, clock: createVectorClock(nodes) };
}

function increment(node) {
  node.clock[node.nodeId] += 1;
  return cloneVector(node.clock);
}

function mergeVectors(left, right) {
  const nodeIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  const merged = {};

  for (const nodeId of [...nodeIds].sort()) {
    merged[nodeId] = Math.max(left[nodeId] ?? 0, right[nodeId] ?? 0);
  }

  return merged;
}

function localEvent(node, label, dependsOn = []) {
  return createEvent(node, "local", label, increment(node), dependsOn);
}

function sendEvent(node, label, dependsOn = []) {
  const vector = increment(node);
  return {
    ...createEvent(node, "send", label, vector, dependsOn),
    messageVector: cloneVector(vector)
  };
}

function receiveEvent(node, message, label) {
  node.clock = mergeVectors(node.clock, message.messageVector);
  const vector = increment(node);

  return {
    ...createEvent(node, "receive", label, vector, [message.id]),
    receivedMessageVector: cloneVector(message.messageVector)
  };
}

function createEvent(node, type, label, vector, dependsOn = []) {
  return {
    id: `${node.nodeId}-${String(vector[node.nodeId]).padStart(2, "0")}`,
    nodeId: node.nodeId,
    label,
    type,
    vector: cloneVector(vector),
    happenedBefore: dependsOn
  };
}

function compareVectors(left, right) {
  const nodeIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftLess = false;
  let rightLess = false;

  for (const nodeId of nodeIds) {
    const leftValue = left[nodeId] ?? 0;
    const rightValue = right[nodeId] ?? 0;

    if (leftValue < rightValue) {
      leftLess = true;
    }
    if (rightValue < leftValue) {
      rightLess = true;
    }
  }

  if (!leftLess && !rightLess) {
    return "equal";
  }
  if (leftLess && !rightLess) {
    return "before";
  }
  if (rightLess && !leftLess) {
    return "after";
  }

  return "concurrent";
}

function createTimeline(events) {
  return events.map((event) => ({
    id: event.id,
    label: event.label,
    nodeId: event.nodeId,
    time: `VC=${JSON.stringify(event.vector)}`,
    decision: event.type,
    vector: event.vector,
    detail: event.happenedBefore.length ? `visible causally: ${event.happenedBefore.join(", ")}` : "sin dependencia causal visible"
  }));
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function formatVector(vector) {
  return JSON.stringify(cloneVector(vector));
}

function simulateCausalChain() {
  const logistics = createVectorNode("centro-logistica");
  const fleet = createVectorNode("gestor-flota");
  const telemetry = createVectorNode("monitor-telemetria");

  const orderCreated = localEvent(logistics, "OrderCreated local");
  const missionRequested = sendEvent(logistics, "MissionAssignmentRequested enviado", [orderCreated.id]);
  const missionAccepted = receiveEvent(fleet, missionRequested, "MissionAssignmentAccepted recibido");
  const trackingRequested = sendEvent(fleet, "TelemetryTrackingRequested enviado", [missionAccepted.id]);
  const trackingStarted = receiveEvent(telemetry, trackingRequested, "TelemetryTrackingStarted recibido");
  const events = [orderCreated, missionRequested, missionAccepted, trackingRequested, trackingStarted];

  return {
    mode: "causal-chain",
    description: "Cadena causal donde cada receive incorpora el vector observado antes de avanzar su componente local.",
    events,
    comparisons: [
      { left: orderCreated.id, right: missionRequested.id, relation: compareVectors(orderCreated.vector, missionRequested.vector) },
      { left: missionRequested.id, right: missionAccepted.id, relation: compareVectors(missionRequested.vector, missionAccepted.vector) },
      { left: missionAccepted.id, right: trackingStarted.id, relation: compareVectors(missionAccepted.vector, trackingStarted.vector) }
    ],
    interpretation: "Si VC(A) <= VC(B) y al menos un componente es menor, A ocurrió antes que B; aquí la cadena completa queda visible en los vectores."
  };
}

function simulateConcurrentEvents() {
  const fleet = createVectorNode("gestor-flota");
  const telemetry = createVectorNode("monitor-telemetria");
  const logistics = createVectorNode("centro-logistica");

  const heartbeat = localEvent(fleet, "DroneHeartbeat observado");
  const batterySample = localEvent(telemetry, "BatterySample observado");
  const orderAudit = localEvent(logistics, "OrderAuditSnapshot observado");
  const events = [heartbeat, batterySample, orderAudit];
  const concurrentPairs = [
    [heartbeat, batterySample],
    [heartbeat, orderAudit],
    [batterySample, orderAudit]
  ].map(([left, right]) => ({ left: left.id, right: right.id, relation: compareVectors(left.vector, right.vector) }));

  return {
    mode: "concurrent-events",
    description: "Eventos independientes con componentes distintos del vector, sin mensajes que propaguen conocimiento causal.",
    events,
    concurrentPairs,
    interpretation: "Los vectores son incomparables: cada evento sabe algo que el otro no vio, por eso la relación correcta es concurrente."
  };
}

function simulateMergeAndConflict() {
  const logistics = createVectorNode("centro-logistica");
  const fleet = createVectorNode("gestor-flota");
  const telemetry = createVectorNode("monitor-telemetria");

  const missionPolicyUpdated = sendEvent(logistics, "MissionPolicyUpdated enviado");
  const routeCapacityUpdated = sendEvent(fleet, "RouteCapacityUpdated enviado");
  const conflictRelation = compareVectors(missionPolicyUpdated.vector, routeCapacityUpdated.vector);
  const telemetrySeesPolicy = receiveEvent(telemetry, missionPolicyUpdated, "Monitor recibió política de misión");
  const telemetryMergedConflict = receiveEvent(telemetry, routeCapacityUpdated, "Monitor recibió capacidad de ruta");
  const mergedVector = mergeVectors(missionPolicyUpdated.vector, routeCapacityUpdated.vector);
  const events = [missionPolicyUpdated, routeCapacityUpdated, telemetrySeesPolicy, telemetryMergedConflict];

  return {
    mode: "merge-and-conflict",
    description: "Dos actualizaciones concurrentes se fusionan en el monitor; el vector resultante conserva visibilidad causal de ambas ramas.",
    events,
    conflict: {
      left: missionPolicyUpdated.id,
      right: routeCapacityUpdated.id,
      leftVector: cloneVector(missionPolicyUpdated.vector),
      rightVector: cloneVector(routeCapacityUpdated.vector),
      relation: conflictRelation,
      requiresResolution: conflictRelation === "concurrent",
      reason: "Las dos ramas modifican criterios operativos relacionados sin haber visto la actualización de la otra."
    },
    mergedVector,
    visibility: {
      policyVisible: compareVectors(missionPolicyUpdated.vector, telemetryMergedConflict.vector) === "before",
      capacityVisible: compareVectors(routeCapacityUpdated.vector, telemetryMergedConflict.vector) === "before",
      visibleAfterMerge: [missionPolicyUpdated.id, routeCapacityUpdated.id]
    },
    interpretation: "Mergear vectores no resuelve automáticamente el conflicto: solo demuestra qué actualizaciones ya son visibles para tomar una decisión explícita."
  };
}

function createEvidence(raw) {
  if (raw.mode !== "merge-and-conflict") {
    return null;
  }

  return {
    comparedVectors: {
      left: { eventId: raw.conflict.left, vector: raw.conflict.leftVector },
      right: { eventId: raw.conflict.right, vector: raw.conflict.rightVector }
    },
    relationPair: `${raw.conflict.left} ${raw.conflict.relation} ${raw.conflict.right}`,
    concurrentRelation: raw.conflict.relation === "concurrent",
    conflictReason: raw.conflict.reason,
    mergeVisibility: {
      mergedVector: raw.mergedVector,
      visibleEvents: raw.visibility.visibleAfterMerge,
      explanation: "Después de recibir ambas ramas, el monitor ve la actualización de política y la actualización de capacidad; el merge habilita decidir con evidencia causal completa."
    }
  };
}

function createMetrics(raw) {
  if (raw.mode === "causal-chain") {
    return {
      eventCount: raw.events.length,
      happenedBeforeComparisons: raw.comparisons.filter((comparison) => comparison.relation === "before").length,
      finalVectorWidth: Object.keys(raw.events.at(-1).vector).length
    };
  }

  if (raw.mode === "concurrent-events") {
    return {
      eventCount: raw.events.length,
      concurrentPairs: raw.concurrentPairs.filter((pair) => pair.relation === "concurrent").length,
      incomparablePairs: raw.concurrentPairs.length
    };
  }

  return {
    eventCount: raw.events.length,
    conflictDetected: raw.conflict.requiresResolution,
    mergedComponents: Object.keys(raw.mergedVector).length,
    allBranchesVisibleAfterMerge: raw.visibility.policyVisible && raw.visibility.capacityVisible
  };
}

function createObservations(raw) {
  if (raw.mode === "causal-chain") {
    return [
      "Un receive primero toma el máximo componente a componente y luego incrementa su propio componente.",
      "Vector clocks permiten afirmar happened-before comparando todos los componentes, no solo un contador escalar."
    ];
  }

  if (raw.mode === "concurrent-events") {
    return [
      "Dos vectores incomparables representan eventos concurrentes: ninguno contiene todo el conocimiento causal del otro.",
      "La concurrencia no es un error por sí misma; es una señal para no inventar causalidad donde no hubo comunicación."
    ];
  }

  return [
    "El merge de vectores conserva visibilidad causal de múltiples ramas concurrentes.",
    "Detectar conflicto no es lo mismo que resolverlo; la resolución requiere una política de negocio explícita."
  ];
}

function createDecisions(raw) {
  if (raw.mode === "causal-chain") {
    return [
      createDecision("vector-compare", "Comparación de vectores", "usar-before-after-equal-concurrent", "Compare todos los componentes para explicar causalidad o concurrencia."),
      createDecision("receive-merge", "Regla receive", "mergear-e-incrementar", "Al recibir, aplique max por componente y luego incremente el componente local.")
    ];
  }

  if (raw.mode === "concurrent-events") {
    return [
      createDecision("incomparable-events", "Eventos incomparables", "marcar-concurrente", "Cuando un vector tiene componentes mayores y menores que otro, declare concurrencia."),
      createDecision("no-fake-order", "Sin orden artificial", "no-inventar-causalidad", "No convierta orden de visualización en causalidad operacional.")
    ];
  }

  return [
    createDecision("conflict-detection", "Detección de conflicto", "resolver-si-concurrente-y-mismo-dominio", "Si dos actualizaciones concurrentes afectan una decisión compartida, pida política de resolución."),
    createDecision("causal-visibility", "Visibilidad causal", "merge-como-evidencia", "Use el vector mergeado para saber qué ramas fueron vistas antes de decidir.")
  ];
}

function createLearning(raw, metrics) {
  if (raw.mode === "causal-chain") {
    return {
      objective: "Usar vector clocks para probar relaciones happened-before en una cadena de mensajes AURA.",
      keyMetrics: [
        { label: "Eventos", value: metrics.eventCount, unit: "eventos", meaning: "Cantidad de eventos de la cadena causal." },
        { label: "Comparaciones before", value: metrics.happenedBeforeComparisons, unit: "comparaciones", meaning: "Relaciones verificadas como happened-before por comparación vectorial." }
      ],
      checklist: ["Compare componente a componente dos eventos de la cadena.", "Explique por qué un receive incrementa después del merge."],
      takeaway: "Vector clocks sí permiten detectar cuándo un evento vio causalmente a otro."
    };
  }

  if (raw.mode === "concurrent-events") {
    return {
      objective: "Detectar concurrencia real cuando los eventos son incomparables.",
      keyMetrics: [
        { label: "Pares concurrentes", value: metrics.concurrentPairs, unit: "pares", meaning: "Pares donde ningún vector domina al otro." },
        { label: "Eventos", value: metrics.eventCount, unit: "eventos", meaning: "Eventos locales sin mensajes entre ellos." }
      ],
      checklist: ["Busque componentes mayores en ambos vectores comparados.", "Redacte por qué no hay relación causa-efecto."],
      takeaway: "Si dos vectores son incomparables, el sistema debe tratarlos como concurrentes."
    };
  }

  return {
    objective: "Diferenciar merge de visibilidad causal y resolución explícita de conflictos.",
    keyMetrics: [
      { label: "Conflicto detectado", value: metrics.conflictDetected ? "sí" : "no", unit: "decisión", meaning: "Indica si las ramas eran concurrentes y necesitan política." },
      { label: "Ramas visibles", value: metrics.allBranchesVisibleAfterMerge ? "todas" : "parcial", unit: "estado", meaning: "Indica qué conocimiento causal llegó al monitor." }
    ],
    checklist: ["Verifique que las actualizaciones originales son concurrentes.", "Explique qué sabe el monitor después de recibir ambas ramas."],
    takeaway: "El vector mergeado muestra visibilidad; la decisión de conflicto sigue siendo una política separada."
  };
}

function runVectorClocksLab(options = {}) {
  const mode = options.mode ?? "causal-chain";
  if (mode === "causal-chain") {
    return simulateCausalChain();
  }
  if (mode === "concurrent-events") {
    return simulateConcurrentEvents();
  }
  if (mode === "merge-and-conflict") {
    return simulateMergeAndConflict();
  }

  throw new Error(`vector clocks mode '${mode}' is not supported. Use one of: ${VECTOR_CLOCK_MODES.join(", ")}`);
}

function createVectorClocksLabResult(options = {}) {
  const raw = runVectorClocksLab(options);
  const metrics = createMetrics(raw);
  const decisions = createDecisions(raw);
  const evidence = createEvidence(raw);

  const result = {
    labId: "vector-clocks",
    session: 24,
    mode: raw.mode,
    title: "Sesión 24: Vector clocks y causalidad",
    summary: raw.interpretation,
    inputs: { mode: raw.mode },
    metrics,
    observations: createObservations(raw),
    decisions,
    timeline: createTimeline(raw.events),
    learning: createLearning(raw, metrics),
    recommendations: decisions.map((decision) => decision.recommendation),
    raw
  };

  if (evidence) {
    result.evidence = evidence;
  }

  return result;
}

function parseArgs(argv) {
  const options = { mode: "causal-chain" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--causal-chain") {
      options.mode = "causal-chain";
    } else if (arg === "--concurrent-events") {
      options.mode = "concurrent-events";
    } else if (arg === "--merge-and-conflict") {
      options.mode = "merge-and-conflict";
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
  console.log("Línea de tiempo Vector clocks");
  result.timeline.forEach((entry) => {
    console.log(`- ${entry.label}: node=${entry.nodeId} vector=${JSON.stringify(entry.vector)} ${entry.detail}`);
  });
}

function printReport(report) {
  console.log(`Laboratorio de Vector clocks: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Métricas");
  Object.entries(report.metrics).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  console.log("Decisiones");
  report.decisions.forEach((decision) => console.log(`- ${decision.title}: ${decision.decision}. ${decision.recommendation}`));
  if (report.evidence) {
    console.log("Evidencia causal");
    console.log(`- Vectores comparados: ${report.evidence.comparedVectors.left.eventId}=${formatVector(report.evidence.comparedVectors.left.vector)} vs ${report.evidence.comparedVectors.right.eventId}=${formatVector(report.evidence.comparedVectors.right.vector)}`);
    console.log(`- Relación del par: ${report.evidence.relationPair}`);
    console.log(`- Motivo del conflicto: ${report.evidence.conflictReason}`);
    console.log(`- Merge visible: ${report.evidence.mergeVisibility.visibleEvents.join(", ")} con vector ${formatVector(report.evidence.mergeVisibility.mergedVector)}`);
    console.log(`- Qué permite ver: ${report.evidence.mergeVisibility.explanation}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createVectorClocksLabResult(options);
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
  compareVectors,
  createVectorClock,
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
};

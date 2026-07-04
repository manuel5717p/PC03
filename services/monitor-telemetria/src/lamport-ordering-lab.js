#!/usr/bin/env node

const LAMPORT_PRESETS = {
  causalChain: {
    description: "Cadena causal con eventos locales, envío y recepción entre nodos AURA",
    nodes: ["centro-logistica", "gestor-flota", "monitor-telemetria"]
  },
  concurrentEvents: {
    description: "Eventos independientes sin relación causal directa entre nodos",
    nodes: ["gestor-flota", "monitor-telemetria"]
  },
  mergeAndTieBreak: {
    description: "Merge de contadores Lamport y desempate determinístico por nodeId",
    nodes: ["centro-logistica", "planificador-rutas", "monitor-telemetria"]
  }
};

function createLamportNode(nodeId, initialCounter = 0) {
  return { nodeId, counter: initialCounter };
}

function localEvent(node, label) {
  node.counter += 1;
  return {
    id: `${node.nodeId}-${String(node.counter).padStart(2, "0")}`,
    nodeId: node.nodeId,
    label,
    type: "local",
    lamport: node.counter,
    happenedBefore: []
  };
}

function sendEvent(node, label) {
  node.counter += 1;
  return {
    id: `${node.nodeId}-${String(node.counter).padStart(2, "0")}`,
    nodeId: node.nodeId,
    label,
    type: "send",
    lamport: node.counter,
    messageClock: node.counter,
    happenedBefore: []
  };
}

function receiveEvent(node, message, label) {
  node.counter = Math.max(node.counter, message.messageClock) + 1;
  return {
    id: `${node.nodeId}-${String(node.counter).padStart(2, "0")}`,
    nodeId: node.nodeId,
    label,
    type: "receive",
    lamport: node.counter,
    receivedMessageClock: message.messageClock,
    happenedBefore: [message.id]
  };
}

function compareLamportEvents(left, right) {
  if (left.lamport !== right.lamport) {
    return left.lamport - right.lamport;
  }

  return left.nodeId.localeCompare(right.nodeId);
}

function createDecision(id, title, decision, recommendation) {
  return { id, title, decision, recommendation };
}

function createTimeline(events) {
  return events.map((event) => ({
    id: event.id,
    label: event.label,
    nodeId: event.nodeId,
    lamport: event.lamport,
    time: `L=${event.lamport}`,
    decision: event.type,
    detail: event.happenedBefore.length ? `happened-before: ${event.happenedBefore.join(", ")}` : "sin dependencia causal registrada"
  }));
}

function simulateCausalChain() {
  const logistics = createLamportNode("centro-logistica");
  const fleet = createLamportNode("gestor-flota");
  const telemetry = createLamportNode("monitor-telemetria");

  const orderCreated = localEvent(logistics, "OrderCreated local");
  const missionRequested = sendEvent(logistics, "MissionAssignmentRequested enviado");
  missionRequested.happenedBefore.push(orderCreated.id);
  const missionAccepted = receiveEvent(fleet, missionRequested, "MissionAssignmentAccepted recibido");
  const telemetrySubscription = sendEvent(fleet, "TelemetrySubscriptionRequested enviado");
  telemetrySubscription.happenedBefore.push(missionAccepted.id);
  const telemetryTracking = receiveEvent(telemetry, telemetrySubscription, "TelemetryTrackingStarted recibido");

  const events = [orderCreated, missionRequested, missionAccepted, telemetrySubscription, telemetryTracking];
  return {
    mode: "causal-chain",
    description: LAMPORT_PRESETS.causalChain.description,
    events,
    causalEdges: [
      { from: orderCreated.id, to: missionRequested.id, reason: "program order" },
      { from: missionRequested.id, to: missionAccepted.id, reason: "send -> receive" },
      { from: missionAccepted.id, to: telemetrySubscription.id, reason: "program order" },
      { from: telemetrySubscription.id, to: telemetryTracking.id, reason: "send -> receive" }
    ],
    interpretation: "Cada receive aplica max(local, messageClock) + 1, por eso la cadena conserva happened-before sin depender de hora física."
  };
}

function simulateConcurrentEvents() {
  const fleet = createLamportNode("gestor-flota");
  const telemetry = createLamportNode("monitor-telemetria");
  const routePlanner = createLamportNode("planificador-rutas");

  const droneHeartbeat = localEvent(fleet, "DroneHeartbeat observado");
  const batterySample = localEvent(telemetry, "BatterySample observado");
  const routeCacheRefresh = localEvent(routePlanner, "RouteCacheRefresh observado");
  const events = [droneHeartbeat, batterySample, routeCacheRefresh];
  const totalOrderForDisplay = [...events].sort(compareLamportEvents);

  return {
    mode: "concurrent-events",
    description: LAMPORT_PRESETS.concurrentEvents.description,
    events,
    concurrentPairs: [
      [droneHeartbeat.id, batterySample.id],
      [droneHeartbeat.id, routeCacheRefresh.id],
      [batterySample.id, routeCacheRefresh.id]
    ],
    totalOrderForDisplay,
    interpretation: "Eventos independientes pueden tener el mismo contador Lamport; ordenarlos por timestamp lógico crea un orden total de presentación, no una relación causal."
  };
}

function simulateMergeAndTieBreak() {
  const logistics = createLamportNode("centro-logistica", 2);
  const routePlanner = createLamportNode("planificador-rutas", 2);
  const telemetry = createLamportNode("monitor-telemetria", 4);

  const routeReady = sendEvent(routePlanner, "RouteReady enviado");
  const auditSnapshot = sendEvent(logistics, "AuditSnapshot enviado");
  const telemetryMergedRoute = receiveEvent(telemetry, routeReady, "RouteReady mergeado en telemetría");
  const telemetryMergedAudit = receiveEvent(telemetry, auditSnapshot, "AuditSnapshot mergeado en telemetría");
  const tiedEvents = [routeReady, auditSnapshot].sort(compareLamportEvents);
  const events = [routeReady, auditSnapshot, telemetryMergedRoute, telemetryMergedAudit];

  return {
    mode: "merge-and-tie-break",
    description: LAMPORT_PRESETS.mergeAndTieBreak.description,
    events,
    tiedEvents,
    mergeRule: "receiverCounter = max(localCounter, messageClock) + 1",
    tieBreakRule: "orden determinístico por nodeId cuando los contadores Lamport empatan",
    interpretation: "El merge preserva causalidad recibida; el desempate por nodeId solo estabiliza vistas, no convierte concurrencia en causalidad."
  };
}

function createLamportOrderingLabResult(options = {}) {
  const raw = runLamportOrderingLab(options);
  const decisions = createDecisions(raw);

  return {
    labId: "lamport-ordering",
    session: 23,
    mode: raw.mode,
    title: "Sesión 23: Lamport clocks y orden parcial",
    summary: raw.interpretation,
    inputs: { mode: raw.mode },
    metrics: createMetrics(raw),
    observations: createObservations(raw),
    decisions,
    timeline: createTimeline(raw.events),
    recommendations: decisions.map((decision) => decision.recommendation),
    raw
  };
}

function createMetrics(raw) {
  if (raw.mode === "causal-chain") {
    return {
      eventCount: raw.events.length,
      causalEdges: raw.causalEdges.length,
      maxLamport: Math.max(...raw.events.map((event) => event.lamport))
    };
  }

  if (raw.mode === "concurrent-events") {
    return {
      eventCount: raw.events.length,
      concurrentPairs: raw.concurrentPairs.length,
      sharedLamportCounter: raw.events.every((event) => event.lamport === raw.events[0].lamport)
    };
  }

  return {
    eventCount: raw.events.length,
    tiedEvents: raw.tiedEvents.length,
    finalReceiverCounter: raw.events.at(-1).lamport
  };
}

function createObservations(raw) {
  if (raw.mode === "causal-chain") {
    return [
      "Un receive incrementa usando el máximo entre su contador local y el contador del mensaje.",
      "Si A ocurrió antes que B, entonces L(A) < L(B); la inversa no necesariamente es cierta."
    ];
  }

  if (raw.mode === "concurrent-events") {
    return [
      "Eventos sin mensajes compartidos no tienen relación happened-before aunque se ordenen para mostrar una tabla.",
      "El timestamp Lamport no detecta concurrencia por sí solo; solo permite una condición necesaria de causalidad."
    ];
  }

  return [
    "El merge de Lamport evita retroceder el contador lógico al recibir mensajes atrasados.",
    "El desempate por nodeId es una política determinística de visualización, no evidencia causal."
  ];
}

function createDecisions(raw) {
  if (raw.mode === "causal-chain") {
    return [
      createDecision("lamport-send-receive", "Regla send/receive", "incrementar-y-mergear", "Incremente en eventos locales/envíos y use max(local, mensaje) + 1 al recibir."),
      createDecision("partial-order", "Orden parcial", "usar-happened-before", "Explique causalidad con edges de mensajes y programa local, no con hora física.")
    ];
  }

  if (raw.mode === "concurrent-events") {
    return [
      createDecision("concurrency-warning", "Eventos concurrentes", "no-inferir-causalidad", "No convierta un orden de presentación en una afirmación de causa y efecto."),
      createDecision("timestamp-limitation", "Límite del contador", "timestamp-no-es-prueba-suficiente", "Use Lamport para razonar happened-before; reserve vector clocks para detectar concurrencia con más precisión.")
    ];
  }

  return [
    createDecision("deterministic-tie-break", "Desempate determinístico", "ordenar-por-contador-y-node-id", "Use nodeId como desempate estable cuando necesite una vista reproducible."),
    createDecision("merge-rule", "Merge de contador", "max-local-message-mas-uno", "Nunca acepte un mensaje sin actualizar el contador local con la regla de merge.")
  ];
}

function parseArgs(argv) {
  const options = { mode: "causal-chain" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--causal-chain") {
      options.mode = "causal-chain";
    } else if (arg === "--concurrent-events") {
      options.mode = "concurrent-events";
    } else if (arg === "--merge-and-tie-break") {
      options.mode = "merge-and-tie-break";
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

function runLamportOrderingLab(options = {}) {
  const mode = options.mode ?? "causal-chain";
  if (mode === "causal-chain") {
    return simulateCausalChain();
  }
  if (mode === "concurrent-events") {
    return simulateConcurrentEvents();
  }
  if (mode === "merge-and-tie-break") {
    return simulateMergeAndTieBreak();
  }

  throw new Error("lamport ordering mode '" + mode + "' is not supported. Use one of: causal-chain, concurrent-events, merge-and-tie-break");
}

function printTimeline(result) {
  console.log("Línea de tiempo Lamport");
  result.timeline.forEach((entry) => {
    console.log(`- ${entry.label}: node=${entry.nodeId} lamport=${entry.lamport} ${entry.detail}`);
  });
}

function printReport(report) {
  console.log(`Laboratorio de Lamport clocks: ${report.mode}`);
  console.log(`Resumen: ${report.summary}`);
  report.observations.forEach((observation) => console.log(`- ${observation}`));
  console.log("Métricas");
  Object.entries(report.metrics).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  console.log("Decisiones");
  report.decisions.forEach((decision) => console.log(`- ${decision.title}: ${decision.decision}. ${decision.recommendation}`));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = createLamportOrderingLabResult(options);
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
};

const { createLamportOrderingLabResult } = require("../../../monitor-telemetria/src/lamport-ordering-lab");

const LAMPORT_ORDERING_MODES = [
  {
    id: "causal-chain",
    title: "Cadena causal",
    description: "Muestra cómo eventos locales, envíos y recepciones incrementan Lamport para preservar happened-before."
  },
  {
    id: "concurrent-events",
    title: "Eventos concurrentes",
    description: "Expone que eventos independientes pueden empatar en contador y no tienen relación causal."
  },
  {
    id: "merge-and-tie-break",
    title: "Merge y desempate",
    description: "Compara contadores Lamport y usa nodeId como desempate determinístico para vistas reproducibles."
  }
];

function listLamportOrderingModes() {
  return LAMPORT_ORDERING_MODES;
}

function keyMetric(label, value, unit, meaning) {
  return { label, value, unit, meaning };
}

function presentMetrics(metrics) {
  return metrics.filter((metric) => metric.value !== undefined && metric.value !== null);
}

function createLearningContract(result) {
  if (result.mode === "causal-chain") {
    return {
      objective: "Entender cómo Lamport clocks capturan relaciones happened-before mediante eventos locales, envíos y recepciones.",
      keyMetrics: presentMetrics([
        keyMetric("Eventos", result.metrics.eventCount, "eventos", "Cantidad de eventos de la cadena causal simulada."),
        keyMetric("Edges causales", result.metrics.causalEdges, "edges", "Relaciones program order o send/receive que justifican happened-before."),
        keyMetric("Lamport máximo", result.metrics.maxLamport, "contador", "Valor lógico alcanzado al final de la cadena.")
      ]),
      checklist: [
        "Siga cada edge causal y verifique que el contador aumente en el evento posterior.",
        "Explique por qué el receive usa max(local, messageClock) + 1."
      ],
      takeaway: "Lamport permite afirmar una condición necesaria de causalidad: si A ocurrió antes que B, entonces L(A) < L(B)."
    };
  }

  if (result.mode === "concurrent-events") {
    return {
      objective: "Distinguir orden total de presentación de orden parcial causal cuando los eventos son independientes.",
      keyMetrics: presentMetrics([
        keyMetric("Eventos", result.metrics.eventCount, "eventos", "Cantidad de eventos locales independientes."),
        keyMetric("Pares concurrentes", result.metrics.concurrentPairs, "pares", "Pares sin mensaje ni relación causal directa."),
        keyMetric("Contador compartido", result.metrics.sharedLamportCounter ? "sí" : "no", "decisión", "Indica si los eventos empatan en contador Lamport.")
      ]),
      checklist: [
        "Identifique qué pares no tienen relación happened-before.",
        "Explique por qué ordenar por contador y nodeId no demuestra causalidad."
      ],
      takeaway: "Lamport clocks ordenan parcialmente; el orden total agregado para UI o logs puede ser arbitrario."
    };
  }

  return {
    objective: "Practicar merge de contadores Lamport y desempate determinístico sin confundirlo con causalidad real.",
    keyMetrics: presentMetrics([
      keyMetric("Eventos", result.metrics.eventCount, "eventos", "Eventos comparados y mergeados."),
      keyMetric("Eventos empatados", result.metrics.tiedEvents, "eventos", "Eventos con el mismo contador que necesitan desempate para visualización."),
      keyMetric("Contador final del receptor", result.metrics.finalReceiverCounter, "contador", "Valor del nodo receptor después de aplicar merges sucesivos.")
    ]),
    checklist: [
      "Verifique la regla max(local, messageClock) + 1 en cada recepción.",
      "Separe la decisión de desempate por nodeId de la relación causal real."
    ],
    takeaway: "El desempate estabiliza la presentación; la causalidad sigue dependiendo de programa local y mensajes."
  };
}

function runLamportOrderingObservabilityLab(mode = "causal-chain") {
  if (!LAMPORT_ORDERING_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`lamport-ordering mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  const result = createLamportOrderingLabResult({ mode });
  return {
    ...result,
    learning: createLearningContract(result)
  };
}

module.exports = {
  listLamportOrderingModes,
  runLamportOrderingObservabilityLab
};

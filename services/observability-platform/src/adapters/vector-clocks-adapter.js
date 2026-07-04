const { createVectorClocksLabResult } = require("../../../monitor-telemetria/src/vector-clocks-lab");

const VECTOR_CLOCKS_MODES = [
  {
    id: "causal-chain",
    title: "Cadena causal",
    description: "Muestra cómo un vector clock preserva happened-before al propagar conocimiento causal entre nodos."
  },
  {
    id: "concurrent-events",
    title: "Eventos concurrentes",
    description: "Detecta eventos independientes como vectores incomparables, no como una cadena causal."
  },
  {
    id: "merge-and-conflict",
    title: "Merge y conflicto",
    description: "Fusiona vectores concurrentes y separa visibilidad causal de resolución explícita de conflictos."
  }
];

function listVectorClocksModes() {
  return VECTOR_CLOCKS_MODES;
}

function runVectorClocksObservabilityLab(mode = "causal-chain") {
  if (!VECTOR_CLOCKS_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`vector-clocks mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createVectorClocksLabResult({ mode });
}

module.exports = {
  listVectorClocksModes,
  runVectorClocksObservabilityLab
};

const { createCoordinationIntegrationLabResult } = require("../../../monitor-telemetria/src/coordination-integration-lab");

const COORDINATION_INTEGRATION_MODES = [
  {
    id: "pc3-ready-happy-path",
    title: "Preparado para PC3: camino feliz",
    description: "Acepta la acción cuando tiempo físico, sincronización, causalidad, lease, líder y detector de fallas son consistentes."
  },
  {
    id: "causal-conflict-review",
    title: "Conflicto causal: revisión requerida",
    description: "Muestra por qué Lamport puede ordenar, pero vector clocks revelan concurrencia que exige revisión."
  },
  {
    id: "suspected-leader-compensation",
    title: "Líder sospechado: compensación",
    description: "Rechaza la acción principal cuando el líder está sospechado, el lease es inseguro y se necesita compensar."
  }
];

function listCoordinationIntegrationModes() {
  return COORDINATION_INTEGRATION_MODES;
}

function runCoordinationIntegrationObservabilityLab(mode = "pc3-ready-happy-path") {
  if (!COORDINATION_INTEGRATION_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`coordination-integration mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createCoordinationIntegrationLabResult({ mode });
}

module.exports = {
  listCoordinationIntegrationModes,
  runCoordinationIntegrationObservabilityLab
};

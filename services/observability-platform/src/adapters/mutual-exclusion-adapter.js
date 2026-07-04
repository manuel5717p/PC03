const { createMutualExclusionLabResult } = require("../../../monitor-telemetria/src/mutual-exclusion-lab");

const MUTUAL_EXCLUSION_MODES = [
  {
    id: "contended-queue",
    title: "Cola con contención",
    description: "Ordena pedidos concurrentes y muestra request, espera, grant, entrada y release para una ventana compartida."
  },
  {
    id: "fairness-rounds",
    title: "Rondas y espera",
    description: "Repite solicitudes para observar quién espera, cuándo recibe grant y por qué no hay prioridad permanente."
  },
  {
    id: "critical-section-safety",
    title: "Seguridad de sección crítica",
    description: "Prueba que cada entrada tenga grant previo y que cada release ocurra antes del siguiente ingreso."
  },
  {
    id: "delay-and-reorder",
    title: "Demora y reordenamiento",
    description: "Entrega mensajes fuera de orden y valida que el ciclo request-wait-grant-enter-release conserve safety."
  }
];

function listMutualExclusionModes() {
  return MUTUAL_EXCLUSION_MODES;
}

function runMutualExclusionObservabilityLab(mode = "contended-queue") {
  if (!MUTUAL_EXCLUSION_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`mutual-exclusion mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createMutualExclusionLabResult({ mode });
}

module.exports = {
  listMutualExclusionModes,
  runMutualExclusionObservabilityLab
};

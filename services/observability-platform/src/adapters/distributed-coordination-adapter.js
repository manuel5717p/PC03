const { createDistributedCoordinationLabResult } = require("../../../monitor-telemetria/src/distributed-coordination-lab");

const DISTRIBUTED_COORDINATION_MODES = [
  {
    id: "coordinated-dispatch-handoff",
    title: "Despacho coordinado con handoff",
    description: "Combina líder, lease vigente y evidencia causal para aceptar un handoff operativo."
  },
  {
    id: "expired-lease-prevention",
    title: "Prevención por lease vencido",
    description: "Muestra que causalidad válida no autoriza acciones posteriores al deadline del lease."
  },
  {
    id: "degraded-compensation",
    title: "Coordinación degradada y compensación",
    description: "Aplica pausa, reencolado y evidencia causal cuando el líder queda sospechado."
  }
];

function listDistributedCoordinationModes() {
  return DISTRIBUTED_COORDINATION_MODES;
}

function runDistributedCoordinationObservabilityLab(mode = "coordinated-dispatch-handoff") {
  if (!DISTRIBUTED_COORDINATION_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`distributed-coordination mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createDistributedCoordinationLabResult({ mode });
}

module.exports = {
  listDistributedCoordinationModes,
  runDistributedCoordinationObservabilityLab
};

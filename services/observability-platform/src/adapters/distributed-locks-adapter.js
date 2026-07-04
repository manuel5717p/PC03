const { createDistributedLocksLabResult } = require("../../../monitor-telemetria/src/distributed-locks-lab");

const DISTRIBUTED_LOCKS_MODES = [
  {
    id: "lock-acquire-and-hold",
    title: "Acquire y hold dentro del TTL",
    description: "Muestra un owner que adquiere un lease y actúa antes del deadline."
  },
  {
    id: "lease-expiry-and-reacquire",
    title: "Expiración y reacquisición",
    description: "Expone cómo un owner vencido pierde ownership y otro nodo reacquiere el lock."
  },
  {
    id: "renewal-jitter-and-risk",
    title: "Renovación con jitter",
    description: "Evalúa el riesgo de renovar demasiado cerca del vencimiento del lease."
  },
  {
    id: "stale-owner-and-fencing-warning",
    title: "Owner stale y advertencia de fencing",
    description: "Usa el fencing token como evidencia para advertir/rechazar una acción stale."
  }
];

function listDistributedLocksModes() {
  return DISTRIBUTED_LOCKS_MODES;
}

function runDistributedLocksObservabilityLab(mode = "lock-acquire-and-hold") {
  if (!DISTRIBUTED_LOCKS_MODES.some((candidate) => candidate.id === mode)) {
    const error = new Error(`distributed-locks mode '${mode}' is not available in the observability platform`);
    error.statusCode = 400;
    throw error;
  }

  return createDistributedLocksLabResult({ mode });
}

module.exports = {
  listDistributedLocksModes,
  runDistributedLocksObservabilityLab
};

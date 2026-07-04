const DRONE_STATUS = ["disponible", "en_mision", "en_mantenimiento", "bateria_baja"];

function validateDrone(payload) {
  if (!payload || typeof payload !== "object") {
    return "Body inválido";
  }
  if (!payload.id || typeof payload.id !== "string") {
    return "id es requerido";
  }
  if (!payload.model || typeof payload.model !== "string") {
    return "model es requerido";
  }
  if (typeof payload.battery_level !== "number" || payload.battery_level < 0 || payload.battery_level > 100) {
    return "battery_level debe estar entre 0 y 100";
  }
  if (payload.status && !DRONE_STATUS.includes(payload.status)) {
    return "status inválido";
  }
  if (payload.current_location !== undefined && payload.current_location !== null && typeof payload.current_location !== "string") {
    return "current_location debe ser string o null";
  }
  return null;
}

function normalizeDrone(payload) {
  return {
    id: payload.id,
    model: payload.model,
    status: payload.status ?? "disponible",
    battery_level: payload.battery_level,
    current_location: payload.current_location ?? null
  };
}

module.exports = { validateDrone, normalizeDrone };

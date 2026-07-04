const ORDER_STATUS = ["pendiente", "asignada", "en_vuelo", "entregada", "fallida"];

function isValidLocation(location) {
  return (
    location
    && typeof location === "object"
    && typeof location.latitude === "number"
    && typeof location.longitude === "number"
  );
}

function validateOrder(payload) {
  if (!payload || typeof payload !== "object") {
    return "Body inválido";
  }
  if (!isValidLocation(payload.pickup_location)) {
    return "pickup_location inválido";
  }
  if (!isValidLocation(payload.destination)) {
    return "destination inválido";
  }
  if (payload.status && !ORDER_STATUS.includes(payload.status)) {
    return "status inválido";
  }
  return null;
}

module.exports = { validateOrder };

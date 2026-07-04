function validatePoint(point, fieldName) {
  if (!point || typeof point !== "object") {
    throw new Error(`El campo '${fieldName}' es requerido.`);
  }

  const x = Number(point.x);
  const y = Number(point.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`El campo '${fieldName}' debe tener coordenadas numéricas x e y.`);
  }

  return { x, y };
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function planSimpleRoute({ origin, deliveries }) {
  const start = validatePoint(origin, "origin");

  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    throw new Error("El campo 'deliveries' debe ser una lista con al menos un destino.");
  }

  const pending = deliveries.map((delivery, index) => {
    const point = validatePoint(delivery.location, `deliveries[${index}].location`);
    return {
      id: delivery.id || `delivery-${index + 1}`,
      location: point
    };
  });

  const route = [];
  let current = start;
  let totalDistance = 0;

  while (pending.length > 0) {
    let bestIndex = 0;
    let bestDistance = manhattanDistance(current, pending[0].location);

    for (let i = 1; i < pending.length; i += 1) {
      const candidateDistance = manhattanDistance(current, pending[i].location);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestIndex = i;
      }
    }

    const next = pending.splice(bestIndex, 1)[0];
    totalDistance += bestDistance;
    current = next.location;

    route.push({
      stop: route.length + 1,
      delivery_id: next.id,
      location: next.location,
      segment_distance: bestDistance
    });
  }

  return {
    algorithm: "nearest-neighbor-manhattan",
    origin: start,
    total_stops: route.length,
    total_distance: totalDistance,
    route
  };
}

module.exports = {
  planSimpleRoute
};

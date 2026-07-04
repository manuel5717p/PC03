const { randomUUID } = require("node:crypto");

const orders = [];
const idempotencyIndex = new Map();

function resetOrders() {
  orders.length = 0;
  idempotencyIndex.clear();
}

function findOrderByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) {
    return null;
  }
  return idempotencyIndex.get(idempotencyKey) || null;
}

function createOrder(payload, options = {}) {
  const order = {
    id: payload.id ?? randomUUID(),
    pickup_location: payload.pickup_location,
    destination: payload.destination,
    status: payload.status ?? "pendiente",
    route_plan: options.routePlan ?? null,
    route_planner_attempts: options.routePlannerAttempts ?? 0
  };
  orders.push(order);

  if (options.idempotencyKey) {
    idempotencyIndex.set(options.idempotencyKey, order);
  }

  return order;
}

function listOrders() {
  return [...orders];
}

function findOrderById(orderId) {
  return orders.find((order) => order.id === orderId) || null;
}

function updateOrderStatus(orderId, status) {
  const order = findOrderById(orderId);
  if (!order) {
    return null;
  }

  order.status = status;
  return order;
}

module.exports = {
  resetOrders,
  createOrder,
  findOrderByIdempotencyKey,
  findOrderById,
  updateOrderStatus,
  listOrders
};

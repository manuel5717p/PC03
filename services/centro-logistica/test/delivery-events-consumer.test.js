const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/repository");
const {
  createDeliveryEventsConsumer,
  createInMemoryDroneStore,
  createInMemoryMissionRepository
} = require("../src/delivery-events-consumer");

function createOrderInFlight(orderId = "order-001") {
  return repository.createOrder({
    id: orderId,
    pickup_location: { latitude: -34.6037, longitude: -58.3816 },
    destination: { latitude: -34.6158, longitude: -58.4333 },
    status: "en_vuelo"
  });
}

function createConsumerFixture(initialDrones = [{ id: "drone-001", status: "en_mision" }]) {
  const order = createOrderInFlight();
  const missionRepository = createInMemoryMissionRepository([
    { id: "mission-001", orderId: order.id, droneId: "drone-001" }
  ]);
  const droneStore = createInMemoryDroneStore(initialDrones);
  const consumer = createDeliveryEventsConsumer({ missionRepository, droneStore });

  return { order, missionRepository, droneStore, consumer };
}

function deliveryCompletedEvent(overrides = {}) {
  return {
    eventId: "event-001",
    missionId: "mission-001",
    orderId: "order-001",
    droneId: "drone-001",
    occurredAt: "2026-05-15T12:00:00.000Z",
    ...overrides
  };
}

test.beforeEach(() => {
  repository.resetOrders();
});

test("at-most-once con mensaje perdido deja la orden y el dron desactualizados", () => {
  const { droneStore, consumer } = createConsumerFixture();

  assert.equal(repository.findOrderById("order-001").status, "en_vuelo");
  assert.equal(droneStore.findById("drone-001").status, "en_mision");
  assert.equal(consumer.getAppliedEffectsCount(), 0);
});

test("at-least-once con mismo eventId aplica el efecto una sola vez", () => {
  const { droneStore, consumer } = createConsumerFixture();

  const firstResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent());
  const secondResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent());

  assert.deepEqual(firstResult, { status: "processed", applied: true });
  assert.deepEqual(secondResult, { status: "ignored", reason: "duplicate_event_id", applied: false });
  assert.equal(repository.findOrderById("order-001").status, "entregada");
  assert.equal(droneStore.findById("drone-001").status, "disponible");
  assert.equal(consumer.getAppliedEffectsCount(), 1);
});

test("eventos distintos para la misma misión no reaplican si la orden ya fue entregada", () => {
  const { droneStore, consumer } = createConsumerFixture();

  const firstResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({ eventId: "event-001" }));
  const secondResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({ eventId: "event-002" }));

  assert.deepEqual(firstResult, { status: "processed", applied: true });
  assert.deepEqual(secondResult, { status: "ignored", reason: "order_already_delivered", applied: false });
  assert.equal(repository.findOrderById("order-001").status, "entregada");
  assert.equal(droneStore.findById("drone-001").status, "disponible");
  assert.equal(consumer.getAppliedEffectsCount(), 1);
});

test("evento con misión incorrecta se rechaza sin liberar dron ni entregar orden", () => {
  const { droneStore, consumer } = createConsumerFixture([
    { id: "drone-001", status: "en_mision" },
    { id: "drone-002", status: "en_mision" }
  ]);

  const result = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({
    eventId: "event-bad-mission",
    missionId: "mission-001",
    orderId: "order-001",
    droneId: "drone-002"
  }));

  assert.equal(result.status, "rejected");
  assert.equal(result.applied, false);
  assert.equal(result.reason, "evento inconsistente con la misión");
  assert.equal(repository.findOrderById("order-001").status, "en_vuelo");
  assert.equal(droneStore.findById("drone-001").status, "en_mision");
  assert.equal(droneStore.findById("drone-002").status, "en_mision");
  assert.equal(consumer.getAppliedEffectsCount(), 0);
  assert.deepEqual(consumer.getErrors(), [{ eventId: "event-bad-mission", reason: result.reason }]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInMemoryPubSubEventBus } = require("../src/lab-event-bus");

test("pub/sub entrega un hecho de negocio a consumidores independientes", async () => {
  const bus = createInMemoryPubSubEventBus();
  const observed = [];

  bus.subscribe("orders.created.v1", "notifications", async (event) => {
    observed.push(`notification:${event.data.orderId}`);
    return { queued: true };
  });
  bus.subscribe("orders.created.v1", "audit", async (event) => {
    observed.push(`audit:${event.eventId}`);
    return { persisted: true };
  });

  const result = await bus.publish({
    topic: "orders.created.v1",
    type: "OrderCreated",
    eventId: "event-001",
    data: { orderId: "order-001" }
  });

  assert.equal(result.subscriberCount, 2);
  assert.deepEqual(observed, ["notification:order-001", "audit:event-001"]);
  assert.deepEqual(bus.getMetrics(), {
    published: 1,
    deliveries: 2,
    topics: [{ topic: "orders.created.v1", subscribers: ["notifications", "audit"] }]
  });
});

test("pub/sub registra fallo de un consumidor sin bloquear a los demás", async () => {
  const bus = createInMemoryPubSubEventBus();
  const observed = [];

  bus.subscribe("orders.created.v1", "audit", async () => {
    throw new Error("audit storage unavailable");
  });
  bus.subscribe("orders.created.v1", "analytics", async (event) => {
    observed.push(event.data.orderId);
    return { counted: true };
  });

  const result = await bus.publish({
    topic: "orders.created.v1",
    type: "OrderCreated",
    eventId: "event-002",
    data: { orderId: "order-002" }
  });

  assert.equal(result.deliveries[0].status, "failed");
  assert.equal(result.deliveries[1].status, "delivered");
  assert.deepEqual(observed, ["order-002"]);
});

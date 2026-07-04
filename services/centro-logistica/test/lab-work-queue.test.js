const test = require("node:test");
const assert = require("node:assert/strict");
const { createBoundedWorkQueue, createInMemoryFifoWorkQueue } = require("../src/lab-work-queue");

test("cola FIFO absorbe backlog y procesa trabajos en orden", async () => {
  const queue = createInMemoryFifoWorkQueue();
  const processed = [];

  queue.enqueue("send-notification", { orderId: "order-001" });
  queue.enqueue("send-notification", { orderId: "order-002" });
  queue.enqueue("send-notification", { orderId: "order-003" });

  assert.equal(queue.getMetrics().queued, 3);

  const results = await queue.drain(async (item) => {
    processed.push(item.payload.orderId);
    return { sent: true };
  });

  assert.deepEqual(processed, ["order-001", "order-002", "order-003"]);
  assert.equal(results.every((result) => result.status === "processed"), true);
  assert.deepEqual(queue.getMetrics(), { queued: 0, processed: 3, failed: 0, maxAttempts: 2 });
});

test("cola reintenta trabajo fallido y conserva metricas claras", async () => {
  const queue = createInMemoryFifoWorkQueue({ maxAttempts: 2 });
  let attempts = 0;

  queue.enqueue("send-notification", { orderId: "order-001" });

  const first = await queue.processNext(async () => {
    attempts += 1;
    throw new Error("provider timeout");
  });
  const second = await queue.processNext(async (item) => {
    attempts += 1;
    return { sent: item.payload.orderId };
  });

  assert.equal(first.status, "retry_queued");
  assert.equal(second.status, "processed");
  assert.equal(attempts, 2);
  assert.deepEqual(queue.getMetrics(), { queued: 0, processed: 1, failed: 0, maxAttempts: 2 });
});

test("cola bounded rechaza trabajos cuando alcanza capacidad finita", () => {
  const queue = createBoundedWorkQueue({ maxQueued: 2 });

  const first = queue.enqueue("send-notification", { orderId: "order-001" });
  const second = queue.enqueue("send-notification", { orderId: "order-002" });
  const third = queue.enqueue("send-notification", { orderId: "order-003" });

  assert.equal(first.status, "queued");
  assert.equal(second.status, "queued");
  assert.equal(third.status, "rejected");
  assert.equal(third.reason, "queue_at_capacity");
  assert.deepEqual(queue.getMetrics(), {
    queued: 2,
    maxQueued: 2,
    enqueued: 2,
    processed: 0,
    failed: 0,
    rejected: 1,
    retried: 0,
    maxAttempts: 2
  });
});

test("cola bounded mantiene retry visible sin perder trabajo", async () => {
  const queue = createBoundedWorkQueue({ maxQueued: 3, maxAttempts: 2 });

  queue.enqueue("send-notification", { orderId: "order-001" });

  const first = await queue.processNext(async () => {
    throw new Error("provider timeout");
  });
  const second = await queue.processNext(async (item) => ({ sent: item.payload.orderId }));

  assert.equal(first.status, "retry_queued");
  assert.equal(second.status, "processed");
  assert.equal(queue.getMetrics().retried, 1);
  assert.equal(queue.getMetrics().processed, 1);
});

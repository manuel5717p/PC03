const test = require("node:test");
const assert = require("node:assert/strict");
const { runOrderCreatedLab } = require("../src/order-created-lab");

test("laboratorio OrderCreated muestra fan-out y cola de notificaciones", async () => {
  const report = await runOrderCreatedLab({ orderCount: 4 });

  assert.equal(report.busMetrics.published, 4);
  assert.equal(report.busMetrics.deliveries, 12);
  assert.equal(report.consumerState.auditLog.length, 4);
  assert.equal(report.consumerState.analytics.totalOrders, 4);
  assert.deepEqual(report.queueMetrics, { queued: 0, processed: 4, failed: 0, maxAttempts: 2 });
});

test("laboratorio OrderCreated muestra retry de trabajo lento sin perder el hecho", async () => {
  const report = await runOrderCreatedLab({ orderCount: 2, failFirstNotification: true });

  assert.equal(report.busMetrics.published, 2);
  assert.equal(report.consumerState.auditLog.length, 2);
  assert.equal(report.queueResults[0].status, "retry_queued");
  assert.deepEqual(report.queueMetrics, { queued: 0, processed: 2, failed: 0, maxAttempts: 2 });
});

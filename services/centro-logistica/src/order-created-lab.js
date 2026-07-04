#!/usr/bin/env node

const { createInMemoryPubSubEventBus } = require("./lab-event-bus");
const { createInMemoryFifoWorkQueue } = require("./lab-work-queue");

const ORDER_CREATED_TOPIC = "orders.created.v1";

function createOrderCreatedFact(orderNumber) {
  return {
    topic: ORDER_CREATED_TOPIC,
    type: "OrderCreated",
    eventId: `order-created-${String(orderNumber).padStart(3, "0")}`,
    occurredAt: "2026-05-21T20:00:00.000Z",
    data: {
      orderId: `order-${String(orderNumber).padStart(3, "0")}`,
      customerId: `customer-${String(orderNumber).padStart(3, "0")}`,
      businessReason: "Fan placed a drone delivery order during massive concert"
    }
  };
}

function createLabConsumers(notificationQueue) {
  const auditLog = [];
  const analytics = { totalOrders: 0, lastOrderId: null };

  return {
    notifications: (event) => {
      const job = notificationQueue.enqueue("send-order-created-notification", {
        orderId: event.data.orderId,
        customerId: event.data.customerId
      });
      return { queuedJobId: job.id };
    },
    audit: (event) => {
      auditLog.push({ eventId: event.eventId, type: event.type, orderId: event.data.orderId });
      return { auditEntries: auditLog.length };
    },
    analytics: (event) => {
      analytics.totalOrders += 1;
      analytics.lastOrderId = event.data.orderId;
      return { totalOrders: analytics.totalOrders, lastOrderId: analytics.lastOrderId };
    },
    getState: () => ({ auditLog: [...auditLog], analytics: { ...analytics } })
  };
}

async function runOrderCreatedLab(options = {}) {
  const orderCount = options.orderCount ?? 5;
  const failFirstNotification = options.failFirstNotification ?? false;
  const bus = createInMemoryPubSubEventBus();
  const notificationQueue = createInMemoryFifoWorkQueue({ maxAttempts: 2 });
  const consumers = createLabConsumers(notificationQueue);
  let notificationAttempts = 0;

  bus.subscribe(ORDER_CREATED_TOPIC, "notifications-consumer", consumers.notifications);
  bus.subscribe(ORDER_CREATED_TOPIC, "legal-audit-consumer", consumers.audit);
  bus.subscribe(ORDER_CREATED_TOPIC, "dashboard-analytics-consumer", consumers.analytics);

  const publishResults = [];
  for (let index = 1; index <= orderCount; index += 1) {
    publishResults.push(await bus.publish(createOrderCreatedFact(index)));
  }

  const queueResults = await notificationQueue.drain(async (item) => {
    notificationAttempts += 1;
    if (failFirstNotification && notificationAttempts === 1) {
      throw new Error("simulated notification provider timeout");
    }
    return { sentTo: item.payload.customerId, orderId: item.payload.orderId };
  });

  return {
    scenario: "order-created-pubsub-and-queue",
    businessFact: "OrderCreated is one business fact published once per order.",
    consumersAreIndependent: ["notifications", "legal audit", "dashboard analytics"],
    orderCount,
    publishResults,
    queueResults,
    busMetrics: bus.getMetrics(),
    queueMetrics: notificationQueue.getMetrics(),
    consumerState: consumers.getState()
  };
}

function printReport(report) {
  console.log(`Scenario: ${report.scenario}`);
  console.log(`Business fact: ${report.businessFact}`);
  console.log(`Independent consumers: ${report.consumersAreIndependent.join(", ")}`);
  console.log("");
  console.log("Pub/Sub fan-out:");
  report.publishResults.forEach((result) => {
    console.log(`- ${result.eventId}: ${result.subscriberCount} subscribers`);
  });
  console.log("");
  console.log("Queue processing:");
  report.queueResults.forEach((result, index) => {
    console.log(`- #${index + 1}: ${result.status} ${result.item?.id ?? ""}`.trim());
  });
  console.log("");
  console.log(`Bus metrics: ${JSON.stringify(report.busMetrics)}`);
  console.log(`Queue metrics: ${JSON.stringify(report.queueMetrics)}`);
  console.log(`Audit entries: ${report.consumerState.auditLog.length}`);
  console.log(`Dashboard totalOrders: ${report.consumerState.analytics.totalOrders}`);
}

function main() {
  const orderCountArg = process.argv.find((arg) => arg.startsWith("--orders="));
  const orderCount = orderCountArg ? Number(orderCountArg.split("=")[1]) : 5;
  const failFirstNotification = process.argv.includes("--fail-first-notification");

  runOrderCreatedLab({ orderCount, failFirstNotification })
    .then(printReport)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  ORDER_CREATED_TOPIC,
  createOrderCreatedFact,
  runOrderCreatedLab
};

#!/usr/bin/env node

const { createInMemoryPubSubEventBus } = require("./lab-event-bus");
const { createBoundedWorkQueue } = require("./lab-work-queue");
const {
  createDeliveryEventsConsumer,
  createInMemoryDroneStore,
  createInMemoryMissionRepository
} = require("./delivery-events-consumer");

const OPERATIONAL_PRESSURE_PRESETS = {
  normal: {
    ticks: 4,
    telemetryProducedPerTick: 2,
    telemetryConsumerCapacityPerTick: 4,
    telemetryBufferCapacity: 20,
    telemetrySampleEvery: 1,
    ordersPerTick: 2,
    routeCapacityPerTick: 2,
    orderAcceptEvery: 1,
    notificationMaxQueued: 12,
    notificationWorkerCapacityPerTick: 3,
    failFirstNotification: false,
    deliveryEventsPerTick: 1,
    duplicateDeliveryEveryTick: 0,
    analyticsPrecision: "per-event"
  },
  concert: {
    ticks: 5,
    telemetryProducedPerTick: 7,
    telemetryConsumerCapacityPerTick: 3,
    telemetryBufferCapacity: 24,
    telemetrySampleEvery: 1,
    ordersPerTick: 4,
    routeCapacityPerTick: 3,
    orderAcceptEvery: 1,
    notificationMaxQueued: 18,
    notificationWorkerCapacityPerTick: 2,
    failFirstNotification: false,
    deliveryEventsPerTick: 2,
    duplicateDeliveryEveryTick: 3,
    analyticsPrecision: "per-tick"
  },
  overload: {
    ticks: 5,
    telemetryProducedPerTick: 10,
    telemetryConsumerCapacityPerTick: 2,
    telemetryBufferCapacity: 10,
    telemetrySampleEvery: 1,
    ordersPerTick: 6,
    routeCapacityPerTick: 2,
    orderAcceptEvery: 1,
    notificationMaxQueued: 5,
    notificationWorkerCapacityPerTick: 1,
    failFirstNotification: false,
    deliveryEventsPerTick: 2,
    duplicateDeliveryEveryTick: 2,
    analyticsPrecision: "degraded-window"
  },
  controlled: {
    ticks: 5,
    telemetryProducedPerTick: 10,
    telemetryConsumerCapacityPerTick: 3,
    telemetryBufferCapacity: 10,
    telemetrySampleEvery: 3,
    ordersPerTick: 6,
    routeCapacityPerTick: 3,
    orderAcceptEvery: 2,
    notificationMaxQueued: 8,
    notificationWorkerCapacityPerTick: 4,
    failFirstNotification: true,
    deliveryEventsPerTick: 2,
    duplicateDeliveryEveryTick: 2,
    analyticsPrecision: "degraded-window"
  }
};

function assertKnownOperationalPressureMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(OPERATIONAL_PRESSURE_PRESETS, mode)) {
    const supportedModes = Object.keys(OPERATIONAL_PRESSURE_PRESETS).join(", ");
    throw new Error(`operational pressure mode '${mode}' is not supported. Use one of: ${supportedModes}`);
  }
}

function createOperationalPressurePlan(options = {}) {
  const mode = options.mode ?? "normal";
  assertKnownOperationalPressureMode(mode);
  const preset = OPERATIONAL_PRESSURE_PRESETS[mode];

  return {
    mode,
    ticks: options.ticks ?? preset.ticks,
    telemetryProducedPerTick: options.telemetryProducedPerTick ?? preset.telemetryProducedPerTick,
    telemetryConsumerCapacityPerTick: options.telemetryConsumerCapacityPerTick ?? preset.telemetryConsumerCapacityPerTick,
    telemetryBufferCapacity: options.telemetryBufferCapacity ?? preset.telemetryBufferCapacity,
    telemetrySampleEvery: options.telemetrySampleEvery ?? preset.telemetrySampleEvery,
    ordersPerTick: options.ordersPerTick ?? preset.ordersPerTick,
    routeCapacityPerTick: options.routeCapacityPerTick ?? preset.routeCapacityPerTick,
    orderAcceptEvery: options.orderAcceptEvery ?? preset.orderAcceptEvery,
    notificationMaxQueued: options.notificationMaxQueued ?? preset.notificationMaxQueued,
    notificationWorkerCapacityPerTick: options.notificationWorkerCapacityPerTick ?? preset.notificationWorkerCapacityPerTick,
    failFirstNotification: options.failFirstNotification ?? preset.failFirstNotification,
    deliveryEventsPerTick: options.deliveryEventsPerTick ?? preset.deliveryEventsPerTick,
    duplicateDeliveryEveryTick: options.duplicateDeliveryEveryTick ?? preset.duplicateDeliveryEveryTick,
    analyticsPrecision: options.analyticsPrecision ?? preset.analyticsPrecision
  };
}

function createOperationalRepositories(plan) {
  const orders = new Map();
  const missions = [];
  const drones = [];

  for (let tick = 1; tick <= plan.ticks; tick += 1) {
    for (let index = 1; index <= plan.deliveryEventsPerTick; index += 1) {
      const orderId = `delivery-order-${tick}-${index}`;
      const missionId = `delivery-mission-${tick}-${index}`;
      const droneId = `delivery-drone-${tick}-${index}`;
      orders.set(orderId, { id: orderId, status: "en_vuelo" });
      missions.push({ id: missionId, orderId, droneId });
      drones.push({ id: droneId, status: "en_mision" });
    }
  }

  return {
    ordersRepository: {
      findOrderById(orderId) {
        return orders.get(orderId) ?? null;
      },
      updateOrderStatus(orderId, status) {
        const order = orders.get(orderId);
        if (!order) {
          return null;
        }
        order.status = status;
        return { ...order };
      }
    },
    missionRepository: createInMemoryMissionRepository(missions),
    droneStore: createInMemoryDroneStore(drones)
  };
}

function createDeliveryCompletedEvent(tick, index) {
  return {
    eventId: `delivery-event-${tick}-${index}`,
    missionId: `delivery-mission-${tick}-${index}`,
    orderId: `delivery-order-${tick}-${index}`,
    droneId: `delivery-drone-${tick}-${index}`,
    occurredAt: `2026-05-22T20:${String(tick).padStart(2, "0")}:${String(index).padStart(2, "0")}.000Z`
  };
}

async function runOperationalPressureLab(options = {}) {
  const plan = createOperationalPressurePlan(options);
  const bus = createInMemoryPubSubEventBus();
  const notificationsQueue = createBoundedWorkQueue({ maxQueued: plan.notificationMaxQueued, maxAttempts: 2 });
  const repositories = createOperationalRepositories(plan);
  const deliveryConsumer = createDeliveryEventsConsumer(repositories);
  const telemetryBuffer = [];
  const timeline = [];
  const audit = { written: 0, dropped: 0 };
  const orders = { requested: 0, planned: 0, rejected: 0, failed: 0, deferred: 0 };
  const telemetry = { produced: 0, accepted: 0, processed: 0, dropped: 0, sampledOut: 0, peakBuffered: 0 };
  const deliveryEvents = { received: 0, processed: 0, duplicatesIgnored: 0, rejected: 0, criticalDropped: 0 };
  const notifications = { deferred: 0 };
  const dashboard = { updates: 0, degradedPrecision: plan.analyticsPrecision !== "per-event", temporalPrecision: plan.analyticsPrecision };
  let notificationAttempts = 0;

  bus.subscribe("order.created", "notification-service", async (event) => {
    return notificationsQueue.enqueue("send-order-created-notification", {
      orderId: event.orderId,
      businessCriticality: "retryable-notification"
    });
  });
  bus.subscribe("order.created", "legal-audit", async () => {
    audit.written += 1;
    return { written: true };
  });
  bus.subscribe("order.created", "dashboard-analytics", async () => {
    dashboard.updates += 1;
    return { precision: plan.analyticsPrecision };
  });

  for (let tick = 1; tick <= plan.ticks; tick += 1) {
    const tickSummary = {
      tick,
      telemetryProduced: 0,
      telemetryAccepted: 0,
      telemetryProcessed: 0,
      telemetryBacklog: 0,
      telemetryDropped: 0,
      telemetrySampledOut: 0,
      ordersRequested: 0,
      ordersPlanned: 0,
      ordersRejected: 0,
      notificationProcessed: 0,
      notificationBacklog: 0,
      notificationRejected: 0,
      deliveryProcessed: 0,
      deliveryDuplicatesIgnored: 0,
      auditWritten: 0
    };

    for (let index = 0; index < plan.telemetryProducedPerTick; index += 1) {
      telemetry.produced += 1;
      tickSummary.telemetryProduced += 1;

      if (plan.telemetrySampleEvery > 1 && (telemetry.produced - 1) % plan.telemetrySampleEvery !== 0) {
        telemetry.sampledOut += 1;
        tickSummary.telemetrySampledOut += 1;
        continue;
      }

      if (telemetryBuffer.length >= plan.telemetryBufferCapacity) {
        telemetry.dropped += 1;
        tickSummary.telemetryDropped += 1;
        continue;
      }

      telemetryBuffer.push({ id: `telemetry-${telemetry.produced}` });
      telemetry.accepted += 1;
      tickSummary.telemetryAccepted += 1;
      telemetry.peakBuffered = Math.max(telemetry.peakBuffered, telemetryBuffer.length);
    }

    const telemetryProcessed = Math.min(plan.telemetryConsumerCapacityPerTick, telemetryBuffer.length);
    telemetryBuffer.splice(0, telemetryProcessed);
    telemetry.processed += telemetryProcessed;
    tickSummary.telemetryProcessed = telemetryProcessed;
    tickSummary.telemetryBacklog = telemetryBuffer.length;

    let routeSlots = plan.routeCapacityPerTick;
    for (let index = 1; index <= plan.ordersPerTick; index += 1) {
      orders.requested += 1;
      tickSummary.ordersRequested += 1;
      const orderSequence = (tick - 1) * plan.ordersPerTick + index;

      if (plan.orderAcceptEvery > 1 && (orderSequence - 1) % plan.orderAcceptEvery !== 0) {
        orders.deferred += 1;
        notifications.deferred += 1;
        continue;
      }

      if (routeSlots <= 0) {
        orders.rejected += 1;
        tickSummary.ordersRejected += 1;
        continue;
      }

      routeSlots -= 1;
      orders.planned += 1;
      tickSummary.ordersPlanned += 1;
      await bus.publish({
        topic: "order.created",
        type: "OrderCreated",
        eventId: `order-created-${tick}-${index}`,
        orderId: `order-${String(orderSequence).padStart(3, "0")}`
      });
    }

    const notificationResults = await notificationsQueue.processBatch(async (item) => {
      notificationAttempts += 1;
      if (plan.failFirstNotification && notificationAttempts === 1) {
        throw new Error("simulated notification provider timeout");
      }
      return { sent: true, orderId: item.payload.orderId };
    }, plan.notificationWorkerCapacityPerTick);
    tickSummary.notificationProcessed = notificationResults.filter((result) => result.status === "processed").length;

    const queueMetricsAfterProcessing = notificationsQueue.getMetrics();
    tickSummary.notificationBacklog = queueMetricsAfterProcessing.queued;
    tickSummary.notificationRejected = queueMetricsAfterProcessing.rejected;

    const deliveryBatch = [];
    for (let index = 1; index <= plan.deliveryEventsPerTick; index += 1) {
      const event = createDeliveryCompletedEvent(tick, index);
      deliveryBatch.push(event);
      if (plan.duplicateDeliveryEveryTick > 0 && tick % plan.duplicateDeliveryEveryTick === 0 && index === 1) {
        deliveryBatch.push({ ...event });
      }
    }

    for (const event of deliveryBatch) {
      deliveryEvents.received += 1;
      audit.written += 1;
      const beforeProcessed = deliveryEvents.processed;
      const beforeDuplicates = deliveryEvents.duplicatesIgnored;
      const result = deliveryConsumer.consumeDeliveryCompleted(event);
      if (result.status === "processed") {
        deliveryEvents.processed += 1;
      } else if (result.status === "ignored") {
        deliveryEvents.duplicatesIgnored += 1;
      } else if (result.status === "rejected") {
        deliveryEvents.rejected += 1;
      }
      tickSummary.deliveryProcessed += deliveryEvents.processed - beforeProcessed;
      tickSummary.deliveryDuplicatesIgnored += deliveryEvents.duplicatesIgnored - beforeDuplicates;
    }

    tickSummary.auditWritten = audit.written;
    timeline.push(tickSummary);
  }

  const notificationMetrics = notificationsQueue.getMetrics();
  const rejectedNotifications = notificationsQueue.getRejectedItems().length;

  return {
    scenario: "aura-integrated-operational-pressure",
    mode: plan.mode,
    plan,
    telemetry: {
      ...telemetry,
      buffered: telemetryBuffer.length,
      backlog: telemetryBuffer.length,
      lag: telemetry.accepted - telemetry.processed
    },
    orders,
    notifications: {
      enqueued: notificationMetrics.enqueued,
      processed: notificationMetrics.processed,
      backlog: notificationMetrics.queued,
      rejected: rejectedNotifications,
      retried: notificationMetrics.retried,
      deferred: notifications.deferred,
      failed: notificationMetrics.failed
    },
    deliveryEvents,
    audit,
    dashboard,
    timeline,
    decisionSummary: {
      telemetry: plan.telemetrySampleEvery > 1
        ? `sampled one out of every ${plan.telemetrySampleEvery} telemetry packets before buffering`
        : "accepted telemetry until the bounded buffer limit was reached",
      notifications: plan.orderAcceptEvery > 1
        ? "deferred part of retryable notification work through order intake rate reduction"
        : "queued retryable notifications behind a bounded worker queue",
      dashboard: dashboard.degradedPrecision
        ? `dashboard/analytics used ${dashboard.temporalPrecision} precision under pressure`
        : "dashboard/analytics kept per-event precision",
      critical: "audit and EntregaCompletada were preserved; duplicates were idempotently ignored"
    }
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--concert") {
      options.mode = "concert";
    } else if (arg === "--overload") {
      options.mode = "overload";
    } else if (arg === "--controlled") {
      options.mode = "controlled";
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }
  return options;
}

function printOperationalPressureReport(report) {
  console.log(`Operational pressure lab: ${report.mode}`);
  console.log(`Scenario: ${report.scenario}`);
  console.log("");
  console.log("Telemetry:");
  console.log(`- produced=${report.telemetry.produced} accepted=${report.telemetry.accepted} processed=${report.telemetry.processed} buffered/backlog=${report.telemetry.backlog} dropped=${report.telemetry.dropped} sampledOut=${report.telemetry.sampledOut} lag=${report.telemetry.lag}`);
  console.log("Orders:");
  console.log(`- requested=${report.orders.requested} planned=${report.orders.planned} rejected/failed=${report.orders.rejected + report.orders.failed} deferred=${report.orders.deferred}`);
  console.log("Notifications queue:");
  console.log(`- enqueued=${report.notifications.enqueued} processed=${report.notifications.processed} backlog=${report.notifications.backlog} rejected=${report.notifications.rejected} retried=${report.notifications.retried} deferred=${report.notifications.deferred}`);
  console.log("Delivery events:");
  console.log(`- received=${report.deliveryEvents.received} processed=${report.deliveryEvents.processed} duplicatesIgnored=${report.deliveryEvents.duplicatesIgnored} rejected=${report.deliveryEvents.rejected} criticalDropped=${report.deliveryEvents.criticalDropped}`);
  console.log("Audit:");
  console.log(`- written=${report.audit.written} dropped=${report.audit.dropped}`);
  console.log("Dashboard/analytics:");
  console.log(`- updates=${report.dashboard.updates} temporalPrecision=${report.dashboard.temporalPrecision} degraded=${report.dashboard.degradedPrecision}`);
  console.log("Timeline:");
  report.timeline.forEach((entry) => {
    console.log(
      `- tick ${entry.tick}: telemetry backlog=${entry.telemetryBacklog} dropped=${entry.telemetryDropped} sampled=${entry.telemetrySampledOut}; orders planned=${entry.ordersPlanned} rejected=${entry.ordersRejected}; notifications backlog=${entry.notificationBacklog} rejected=${entry.notificationRejected}; delivery processed=${entry.deliveryProcessed} duplicates=${entry.deliveryDuplicatesIgnored}; auditWritten=${entry.auditWritten}`
    );
  });
  console.log("Decision summary:");
  console.log(`- Telemetry: ${report.decisionSummary.telemetry}`);
  console.log(`- Notifications: ${report.decisionSummary.notifications}`);
  console.log(`- Dashboard/analytics: ${report.decisionSummary.dashboard}`);
  console.log(`- Critical events: ${report.decisionSummary.critical}`);
}

function main() {
  runOperationalPressureLab(parseArgs(process.argv.slice(2)))
    .then(printOperationalPressureReport)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  createOperationalPressurePlan,
  parseArgs,
  printOperationalPressureReport,
  runOperationalPressureLab
};

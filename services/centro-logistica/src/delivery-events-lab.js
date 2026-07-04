#!/usr/bin/env node

const repository = require("./repository");
const {
  createDeliveryEventsConsumer,
  createInMemoryDroneStore,
  createInMemoryMissionRepository
} = require("./delivery-events-consumer");

const scenarios = {
  "lost-message": runLostMessageScenario,
  "duplicate-event": runDuplicateEventScenario,
  "same-mission-different-event": runSameMissionDifferentEventScenario,
  "wrong-mission": runWrongMissionScenario
};

function createOrderInFlight(orderId = "order-001") {
  return repository.createOrder({
    id: orderId,
    pickup_location: { latitude: -34.6037, longitude: -58.3816 },
    destination: { latitude: -34.6158, longitude: -58.4333 },
    status: "en_vuelo"
  });
}

function createFixture(initialDrones = [{ id: "drone-001", status: "en_mision" }]) {
  repository.resetOrders();
  const order = createOrderInFlight();
  const missionRepository = createInMemoryMissionRepository([
    { id: "mission-001", orderId: order.id, droneId: "drone-001" }
  ]);
  const droneStore = createInMemoryDroneStore(initialDrones);
  const consumer = createDeliveryEventsConsumer({ missionRepository, droneStore });

  return { consumer, droneStore };
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

function snapshot(consumer, droneStore) {
  const order = repository.findOrderById("order-001");
  const drone = droneStore.findById("drone-001");
  const mismatchedDrone = droneStore.findById("drone-002");
  const appliedEffects = consumer.getAppliedEffectsCount();

  return {
    orderStatus: order?.status ?? "missing",
    droneStatus: drone?.status ?? "missing",
    mismatchedDroneStatus: mismatchedDrone?.status,
    appliedEffects,
    duplicatedBusinessEffect: appliedEffects > 1,
    errors: consumer.getErrors()
  };
}

function runLostMessageScenario() {
  const { consumer, droneStore } = createFixture();

  return {
    name: "lost-message",
    title: "At-most-once with lost EntregaCompletada message",
    semantic: "at-most-once",
    deliveries: ["No consumer call: the message was lost before processing."],
    results: [],
    finalState: snapshot(consumer, droneStore),
    interpretation: "No business effect is duplicated, but the order and drone stay stale. This is why a critical EntregaCompletada event should not be best-effort."
  };
}

function runDuplicateEventScenario() {
  const { consumer, droneStore } = createFixture();
  const firstResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent());
  const secondResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent());

  return {
    name: "duplicate-event",
    title: "At-least-once with same eventId delivered twice",
    semantic: "at-least-once + technical deduplication",
    deliveries: ["First delivery: event-001", "Second delivery: event-001 again"],
    results: [firstResult, secondResult],
    finalState: snapshot(consumer, droneStore),
    interpretation: "The duplicated message is ignored by eventId, so the business effect is applied exactly once."
  };
}

function runSameMissionDifferentEventScenario() {
  const { consumer, droneStore } = createFixture();
  const firstResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({ eventId: "event-001" }));
  const secondResult = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({ eventId: "event-002" }));

  return {
    name: "same-mission-different-event",
    title: "Different eventIds describing the same completed mission",
    semantic: "at-least-once + business-state idempotency",
    deliveries: ["First delivery: event-001 for mission-001", "Second delivery: event-002 for mission-001"],
    results: [firstResult, secondResult],
    finalState: snapshot(consumer, droneStore),
    interpretation: "eventId alone is not enough: the consumer also checks order.status and avoids reapplying a completed business fact."
  };
}

function runWrongMissionScenario() {
  const { consumer, droneStore } = createFixture([
    { id: "drone-001", status: "en_mision" },
    { id: "drone-002", status: "en_mision" }
  ]);
  const result = consumer.consumeDeliveryCompleted(deliveryCompletedEvent({
    eventId: "event-bad-mission",
    droneId: "drone-002"
  }));

  return {
    name: "wrong-mission",
    title: "EntregaCompletada inconsistent with local mission state",
    semantic: "integrity validation before business effect",
    deliveries: ["One delivery with mission-001 but drone-002"],
    results: [result],
    finalState: snapshot(consumer, droneStore),
    interpretation: "Idempotency does not replace integrity checks. The event is rejected before changing order or drone state."
  };
}

function printScenario(report) {
  console.log(`Scenario: ${report.name}`);
  console.log(`Title: ${report.title}`);
  console.log(`Semantic: ${report.semantic}`);
  console.log("");
  console.log("Deliveries:");
  report.deliveries.forEach((delivery) => console.log(`- ${delivery}`));
  console.log("");
  console.log("Consumer results:");
  if (report.results.length === 0) {
    console.log("- none: consumer was not invoked");
  } else {
    report.results.forEach((result, index) => {
      console.log(`- #${index + 1}: ${JSON.stringify(result)}`);
    });
  }
  console.log("");
  console.log("Final state:");
  console.log(`- order.status: ${report.finalState.orderStatus}`);
  console.log(`- drone.status: ${report.finalState.droneStatus}`);
  if (report.finalState.mismatchedDroneStatus !== undefined) {
    console.log(`- drone-002.status: ${report.finalState.mismatchedDroneStatus}`);
  }
  console.log(`- appliedEffects: ${report.finalState.appliedEffects}`);
  console.log(`- duplicatedBusinessEffect: ${report.finalState.duplicatedBusinessEffect}`);
  console.log(`- errors: ${JSON.stringify(report.finalState.errors)}`);
  console.log("");
  console.log(`Interpretation: ${report.interpretation}`);
}

function printUsage() {
  console.error("Usage: node src/delivery-events-lab.js <scenario>");
  console.error("Scenarios:");
  Object.keys(scenarios).forEach((scenario) => console.error(`- ${scenario}`));
}

function main() {
  const scenarioName = process.argv[2];
  const runScenario = scenarios[scenarioName];

  if (!runScenario) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  printScenario(runScenario());
}

if (require.main === module) {
  main();
}

module.exports = {
  scenarios
};

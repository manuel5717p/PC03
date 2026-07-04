const repository = require("./repository");

function createInMemoryEventStore() {
  const processedEventIds = new Set();

  return {
    hasProcessed(eventId) {
      return processedEventIds.has(eventId);
    },
    markProcessed(eventId) {
      processedEventIds.add(eventId);
    },
    count() {
      return processedEventIds.size;
    }
  };
}

function createInMemoryMissionRepository(initialMissions = []) {
  const missions = new Map(initialMissions.map((mission) => [mission.id, { ...mission }]));

  return {
    save(mission) {
      missions.set(mission.id, { ...mission });
      return missions.get(mission.id);
    },
    findById(missionId) {
      return missions.get(missionId) || null;
    }
  };
}

function createInMemoryDroneStore(initialDrones = []) {
  const drones = new Map(initialDrones.map((drone) => [drone.id, { ...drone }]));

  return {
    save(drone) {
      drones.set(drone.id, { ...drone });
      return drones.get(drone.id);
    },
    findById(droneId) {
      return drones.get(droneId) || null;
    },
    updateStatus(droneId, status) {
      const drone = drones.get(droneId);
      if (!drone) {
        return null;
      }
      drone.status = status;
      return drone;
    }
  };
}

function validateDeliveryCompletedEvent(event, mission, order, drone) {
  if (!event || typeof event !== "object") {
    return "evento inválido";
  }
  if (!event.eventId) {
    return "eventId requerido";
  }
  if (!event.missionId || !event.orderId || !event.droneId) {
    return "missionId, orderId y droneId son requeridos";
  }
  if (!mission) {
    return "misión no encontrada";
  }
  if (!order) {
    return "orden no encontrada";
  }
  if (!drone) {
    return "dron no encontrado";
  }
  if (mission.orderId !== event.orderId || mission.droneId !== event.droneId) {
    return "evento inconsistente con la misión";
  }
  if (order.id !== mission.orderId || drone.id !== mission.droneId) {
    return "estado local inconsistente con la misión";
  }

  return null;
}

function createDeliveryEventsConsumer(options = {}) {
  const ordersRepository = options.ordersRepository ?? repository;
  const missionRepository = options.missionRepository ?? createInMemoryMissionRepository();
  const droneStore = options.droneStore ?? createInMemoryDroneStore();
  const eventStore = options.eventStore ?? createInMemoryEventStore();
  let appliedEffects = 0;
  const errors = [];

  return {
    consumeDeliveryCompleted(event) {
      if (eventStore.hasProcessed(event?.eventId)) {
        return { status: "ignored", reason: "duplicate_event_id", applied: false };
      }

      const mission = missionRepository.findById(event?.missionId);
      const order = ordersRepository.findOrderById(event?.orderId);
      const drone = droneStore.findById(event?.droneId);
      const validationError = validateDeliveryCompletedEvent(event, mission, order, drone);

      if (validationError) {
        const error = { eventId: event?.eventId ?? null, reason: validationError };
        errors.push(error);
        return { status: "rejected", reason: validationError, applied: false };
      }

      eventStore.markProcessed(event.eventId);

      if (order.status === "entregada") {
        return { status: "ignored", reason: "order_already_delivered", applied: false };
      }

      ordersRepository.updateOrderStatus(order.id, "entregada");
      droneStore.updateStatus(drone.id, "disponible");
      appliedEffects += 1;

      return { status: "processed", applied: true };
    },
    getAppliedEffectsCount() {
      return appliedEffects;
    },
    getErrors() {
      return [...errors];
    }
  };
}

module.exports = {
  createDeliveryEventsConsumer,
  createInMemoryDroneStore,
  createInMemoryEventStore,
  createInMemoryMissionRepository
};

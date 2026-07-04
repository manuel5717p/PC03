const express = require("express");
const { randomUUID } = require("node:crypto");
const { validateOrder } = require("./models");
const repository = require("./repository");
const { planRouteForOrder } = require("./route-planner-client");

function createRoutes(options = {}) {
  const router = express.Router();

  router.post("/api/v1/orders", async (req, res) => {
    const correlationId = req.get("X-Correlation-Id") || randomUUID();
    res.set("X-Correlation-Id", correlationId);

    const validationError = validateOrder(req.body);
    if (validationError) {
      return res.status(400).json({ detail: validationError });
    }

    const idempotencyKey = req.get("Idempotency-Key");
    const existingOrder = repository.findOrderByIdempotencyKey(idempotencyKey);
    if (existingOrder) {
      return res.status(200).json({ ...existingOrder, idempotent_replay: true });
    }

    const draftOrder = {
      id: req.body.id ?? randomUUID(),
      pickup_location: req.body.pickup_location,
      destination: req.body.destination,
      status: req.body.status ?? "pendiente"
    };

    try {
      const routePlannerResult = await planRouteForOrder(draftOrder, {
        ...options.routePlanner,
        correlationId,
        idempotencyKey
      });
      const created = repository.createOrder({ ...req.body, id: draftOrder.id }, {
        idempotencyKey,
        routePlan: routePlannerResult.plan,
        routePlannerAttempts: routePlannerResult.attempts
      });
      return res.status(201).json(created);
    } catch (error) {
      const plannerStatus = error.metadata?.status;
      if (error.metadata?.retryable === false && plannerStatus >= 400 && plannerStatus < 500) {
        return res.status(plannerStatus).json({
          detail: "planificador-rutas rechazó la solicitud; orden no creada",
          attempts: error.metadata.attempts ?? 0
        });
      }

      return res.status(503).json({
        detail: "planificador-rutas no disponible; orden no creada para evitar efecto parcial",
        attempts: error.metadata?.attempts ?? 0
      });
    }
  });

  router.get("/api/v1/orders", (_req, res) => {
    res.json(repository.listOrders());
  });

  return router;
}

module.exports = { createRoutes };

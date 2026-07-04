const express = require("express");
const { validateDrone, normalizeDrone } = require("./models");
const repository = require("./repository");

const router = express.Router();

router.post("/api/v1/drones", (req, res) => {
  const validationError = validateDrone(req.body);
  if (validationError) {
    return res.status(400).json({ detail: validationError });
  }

  if (repository.getDrone(req.body.id)) {
    return res.status(409).json({ detail: `El dron con id '${req.body.id}' ya existe.` });
  }

  const created = repository.createDrone(normalizeDrone(req.body));
  return res.status(201).json(created);
});

router.get("/api/v1/drones", (_req, res) => {
  res.json(repository.listDrones());
});

router.get("/api/v1/drones/disponibles", (_req, res) => {
  res.json(repository.listAvailableDrones());
});

module.exports = router;

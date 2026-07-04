const express = require("express");
const { planSimpleRoute } = require("./planner");

const router = express.Router();

router.post("/api/v1/routes/plan", (req, res) => {
  const correlationId = req.get("X-Correlation-Id");
  if (correlationId) {
    res.set("X-Correlation-Id", correlationId);
  }

  try {
    const plan = planSimpleRoute(req.body || {});
    res.status(200).json(plan);
  } catch (error) {
    res.status(400).json({ detail: error.message });
  }
});

module.exports = router;

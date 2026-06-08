const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireSensorAccess } = require("../authorization");
const { idempotency } = require("../idempotency");
const { problem } = require("../problem");
const { paginate } = require("../pagination");

const router = Router();

// GET /sensors/:sensorId/measures
router.get("/:sensorId/measures", authenticate, requireScope("measures:read"), requireRoles("admin", "operator", "reader", "device"), requireSensorAccess, (req, res) => {
  const measures = db.measures.filter((m) => m.sensorId === req.params.sensorId);
  res.json(paginate(measures, req.query));
});

// POST /sensors/:sensorId/measures (protégé)
router.post("/:sensorId/measures", authenticate, requireScope("measures:write"), requireRoles("admin", "device"), requireSensorAccess, idempotency, (req, res) => {
  const sensor = req.sensor;

  if (sensor.status === "inactive") {
    return problem(res, 409, "sensorUnavailable", `Le capteur '${sensor.id}' est actuellement hors ligne`);
  }

  const { timestamp, value } = req.body;
  const errors = [];

  if (!timestamp) {
    errors.push({ field: "timestamp", reason: "Le champ timestamp est requis" });
  }
  if (value === undefined || value === null) {
    errors.push({ field: "value", reason: "Le champ value est requis" });
  }

  if (errors.length > 0) {
    return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
  }

  const measure = {
    id: nextId("measure"),
    sensorId: sensor.id,
    timestamp,
    value,
  };

  db.measures.push(measure);
  res.status(201).json(measure);
});

module.exports = router;

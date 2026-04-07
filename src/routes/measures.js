const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");

const router = Router();

// GET /sensors/:sensorId/measures
router.get("/:sensorId/measures", (req, res) => {
  const sensor = db.sensors.find((s) => s.id === req.params.sensorId);
  if (!sensor) {
    return res.status(404).json({
      code: "notFound",
      message: `Capteur '${req.params.sensorId}' introuvable`,
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 99, 499);
  const offset = parseInt(req.query.offset) || 0;

  const data = db.measures
    .filter((m) => m.sensorId === req.params.sensorId)
    .slice(offset, offset + limit);

  res.json({ data });
});

// POST /sensors/:sensorId/measures
router.post("/:sensorId/measures", (req, res) => {
  const sensor = db.sensors.find((s) => s.id === req.params.sensorId);

  if (!sensor) {
    return res.status(404).json({
      code: "notFound",
      message: `Capteur '${req.params.sensorId}' introuvable`,
    });
  }

  if (sensor.status === "inactive") {
    return res.status(409).json({
      code: "deviceUnavailable",
      message: `Le capteur '${sensor.id}' est actuellement hors ligne`,
    });
  }

  const { timestamp, value } = req.body;
  const details = [];

  if (!timestamp) {
    details.push({ field: "timestamp", reason: "Le champ timestamp est requis" });
  }
  if (value === undefined || value === null) {
    details.push({ field: "value", reason: "Le champ value est requis" });
  }

  if (details.length > 0) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Payload invalide",
      details,
    });
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

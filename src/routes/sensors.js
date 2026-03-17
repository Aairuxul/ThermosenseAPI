const { Router } = require("express");
const db = require("../store");

const router = Router();

// GET /sensors/:sensorId
router.get("/:sensorId", (req, res) => {
  const sensor = db.sensors.find((s) => s.id === req.params.sensorId);

  if (!sensor) {
    return res.status(404).json({
      code: "notFound",
      message: `Capteur '${req.params.sensorId}' introuvable`,
    });
  }

  res.json(sensor);
});

module.exports = router;

const { Router } = require("express");
const { authenticate } = require("../auth");
const { requireScope, requireSensorAccess } = require("../authorization");

const router = Router();

// GET /sensors/:sensorId
router.get(
  "/:sensorId",
  authenticate,
  requireScope("sensors:read"),
  requireSensorAccess,
  (req, res) => {
    res.json(req.sensor);
  }
);

module.exports = router;

const { Router } = require("express");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireSensorAccess } = require("../authorization");

const router = Router();

// GET /sensors/:sensorId
router.get(
  "/:sensorId",
  authenticate,
  requireScope("sensors:read"),
  requireRoles("admin", "operator", "reader", "device"),
  requireSensorAccess,
  (req, res) => {
    res.json(req.sensor);
  }
);

module.exports = router;

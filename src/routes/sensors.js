const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
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

router.post(
  "/",
  authenticate,
  requireScope("sensors:write"),
  requireRoles("admin", "operator"),
  (req, res) => {
    const { type, status, areaId } = req.body;
    const details = [];

    if (!type) {
      details.push({ field: "type", reason: "Le champ type est requis" });
    }
    if (!status) {
      details.push({ field: "status", reason: "Le champ status est requis" });
    }
    if (!areaId) {
      details.push({ field: "areaId", reason: "Le champ areaId est requis" });
    }

    if (type && !["temperature", "humidity"].includes(type)) {
      details.push({
        field: "type",
        reason: "type doit etre temperature ou humidity",
      });
    }

    if (status && !["active", "inactive"].includes(status)) {
      details.push({
        field: "status",
        reason: "status doit etre active ou inactive",
      });
    }

    if (details.length > 0) {
      return res.status(400).json({
        code: "invalidParameter",
        message: "Payload invalide",
        details,
      });
    }

    const area = db.areas.find((item) => item.id === areaId);
    if (!area) {
      return res.status(404).json({
        code: "notFound",
        message: `Zone '${areaId}' introuvable`,
      });
    }

    if (req.user.role === "operator" && req.user.zone !== areaId) {
      return res.status(404).json({
        code: "notFound",
        message: `Zone '${areaId}' non authorisée pour cet opérateur`,
      });
    }

    const sensor = {
      id: nextId("sensor"),
      type,
      status,
      areaId,
    };

    db.sensors.push(sensor);
    if (Array.isArray(area.sensors)) {
      area.sensors.push(sensor);
    }

    return res.status(201).json(sensor);
  }
);

module.exports = router;

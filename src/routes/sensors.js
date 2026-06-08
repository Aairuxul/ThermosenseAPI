const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireSensorAccess } = require("../authorization");
const { problem } = require("../problem");

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

// POST /sensors
router.post(
  "/",
  authenticate,
  requireScope("sensors:write"),
  requireRoles("admin", "operator"),
  (req, res) => {
    const { type, status, areaId } = req.body;
    const errors = [];

    if (!type) {
      errors.push({ field: "type", reason: "Le champ type est requis" });
    }
    if (!status) {
      errors.push({ field: "status", reason: "Le champ status est requis" });
    }
    if (!areaId) {
      errors.push({ field: "areaId", reason: "Le champ areaId est requis" });
    }
    if (type && !["temperature", "humidity"].includes(type)) {
      errors.push({ field: "type", reason: "type doit etre temperature ou humidity" });
    }
    if (status && !["active", "inactive"].includes(status)) {
      errors.push({ field: "status", reason: "status doit etre active ou inactive" });
    }

    if (errors.length > 0) {
      return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
    }

    const area = db.areas.find((item) => item.id === areaId);
    if (!area) {
      return problem(res, 404, "notFound", `Zone '${areaId}' introuvable`);
    }

    // Masquage BOLA : un opérateur hors de sa zone reçoit le même 404 qu'une zone inexistante.
    if (req.user.role === "operator" && req.user.zone !== areaId) {
      return problem(res, 404, "notFound", `Zone '${areaId}' introuvable`);
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

const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireAreaAccess } = require("../authorization");
const { problem } = require("../problem");
const { paginate } = require("../pagination");

const router = Router();

// GET /areas/:areaId/alert-thresholds
router.get("/:areaId/alert-thresholds", authenticate, requireScope("alert-thresholds:read"), requireRoles("admin", "operator", "reader"), requireAreaAccess, (req, res) => {
  const sensorIds = db.sensors
    .filter((s) => s.areaId === req.params.areaId)
    .map((s) => s.id);

  const thresholds = db.alertThresholds.filter((t) =>
    sensorIds.includes(t.sensorId)
  );

  res.json(paginate(thresholds, req.query));
});

// POST /areas/:areaId/alert-thresholds (protégé)
router.post("/:areaId/alert-thresholds", authenticate, requireScope("alert-thresholds:write"), requireRoles("admin", "operator"), requireAreaAccess, (req, res) => {
  const { sensorId, thresholdValue, comparisonOperator } = req.body;
  const errors = [];

  if (!sensorId) {
    errors.push({ field: "sensorId", reason: "Le champ sensorId est requis" });
  }
  if (thresholdValue === undefined || thresholdValue === null) {
    errors.push({ field: "thresholdValue", reason: "Le champ thresholdValue est requis" });
  }
  if (!comparisonOperator) {
    errors.push({ field: "comparisonOperator", reason: "Le champ comparisonOperator est requis" });
  }
  if (
    comparisonOperator &&
    !["greaterThan", "lessThan", "equalTo"].includes(comparisonOperator)
  ) {
    errors.push({ field: "comparisonOperator", reason: "comparisonOperator doit être greaterThan, lessThan ou equalTo" });
  }

  if (errors.length > 0) {
    return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
  }

  // Vérifier que le capteur appartient à cette zone
  const sensorInZone = db.sensors.find(
    (s) => s.id === sensorId && s.areaId === req.params.areaId
  );
  if (!sensorInZone) {
    return problem(res, 400, "invalidParameter", "Le capteur spécifié n'appartient pas à cette zone", {
      errors: [{ field: "sensorId", reason: "Le capteur spécifié n'appartient pas à cette zone" }],
    });
  }

  const threshold = {
    id: nextId("threshold"),
    sensorId,
    thresholdValue,
    comparisonOperator,
  };

  db.alertThresholds.push(threshold);
  res.status(201).json(threshold);
});

module.exports = router;

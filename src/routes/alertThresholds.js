const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../store");

const router = Router();

// GET /areas/:areaId/alert-thresholds
router.get("/:areaId/alert-thresholds", (req, res) => {
  const area = db.areas.find((a) => a.id === req.params.areaId);
  if (!area) {
    return res.status(404).json({
      code: "notFound",
      message: `Zone '${req.params.areaId}' introuvable`,
    });
  }

  const sensorIds = db.sensors
    .filter((s) => s.areaId === req.params.areaId)
    .map((s) => s.id);

  const thresholds = db.alertThresholds.filter((t) =>
    sensorIds.includes(t.sensorId)
  );

  res.json(thresholds);
});

// POST /areas/:areaId/alert-thresholds
router.post("/:areaId/alert-thresholds", (req, res) => {
  const area = db.areas.find((a) => a.id === req.params.areaId);
  if (!area) {
    return res.status(404).json({
      code: "notFound",
      message: `Zone '${req.params.areaId}' introuvable`,
    });
  }

  const { sensorId, thresholdValue, comparisonOperator } = req.body;
  const details = [];

  if (!sensorId) {
    details.push({ field: "sensorId", reason: "Le champ sensorId est requis" });
  }
  if (thresholdValue === undefined || thresholdValue === null) {
    details.push({
      field: "thresholdValue",
      reason: "Le champ thresholdValue est requis",
    });
  }
  if (!comparisonOperator) {
    details.push({
      field: "comparisonOperator",
      reason: "Le champ comparisonOperator est requis",
    });
  }
  if (
    comparisonOperator &&
    !["greaterThan", "lessThan", "equalTo"].includes(comparisonOperator)
  ) {
    details.push({
      field: "comparisonOperator",
      reason: "comparisonOperator doit être greaterThan, lessThan ou equalTo",
    });
  }

  if (details.length > 0) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Payload invalide",
      details,
    });
  }

  // Vérifier que le capteur appartient à cette zone
  const sensorInZone = db.sensors.find(
    (s) => s.id === sensorId && s.areaId === req.params.areaId
  );
  if (!sensorInZone) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Le capteur spécifié n'appartient pas à cette zone",
    });
  }

  const threshold = {
    id: uuidv4(),
    sensorId,
    thresholdValue,
    comparisonOperator,
  };

  db.alertThresholds.push(threshold);
  res.status(201).json(threshold);
});

module.exports = router;

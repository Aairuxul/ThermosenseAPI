const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../store");

const router = Router();

// POST /areas
router.post("/", (req, res) => {
  const { buildingId, name } = req.body;
  const details = [];

  if (!buildingId) {
    details.push({ field: "buildingId", reason: "Le champ buildingId est requis" });
  }
  if (!name) {
    details.push({ field: "name", reason: "Le champ name est requis" });
  }

  if (details.length > 0) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Payload invalide",
      details,
    });
  }

  const area = { id: uuidv4(), name, buildingId, sensors: [] };
  db.areas.push(area);
  res.status(201).json(area);
});

module.exports = router;

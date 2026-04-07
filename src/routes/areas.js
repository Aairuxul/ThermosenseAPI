const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { filterAreasForUser, requireScope } = require("../authorization");

const router = Router();

// GET /areas
router.get("/", authenticate, requireScope("areas:read"), (req, res) => {
  const data = filterAreasForUser(req.user);
  res.json({ data });
});

// POST /areas (protégé)
router.post("/", authenticate, requireScope("areas:write"), (req, res) => {
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

  const area = { id: nextId("area"), name, buildingId, sensors: [] };
  db.areas.push(area);
  res.status(201).json(area);
});

module.exports = router;

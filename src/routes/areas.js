const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { filterAreasForUser, requireRoles, requireScope } = require("../authorization");
const { problem } = require("../problem");
const { paginate } = require("../pagination");

const router = Router();

// GET /areas
router.get("/", authenticate, requireScope("areas:read"), requireRoles("admin", "operator", "reader"), (req, res) => {
  res.json(paginate(filterAreasForUser(req.user), req.query));
});

// POST /areas (protégé)
router.post("/", authenticate, requireScope("areas:write"), requireRoles("admin"), (req, res) => {
  const { buildingId, name } = req.body;
  const errors = [];

  if (!buildingId) {
    errors.push({ field: "buildingId", reason: "Le champ buildingId est requis" });
  }
  if (!name) {
    errors.push({ field: "name", reason: "Le champ name est requis" });
  }

  if (errors.length > 0) {
    return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
  }

  const area = { id: nextId("area"), name, buildingId, sensors: [] };
  db.areas.push(area);
  res.status(201).json(area);
});

module.exports = router;

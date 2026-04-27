const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireUserAccess } = require("../authorization");

const router = Router();

// POST /users (protégé)
router.post("/", authenticate, requireScope("users:write"), requireRoles("admin"), async (req, res) => {
  const { email, name } = req.body;
  const details = [];

  if (!email) {
    details.push({ field: "email", reason: "Le champ email est requis" });
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

  const user = { id: nextId("user"), email, name, role: "operator", zone: null };
  db.users.push(user);

  res.status(201).json({ id: user.id, email: user.email });
});

// GET /users/:userId
router.get("/:userId", authenticate, requireScope("users:read"), requireRoles("admin", "operator", "reader"), requireUserAccess, (req, res) => {
  const user = req.targetUser;
  res.json({ id: user.id, email: user.email, name: user.name });
});

module.exports = router;

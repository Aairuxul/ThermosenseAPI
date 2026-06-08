const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const { requireRoles, requireScope, requireUserAccess } = require("../authorization");
const { problem } = require("../problem");

const router = Router();

const VALID_ROLES = ["admin", "operator", "reader", "device"];

// POST /users (protégé)
router.post("/", authenticate, requireScope("users:write"), requireRoles("admin"), async (req, res) => {
  const { email, name, role } = req.body;
  const errors = [];

  if (!email) {
    errors.push({ field: "email", reason: "Le champ email est requis" });
  }
  if (!name) {
    errors.push({ field: "name", reason: "Le champ name est requis" });
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    errors.push({ field: "role", reason: `role doit être l'un de : ${VALID_ROLES.join(", ")}` });
  }

  if (errors.length > 0) {
    return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
  }

  // Rôle par défaut `reader` (moindre privilège), conforme à UserCreateRequest du contrat.
  const user = { id: nextId("user"), email, name, role: role || "reader", zone: null };
  db.users.push(user);

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// GET /users/:userId
router.get("/:userId", authenticate, requireScope("users:read"), requireRoles("admin", "operator", "reader"), requireUserAccess, (req, res) => {
  const user = req.targetUser;
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

module.exports = router;

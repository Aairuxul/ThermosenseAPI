const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../store");

const router = Router();

// POST /users
router.post("/", (req, res) => {
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

  const user = { id: uuidv4(), email, name, role: "operator", zone: null };
  db.users.push(user);

  res.status(201).json({ id: user.id, email: user.email });
});

// GET /users/:userId
router.get("/:userId", (req, res) => {
  const user = db.users.find((u) => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json({
      code: "notFound",
      message: `Utilisateur '${req.params.userId}' introuvable`,
    });
  }

  res.json({ id: user.id, email: user.email, name: user.name });
});

module.exports = router;

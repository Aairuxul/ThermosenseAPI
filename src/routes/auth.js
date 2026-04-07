const { Router } = require("express");
const bcrypt = require("bcryptjs");
const db = require("../store");
const { generateToken } = require("../auth");
const { logAuth } = require("../security-logger");

const router = Router();

/**
 * POST /auth/login
 * Authentification avec email et password
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        code: "invalidParameter",
        message: "Email et password sont requis",
        details: [
          ...(!email ? [{ field: "email", reason: "Le champ email est requis" }] : []),
          ...(!password ? [{ field: "password", reason: "Le champ password est requis" }] : []),
        ],
      });
    }

    // Chercher l'utilisateur
    const user = db.users.find((u) => u.email === email);

    if (!user || !user.password) {
      logAuth('FAILURE', email, null, 'Unknown email');
      return res.status(401).json({
        code: "unauthorized",
        message: "Email ou mot de passe incorrect",
      });
    }

    // Vérifier le password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      logAuth('FAILURE', email, user.role, 'Invalid password');
      return res.status(401).json({
        code: "unauthorized",
        message: "Email ou mot de passe incorrect",
      });
    }

    // Générer le token JWT
    const token = generateToken(user);
    logAuth('SUCCESS', user.email, user.role, `Login successful (${user.id})`);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erreur lors du login:", error);
    next(error); // Passer au gestionnaire d'erreurs global
  }
});

module.exports = router;

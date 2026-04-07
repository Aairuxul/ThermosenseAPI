const { Router } = require("express");
const bcrypt = require("bcryptjs");
const db = require("../store");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../auth");
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

    // Générer les tokens JWT
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    logAuth('SUCCESS', user.email, user.role, `Login successful (${user.id})`);

    res.json({
      token,
      refreshToken,
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

/**
 * POST /auth/refresh
 * Renouvelle les tokens à partir d'un refresh token valide
 */
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Le champ refreshToken est requis",
      details: [{ field: "refreshToken", reason: "Le champ refreshToken est requis" }],
    });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const userId = decoded.userId || decoded.sub;
    const user = db.users.find((u) => u.id === userId);

    if (!user) {
      return res.status(401).json({
        code: "unauthorized",
        message: "Refresh token invalide",
      });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return res.status(401).json({
      code: "unauthorized",
      message: "Refresh token invalide ou expiré",
    });
  }
});

module.exports = router;

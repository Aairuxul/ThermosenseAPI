const jwt = require("jsonwebtoken");

// Clé secrète JWT (dans un vrai projet, utilisez une variable d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || "thermosense-secret-key-change-in-production";

/**
 * Middleware d'authentification JWT
 * Vérifie le token Bearer et ajoute req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      code: "unauthorized",
      message: "Token d'authentification manquant ou invalide",
    });
  }

  const token = authHeader.substring(7); // Enlever "Bearer "

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email, role }
    next();
  } catch (err) {
    return res.status(401).json({
      code: "unauthorized",
      message: "Token invalide ou expiré",
    });
  }
}

/**
 * Génère un JWT pour un utilisateur
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  // Token valide 24h
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

module.exports = {
  authenticate,
  generateToken,
  JWT_SECRET,
};

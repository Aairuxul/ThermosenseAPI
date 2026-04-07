const jwt = require("jsonwebtoken");

// Clé secrète JWT (dans un vrai projet, utilisez une variable d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || "thermosense-secret-key-change-in-production";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "thermosense-api";

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
    const decoded = jwt.verify(token, JWT_SECRET, { audience: JWT_AUDIENCE });
    req.user = decoded;
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
    sub: user.id,
    email: user.email,
    role: user.role,
    scope: user.role === "admin" ? "read write admin" : user.role === "operator" ? "read write" : "read",
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30m", audience: JWT_AUDIENCE });
}

module.exports = {
  authenticate,
  generateToken,
  JWT_SECRET,
  JWT_AUDIENCE,
};

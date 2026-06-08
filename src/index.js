const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const { logRateLimit } = require("./security-logger");
const { problem } = require("./problem");

const db = require("./store");
const authRouter = require("./routes/auth");
const areasRouter = require("./routes/areas");
const sensorsRouter = require("./routes/sensors");
const measuresRouter = require("./routes/measures");
const { areaActuatorsRouter, actuatorsRouter } = require("./routes/actuators");
const alertThresholdsRouter = require("./routes/alertThresholds");
const usersRouter = require("./routes/users");
const { authenticate } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Charger le fichier OpenAPI
const swaggerDocument = YAML.load(path.join(__dirname, "..", "contrat-openapi.yaml"));

// Configurer le serveur par défaut selon l'environnement
if (process.env.NODE_ENV !== 'production') {
  // En dev, mettre localhost en premier
  const localhostServer = {
    url: `http://localhost:${PORT}/v1`,
    description: "Serveur de développement local"
  };

  // Retirer l'ancien localhost s'il existe et ajouter le nouveau avec le bon port
  swaggerDocument.servers = [
    localhostServer,
    ...swaggerDocument.servers.filter(s => !s.url.includes('localhost'))
  ];
}

app.use(helmet());
app.use(cors());
app.use(express.json());

// --- Rate limiting ---
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10, // 10 tentatives par fenetre
  standardHeaders: true, // RateLimit-* (draft IETF) + Retry-After
  legacyHeaders: true, // X-RateLimit-* (documentés dans le contrat)
  handler: (req, res) => {
    logRateLimit(req.ip, "/auth/login");
    problem(res, 429, "rateLimitExceeded", "Trop de tentatives de connexion. Réessayez dans 15 minutes.", {
      type: "https://thermosense.com/errors/rate-limit",
      instance: req.originalUrl,
    });
  },
});

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_MAX) || 100, // 100 requetes par minute
  standardHeaders: true, // RateLimit-* (draft IETF) + Retry-After
  legacyHeaders: true, // X-RateLimit-* (documentés dans le contrat)
  handler: (req, res) => {
    logRateLimit(req.ip, req.path);
    problem(res, 429, "rateLimitExceeded", "Trop de requetes. Réessayez dans quelques instants.", {
      type: "https://thermosense.com/errors/rate-limit",
      instance: req.originalUrl,
    });
  },
});

// --- Health check (versionné + alias non-versionné pour les load balancers) ---
const healthHandler = (req, res) => {
  res.json({
    status: "ok",
    message: "API is running",
    database: "initialized"
  });
};
app.get("/v1/health", healthHandler);
app.get("/health", healthHandler);

// --- Documentation Swagger (non versionnée) ---
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "ThermoSense API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    requestInterceptor: (request) => {
      if (!request.headers) {
        return request;
      }

      const authorizationHeaderName = Object.keys(request.headers)
        .find((headerName) => headerName.toLowerCase() === "authorization");

      if (!authorizationHeaderName) {
        return request;
      }

      let token = String(request.headers[authorizationHeaderName] || "");

      for (let index = 0; index < 2; index += 1) {
        token = token.trim();
        token = token.replace(/^Bearer\s+/i, "").trim();
        token = token.replace(/^['"]+|['"]+$/g, "").trim();
      }

      const jwtMatch = token.match(/[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/);
      if (jwtMatch) {
        token = jwtMatch[0];
      }

      if (!token) {
        return request;
      }

      request.headers[authorizationHeaderName] = `Bearer ${token}`;
      return request;
    },
  },
}));

// --- Routes publiques (versionnées sous /v1) ---
app.use("/v1/auth", loginLimiter, authRouter);

// --- Routes protégées (versionnées sous /v1) ---
// Rate limiting global + BOLA/BFLA via middleware d'authentification et d'autorisation
app.use("/v1/areas", apiLimiter, areasRouter);
app.use("/v1/sensors", apiLimiter, sensorsRouter);
app.use("/v1/sensors", apiLimiter, measuresRouter);
app.use("/v1/areas", apiLimiter, alertThresholdsRouter);
app.use("/v1/areas", apiLimiter, areaActuatorsRouter);
app.use("/v1/actuators", apiLimiter, actuatorsRouter);
app.use("/v1/users", apiLimiter, usersRouter);

// 404 pour les routes non définies
app.use((req, res) => {
  problem(res, 404, "notFound", `Route ${req.method} ${req.path} introuvable`, { instance: req.originalUrl });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error("❌ Erreur serveur:", err);
  
  // Erreur de base de données non initialisée
  if (err.message && err.message.includes("Database not yet initialized")) {
    return problem(res, 503, "serviceUnavailable", "La base de données est en cours d'initialisation. Veuillez réessayer dans quelques secondes.", { instance: req.originalUrl });
  }

  // Erreur JWT
  if (err.name === "JsonWebTokenError") {
    return problem(res, 401, "unauthorized", "Token JWT invalide", { instance: req.originalUrl });
  }

  if (err.name === "TokenExpiredError") {
    return problem(res, 401, "unauthorized", "Token JWT expiré", { instance: req.originalUrl });
  }

  // Erreur générique — le détail technique n'est exposé qu'en dev.
  const detail = process.env.NODE_ENV !== "production" && err.message
    ? `Une erreur interne est survenue : ${err.message}`
    : "Une erreur interne est survenue";
  problem(res, 500, "internalError", detail, { instance: req.originalUrl });
});

// Initialiser la base de données puis démarrer le serveur
(async () => {
  try {
    console.log("🔄 Initialisation de la base de données...");
    await db.init();
    
    app.listen(PORT, () => {
      console.log(`\n✅ ThermoSense API démarrée sur http://localhost:${PORT}`);
      console.log(`Documentation Swagger disponible sur http://localhost:${PORT}/api-docs`);
      console.log(`Compte de test: email="root" password="root"\n`);
    });
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation:", error);
    process.exit(1);
  }
})();

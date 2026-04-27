const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const { logRateLimit } = require("./security-logger");

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
    url: `http://localhost:${PORT}`,
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives par fenetre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "tooManyRequests",
    message: "Trop de tentatives de connexion. Reessayez dans 15 minutes.",
  },
  handler: (req, res, next, options) => {
    logRateLimit(req.ip, "/auth/login");
    res.status(429).json(options.message);
  },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requetes par minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "tooManyRequests",
    message: "Trop de requetes. Reessayez dans quelques instants.",
  },
  handler: (req, res, next, options) => {
    logRateLimit(req.ip, req.path);
    res.status(429).json(options.message);
  },
});

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "API is running",
    database: "initialized"
  });
});

// --- Documentation Swagger ---
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

// --- Routes publiques ---
app.use("/auth", loginLimiter, authRouter);

// --- Routes protégées ---
// Rate limiting global + BOLA/BFLA via middleware d'authentification et d'autorisation
app.use("/areas", apiLimiter, areasRouter);
app.use("/sensors", apiLimiter, sensorsRouter);
app.use("/sensors", apiLimiter, measuresRouter);
app.use("/areas", apiLimiter, alertThresholdsRouter);
app.use("/areas", apiLimiter, areaActuatorsRouter);
app.use("/actuators", apiLimiter, actuatorsRouter);
app.use("/users", apiLimiter, usersRouter);

// 404 pour les routes non définies
app.use((req, res) => {
  res.status(404).json({
    code: "notFound",
    message: `Route ${req.method} ${req.path} introuvable`,
  });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error("❌ Erreur serveur:", err);
  
  // Erreur de base de données non initialisée
  if (err.message && err.message.includes("Database not yet initialized")) {
    return res.status(503).json({
      code: "serviceUnavailable",
      message: "La base de données est en cours d'initialisation. Veuillez réessayer dans quelques secondes.",
    });
  }
  
  // Erreur JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      code: "unauthorized",
      message: "Token JWT invalide",
    });
  }
  
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      code: "unauthorized",
      message: "Token JWT expiré",
    });
  }
  
  // Erreur générique
  res.status(500).json({
    code: "internalError",
    message: "Une erreur interne est survenue",
    details: process.env.NODE_ENV !== "production" ? err.message : undefined,
  });
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

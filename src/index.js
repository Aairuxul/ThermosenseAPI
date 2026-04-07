const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

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

app.use(cors());
app.use(express.json());

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
  customSiteTitle: "ThermoSense API Documentation"
}));

// --- Routes publiques ---
app.use("/auth", authRouter);

// --- Routes protégées ---
// BOLA/BFLA appliqués via middleware d'authentification et d'autorisation par ressource
app.use("/areas", areasRouter);
app.use("/sensors", sensorsRouter);
app.use("/sensors", measuresRouter);
app.use("/areas", alertThresholdsRouter);
app.use("/areas", areaActuatorsRouter);
app.use("/actuators", actuatorsRouter);
app.use("/users", usersRouter);

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

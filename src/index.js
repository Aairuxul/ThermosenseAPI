const express = require("express");
const cors = require("cors");

const areasRouter = require("./routes/areas");
const sensorsRouter = require("./routes/sensors");
const measuresRouter = require("./routes/measures");
const { areaActuatorsRouter, actuatorsRouter } = require("./routes/actuators");
const alertThresholdsRouter = require("./routes/alertThresholds");
const usersRouter = require("./routes/users");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Routes ---
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

app.listen(PORT, () => {
  console.log(`\nThermoSense API démarrée sur http://localhost:${PORT}\n`);
});

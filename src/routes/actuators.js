const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../store");

const areaActuatorsRouter = Router();
const actuatorsRouter = Router();

// GET /areas/:areaId/actuators
areaActuatorsRouter.get("/:areaId/actuators", (req, res) => {
  const area = db.areas.find((a) => a.id === req.params.areaId);
  if (!area) {
    return res.status(404).json({
      code: "notFound",
      message: `Zone '${req.params.areaId}' introuvable`,
    });
  }

  const data = db.actuators.filter((a) => a.areaId === req.params.areaId);
  res.json({ data });
});

// POST /areas/:areaId/actuators
areaActuatorsRouter.post("/:areaId/actuators", (req, res) => {
  const area = db.areas.find((a) => a.id === req.params.areaId);
  if (!area) {
    return res.status(404).json({
      code: "notFound",
      message: `Zone '${req.params.areaId}' introuvable`,
    });
  }

  const { type, state } = req.body;
  const details = [];

  if (!type) {
    details.push({ field: "type", reason: "Le champ type est requis" });
  }
  if (!state) {
    details.push({ field: "state", reason: "Le champ state est requis" });
  }
  if (state && !["on", "off", "auto"].includes(state)) {
    details.push({ field: "state", reason: "state doit être on, off ou auto" });
  }

  if (details.length > 0) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Payload invalide",
      details,
    });
  }

  const actuator = {
    id: uuidv4(),
    type,
    state,
    areaId: req.params.areaId,
  };

  db.actuators.push(actuator);
  res.status(201).json(actuator);
});

// GET /actuators/:actuatorId
actuatorsRouter.get("/:actuatorId", (req, res) => {
  const actuator = db.actuators.find((a) => a.id === req.params.actuatorId);
  if (!actuator) {
    return res.status(404).json({
      code: "notFound",
      message: `Actionneur '${req.params.actuatorId}' introuvable`,
    });
  }

  res.json(actuator);
});

// PUT /actuators/:actuatorId
actuatorsRouter.put("/:actuatorId", (req, res) => {
  const actuator = db.actuators.find((a) => a.id === req.params.actuatorId);
  if (!actuator) {
    return res.status(404).json({
      code: "notFound",
      message: `Actionneur '${req.params.actuatorId}' introuvable`,
    });
  }

  const { state } = req.body;
  if (!state || !["on", "off", "auto"].includes(state)) {
    return res.status(400).json({
      code: "invalidParameter",
      message: "Le champ state est requis et doit être on, off ou auto",
    });
  }

  actuator.state = state;
  res.json(actuator);
});

// DELETE /actuators/:actuatorId
actuatorsRouter.delete("/:actuatorId", (req, res) => {
  const idx = db.actuators.findIndex((a) => a.id === req.params.actuatorId);
  if (idx === -1) {
    return res.status(404).json({
      code: "notFound",
      message: `Actionneur '${req.params.actuatorId}' introuvable`,
    });
  }

  db.actuators.splice(idx, 1);
  res.status(204).send();
});

module.exports = { areaActuatorsRouter, actuatorsRouter };

const { Router } = require("express");
const db = require("../store");
const { nextId } = require("../id");
const { authenticate } = require("../auth");
const {
  requireRoles,
  requireScope,
  requireAreaAccess,
  requireActuatorAccess,
} = require("../authorization");
const { idempotency } = require("../idempotency");
const { problem } = require("../problem");
const { paginate } = require("../pagination");

const areaActuatorsRouter = Router();
const actuatorsRouter = Router();

// GET /areas/:areaId/actuators
areaActuatorsRouter.get("/:areaId/actuators", authenticate, requireScope("actuators:read"), requireRoles("admin", "operator", "reader"), requireAreaAccess, (req, res) => {
  const actuators = db.actuators.filter((a) => a.areaId === req.params.areaId);
  res.json(paginate(actuators, req.query));
});

// POST /areas/:areaId/actuators (protégé)
areaActuatorsRouter.post("/:areaId/actuators", authenticate, requireScope("actuators:write"), requireRoles("admin", "operator"), requireAreaAccess, (req, res) => {
  const { type, state } = req.body;
  const errors = [];

  if (!type) {
    errors.push({ field: "type", reason: "Le champ type est requis" });
  }
  if (!state) {
    errors.push({ field: "state", reason: "Le champ state est requis" });
  }
  if (state && !["on", "off", "auto"].includes(state)) {
    errors.push({ field: "state", reason: "state doit être on, off ou auto" });
  }

  if (errors.length > 0) {
    return problem(res, 400, "invalidParameter", "Payload invalide", { errors });
  }

  const actuator = {
    id: nextId("actuator"),
    type,
    state,
    areaId: req.params.areaId,
  };

  db.actuators.push(actuator);
  res.status(201).json(actuator);
});

// GET /actuators/:actuatorId
actuatorsRouter.get("/:actuatorId", authenticate, requireScope("actuators:read"), requireRoles("admin", "operator", "reader", "device"), requireActuatorAccess, (req, res) => {
  res.json(req.actuator);
});

// PUT /actuators/:actuatorId (protégé)
actuatorsRouter.put("/:actuatorId", authenticate, requireScope("actuators:write"), requireRoles("admin", "operator"), requireActuatorAccess, idempotency, (req, res) => {
  const actuator = req.actuator;

  const { state } = req.body;
  if (!state || !["on", "off", "auto"].includes(state)) {
    return problem(res, 400, "invalidParameter", "Le champ state est requis et doit être on, off ou auto", {
      errors: [{ field: "state", reason: "state est requis et doit être on, off ou auto" }],
    });
  }

  actuator.state = state;
  res.json(actuator);
});

// DELETE /actuators/:actuatorId (protégé)
actuatorsRouter.delete("/:actuatorId", authenticate, requireScope("actuators:write"), requireRoles("admin"), requireActuatorAccess, (req, res) => {
  const idx = db.actuators.findIndex((a) => a.id === req.params.actuatorId);
  db.actuators.splice(idx, 1);
  res.status(204).send();
});

module.exports = { areaActuatorsRouter, actuatorsRouter };

const { nextId, resetIds } = require("./id");
const bcrypt = require("bcryptjs");

function randomFloat(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

async function generateSeed() {
  resetIds();

  const buildingId = nextId("building");

  // --- Zones ---
  const areaAId = nextId("area");
  const areaBId = nextId("area");

  const areas = [
    {
      id: areaAId,
      name: "Zone A — Entrepôt Nord",
      buildingId,
      sensors: [], // sera rempli après
    },
    {
      id: areaBId,
      name: "Zone B — Bureaux Sud",
      buildingId,
      sensors: [],
    },
  ];

  // --- Capteurs ---
  const sensors = [
    // Zone A : 4 capteurs dont 1 inactive
    { id: nextId("sensor"), type: "temperature", status: "active", areaId: areaAId },
    { id: nextId("sensor"), type: "temperature", status: "active", areaId: areaAId },
    { id: nextId("sensor"), type: "humidity", status: "active", areaId: areaAId },
    { id: nextId("sensor"), type: "temperature", status: "inactive", areaId: areaAId },
    // Zone B : 3 capteurs
    { id: nextId("sensor"), type: "temperature", status: "active", areaId: areaBId },
    { id: nextId("sensor"), type: "humidity", status: "active", areaId: areaBId },
    { id: nextId("sensor"), type: "temperature", status: "active", areaId: areaBId },
  ];

  // Remplir les sensors dans les areas
  areas[0].sensors = sensors.filter((s) => s.areaId === areaAId);
  areas[1].sensors = sensors.filter((s) => s.areaId === areaBId);

  // --- Actionneurs ---
  const actuators = [
    // Zone A : 2 actionneurs
    { id: nextId("actuator"), type: "heater", state: "on", areaId: areaAId },
    { id: nextId("actuator"), type: "ventilation", state: "auto", areaId: areaAId },
    // Zone B : 2 actionneurs (dont 1 off = maintenance)
    { id: nextId("actuator"), type: "heater", state: "auto", areaId: areaBId },
    { id: nextId("actuator"), type: "ventilation", state: "off", areaId: areaBId },
  ];

  // --- Mesures (28 sur les dernières 24h) ---
  const now = Date.now();
  const activeSensors = sensors.filter((s) => s.status === "active");
  const measures = [];

  for (let i = 0; i < 28; i++) {
    const sensor = activeSensors[i % activeSensors.length];
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);
    const timestamp = new Date(
      now - hoursAgo * 3600000 - minutesAgo * 60000
    ).toISOString();

    let value;
    if (sensor.type === "temperature") {
      const base = sensor.areaId === areaAId ? 18.0 : 22.0;
      // Valeur aberrante simulée pour i === 15
      value =
        i === 15
          ? randomFloat(base + 8, base + 12)
          : randomFloat(base - 2.5, base + 2.5);
    } else {
      // humidity
      value = randomFloat(35, 60);
    }

    measures.push({
      id: nextId("measure"),
      sensorId: sensor.id,
      timestamp,
      value,
    });
  }

  // Trier par timestamp décroissant
  measures.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // --- Seuils d'alerte ---
  const alertThresholds = [
    {
      id: nextId("threshold"),
      sensorId: sensors[0].id,
      thresholdValue: 30.0,
      comparisonOperator: "greaterThan",
    },
    {
      id: nextId("threshold"),
      sensorId: sensors[0].id,
      thresholdValue: 10.0,
      comparisonOperator: "lessThan",
    },
    {
      id: nextId("threshold"),
      sensorId: sensors[4].id,
      thresholdValue: 28.0,
      comparisonOperator: "greaterThan",
    },
  ];

  // --- Utilisateurs (multi-rôles pour BOLA/BFLA en S4) ---
  // Hash du password "root" pour le compte root
  const rootPasswordHash = await bcrypt.hash("root", 10);

  const users = [
    {
      id: nextId("user"),
      email: "root",
      password: rootPasswordHash,
      name: "Root Admin",
      role: "admin",
      zone: null,
    },
    {
      id: nextId("user"),
      email: "admin@thermosense.com",
      name: "Alice Admin",
      role: "admin",
      zone: null,
    },
    {
      id: nextId("user"),
      email: "operator.a@thermosense.com",
      name: "Bob Opérateur",
      role: "operator",
      zone: areaAId,
    },
    {
      id: nextId("user"),
      email: "operator.b@thermosense.com",
      name: "Claire Opératrice",
      role: "operator",
      zone: areaBId,
    },
    {
      id: nextId("user"),
      email: "device.sensor@thermosense.com",
      name: "Device Sensor 01",
      role: "device",
      zone: areaAId,
    },
    {
      id: nextId("user"),
      email: "device.actuator@thermosense.com",
      name: "Device Actuator 01",
      role: "device",
      zone: areaBId,
    },
  ];

  const data = { areas, sensors, actuators, measures, alertThresholds, users };

  // Log des IDs pour faciliter les tests
  console.log(
    `Seed: ${areas.length} zones, ${sensors.length} capteurs, ${actuators.length} actionneurs, ${measures.length} mesures, ${alertThresholds.length} seuils, ${users.length} utilisateurs`
  );
  areas.forEach((a) => console.log(`  Zone: ${a.name} (id: ${a.id})`));
  sensors.forEach((s) =>
    console.log(`  Capteur: ${s.type} [${s.status}] (id: ${s.id}, zone: ${s.areaId})`)
  );
  actuators.forEach((a) =>
    console.log(`  Actionneur: ${a.type} [${a.state}] (id: ${a.id}, zone: ${a.areaId})`)
  );
  users.forEach((u) =>
    console.log(`  Utilisateur: ${u.name} [${u.role}] (id: ${u.id})`)
  );

  return data;
}

module.exports = { generateSeed };

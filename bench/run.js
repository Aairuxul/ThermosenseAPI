"use strict";

/**
 * run.js — Orchestrateur des mesures réseau dégradé (Note 4 — résilience mobile/IoT).
 *
 * Pour CHAQUE (scénario × variante) :
 *   1. démarre une instance FRAÎCHE du serveur ThermoSense (seed en mémoire remis à zéro) ;
 *   2. s'authentifie (root/root) ;
 *   3. envoie N opérations logiques sur l'endpoint critique
 *      POST /v1/sensors/{sensorId}/measures via le middleware client dégradé ;
 *   4. compte les DOUBLONS RÉELS persistés côté serveur (GET mesures, paginé) ;
 *   5. calcule les métriques et arrête le serveur.
 *
 * Variantes :
 *   - baseline       : pas de timeout applicatif (plafond « gel » 8 s), pas de retry, pas de clé.
 *   - resilient      : timeout 3 s (write) / 1.5 s (read) + retry borné (max 3, backoff+jitter).
 *   - resilient+key  : idem + header Idempotency-Key (conforme au contrat OpenAPI).
 *
 * Reproductible : PRNG seedé. Lancer :  node bench/run.js
 */

const net = require("net");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { DegradedClient, uuidFromRng, makeRng, percentile } = require("./degraded-client");

const ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "Rendu", "note4", "results");

const N = Number(process.env.BENCH_N) || 100; // opérations logiques par passe
const SENSOR_ID = "sensor-1"; // capteur actif (seed) ; admin peut y écrire
const VALUE_BASE = 100000; // sentinelle : isole nos mesures du seed (15–60)
const BASE_SEED = 20260608;

const SCENARIOS = [
  { key: "A", label: "Nominal dégradé (3G faible)", latMin: 200, latMax: 500, loss: 0.05, reqLossShare: 0.5 },
  { key: "B", label: "Réseau très instable (chantier/entrepôt)", latMin: 800, latMax: 1500, loss: 0.2, reqLossShare: 0.5 },
  { key: "C", label: "Panne partielle (passerelle IoT saturée)", latMin: 2000, latMax: 4000, loss: 0.5, reqLossShare: 0.5 },
];

// Depuis S9, le serveur EXIGE l'Idempotency-Key (422 si absente) et la deduplique sur 24 h
// (cf. src/idempotency.js, cable sur POST /measures et PUT /actuators). Un client CONFORME
// doit donc toujours l'envoyer : `baseline` et `resilient` portent tous deux la cle et ne
// different que par les mecanismes de resilience (timeout/retry) -> avant/apres reseau propre.
// `no_key` est un CONTROLE NEGATIF : il prouve l'enforcement du contrat (ecriture sans cle -> 422).
const VARIANTS = [
  {
    key: "baseline",
    label: "Conforme, sans resilience (cle, sans timeout/retry)",
    timeouts: { read: 8000, write: 8000 },
    retry: { enabled: false, max: 0, baseMs: 500, capMs: 4000, jitter: true },
    useKey: true,
  },
  {
    key: "resilient",
    label: "Conforme + timeout + retry (cle honoree serveur)",
    timeouts: { read: 1500, write: 3000 },
    retry: { enabled: true, max: 3, baseMs: 500, capMs: 4000, jitter: true },
    useKey: true,
  },
  {
    key: "no_key",
    label: "Non conforme (sans cle) - controle d'enforcement -> 422",
    timeouts: { read: 1500, write: 3000 },
    retry: { enabled: false, max: 0, baseMs: 500, capMs: 4000, jitter: true },
    useKey: false,
  },
];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {
      /* pas prêt */
    }
    await delay(150);
  }
  throw new Error(`Serveur injoignable sur ${baseUrl}`);
}

function startServer(port, logStream) {
  const child = spawn("node", [path.join("src", "index.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      // Isole l'effet réseau du rate limiting (cf. § 1 méthodologie).
      RATE_LIMIT_MAX: "1000000",
      LOGIN_RATE_LIMIT_MAX: "1000000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => logStream.write(d));
  child.stderr.on("data", (d) => logStream.write(d));
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 2000);
  });
}

async function login(baseUrl) {
  const r = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "root", password: "root" }),
  });
  if (!r.ok) throw new Error(`Login échoué: ${r.status}`);
  const j = await r.json();
  return j.token;
}

/** GET paginé des mesures du capteur, puis compte les doublons par valeur sentinelle. */
async function countDuplicates(baseUrl, token) {
  const all = [];
  let offset = 0;
  const limit = 499;
  for (;;) {
    const r = await fetch(
      `${baseUrl}/v1/sensors/${SENSOR_ID}/measures?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const j = await r.json();
    const data = (j && j.data) || [];
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  const mine = all.filter((m) => typeof m.value === "number" && m.value >= VALUE_BASE && m.value < VALUE_BASE + N);
  const byValue = new Map();
  for (const m of mine) byValue.set(m.value, (byValue.get(m.value) || 0) + 1);
  let duplicates = 0;
  for (const c of byValue.values()) duplicates += c - 1;
  return { persisted: mine.length, distinct: byValue.size, duplicates };
}

function summarize(scenario, variant, records, client, dup) {
  const perceived = records.map((r) => r.perceivedMs).sort((a, b) => a - b);
  const successOps = records.filter((r) => r.ok).length;
  const totalRetries = records.reduce((s, r) => s + r.retries, 0);
  const mean = perceived.reduce((s, v) => s + v, 0) / (perceived.length || 1);
  return {
    scenario: scenario.key,
    scenarioLabel: scenario.label,
    variant: variant.key,
    variantLabel: variant.label,
    n: N,
    successRatePct: +((successOps / N) * 100).toFixed(1),
    p50PerceivedMs: percentile(perceived, 50),
    p95PerceivedMs: percentile(perceived, 95),
    maxPerceivedMs: perceived[perceived.length - 1] || 0,
    meanPerceivedMs: Math.round(mean),
    retriesPerReq: +(totalRetries / N).toFixed(2),
    physicalRequests: client.stats.physical,
    physicalPerLogical: +(client.stats.physical / N).toFixed(2),
    // Projection à débit constant de 1 opération logique/s par device.
    reqPerMin: Math.round(60 * (client.stats.physical / N)),
    serverExecutions: records.reduce((s, r) => s + r.serverExecutions, 0),
    persistedMeasures: dup.persisted,
    distinctMeasures: dup.distinct,
    duplicatesObserved: dup.duplicates,
  };
}

async function runPass(scenario, variant, scIdx, vIdx, rawLog) {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  rawLog.write(`\n===== PASS ${scenario.key}/${variant.key} (port ${port}) =====\n`);
  const child = startServer(port, rawLog);
  try {
    await waitForServer(baseUrl);
    const token = await login(baseUrl);

    // La dégradation est seedée PAR OPÉRATION et indépendante de la variante :
    // l'op i voit donc les mêmes conditions réseau en baseline, resilient et +key.
    // Seul change le jeu de mécanismes ⇒ comparaison contrôlée.
    const scenarioSeedBase = BASE_SEED + scIdx * 1000000;
    const client = new DegradedClient({
      baseUrl,
      token,
      scenario,
      timeouts: variant.timeouts,
      retry: variant.retry,
      seed: scenarioSeedBase,
    });

    const records = [];
    for (let i = 0; i < N; i += 1) {
      const timestamp = new Date(Date.UTC(2026, 5, 1, 0, 0, 0) + i * 1000).toISOString();
      const value = VALUE_BASE + i;
      const opSeed = (scenarioSeedBase + i) >>> 0;
      const idempotencyKey = uuidFromRng(makeRng((opSeed ^ 0x5bd1e995) >>> 0)); // clé déterministe/op
      const rec = await client.request("POST", `/v1/sensors/${SENSOR_ID}/measures`, {
        body: { timestamp, value },
        idempotencyKey: variant.useKey ? idempotencyKey : null,
        seed: opSeed,
      });
      records.push(rec);
    }

    const dup = await countDuplicates(baseUrl, token);
    const metrics = summarize(scenario, variant, records, client, dup);
    metrics.seed = scenarioSeedBase;
    metrics.config = { timeouts: variant.timeouts, retry: variant.retry, useKey: variant.useKey };
    return { metrics, trace: client.trace };
  } finally {
    await stopServer(child);
  }
}

async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const rawLog = fs.createWriteStream(path.join(RESULTS_DIR, "raw-server.log"), { flags: "w" });

  const results = [];
  const traces = {};
  for (let s = 0; s < SCENARIOS.length; s += 1) {
    for (let v = 0; v < VARIANTS.length; v += 1) {
      const scenario = SCENARIOS[s];
      const variant = VARIANTS[v];
      process.stdout.write(`▶ Scénario ${scenario.key} — ${variant.label} ... `);
      const { metrics, trace } = await runPass(scenario, variant, s, v, rawLog);
      results.push(metrics);
      traces[`${scenario.key}_${variant.key}`] = trace;
      process.stdout.write(
        `succès ${metrics.successRatePct}% | p95 ${metrics.p95PerceivedMs}ms | ` +
          `retries/req ${metrics.retriesPerReq} | doublons ${metrics.duplicatesObserved}\n`
      );
    }
  }
  rawLog.end();

  const out = {
    generatedAt: new Date().toISOString(),
    endpoint: `POST /v1/sensors/${SENSOR_ID}/measures`,
    n: N,
    valueBase: VALUE_BASE,
    baseSeed: BASE_SEED,
    methodology:
      "Latence et timeout injectés analytiquement (PRNG seedé, reproductible) ; " +
      "effets serveur (mesures persistées, doublons, statut HTTP) observés sur le serveur réel. " +
      "Rate limiting désactivé pour isoler l'effet réseau.",
    scenarios: SCENARIOS,
    variants: VARIANTS.map((v) => ({ key: v.key, label: v.label, timeouts: v.timeouts, retry: v.retry, useKey: v.useKey })),
    results,
  };
  fs.writeFileSync(path.join(RESULTS_DIR, "results.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(RESULTS_DIR, "traces.json"), JSON.stringify(traces, null, 2));

  // Résumé texte lisible (preuve compacte).
  const lines = [];
  lines.push(`ThermoSense — Mesures résilience réseau dégradé (Note 4)`);
  lines.push(`Généré : ${out.generatedAt}`);
  lines.push(`Endpoint : ${out.endpoint} | N=${N} ops/pass | seed=${BASE_SEED}`);
  lines.push("");
  const hdr = ["Scénario", "Variante", "Succès%", "p50ms", "p95ms", "maxms", "retr/req", "req/min", "doublons"];
  lines.push(hdr.join("\t"));
  for (const r of results) {
    lines.push(
      [r.scenario, r.variant, r.successRatePct, r.p50PerceivedMs, r.p95PerceivedMs, r.maxPerceivedMs, r.retriesPerReq, r.reqPerMin, r.duplicatesObserved].join("\t")
    );
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "summary.txt"), lines.join("\n") + "\n");

  process.stdout.write(`\n✅ Résultats écrits dans ${path.relative(ROOT, RESULTS_DIR)}/\n`);
}

main().catch((e) => {
  console.error("❌ Bench échoué:", e);
  process.exit(1);
});

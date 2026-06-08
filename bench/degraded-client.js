"use strict";

/**
 * degraded-client.js — Middleware client (wrapper HTTP) pour l'atelier résilience (Note 4).
 *
 * Rôle : injecter des conditions réseau dégradées DÉTERMINISTES autour du client HTTP
 * (fetch), puis appliquer — ou non — des mécanismes de résilience côté client
 * (timeout différencié, retry borné backoff+jitter, Idempotency-Key).
 *
 * Méthodologie (cf. Rendu/14-note-4.md § 1) :
 *  - La LATENCE réseau et la POLITIQUE DE TIMEOUT client sont injectées analytiquement
 *    par ce middleware, pilotées par un PRNG seedé (mulberry32) → expérience 100 %
 *    reproductible (même seed ⇒ mêmes tirages ⇒ mêmes chiffres).
 *  - Les EFFETS SERVEUR (mesures persistées, doublons, statut HTTP) sont, eux, RÉELS :
 *    chaque tentative non « perdue à l'aller » envoie une vraie requête au serveur
 *    ThermoSense en cours d'exécution. Les doublons sont donc comptés sur l'état réel
 *    du serveur, pas estimés.
 *
 * Modèle de perte (par tentative physique) :
 *  - prob. `loss` qu'un incident survienne ; un incident est :
 *      • « request-loss » (part `reqLossShare`)  → la requête n'atteint jamais le serveur
 *        (aucun effet de bord, le client expire) ;
 *      • « response-loss » (1 - `reqLossShare`) → la requête atteint le serveur et est
 *        exécutée, mais le client ne reçoit jamais la réponse → il expire.
 *        C'est CE cas qui produit les doublons sur retry (incident terrain rapporté).
 */

// --- PRNG déterministe (mulberry32) ---------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uniform(rng, min, max) {
  return min + (max - min) * rng();
}

/** UUID v4 déterministe (dérivé du PRNG) — format conforme au contrat OpenAPI. */
function uuidFromRng(rng) {
  const hex = [];
  for (let i = 0; i < 256; i += 1) hex.push((i + 0x100).toString(16).slice(1));
  const b = new Array(16);
  for (let i = 0; i < 16; i += 1) b[i] = Math.floor(rng() * 256) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  return (
    hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + "-" +
    hex[b[4]] + hex[b[5]] + "-" +
    hex[b[6]] + hex[b[7]] + "-" +
    hex[b[8]] + hex[b[9]] + "-" +
    hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
  );
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  // Méthode du rang le plus proche (nearest-rank).
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))];
}

// --- Client dégradé --------------------------------------------------------
class DegradedClient {
  /**
   * @param {object} cfg
   * @param {string} cfg.baseUrl   ex. http://127.0.0.1:4010
   * @param {string} cfg.token     JWT Bearer
   * @param {object} cfg.scenario  { latMin, latMax, loss, reqLossShare }
   * @param {object} cfg.timeouts  { read, write }  (ms)
   * @param {object} cfg.retry     { enabled, max, baseMs, capMs, jitter }
   * @param {number} cfg.seed
   */
  constructor(cfg) {
    this.baseUrl = cfg.baseUrl;
    this.token = cfg.token;
    this.scenario = cfg.scenario;
    this.timeouts = cfg.timeouts;
    this.retry = cfg.retry;
    this.rng = makeRng(cfg.seed);
    this.stats = { physical: 0, serverExec: 0 };
    this.trace = []; // journal brut (preuve)
  }

  async _send(method, path, body, idempotencyKey) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      /* pas de corps JSON */
    }
    return { status: res.status, body: parsed };
  }

  /** Une tentative PHYSIQUE, avec dégradation injectée. */
  async _attempt(method, path, body, idempotencyKey) {
    const timeout = method === "GET" ? this.timeouts.read : this.timeouts.write;
    const added = uniform(this.rng, this.scenario.latMin, this.scenario.latMax);
    let kind = "ok";
    if (this.rng() < this.scenario.loss) {
      kind = this.rng() < this.scenario.reqLossShare ? "request-loss" : "response-loss";
    }
    this.stats.physical += 1;

    let serverStatus = null;
    let serverExecuted = false;
    if (kind !== "request-loss") {
      // La requête atteint le serveur (localhost ⇒ exécution réelle et rapide).
      try {
        const r = await this._send(method, path, body, idempotencyKey);
        serverStatus = r.status;
        serverExecuted = r.status >= 200 && r.status < 300;
        if (serverExecuted) this.stats.serverExec += 1;
      } catch (e) {
        serverStatus = `neterr:${e.code || e.name || "ERR"}`;
      }
    }

    // Perception CLIENT (latence perçue + verdict) selon le modèle.
    let perceivedMs;
    let ok;
    let outcome;
    if (kind === "request-loss" || kind === "response-loss") {
      perceivedMs = timeout; // le client attend puis abandonne (timeout)
      ok = false;
      outcome = kind === "request-loss" ? "timeout(req-loss)" : "timeout(resp-loss)";
    } else if (added >= timeout) {
      perceivedMs = timeout; // réponse trop lente : timeout (serveur a pourtant exécuté)
      ok = false;
      outcome = "timeout(slow)";
    } else {
      perceivedMs = added;
      ok = serverStatus >= 200 && serverStatus < 300;
      outcome = ok ? "success" : `http:${serverStatus}`;
    }
    return { ok, perceivedMs, outcome, kind, serverStatus, serverExecuted, added: Math.round(added) };
  }

  /**
   * Une OPÉRATION LOGIQUE = 1 tentative + retries éventuels (mêmes body & clé).
   * Si `seed` est fourni, la dégradation de CETTE opération est pilotée par un PRNG
   * propre à l'opération → conditions réseau identiques pour la même op d'une variante
   * à l'autre (comparaison baseline / resilient / +key parfaitement contrôlée).
   */
  async request(method, path, { body, idempotencyKey, seed } = {}) {
    if (seed !== undefined) this.rng = makeRng(seed >>> 0);
    const maxAttempts = this.retry.enabled ? this.retry.max + 1 : 1;
    const attempts = [];
    let totalPerceived = 0;
    let res = null;

    for (let n = 0; n < maxAttempts; n += 1) {
      res = await this._attempt(method, path, body, idempotencyKey);
      attempts.push(res);
      totalPerceived += res.perceivedMs;
      if (res.ok) break;
      if (n < maxAttempts - 1) {
        // Backoff exponentiel + full jitter (style AWS), borné par capMs.
        const ceil = Math.min(this.retry.capMs, this.retry.baseMs * 2 ** n);
        const backoff = this.retry.jitter ? uniform(this.rng, 0, ceil) : ceil;
        totalPerceived += backoff;
      }
    }

    const record = {
      ok: res.ok,
      perceivedMs: Math.round(totalPerceived),
      attempts: attempts.length,
      retries: attempts.length - 1,
      serverExecutions: attempts.filter((a) => a.serverExecuted).length,
      outcomes: attempts.map((a) => a.outcome),
    };
    this.trace.push(record);
    return record;
  }
}

module.exports = { DegradedClient, makeRng, uniform, uuidFromRng, percentile };

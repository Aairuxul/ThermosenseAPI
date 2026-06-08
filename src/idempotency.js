const crypto = require("crypto");
const { problem } = require("./problem");

// Fenetre de deduplication : 24 h (cf. contrat OpenAPI, components/parameters/IdempotencyKey).
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Format attendu par le contrat (schema: type string, format uuid).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Store en memoire des cles d'idempotence : key -> { bodyHash, status, body, expiresAt }.
// Coherent avec l'architecture in-memory du store applicatif (un seul process).
const store = new Map();

// Serialisation stable (cles triees) pour que l'ordre des champs du body
// n'influence pas le hash et ne provoque pas de faux conflits.
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashBody(body) {
  return crypto.createHash("sha256").update(stableStringify(body || {})).digest("hex");
}

/**
 * Middleware d'idempotence pour les operations a effet de bord.
 * Conforme au contrat OpenAPI (components/parameters/IdempotencyKey) :
 *  - cle absente ou mal formee            -> 422 idempotencyKeyMissing
 *  - rejeu (meme cle, meme body, < 24 h)  -> reponse memorisee rejouee, sans effet de bord
 *  - rejeu (meme cle, body different)     -> 409 idempotencyConflict
 *
 * A placer apres les middlewares d'authentification/autorisation, juste avant le handler.
 */
function idempotency(req, res, next) {
  const key = req.headers["idempotency-key"];

  if (!key || !UUID_REGEX.test(key)) {
    return problem(res, 422, "idempotencyKeyMissing", "Header 'Idempotency-Key' absent ou mal forme (format UUID attendu)");
  }

  const bodyHash = hashBody(req.body);
  const now = Date.now();
  const existing = store.get(key);

  if (existing && existing.expiresAt > now) {
    if (existing.bodyHash === bodyHash) {
      // Rejeu identique : on rejoue la reponse memorisee sans re-executer l'effet de bord.
      return res.status(existing.status).json(existing.body);
    }
    // Meme cle reutilisee avec un body different dans la fenetre de deduplication.
    return problem(res, 409, "idempotencyConflict", "La cle 'Idempotency-Key' a deja ete utilisee avec un contenu different");
  }

  // Entree absente ou expiree : on traite la requete et on memorise la reponse en cas de succes.
  if (existing) {
    store.delete(key);
  }

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      store.set(key, {
        bodyHash,
        status: res.statusCode,
        body,
        expiresAt: Date.now() + DEDUP_WINDOW_MS,
      });
    }
    return sendJson(body);
  };

  return next();
}

module.exports = { idempotency };

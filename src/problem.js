const { STATUS_CODES } = require("http");

/**
 * Émet une réponse d'erreur au format Problem Details for HTTP APIs (RFC 7807),
 * conforme au schema `Error` du contrat OpenAPI.
 *
 *   { type, title, status, detail?, instance?, code?, errors? }
 *
 * - `type`   : URI de référence (défaut `about:blank`).
 * - `title`  : résumé court et stable — la phrase HTTP standard du status par défaut.
 * - `status` : code HTTP, dupliqué dans le corps pour le logging côté client.
 * - `detail` : explication contextuelle (ex-`message`).
 * - `code`   : extension ThermoSense — code métier machine-readable, stable.
 * - `errors` : extension ThermoSense — erreurs de validation par champ (400/422).
 *
 * Le media type renvoyé est `application/problem+json` (RFC 7807).
 *
 * @param {import('express').Response} res
 * @param {number} status  Code HTTP (>= 400).
 * @param {string} code    Code métier (ex: `sensorUnavailable`).
 * @param {string} [detail] Message contextuel.
 * @param {{ errors?: Array<{field:string,reason:string}>, instance?: string, type?: string, title?: string }} [options]
 */
function problem(res, status, code, detail, options = {}) {
  const body = {
    type: options.type || "about:blank",
    title: options.title || STATUS_CODES[status] || "Error",
    status,
  };

  if (detail !== undefined && detail !== null) {
    body.detail = detail;
  }
  if (options.instance !== undefined) {
    body.instance = options.instance;
  }
  if (code !== undefined && code !== null) {
    body.code = code;
  }
  if (Array.isArray(options.errors) && options.errors.length > 0) {
    body.errors = options.errors;
  }

  res.set("Content-Type", "application/problem+json");
  return res.status(status).json(body);
}

module.exports = { problem };

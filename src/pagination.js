// Pagination conforme au schema `PaginationMeta` du contrat OpenAPI
// (required: limit, offset, total). Valeurs alignées sur components/parameters
// (limit: défaut 50, min 1, max 499 ; offset: défaut 0, min 0).
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 499;

/**
 * Applique limit/offset à une liste et renvoie l'enveloppe paginée attendue
 * par le contrat : `{ data, pagination: { limit, offset, total } }`.
 *
 * @param {Array} items  Liste complète (déjà filtrée par autorisation).
 * @param {Record<string, any>} [query]  req.query (limit, offset).
 */
function paginate(items, query = {}) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  let offset = Number.parseInt(query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) {
    offset = 0;
  }

  return {
    data: items.slice(offset, offset + limit),
    pagination: { limit, offset, total: items.length },
  };
}

module.exports = { paginate };

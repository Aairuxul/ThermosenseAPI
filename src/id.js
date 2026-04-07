const counters = new Map();

function nextId(prefix) {
  const current = counters.get(prefix) || 0;
  const next = current + 1;

  counters.set(prefix, next);
  return `${prefix}-${next}`;
}

function resetIds() {
  counters.clear();
}

module.exports = { nextId, resetIds };

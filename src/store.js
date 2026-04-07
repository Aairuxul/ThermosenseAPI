const { generateSeed } = require("./seed");

let db = null;

// Fonction pour initialiser la base de données
async function initDatabase() {
  if (!db) {
    db = await generateSeed();
    console.log("✅ Base de données initialisée avec le seed");
  }
  return db;
}

// Getter synchrone pour les routes
function getDb() {
  if (!db) {
    throw new Error("Database not yet initialized. Call initDatabase() first.");
  }
  return db;
}

module.exports = new Proxy({}, {
  get(target, prop) {
    // Propriété spéciale pour initialiser
    if (prop === 'init') {
      return initDatabase;
    }
    return getDb()[prop];
  }
});

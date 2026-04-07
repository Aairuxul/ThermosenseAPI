const YAML = require("yamljs");
const fs = require("fs");
const path = require("path");

/**
 * Helper pour mettre à jour automatiquement le fichier OpenAPI
 * Utilisez cette fonction pour ajouter de nouveaux endpoints
 */

const OPENAPI_FILE = path.join(__dirname, "..", "contrat-openapi.yaml");

/**
 * Charge le document OpenAPI actuel
 */
function loadSwaggerDoc() {
  return YAML.load(OPENAPI_FILE);
}

/**
 * Sauvegarde le document OpenAPI
 */
function saveSwaggerDoc(doc) {
  const yamlString = YAML.stringify(doc, 10, 2);
  fs.writeFileSync(OPENAPI_FILE, yamlString, "utf8");
  console.log("✅ Fichier OpenAPI mis à jour :", OPENAPI_FILE);
}

/**
 * Ajoute un nouveau endpoint au fichier OpenAPI
 * 
 * @param {string} path - Le chemin de l'endpoint (ex: "/buildings")
 * @param {string} method - La méthode HTTP (get, post, put, delete)
 * @param {object} definition - La définition complète de l'endpoint
 * 
 * @example
 * addEndpoint("/buildings", "get", {
 *   tags: ["Buildings"],
 *   operationId: "listBuildings",
 *   summary: "Lister tous les bâtiments",
 *   responses: {
 *     "200": {
 *       description: "Liste des bâtiments",
 *       content: {
 *         "application/json": {
 *           schema: {
 *             type: "object",
 *             properties: {
 *               data: { type: "array", items: { $ref: "#/components/schemas/Building" } }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * });
 */
function addEndpoint(path, method, definition) {
  const doc = loadSwaggerDoc();
  
  if (!doc.paths) {
    doc.paths = {};
  }
  
  if (!doc.paths[path]) {
    doc.paths[path] = {};
  }
  
  doc.paths[path][method.toLowerCase()] = definition;
  
  saveSwaggerDoc(doc);
  return doc;
}

/**
 * Ajoute un nouveau schéma de composant
 * 
 * @param {string} name - Le nom du schéma
 * @param {object} schema - La définition du schéma
 */
function addSchema(name, schema) {
  const doc = loadSwaggerDoc();
  
  if (!doc.components) {
    doc.components = {};
  }
  
  if (!doc.components.schemas) {
    doc.components.schemas = {};
  }
  
  doc.components.schemas[name] = schema;
  
  saveSwaggerDoc(doc);
  return doc;
}

/**
 * Ajoute un nouveau tag
 */
function addTag(name, description) {
  const doc = loadSwaggerDoc();
  
  if (!doc.tags) {
    doc.tags = [];
  }
  
  // Vérifie si le tag existe déjà
  const existingTag = doc.tags.find(tag => tag.name === name);
  if (!existingTag) {
    doc.tags.push({ name, description });
    saveSwaggerDoc(doc);
  }
  
  return doc;
}

module.exports = {
  loadSwaggerDoc,
  saveSwaggerDoc,
  addEndpoint,
  addSchema,
  addTag
};

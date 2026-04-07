/**
 * EXEMPLE : Comment ajouter un nouvel endpoint à Swagger
 * 
 * Ce fichier montre comment utiliser swagger-helper.js pour
 * mettre à jour automatiquement la documentation OpenAPI
 */

const { addEndpoint, addSchema, addTag } = require("./swagger-helper");

// Exemple 1 : Ajouter un nouvel endpoint GET
function exempleAjouterEndpointGET() {
  addEndpoint("/buildings", "get", {
    tags: ["Buildings"],
    operationId: "listBuildings",
    summary: "Lister tous les bâtiments",
    description: "Retourne la liste de tous les bâtiments enregistrés.",
    responses: {
      "200": {
        description: "Liste des bâtiments",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Building"
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

// Exemple 2 : Ajouter un endpoint POST avec requestBody
function exempleAjouterEndpointPOST() {
  addEndpoint("/buildings", "post", {
    tags: ["Buildings"],
    operationId: "createBuilding",
    summary: "Créer un nouveau bâtiment",
    description: "Crée un nouveau bâtiment dans le système.",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["name", "address"],
            properties: {
              name: {
                type: "string",
                description: "Nom du bâtiment"
              },
              address: {
                type: "string",
                description: "Adresse du bâtiment"
              }
            }
          }
        }
      }
    },
    responses: {
      "201": {
        description: "Bâtiment créé avec succès",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Building"
            }
          }
        }
      },
      "400": {
        description: "Payload invalide",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error"
            }
          }
        }
      }
    }
  });
}

// Exemple 3 : Ajouter un endpoint avec paramètres
function exempleAjouterEndpointAvecParams() {
  addEndpoint("/buildings/{buildingId}", "get", {
    tags: ["Buildings"],
    operationId: "getBuilding",
    summary: "Obtenir le détail d'un bâtiment",
    description: "Retourne les informations détaillées d'un bâtiment spécifique.",
    parameters: [
      {
        name: "buildingId",
        in: "path",
        required: true,
        description: "Identifiant unique du bâtiment",
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      "200": {
        description: "Détail du bâtiment",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Building"
            }
          }
        }
      },
      "404": {
        description: "Bâtiment introuvable",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error"
            }
          }
        }
      }
    }
  });
}

// Exemple 4 : Ajouter un nouveau schéma de composant
function exempleAjouterSchema() {
  addSchema("Building", {
    type: "object",
    description: "Représente un bâtiment dans le système",
    required: ["id", "name", "address"],
    properties: {
      id: {
        type: "string",
        description: "Identifiant unique du bâtiment"
      },
      name: {
        type: "string",
        description: "Nom du bâtiment"
      },
      address: {
        type: "string",
        description: "Adresse du bâtiment"
      },
      areas: {
        type: "array",
        description: "Liste des zones du bâtiment",
        items: {
          $ref: "#/components/schemas/Areas"
        }
      }
    }
  });
}

// Exemple 5 : Ajouter un nouveau tag
function exempleAjouterTag() {
  addTag("Buildings", "Opérations liées aux bâtiments");
}

// Pour exécuter un exemple, décommentez la ligne correspondante :
// exempleAjouterTag();
// exempleAjouterSchema();
// exempleAjouterEndpointGET();
// exempleAjouterEndpointPOST();
// exempleAjouterEndpointAvecParams();

module.exports = {
  exempleAjouterEndpointGET,
  exempleAjouterEndpointPOST,
  exempleAjouterEndpointAvecParams,
  exempleAjouterSchema,
  exempleAjouterTag
};

# ThermoSense API

Web service **REST** de supervision de capteurs et de pilotage d'actionneurs **IoT** pour le
confort thermique des bâtiments, conçu pour une **application mobile** pilotant des objets connectés.
Contrôle d'accès **JWT + RBAC + BOLA**, écritures **idempotentes**, **rate limiting**, contrat
**OpenAPI 3.0.3** versionné (`/v1`).

> **Démarrage en 30 secondes** : `npm install` → `npm start` → ouvrir <http://localhost:3000/api-docs>.
> Compte de test : `root` / `root`. Parcours d'intégration complet (copier-coller) en
> [§ Parcours intégrateur](#parcours-intégrateur-copier-coller).

| | |
| --- | --- |
| **Stack** | Node.js ≥ 18 · Express 5 · JWT (`jsonwebtoken`) · Helmet · `express-rate-limit` |
| **Contrat** | [`contrat-openapi.yaml`](./contrat-openapi.yaml) — OpenAPI 3.0.3, versionné `/v1` |
| **Persistance** | Store **en mémoire** (seed au démarrage, cf. [Limites connues](#limites-connues)) |
| **Port par défaut** | `3000` (configurable via `PORT`) |
| **Équipe** | Kenza · Enzo · Matteo · Tommy · Valentin |

---

## Prérequis

- **Node.js ≥ 18** (le projet utilise `fetch` natif et `node --watch`). Vérifier : `node --version`.
- **npm** (fourni avec Node).
- Aucune base de données externe à installer : le store est en mémoire, ré-amorcé à chaque démarrage.

## Installation et démarrage

```bash
git clone https://github.com/Aairuxul/ThermosenseAPI.git
cd ThermosenseAPI
npm install
npm start
```

Au démarrage, le serveur amorce le jeu de données de test (zones, capteurs, actionneurs, mesures,
utilisateurs) et écoute sur le port `3000` :

```
✅ ThermoSense API démarrée sur http://localhost:3000
Documentation Swagger disponible sur http://localhost:3000/api-docs
Compte de test: email="root" password="root"
```

| Ressource | URL |
| --- | --- |
| **Documentation interactive (Swagger UI)** | <http://localhost:3000/api-docs> |
| **Health check** | <http://localhost:3000/v1/health> (alias non versionné : `/health`) |
| **Base des endpoints** | `http://localhost:3000/v1` |

> Mode développement avec rechargement à chaud : `npm run dev`.

## Comptes de test (seed)

Tous les comptes ont le **mot de passe `root`**. Ils couvrent les 4 rôles et les deux zones
(`area-1` = *Entrepôt Nord*, `area-2` = *Bureaux Sud*) pour exercer le contrôle d'accès RBAC/BOLA.

| Email (identifiant de login) | Mot de passe | Rôle | Zone | Périmètre |
| --- | --- | --- | --- | --- |
| `root` | `root` | `admin` | — | Accès global (recommandé pour l'intégration) |
| `admin@thermosense.com` | `root` | `admin` | — | Accès global |
| `operator.a@thermosense.com` | `root` | `operator` | `area-1` | Pilotage de la zone A |
| `operator.b@thermosense.com` | `root` | `operator` | `area-2` | Pilotage de la zone B |
| `reader.a@thermosense.com` | `root` | `reader` | `area-1` | Lecture seule zone A |
| `device.sensor@thermosense.com` | `root` | `device` | `area-1` | Capteur `sensor-1` uniquement |
| `device.actuator@thermosense.com` | `root` | `device` | `area-2` | Actionneur `actuator-3` uniquement |

Données amorcées : 2 zones, 7 capteurs (`sensor-1` à `sensor-7`, dont `sensor-4` *inactive*),
4 actionneurs (`actuator-1` à `actuator-4`), 28 mesures, 3 seuils d'alerte.

---

## Parcours intégrateur (copier-coller)

Séquence autonome démontrant un flux complet **mobile → API → IoT**. Elle ne requiert que `curl` et
`jq`. Chaque commande est indépendante et réutilise le token de l'étape 1.

### 1. S'authentifier et récupérer un token JWT

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"root","password":"root"}' | jq -r .token)

echo "$TOKEN"   # doit afficher un JWT (eyJ...)
```

### 2. Lire les zones, puis un capteur (lecture)

```bash
# Liste des zones accessibles
curl -s http://localhost:3000/v1/areas \
  -H "Authorization: Bearer $TOKEN" | jq

# Détail d'un capteur
curl -s http://localhost:3000/v1/sensors/sensor-1 \
  -H "Authorization: Bearer $TOKEN" | jq

# Dernières mesures du capteur (paginé : ?limit=&offset=)
curl -s "http://localhost:3000/v1/sensors/sensor-1/measures?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 3. Publier une mesure (écriture **idempotente**)

L'ingestion de mesure est une **écriture à effet de bord** : le header **`Idempotency-Key`
(UUID) est obligatoire** (cf. [§ Idempotence](#idempotence--écritures-sûres-sur-réseau-instable)).

```bash
KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')

curl -s -X POST http://localhost:3000/v1/sensors/sensor-1/measures \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"timestamp":"2026-06-09T08:00:00Z","value":21.4}' | jq
# → 201 Created : { "id": "measure-…", "sensorId": "sensor-1", … }
```

**Rejouer la même requête avec la même clé** (cas du retry mobile après timeout réseau) :

```bash
curl -s -X POST http://localhost:3000/v1/sensors/sensor-1/measures \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"timestamp":"2026-06-09T08:00:00Z","value":21.4}' | jq
# → MÊME réponse, AUCUN doublon créé (réponse mémorisée rejouée)
```

**Oublier la clé** → l'API refuse l'écriture (preuve d'enforcement) :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/v1/sensors/sensor-1/measures \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-06-09T08:00:00Z","value":21.4}'
# → 422  (idempotencyKeyMissing)
```

### 4. Piloter un actionneur (commande IoT, idempotente elle aussi)

```bash
curl -s -X PUT http://localhost:3000/v1/actuators/actuator-1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen | tr '[:upper:]' '[:lower:]')" \
  -d '{"state":"on"}' | jq
# → 200 OK : { "id": "actuator-1", "state": "on", … }
```

> **Comprendre une erreur sans aide** : toutes les erreurs suivent le format **Problem Details
> (`application/problem+json`)** avec un champ `code` stable. Exemples : `unauthorized` (401),
> `forbidden` (403), `notFound` (404), `invalidParameter` (400), `idempotencyKeyMissing` (422),
> `idempotencyConflict` (409), `deviceUnavailable` (409), `tooManyRequests` (429).

---

## Endpoints

Tous les endpoints métier sont sous le préfixe **`/v1`** et exigent un header
`Authorization: Bearer <token>` (sauf `/health` et `/v1/auth/login`).

| Méthode & chemin | Rôles autorisés | Notes |
| --- | --- | --- |
| `POST /v1/auth/login` | public | Renvoie un access token (JWT) ; rate-limité 10 req / 15 min / IP |
| `GET /v1/areas` | admin, operator, reader | Filtré par zone (admin voit tout) |
| `POST /v1/areas` | admin | |
| `GET /v1/sensors/{sensorId}` | admin, operator, reader, device | |
| `GET /v1/sensors/{sensorId}/measures` | admin, operator, reader, device | Paginé (`limit` ≤ 499, `offset`) |
| `POST /v1/sensors/{sensorId}/measures` | admin, device | **`Idempotency-Key` requise** |
| `GET /v1/areas/{areaId}/alert-thresholds` | admin, operator, reader | |
| `POST /v1/areas/{areaId}/alert-thresholds` | admin, operator | |
| `GET /v1/areas/{areaId}/actuators` | admin, operator, reader | |
| `POST /v1/areas/{areaId}/actuators` | admin, operator | |
| `GET /v1/actuators/{actuatorId}` | admin, operator, reader, device | |
| `PUT /v1/actuators/{actuatorId}` | admin, operator | **`Idempotency-Key` requise** |
| `DELETE /v1/actuators/{actuatorId}` | admin | |
| `GET /v1/users/{userId}` | admin, ou soi-même | |
| `POST /v1/users` | admin | |

La liste fait foi dans le contrat : [`contrat-openapi.yaml`](./contrat-openapi.yaml) (ou Swagger UI `/api-docs`).

## Idempotence — écritures sûres sur réseau instable

Les écritures à effet de bord physique (`POST …/measures`, `PUT …/actuators/{id}`) **exigent** un
header `Idempotency-Key` au format **UUID**. Comportement (cf. [`src/idempotency.js`](./src/idempotency.js)) :

| Cas | Réponse |
| --- | --- |
| Clé absente ou mal formée (pas un UUID) | `422 idempotencyKeyMissing` |
| 1ʳᵉ requête avec la clé | Traitée normalement (`201`/`200`), réponse mémorisée **24 h** |
| Rejeu : même clé + **même** body | Réponse mémorisée rejouée, **sans nouvel effet de bord** |
| Rejeu : même clé + body **différent** | `409 idempotencyConflict` |

C'est ce qui permet à un client mobile de **retenter sans risque** après un timeout réseau, sans créer
de doublon de mesure ou de commande. Mesures de résilience à l'appui : [`Rendu/14-note-4.md`](./Rendu/14-note-4.md).

## Authentification, rôles et contrôle d'accès

- **JWT** signé HS256, transmis en header `Authorization: Bearer <token>`. Claims : `sub`, `role`,
  `zone`, `resourceType`/`resourceId` (devices), `scope`, `aud`, `iss`. TTL access **30 min**,
  refresh **7 j**. `audience`/`issuer` vérifiés à chaque requête.
- **RBAC** : 4 rôles (`admin`, `operator`, `reader`, `device`) → scopes (ex. `measures:write`).
  Le contrôle de fonction (BFLA) renvoie **403** si le rôle/scope est insuffisant.
- **BOLA** : un `operator`/`reader` est restreint à **sa zone** ; un `device` à **sa seule ressource**.
  Un accès hors périmètre renvoie **`404`** (et non `403`) pour **ne pas révéler l'existence** de la
  ressource (anti-énumération). Détail : [`Rendu/10-matrice-autorisations.md`](./Rendu/10-matrice-autorisations.md).

## Variables d'environnement

Toutes optionnelles (valeurs par défaut adaptées au développement local).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3000` | Port d'écoute |
| `NODE_ENV` | — | `production` masque les détails d'erreur ; sinon serveur `localhost` ajouté au contrat |
| `JWT_SECRET` | `thermosense-secret-key-change-in-production` | **À surcharger en production** |
| `JWT_EXPIRES_IN` | `30m` | Durée de vie de l'access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Durée de vie du refresh token |
| `JWT_AUDIENCE` / `JWT_ISSUER` | `thermosense-api` / `thermosense-auth` | Validation `aud`/`iss` |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `100` / `60000` | Quota API global / IP |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS` | `10` / `900000` | Quota `/auth/login` / IP |

## Tests, lint et benchmark

```bash
npm test            # suites de sécurité : 27 tests authN/authZ/idempotence + 10 tests de cadrage
npm run test:auth   # RBAC/BOLA, tests adverses (token expiré, signature invalide, aud), idempotence
npm run test:cadrage
npm run lint        # validation du contrat OpenAPI (Spectral) — 0 erreur bloquante
npm run bench       # mesures de résilience réseau dégradé → Rendu/note4/results/ (cf. bench/README.md)
```

> Les tests démarrent l'API en mémoire et n'ont besoin d'aucun service externe. Le `lint` peut
> émettre des **avertissements** (règles custom advisory sur les réponses 2xx) mais **0 erreur**.

## Structure du projet

```
src/
  index.js          # bootstrap Express : middlewares, rate limiting, routes /v1, Swagger, gestion d'erreurs
  auth.js           # JWT : génération/vérification, scopes par rôle
  authorization.js  # RBAC (requireRoles/requireScope) + BOLA (zone / ressource device)
  idempotency.js    # middleware Idempotency-Key (422/409/rejeu 24 h)
  security-logger.js# journalisation des événements de sécurité (échec auth, accès refusé, rate limit)
  routes/           # auth, areas, sensors, measures, actuators, alertThresholds, users
  store.js, seed.js, id.js, swagger-*.js
tests/              # auth.test.js (sécurité + idempotence), cadrage.test.js
bench/              # harness de résilience réseau dégradé (Note 4)
contrat-openapi.yaml         # contrat REST (source de vérité)
extrait-contrat-wsdl-note3.xml # extrait WSDL du service SOAP BillingService (Note 3)
.spectral.yaml               # ruleset de lint OpenAPI
Rendu/              # dossier de projet (notes 1 → 5)
```

## Documentation projet

Le dossier complet est dans [`Rendu/`](./Rendu/) ([sommaire](./Rendu/README.md)) :
dossier Note 5 ([`Rendu/15-note-5-dossier.md`](./Rendu/15-note-5-dossier.md)),
mémo décisionnel ([`Rendu/16-memo-decisionnel.md`](./Rendu/16-memo-decisionnel.md)),
architecture & décisions de design, threat model, matrice d'autorisations, Note 3 (SOA/SOAP),
quality gate, et résilience (Note 4).

## Limites connues

- **Persistance en mémoire** : les données sont ré-amorcées à chaque redémarrage (choix assumé pour la
  démonstration ; une vraie BD est nécessaire en production). Le store d'idempotence est lui aussi en
  mémoire (mono-process).
- **Disponibilité sous panne réseau sévère** : le retry client borne le gel mais ne suffit pas en perte
  ≥ 50 % (cf. Note 4, scénario C) — une file locale + backpressure restent à implémenter.
- **Écart contrat/implémentation sur le `429`** : code et headers de rate limiting documentés mais non
  totalement alignés sur le contrat (cf. [`Rendu/14-note-4.md`](./Rendu/14-note-4.md) § 3.4).

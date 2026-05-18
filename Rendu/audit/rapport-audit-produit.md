# Rapport d'audit — API review board

> Séance 6-7 — Document produit par le groupe **auditeur**
> À remettre au groupe audité en fin de Phase 2

---

## En-tête

| Champ             | Valeur                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| Groupe auditeur   | ThermosenseAPI                                                                          |
| Membres auditeurs | Enzo, Kenza                                                                             |
| Groupe audité     | groupe du fond                                                                          |
| Date              | 2026-05-18                                                                              |
| Contrat audité    | OpenAPI ☑ · WSDL ☐                                                                      |
| Référence contrat | Fichier : `ThermoSense_openapi.yaml` · Version : `1.0.0` (info.version)                 |
| Périmètre         | Contrat complet ☑                                                                       |

**Résumé en 2 phrases (contexte audité) :**

> ThermoSense est une API REST de supervision thermique (bâtiments tertiaires) couvrant la hiérarchie Building → Zone → Sensor/Actuator → Measurement/Command, avec une app mobile et des équipements IoT comme consommateurs. Le contrat est globalement structuré (hiérarchie claire, schemas typés, sécurité Bearer) mais présente des angles morts critiques pour un consommateur mobile/IoT : idempotence des commandes non documentée, pagination absente sur les listes de mesures, codes d'erreur sémantiquement incorrects (503 mal utilisé).

---

## Présentation initiale (5 premières minutes — notes)

- **Fichier + version Git** : `ThermoSense_openapi.yaml` — `info.version: 1.0.0`
- **2 endpoints critiques pour mobile/IoT** :
  1. `POST /buildings/{buildingId}/zones/{zoneId}/actuators/{actuatorId}/commands` — pilotage temps réel
  2. `GET /buildings/{buildingId}/zones/{zoneId}/sensors/{sensorId}/measurements` — historique mesures (volumétrie)
- **Stratégie de versioning** : versionning par URI (`/v1` dans `servers.url` production) — non explicité dans la description
- **Type de consommateurs visés** : app mobile opérateurs + capteurs/actionneurs IoT
- **Autres remarques notables** : `bearerAuth` JWT global, override `security: []` sur `/health` et `/auth/login`

---

## Synthèse checklist (12 critères)

| #   | Critère                                                          | Note    | Notes rapides                                                       |
| --- | ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| 1   | Naming cohérent (pluriel, substantifs, pas de verbes dans l'URI) | ✓       | Pluriel partout, hiérarchie cohérente, `/auth/login` toléré         |
| 2   | Verbes HTTP (sémantique respectée)                               | ✓       | GET/POST/PATCH/DELETE conformes ; `POST /commands` → 200 acceptable |
| 3   | Status codes (201/204/404/409/422 à bon escient)                 | ✗       | 503 mal utilisé ; 409/422 absents ; 401/403 non documentés          |
| 4   | Erreurs structurées (RFC 7807 / schéma réutilisable)             | ~       | Schéma `Errors` réutilisable mais pas conforme RFC 7807             |
| 5   | Paramètres typés (format, min/max, enum)                         | ✗       | Path params `type: string` brut sans `pattern`/`format`             |
| 6   | Schemas — champs `required` explicites                           | ✓       | `required` explicite, Request/Response séparés, PATCH sans required |
| 7   | Exemples request/response sur opération critique                 | ~       | Examples sur properties mais pas d'`examples:` opération            |
| 8   | Versioning documenté + politique d'évolution                     | ✗       | Incohérence URL localhost (sans `/v1`) vs prod ; pas de politique   |
| 9   | AuthN/AuthZ (`securitySchemes`, scopes, endpoints protégés)      | ~       | Bearer OK ; rôles admin/operator hors `securitySchemes`             |
| 10  | Idempotence (clé ou sémantique documentée)                       | ✗       | Pas d'`Idempotency-Key` ; `no_change` insuffisant pour retry réseau |
| 11  | Pagination/filtrage (limit, cursor/offset)                       | ✗       | Aucune pagination, aucun filtre temporel sur `/measurements`        |
| 12  | Limites / rate limiting (429, quota)                             | ✗       | Aucune mention de 429 ou quota                                      |

### Compteurs

| Compteur          | Valeur |
| ----------------- | ------ |
| ✗                 | 6      |
| ~                 | 3      |
| Dont **Bloquant** | 2      |
| Dont **Majeur**   | 4      |
| Dont **Mineur**   | 1      |

---

## Annexe WSDL (à remplir si contrat SOAP)

> Non applicable — le contrat audité est OpenAPI (REST).

---

## Tableau des non-conformités

### Non-conformité #1

- **Fait observable** : `POST /buildings/{buildingId}/zones/{zoneId}/actuators/{actuatorId}/commands` (l. 732-775) ne documente aucun header `Idempotency-Key`. Le champ `CommandResponse.status: "no_change"` détecte uniquement le cas « actionneur déjà dans l'état demandé » mais ne couvre pas un rejeu après timeout réseau pour une commande à effet bord.
- **Critère #** : #10 — Idempotence
- **Impact consommateur (mobile/IoT)** : Sur réseau mobile instable, un timeout côté client après envoi de la commande conduit au retry. Si la première requête a déjà été traitée mais que la réponse n'est pas revenue, le serveur exécute deux fois la commande. Risque concret : `action: "on"` envoyé deux fois → cycle ON/OFF imprévu ; ou sur une commande critique (ventilation salle serveur) → double bascule.
- **Gravité** : **Bloquant**
- **Suggestion de remédiation** : Documenter le header `Idempotency-Key` (UUID v4 généré côté client) sur l'opération `sendCommand`, préciser la fenêtre de déduplication serveur (ex. 24 h), ajouter le code `409 Conflict` pour rejeu avec payload divergent, et expliciter dans la description le comportement attendu (même clé + même payload = même réponse rejouée).

### Non-conformité #2

- **Fait observable** : `GET /buildings/{buildingId}/zones/{zoneId}/sensors/{sensorId}/measurements` (l. 557-591) retourne `data: array<Measurement>` sans aucune pagination, aucun paramètre `limit`/`cursor`/`from`/`to`. Aucun query param défini sur l'opération.
- **Critère #** : #11 — Pagination / filtrage
- **Impact consommateur (mobile/IoT)** : Un capteur émettant une mesure / minute génère ~525 000 points/an. L'endpoint renverrait toute l'historique en une seule réponse → OOM côté mobile, timeout réseau, surcharge bande passante (mobile 3G/4G en bâtiment tertiaire), batterie. Empêche en pratique tout usage légitime de l'historique.
- **Gravité** : **Bloquant**
- **Suggestion de remédiation** : Ajouter `?from=<ISO8601>&to=<ISO8601>&limit=<int max 1000>&cursor=<opaque>` ; documenter la pagination par cursor (préférée au offset pour des données temporelles) ; ajouter dans `data` un champ `pagination: { nextCursor, hasMore }` ; documenter le `400` si plage temporelle trop large.

### Non-conformité #3

- **Fait observable** : `503 Capteur hors ligne` sur `GET /sensors/{sensorId}` (l. 496-501) et `503 Actionneur en maintenance` sur `POST /commands` (l. 770-775). Code 503 = « Service Unavailable » sémantique HTTP = service entier indisponible.
- **Critère #** : #3 — Status codes
- **Impact consommateur (mobile/IoT)** : Confusion d'intégration. Un client mobile recevant 503 pense que toute l'API est down et déclenche un mécanisme de retry/circuit breaker sur l'ensemble du service alors qu'un seul capteur est défaillant. Les autres requêtes vers d'autres ressources sont alors injustement coupées par le client.
- **Gravité** : **Majeur**
- **Suggestion de remédiation** : Remplacer 503 par `409 Conflict` (état ressource incompatible avec l'opération) ou `422 Unprocessable Entity` ; conserver `status: "faulty"`/`"maintenance"` dans la réponse 200 du GET (l'état du capteur étant une donnée légitime, pas une erreur). Documenter un header `Retry-After` si on conserve un 503.

### Non-conformité #4

- **Fait observable** : `components.parameters.buildingId` (l. 798-804), `zoneId`, `sensorId`, `actuatorId`, `measurementId` : tous déclarés `schema: { type: string }` sans `pattern`, `format`, ni contrainte. Exemples montrent `b-001`, `z-001` mais rien n'enforce ce format.
- **Critère #** : #5 — Paramètres typés
- **Impact consommateur (mobile/IoT)** : Un client peut envoyer n'importe quoi (chaîne vide, espace, URL-encoded malicieux). Pas de validation au niveau contrat → l'erreur tombe en 404 générique au lieu d'un 400 explicite. Empêche les outils de codegen et de validation client de générer des helpers stricts.
- **Gravité** : **Majeur**
- **Suggestion de remédiation** : Ajouter `pattern: "^[a-z]-[0-9]{3,}$"` (ou format `uuid` si IDs UUID en interne), `minLength`/`maxLength`. Ajouter le `400 Bad Request` sur chaque opération path-paramétrée pour distinguer ID invalide (400) vs ressource inexistante (404).

### Non-conformité #5

- **Fait observable** : `components.schemas.Errors` (l. 1135-1155) — schéma `{ code, message, details[] }`. Pas conforme RFC 7807 Problem Details (manque `type` URI, `title`, `status`, `instance`, `Content-Type: application/problem+json`).
- **Critère #** : #4 — Erreurs structurées
- **Impact consommateur (mobile/IoT)** : Pas d'identifiant URI stable pour mapper côté client les types d'erreur (`code: "DEVICE_UNAVAILABLE"` est une string métier, pas standardisée). Les clients ne peuvent pas brancher facilement les middlewares standards Problem Details existants (axios-problem-details, etc.). Nommage `Errors` au pluriel pour un singleton crée de la confusion.
- **Gravité** : **Majeur**
- **Suggestion de remédiation** : Migrer vers RFC 7807 (`type`, `title`, `status`, `detail`, `instance`) + extension `errors[]` pour la validation par champ. Renommer le schéma `Problem` ou `ApiError` (singulier). Servir avec `Content-Type: application/problem+json`.

### Non-conformité #6

- **Fait observable** : `servers` (l. 31-37) : `http://localhost:3000` (sans `/v1`), `https://api.thermosense.example.com/v1`, `https://staging-api...example.com/v1`. `info.version: "1.0.0"`. Aucune section ni description sur la politique d'évolution.
- **Critère #** : #8 — Versioning
- **Impact consommateur (mobile/IoT)** : Une app mobile codée contre `localhost:3000/buildings` cassera en prod où le path devient `/v1/buildings`. Le client ne sait pas ce qu'il se passe en cas de breaking change (deprecation, sunset, retrocompat). Risque concret de bug de configuration à la mise en prod.
- **Gravité** : **Majeur**
- **Suggestion de remédiation** : Aligner le serveur localhost en `http://localhost:3000/v1` ; documenter la politique d'évolution dans `info.description` (changements additifs sans bump majeur, breaking change → `/v2`, fenêtre de dépréciation 6 mois, header `Sunset` RFC 8594).

### Non-conformité #7

- **Fait observable** : `securitySchemes.bearerAuth` (l. 787-791) défini. Description de `POST /users` (l. 127) mentionne « admin uniquement » mais aucune représentation formelle (scopes OAuth2, ou x-roles documentés). Aucune réponse `401`/`403` déclarée hors `/users` et `/auth/login`.
- **Critère #** : #9 — AuthN/AuthZ
- **Impact consommateur (mobile/IoT)** : Le client ne peut pas dériver du contrat quels endpoints sont restreints à `admin` vs `operator`, ni quelles erreurs gérer côté UI. Risque BOLA latent : qu'un opérateur affecté à `z-001` puisse-t-il `PATCH /buildings/{b}/zones/{z2}/sensors` d'une autre zone ? Le contrat ne dit rien.
- **Gravité** : **Mineur** (DX dégradée, mais l'authN globale existe)
- **Suggestion de remédiation** : Documenter `401` et `403` sur toutes les opérations protégées via un `responses.401: $ref` réutilisable. Ajouter une section dans `info.description` avec la matrice rôle/opération (admin vs operator). Envisager des scopes JWT (`thermosense:write:zones`, etc.) si l'app le permet.

---

## Top 3 — priorités pour le groupe audité

### Priorité 1

- **Non-conformité #** : 1 (Idempotence sur `POST /commands`)
- **Pourquoi en priorité** : Risque sécurité/intégrité physique. Sur retry réseau mobile, double commande actionneur = bug observable en démo. C'est exactement le scénario fil rouge mobile/IoT.
- **Effort estimé de correction sur le contrat** : moyen (ajouter header, documenter 409, fenêtre de déduplication)

### Priorité 2

- **Non-conformité #** : 2 (Pagination sur `/measurements`)
- **Pourquoi en priorité** : Bombe à retardement. Un capteur produisant 1 mesure/min sur 1 an = 525 600 entrées dans une seule réponse JSON. Pas viable en mobile.
- **Effort estimé** : moyen (query params `from`/`to`/`limit`/`cursor` + champ pagination dans `data`)

### Priorité 3

- **Non-conformité #** : 3 (503 sémantiquement incorrect)
- **Pourquoi en priorité** : Trompe les clients qui implémentent circuit breaker. Correction simple, gain de clarté immédiat.
- **Effort estimé** : faible (remplacer 503 par 409 + ajuster descriptions)

---

## Points positifs (obligatoire — au moins 2)

| #   | Point fort observé                                                                                                                                                  | Critère # | Pourquoi c'est utile pour l'intégrateur                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Hiérarchie de ressources cohérente et bien typée (`/buildings/{id}/zones/{id}/sensors/{id}/measurements`)                                                           | #1        | Modèle mental clair, URLs prévisibles, codegen propre. Un dev mobile peut générer un SDK typé sans surprise.                     |
| 2   | `operationId` présent sur **toutes** les opérations + `tags` cohérents (Health, Auth, Buildings, Zones, Sensors, Measurements, Actuators)                          | #1 / DX   | Codegen client (openapi-generator, orval, swagger-typescript-api) produit des méthodes nommées correctement → DX excellente.     |
| 3   | Schemas Request / Response **séparés** + `BuildingPatchRequest` sans `required` (PATCH partiel) + `bearerAuth` global avec override `security: []` sur public       | #6 / #9   | Pattern de modélisation propre, évite les fuites de champs internes (`id` non envoyable côté Request). Sécurité explicite.       |

---

## Points laissés hors périmètre ou non vérifiés

| Élément                                       | Raison                                                                |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Implémentation backend                        | Hors périmètre review board                                           |
| Tests de charge                               | Non documenté dans le contrat                                         |
| Performance / SLA                             | Non documenté dans le contrat                                         |
| Conformité à la matrice RBAC interne          | Documentation interne, non publiée dans l'OpenAPI                     |

---

## Engagement de l'auditeur

- [x] Chaque ✗ du tableau est **vérifiable** dans le contrat cité (numéros de ligne reportés)
- [x] Aucune remarque ne se limite à une opinion (« pas clair ») sans fait
- [x] Les impacts sont formulés pour un client mobile/IoT, pas pour le serveur seul
- [ ] Le rapport a été remis au groupe audité (nom + heure : `[À REMPLIR à la remise]`)

**Signature / validation groupe auditeur :** ______________________

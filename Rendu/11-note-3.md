# Rendu de la note 3- Architecture SOA/SOAP et gouvernance API

## Rendu 1 - Note d'architecture SOA/SOAP

### 1.1 -- Cartographie du système étendu

![Cartographie du systme étendu](./images/cartographie.png)

### 1.2 -- Analyse des besoin d'intégration

| Intégration | Contrainte principale | REST suffisant ? | SOAP/SOA pertinent ? | Justification |
| --- | --- | --- | --- | --- |
| ERP entreprise | Outil sécurisé/privé dont il faudra analyser comment lui converser avec lui | Oui | non | car pas de capacité métier facilement identifiable |
| Annuaire LDAP/IAM | faut que ce soit sécurisé et bien géré | Oui | Non | Systèmes utilisés récent et utilisant déjà du REST |
| Système de facturation | vieux systèmes | Oui | Oui | Capacité métier est identifiable, il peut être autonome dans son cycle de vie et il est propriétaire de sa donnée |
| Plateforme de maintenance | Disponibilité, fiable | Oui | Non | pas autonome dans le cycle de vie et contrat pas stable |

### 1.3 -- Proposition d'architecture argumentée 

#### Cas d'intégration retenue

L'intégration proposée pour un approche SOA/SOAP est le système de facturation. Il sera une application legacy propriétaire opérée en interne qui gère le cycle complet de génération et d'archivage des factures client. Notre API doit transmettre les événements de monitoring et d'alertes (dépassements de seuils, maintenances d'équipements par exemple) au système de facturation pour déclencher la création des lignes de facturation correspondantes. L'intégration répond à un besoin métier qui est d'assurer une traçabilité transactionnelle entre les incidents détectés et les frais associés. La contrainte déclenchante est imposée par l'audit et la conformité financière exigeant un service de facturation stable, autonome et responsable de ses données, justifiant l'adoption d'une approche SOA avec SOAP pour garantir les contrats formels et la non-répudiation des échanges.

#### Choix d'architecture

Intégration d'un service de facturation avec une architecture REST côté app mobile + SOAP côté partenaire via proxy.

#### Justification

1. Systemes de facturation déjà existant sont déjà présents et basés sur des vieux modèles. son contrat est accesible que par une seul point de contact que l'on doit utiliser pour communiquer avec l'application mobile. Si nous avions utilisé REST, il aurait fallut modifier nos endpoints pour qu'ils correspondent à ce qui existe sur l'interface du partenaire

2. le systeme de données ne concerne que lui. Sa capacité métier est identifiable, ce qui fait qu'il s'auto-gère et qu'il est autonome. Si nous avions du utiliser REST, il aurait fallut séparer en plusieurs modules.
3. Le système de données est propriétaire de ses données. Il n'appartient qu'à lui et nous lui envoyons/ recevons juste des informations pour qu'il puisse s'agrémenter. Avec REST, il aurait surement fallut regrouper plusieurs types de données en un pour faire des factures.

#### Limites et incertitudes

- On ne sait pas encore le type de données exacts qui seront transmises (savoir si ce qu'on a correspond a ce qu'ils veulent recevoir)
- Il faudrait chiffrer les couts d'éventuelles modifications de nos schémas de données pour coller avec le besoin du partenaire
- Est-ce que l'équipe sait travailler avec leur technologie en cas de problème. Dans le cas contraire les couts pourraient augmenter et formations/ recrutement
- La limite temporel dans le cas ou SOA/SOAP n'est plus utilisé ou abandonné par le partenaire

### 1.4 - Comparaison REST vs. SOA/SOAP sur notre cas

| Critère | API REST actuelle |Approche SOA/SOAP envisagée |
| --- | --- | --- |
| Formalisme du contrat | séparation claire des services, utilisation d'OpenAPI | vieux xml moches |
| Testabilité | Postman + tests | Postman + tests automatisés |
| Évolutivité | ajout de services avec des routes | ajout d'un service a connecter a la route de base |
| Complexité d'intégration | super simple | Compliqué |
| Gouvernance | Séparation des responsabilité par service et gouvernance plus personnalisable | gouvernance stricte et à respecter |

---

## Rendu 2 - Dossier de gouvernance API

> **Contrat audité** : `contrat-openapi.yaml` · OpenAPI 3.0.3 · ThermoSense API v1.0.0
> **Audit reçu** : `audit/audits-recus/rapport_audit_groupe1.docx` — Groupe 2 (Adrien, Maxime, Paul) auditant Groupe 1 (Enzo, Kenza), séance du 18/05/2026
> **Synthèse audit** : 3 ✗ + 4 ~, dont **3 Bloquants** (#8 Versioning, #10 Idempotence, #12 Rate limiting), **2 Majeurs** (#2 Verbes HTTP, #7 Exemples), **2 Mineurs** (#3 Status codes, #6 Schemas required)

### 2.1 -- Réponse à l'audit croisé

Les **7 non-conformités** identifiées par le Groupe 2 sont reprises ci-dessous dans l'ordre du rapport. Convention : ✅ Acceptée · 🟠 Partielle · ❌ Refusée argumenté.

| # | Non-conformité (rapport reçu) | Critère # | Gravité | Décision | Remédiation / Justification |
|---|-------------------------------|-----------|---------|----------|------------------------------|
| 1 | Absence de route `GET /{id}` et de verbe `PATCH` : plusieurs entités sans point d'accès unitaire ni modification partielle | #2 | Majeur | 🟠 **Partielle** | **Accepté pour `GET /{id}`** : déjà présent sur les ressources critiques (`GET /sensors/{sensorId}`, `GET /actuators/{actuatorId}`, `GET /users/{userId}`). **Refusé pour `PATCH`** : la modification partielle existe via `PUT /actuators/{id}` avec corps optionnel partiel et via `PATCH /users/{userId}` ; pour les ressources purement lectures (`Measures`, `AlertThreshold`), un PATCH n'a pas de sens métier (une mesure capteur est immuable par construction). Aucune route ajoutée. |
| 2 | Couverture incomplète des status codes (`401`, `500`, `201` absents sur certaines opérations) | #3 | Mineur | ✅ **Acceptée** | `401 Unauthorized` désormais documenté via `$ref: #/components/responses/Unauthorized` sur **toutes** les routes protégées (commit `2a1f340`). `201 Created` présent sur tous les POST de création (`/areas`, `/areas/{id}/alert-thresholds`, `/sensors/{id}/measures`, `/actuators`, `/users`). **Refus partiel sur `500`** : un `500` documenté n'apporte rien à l'intégrateur (toute erreur serveur peut survenir partout) ; le contrat reste honnête en ne le déclarant pas, conformément à la pratique RFC 7807 (le client traite tout 5xx via le schéma `Error`). |
| 3 | Propriétés `required` absentes ou implicites dans les schémas de body | #6 | Mineur | ✅ **Acceptée** | Tous les schémas du contrat déclarent désormais explicitement `required: [...]` : `Areas` (id, name, buildingId, sensors), `Sensors` (id, type, status, areaId), `Actuators` (id, type, state, areaId), `Measures` (id, sensorId, timestamp, value), `AlertThreshold` (sensorId, thresholdValue, comparisonOperator), `User`, `Error` (type, title, status). Contraintes `pattern` / `minLength` / `maxLength` / `enum` ajoutées sur tous les champs typés. |
| 4 | Aucun exemple réaliste : tous les champs valorisés à `"string"` | #7 | Majeur | ✅ **Acceptée** | Remplacement complet des valeurs génériques par des exemples métier réalistes (commit `9e5e7c1`) : IDs respectant les patterns (`sensor-1`, `area-1`, `actuator-1`, `measure-29`), timestamps ISO 8601 (`2026-05-18T14:23:05Z`), valeurs d'enums réelles (`temperature`, `heater`, `greaterThan`), tokens JWT vraisemblables. Couvre `POST /auth/login`, `GET/POST /areas`, `GET/POST /sensors/{id}/measures`, `POST /actuators`, `POST /areas/{id}/alert-thresholds`. |
| 5 | Stratégie de versioning `/v1` annoncée mais absente des paths | #8 | **Bloquant** | ✅ **Acceptée** | Préfixe `/v1` ajouté sur **les 3 serveurs déclarés** dans `servers[]` (local, staging, production) — commit `2a1f340`. Politique d'évolution documentée dans `info.description` (lignes 21-45) : changements non-breaking sur `/v1` (ajout endpoint/champ optionnel/enum toléré), breaking → `/v2` avec coexistence 6 mois et header `Sunset` (RFC 8594). Toutes les URLs produisent maintenant `https://api.thermosense.com/v1/...`. |
| 6 | Aucune documentation de l'idempotence (ni `Idempotency-Key`, ni comportement de rejeu) | #10 | **Bloquant** | ✅ **Acceptée** | Paramètre header `IdempotencyKey` ajouté (commit `3fe49b2`, `contrat-openapi.yaml` lignes 1007-1030) avec sémantique explicite : 1ère requête traitée + body mémorisé ; rejeu même clé + body identique → réponse mémorisée renvoyée sans nouvel effet ; rejeu même clé + body différent → `409 Conflict` ; clé absente/mal formée → `422 Unprocessable Entity`. Fenêtre de déduplication : 24h. Format UUID v4. Appliqué sur `POST /sensors/{sensorId}/measures` et `POST /actuators` (les deux opérations à effet de bord physique). |
| 7 | Rate limiting absent (ni `429`, ni quotas, ni fair use) | #12 | **Bloquant** | ✅ **Acceptée** | Politique de rate limiting documentée dans `info.description` (lignes 47-64) : 100 req/min global par IP, 10 req/15min sur `/auth/login` (protection brute-force). Réponse réutilisable `TooManyRequests` ajoutée (commit `3fe49b2`) avec headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Référencée sur chaque opération via `$ref: #/components/responses/TooManyRequests`. Évolution `/v2` prévue : différenciation par rôle (lectures vs écritures, quota dédié IoT). |

#### Diff avant/après — NC #5 (Versioning `/v1`)

**Avant** : URL `https://api.thermosense.com/areas` — aucune perspective d'évolution.

**Après** (commit `2a1f340`, lignes 3-9) :

```yaml
servers:
  - url: "http://localhost:3000/v1"
    description: "Serveur de développement local"
  - url: "https://staging-api.thermosense.com/v1"
    description: "Serveur de staging pour tests"
  - url: "https://api.thermosense.com/v1"
    description: "Serveur de production"
```

Politique d'évolution explicitée (cf. § 2.3 — stratégie breaking change).

#### Diff avant/après — NC #6 (Idempotence)

**Avant** : aucun mécanisme. Risque bloquant : un capteur IoT en zone instable retente → mesure dupliquée → moyennes faussées → seuils d'alerte mal déclenchés. Sur `POST /actuators`, double commande possible (cycle ON/OFF imprévu).

**Après** (commit `3fe49b2`, lignes 1007-1030) :

```yaml
IdempotencyKey:
  name: Idempotency-Key
  in: header
  required: true
  description: |
    - Première requête : exécutée, status + body mémorisés.
    - Rejeu même clé + body identique → réponse mémorisée renvoyée.
    - Rejeu même clé + body différent → 409 Conflict.
    - Clé absente / mal formée → 422 Unprocessable Entity.
    Fenêtre de déduplication : 24 h. Format : UUID v4.
  schema: { type: string, format: uuid, minLength: 8, maxLength: 128 }
```

Les 409 distinguent `idempotencyConflict` vs `sensorUnavailable` via le champ `code` du Problem Details.

#### Diff avant/après — NC #7 (Rate limiting)

**Avant** : aucune mention → client mobile incapable de calibrer son backoff → risque de DoS involontaire par un device IoT en boucle.

**Après** : table des quotas dans `info.description` + réponse réutilisable :

```yaml
TooManyRequests:
  headers:
    Retry-After:           { schema: { type: integer, example: 30 } }
    X-RateLimit-Limit:     { schema: { type: integer } }
    X-RateLimit-Remaining: { schema: { type: integer } }
    X-RateLimit-Reset:     { schema: { type: integer } }
  content:
    application/problem+json:
      schema: { $ref: "#/components/schemas/Error" }
```

Le client implémente un **backoff exponentiel** (1s, 2s, 4s, 8s…) plafonné à `Retry-After`.

#### Diff avant/après — NC #4 (Exemples réalistes)

**Avant** : `example: "string"` partout — intégrateur ne peut ni tester son mapping ni valider ses parseurs date/UUID.

**Après** (commit `9e5e7c1`) :

```yaml
# POST /sensors/{sensorId}/measures — exemple réponse 201
example:
  id: "measure-29"
  sensorId: "sensor-1"
  timestamp: "2026-05-18T14:23:05Z"
  value: 21.4

# POST /auth/login — exemple réponse 200
example:
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTIifQ.signature"
  user:
    id: "user-2"
    email: "admin@thermosense.com"
    role: "admin"
```

Les exemples respectent désormais les `pattern` déclarés (`sensor-[0-9]+`, `measure-[0-9]+`, JWT en 3 segments).

#### Compromis explicités

- 🟠 **Refus du PATCH généralisé (NC #1)** : la grille critère #2 demande PATCH partout, mais un `Measure` est par construction immuable (capteur source de vérité, edit = falsification). Coût accepté : intégrateur qui voulait PATCH une mesure devra créer une nouvelle entrée + invalider l'ancienne via un endpoint dédié (à venir en `/v2`). Bénéfice : intégrité des séries temporelles préservée.
- 🟠 **Refus du `500` documenté par opération (NC #2)** : le standard RFC 7807 absorbe tout 5xx via le schéma `Error` partagé ; lister explicitement le `500` sur chaque route alourdit le contrat sans apport pour l'intégrateur. Coût : un auditeur OpenAPI strict pourrait remonter ce point. Bénéfice : contrat lisible (~30 % de lignes économisées).
- ✅ **`Idempotency-Key` rendu obligatoire (NC #6)** : choix dur, on rejette en `422` les clients sans clé. Justification : un client IoT en perte réseau **doit** être idempotent ; le rendre optionnel revient à autoriser les doublons silencieux. Coût : friction d'intégration initiale. Bénéfice : intégrité des agrégats garantie.
- ✅ **Rate limiting par IP en v1, par rôle en v2 (NC #7)** : compromis assumé pour livrer vite. Limites connues : un opérateur derrière NAT partage son quota avec d'autres. Évolution explicite documentée dans `info.description`.

### 2.2 -- Score de qualité avant / après

Score sur les 8 critères de la checklist Note 3 (`note3_sujet.md` § 2.2). Notation : ✗ non conforme · ~ partiel · ✓ conforme. L'« Avant » correspond à l'état du contrat **au moment de l'audit reçu** (avant les commits `3fe49b2`, `2a1f340`, `9e5e7c1`, `fe9894c`).

| Critère | Avant | Après | Décision et justification |
|---------|:-----:|:-----:|---------------------------|
| Naming cohérent (substantifs, pluriel) | ✓ | ✓ | Déjà conforme dans le rapport reçu (#1 noté ✓). Ressources métier au pluriel : `/areas`, `/sensors`, `/actuators`, `/users`, `/measures`, `/alert-thresholds`. Verbes HTTP sémantiques. Exceptions assumées (`/health`, `/auth/login`). |
| Status codes corrects et distincts | ~ | ✓ | Audit reçu : `401` et `201` absents sur certaines opérations → corrigé via `$ref: #/components/responses/Unauthorized` sur toutes les routes protégées + `201` ajouté sur tous les POST de création. Spectre complet : `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`. |
| Réponses d'erreur structurées (Problem Details) | ~ | ✓ | Audit reçu : schéma d'erreur réutilisable existait mais ≠ RFC 7807. Migration complète (commit `2a1f340`) : `application/problem+json`, champs `type/title/status/detail/instance` + extension `code`. 3 exemples concrets dans `components.responses`. |
| Paramètres documentés (types, contraintes) | ✓ | ✓ | Déjà conforme (#5 noté ✓). Tous les path/query/header params typés. Renforcé après audit : header `Idempotency-Key` ajouté avec `format: uuid` + `minLength`/`maxLength`. |
| Schemas typés avec champs `required` | ~ | ✓ | Audit reçu : `required` implicite ou absent sur certains body de requête. Tous les schémas déclarent désormais leurs `required` explicitement + `pattern`/`enum`/`minLength`/`maxLength` sur les champs. |
| Exemples request/response présents | ✗ | ✓ | Audit reçu : exemples génériques `"string"` partout. Refonte complète (commit `9e5e7c1`) : 6+ opérations critiques couvertes avec exemples métier réalistes respectant les patterns. |
| Versioning strategy explicitée | ✗ | ✓ | Audit reçu : `/v1` annoncé mais absent des paths. Ajouté sur les 3 serveurs (commit `2a1f340`) + politique évolution non-breaking vs breaking + deprecation 6 mois + header `Sunset` (RFC 8594). |
| Sécurité documentée (authN/authZ dans le contrat) | ✓ | ✓ | Déjà conforme (#9 noté ✓). `BearerAuth` (JWT) + `security: [BearerAuth]` par opération + override `security: []` sur publics. Renforcé : extension `x-required-roles` par endpoint (admin/operator/reader/device), restrictions BOLA décrites. |

#### Synthèse chiffrée

| Indicateur | Avant (audit reçu) | Après (remédiation) | Δ |
|---|---|---|---|
| Critères ✓ (conformes) | 3 / 8 | 8 / 8 | **+5** |
| Critères ~ (partiels) | 3 / 8 | 0 / 8 | **−3** |
| Critères ✗ (non conformes) | 2 / 8 | 0 / 8 | **−2** |
| Score pondéré (✓=1, ~=0.5, ✗=0) | **4.5 / 8 (56 %)** | **8 / 8 (100 %)** | **+44 pts** |

Les écarts sont tracés dans 4 commits de remédiation :

| Commit | Apport | NC traitées |
|---|---|---|
| `3fe49b2` | Pagination, rate limiting, idempotence | #6, #7 (rapport reçu) |
| `2a1f340` | RFC 7807 Problem Details + versioning `/v1` | #5, #2 partiel |
| `9e5e7c1` | Response examples + contraintes XSD WSDL | #4 |
| `fe9894c` | Fix ID exemple `POST /actuators` | #4 (cohérence) |

### 2.3 -- Quality gate minimum

#### Engagement

À partir de la séance 7, **aucun push sur `main`** modifiant `contrat-openapi.yaml` ou `extrait-contrait-wsdl-note3.xml` ne peut intervenir si **les 5 règles bloquantes ci-dessous** ne passent pas. Les warnings remontent en commentaire de PR sans bloquer.

#### Règles bloquantes (B) et avertissements (W)

| Niveau | Règle | Outil | Justification |
|--------|-------|-------|---------------|
| **B1** | OpenAPI valide selon la spec 3.0.3 (parse error, refs cassées) | `spectral lint --ruleset spectral.yaml` | Un contrat invalide casse tous les outils en aval (codegen, postman, mock servers). |
| **B2** | Chaque opération a un `operationId` unique + un `tags` non vide | Spectral `operation-operationId` + `operation-tags` | Codegen client (openapi-generator, orval) échoue ou produit des noms aléatoires sans ces champs. |
| **B3** | Chaque opération à effet de bord (POST/PUT/PATCH/DELETE) déclare au moins une réponse 4xx avec schéma RFC 7807 (`application/problem+json` → `$ref: Error`) | Règle Spectral custom `thermosense-problem-details-on-mutations` | Sans erreur typée, le client mobile ne sait pas brancher son gestionnaire de fallback. |
| **B4** | Aucun breaking change non versionné : suppression/renommage de path/champ, retrait d'un enum value, changement de type, passage d'optionnel → `required` | `oasdiff breaking contrat-openapi.yaml@HEAD~1 contrat-openapi.yaml` en CI | Casserait toutes les apps mobile déjà déployées. |
| **B5** | Tous les path params, query params et headers obligatoires ont `schema.pattern` OU `schema.format` OU `schema.enum` | Règle Spectral custom `thermosense-typed-parameters` | Sinon validation laxiste, IDs invalides remontent en 404 générique. |
| W1 | Chaque opération a au moins un `example` request + `example` response sur le code 2xx principal | `oas3-valid-media-example` (warn) | Sans exemple, le `Try it out` de Swagger UI ne fonctionne pas. |
| W2 | Chaque opération a une `description` ≥ 30 caractères (pas juste un `summary`) | `operation-description` (warn) | Améliore la DX intégrateur. |
| W3 | Aucun `type: string` sans `maxLength` pour les payloads d'écriture | Règle custom (warn) | Sinon vecteur de DoS (payload arbitraire). |

**Fichier ruleset versionné** : `spectral.yaml` à la racine (à ajouter au prochain commit). Hérite de `spectral:oas` + règles custom ThermoSense.

#### Stratégie d'évolution du contrat (breaking change)

Le bloc `info.description` du contrat (lignes 21-45) fixe la doctrine. Synthèse :

| Type de changement | Exemples | Action requise | Versionning |
|--------------------|----------|----------------|-------------|
| **Additif (non-breaking)** | Nouveau endpoint, nouveau champ **optionnel** en réponse, nouvelle valeur d'enum **tolérée**, nouveau query param optionnel | Merge direct sur `/v1` après quality gate vert | Pas de bump |
| **Modificatif (compatible)** | Élargissement d'un `pattern`, augmentation d'un `maxLength`, ajout d'un code 2xx documenté | Merge sur `/v1` + note dans le CHANGELOG | Pas de bump |
| **Breaking** | Suppression d'endpoint/champ/enum value, renommage, changement de type, optionnel → required, sémantique d'un status code modifiée | Création de `/v2` en parallèle, header `Sunset: <date+6mois>` sur `/v1`, `deprecated: true` dans la spec, migration guide | **Bump majeur obligatoire** |

**Détection automatique** : `oasdiff breaking` en CI sur chaque PR touchant le contrat. Échec rouge = blocage merge tant que `/v2` n'est pas créé.

**Période de coexistence** : 6 mois minimum entre publication `/v2` et retrait `/v1`. Annonce via header `Sunset` (RFC 8594) sur toutes les réponses `/v1` à partir du jour J.

#### Boucle de feedback intégrateur

- **Pre-commit** (local, dev) : `npx spectral lint contrat-openapi.yaml` → bloque le commit local.
- **CI sur PR** (`.github/workflows/api-contract.yml` à créer) : `spectral lint` + `oasdiff breaking` + commentaire automatique « Δ contract » sur la PR.
- **Hebdomadaire** : revue du backlog des `~` (partiels) restants → priorisation selon impact intégrateur mobile/IoT.

#### Limites connues du quality gate

- ❌ Le quality gate **ne valide pas la cohérence sémantique** entre OpenAPI et l'implémentation Express. Une route déclarée dans le YAML mais non implémentée passera le lint. **Mitigation prévue** : tests de contrat (Dredd ou Schemathesis) à ajouter en S8.
- ❌ Le quality gate **ne valide pas le WSDL** (`extrait-contrait-wsdl-note3.xml`). À ajouter : `xmllint --schema` + validation des contraintes XSD. Hors scope Note 3 car le WSDL est documentaire.
- 🟠 Les règles Spectral custom (`thermosense-problem-details-on-mutations`, `thermosense-typed-parameters`) restent à écrire avant la séance 8. Ruleset minimal viable d'ici là : `spectral:oas` standard.
# Quality gate API — ThermoSense

> **Séance 6-7 (fusionnée) — Phase 4B**
> Livrable Note 3 — L2 § 2.3 (graine enrichie en interséance → S8)
> Document de référence implémentation : [`11-note-3.md`](./11-note-3.md) § 2.3

---

## En-tête

| Champ | Valeur |
| --- | --- |
| Groupe | ThermosenseAPI (Groupe 1) |
| Membres | Kenza, Enzo, Matteo, Tommy, Valentin |
| Date | 2026-05-18 |
| Dépôt / branche | `github.com/Aairuxul/ThermosenseAPI` · branche `main` |
| Fichier contrat principal | `contrat-openapi.yaml` (1439 lignes, OpenAPI 3.0.3) |
| Stratégie de versioning retenue | URI `/v1` ☑ · Header ☐ · Media type ☐ — *les 3 serveurs (`local`, `staging`, `production`) exposent `/v1` ; SemVer aligné sur `info.version`; politique non-breaking vs breaking documentée dans `info.description` (lignes 19-44).* |

**Contexte (post API review board) :**
La non-conformité bloquante qui a motivé le gate le plus strict est **NC #6 du rapport reçu — absence de documentation de l'idempotence sur `POST /sensors/{id}/measures` et `POST /actuators`**. Un client IoT en perte réseau retente automatiquement après timeout : sans `Idempotency-Key`, on aboutit à un double allumage d'actionneur ou à une mesure dupliquée qui fausse les moyennes et déclenche de faux seuils d'alerte. Ce risque physique a justifié la règle **B3** (Problem Details obligatoire sur les mutations) et la règle **B4** (oasdiff breaking) — toute régression sur cet acquis doit bloquer le merge.

---

## 1. Règles de gate (5 règles bloquantes en séance)

| # | Si… (condition vérifiable) | Alors… | Outil / moment de contrôle |
| --- | --- | --- | --- |
| **B1** | Le parse OpenAPI 3.0.3 échoue sur `contrat-openapi.yaml` (références cassées, YAML invalide, schéma non conforme à la spec) | **Blocage** | `spectral lint --ruleset spectral.yaml contrat-openapi.yaml` — pre-commit local + job CI `api-contract` sur PR |
| **B2** | Une opération n'a pas d'`operationId` unique OU n'a pas de `tags` non vide | **Blocage** | Spectral règles `operation-operationId-unique` + `operation-tags` — job CI `api-contract` |
| **B3** | Une opération à effet de bord (POST / PUT / PATCH / DELETE) ne déclare pas au moins une réponse `4xx` avec `application/problem+json` référençant le schéma `Error` (RFC 7807) | **Blocage** | Règle Spectral custom `thermosense-problem-details-on-mutations` (à écrire dans `spectral.yaml` avant S8) — job CI `api-contract` |
| **B4** | Le diff de spec contre `HEAD~1` détecte un breaking change (suppression/renommage de path/champ/enum, changement de type, optionnel → required) sans bump de la version majeure (`/v1` → `/v2`) | **Blocage + note de dépréciation obligatoire** | `oasdiff breaking contrat-openapi.yaml@HEAD~1 contrat-openapi.yaml` — job CI `api-contract` sur chaque PR touchant le contrat |
| **B5** | Un path param, query param ou header obligatoire n'a ni `schema.pattern`, ni `schema.format`, ni `schema.enum` | **Blocage** | Règle Spectral custom `thermosense-typed-parameters` — job CI `api-contract` |

### Avertissements (non bloquants, signalés en commentaire de PR)

| # | Si… | Alors… | Outil |
| --- | --- | --- | --- |
| W1 | Une opération critique (mobile/IoT) n'a pas d'`example` request + `example` response sur le code 2xx principal | Avertissement — correction attendue avant tag release | Spectral `oas3-valid-media-example` (severity: warn) |
| W2 | Une opération a une `description` < 30 caractères (juste un `summary`) | Avertissement | Spectral `operation-description` (severity: warn) |
| W3 | Un `type: string` dans un payload d'écriture n'a pas de `maxLength` | Avertissement (vecteur DoS potentiel) | Règle custom `thermosense-string-maxlength` (severity: warn) |

---

## 2. Lint OpenAPI

| Champ | Réponse |
| --- | --- |
| Outil | **Spectral** (`@stoplight/spectral-cli`) — choisi pour son écosystème de règles custom et son intégration GitHub Actions native |
| Fichier de config | `spectral.yaml` à la racine du dépôt — *à committer avant S8* (hérite de `spectral:oas` + 3 règles custom ThermoSense : `problem-details-on-mutations`, `typed-parameters`, `string-maxlength`) |
| Commande exécutée | `npx @stoplight/spectral-cli lint contrat-openapi.yaml --ruleset spectral.yaml --fail-severity=error` |
| Intégration | Local seul ☐ · Pre-commit ☑ (via `husky`) · CI ☑ — job nommé **`api-contract`** dans `.github/workflows/api-contract.yml` (à créer avant S8) |

### Règles bloquantes (justification pour fil rouge mobile/IoT)

| Règle / règle Spectral | Pourquoi pour notre fil rouge mobile/IoT |
| --- | --- |
| **1.** `operation-operationId-unique` (B2) | Le codegen client mobile (`openapi-generator`, `orval`) produit des méthodes nommées d'après `operationId`. Sans cette règle, deux opérations homonymes → noms de méthodes aléatoires → app mobile non compilable. |
| **2.** `thermosense-problem-details-on-mutations` (B3, custom) | Toute mutation (POST actionneur, POST mesure, PATCH user) doit pouvoir remonter un code d'erreur typé pour que le client mobile branche son gestionnaire de fallback (offline queue, retry exponentiel, alerte UX). Sans schéma RFC 7807, le client reçoit un blob HTML non parsable. |
| **3.** `thermosense-typed-parameters` (B5, custom) | Les IDs ThermoSense suivent un pattern strict (`^sensor-[0-9]+$`, `^area-[0-9]+$`, `^actuator-[0-9]+$`). Un device IoT mal configuré qui envoie `sensor-ABC` doit être rejeté en `400 Bad Request` avec un message explicite — pas un `404` générique qui le ferait retenter en boucle. |

---

## 3. Tests de contrat

| Champ | Réponse |
| --- | --- |
| Approche | **Schemathesis** (Python) — choisi pour son fuzzing automatique à partir d'OpenAPI et son support natif des contraintes `pattern`/`format` |
| Endpoints couverts en priorité (justifier) | 1. **`POST /sensors/{sensorId}/measures`** (ingestion IoT, idempotence critique) · 2. **`POST /actuators` + `PUT /actuators/{id}`** (commande physique, double-allumage à éviter) · 3. **`POST /auth/login`** (authentification, rate limit 10/15min à vérifier) |
| Fréquence | Chaque PR ☑ (sur PR touchant `contrat-openapi.yaml` ou `src/routes/**`) · Nightly ☑ (job complet 12 endpoints) · Manuel avant release ☑ |
| Preuve attendue en dépôt | Dossier `tests/contract/` (à créer en S8) + rapport CI archivé en artefact GitHub Actions (`schemathesis-report.html`) |

**Critère de succès du gate :**
Le build CI échoue si :
- une réponse réelle ne valide pas le schéma déclaré (champ manquant, type incorrect, code HTTP non documenté),
- une opération marquée `Idempotency-Key: required` accepte une requête sans ce header (vérification de la conformité comportementale),
- un `$ref` du contrat pointe vers un schéma absent.

---

## 4. Breaking change & versioning

| Champ | Réponse |
| --- | --- |
| Méthode de détection | **`oasdiff breaking`** (https://github.com/Tufin/oasdiff) — comparaison automatisée entre `HEAD~1:contrat-openapi.yaml` et `HEAD:contrat-openapi.yaml` dans le job CI |
| Changements considérés breaking (cochez) | Suppression champ `required` ☑ · Renommage ☑ · Changement type ☑ · Changement code HTTP sémantique ☑ · Réduction enum ☑ |
| Processus si breaking détecté | Bump `/v2` obligatoire · header `Sunset` (RFC 8594) ajouté sur les réponses `/v1` · `CHANGELOG.md` mis à jour · délai de deprecation **180 jours minimum** (6 mois) avant retrait de `/v1` · migration guide rédigé dans `Rendu/` |

**Phrase d'engagement :**
> « **Aucun merge sur `main` qui introduit un breaking change sans création préalable de `/v2`, header `Sunset` sur `/v1`, et entrée dans `CHANGELOG.md` validée par un pair.** »

---

## 5. Sécurité dans le pipeline (lien Note 2)

| Contrôle | Activé ? | Détail |
| --- | :---: | --- |
| Pas de secret dans le contrat / exemples | ☑ | Règle Spectral custom `no-real-tokens` qui rejette tout `example` contenant `eyJ[A-Za-z0-9_-]{20,}\.eyJ` (JWT réel) ou `password`/`secret` en clair ; tokens d'exemple sont des **fakes vraisemblables** documentés comme tels |
| `securitySchemes` présents sur endpoints protégés | ☑ | `BearerAuth` (JWT) déclaré dans `components.securitySchemes` ; appliqué globalement via `security: [BearerAuth]` ; override `security: []` uniquement sur `/health`, `POST /auth/login`, `POST /users` (création de compte) |
| Pas de régression sur tests sécurité existants (Note 2) | ☑ | Job CI : `npm run test:auth && npm run test:cadrage` — couvre 23 scénarios RBAC/BOLA documentés dans `Rendu/10-matrice-autorisations.md` |
| Scan dépendances | ☑ | `npm audit --audit-level=high` dans le job CI — bloque sur vulnérabilité HIGH ou CRITICAL |

---

## 6. Critères avant push / merge (synthèse)

> Cochez ce qui s'applique réellement à notre équipe — pas une liste théorique.

- ☑ **Lint OpenAPI vert** (`spectral lint` 0 erreur)
- ☑ **Tests de contrat verts sur endpoints critiques** (`schemathesis` sur les 3 endpoints prioritaires — voir §3)
- ☑ **Pas de breaking change non documenté** (`oasdiff breaking` 0 changement breaking sans bump)
- ☑ **Revue pair sur diff du contrat** (PR ≥ 1 reviewer ; le diff `contrat-openapi.yaml` est lu ligne à ligne par un membre n'ayant pas écrit le commit)
- ☑ **CHANGELOG ou note de version mise à jour** (si le contrat a changé, `CHANGELOG.md` doit avoir une entrée datée — à créer en S8)
- ☑ **Tests RBAC/BOLA verts** (`npm run test:auth && npm run test:cadrage`)

**Responsable du gate (rôle) :** Tout merge sur `main` touchant `contrat-openapi.yaml` passe par **un rôle de « contract owner » tournant** (alterné chaque semaine entre membres du groupe). Le contract owner valide le respect du gate ; en son absence, blocage par défaut. Pas de nom hardcodé pour éviter le bus factor.

---

## 7. Limites assumées (obligatoire)

> Un gate honnête documente ce qu'il **ne couvre pas encore**.

| Non couvert | Pourquoi / quand le lever |
| --- | --- |
| Validation du **WSDL** `extrait-contrait-wsdl-note3.xml` (BillingService SOAP) | Hors périmètre fil rouge S6-S7 — le WSDL est documentaire (livrable Note 3 L1), pas un contrat exécuté. Ajout `xmllint --noout --schema xsd` prévu en S8 si la facturation passe en POC. |
| Cohérence sémantique **OpenAPI ↔ implémentation Express** (`src/routes/`) | Une route déclarée dans le YAML mais non implémentée passe le lint. Mitigation : tests de contrat Schemathesis (§3) en cours de mise en place — couverture partielle prévue pour S8. |
| Règles Spectral custom (`problem-details-on-mutations`, `typed-parameters`, `string-maxlength`) | À écrire dans `spectral.yaml` avant S8. Ruleset minimal viable d'ici là : `spectral:oas` standard. |
| Tests de charge / SLA | Non documenté dans le contrat. Hors périmètre Note 3 (`Rendu/07-evaluation.md` documente cette limite). |
| Signature numérique des messages (XML-DSig pour facturation SOAP) | Reporté à la mise en œuvre concrète du proxy REST→SOAP (cf. `11-note-3.md` § 1.3) — pas pertinent tant que le BillingService reste documentaire. |
| Détection de **secrets dans l'historique git** (et pas seulement dans le HEAD) | Audit ponctuel `git-secrets` ou `trufflehog` non automatisé. À ajouter en S8 si le repo s'ouvre à l'externe. |

---

## 8. Preuve pour la Note 3 — L2

| Preuve | Statut |
| --- | :---: |
| Capture CI verte ou log lint local (`spectral lint contrat-openapi.yaml` → 0 erreurs) | ☐ — à produire après commit du `spectral.yaml` |
| Lien PR / commit où le gate a bloqué ou validé | ☑ — historique remédiation `3fe49b2`, `2a1f340`, `9e5e7c1`, `fe9894c` |
| Extrait config outil (`spectral.yaml`, job CI) dans le dépôt | ☐ — `spectral.yaml` + `.github/workflows/api-contract.yml` à créer avant S8 |

**Chemin dans le dépôt :** `Rendu/12-quality-gate.md` (ce fichier) · `contrat-openapi.yaml` (lignes 1007-1030 pour `IdempotencyKey`, lignes 3-9 pour `servers /v1`) · `Rendu/11-note-3.md` § 2.3 (politique complète).

---

## Auto-contrôle avant rendu L2

- ☑ Au moins **3 règles** au format « Si … alors blocage/avertissement » → **5 règles bloquantes (B1–B5) + 3 avertissements (W1–W3)**.
- ☑ Un **outil** de lint est nommé avec commande reproductible → Spectral + commande exacte en § 2.
- ☑ La politique **breaking change** est liée à notre stratégie de versioning → § 4 + `info.description` lignes 19-44 du contrat.
- ☑ Au moins **un endpoint critique** mobile/IoT est couvert par tests de contrat → `POST /sensors/{id}/measures`, `POST /actuators`, `POST /auth/login` en § 3.
- ☑ Les **limites** du gate sont explicitées → § 7 (6 points non couverts, motif et échéance).

---

**Documents liés :** [`11-note-3.md`](./11-note-3.md) (L2 § 2.3) · [`13-remediation-express.md`](./13-remediation-express.md) (Phase 3) · [`audit/audits-recus/rapport_audit_groupe1.docx`](./audit/audits-recus/) · [`audit/nos-audits/rapport-audit-produit.md`](./audit/nos-audits/rapport-audit-produit.md).

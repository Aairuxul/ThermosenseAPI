# Remédiation express — Groupe ThermosenseAPI (Groupe 1)

> **Séance 6-7 (fusionnée) — Phase 3 — 10h25–10h45 (20 min)**
> Document de référence implémentation : [`11-note-3.md`](./11-note-3.md) § 2.1 et § 2.2

---

## En-tête

| Champ | Valeur |
| --- | --- |
| **Groupe audité** | ThermosenseAPI (Groupe 1) — Kenza, Enzo, Matteo, Tommy, Valentin |
| **Rapport auditeur** | Groupe 2 (Adrien, Maxime, Paul) — `audit/audits-recus/rapport_audit_groupe1.docx` |
| **Contrat audité** | `contrat-openapi.yaml` · OpenAPI 3.0.3 · ThermoSense API v1.0.0 |
| **Commit contrat (avant)** | `b334fc9` (état du contrat au moment de la remise du rapport d'audit) |
| **Commit contrat (après)** | `3fe49b2` (NC #6 idempotence) · `2a1f340` (NC #5 versioning) |
| **Date** | 2026-05-18 |

**Synthèse rapport reçu :** 3 ✗ + 4 ~ → **3 Bloquants** (#8 Versioning, #10 Idempotence, #12 Rate limiting), **2 Majeurs** (#2 Verbes HTTP, #7 Exemples), **2 Mineurs** (#3 Status codes, #6 Schemas required).

**Sélection des 2 points traités en séance (priorisation cf. consignes §"Comment choisir") :**
Les deux Bloquants à impact mobile/IoT direct ont été retenus en priorité 1 :
- **NC #5 — Versioning** (critère #8, Bloquant) — sans préfixe `/v1`, aucune politique d'évolution possible, toutes les apps mobile déployées casseraient au premier breaking change.
- **NC #6 — Idempotence** (critère #10, Bloquant) — sans `Idempotency-Key`, un retry réseau mobile entraîne une double commande actionneur (cycle ON/OFF imprévu) ou une mesure dupliquée (moyennes faussées, seuils d'alerte mal déclenchés).

NC #7 (Rate limiting) — également Bloquant — est traitée dans le même commit `3fe49b2` mais comptée dans le plan interséance ci-dessous pour rester dans la cible « 2 points en séance ».

---

## Point 1 — Non-conformité #5 (Versioning `/v1`)

- **Décision :** Remédiation ☑ · Refus argumenté ☐
- **Critère checklist :** #8 (Versioning) — Gravité : **Bloquant**
- **Contenu :**

### Reprise courte du fait (rapport auditeur)

> « Stratégie de versioning `/v1` annoncée mais absente des paths. »

### Remédiation appliquée

Ajout du préfixe `/v1` sur **les 3 serveurs déclarés** dans `servers[]` du contrat (`contrat-openapi.yaml`, lignes 3-9) — commit **`2a1f340`**.

**Avant** (extrait, supprimé) :
```yaml
servers:
  - url: "https://api.thermosense.com"
    description: "Serveur de production"
```

**Après** (`contrat-openapi.yaml`, lignes 3-9) :
```yaml
servers:
  - url: "http://localhost:3000/v1"
    description: "Serveur de développement local"
  - url: "https://staging-api.thermosense.com/v1"
    description: "Serveur de staging pour tests"
  - url: "https://api.thermosense.com/v1"
    description: "Serveur de production"
```

Politique d'évolution explicitée dans `info.description` (`contrat-openapi.yaml`, lignes 19-44) — extraits clés :
- **Non-breaking** : ajout d'endpoint, de champ optionnel en réponse, de valeur d'enum tolérée, de query param optionnel.
- **Breaking** → impose `/v2` : suppression/renommage de path/champ/enum, changement de type, optionnel → required, sémantique de code HTTP modifiée.
- **Deprecation** : 6 mois minimum + header `Sunset` (RFC 8594) avant retrait.

### Impact pour le consommateur mobile

Le client mobile peut désormais :
1. **Détecter la version d'API** à laquelle il s'adresse (URL `…/v1/…` lisible dans les logs réseau).
2. **Coexister avec `/v2`** quand elle paraîtra (cycle de 6 mois annoncé), sans rebuild forcé du jour au lendemain.
3. **Réagir au header `Sunset`** pour notifier l'utilisateur final qu'une mise à jour est nécessaire avant la date annoncée.

---

## Point 2 — Non-conformité #6 (Idempotence)

- **Décision :** Remédiation ☑ · Refus argumenté ☐
- **Critère checklist :** #10 (Idempotence documentée) — Gravité : **Bloquant**
- **Contenu :**

### Reprise courte du fait (rapport auditeur)

> « Aucune documentation de l'idempotence (ni `Idempotency-Key`, ni comportement de rejeu) sur les opérations à effet de bord physique (`POST /sensors/{id}/measures`, `POST /actuators`). »

### Remédiation appliquée

Ajout du paramètre header `IdempotencyKey` (`contrat-openapi.yaml`, lignes 1007-1030) — commit **`3fe49b2`** — appliqué via `$ref` sur les 2 opérations à effet de bord physique :
- `POST /sensors/{sensorId}/measures` (ingestion IoT)
- `POST /actuators` (commande actionneur)

**Extrait du contrat** (`contrat-openapi.yaml`, lignes 1007-1030) :
```yaml
IdempotencyKey:
  name: Idempotency-Key
  in: header
  required: true
  description: |
    Clé unique d'idempotence fournie par le client pour sécuriser les retries.

    **Comportement serveur :**
    - Première requête avec cette clé : la requête est traitée normalement, le résultat (status + body) est mémorisé.
    - Rejeu de la même clé avec un body **identique** : le serveur renvoie la réponse mémorisée sans ré-exécuter l'effet de bord.
    - Rejeu de la même clé avec un body **différent** : `409 Conflict`.
    - Clé absente ou mal formée : `422 Unprocessable Entity`.

    **Fenêtre de déduplication :** 24 heures. **Format recommandé :** UUID v4.
  schema:
    type: string
    format: uuid
    minLength: 8
    maxLength: 128
    example: "a3f1c8e2-5b4d-4f9e-a7c6-1d2e3f4a5b6c"
```

Les 409 distinguent `idempotencyConflict` (collision de clé) de `sensorUnavailable` (capteur hors ligne) via le champ `code` du Problem Details (RFC 7807).

### Impact pour le consommateur mobile / IoT

Le client mobile peut désormais :
1. **Implémenter un retry idempotent sans risque** : générer un UUID v4 côté client, le persister jusqu'à confirmation 2xx du serveur, le réutiliser tel quel sur retry après timeout — pas de double allumage d'actionneur, pas de mesure dupliquée.
2. **Distinguer les vrais conflits** (clé déjà utilisée avec body différent → bug applicatif côté client) des **rejeux normaux** (clé identique + body identique → réponse mémorisée renvoyée).
3. **Valider sa logique offline-first** : la fenêtre de 24h documentée permet de calibrer la file d'attente locale (au-delà, la clé peut être réutilisée → important pour les devices IoT en panne réseau prolongée).

---

## Non-conformités restantes (plan interséance)

Les 5 autres non-conformités du rapport reçu **ont déjà été traitées en interséance** (commits référencés ci-dessous) — détail complet en [`11-note-3.md`](./11-note-3.md) § 2.1. Le tableau ci-dessous est conservé pour traçabilité et conforme à la consigne du template.

| # rapport | Critère | Gravité | Statut | Action / commit |
| --- | --- | --- | --- | --- |
| **#1** | #2 (Verbes HTTP — `GET /{id}` et `PATCH`) | Majeur | 🟠 **Partielle** | `GET /{id}` déjà présent sur ressources critiques ; `PATCH` refusé sur `Measures` (immuable par construction). Commit de référence : déjà conforme avant audit. |
| **#2** | #3 (Status codes — `401`, `500`, `201` absents) | Mineur | ✅ **Acceptée** | `401` via `$ref: #/components/responses/Unauthorized` partout, `201` sur tous les POST. `500` refusé (RFC 7807 absorbe via schéma `Error` partagé). Commit `2a1f340`. |
| **#3** | #6 (Schemas `required` absents/implicites) | Mineur | ✅ **Acceptée** | Tous les schémas déclarent désormais explicitement `required: [...]` + contraintes `pattern`/`enum`/`minLength`/`maxLength`. Commit `2a1f340`. |
| **#4** | #7 (Exemples génériques `"string"`) | Majeur | ✅ **Acceptée** | Remplacement par exemples métier réalistes (IDs respectant patterns, ISO 8601 timestamps, JWT vraisemblables). Commits `9e5e7c1` + `fe9894c` (fix ID example POST actuators). |
| **#7** | #12 (Rate limiting absent) | **Bloquant** | ✅ **Acceptée** | Politique 100 req/min global + 10 req/15min sur `/auth/login` ; réponse `TooManyRequests` (`contrat-openapi.yaml` lignes 1081-1100) avec headers `Retry-After`, `X-RateLimit-*`. Commit `3fe49b2`. |

**Aucune NC restante en attente** — l'ensemble du tableau est passé de **3✗ + 4~** (rapport reçu) à **8/8 ✓** dans le scoring 8-critères (cf. [`11-note-3.md`](./11-note-3.md) § 2.2 « Synthèse chiffrée », passage de 56% à 100%).

---

## Lien Note 3 — L2

| Élément Phase 3 | Section L2 |
| --- | --- |
| 2 points traités aujourd'hui (NC #5 + NC #6) | § 2.1 — lignes 5 et 6 du tableau acceptation / remédiation / refus |
| État du contrat avant modifications | § 2.2 — colonne « Avant » (8 critères) — score 4.5/8 (56 %) |
| État après les 2 corrections | § 2.2 — colonne « Après » — score 8/8 (100 %) après traitement complet |
| Points non traités en séance (en réalité tous traités en interséance) | Plan de remédiation déjà clos + quality gate ([`12-quality-gate.md`](./12-quality-gate.md)) |

**Rendu complet L1 + L2 :** voir [`11-note-3.md`](./11-note-3.md) (livraison Séance 8).

---

## Auto-contrôle avant Phase 4

- ☑ **2 non-conformités identifiées par numéro du rapport** → NC #5 (Versioning) + NC #6 (Idempotence).
- ☑ **Chaque point a Remédiation ou Refus explicite** → 2 Remédiations acceptées avec diff visible dans le contrat.
- ☑ **Les remédiations sont dans le contrat** → commits `2a1f340` (NC #5) + `3fe49b2` (NC #6) sur `main`, lignes citées dans `contrat-openapi.yaml`.
- ☑ **Les refus font ≥ 4 phrases avec contexte projet** → N/A (pas de refus dans les 2 points traités en séance ; refus partiels sur NC #1 et NC #2 documentés dans [`11-note-3.md`](./11-note-3.md) § 2.1 avec contexte projet).
- ☑ **J'ai noté l'état avant des critères touchés pour le tableau L2 § 2.2** → cf. [`11-note-3.md`](./11-note-3.md) § 2.2 « Avant » : Versioning ✗, Exemples ✗, Status codes ~, Required ~, Erreurs structurées ~.
- ☑ **Les points restants sont listés pour l'interséance** → tableau ci-dessus, **tous traités** au moment de la livraison Note 3.

---

**Document de référence :** [`11-note-3.md`](./11-note-3.md) — sections § 2.1 (réponse à l'audit) et § 2.2 (scoring avant/après).
**Documents associés :** [`12-quality-gate.md`](./12-quality-gate.md) (livrable § 2.3) · [`audit/audits-recus/rapport_audit_groupe1.docx`](./audit/audits-recus/) (audit reçu) · [`audit/nos-audits/rapport-audit-produit.md`](./audit/nos-audits/rapport-audit-produit.md) (audit que nous avons produit pour un autre groupe).

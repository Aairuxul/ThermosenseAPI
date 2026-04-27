# 5. Threat Model et Menaces

## 1. Data Flow Diagram (DFD)

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  Mobile App (opérateurs)  │  Web Console (admins)           │
│  IoT Devices (M2M auth)   │                                 │
└─────────┬─────────────────────────────┬─────────────────────┘
          │                             │
          │ HTTP/HTTPS                  │ HTTPS
          │ Authorization: Bearer JWT   │ (Token in header)
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│              API LAYER (ThermosenseAPI)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Middleware Layer                                    │   │
│  │ - Authentication (JWT verification)                │   │
│  │ - Authorization (role, zone, resource checks)      │   │
│  │ - Input Validation                                 │   │
│  │ - Rate Limiting                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│              ▼                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Route Handlers (Business Logic)                     │   │
│  │ - GET /sensors/{id}/measurements                   │   │
│  │ - PUT /actuators/{id}                              │   │
│  │ - PUT /alert-thresholds/{id}                       │   │
│  │ - POST, DELETE endpoints                           │   │
│  └─────────────────────────────────────────────────────┘   │
│              ▼                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Data Access Layer (ORM/Query builder)               │   │
│  │ - Prepared statements (prevent SQL injection)       │   │
│  │ - Query validation                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │
          │ SQL Queries
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              DATABASE LAYER                                 │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL/MySQL with encryption at rest                   │
│  - buildings, zones, sensors, actuators, measurements       │
│  - alert_thresholds, users, audit_logs                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Endpoints sélectionnés pour analyse

### Tableau de sélection

| # | Endpoint | Méthode | Données manipulées | Raison de la sélection |
|---|----------|---------|-------------------|------------------------|
| 1 | `/sensors/{sensorId}/measurements` | GET | Toutes les mesures d'un capteur | **Volumétrie** : Beaucoup de données = surcharge réseau/DB |
| 2 | `/actuators/{actuatorId}` | PUT | État d'un actionneur | **Critique** : Permet d'activer/désactiver dispositifs physiques |
| 3 | `/alert-thresholds/{thresholdId}` | PUT | Seuils d'alerte configurables | **Sensible** : Modification peut désactiver alertes de sécurité |

### Justifications

#### 1️⃣ GET `/sensors/{sensorId}/measurements`
- **Volumétrie élevée** → sans pagination : 1M de mesures demandées = crash possible
- **Fuite de données** → exposer tous les relevés sans filtrer par zone/permissions
- **Performance** → impact direct sur latence API si pas d'index/cache

#### 2️⃣ PUT `/actuators/{actuatorId}`
- **Sécurité physique** → contrôle direct d'équipements IoT (climatisation, serrures, etc.)
- **Accès compromis** → n'importe qui peut arrêter la ventilation ou ouvrir des portes
- **Absence de contrôle** → risque BOLA (opérateur modifie actionneur d'une autre zone)

#### 3️⃣ PUT `/alert-thresholds/{thresholdId}`
- **Déni de service** → augmenter seuils = alertes jamais déclenchées
- **Manipulation métier** → alertes sont le seul filet de sécurité (ex: temp dangereuse)
- **Accès compromis** → insider ou attaquant modifie seuils pour opérations discrètes

---

## 3. Tableau des menaces

### Colonnes
- **#** : Numéro de la menace
- **Endpoint** : Cible de la menace
- **Menace identifiée** : Description
- **Catégorie OWASP API Top 10** : Classification (2019 ou 2025)
- **Vraisemblance (F/M/É)** : Faible / Moyen / Élevé
- **Impact (F/M/É)** : Faible / Moyen / Élevé
- **Risque résultant (F/M/É/C)** : Faible / Moyen / Élevé / **Critique**
- **Contremesure proposée** : Solution recommandée
- **Compromis identifié** : Trade-off accepté

---

### Matrice détaillée

| # | Endpoint | Menace identifiée | Catégorie OWASP | Vraisemblance | Impact | Risque | Contremesure | Compromis |
|---|----------|-------------------|-----------------|----------------|--------|---------|--------------|-----------|
| **1** | GET `/sensors/{id}/measurements` | **Trop d'éléments dans réponse** (fuite données inutile + surcharge) | API3 (2019) Excessive Data Exposure | **M** | **É** | **C** | Vérifier les données retournées (filtrage, projection) + implémenter pagination | Utilisateur doit faire plusieurs requêtes pour récup toutes les données |
| **1bis** | GET `/sensors/{id}/measurements` | **Volumétrie : beaucoup de valeurs en BDD** | API3 (2023) Excessive Data Exposure | **É** | **É** | **C** | Ajouter pagination (obligatoire) + limiter `limit` max à 1000 | Compromis UX : doit gérer pagination côté client |
| **2** | Tous endpoints | **Broken Access Control** | **A01:2025** (Top 1) | **É** | **É** | **C** | ✅ Bloquer accès par défaut ✅ Créer rôles (admin, operator, reader, device) ✅ Vérifier rôle + zone + ressource | Complexité back-end augmente, légère latence due vérifications |
| **3** | PUT `/alert-thresholds/{id}` | **BOLA : user non-autorisé modifie seuil en manipulant ID URL** | API5 (BFLA) | **É** | **É** | **C** | Contrôle autorisation back : vérifier user a bon rôle + possède droit sur ressource cible | Augmente complexité back-end, légère latence vérifications |
| **3bis** | PUT `/alert-thresholds/{id}` | **Modification avec valeurs invalides ou extrêmes** | API3 | **M** | **É** | **É** | Validation stricte back : types, limites métier, règles d'alerte | Peut limiter flexibilité pour cas d'usage edge |
| **4** | Tous endpoints | **Security Misconfiguration** | **A02:2025** | **M** | **É** | **É** | Fermer ports inutilisés, pas de comptes default, bonne gestion erreurs, HTTPS enforced | Configuration initiale complexe |
| **5** | PUT `/actuators/{id}`, PUT `/alert-thresholds/{id}` | **Injection** (SQL, NoSQL, Command) | **A05:2025** | **M** | **É** | **C** | Contrôler arrivée données : vérifier format, types, pas de caractères dangereux (utiliser ORM + prepared statements) | Logique validation supplémentaire |

---

## Synthèse des menaces par sévérité

### 🔴 CRITIQUE (Risque C)

| Menace | Endpoint | Raison | Contremesure |
|--------|----------|--------|--------------|
| **Broken Access Control** | Tous | Permet accès non-autorisé aux ressources sensibles | RBAC + BOLA checks sur chaque endpoint |
| **Excessive Data Exposure** | GET measurements | Retourner 1M rows = crash, données exposées | **Pagination obligatoire** + filtrage |
| **Injection** | PUT actuators, PUT thresholds | Accès à BD compromise si réussi | Validation stricte + ORM prepared statements |
| **BOLA (Alert Thresholds)** | PUT alert-thresholds | Opérateur modifie seuils autres zones | Vérifier zone/propriété ressource |

### 🟠 ÉLEVÉ (Risque É)

| Menace | Endpoint | Raison | Contremesure |
|--------|----------|--------|--------------|
| **Modification valeurs extrêmes** | PUT alert-thresholds | Seuils invalides = alertes dys fonctionnelles | Validation métier (min, max, types) |
| **Security Misconfiguration** | Tous | Comptes default, ports ouverts, erreurs verboses | Hardening, HTTPS, gestion erreurs |

---

## 4. Carte des risques

```
                    IMPACT
                      ▲
                      │
        CRITIQUE       │      CRITIQUE
        (Patch asap)   │      (Architecture)
                      │
                  ┌───┼───┬───┐
                  │   │   │   │
    Vraisem. É   │ 1 │ 2 │ 4 │  ← Broken Access Control
                  │ 3 │ 5 │   │     Injection
                  │───┼───┼───│     Excessive Data Exposure
                  │   │   │   │
    Vraisem. M   │   │   │   │  ← Security Misc
                  │───┼───┴───│
                  │   │       │
    Vraisem. F   │   │       │
                  └───┴───────┘
                  Faible Moyen Élevé
```

---

## 5. Stratégies de mitigation par catégorie

### A01:2025 — Broken Access Control

**Symptômes** : User X accède à ressource User Y

**Contremesures appliquées** :
```javascript
// 1. RBAC : Bloquer par rôle
requireRoles(['admin', 'operator'])(req, res, next);

// 2. BOLA : Bloquer par appartenance ressource
const actuator = await Actuator.findById(id);
if (actuator.zone_id !== req.user.zone_id) {
  return res.status(403).json({ error: 'Forbidden' });
}

// 3. BFLA : Bloquer par verbe API
// Opérateur ne peut pas DELETE
requireAction('update')(req, res, next);
```

### API3 (2023) — Excessive Data Exposure

**Symptômes** : API retourne toutes les colonnes, 1M rows sans paginer

**Contremesures appliquées** :
```javascript
// 1. Pagination obligatoire
const limit = Math.min(req.query.limit || 50, 1000);
const page = req.query.page || 1;

// 2. Projection (champs sélectionnés)
const fields = ['id', 'timestamp', 'value', 'unit'];
const data = rows.map(r => pick(r, fields));

// 3. Filtrage par rôle
if (req.user.role === 'reader') {
  // Reader ne voit que certains champs sensibles masqués
}
```

### A05:2025 — Injection

**Symptômes** : `value: "1' OR '1'='1"` → SQL injection

**Contremesures appliquées** :
```javascript
// 1. Validation stricte d'entrée
const schema = Joi.object({
  value: Joi.number().min(-50).max(100).required(),
  unit: Joi.string().valid('°C', '°F', '%').required()
});
const { error, value } = schema.validate(req.body);

// 2. ORM + prepared statements (automatique)
await AlertThreshold.update({ value: req.body.value });

// 3. Pas de concaténation de strings
// ❌ MAUVAIS : `SELECT * FROM sensors WHERE name='${req.query.name}'`
// ✅ BON : db.query('SELECT * FROM sensors WHERE name = ?', [name])
```

---

## 6. Hypothèses de renforcement

### H1 : Contrôles d'accès doivent être renforcés
- ✅ Implémenter RBAC (4 rôles)
- ✅ Implémenter BOLA (zone, ressource ownership)
- ✅ Vérifier sur CHAQUE endpoint (pas de confiance au middleware seul)

### H2 : Données reçues doivent être validées
- ✅ Schéma de validation (Joi, Yup, etc.)
- ✅ Types strictes (number vs string)
- ✅ Limites métier (seuil alerte max 100)
- ✅ Formats (UUID, email, ISO dates)

### H3 : Rôles doivent être définis et respectés
- ✅ Admin : accès total
- ✅ Operator : accès zone + actions contrôle
- ✅ Reader : accès lecture seule
- ✅ Device : accès à propre ressource (M2M)

---

## Prochaines étapes

👉 [Risques Prioritaires](06-risques-prioritaires.md) - Top 3 risques + actions

👈 [Scénarios Critiques](04-scenarios-critiques.md) | [Retour au README](README.md)


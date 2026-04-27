# 6. Risques Prioritaires - Priorisation et Contre-mesures

## Synthèse exécutive

| Rang | Risque | Endpoint(s) | Sévérité | Action |
|------|--------|------------|----------|--------|
| **#1** | Injection SQL | PUT `/actuators/{id}`, PUT `/alert-thresholds/{id}` | 🔴 **CRITIQUE** | Valider input, utiliser ORM + prepared statements |
| **#2** | Broken Access Control | GET `/sensors/{id}/measurements` | 🔴 **CRITIQUE** | Implémenter RBAC + BOLA, bloquer par défaut |
| **#3** | Excessive Data Exposure | GET `/sensors/{id}/measurements` | 🔴 **CRITIQUE** | Pagination obligatoire, limiter `limit` ≤ 1000 |

---

## Risque Prioritaire #1 : Injection SQL

### 📋 Détails

| Élément | Réponse |
|--------|--------|
| **Menace** | Injection SQL (voir [Tableau des menaces](05-threat-model.md#3-tableau-des-menaces)) |
| **Endpoint concerné** | `PUT /actuators/{actuatorId}` ou `PUT /alert-thresholds/{thresholdId}` |
| **Vraisemblance** | **Moyen** (attaquant doit connaître schéma DB) |
| **Impact** | **Critique** → Accès complet à la BD, exfiltration de données, corruption |
| **Risque résultant** | **CRITIQUE** |

### 🎯 Pourquoi ce risque est prioritaire

Si une injection réussit :
- 🚨 L'attaquant gagne l'accès **potentiel à TOUTE la base de données**
- 📊 Peut lire, modifier, ou supprimer des données sensibles (credentials, measurements, configurations)
- 💥 **Compromission complète** de la plateforme
- 🏚️ Perte de confiance client sur l'intégrité des données

### ❗ Conséquence métier si exploité

- Accès compromis aux données
- Mesures de capteurs falsifiées → fausses alertes ou alertes manquées
- Configurations d'actuateurs modifiées → équipements IoT mal commandés
- Seuils d'alerte désactivés → incapacité à détecter anomalies

### ✅ Contre-mesure retenue

#### 1. **Valider l'arrivée des données**
```javascript
const schema = Joi.object({
  value: Joi.number().min(0).max(100).required(),
  unit: Joi.string().valid('°C', '°F', 'percent').required(),
  description: Joi.string().max(255).trim()
});

const { error, value } = schema.validate(req.body);
if (error) {
  return res.status(400).json({ error: error.details });
}
```

#### 2. **Utiliser ORM + Prepared Statements**
```javascript
// ✅ BON : ORM (Sequelize, TypeORM, etc.)
await AlertThreshold.update(
  { value: req.body.value },
  { where: { id: req.params.id } }
);

// ✅ BON : Prepared statements (si SQL brut)
await db.query(
  'UPDATE alert_thresholds SET value = ? WHERE id = ?',
  [req.body.value, req.params.id]
);

// ❌ MAUVAIS : Concaténation directe
const sql = `UPDATE alert_thresholds SET value = '${req.body.value}' WHERE id = ${req.params.id}`;
await db.query(sql); // DANGER !
```

#### 3. **Whitelist de valeurs pour énums**
```javascript
const VALID_UNITS = ['°C', '°F', '%', 'Pa', 'pH'];

if (!VALID_UNITS.includes(req.body.unit)) {
  return res.status(400).json({
    error: `Unit must be one of: ${VALID_UNITS.join(', ')}`
  });
}
```

#### 4. **Sanitizer/Escape pour strings**
```javascript
const sanitize = (str) => str.replace(/[<>'"]/g, '');

const description = sanitize(req.body.description);
```

### 💡 Compromis accepté

Rajouter de la logique de **contrôle des données** → latence supplémentaire (milliseconds) pour chaque requête.
- **Impact** : Négligeable (validation rapide vs. risque critique)
- **Worth it** : OUI, 100% recommandé

### 🔧 Plan d'implémentation

1. **Semaine 1** : Ajouter schémas Joi sur tous les endpoints `PUT` et `POST`
2. **Semaine 2** : Auditer code existant pour concaténations SQL (ripgrep)
3. **Semaine 3** : Tester avec OWASP ZAP ou Burp Suite (injection payloads)
4. **Semaine 4** : Documenter liste des vérifications pour reviews futures

---

## Risque Prioritaire #2 : Broken Access Control

### 📋 Détails

| Élément | Réponse |
|--------|--------|
| **Menace** | Broken Access Control (OWASP A01:2025) |
| **Endpoint concerné** | `GET /sensors/{sensorId}/measurements` |
| **Vraisemblance** | **Élevée** (code pas d'auth = comportement par défaut) |
| **Impact** | **Critique** → N'importe qui lit données sensibles |
| **Risque résultant** | **CRITIQUE** |

### 🎯 Pourquoi ce risque est prioritaire

- 🔓 **N'importe qui** peut avoir accès à des informations qu'il n'a pas le droit de voir
- 📊 Opérateur zone A lit mesures zone B (confidentialité violée)
- 🕵️ Attaquant externe scrape toutes les mesures (exfiltration)
- 📈 Données temporelles (pattern) peuvent révéler secrets métier (quand heating activé = "when occupied")

### ❗ Conséquence métier si exploité

- Récupération d'informations sensibles
- Potentiel de compromettre la base de données
- Violation RGPD (données personnelles de capteurs/zones)
- Perte de confiance client

### ✅ Contre-mesure retenue

#### 1. **Bloquer les accès par défaut (Deny by default)**
```javascript
// Middleware global : aucun accès sans auth
app.use('/api', authenticate);  // Aucun endpoint accessible sans JWT

// Route : aucun accès sans rôle correct
router.get(
  '/sensors/:id/measurements',
  authenticate,
  requireRoles(['admin', 'operator', 'reader']),  // ← Bloquer device/anonymous
  getSmeasurements
);
```

#### 2. **Implémenter RBAC (4 rôles)**
```javascript
const roles = {
  admin: {
    scopes: ['*'],  // Accès total
  },
  operator: {
    scopes: ['sensors:read', 'sensors:update', 'actuators:read', 'actuators:update'],
    zone: true,  // Limité à sa zone
  },
  reader: {
    scopes: ['sensors:read', 'measurements:read'],  // Lecture seule
    zone: true,
  },
  device: {
    scopes: ['measurements:create', 'status:read'],  // Propre ressource
    resource: true,  // Limité à son resource_id
  },
};
```

#### 3. **Vérifier le rôle sur chaque endpoint**
```javascript
router.get(
  '/sensors/:id/measurements',
  authenticate,
  async (req, res, next) => {
    // RBAC : User a-t-il rôle autorisé ?
    if (!['admin', 'operator', 'reader'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // BOLA : Si opérateur/reader, vérifier zone
    if (req.user.role === 'operator' || req.user.role === 'reader') {
      const sensor = await Sensor.findById(req.params.id);
      if (sensor.zone_id !== req.user.zone_id) {
        return res.status(404).json({ error: 'Not found' });  // 404 masque existence
      }
    }
    
    // ✅ Accès autorisé
    next();
  },
  getMeasurements
);
```

#### 4. **Créer des rôles pour gérer modifications base**
```sql
-- Base de données
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  role ENUM('admin', 'operator', 'reader', 'device'),
  zone_id UUID REFERENCES zones(id),
  created_at TIMESTAMP
);

-- Chaque user a un rôle
-- Chaque rôle a des scopes
-- Chaque endpoint vérifie le scope
```

#### 5. **Utiliser une Gateway (optionnel)**
```
Client → API Gateway (authentification)
         ↓
         ↓ (JWT middleware)
         ↓
      ThermosenseAPI (second level: authorization)
```

### 💡 Compromis accepté

- Complexité back-end **augmente** : middleware + middleware par route + logique dans handler
- Légère **latence** due aux vérifications (JWT decode, DB zone lookup)
- **Worth it** : OUI, 100% recommandé (sécurité > performance ici)

### 🔧 Plan d'implémentation

1. **Semaine 1** : Définir 4 rôles + 10 scopes standards
2. **Semaine 2** : Créer middleware `authenticate` + `requireRoles`
3. **Semaine 3** : Appliquer sur tous les endpoints (audit code existant)
4. **Semaine 4** : Tester avec [Burp Suite](https://portswigger.net/burp) / OWASP ZAP
5. **Semaine 5** : Documenter matrice permissions pour review

---

## Risque Prioritaire #3 : Excessive Data Exposure + Volumétrie

### 📋 Détails

| Élément | Réponse |
|--------|--------|
| **Menace** | Excessive Data Exposure (API3:2023) + Volumétrie |
| **Endpoint concerné** | `GET /sensors/{sensorId}/measurements` |
| **Vraisemblance** | **Élevée** (pas de limite = comportement par défaut) |
| **Impact** | **Critique** → Système lent/indisponible + données exposées |
| **Risque résultant** | **CRITIQUE** |

### 🎯 Pourquoi ce risque est prioritaire

- 📊 GET measurements peut retourner **1 million de lignes** en une requête (DB crash)
- 🚨 **Denial of Service** : client demande tout l'historique → serveur overload
- 📡 **Bande passante** gaspillée (JSON 1GB = impossible sur 4G)
- 🔓 **Données exposées** : toutes les mesures (y compris privées) retournées sans filtrage

### ❗ Conséquence métier si exploité

- Le système devient **lent ou indisponible** si trop de données demandées simultanément
- Tous les utilisateurs affectés (opérateurs ne peuvent plus consulter app mobile)
- Support flood : "API est down"
- Données sensibles exposées publiquement

### ✅ Contre-mesure retenue

#### 1. **Ajouter pagination obligatoire**
```javascript
router.get('/sensors/:id/measurements', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 50;
  
  // Limiter max à 1000
  limit = Math.min(limit, 1000);
  
  const offset = (page - 1) * limit;
  
  const { rows, count } = await Measurement.findAndCountAll({
    where: { sensorId: req.params.id },
    limit,
    offset,
    order: [['timestamp', 'DESC']],
  });
  
  return res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
    },
    links: {
      next: page < Math.ceil(count / limit) ? `/sensors/${id}/measurements?page=${page + 1}` : null,
      prev: page > 1 ? `/sensors/${id}/measurements?page=${page - 1}` : null,
    },
  });
});
```

#### 2. **Limiter le nombre de résultats par requête**
```javascript
// Dur limites
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 50;

// Vérification
if (req.query.limit > MAX_LIMIT) {
  return res.status(400).json({
    error: `limit must be ≤ ${MAX_LIMIT} (received: ${req.query.limit})`
  });
}
```

#### 3. **Ajouter des filtres optionnels**
```javascript
router.get('/sensors/:id/measurements', async (req, res) => {
  const query = { sensorId: req.params.id };
  
  // Filtrer par date (narrower dataset)
  if (req.query.since) {
    query.timestamp = { $gte: new Date(req.query.since) };
  }
  
  if (req.query.until) {
    query.timestamp = { ...query.timestamp, $lte: new Date(req.query.until) };
  }
  
  // Filtrer par valeur (anomalies)
  if (req.query.min_value && req.query.max_value) {
    query.value = {
      $gte: req.query.min_value,
      $lte: req.query.max_value,
    };
  }
  
  // Puis appliquer pagination sur résultats filtrés
});
```

#### 4. **Projeter seulement les champs nécessaires**
```javascript
// ✅ BON : retourner seulement colonnes utiles
const rows = await Measurement.findAll({
  attributes: ['id', 'timestamp', 'value', 'unit'],  // Pas de columns internes
  // ...
});

// ❌ MAUVAIS : retourner tout y compris champs internes
const rows = await Measurement.findAll();  // Include password, internal_id, etc.
```

### 💡 Compromis accepté

- **UX** : L'utilisateur doit effectuer **plusieurs requêtes** pour récupérer toutes les données
- **Trade-off** : Meilleure UX sur mobile (pages plus rapides) vs. perte de vue "tout d'un coup"
- **Worth it** : OUI, 100% recommandé (mobile > desktop en 2026)

### 🔧 Plan d'implémentation

1. **Jour 1** : Ajouter `page`, `limit` query params avec limites
2. **Jour 2** : Implémenter filtres optionnels (since, until, min_value, max_value)
3. **Jour 3** : Tester avec load test (Apache JMeter : 1000 requêtes /s)
4. **Jour 4** : Ajouter cache Redis (optionnel, pour dernières heures)
5. **Jour 5** : Documenter pagination format en OpenAPI/Postman

---

## Synthèse : Action Items

### 🎯 Court terme (2 semaines)

- [ ] **Risque #1** : Ajouter validation Joi sur PUT endpoints
- [ ] **Risque #2** : Créer middleware RBAC + requireRoles
- [ ] **Risque #3** : Implémenter pagination GET measurements

### 📊 Moyen terme (4 semaines)

- [ ] Tester avec outils security (OWASP ZAP, Burp Suite)
- [ ] Audit code complet pour SQL injection patterns
- [ ] Documenter matrice permissions complète
- [ ] Auditer BOLA : chaque endpoint vérifie zone/resource

### 🔒 Long terme (8 semaines+)

- [ ] Implémenter rate limiting global
- [ ] Ajouter WAF (Web Application Firewall)
- [ ] Certifier API avec OWASP Top 10 checklist
- [ ] Pen testing par équipe security externe

---

## Prochaines étapes

👉 [Évaluation et Hypothèses](07-evaluation.md) - Bilan et hypothèses restantes

👈 [Threat Model](05-threat-model.md) | [Retour au README](README.md)


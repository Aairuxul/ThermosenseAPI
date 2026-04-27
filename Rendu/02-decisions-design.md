# 2. Décisions de Design (5 justifications)

## Décision 1 : URLs simples et concises

### ✅ Choix retenu
Privilégier la lisibilité et la brièveté des URLs au détriment de très longues descriptions en path.

### 🎯 Justification
- **Lisibilité** : URLs courtes = moins d'erreurs de saisie, plus facile à mémoriser
- **Performance** : URLs courtes = moins de bande passante (trivial mais vrai)
- **Maintenabilité** : Plus facile à documenter, à communiquer verbalement
- **Convention RESTful** : Aligne sur les bonnes pratiques (noms au pluriel, pas de verbes)

### 📌 Exemple
```
✅ GET  /sensors/123/measurements
❌ GET  /sensor-temperature-zone-3/all-historical-measurements-since-2026
```

### 💡 Compromis
Dépendre davantage des **query parameters** et des **headers** pour les détails (filtres, pagination).

---

## Décision 2 : Séparation buildings/zones

### ✅ Choix retenu
Traiter **`/buildings`** et **`/zones`** comme ressources indépendantes, chacune accessible directement.

### 🎯 Justification
- **Flexibilité requêtes** : Opérateur peut faire `GET /zones/42` sans connaître le building parent
- **Scalabilité** : Si un opérateur gère plusieurs zones de plusieurs bâtiments, pas de requêtes imbriquées inutiles
- **Expérience UX** : Moins de round-trips API, interface mobile plus réactive
- **Modèle métier** : Zone est l'entité principale de travail pour les opérateurs (pas le building)

### 📌 Exemple
```
✅ GET /zones/42                           # Accès direct
✅ GET /buildings/1/zones                  # Via hiérarchie
✅ GET /zones?building_id=1&zone_type=climate  # Filtrer les zones

❌ GET /buildings/1/zones/42               # Obligé de connaître parent
```

### 💡 Compromis
Dépendre des **étiquettes/tags** ou **foreign keys** pour maintenir la cohérence (une zone appartient bien à un building).

---

## Décision 3 : Seuils d'alerte comme sous-ressource de zone

### ✅ Choix retenu
Structurer les seuils sous `/zones/{zoneId}/alert-thresholds` et non au niveau global.

### 🎯 Justification
- **Sémantique** : Alert threshold est toujours lié à une zone spécifique (pas globaux)
- **Rapidité opérationnelle** : Admin/opérateur identifie immédiatement les seuils de sa zone
- **Droits d'accès** : Aligne les permissions : accès zone → accès seuils zone
- **Isolation** : Évite une surcharge de `/alert-thresholds` global si beaucoup de zones
- **Requête métier** : "Quels sont les seuils de la zone 3 ?" → direct `GET /zones/3/alert-thresholds`

### 📌 Exemple
```
✅ GET    /zones/42/alert-thresholds          # Lister les seuils de zone 42
✅ POST   /zones/42/alert-thresholds          # Créer un seuil dans zone 42
✅ PUT    /zones/42/alert-thresholds/99       # Modifier un seuil
✅ DELETE /zones/42/alert-thresholds/99       # Supprimer un seuil

❌ GET    /alert-thresholds?zone=42           # Moins intuitif
```

### 💡 Compromis
Impossible de lister tous les seuils globalement sans paginer les zones. Solution : endpoint dédié `/alert-thresholds` en plus si besoin admin.

---

## Décision 4 : Query parameters pour pagination et filtres

### ✅ Choix retenu
Réserver **query parameters** (?) pour pagination, tri et filtres. **Pas de modifications** en query string.

### 🎯 Justification
- **Convention HTTP** : Aligné RFC 7231 (query string = lecture, path/body = modifications)
- **Performance requêtes** : Pagination côté serveur = gestion DB native
- **Caching** : Query params = facilement cacheable par proxy/CDN
- **Flexibilité filtres** : Ajouter des filtres sans changer la structure de l'API
- **Sécurité** : Pas de payload en GET = moins de surface d'attaque

### 📌 Exemple
```
✅ GET    /sensors/10/measurements?page=1&limit=100&sort=-timestamp
✅ GET    /zones?building_id=1&type=climate&sort=name
✅ GET    /actuators?status=active&min_power=50

❌ POST   /zones/42/sensors?create=true       # Créer en query string
❌ PUT    /sensors/10?temperature=25          # Modifier en query string
```

### 📋 Paramètres standards
| Paramètre | Usage | Exemple |
|-----------|-------|---------|
| `page` | Numéro de page | `?page=2` |
| `limit` | Résultats par page | `?limit=50` |
| `sort` | Tri (+ = asc, - = desc) | `?sort=-timestamp` |
| `filter` | Filtres génériques | `?type=temperature&min=15&max=25` |
| `include` | Inclure ressources liées | `?include=zone,alerts` |

### 💡 Compromis
Limiter les filtres disponibles = pas de requêtes arbitrairement complexes (mais mieux pour la performance).

---

## Décision 5 : Token utilisateur en header Authorization

### ✅ Choix retenu
Transmettre systématiquement le **JWT** en header `Authorization: Bearer <token>` pour identifier permissions d'accès.

### 🎯 Justification
- **Sécurité** : Pas exposer le token en URL (logs, historique browser, proxies)
- **Standard HTTP** : Aligné RFC 6750 (Bearer tokens)
- **Statefree** : Pas de session côté serveur (scalabilité horizontale)
- **Granularité permissions** : Token encode user, role, zone, scope → vérifications rapides
- **Révocation** : Blacklist de tokens = plus efficace qu'invalidation par URL
- **Audit** : Header facile à logger/monitorer

### 📌 Exemple
```http
GET /sensors/10/measurements HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 📝 Payload JWT
```json
{
  "sub": "user-123",
  "name": "Alice",
  "role": "operator",
  "zone": "zone-42",
  "scopes": ["sensors:read", "measurements:read"],
  "iat": 1704067200,
  "exp": 1704153600
}
```

### 💡 Compromis
- Dépendre d'une **PKI/secret store** pour signer tokens
- Gérer les **refresh tokens** (expiration)
- Implémenter **revocation** (blacklist ou token issuer state)

---

## Synthèse des décisions

| Décision | Bénéfice principal | Compromis accepté |
|----------|-------------------|------------------|
| URLs simples | Lisibilité, convention RESTful | Query params + headers pour détails |
| Zones indépendantes | Flexibilité opérateur, UX mobile | Maintenir cohérence FK |
| Seuils sous zones | Aligne permissions, sémantique | Admin global moins direct |
| Query params pagination | Standard HTTP, caching, performance | Filtres limités |
| JWT en Authorization | Sécurité, scalabilité, audit | PKI + gestion tokens |

---

## Impact sur l'implémentation

### Backend
```javascript
// Middleware d'authentification
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = verifyJWT(token);
  req.user = user;
  next();
});

// Pagination
app.get('/sensors/:id/measurements', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const sort = req.query.sort || '-timestamp';
  // ...
});
```

### Frontend
```javascript
// Requête avec auth
const response = await fetch('/sensors/10/measurements?page=1&limit=100', {
  headers: {
    'Authorization': `Bearer ${getToken()}`,
  }
});
```

---

## Prochaines étapes

👉 [Matrice des Contraintes](03-matrice-contraintes.md) - Analyse des contraintes par endpoint

👈 [Architecture et Ressources](01-architecture-ressources.md) | [Retour au README](README.md)


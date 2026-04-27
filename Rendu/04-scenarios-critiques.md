# 4. Scénarios Critiques

## Scénario A : Commande dupliquée (réseau instable)

### 🎯 Contexte
L'opérateur appuie sur **"Activer la ventilation zone 3"** depuis l'app mobile. Le réseau est instable → la requête **part deux fois**.

### 🔐 Prérequis
1. Le **client mobile** génère un UUID unique (`Idempotency-Key`) avant chaque opération critique
2. Ce même UUID est envoyé dans les **2 requêtes** (client retry automatique)
3. Le **serveur stocke** les clés idempotency + réponses associées (cache court terme : 24h)

---

## Séquence HTTP

### Requête 1 (arrive en premier)

```http
POST /actuators/42/commands HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
Idempotency-Key: 8a7f-2c3e-41b9-9e52-7d6a5f1c8b3a

{
  "action": "activate",
  "parameter": "fan",
  "zone_id": 3
}
```

### Réponse 1

```http
HTTP/1.1 201 Created
Location: /actuators/42/commands/cmd-789
Content-Type: application/json

{
  "id": "cmd-789",
  "actuatorId": 42,
  "action": "activate",
  "parameter": "fan",
  "status": "executed",
  "timestamp": "2026-04-27T09:30:00Z"
}
```

**✅ Résultat** : Actionneur activé ✅  
**💾 Serveur** : Stocke `(Idempotency-Key: 8a7f..., Réponse: 201)`

---

### Requête 2 (doublon, arrive 2-3 secondes après)

**Identique à Requête 1** (même `Idempotency-Key`)

```http
POST /actuators/42/commands HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
Idempotency-Key: 8a7f-2c3e-41b9-9e52-7d6a5f1c8b3a

{
  "action": "activate",
  "parameter": "fan",
  "zone_id": 3
}
```

### Réponse 2

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
Location: /actuators/42/commands/cmd-789

{
  "error": {
    "code": "DUPLICATE_REQUEST",
    "message": "This request was already processed",
    "originalResponse": {
      "id": "cmd-789",
      "status": "executed"
    }
  }
}
```

**✅ Résultat** : Actionneur **NOT activé une seconde fois** 🚫  
**📍 Location** : Client peut suivre le lien vers la commande originale pour vérifier le statut

---

## Implémentation côté serveur

### Structure de cache idempotency

```javascript
// Cache en-mémoire (ou Redis pour distribution)
const idempotencyCache = new Map();

// Clé = Idempotency-Key, Valeur = { status, response, timestamp }
// Format: "user-123:8a7f-2c3e-41b9-9e52-7d6a5f1c8b3a"
```

### Middleware de déduplication

```javascript
app.post('/actuators/:id/commands', 
  authenticate,
  idempotencyMiddleware,
  async (req, res) => {
    const key = `${req.user.sub}:${req.headers['idempotency-key']}`;
    
    // Vérifier le cache
    if (idempotencyCache.has(key)) {
      const cached = idempotencyCache.get(key);
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_REQUEST',
          message: 'This request was already processed',
          originalResponse: cached.response
        }
      });
    }
    
    // Exécuter la commande
    const command = await executeActuatorCommand(req.body);
    
    // Stocker en cache (expire dans 24h)
    idempotencyCache.set(key, {
      status: 201,
      response: command,
      timestamp: Date.now() + 86400000 // 24h
    });
    
    res.status(201)
      .location(`/actuators/${id}/commands/${command.id}`)
      .json(command);
  }
);
```

---

## Alternative : 200 OK au lieu de 409

Certaines implémentations préfèrent :

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "cmd-789",
  "status": "executed",
  "note": "Duplicate request, original command returned"
}
```

### Comparaison

| Approche | Avantage | Inconvénient |
|----------|----------|-------------|
| **409 Conflict** | ✅ Explicite : client sait qu'il y a eu duplication | ❌ Peut être perçu comme une erreur par le client |
| **200 OK** | ✅ Plus simple, moins d'erreurs à gérer | ❌ Masque le problème, moins informatif |

**Recommandation** : **409 Conflict** (plus sûr pour l'opérateur mobile)

---

## En cas d'échec réseau total

### Scénario : Aucune réponse reçue

```
Client: POST /actuators/42/commands (Idempotency-Key: 8a7f...)
        ↓
      [TIMEOUT - pas de réponse]
        ↓
Client: Retry avec même Idempotency-Key
```

### Résolution

1. **Si serveur avait traité** → retourner `409 Conflict` + lien vers cmd originale
2. **Si serveur n'avait pas traité** → retourner `201 Created` + nouvelle commande

**✅ Résultat** : Le client est *garanti* de ne déclencher qu'UNE SEULE commande, même avec retries infinis.

---

---

## Scénario B : Conflit d'opérateurs (Alice et Bob)

### 🎯 Contexte
Alice veut mettre le **chauffage zone 5 en puissance 3**.  
Au même moment, Bob veut le mettre en **puissance 1**.  
Le chauffage est actuellement à **puissance 2**.

### 🔐 Prérequis
1. Les deux opérateurs ont préalablement fait `GET /actuators/99`
2. Ils ont reçu le même **ETag** : `"v5"`
3. Ils utilisent **If-Match** pour certifier qu'ils agissent sur la version correcte

---

## Séquence HTTP

### Étape 1 : Alice et Bob lisent l'état

#### Requête Alice

```http
GET /actuators/99 HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_alice>
```

#### Réponse Alice

```http
HTTP/1.1 200 OK
ETag: "v5"
Content-Type: application/json

{
  "id": 99,
  "name": "Chauffage zone 5",
  "power": 2,
  "status": "on"
}
```

#### Requête Bob

```http
GET /actuators/99 HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_bob>
```

#### Réponse Bob

```http
HTTP/1.1 200 OK
ETag: "v5"
Content-Type: application/json

{
  "id": 99,
  "name": "Chauffage zone 5",
  "power": 2,
  "status": "on"
}
```

**✅ Résultat** : Les deux ont `ETag: "v5"`

---

### Étape 2 : Alice envoie sa commande (la première)

```http
POST /actuators/99/commands HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_alice>
Content-Type: application/json
If-Match: "v5"

{
  "action": "set_power",
  "value": 3
}
```

#### Réponse Alice

```http
HTTP/1.1 201 Created
Location: /actuators/99/commands/cmd-alice-1
Content-Type: application/json

{
  "id": "cmd-alice-1",
  "action": "set_power",
  "value": 3,
  "status": "executed"
}
```

**✅ Résultat** :
- Commande d'Alice **acceptée** (ETag correspond)
- Chauffage passe à **puissance 3**
- ETag actuateur devient **`"v6"`** (version incrémentée)

---

### Étape 3 : Bob envoie sa commande (arrive juste après)

```http
POST /actuators/99/commands HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_bob>
Content-Type: application/json
If-Match: "v5"

{
  "action": "set_power",
  "value": 1
}
```

#### Réponse Bob

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "CONFLICT_CONCURRENT_UPDATE",
    "message": "Resource has been modified since you last read it",
    "currentETag": "v6",
    "details": {
      "lastModifiedBy": "alice",
      "lastModifiedAt": "2026-04-27T09:30:05Z",
      "currentValue": 3
    }
  }
}
```

**❌ Résultat** :
- Commande de Bob **rejetée** (ETag `"v5"` != version actuelle `"v6"`)
- **Personne ne "gagne" silencieusement** → Bob est explicitement notifié
- Chauffage reste à **puissance 3** (Alice a "gagné" car elle était première)

---

### Étape 4 : Bob rafraîchit et retente (s'il le souhaite)

```http
GET /actuators/99 HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_bob>
```

#### Réponse

```http
HTTP/1.1 200 OK
ETag: "v6"
Content-Type: application/json

{
  "id": 99,
  "name": "Chauffage zone 5",
  "power": 3,
  "status": "on"
}
```

**✅ Bob voit** : Puissance = 3 (modifiée par Alice)

#### Option 1 : Bob accepte (fait rien)
```
Bob pense : "Alice a baissé la puissance à 3, c'est OK."
```

#### Option 2 : Bob force sa modification
```http
POST /actuators/99/commands HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer <token_bob>
Content-Type: application/json
If-Match: "v6"    ← Nouveau ETag

{
  "action": "set_power",
  "value": 1
}
```

#### Réponse (succès)
```http
HTTP/1.1 201 Created

{
  "id": "cmd-bob-1",
  "action": "set_power",
  "value": 1,
  "status": "executed"
}
```

**✅ Résultat** : Puissance passe à 1 (Bob a réessayé avec le bon ETag)

---

## Résumé du scénario

| Opérateur | Requête | ETag utilisé | Résultat | Pourquoi |
|-----------|---------|-------------|----------|---------|
| **Alice** | `POST` avec puissance 3 | `"v5"` | ✅ **201 Created** | ETag correspond, commande acceptée |
| **Bob** | `POST` avec puissance 1 | `"v5"` | ❌ **409 Conflict** | ETag obsolète, état modifié par Alice |
| **Bob (retry)** | `POST` avec puissance 1 | `"v6"` | ✅ **201 Created** | ETag correspond, commande acceptée |

---

## Implémentation côté serveur

### Middleware If-Match

```javascript
app.post('/actuators/:id/commands',
  authenticate,
  requireIfMatch,  // Middleware
  async (req, res) => {
    const actuator = await Actuator.findById(req.params.id);
    
    // Vérifier If-Match
    if (req.headers['if-match'] !== actuator.etag) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT_CONCURRENT_UPDATE',
          currentETag: actuator.etag
        }
      });
    }
    
    // Exécuter la commande
    const command = await executeCommand(actuator, req.body);
    
    // Incrémenter l'ETag
    actuator.etag = `v${parseInt(actuator.etag.substring(1)) + 1}`;
    await actuator.save();
    
    res.status(201).json(command);
  }
);
```

### Génération ETag

```javascript
// À chaque modification, incrémenter la version
function generateETag(resource) {
  return `"${resource.version}"`;
}

// Ou plus robuste : basé sur hash du contenu
function generateETag(resource) {
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(resource.data))
    .digest('hex');
  return `"${hash.substring(0, 8)}"`;
}
```

---

## Garanties du mécanisme ETag + If-Match

✅ **Pas de changements silencieux** : Chaque modification est tracée  
✅ **Détection de conflit** : 409 immédiat si version obsolète  
✅ **Audit natif** : Historique des versions via ETags  
✅ **Expérience utilisateur** : Opérateur conscient des conflits  
✅ **Scalabilité** : Pas de lock global (optimistic locking)

---

## Prochaines étapes

👉 [Threat Model et Menaces](05-threat-model.md) - Analyse de sécurité

👈 [Matrice des Contraintes](03-matrice-contraintes.md) | [Retour au README](README.md)


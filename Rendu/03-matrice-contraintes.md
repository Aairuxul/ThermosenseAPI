# 3. Matrice des Contraintes

## Les 4 contraintes techniques

| Contrainte | Abréviation | Définition |
|-----------|------------|-----------|
| **Réseau** | C1 | Capacité à gérer les défaillances réseau (timeouts, doublons, déconnexions) |
| **Volumétrie** | C2 | Capacité à traiter des volumes de données importants sans dégrader la performance |
| **Fiabilité** | C3 | Garantie que les données restent intègres et exactes (duplicatas, corruptions) |
| **Concurrence** | C4 | Capacité à gérer les modifications simultanées d'une même ressource |

---

## Matrice GET par endpoint

| Endpoint | C1 (Réseau) | C2 (Volumétrie) | C3 (Fiabilité) | C4 (Concurrence) |
|----------|------------|-----------------|-----------------|-----------------|
| `GET /buildings` | ❌ | ✅ Faible (N bâtiments) | ✅ | ✅ |
| `GET /buildings/{id}` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /buildings/{id}/zones` | ❌ | ✅ Modérée | ✅ | ✅ |
| `GET /zones/{id}` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /zones/{id}/sensors` | ❌ | ✅ Modérée | ✅ | ✅ |
| `GET /sensors/{id}/measurements` | ❌ | ✅✅ **ÉLEVÉE** | ✅ | ✅ Lecture concurrente OK |
| `GET /sensors/{id}` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /zones/{id}/actuators` | ❌ | ✅ Modérée | ✅ | ✅ |
| `GET /actuators/{id}` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /zones/{id}/alert-thresholds` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /alert-thresholds/{id}` | ❌ | ✅ Faible | ✅ | ✅ |
| `GET /zones/{id}/alerts` | ❌ | ✅ Modérée | ✅ | ✅ |

### Observations GET
- ✅ GET : Peu affecté par réseau (idempotent)
- ⚠️ **Measurements** : Risque volumétrie → **Pagination obligatoire**
- ✅ Lecture concurrente : Pas de problème (lock-free)

---

## Matrice POST par endpoint

| Endpoint | C1 (Réseau) | C2 (Volumétrie) | C3 (Fiabilité) | C4 (Concurrence) |
|----------|------------|-----------------|-----------------|-----------------|
| `POST /buildings` | ✅ **Gérer doublons** | ✅ Créer 1 | ✅ Pas de duplicatas | ✅ Gérer doublons / race condition |
| `POST /zones` | ✅ **Gérer doublons** | ✅ Créer 1 | ✅ Pas de duplicatas | ✅ Gérer doublons |
| `POST /sensors` | ✅ **Gérer doublons** | ✅ Créer 1 | ✅ Pas de duplicatas | ✅ Gérer doublons |
| `POST /actuators` | ✅ **Gérer doublons** | ✅ Créer 1 | ✅ Pas de duplicatas | ✅ Gérer doublons |
| `POST /alert-thresholds` | ✅ **Gérer doublons** | ✅ Créer 1 | ✅ Pas de duplicatas | ✅ Gérer doublons |

### Observations POST
- ⚠️ C1 : Réseau instable → requête peut partir 2x (voir [Scénario A](04-scenarios-critiques.md#scénario-a--commande-dupliquée))
- 🔴 C3 : **Duplicatas** = risque de doublons si pas idempotence
- 🔴 C4 : Race condition si 2 requêtes créent une ressource en même temps
- ✅ **Solution** : `Idempotency-Key` header + contrainte unique DB

---

## Matrice PUT par endpoint

| Endpoint | C1 (Réseau) | C2 (Volumétrie) | C3 (Fiabilité) | C4 (Concurrence) |
|----------|------------|-----------------|-----------------|-----------------|
| `PUT /buildings/{id}` | ❌ | ❌ | ❌ | ✅ **ETag + If-Match** |
| `PUT /zones/{id}` | ❌ | ❌ | ❌ | ✅ **ETag + If-Match** |
| `PUT /sensors/{id}` | ❌ | ❌ | ❌ | ✅ **ETag + If-Match** |
| `PUT /actuators/{id}` | ❌ | ❌ | ❌ | ✅ **ETag + If-Match** |
| `PUT /alert-thresholds/{id}` | ❌ | ❌ | ❌ | ✅ **ETag + If-Match** |

### Observations PUT
- ⚠️ C4 : **Modification simultanée** = risque d'overwrite (voir [Scénario B](04-scenarios-critiques.md#scénario-b--conflit-dopérateurs))
- 🔴 **Risque** : Alice modifie, Bob modifie en même temps → une modification perdue silencieusement
- ✅ **Solution** : **ETags** pour détecter les modifications et rejeter avec `409 Conflict`

---

## Matrice DELETE par endpoint

| Endpoint | C1 (Réseau) | C2 (Volumétrie) | C3 (Fiabilité) | C4 (Concurrence) |
|----------|------------|-----------------|-----------------|-----------------|
| `DELETE /buildings/{id}` | ✅ **Si doublon, retour 200 (idempotent)** | ❌ | ✅ **Idempotent** | ✅ **Retour 200 même si déjà supprimé** |
| `DELETE /zones/{id}` | ✅ **Si doublon, retour 200** | ❌ | ✅ **Idempotent** | ✅ **Retour 200 même si déjà supprimé** |
| `DELETE /sensors/{id}` | ✅ **Si doublon, retour 200** | ❌ | ✅ **Idempotent** | ✅ **Retour 200 même si déjà supprimé** |
| `DELETE /actuators/{id}` | ✅ **Si doublon, retour 200** | ❌ | ✅ **Idempotent** | ✅ **Retour 200 même si déjà supprimé** |
| `DELETE /alert-thresholds/{id}` | ✅ **Si doublon, retour 200** | ❌ | ✅ **Idempotent** | ✅ **Retour 200 même si déjà supprimé** |

### Observations DELETE
- ✅ C1 : DELETE idempotent → retourner **200 OK** même si ressource déjà supprimée
- ✅ C3/C4 : Pas de risque de duplication ou overwrite (supprimer 2x = même résultat)
- 🔴 **Attention** : Ne pas retourner **404** si déjà supprimé (confond l'utilisateur)

---

## Codes HTTP et stratégies

### Succès

| Code | Verbe | Signification | Exemple |
|------|-------|--------------|---------|
| **200 OK** | GET, PUT, DELETE | Succès, réponse avec corps | `GET /zones` → 200 + liste |
| **201 Created** | POST | Ressource créée | `POST /zones` → 201 + Location: /zones/42 |
| **204 No Content** | GET, DELETE | Succès, corps vide | `DELETE /zones/42` → 204 |

### Erreurs côté client

| Code | Signification | Cas d'usage |
|------|---------------|-----------|
| **400 Bad Request** | Requête invalide (schéma, types) | `POST /zones` avec `name: null` |
| **404 Not Found** | Ressource non trouvée | `GET /zones/999999` |
| **409 Conflict** | Conflit de concurrence ou doublon | `PUT` avec ETag obsolète, `POST` avec `Idempotency-Key` dupliqué |
| **425 Too Early** | (Optionnel) Doublon en création | Alternative à `409` pour POST doublons |

### Erreurs côté serveur

| Code | Signification |
|------|---------------|
| **500 Internal Server Error** | Erreur interne non prévue |
| **503 Service Unavailable** | Service temporairement indisponible (DB down, overload) |

### Stratégie d'erreur

```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "INVALID_ZONE_NAME",
    "message": "Zone name must be non-empty string",
    "details": {
      "field": "name",
      "expected": "string",
      "received": "null"
    }
  }
}
```

---

## Synthèse des stratégies par verbe

### GET
- ✅ Pas de contrainte réseau (idempotent)
- ⚠️ **Pagination obligatoire** si réponse > 1000 items (C2)
- 🔴 **Filtrer les données exposées** (priv, sécurité)

### POST
- 🔴 **Idempotency-Key** obligatoire (header client)
- 🔴 **Contrainte unique** en DB (email, sensor ID, etc.)
- ✅ Retourner `201 + Location` si succès
- ✅ Retourner `409` si doublon

### PUT
- 🔴 **ETag obligatoire** (client récupère, le renvoie dans If-Match)
- 🔴 **Vérifier If-Match côté serveur**
- ✅ Retourner `200 + ressource modifiée` si succès
- ✅ Retourner `409` si ETag obsolète (concurrent update)

### DELETE
- ✅ **Idempotent par défaut** (retourner 200 même si déjà supprimé)
- ❌ Ne pas utiliser 404 si ressource déjà supprimée (masque debug)
- ✅ Retourner `200` ou `204` si succès

---

## Prochaines étapes

👉 [Scénarios Critiques](04-scenarios-critiques.md) - Cas d'usage complexes (Idempotency-Key, ETag)

👈 [Décisions de Design](02-decisions-design.md) | [Retour au README](README.md)


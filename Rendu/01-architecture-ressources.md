# 1. Architecture et Ressources

## Hiérarchie des ressources

```
Building
├── Zone
│   ├── Sensor
│   │   └── Measurement
│   ├── Actuator
│   └── Alert Threshold
└── User
```

### Description

- **Building** : Bâtiment principal (warehouse, parking, etc.)
- **Zone** : Sous-section d'un bâtiment (zone climatisée, zone parking niveau 1, etc.)
- **Sensor** : Capteur IoT mesurant des données (température, humidité, présence, etc.)
- **Measurement** : Relevé spécifique d'un capteur (horodaté, valeur, qualité)
- **Actuator** : Actionneur contrôlable (ventilation, chauffage, éclairage, etc.)
- **Alert Threshold** : Seuil d'alerte configuré par zone
- **User** : Utilisateur (admin, opérateur, lecteur) accédant à l'API

---

## Endpoints principaux

| Ressource | Endpoints |
|-----------|-----------|
| **Buildings** | `/buildings`, `/buildings/{buildingId}`, `/buildings/{buildingId}/zones` |
| **Zones** | `/zones`, `/zones/{zoneId}`, `/zones/{zoneId}/sensors`, `/zones/{zoneId}/actuators`, `/zones/{zoneId}/alert-thresholds`, `/zones/{zoneId}/alerts` |
| **Sensors** | `/sensors`, `/sensors/{sensorId}`, `/sensors/{sensorId}/measurements` |
| **Actuators** | `/actuators`, `/actuators/{actuatorId}`, `/actuators/{actuatorId}/commands` |
| **Alert Thresholds** | `/alert-thresholds`, `/alert-thresholds/{thresholdId}` |
| **Users** | `/users`, `/users/{userId}` |

---

## Principes de design des URIs

### 1. **Simplicité et concision**
- URLs courtes, lisibles
- Pas de verbes (RESTful)
- Noms au pluriel pour les collections

**Exemples ✅**
```
GET  /zones/42/sensors
POST /sensors
PUT  /actuators/99
```

### 2. **Hiérarchie logique**
- Les ressources enfants reflètent leur hiérarchie
- Facilite le filtrage naturel

**Exemples ✅**
```
GET  /zones/42/sensors              # Capteurs de la zone 42
GET  /sensors/10/measurements       # Mesures du capteur 10
POST /zones/42/alert-thresholds     # Créer seuil dans zone 42
```

### 3. **Séparation buildings/zones**
- `/buildings` et `/zones` sont traitées comme ressources indépendantes
- Permet de requêter directement les zones
- Plus flexible pour les opérateurs

**Endpoints ✅**
```
GET  /zones/42                       # Zone unique
GET  /buildings/1/zones              # Zones d'un bâtiment
POST /zones                          # Créer une zone globalement
```

### 4. **Query parameters pour filtrage et pagination**
- Pagination : `?page=1&limit=50`
- Filtres : `?type=temperature&min=15&max=25`
- Tri : `?sort=-timestamp`

**Exemples ✅**
```
GET /sensors/{sensorId}/measurements?page=1&limit=100&sort=-timestamp
GET /zones?building=1&type=climate
```

### 5. **Token utilisateur en headers**
- Authentification : `Authorization: Bearer <JWT>`
- Permet de tracer les droits d'accès
- Indépendant de l'URL (plus sécurisé)

```
GET /zones/42
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Carte des relations

```mermaid
graph TD
    A[Building] -->|"1..*"| B[Zone]
    B -->|"0..*"| C[Sensor]
    B -->|"0..*"| D[Actuator]
    B -->|"0..*"| E[Alert Threshold]
    C -->|"0..*"| F[Measurement]
    D -->|"0..*"| G[Command]
    E -->|"triggers"| H[Alert]
    A -->|"may contain"| U[User]
    B -->|"may contain"| U
    U -->|"reads/modifies"| C
    U -->|"controls"| D
    U -->|"configures"| E
```

### Explications

- **1 Building** → **N Zones** : Un bâtiment contient plusieurs zones
- **1 Zone** → **N Sensors/Actuators/AlertThresholds** : Une zone regroupe ses appareils
- **1 Sensor** → **N Measurements** : Historique des mesures
- **1 Actuator** → **N Commands** : Historique des commandes
- **1 User** → accès selon rôle et zone
- **Alert Threshold** déclenche des **Alerts** si seuil dépassé

---

## Exemple de requête complète

### Scénario : Récupérer les mesures d'un capteur avec pagination

```http
GET /sensors/sensor-temp-zone3/measurements?page=2&limit=50&sort=-timestamp&min_value=18&max_value=25 HTTP/1.1
Host: api.thermosense.local
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
Accept: application/json
```

### Réponse

```http
HTTP/1.1 200 OK
Content-Type: application/json
Link: <...?page=3>; rel="next", <...?page=1>; rel="prev"

{
  "data": [
    {
      "id": "meas-12345",
      "sensorId": "sensor-temp-zone3",
      "timestamp": "2026-04-27T09:30:00Z",
      "value": 21.5,
      "unit": "°C",
      "quality": "good"
    },
    ...
  ],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 1200,
    "pages": 24
  }
}
```

---

## Prochaines étapes

👉 [Décisions de Design](02-decisions-design.md) - Justification des 5 choix majeurs

👈 [Retour au README](README.md)


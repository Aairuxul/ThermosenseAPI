# Matrice d'autorisations - ThermoSense API

## Contexte

Cette matrice transpose le canevas SmartPark aux endpoints actuellement exposes par ThermoSense.

Principes retenus :
- **Admin** : acces global sur la plateforme.
- **Operateur (sa zone)** : pilote les ressources de sa zone et ne voit pas les autres zones.
- **Operateur (autre zone)** : represente un cas de refus BOLA.
- **Lecteur** : lecture seule sur son perimetre.
- **Device IoT** : identite technique liee a **sa propre ressource** (`resourceType` + `resourceId`), pas simplement a une zone.

## Matrice de votre API

| Endpoint | Verbe | Admin | Operateur (sa zone) | Operateur (autre zone) | Lecteur | Device IoT |
| --- | --- | --- | --- | --- | --- | --- |
| `/areas` | GET | ✅ | ✅ filtree (sa zone) | ❌ | ✅ filtree (sa zone) | ❌ |
| `/areas` | POST | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/sensors/{sensorId}` | GET | ✅ | ✅ si sa zone | ❌ | ✅ si sa zone | ✅ si son sensor |
| `/sensors/{sensorId}/measures` | GET | ✅ | ✅ si sa zone | ❌ | ✅ si sa zone | ✅ si son sensor |
| `/sensors/{sensorId}/measures` | POST | ✅ | ❌ | ❌ | ❌ | ✅ si son sensor |
| `/areas/{areaId}/alert-thresholds` | GET | ✅ | ✅ si sa zone | ❌ | ✅ si sa zone | ❌ |
| `/areas/{areaId}/alert-thresholds` | POST | ✅ | ✅ si sa zone | ❌ | ❌ | ❌ |
| `/areas/{areaId}/actuators` | GET | ✅ | ✅ si sa zone | ❌ | ✅ si sa zone | ❌ |
| `/areas/{areaId}/actuators` | POST | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/actuators/{actuatorId}` | GET | ✅ | ✅ si sa zone | ❌ | ✅ si sa zone | ✅ si son actuator |
| `/actuators/{actuatorId}` | PUT | ✅ | ✅ si sa zone | ❌ | ❌ | ❌ |
| `/actuators/{actuatorId}` | DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/users` | POST | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/users/{userId}` | GET | ✅ | ✅ si lui-meme | ❌ | ✅ si lui-meme | ❌ |

## Justification rapide des choix structurants

1. **Les zones restent visibles uniquement dans le perimetre metier utile** : admin en global, operator/reader filtres sur leur zone.
2. **Les ecritures d'infrastructure** (`POST /areas`, `POST /areas/{areaId}/actuators`, `DELETE /actuators/{actuatorId}`, `POST /users`) restent reservees a l'admin.
3. **Le pilotage d'actionneurs** (`PUT /actuators/{actuatorId}`) est autorise a l'admin et a l'operator de la zone, mais pas au reader ni au device.
4. **Le device n'herite pas d'un acces par zone** : il ne peut agir ou consulter que la ressource technique qui lui est attribuee.
5. **Le reader** est strictement **lecture seule**, avec exception de consultation de son propre profil sur `/users/{userId}`.

## Cartographie des verifications

| Endpoint | Condition d'acces | Couche de verification | Ce qu'on verifie concretement |
| --- | --- | --- | --- |
| `GET /areas` | `admin`, `operator`, `reader` | Middleware par route + logique metier | `requireScope('areas:read')`, `requireRoles(...)`, puis filtrage par `user.zone` |
| `GET /sensors/{sensorId}` | `operator`/`reader` si leur zone, `device` si son sensor | Middleware par route + logique metier | `requireScope('sensors:read')`, `requireRoles(...)`, puis comparaison `sensor.areaId === user.zone` ou `resourceType === 'sensor' && resourceId === sensor.id` |
| `POST /sensors/{sensorId}/measures` | `admin` ou `device` proprietaire | Middleware par route + logique metier | role autorise, puis verification d'appartenance stricte du device au capteur cible |
| `GET /areas/{areaId}/alert-thresholds` | `operator`/`reader` si leur zone | Middleware par route + logique metier | controle du scope puis comparaison `area.id === user.zone` |
| `PUT /actuators/{actuatorId}` | `admin` ou `operator` de la zone | Middleware par route + logique metier | `requireScope('actuators:write')`, `requireRoles('admin', 'operator')`, puis verification `actuator.areaId === user.zone` pour un operator |
| `GET /actuators/{actuatorId}` | `device` si son actuator | Middleware par route + logique metier | verification de role, puis correspondance exacte `resourceType/resourceId` |
| `GET /users/{userId}` | `admin` ou utilisateur lui-meme | Middleware par route + logique metier | `requireScope('users:read')`, `requireRoles(...)`, puis comparaison `targetUser.id === currentUser.id` |

## Decisions ambiguës tranchees

| Sujet | Decision retenue | Pourquoi |
| --- | --- | --- |
| Reader | Role ajoute avec scopes de lecture seule | Permet une vraie colonne "lecteur" dans la matrice et un comportement coherent dans l'API |
| Device IoT | Perimetre sur ressource propre, pas sur zone | Evite qu'un device compromis lise ou pilote les autres equipements de sa zone |
| Publication de mesures | `admin` + `device` proprietaire autorises | L'admin garde un acces total ; le device reste le producteur normal de la mesure |
| Lecture utilisateur | Self-service pour `operator` et `reader`, global pour `admin` | Compromis entre utilite metier et moindre privilege |

## Mapping implementation -> code

- `src/auth.js` : scopes par role + claims JWT (`zone`, `resourceType`, `resourceId`)
- `src/authorization.js` : controles BFLA (`requireScope`, `requireRoles`) et BOLA (zone / ressource propre)
- `src/routes/*.js` : application endpoint par endpoint de la matrice
- `tests/auth.test.js` : scenarios nominaux et adverses authN/authZ

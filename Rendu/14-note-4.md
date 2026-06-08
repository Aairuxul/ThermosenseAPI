# Note 4 — Résilience mobile/IoT et mesures réseau dégradé

| | |
| --- | --- |
| **Module** | Web Services — M2 Expert en Développement mobile & IoT |
| **Évaluation** | Note 4 — 10 % de la note finale |
| **Format** | Dossier (4 sections) — groupe ThermoSense |
| **Endpoint critique** | `POST /v1/sensors/{sensorId}/measures` (ingestion de mesure IoT) |
| **Mesures** | réelles, reproductibles — `node bench/run.js` (seed `20260608`, N=100/passe) |
| **Preuves** | [`note4/results/`](./note4/results/) : `results.json`, `summary.txt`, `traces.json`, `raw-server.log` |

> **Périmètre.** Ce dossier traite la **résilience** (Note 4). Il est **distinct** de la Note 3 L2
> (gouvernance / audit / quality gate, cf. [`11-note-3.md`](./11-note-3.md), [`12-quality-gate-api.md`](./12-quality-gate-api.md)).
> Le tableau avant/après ci-dessous ne figure **pas** dans le dossier de gouvernance.

> **🔄 Mise à jour Séance 9 (Note 5).** Le correctif serveur identifié en S8 (§ 3.3) a été **implémenté** :
> middleware d'idempotence [`src/idempotency.js`](../src/idempotency.js) (commit `eee5c31`), câblé sur
> `POST /measures` et `PUT /actuators`. Le bench a été **rejoué à seed identique** : **0 doublon** sur les
> 3 scénarios (contre **2 / 14 / 107** en S8). Le risque résiduel **« intégrité / doublons » est résolu** ;
> le risque restant est la **disponibilité** sous perte ≥ 50 % (scénario C). Les § 2.1, 2.2, 2.4, 3.1, 3.3
> et 4 ci-dessous ont été **actualisés** ; les chiffres S8 sont conservés comme repère « avant ».

**Cadrage (N1 — « que mesurer avant de coder ? »).** Avant tout mécanisme, on a fixé les trois sources
possibles de l'incident et la mesure qui les départage : **réseau** (latence/perte injectées, observées par
le client), **client** (taux de succès *perçu*, latence perçue, nombre de retries), **serveur** (statut HTTP réel,
mesures réellement persistées, doublons). Le harness sépare explicitement ces deux plans : il **injecte** la
dégradation réseau et **observe** l'état réel du serveur. C'est cette séparation qui permet de prouver que le
symptôme « commande exécutée deux fois » vient d'un **retry client sur une écriture non dédupliquée serveur**,
pas d'un bug applicatif.

---

## Section 1 — Plan de test réseau dégradé

### 1.1 Contexte et hypothèses

**Endpoint ciblé :**

```
POST /v1/sensors/{sensorId}/measures        (sensorId = sensor-1, capteur actif)
```

**Justification du choix (impact mobile/IoT).** C'est une **écriture à effet de bord** émise en continu
par des passerelles/capteurs ThermoSense déployés en **entrepôt** (Zone A — Entrepôt Nord), là où la
connectivité 3G est la plus instable. Un échec silencieux a un double impact terrain : (1) **trou de données**
→ angle mort sur la température → **seuil d'alerte manqué** (risque chaîne du froid) ; (2) **doublon** sur retry
→ moyennes faussées → **fausse alerte**. Le contrat le classe d'ailleurs en opération à idempotence
obligatoire (`contrat-openapi.yaml` l. 532‑535). L'incident rapporté sur les actionneurs
(`PUT /actuators/{id}`) a **la même racine** (retry client sans déduplication serveur) et le **même client HTTP** ;
on mesure ici sur l'ingestion car le doublon y est directement **comptable** (chaque POST crée une ressource).

**Opération idempotente ?** ☐ Oui ☑ **Non** (chaque POST crée une nouvelle mesure ; ID auto-incrémenté).
**Comportement attendu côté serveur en cas de doublon :** selon le contrat (l. 560, l. 1007‑1030), un rejeu de la
même `Idempotency-Key` + même body doit **renvoyer la réponse mémorisée sans ré-enregistrer**. ✅ **Implémenté
en Séance 9** ([`src/idempotency.js`](../src/idempotency.js), commit `eee5c31`, cf. § 2.4) : le rejeu renvoie
la réponse mémorisée, **sans doublon**.

**Hypothèses de départ.** Device/passerelle en *foreground*, émettant ~**1 mesure/s** ; file d'attente locale
possible mais **non implémentée** dans cette itération ; JWT valide pendant toute la passe (TTL 30 min ≫ durée
test) ; capteur `sensor-1` **actif** (sinon `409 sensorUnavailable`).

### 1.2 Scénarios de simulation

| # | Scénario | Latence ajoutée | Taux de perte | Timeout client | Justification |
| --- | --- | --- | --- | --- | --- |
| **A** | Nominal dégradé (3G faible) | 200–500 ms | 5 % | 3 000 ms (write) | Couverture 3G correcte mais variable (déplacement entre allées). |
| **B** | **Réseau très instable (chantier/entrepôt)** — *réf.* | 800–1500 ms | 20 % | 3 000 ms (write) | Zone métallique/réfrigérée, obstacles ; **scénario de référence** (cas terrain dominant). |
| **C** | Panne partielle (passerelle IoT saturée) | 2000–4000 ms | 50 % | 3 000 ms (write) | Stress : congestion + pertes massives → recherche du **point de rupture**. |

**Modèle de perte (documenté).** Une perte est, pour moitié, une *request-loss* (la requête n'atteint pas le
serveur) et pour moitié une *response-loss* (le serveur **exécute** mais le client ne reçoit pas la réponse →
expire). La *response-loss* est la **cause physique du doublon** sur retry — exactement le mécanisme de l'incident
terrain.

**Outil de simulation retenu :** ☑ **Middleware client** (wrapper `fetch`) — [`bench/degraded-client.js`](../bench/degraded-client.js).
Choisi car **sans dépendance**, **déterministe** (PRNG seedé → 100 % reproductible) et exécutable par un relecteur
externe en une commande.

**Configuration reproductible :**

```bash
node bench/run.js          # seed=20260608, N=100 ops/passe, RATE_LIMIT_MAX élevé (isole l'effet réseau)
```

> La latence et la politique de timeout sont **injectées analytiquement** (seedées) ; les **effets serveur**
> (mesures persistées, doublons, statut HTTP) sont **réels**, observés sur une instance ThermoSense fraîche
> par passe. Le rate limiting est désactivé pendant le bench pour ne mesurer **que** l'effet réseau (le throttling
> 429 est traité séparément en § 3.4).

### 1.3 Métriques et critères de succès/échec — **définis AVANT mesure**

| Métrique | Unité | Méthode de collecte | Seuil acceptable (réf. B) |
| --- | --- | --- | --- |
| Taux de succès (2xx perçu) | % | journal client (`traces.json`) | **≥ 95 %** |
| Latence p95 perçue | ms | chrono client (modèle latence + timeout) | **≤ 5 000 ms** (pas de gel sans feedback) |
| Retries / requête | nb | journal client | **≤ 3** |
| Doublons persistés | nb | `GET …/measures` réel, regroupé par valeur sentinelle | **0** (tolérance zéro : fausse moyennes/seuils) |
| Consommation réseau | req/min | requêtes physiques × 60 (à 1 op/s) | ≤ **2×** baseline |

**Critère de succès global (réf. B) :** `succès ≥ 95 %` **ET** `p95 ≤ 5 000 ms` **ET** `0 doublon` **ET** `retries ≤ 3`.
**Critère d'échec immédiat (stop-test) :** `req/min > 2× baseline` (tempête de retries) **ou** doublon sur une
opération **échouée** côté client **ou** secret exposé dans les logs de retry **ou** crash client.

### 1.4 Protocole d'exécution

1. **Baseline** — client **conforme** (clé envoyée) mais **sans résilience** : pas de timeout applicatif
   (plafond de **gel à 8 s**), pas de retry.
2. **Résilient** — conforme + timeout 3 s (write) / 1,5 s (read) + retry borné (max 3, backoff exp. + full
   jitter). La clé est **honorée par le serveur** (déduplication, depuis S9).
3. *(contrôle négatif)* **Sans clé** — écriture **sans** `Idempotency-Key`, pour vérifier l'**enforcement**
   du contrat (le serveur doit refuser : `422`).

**Volume :** N = **100** opérations logiques par passe (p95 significative). **Ordre :** A puis B puis C ; pour chaque
scénario, baseline → resilient → resilient+key. **Isolation :** serveur **redémarré** (seed mémoire neuf) à chaque
passe. La dégradation est seedée **par opération** et **indépendante de la variante** ⇒ l'op *i* voit des
conditions réseau **identiques** d'une variante à l'autre (comparaison contrôlée).
**Résultats bruts conservés :** ☑ `results.json` ☑ `traces.json` ☑ `raw-server.log` (sortie serveur réelle).

---

## Section 2 — Mesures avant/après

### 2.1 Tableau obligatoire — scénario de référence **B** (réseau très instable, 20 % perte)

*Baseline* (conforme, sans résilience) vs *Après mécanismes* (= timeout + retry, **clé honorée serveur**). Source : [`note4/results/results.json`](./note4/results/results.json).

| Métrique | Baseline (sans) | Après mécanismes | Delta | Scénario réf. |
| --- | --- | --- | --- | --- |
| Taux de succès (%) | **82 %** | **100 %** | **+18 pts** ✅ | B |
| p95 latence perçue (ms) | **8 000** | **4 913** | **−3 087 ms** ✅ | B |
| Retries / requête | 0 | 0,24 | +0,24 | B |
| Doublons observés | 0 | **0** | **0** ✅ | B |
| Consommation réseau (req/min) | 60 | 74 | +14 (+23 %) | B |

*Repères complémentaires (B) :* p50 perçue **1 169 ms** (inchangée) ; max perçue 8 000 → 11 753 ms ;
mesures réellement persistées = **100 distinctes, 0 doublon** (la déduplication serveur élimine les
ré-exécutions sur retry — cf. § 2.4). Rappel S8 : 14 doublons quand la clé était inerte.

**Verdict vs critères (§ 1.3) :** succès ✅ (100 ≥ 95) · p95 ✅ (4 913 ≤ 5 000) · retries ✅ (0,24 ≤ 3) ·
**doublons ✅ (0 = 0)**. → Tous les critères du scénario de référence sont tenus : la **disponibilité** (client)
**et** l'**intégrité** (déduplication serveur) sont atteintes. Le **zéro-doublon**, inatteignable côté client
seul en S8, l'est devenu après le correctif serveur de S9 (cf. § 2.4 et § 3.3).

### 2.2 Synthèse des 3 scénarios (baseline → après)

| Scénario | Succès % | p95 (ms) | Retries/req | Doublons | req/min |
| --- | --- | --- | --- | --- | --- |
| **A** (3G faible, 5 %) | 97 → **100** | 498 → **498** | 0 → 0,04 | 0 → **0** | 60 → 62 |
| **B** (très instable, 20 %) *réf.* | 82 → **100** | 8 000 → **4 913** | 0 → 0,24 | 0 → **0** | 60 → 74 |
| **C** (panne partielle, 50 %) | 52 → **66** | 8 000 → **14 416** | 0 → 1,83 | 0 → **0** | 60 → **170** |

> *Doublons : 0 partout depuis le correctif serveur S9 (§ 2.4). En S8, avant que le serveur n'honore la clé,
> ces mêmes passes mesuraient **2 / 14 / 107** doublons (A/B/C) — chiffres conservés ci-dessous comme repère.*

**Lecture des deltas (interprétation, pas description).**

- **A — la résilience peut être à perte.** Le réseau est déjà « assez bon » (baseline 97 %, p95 498 ms). Les
  mécanismes n'apportent **aucun gain de latence** (p95 identique) pour +3 pts de succès, et +2 req/min. → Sur
  réseau correct, le retry agressif est **net négatif** : la résilience doit être **conditionnelle** aux
  conditions mesurées, pas toujours active. (Côté intégrité, **0 doublon** : la clé est honorée.)
- **B — le point d'équilibre (cas terrain).** Gain franc : **+18 pts** de succès, **gel de 8 s éliminé**
  (p95 8 000 → 4 913 ms), **0 doublon**. Coût **modéré** : +23 % de requêtes. C'est le point où le couple
  *retry (disponibilité) + déduplication serveur (intégrité)* tient les deux objectifs.
- **C — le point de rupture.** Le retry **n'atteint pas** la cible de disponibilité (66 % < 95 %), **dégrade**
  la p95 (8 000 → **14 416 ms**) et **triple** la charge réseau (60 → **170 req/min** > stop-test). L'**intégrité**
  est préservée (**0 doublon**, déduplication serveur), mais le retry client **seul** ne suffit **pas** à la
  **disponibilité** sous panne partielle : il faut une **file locale + backpressure** côté client (cf. § 4).

### 2.3 Symptôme « gel » de l'incident — preuve (op B #13, baseline)

```json
{ "i": 13, "ok": false, "perceivedMs": 8000, "attempts": 1,
  "outcomes": ["timeout(resp-loss)"] }      // le serveur a exécuté, le client gèle 8 s puis échoue
```

C'est le « *l'application se gèle plusieurs secondes sans feedback* » du brief : sans timeout applicatif, une
*response-loss* bloque le client jusqu'au plafond. Le timeout 3 s (après) borne ce gel.

### 2.4 Effet de l'`Idempotency-Key` — comparaison **contrôlée** S8 → S9 (résultat clé)

En **Séance 8**, à conditions réseau identiques (seed par opération), envoyer ou non le header ne changeait
**rien** : avec ou sans clé, on mesurait **les mêmes 14 doublons** en réf. B (idem A : 2 = 2 ; C : 107 = 107).
La clé était **inerte** — le serveur l'**ignorait**. C'était le risque résiduel documenté.

En **Séance 9**, le middleware serveur a été implémenté ([`src/idempotency.js`](../src/idempotency.js),
commit `eee5c31`, câblé sur `POST /measures` et `PUT /actuators`). Rejeu du **même** bench (seed `20260608`),
seul le comportement serveur a changé :

| `POST …/measures` (réf. B) | Succès % | p95 (ms) | Retries/req | **Doublons** |
| --- | --- | --- | --- | --- |
| **S8** — clé envoyée, serveur l'**ignore** | 100 | 4 913 | 0,24 | **14** |
| **S9** — clé envoyée, serveur la **déduplique** | 100 | 4 913 | 0,24 | **0** |

Même réseau, même retry, **seul le serveur change** ⇒ les doublons passent de **14 à 0** (idem A : 2 → 0 ;
C : 107 → 0, cf. § 2.2). Mécanisme : sur une *response-loss* suivie d'un retry portant la même clé, la
2ᵉ requête est **rejouée depuis le cache d'idempotence** (réponse mémorisée), donc **une seule mesure
persistée** au lieu de deux. En miroir, une écriture **sans** clé est refusée d'emblée — variante `no_key`
du bench : **0 % de succès** (`422 idempotencyKeyMissing`), **preuve d'enforcement** du contrat.

> **Source :** `results.json` / `traces.json` (par opération) / `raw-server.log` ; état serveur réel via
> `GET /v1/sensors/sensor-1/measures`. Rejouable : `node bench/run.js`. Les 14 doublons S8 sont conservés
> comme repère « avant ». Tests automatisés associés : `tests/auth.test.js` (idempotence : rejeu sans doublon,
> conflit `409`, clé manquante `422`).

---

## Section 3 — Mécanismes retenus et écartés

### 3.1 Mécanismes retenus (≥ 2)

| Mécanisme | Paramètres retenus | Justification (contexte ThermoSense) | Compromis explicite |
| --- | --- | --- | --- |
| **Timeout différencié** | write **3 000 ms** / read **1 500 ms** | Une ingestion tolère plus de latence qu'un *read* qui bloque l'UI ; 3 s = borne au-delà de laquelle l'opérateur perçoit un gel. **Supprime le gel de 8 s** (§ 2.3). | Un *write* légitime mais lent (> 3 s) est compté en échec → **faux négatif** → retry → **risque de doublon**. |
| **Retry borné + backoff exp. + full jitter** | max **3**, base **500 ms**, cap **4 000 ms**, jitter = `rand(0, min(cap, base·2ⁿ))` | Récupère les pertes transitoires (**+18 pts** en B) ; le **jitter** évite la synchronisation de flotte (thundering herd) à la reprise réseau ; la borne 3 plafonne la tempête. Conforme au backoff exigé au contrat (l. 64). | **+latence tail** (p95 ↑ en C), **+req/min** (charge réseau/**batterie**), **+doublons** sur POST non idempotent. |
| **Idempotency-Key** (client **+ serveur, S9**) | UUID v4 / opération, **stable sur retries** ; **déduplication serveur 24 h** ([`src/idempotency.js`](../src/idempotency.js)) | **Seule** protection contractuelle contre les doublons (l. 541, l. 1007‑1030), désormais **effective** : **0 doublon** mesuré (§ 2.4). Clé **obligatoire** (`422` sinon). | Store de déduplication **en mémoire (mono-process)** → à porter sur store partagé (Redis) pour un déploiement multi-instances. |

### 3.2 Mécanisme écarté (≥ 1)

**Circuit breaker (simplifié) — écarté.** Sur une **ingestion** émise par un **producteur unique** de données
critiques, ouvrir le circuit après N échecs revient à **jeter des mesures** (trous de données → angles morts →
seuils manqués) — soit l'**inverse** de l'objectif. Le breaker protège un *downstream* saturé en contexte
*server-to-server* ; il est **inadapté** à un device isolé qui doit *conserver* ses mesures. Coût d'ajout en S8 :
faible (librairie), mais **bénéfice négatif** ici.

**Mode dégradé / file d'attente locale — non implémenté (faute de temps), recommandé.** C'est la **vraie**
réponse au scénario C : bufferiser localement et **rejouer à la reprise** borne le débit (anti-tempête : règle le
+170 req/min de C) et **préserve les données**. Si on affiche des données issues du cache, il faudra les
**marquer *stale*** (sinon problème UX/confiance). Classé **ouvert** (§ 4).

### 3.3 Volet sécurité (obligatoire) — double exécution sur opération à effet de bord

Le **retry est appliqué sur une écriture** (`POST …/measures` crée une ressource) → **risque de double
exécution serveur**. État **après correctif S9** :

- **Garantie côté serveur : déduplication par `Idempotency-Key`.** Le middleware
  [`src/idempotency.js`](../src/idempotency.js) mémorise `clé → (statut, body)` sur **24 h** : un rejeu
  identique (même clé + même body) renvoie la réponse mémorisée **sans ré-exécuter** l'effet de bord ; un
  body différent renvoie `409 idempotencyConflict` (l. 590) ; une clé absente/mal formée, `422` (l. 599).
  Câblé sur `POST /measures` et `PUT /actuators` (commit `eee5c31`), conforme au contrat (l. 1007‑1030, NC #6).
- **Effet mesuré :** une *response-loss* suivie d'un retry réussi ne crée **plus** de doublon (2ᵉ requête
  rejouée depuis le cache). Doublons : **0 / 0 / 0** (A/B/C) — contre **2 / 14 / 107** en S8.
- **Cas d'une opération que l'opérateur croit échouée** (retries multiples, échec final côté client) : la
  ressource créée par une tentative reçue côté serveur **n'est plus dupliquée** par les retours ultérieurs
  portant la même clé.
- **Tests automatisés :** `tests/auth.test.js` couvre « rejeu identique → même ressource sans doublon »,
  « même clé + body différent → `409` » et « clé absente → `422` » (27/27 passants).
- **Limite résiduelle restante :** store d'idempotence **en mémoire (mono-process)** → store partagé requis
  en multi-instances ; et la **disponibilité** sous perte ≥ 50 % (scénario C) n'est **pas** réglée par la clé
  (file locale + backpressure, cf. § 4).

### 3.4 Note 429 / rate limiting (écart contrat secondaire)

Le retry gère aussi le `429`, mais l'implémentation diverge du contrat : `src/index.js` renvoie
`code: "tooManyRequests"` + en-têtes `RateLimit-*`, alors que le contrat (l. 1081‑1115) spécifie
`code: "rateLimitExceeded"` + **`Retry-After`**. Un client qui respecte le contrat plafonnerait son backoff sur
`Retry-After` **absent** → décision de contrat à aligner (cf. § 4).

---

## Section 4 — Paragraphe de compromis

**Ce que nous avons gagné.** Sur le scénario de référence (B, 20 % de perte), les mécanismes client font
passer le **taux de succès de 82 % à 100 %** et **éliminent le gel de 8 s** (p95 8 000 → 4 913 ms) : un
retour borné et fiable pour l'opérateur en entrepôt.

**Ce que nous avons perdu / complexifié.** Le gain n'est **pas gratuit**. Le retry sur une écriture alourdit
la **consommation réseau/batterie** (+23 % en B) et la **latence de queue**. En S8, il **créait des doublons**
(14 en B) qui faussaient moyennes et seuils, car l'`Idempotency-Key` exigée par le contrat était **inerte**
côté serveur. Ce défaut a été **corrigé en S9** (déduplication serveur, § 2.4 / § 3.3) : à conditions
identiques, les doublons passent de **14 à 0**. Reste le coût du retry lui-même : en panne partielle (C), il
devient **contre-productif sur la disponibilité** — 66 % de succès, p95 à 14 s, charge réseau **×3**
(170 req/min) — même si l'**intégrité** est désormais préservée (**0 doublon**).

**Ce qui reste ouvert.** (1) ✅ **Fait en S9 — déduplication serveur** de l'`Idempotency-Key` (commit
`eee5c31`) : le « 0 doublon » est désormais atteint. (2) **File locale + backpressure** côté client pour le
cas C (disponibilité). (3) **Retry adaptatif** (désactivé quand le réseau est bon, cf. A net négatif).
(4) **Aligner le contrat 429** (§ 3.4). (5) **Store d'idempotence partagé** (Redis) pour un déploiement
multi-instances. L'**intégrité** est acquise ; la **disponibilité** sous panne sévère reste le prochain chantier.

---

### Annexe — Reproductibilité & traçabilité

- **Rejouer :** `node bench/run.js` → écrit [`note4/results/`](./note4/results/). Harness : [`bench/`](../bench/) ([README](../bench/README.md)).
- **Preuves :** `results.json` (métriques), `traces.json` (par opération), `summary.txt`, `raw-server.log` (serveur réel, 9 passes).
- **Contrat :** `contrat-openapi.yaml` — `IdempotencyKey` l. 1007‑1030 ; `POST measures` l. 532‑605 ; `TooManyRequests` l. 1081‑1115. Commits `3fe49b2` (NC #6 idempotence + rate limiting), `b334fc9` (avant).
- **Implémentation auditée :** [`src/routes/measures.js`](../src/routes/measures.js) (ne lit pas `Idempotency-Key`), [`src/index.js`](../src/index.js) (rate limit).
- **Documents liés (fil rouge) :** [`04-scenarios-critiques.md`](./04-scenarios-critiques.md) (Scénario A — commande dupliquée), [`13-remediation-express.md`](./13-remediation-express.md) (NC #6), [`03-matrice-contraintes.md`](./03-matrice-contraintes.md) (C3 Fiabilité).

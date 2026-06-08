---
theme: seriph
title: ThermoSense — Commission d'architecture
info: |
  Note 5 — Web Services M2 — Groupe ThermoSense
  Supervision capteurs / pilotage actionneurs IoT pour app mobile.
class: text-center
transition: slide-left
mdc: true
---

# ThermoSense API

### Commission d'architecture — Note 5

Web service REST de supervision de capteurs & pilotage d'actionneurs **IoT** pour app **mobile**

<div class="pt-8 text-sm opacity-80">
Groupe ThermoSense — Kenza · Enzo · Matteo · Tommy · Valentin · 9 juin 2026
</div>

<div class="abs-br m-6 text-xs opacity-60">
npm start → localhost:3000/api-docs · compte root/root
</div>

<!--
Porte-parole 1. Cadre : ce n'est pas une revue exhaustive. On défend 3 décisions et un incident.
Fil conducteur de toute la soutenance : « mesurer avant de décider ».
-->

---

# Contexte & fil rouge S1 → S9

<div grid="~ cols-2 gap-8">

<div>

**Le produit**
- Hiérarchie `Zone → Capteur / Actionneur / Seuil` + `Mesure`
- Contrat **OpenAPI 3.0.3**, versionné **`/v1`**
- Clients : **app mobile** + **devices IoT** (firmware figé)

**La contrainte structurante**
- Réseau **non maîtrisé** (3G d'entrepôt, perte, latence)
- Écritures à **effet de bord** physique

</div>

<div>

**La trajectoire**

| S | Étape |
|---|---|
| 1-3 | Contrat, ressources, décisions design |
| 4 | Sécurité : threat model, RBAC/BOLA |
| 6-7 | Audit croisé → **4,5/8 → 8/8** |
| 8 | Résilience **mesurée** |
| **9** | **Idempotence serveur livrée** |

</div>

</div>

<!--
Le projet final est le résultat de décisions itératives, pas un one-shot. L'audit et la mesure ont
fait bouger le contrat. Insister : la mesure (S8) a révélé un défaut qu'on a corrigé (S9).
-->

---

# Trois décisions, trois compromis

<div class="grid grid-cols-3 gap-4 pt-4">

<div class="p-4 rounded border border-teal-500">

### 1 · Idempotence **serveur**
Écritures sûres sur retry
<div class="text-xs opacity-70 pt-2">Compromis : store en mémoire (mono-process)</div>

</div>

<div class="p-4 rounded border border-blue-500">

### 2 · Accès **2 étages**
RBAC (403) + BOLA → **404**
<div class="text-xs opacity-70 pt-2">Compromis : 404 ambigu pour le dev légitime</div>

</div>

<div class="p-4 rounded border border-amber-500">

### 3 · Résilience **mesurée**
Timeout + retry borné + jitter
<div class="text-xs opacity-70 pt-2">Compromis : coût réseau/batterie, à rendre conditionnel</div>

</div>

</div>

<div class="pt-8 text-center text-sm opacity-80">
Chaque décision : un problème réel → un choix → <b>ce qu'on a accepté de perdre</b>.
</div>

<!--
Slide d'aiguillage. On peut être interrogé sur n'importe laquelle. Rotation des porte-paroles ici.
-->

---

# Décision 1 — Idempotence côté serveur

<div grid="~ cols-2 gap-6">

<div>

**Problème.** Timeout + retry sur `POST …/measures` → **doublon** → moyennes & seuils faussés.

**Trajectoire honnête**
- S6-7 : clé `Idempotency-Key` **documentée au contrat**
- S8 : mesurée **inerte** → **14 doublons** (clé décorative)
- S9 : **dédup serveur** livrée (`src/idempotency.js`)

**Compromis.** Store en mémoire (mono-process) → Redis en multi-instances ; clé **obligatoire** (`422` sinon).

</div>

<div>

**Comportement (contrat = implémentation)**

| Cas | Réponse |
|---|---|
| Clé absente / mal formée | `422` |
| Rejeu même clé + même body | réponse mémorisée, **0 effet** |
| Même clé, body différent | `409` |

<div class="pt-4 text-center text-3xl font-bold text-teal-400">
14 → 0 doublon
</div>
<div class="text-center text-xs opacity-70">réf. B, conditions identiques, seul le serveur change</div>

</div>

</div>

<!--
Question piège attendue : « montrez où le paramètre de retry est défini et comment le changer sans
redéployer ». Réponse : côté client (degraded-client.js / app), aucun redeploy serveur. Quotas serveur = env vars.
-->

---

# Décision 2 — Accès à deux étages

<div grid="~ cols-2 gap-6">

<div>

**Risque n°1 OWASP** : Broken Access Control.

**Autorisation systématique en 2 temps**
1. **Fonction (BFLA)** — RBAC : 4 rôles + scopes JWT → `403`
2. **Objet (BOLA)** — appartenance zone / ressource → **`404`**

**Pourquoi `404` et pas `403` ?**
`404` **masque l'existence** → pas d'oracle d'énumération d'IDs.

</div>

<div>

**Preuves**
- `src/authorization.js` — `requireRoles` / `requireScope` + appartenance
- **37 tests** : RBAC, isolation inter-zones, ownership device
- Cas **adverses** : token expiré, signature invalide, `aud` non conforme, Bearer dupliqué

<div class="pt-4 text-xs opacity-70">JWT HS256 · aud/iss vérifiés · access 30 min / refresh 7 j · rate-limit 100/min (10/15min sur login)</div>

</div>

</div>

<!--
Compromis assumé : le 404 gêne le diagnostic légitime → on l'accepte contre l'énumération.
La matrice complète est dans 10-matrice-autorisations.md.
-->

---

# Démonstration — flux mobile → API → IoT

<div class="text-sm">

**Parcours intégrateur (copier-coller, README)** — un flux complet + l'incident :

</div>

```bash
# 1. login → JWT
TOKEN=$(curl -s -X POST .../v1/auth/login -d '{"email":"root","password":"root"}' | jq -r .token)

# 2. publier une mesure (écriture idempotente)
curl -X POST .../v1/sensors/sensor-1/measures -H "Idempotency-Key: $KEY" -d '{...}'   # 201

# 3. REJOUER la même clé (retry mobile)  → même réponse, AUCUN doublon
# 4. SANS clé                            → 422 (enforcement)
```

<div class="grid grid-cols-3 gap-3 pt-3 text-center text-sm">
<div class="p-2 rounded bg-green-500/15">POST + clé → <b>201</b></div>
<div class="p-2 rounded bg-blue-500/15">rejeu → <b>même réponse</b>, 0 doublon</div>
<div class="p-2 rounded bg-amber-500/15">sans clé → <b>422</b></div>
</div>

<div class="pt-3 text-xs opacity-70">
Repli si le live échoue : logs de fallback + résultats reproductibles <code>npm run bench</code>.
</div>

<!--
Démo maîtrisée. On sait s'arrêter pour expliquer chaque code. Si ça plante : on montre les logs, pas on coupe.
-->

---

# Sécurité — du threat model aux preuves

<div grid="~ cols-2 gap-6">

<div>

**Top 3 risques → contre-mesures (implémentées)**

| Risque | Contre-mesure |
|---|---|
| Broken Access Control | RBAC + BOLA (403/404) |
| Excessive Data Exposure | pagination (`limit` ≤ 499) |
| Injection / entrées | validation + `enum` typés |

Transverses : Helmet · rate-limit · **security logger** (échec auth, refus, quota).

</div>

<div>

**Audit croisé → remédiation**

<div class="text-center text-4xl font-bold pt-2">
4,5/8 <span class="opacity-50">→</span> <span class="text-green-400">8/8</span>
</div>
<div class="text-center text-xs opacity-70">3 bloquantes corrigées : versioning, idempotence, rate-limit</div>

**Quality gate (CI)**
- `spectral lint` → **0 erreur**
- détection de secrets · tests sécurité · anti-breaking (`oasdiff`)

</div>

</div>

<!--
Risque résiduel sécurité honnête : ETag/If-Match conçu mais non implémenté (last-write-wins), secret JWT par défaut.
-->

---
layout: center
---

# Résilience — le résultat clé

Endpoint critique `POST /v1/sensors/{id}/measures` · `npm run bench` (seed fixe, N=100)

| Métrique (réf. B, 20 % perte) | Baseline | Après mécanismes | |
|---|---|---|---|
| Taux de succès | 82 % | **100 %** | ✅ +18 pts |
| p95 latence perçue | 8 000 ms (gel) | **4 913 ms** | ✅ gel éliminé |
| **Doublons persistés** | 0 | **0** | ✅ (était **14** en S8) |
| Consommation réseau | 60 req/min | 74 req/min | coût +23 % |

<div class="pt-4 text-center text-sm opacity-80">
Disponibilité (retry client) <b>+</b> intégrité (dédup serveur) — les deux objectifs tenus.
</div>

<!--
Mesures réelles, reproductibles. Le « gain n'est pas gratuit » : +23% de requêtes = réseau/batterie.
-->

---

# Résilience — la limite assumée (scénario C)

<div grid="~ cols-2 gap-6">

<div>

**Panne partielle (50 % de perte)** — même conforme + résilient :

| | Baseline | Après |
|---|---|---|
| Succès | 52 % | **66 %** ❌ |
| p95 | 8 s | **14 s** |
| Réseau | 60 | **170** req/min |
| Doublons | 0 | **0** ✅ |

</div>

<div>

**Lecture**
- **Intégrité acquise** (0 doublon) ✅
- **Disponibilité insuffisante** : le retry client **seul** ne suffit pas

**Ce qu'il faut** : **file locale + backpressure** côté client → *conçue, non implémentée (faute de temps)*.

<div class="pt-3 text-sm opacity-80">Le risque résiduel est <b>déplacé et nommé</b>, pas masqué.</div>

</div>

</div>

<!--
« Dans quel contexte votre choix serait le mauvais ? » → sur bon réseau (A), le retry est net négatif → le rendre conditionnel.
-->

---

# Intégration — architecture hybride REST + SOAP

<div grid="~ cols-2 gap-6">

<div>

**REST** — cœur IoT/mobile (~95 % des volumes, ~10 k mesures/min)

**SOAP** — **un** service : `BillingService` (facturation B2B)
- WSDL **legacy imposé** par le partenaire
- **non-répudiation** (WS-Security, pièce légale 10 ans)
- frontière métier (bounded context)

</div>

<div>

**Intégration**
- Client mobile ne voit **jamais** le SOAP
- **Proxy REST→SOAP** (`POST /v1/invoices`)

**Compromis**
- Verbosité XSD acceptée (− validation applicative)
- Bus factor SOAP → microservice isolé + runbook

<div class="text-xs opacity-70 pt-2">Détail : 11-note-3.md · extrait WSDL au dépôt</div>

</div>

</div>

<!--
On n'a pas écarté SOAP par principe : on l'a placé là où il gagne (audit financier), pas sur le temps-réel IoT.
-->

---

# Bilan — 3 choses qu'on referait autrement

<div class="space-y-3 pt-2">

<div class="p-3 rounded border-l-4 border-teal-500">
<b>1. Implémenter l'idempotence serveur dès qu'on la met au contrat.</b>
Une garantie de sécurité doit être livrée <b>avec son test</b> — pas un sprint plus tard.
</div>

<div class="p-3 rounded border-l-4 border-blue-500">
<b>2. Persistance versionnée (BD + contraintes) plus tôt.</b>
Le store en mémoire a bloqué la concurrence (ETag) et l'idempotence partagée — plus fort effet de levier.
</div>

<div class="p-3 rounded border-l-4 border-amber-500">
<b>3. Valider contrat <i>et</i> implémentation ensemble.</b>
Tests de contrat (Schemathesis) → l'écart <code>429</code> aurait été détecté tôt.
</div>

</div>

<div class="pt-4 text-center text-sm opacity-80">
Limites assumées : store mémoire · ETag non implémenté · secret JWT par défaut · écart 429.
</div>

<!--
Honnêteté = critère noté. On assume avec des raisons techniques, jamais « on a manqué de temps » seul.
-->

---
layout: center
class: text-center
---

# Mesurer avant de décider

Une garantie **décorative** (idempotence inerte, 14 doublons)
→ devenue **prouvée** (0 doublon)
→ risque résiduel **déplacé et nommé** (disponibilité sous panne)

<div class="pt-8 text-base opacity-80">
Contrat OpenAPI <b>/v1</b> · 37 tests · lint 0 erreur · bench reproductible
</div>

<div class="pt-6 text-sm opacity-60">
Démarrer : <code>npm install && npm start</code> — Dossier : <code>Rendu/15-note-5-dossier.md</code>
</div>

### Questions

<!--
Clôture. Rappeler : chaque membre peut défendre chaque décision. Renvoyer aux preuves (tests, bench, contrat).
-->

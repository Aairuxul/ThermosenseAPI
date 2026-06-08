# bench/ — Harness de mesure réseau dégradé (Note 4)

Mesure le comportement de l'endpoint critique **`POST /v1/sensors/{sensorId}/measures`**
de ThermoSense **avant / après** application de mécanismes de résilience côté client,
sous réseau dégradé simulé. Sert de support reproductible à la **Note 4** ([`../Rendu/14-note-4.md`](../Rendu/14-note-4.md)).

## Reproduire les mesures

```bash
# Depuis la racine du dépôt. Aucune dépendance externe (Node ≥ 18, fetch natif).
node bench/run.js
```

Résultats écrits dans [`../Rendu/note4/results/`](../Rendu/note4/results/) :

| Fichier | Contenu |
| --- | --- |
| `results.json` | Métriques complètes (config, 3 scénarios × 3 variantes) |
| `summary.txt`  | Tableau compact lisible |
| `traces.json`  | Journal par opération logique (tentatives, retries, exécutions serveur) — **preuve** |
| `raw-server.log` | Sortie réelle du serveur ThermoSense pour les 9 passes — **preuve** |

Variable d'environnement utile : `BENCH_N` (nombre d'opérations logiques par passe, défaut 100).

## Méthodologie (résumé)

- **Latence** et **politique de timeout** client : injectées analytiquement par un middleware
  client (`degraded-client.js`) piloté par un **PRNG seedé** (mulberry32). Même seed
  (`20260608`) ⇒ mêmes tirages ⇒ **mêmes chiffres**. La dégradation est seedée *par opération*
  et indépendante de la variante : l'op *i* voit des conditions réseau identiques en
  `baseline`, `resilient` et `resilient+key` ⇒ comparaison contrôlée.
- **Effets serveur** (mesures persistées, **doublons**, statut HTTP) : **réels**, observés sur
  une instance ThermoSense fraîche démarrée pour chaque passe (seed mémoire remis à zéro).
- **Modèle de perte** : `request-loss` (la requête n'atteint pas le serveur) ou `response-loss`
  (le serveur exécute mais le client ne reçoit pas la réponse → cause des doublons sur retry).
- **Rate limiting désactivé** pendant le bench (`RATE_LIMIT_MAX`) pour isoler l'effet *réseau*
  du throttling serveur. Aucune modification du comportement de production (env-knob à défaut identique).

## Fichiers

- `degraded-client.js` — wrapper HTTP : injection de dégradation + mécanismes de résilience
  (timeout différencié, retry borné backoff+jitter, header `Idempotency-Key`).
- `run.js` — orchestrateur : boot serveur, login, passes, comptage des doublons, métriques.

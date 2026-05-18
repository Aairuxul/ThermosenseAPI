# Rapport d'audit — API review board

> Séance 6-7 — Document produit par le groupe **auditeur**

---

## En-tête

| Champ             | Valeur                                                          |
| ----------------- | --------------------------------------------------------------- |
| Groupe auditeur   | ThermosenseAPI                                                  |
| Membres auditeurs | Enzo, Kenza                                                     |
| Groupe audité     | groupe du fond                                                  |
| Date              | 2026-05-18                                                      |
| Contrat audité    | OpenAPI ☑ · WSDL ☐                                              |
| Référence contrat | Fichier : `ThermoSense_openapi.yaml` · Version : `1.0.0`        |
| Périmètre         | Contrat complet ☑                                               |

**Résumé en 2 phrases (contexte audité) :**

> ThermoSense est une API REST de supervision thermique (bâtiments tertiaires) avec une app mobile opérateurs et des équipements IoT comme consommateurs. Le contrat est globalement structuré mais présente des angles morts critiques pour mobile/IoT : idempotence non documentée, pagination absente sur l'historique de mesures, codes d'erreur sémantiquement incorrects.

---

## Synthèse checklist (12 critères)

| #   | Critère                   | Note |
| --- | ------------------------- | ---- |
| 1   | Naming cohérent           | ✓    |
| 2   | Verbes HTTP               | ✓    |
| 3   | Status codes              | ✗    |
| 4   | Erreurs structurées       | ~    |
| 5   | Paramètres typés          | ✗    |
| 6   | Schemas required          | ✓    |
| 7   | Exemples request/response | ~    |
| 8   | Versioning                | ✗    |
| 9   | AuthN / AuthZ             | ~    |
| 10  | Idempotence documentée    | ✗    |
| 11  | Pagination / filtrage     | ✗    |
| 12  | Limites / rate limiting   | ✗    |

| Compteur          | Valeur |
| ----------------- | ------ |
| ✗                 | 6      |
| ~                 | 3      |
| Dont **Bloquant** | 2      |
| Dont **Majeur**   | 3      |
| Dont **Mineur**   | 0      |

---

## Tableau des non-conformités

| #   | Fait observable (référence contrat) | Critère # | Impact consommateur (mobile / IoT) | Gravité | Suggestion de remédiation |
| --- | --- | --- | --- | --- | --- |
| 1 | `POST /buildings/{}/zones/{}/actuators/{}/commands` : pas de header `Idempotency-Key` ni description du comportement en cas de rejeu | #10 | Client mobile en retry après timeout réseau → double exécution de commande actionneur (cycle ON/OFF imprévu) | **Bloquant** | Documenter `Idempotency-Key`, code `409` pour rejeu divergent, fenêtre de déduplication serveur dans la `description` de l'opération |
| 2 | `GET /buildings/{}/zones/{}/sensors/{}/measurements` : aucun paramètre `limit`/`cursor`/`from`/`to` | #11 | Endpoint peut renvoyer ~525k points/an pour un capteur 1 mesure/min → OOM mobile, timeout, batterie | **Bloquant** | Ajouter `?from=&to=&limit=&cursor=` + pagination par cursor + champ `pagination` dans la réponse |
| 3 | `503` utilisé pour « Capteur hors ligne » et « Actionneur en maintenance » | #3 | 503 = service entier indisponible → le client mobile déclenche circuit breaker global pour une seule ressource défaillante | **Majeur** | Remplacer 503 par `409 Conflict` (état ressource incompatible) ; conserver `status: faulty/maintenance` dans la réponse 200 du GET |
| 4 | `components.parameters.{building,zone,sensor,actuator}Id` : tous `type: string` sans `pattern`/`format`/`minLength` | #5 | Validation absente → IDs invalides remontent en 404 générique, codegen client incapable de stricter | **Majeur** | Ajouter `pattern: "^[a-z]-[0-9]{3,}$"` + `400 Bad Request` distinct du 404 |
| 5 | `components.schemas.Errors` : `{ code, message, details[] }` non conforme RFC 7807 ; nom au pluriel pour un objet d'erreur | #4 | Pas d'identifiant URI stable côté client, impossible de brancher middlewares Problem Details standards | **Majeur** | Migrer vers RFC 7807 (`type`, `title`, `status`, `detail`, `instance`) ; renommer `Problem` ou `ApiError` ; servir en `application/problem+json` |

---

## Top 3 — priorités pour le groupe audité

### Priorité 1

- **Non-conformité #** : 1 (Idempotence sur `POST /commands`)
- **Pourquoi en priorité** : Risque sécurité physique. Sur retry réseau mobile, double commande actionneur observable en démo — scénario fil rouge mobile/IoT.
- **Effort estimé** : moyen

### Priorité 2

- **Non-conformité #** : 2 (Pagination sur `/measurements`)
- **Pourquoi en priorité** : Bombe à retardement. Endpoint inutilisable en production mobile dès que l'historique grossit.
- **Effort estimé** : moyen

### Priorité 3

- **Non-conformité #** : 3 (503 sémantiquement incorrect)
- **Pourquoi en priorité** : Trompe les clients qui implémentent un circuit breaker. Correction simple, gain immédiat.
- **Effort estimé** : faible

---

## Points positifs (au moins 2)

| #   | Point fort observé | Critère # | Pourquoi c'est utile pour l'intégrateur |
| --- | --- | --- | --- |
| 1 | Hiérarchie de ressources cohérente (`/buildings/{}/zones/{}/sensors/{}/measurements`) | #1 | Modèle mental clair, URLs prévisibles, codegen propre pour un SDK mobile |
| 2 | `operationId` présent sur toutes les opérations + `tags` cohérents | DX | Codegen client (openapi-generator, orval) produit des méthodes nommées correctement |
| 3 | Schemas Request/Response séparés + `BuildingPatchRequest` sans `required` + override `security: []` sur public | #6 / #9 | Évite les fuites de champs internes, sécurité explicite par opération |

---

## Points laissés hors périmètre ou non vérifiés

| Élément                | Raison                            |
| ---------------------- | --------------------------------- |
| Implémentation backend | Hors périmètre review board       |
| Tests de charge        | Non documenté dans le contrat     |
| Performance / SLA      | Non documenté dans le contrat     |

---

## Engagement de l'auditeur

- [x] Chaque ✗ du tableau est **vérifiable** dans le contrat cité
- [x] Aucune remarque ne se limite à une opinion (« pas clair ») sans fait
- [x] Les impacts sont formulés pour un client mobile/IoT, pas pour le serveur seul
- [ ] Le rapport a été remis au groupe audité (nom + heure : `[À REMPLIR à la remise]`)

**Signature / validation groupe auditeur :** ______________________

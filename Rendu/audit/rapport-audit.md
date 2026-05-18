# Rapport d'audit — API review board

> **Séance 6-7 (fusionnée)** — Document produit par le groupe auditeur  
> **Limite :** 1 page pour le tableau principal + synthèse (annexes courtes acceptées)  
> **Remise :** au groupe audité en fin de Phase 2 — sert de base à la Note 3 — L2 § 2.1

---

## En-tête

| Champ | Valeur |
|---|---|
| **Groupe auditeur Mattéo, Valentin, Tommy** | |
| **Membres auditeurs Mattéo, Valentin, Tommy** | |
| **Groupe audité Pierre, Alexandre, Lucas** | |
| **Date 18/05/2026** | |
| **Contrat audité** | OpenAPI |
| **Référence contrat** | Fichier : _______________ · Commit / version : _______________ |
| **Périmètre** | Contrat complet ☐ · Sous-ensemble : _______________ |

**Résumé en 2 phrases (contexte audité) :**  
_Domaine fil rouge, type de clients (mobile, IoT, B2B…), point d'attention principal relevé en review._

---

## Synthèse checklist (12 critères)

> Reprise des notes de `checklist_api_review_board.md`

| # | Critère | Note |
|---|---|---|
| 1 | Naming cohérent | ~ |
| 2 | Verbes HTTP | ✓ |
| 3 | Status codes | ✓ |
| 4 | Erreurs structurées | ~ |
| 5 | Paramètres typés | ✓ |
| 6 | Schemas required | ✓ |
| 7 | Exemples request/response | ~ |
| 8 | Versioning | ✓ |
| 9 | AuthN / AuthZ | ✓ |?
| 10 | Idempotence documentée | ✗ |
| 11 | Pagination / filtrage | ✓  |
| 12 | Limites / rate limiting | ✗ |

**Compteur de résultats :**

| Valeur | Compteur |
|---|---|
| ✗ — dont gravité **Bloquant** | |
| ~ — dont gravité **Majeur** | |
| - — dont gravité **Mineur** | |

---

## Tableau des non-conformités

> **Minimum attendu : 5 lignes complètes** si le contrat le permet.  
> **Règle :** chaque ligne = fait observable + critère # + impact consommateur mobile/IoT + gravité + suggestion actionnable.

| # | Critère # | Fait observable (référence contrat) | Impact consommateur (mobile / IoT) | Gravité | Suggestion de remédiation |
|---|---|---|---|---|---|
| 1 | Naming cohérent | Manque de coherence | aucune | Mineur | Tous mettre au pluriel |
| 2 | Erreurs structurées | On a pas les réponses précise | aucune | Mineur | Plus de détail sur les contracts |
| 3 | Exemples request/response | Manque de réponse dans les body | aucune | moyenne | écrire sur chaque route |
| 4 | | | | | |

---

## Top 3 — priorités pour le groupe audité

> Classez les 3 non-conformités les plus importantes à traiter avant la soutenance (S8-S9).

### Priorité 1

- **Non-conformité # : Exemples request/response**
- **Pourquoi en priorité : Elle permet de donner l'information des retours de données**
- **Effort estimé de correction sur le contrat :  moyen**

### Priorité 2

- **Non-conformité # :Erreurs structurées**
- **Pourquoi en priorité : Manque de détail sur les erreurs, elle peut amener à une perte de temps**
- **Effort estimé : moyen**

### Priorité 3

- **Non-conformité # : Naming cohérent**
- **Pourquoi en priorité : Manque de coherence entre pluriel et singulier**
- **Effort estimé : faible**

---

## Points positifs *(obligatoire — au moins 2)*

> Une review crédible nomme aussi ce qui fonctionne.

| # | Point fort observé | Critère # | Pourquoi c'est utile pour l'intégrateur |
|---|---|---|---|
| 1 | La structure global des endpoints en forme d'arboresence | #1 | Il peut juste lire de haut en bas au lieu et de trouver facilement l'endpoint qu'on a besoin.|
| 2 | Pagination documenté | #11 | Permet de savoir qu'elle endpoint nous permets d'être paginer |

---

## Points laissés hors périmètre ou non vérifiés

| Élément | Raison |
|---|---|
| Ex. Implémentation backend | Hors périmètre review board |
| Ex. Tests de charge | Non documenté dans le contrat |

---
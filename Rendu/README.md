# Documentation Technique - ThermosenseAPI

**Table des matières et guide de navigation**

## 📋 Sections principales

### 1. [Architecture et Ressources](01-architecture-ressources.md)
Hiérarchie des ressources, URIs et design des endpoints
- Hiérarchie complète (Building → Zone → Sensor/Actuator/AlertThreshold)
- Liste des endpoints principaux
- Carte des relations entre ressources

### 2. [Décisions de Design](02-decisions-design.md)
5 décisions majeures argumentées pour l'API
- Simplicité et concision des URLs
- Séparation buildings/zones
- Seuils d'alerte comme sous-ressource
- Query parameters pour pagination/filtres
- Token utilisateur en headers

### 3. [Matrice des Contraintes](03-matrice-contraintes.md)
Analyse des contraintes par endpoint et verbe HTTP
- Contraintes : Réseau (C1), Volumétrie (C2), Fiabilité (C3), Concurrence (C4)
- Codes HTTP et stratégies de réponse
- Gestion des doublons et erreurs

### 4. [Scénarios Critiques](04-scenarios-critiques.md)
Analyse détaillée de 2 cas d'usage complexes
- **Scénario A** : Commande dupliquée (réseau instable)
  - Idempotency-Key et gestion des requêtes en doublon
  - Séquence HTTP et réponses
- **Scénario B** : Conflit d'opérateurs (concurrence)
  - ETags et If-Match pour éviter les overwrites
  - Résolution de conflits d'accès simultané

### 5. [Threat Model et Menaces](05-threat-model.md)
Analyse de sécurité et identification des menaces
- DFD (Data Flow Diagram)
- 3 endpoints sélectionnés pour l'analyse
- Tableau des menaces (OWASP API Top 10 2025)
- Vraisemblance, impact, et risque résultant

### 6. [Risques Prioritaires](06-risques-prioritaires.md)
Priorisation et contre-mesures des 3 risques majeurs
- **Risque #1** : Injection (PUT /actuators, PUT /alert-thresholds)
- **Risque #2** : Broken Access Control (GET /sensors/{id}/measurements)
- **Risque #3** : Excessive Data Exposure + Volumétrie (GET /sensors/{id}/measurements)

### 7. [Évaluation et Hypothèses](07-evaluation.md)
Hypothèses, limites de périmètre et note d'auto-évaluation
- Points forts et faibles du design
- Hypothèses de renforcement
- Limites non couvertes
- Grille d'auto-évaluation

### 8. [Questions de cadrage](08-questions-cadrage.md)
Questions de cadrage du projet.

### 9. [Cartographie des vérifications](09-cartographie-verifications.md)
Cartographie des vérifications d'accès dans l'application.

### 10. [📌 Matrice d'Autorisations (RBAC/BOLA)](10-matrice-autorisations.md) ⭐
**Contrôle d'accès détaillé par rôle et ressource**
- Matrice des droits par rôle : Admin, Opérateur, Lecteur, Device IoT
- Cartographie des vérifications : où et comment valider l'accès
- Décisions ambiguës et justifications métier
- Scénarios de refus (403 vs 404), cas limites

### 11. [Note 3 — Architecture SOA/SOAP & Gouvernance API](11-note-3.md) ⭐
**Livrable complet de la Note 3**
- L1 — Cartographie système étendu + analyse intégrations + extrait WSDL (`BillingService`) + comparaison REST/SOAP
- L2 — Réponse à l'audit croisé (7 non-conformités traitées) + score qualité avant/après (4.5/8 → 8/8) + quality gate (Spectral + oasdiff)

Audit associé : `audit/audits-recus/rapport_audit_groupe1.docx` (audit reçu) · `audit/nos-audits/rapport-audit-produit.md` (audit produit par notre groupe).

### 12. [Quality gate API](12-quality-gate-api.md) ⭐
**Livrable Séance 6-7 — Phase 4B (graine Note 3 § 2.3)**
- 5 règles bloquantes (B1-B5) + 3 avertissements (W1-W3) au format « Si ... alors ... »
- Lint OpenAPI (Spectral) + tests de contrat (Schemathesis) + détection breaking change (`oasdiff`)
- Politique sécurité (no-secrets, securitySchemes, scan dépendances) + limites assumées du gate

### 13. [Remédiation express — Phase 3](13-remediation-express.md) ⭐
**Livrable Séance 6-7 — Phase 3 (réponse au rapport d'audit reçu)**
- 2 non-conformités Bloquantes traitées en séance : **NC #5 Versioning `/v1`** + **NC #6 Idempotence**
- Diff visible sur `contrat-openapi.yaml` (commits `2a1f340`, `3fe49b2`) + justification d'impact mobile/IoT
- Plan interséance : 5 NC restantes du rapport — toutes traitées avant la livraison Note 3

### 14. [Note 4 — Résilience mobile/IoT & mesures réseau dégradé](14-note-4.md) ⭐
**Livrable complet de la Note 4 (rendu début S8, avec la Note 3)** — *distinct de la Note 3 L2 (gouvernance)*
- Endpoint critique : `POST /v1/sensors/{id}/measures` — mesures **réelles & reproductibles** (`node bench/run.js`)
- §1 Plan de test (3 scénarios chiffrés, critères définis avant) · §2 Tableau avant/après (succès **82 %→100 %**, gel 8 s éliminé) · §3 Mécanismes retenus/écartés + volet sécurité · §4 Compromis
- **Résultat clé** : `Idempotency-Key` exigée au contrat mais **inerte** (serveur ne l'honore pas) → doublons mesurés (14 en réf. B) non éliminables côté client → correctif serveur à trancher
- Preuves : [`note4/results/`](note4/results/) · harness : [`../bench/`](../bench/)

---

## 🔗 Documentation associée

📌 **[Matrice d'Autorisations - RBAC et BOLA](10-matrice-autorisations.md)** ⭐ **DOCUMENT CLÉS**  
Contrôle d'accès basé sur les rôles (RBAC) et contrôle au niveau objet (BOLA)
- ✅ Matrice des droits par rôle (admin, opérateur, lecteur, device)
- ✅ Cartographie des vérifications (middleware, logique métier)
- ✅ Décisions ambiguës et justifications
- ✅ Tests complets couvrant 23 scénarios

---

## 📖 Comment naviguer

- **Lecteur découvrant le projet** : Commencez par [Architecture et Ressources](01-architecture-ressources.md)
- **Revue des décisions** : Consultez [Décisions de Design](02-decisions-design.md)
- **Sécurité et autorisations** : 🎯 **[Matrice d'Autorisations](10-matrice-autorisations.md)** (RBAC/BOLA, cas d'usage, tests)
- **Analyse de risques** : Allez à [Threat Model](05-threat-model.md) → [Risques Prioritaires](06-risques-prioritaires.md)
- **Implémentation** : Référence [Scénarios Critiques](04-scenarios-critiques.md) pour la gestion de cas complexes (Idempotency-Key, ETag)
- **Validation** : Voir [Évaluation](07-evaluation.md) pour les hypothèses et limites

---

## 📊 Vue d'ensemble rapide

| Section | Focus | Public |
|---------|-------|--------|
| Architecture | Endpoints, hiérarchie | Tous |
| Décisions | Design rationalisé | Architectes, leads |
| Matrice Contraintes | C1-C4, codes HTTP | Développeurs, DevOps |
| Scénarios | Idempotency-Key, ETag | Développeurs back-end |
| Threat Model | Menaces OWASP | Sec eng, leads |
| Risques Prioritaires | Priorisation, actions | Leads, product |
| **Autorisations ⭐** | **RBAC, BOLA, tests** | **Tous (clé)** |
| Évaluation | Bilan et hypothèses | Tous |

---

**Dernière mise à jour** : Avril 2026  
**Maintenu par** : Équipe SmartPark IoT


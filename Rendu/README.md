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

### 8. [📌 Matrice d'Autorisations (RBAC/BOLA)](matrice_autorisations.md) ⭐
**Contrôle d'accès détaillé par rôle et ressource**
- Matrice des droits par rôle : Admin, Opérateur, Lecteur, Device IoT
- Cartographie des vérifications : où et comment valider l'accès
- Décisions ambiguës et justifications métier
- Scénarios de refus (403 vs 404), cas limites

---

## 🔗 Documentation associée

📌 **[Matrice d'Autorisations - RBAC et BOLA](matrice_autorisations.md)** ⭐ **DOCUMENT CLÉS**  
Contrôle d'accès basé sur les rôles (RBAC) et contrôle au niveau objet (BOLA)
- ✅ Matrice des droits par rôle (admin, opérateur, lecteur, device)
- ✅ Cartographie des vérifications (middleware, logique métier)
- ✅ Décisions ambiguës et justifications
- ✅ Tests complets couvrant 23 scénarios

---

## 📖 Comment naviguer

- **Lecteur découvrant le projet** : Commencez par [Architecture et Ressources](01-architecture-ressources.md)
- **Revue des décisions** : Consultez [Décisions de Design](02-decisions-design.md)
- **Sécurité et autorisations** : 🎯 **[Matrice d'Autorisations](matrice_autorisations.md)** (RBAC/BOLA, cas d'usage, tests)
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


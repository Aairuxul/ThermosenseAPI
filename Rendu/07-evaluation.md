# 7. Évaluation et Hypothèses

## 📋 Compte rendu : Points forts et faibles

### ✅ Points forts du design

| Point fort | Impact |
|-----------|--------|
| **Codes erreurs normalisés** via structure `Error { code, message, details }` | Facilite intégration client, parsing d'erreurs |
| **Enums bien pensés** (units: °C/°F/%, roles: admin/operator/reader) | Type-safety, moins d'erreurs runtime |
| **Hiérarchie REST claire** (Building → Zone → Sensor/Actuator/Alert) | Intuitive pour devs + API clients |
| **Pagination pensée** pour éviter volumétrie | Protège serveur + UX mobile |
| **ETag + If-Match** pour concurrence | Évite overwrites silencieuses |
| **Idempotency-Key** pour réseau instable | Robuste sur connexions mobiles |

### ❌ Points faibles à corriger

| Point faible | Gravité | Impact | Correction |
|------------|---------|--------|-----------|
| **POST /buildings** : reste les coordonnées du système SmartPark (voitures) | 🟠 Moyen | Confusion métier, paramètres orphelins | Nettoyer schéma, documenter champs pertinents |
| **POST endpoints** : paramètres EN QUERY STRING au lieu du BODY | 🔴 **ÉLEVÉ** | Non-RESTful, sécurité (logs URI), caching fail | Migrer vers body `Content-Type: application/json` |
| **Schémas** : paramètres génériques en UUID (pas de validation domaine) | 🟠 Moyen | Accepter n'importe quel UUID même invalide | Ajouter vérification FK en base |
| **Endpoints measurements** : pas encore développés complet | 🟠 Moyen | POST measurements incomplet | Implémenter POST measurements avec validation |
| **Schema Error** : Oubli retrait `INVALID_COORDINATES` | 🟢 Faible | Remnants, confusion documentation | Supprimer du schéma, update OpenAPI |

---

## 🔧 Priorités de correction

### Semaine 1 : CRITIQUE

```javascript
// ❌ MAUVAIS (actuel)
POST /buildings
Query params : ?name=warehouse&lat=48.5&lng=2.3

// ✅ BON (cible)
POST /buildings
Content-Type: application/json
{
  "name": "warehouse",
  "latitude": 48.5,
  "longitude": 2.3
}
```

**Justification** : POST DOIT utiliser body (RFC 7231), pas query params

### Semaine 2 : IMPORTANT

```javascript
// Schema Error : Supprimer INVALID_COORDINATES
// Garder seulement : INVALID_INPUT, VALIDATION_ERROR, etc.

// Valider FK dans schéma
const buildingSchema = {
  id: UUID,
  name: string,
  // ... ajouter vérification EXISTS(buildings.id)
};
```

### Semaine 3 : MOYEN

```javascript
// Compléter POST /sensors/{id}/measurements
POST /sensors/123/measurements
{
  "value": 21.5,
  "unit": "°C",
  "quality": "good",  // Enum: good/fair/poor
  "timestamp": "2026-04-27T09:30:00Z"
}
```

---

## 📝 Hypothèses de renforcement

### H1 : Renforcer les contrôles d'accès

**Énoncé** : Il faut augmenter les vérifications d'accès sur tous les endpoints

**Justification** :
- Broken Access Control = OWASP A01:2025 (top risque)
- Teste seulement 3 endpoints, mais ALL 28 endpoints vulnérables si pas cohérent
- Risque : opérateur zone A voit mesures zone B

**Implication implémentation** :
- ✅ RBAC : 4 rôles + scopes (admin, operator, reader, device)
- ✅ BOLA : Vérifier zone/ressource sur CHAQUE endpoint (pas confiance middleware seul)
- ✅ Audit : Vérifier 100% des routes dans `src/routes/`

**Coût** : +40% de code (middleware + logique par handler)

---

### H2 : Contrôler les données reçues du front

**Énoncé** : Il faut valider 100% des inputs côté back

**Justification** :
- Injection SQL = risque CRITIQUE (accès BD complète)
- Front-end validation = pas de garantie (js peut être bypassé)
- Chaque endpoint `POST`/`PUT` potentiellement vulnerable

**Implication implémentation** :
- ✅ Schémas Joi/Yup sur tous les `POST`/`PUT`
- ✅ Whitelist de valeurs (enums)
- ✅ Limites métier (seuil alerte 0-100, température -50 à +50)
- ✅ Formats : UUID, ISO dates, emails, etc.

**Coût** : +50 lignes code par endpoint

---

### H3 : Définir des rôles et les respecter

**Énoncé** : Les rôles doivent être définis, centralisés et vérifiés

**Justification** :
- RBAC est base de toute sécurité API
- Actuellement pas clairement défini (admin/operator/reader/device)
- Risk : scope creep (lecteur qui modifie actuators)

**Implication implémentation** :
- ✅ Matrice RBAC : 4 rôles × 10 actions
- ✅ Scopes associés (ex: `sensors:read`, `actuators:write`)
- ✅ Vérifier chaque endpoint contre matrice
- ✅ Tester 4 rôles × 28 endpoints = 112 tests

**Coût** : 1 semaine + test matrix (112 cas)

---

## 🎯 Limites non couvertes (Périmètre)

### Périmètre de cet exercice : ❌ NON COUVERT

| Domaine | Raison non couvert | Impact | Si couvert |
|---------|------------------|--------|-----------|
| **Endpoints POST** | Analyse limitée aux 3 critiques | Autres POST endpoints peuvent avoir vulnérabilités similaires | Audit ALL 28 endpoints, pas juste 3 |
| **Endpoints DELETE** | Non inclus menaces | DELETE peut avoir race conditions ou révocation insuffisante | Ajouter soft-delete + audit trail |
| **Vérifications BD** | Pas considéré | BD peut avoir triggers/constraints qui modifient données | Audit schéma DB, audit logs |
| **Authentification** | Seulement JWT supposé | Comment JWT généré ? Shared secret vs RSA ? | Implémenter PKI, rotation keys |
| **Transport** | Suppose HTTPS | HTTP en clair = token interception | Force HTTPS + HSTS headers |
| **Mobile specifics** | Pas de token refresh, expiration | Token JWT peut être volé sur device | Ajouter refresh tokens + secure storage |
| **IoT specifics** | Devices M2M auth simplifiée | Compromised device = accès BD ? | Certificats x509, attestation hardware |
| **Rate limiting** | Pas de protection DDoS | Attaquant abuse API illimité | Implémenter rate limit + WAF |

---

## 📊 Grille d'auto-évaluation

### ✅ = OUI, ❌ = NON, 🟠 = PARTIEL

| Question | Réponse | Justification |
|----------|--------|---------------|
| Avons-nous considéré les spécificités mobile/IoT ? | ❌ **NON** | Pas mentionné token refresh, pas firmware firmware updates, pas réseau non-maîtrisé (4G cutoffs) |
| Chaque contre-mesure est-elle argumentée (pas seulement listée) ? | ✅ **OUI** | Chaque risque a section "Pourquoi prioritaire" + détails impact métier |
| Les compromis sont-ils explicites (sécurité vs perf vs UX) ? | ✅ **OUI** | Chaque contre-mesure liste "Compromis accepté" (complexité, latence, UX) |
| Y a-t-il au moins une menace liée à API retourne (pas juste accepte) ? | 🟠 **PARTIEL** | Excessive Data Exposure (GET) + Information Disclosure, mais pas reverse engineering, timing attacks |
| Nos 3 risques prioritaires justifiés par critères explicites ? | ✅ **OUI** | Matrice OWASP, vraisemblance × impact = risque |

**Score d'auto-évaluation** : 4/5 ✅

---

## 🎯 Recommandations pour suite

### Phase 2 (Après implémentation H1-H3)

1. **Pen testing** : OWASP ZAP / Burp Suite (trouver vulnérabilités résiduelles)
2. **Code review** : Security-focused review (pas juste style)
3. **Dependency audit** : `npm audit` pour vulnérabilités npm packages
4. **Monitoring** : Logs security events (failed auth, 403, injections détectées)
5. **Incident response** : Plan quoi faire si BD compromise

### Mobile-specific (Semestre 3)

1. **Token refresh** : Implémenter refresh tokens (courte durée access token)
2. **Secure storage** : Stocker JWT en secure enclave device (pas SharedPreferences)
3. **Certificate pinning** : Mobile check cert serveur (HTTPS + pinning)
4. **Device attestation** : Vérifier device genuine (Apple/Google attestation)

### IoT-specific (Semestre 3+)

1. **Device provisioning** : Générer certs x509 uniques par device
2. **Firmware updates** : Signed updates, rollback prevention
3. **Network isolation** : Devices sur VLAN séparé (pas accès LAN admin)
4. **Telemetry** : Monitorer behavior anormal (ex: device download 1GB data = compromised)

---

## 📚 Références et outils

### OWASP
- [OWASP Top 10 2025](https://owasp.org/Top10/)
- [OWASP API Top 10](https://owasp.org/www-project-api-security/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)

### Outils de test
- **OWASP ZAP** : Scanner de vulnérabilités automatisé (gratuit)
- **Burp Suite Community** : Intercepteur/debugger HTTPS (gratuit)
- **Postman** : API testing avec scripts de sécurité
- **npm audit** : Audit dépendances npm

### Validation
- **Joi** : Schéma validation (JS)
- **Yup** : Alternative Joi
- **Zod** : TypeScript-first validation

### Monitoring
- **Winston** : Logging framework (Node.js)
- **Sentry** : Error tracking + security alerts
- **ELK Stack** : Elasticsearch + Logstash + Kibana pour centralized logs

---

## ✋ Conclusion

Le design de l'API est **solide sur papier**, mais **l'implémentation reste clé** :

### Court terme (Semaine 1-2)
- 🔴 **URGENT** : Migrer POST vers body (non-RESTful sinon)
- 🔴 **URGENT** : RBAC + BOLA sur tous endpoints
- 🔴 **URGENT** : Validation input (Joi) sur POST/PUT

### Moyen terme (Semaine 3-4)
- 🟠 **Important** : Pen testing + fix findings
- 🟠 **Important** : Audit BD + audit logs
- 🟠 **Important** : Documentation sécurité (pour revue)

### Long terme (Après)
- 🟢 **Recommandé** : Token refresh, secure storage mobile
- 🟢 **Recommandé** : Device provisioning, firmware updates
- 🟢 **Recommandé** : Rate limiting + WAF

**Risque actuel** : **ÉLEVÉ** (sans implémentation H1-H3)  
**Risque après implémentation** : **FAIBLE** (avec monitoring)

---

## Prochaines étapes

👉 [Retour au README](README.md) - Guide complet de la documentation

---

**Dernière mise à jour** : Avril 2026  
**Document** : Évaluation et recommandations - ThermosenseAPI  
**Auteurs** : Équipe SmartPark IoT


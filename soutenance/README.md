# Soutenance — Slidev

Support de soutenance (≤ 12 slides) pour la commission d'architecture (Note 5).
Source : [`slides.md`](./slides.md). Structure imposée : contexte → démonstration → sécurité →
résilience → limites & bilan.

## Lancer en local

Le plus simple (sans rien installer durablement) :

```bash
cd soutenance
npx @slidev/cli slides.md
# → ouvre http://localhost:3030  (flèches pour naviguer, "o" pour la vue d'ensemble)
```

Ou avec installation dans ce dossier :

```bash
cd soutenance
npm install
npm run dev          # serveur de présentation (http://localhost:3030)
```

## Mode présentateur (notes orateur)

Chaque slide contient des **notes de porte-parole** (commentaires en bas de slide). Vue présentateur :
<http://localhost:3030/presenter> — utile pour la **rotation des porte-paroles** exigée en commission.

## Exporter en PDF (pour projeter sans serveur)

```bash
cd soutenance
npm install
npm run export       # → thermosense-soutenance.pdf  (installe playwright-chromium au 1er run)
```

> Si l'export demande un navigateur : `npx playwright install chromium` puis relancer.

## Rappels commission

- Maîtriser ce qu'on montre : savoir s'arrêter sur un slide pour expliquer un détail.
- **Rotation** : tout membre peut défendre toute décision (slide 3 = aiguillage).
- Repli démo : logs de fallback + `npm run bench` (mesures reproductibles).

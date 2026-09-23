# Pulse

Expérience visuelle three.js : blob métaball monochrome audio-réactif.

## Concept

Blob monochrome blanc froid (`#E8EDF2`) sur fond sombre (`#0A0A0E`) qui :
- se fracture/cristallise sur montée d'énergie audio (déformation de surface, pas d'objet séparé)
- se dissout localement en particules sur les pics extrêmes, puis se reforme
- déclenche une aberration chromatique + accents colorés dynamiques proportionnels à l'amplitude/fréquence

Interaction : rotation auto continue, drag/touch orbite la caméra autour du blob.
Audio : micro live via Web Audio API (FFT graves/aigus séparés pour piloter fracture vs aberration).

## Étapes

- [x] **Étape 1** — preview statique : blob monochrome au repos + rotation auto (validation du look)
- [ ] Étape 2 — audio-réactivité (FFT, fracture/cristallisation)
- [ ] Étape 3 — dissolution en particules sur les pics
- [ ] Étape 4 — aberration chromatique + accents colorés
- [ ] Étape 5 — interaction drag/touch

## Dev

```
npm install
npm run dev
```

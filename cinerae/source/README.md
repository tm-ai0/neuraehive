# CINERÆ

Prototype NeuraeHive : système de ~200 000 particules WebGPU piloté par la
webcam (flux optique basse résolution → vent) et le micro (état de la matière).
Sert de banc d'essai pour la lib [vgpu](https://vgpu.sh) (vercel-labs).

## Lancer

```sh
npm install   # une seule fois
npm run dev
```

Puis ouvrir http://localhost:5183 dans un navigateur WebGPU (Chrome/Edge/Brave).

## Concept

- La caméra n'est **jamais affichée**. Un champ de flux optique 192×108
  (Lucas-Kanade un point, lissé temporellement) pousse les particules comme du
  vent — il ne les attire pas.
- Le micro pilote l'état de la matière : silence prolongé → les grains
  cristallisent lentement vers une grille et prennent la luminance caméra
  (empreinte figée) ; le son fait fondre le cristal. Basses → pression du
  vent, aigus → turbulence (curl de bruit simplex), transitoires → frange
  spectrale RGB au present + secousse des grains.
- Esthétique : poussière blanc chaud additive sur noir profond, trainées
  légères par ping-pong de cibles HDR, grain anti-banding.
- Caméra et micro démarrent **uniquement sur clic**. Caméra refusée → mode
  audio seul (l'empreinte de cristallisation devient procédurale). Micro
  refusé → matière libre non réactive.

## Pipeline GPU (vgpu)

1. `copyExternalImageToTexture` : frame caméra → texture (jamais rendue).
2. Effet `luma` : caméra → luminance 192×108 (miroir + cover-crop).
3. Effet `flow` : deux lumas successives → champ (rg = vent, b = empreinte,
   a = énergie), ping-pong.
4. Compute `simulate` (workgroup 256) : intégration des 50 k–400 k particules
   dans un `pingPongStorage`, vent + curl-noise + cristallisation.
5. Rendu instancié (6 sommets × N, blend additif one/one) dans une cible de
   trainées ping-pong, précédé d'un effet de fondu.
6. Effet `present` : tonemap exponentiel, teinte chaude, vignette, frange RGB
   proportionnelle au transitoire, dither.

## Réglages

Panneau à l'écran : force, viscosité, turbulence, seuil de cristallisation
(niveau RMS en dessous duquel le silence compte), qualité (50 k / 120 k /
200 k / 400 k particules) + compteur FPS et jauge de cristal. Calibré pour un
laptop RTX 4060 : 200 k par défaut, 400 k tient le vsync.

## État / non vérifié

- Vérifié sur cette machine : rendu 200 k et 400 k particules à 60 fps
  (plafond vsync), panneau, changement de qualité à chaud, mode sans capteurs.
- Non vérifié automatiquement (permissions navigateur requises) : chemins
  caméra et micro en conditions réelles — à tester à la main au premier
  lancement.

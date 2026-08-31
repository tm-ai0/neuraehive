# CINERÆ

Pièce audiovisuelle NeuraeHive : ~200 000 particules WebGPU pilotées par la
webcam (flux optique basse résolution → vent) et le micro (état de la
matière). Sert de banc d'essai pour la lib [vgpu](https://vgpu.sh)
(vercel-labs).

## Lancer

```sh
npm install   # une seule fois
npm run dev
```

Puis ouvrir http://localhost:5183 dans un navigateur WebGPU (Chrome/Edge/Brave).

## L'ouverture

Au chargement, les particules convergent depuis le chaos et cristallisent le
wordmark CINERÆ — première cristallisation de la pièce. Les tracés SVG du
wordmark sont échantillonnés en 2 048 points cibles (via la mesure de chemin
native du navigateur), chaque grain condensant sur un point avec un léger
écart le long de la normale du trait. Le texte d'intro et les deux choix
s'affichent sous le titre ; dès qu'un choix est fait, tout se dissout (une
secousse aléatoire re-thermalise l'amas) et la matière reprend ses droits.

Après 40 s d'inactivité totale (pas de son au-dessus du seuil, pas de
mouvement caméra — sondé par lecture GPU du champ de flux —, pas
d'interaction), le titre se recompose lentement de lui-même, et fond au
premier signe de vie. Pendant que le mot prend, il apaise le vent, la
turbulence et les transitoires (facteur « calm » dans le shader), et fait
fondre l'empreinte caméra.

## Le concept

- La caméra n'est **jamais affichée**. Un champ de flux optique 192×108
  (Lucas-Kanade un point, lissé) pousse les particules comme du vent — il
  n'attire jamais. Toggle miroir dans le panneau.
- Le micro pilote l'état de la matière : silence prolongé → cristallisation
  vers l'empreinte de luminance caméra ; le son la fait fondre. Basses →
  pression du vent, aigus → turbulence, transitoires → frange spectrale RGB
  (teinte réglable) + secousse. L'analyseur coupe son plancher de bruit à
  −72 dB pour qu'un silence réel lise zéro.
- Esthétique : poussière blanc chaud additive sur noir profond, trainées par
  ping-pong HDR, grain anti-banding.
- Capteurs **uniquement sur geste explicite** (boutons d'intro ou toggles du
  panneau). Caméra refusée → mode audio seul (empreinte procédurale). Micro
  refusé → matière libre.

## Panneau (repliable ; bottom-sheet sur mobile)

Trois modes en tête : **Non-initié** (intensité, calme→tempête, qualité
auto), **Curieux** (+ force, viscosité, turbulence, trainées, seuil de
silence, teinte de la frange), **Pro** (+ taille des grains, nombre exact de
particules, exposition, gains basses/aigus/transitoires, overlay du champ de
vent en voiles chauds). Plus : toggles caméra/micro/miroir, **Chaos**
(aspiration du vent inversé ~0,7 s puis burst de turbulence décroissant),
**Reset** (matière re-semée + réglages), FPS, statut, jauge de cristal.

Tous les réglages agissent immédiatement : les buffers sont alloués une fois
à 400 k particules, le nombre vivant n'est qu'un uniform + un nombre
d'instances par appel de draw — aucune reconstruction, aucune latence.

Mobile : le panneau devient une bottom-sheet à poignée large (52 px), cibles
tactiles ≥ 44 px, sliders à 16 px (pas de zoom iOS). Qualité auto par défaut
sur écran tactile : paliers 50 k/120 k/200 k/400 k selon les fps mesurés.
Maintenir le doigt sur la scène émet de la poussière sous le doigt.

## Pipeline GPU (vgpu)

1. `copyExternalImageToTexture` : frame caméra → texture (jamais rendue).
2. Effet `luma` : caméra → luminance 192×108 (miroir + cover-crop).
3. Effet `flow` : deux lumas → champ (rg = vent, b = empreinte, a = énergie).
4. Compute `simulate` (workgroup 256) : vent + curl simplex + cristallisation
   + cibles wordmark (storage buffer) + chaos + émission tactile, dans un
   `pingPongStorage` de 400 k × 16 o.
5. Rendu instancié additif (6 sommets × N) dans les trainées ping-pong,
   précédé du fondu.
6. Effet `present` : tonemap, teinte chaude, vignette, frange RGB sur
   transitoires (teinte réglable), overlay de vent optionnel, dither.

## État / vérifié · non vérifié

Vérifié sur cette machine (RTX 4060, et fenêtre secondaire sur iGPU Intel) :
formation du wordmark à l'ouverture, dissolution au choix, recomposition
automatique après inactivité et fonte au premier signe de vie, bouton Chaos,
trois modes du panneau, changement de nombre de particules sans
reconstruction, layout bottom-sheet (styles forcés équivalents à la media
query). Non vérifié automatiquement : chemins caméra réels (permissions
navigateur à accorder à la main), panache d'émission tactile en conditions
réelles, media query mobile sur un vrai écran étroit — à tester à la main.

Note : dans une fenêtre en arrière-plan, le navigateur suspend
`requestAnimationFrame` ; la pièce est simplement en pause, c'est normal.

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
wordmark « cineræ » — première cristallisation de la pièce. La typographie est
définitive : Ephesis (embarquée localement dans `src/assets/fonts/`, aucune
dépendance réseau au runtime), redressée de 8° (skewX inverse de l'italique),
trait nourri de 1,1 px au rendu de référence 88 px, groupe « neræ » rapproché
de 4 px pour effacer l'accro entre le i et le n. Le lettrage exact est rendu
sur un canvas offscreen sur-échantillonné ×3 et 4 096 points cibles sont
prélevés sur l'encre elle-même (pondérés par la couverture, normale locale par
gradient d'alpha) — le titre cristallisé est ce dessin-là en poussière, à
toutes les tailles d'écran. Le texte d'intro et les deux choix s'affichent
sous le titre ; dès qu'un choix est fait, tout se dissout (une secousse
aléatoire re-thermalise l'amas) et la matière reprend ses droits.

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
  −72 dB pour qu'un silence réel lise zéro. Couper le micro relâche le
  cristal : sans oreille, pas de silence à entendre.
- **Cycle de vie de la matière** : une particule naît braise (lueur orange
  brève — seule extension de palette autorisée, jamais un décor) sur un
  transitoire audio fort, refroidit vers le blanc chaud, vieillit en cendre
  plus sombre et plus lente, sédimente dans un lit périphérique (~15 % de la
  population, réglable), puis se rallume doucement sur place. Un mouvement
  caméra vigoureux remue le lit local et ranime quelques braises ; le
  transitoire audio, lui, ne réveille jamais la cendre.
- **Le repos n'est jamais un rectangle** : au calme, la poussière condense
  sur les lignes de niveau zéro d'un bruit lent et dérivant (limaille de fer
  sur un aimant qui bouge) et glisse le long de ces filaments ; toutes les
  10 à 20 s une rafale plie tout dans le même sens puis s'éteint.
- **Cymatique** : quand un son tenu domine (note, drone, voix chantée —
  détection de hauteur YIN + clarté de périodicité), la poussière s'aligne
  progressivement sur les lignes nodales d'une figure de Chladni dont les
  modes (m, n) suivent la hauteur par paliers d'environ une tierce, avec
  hystérésis anti-vibrato ; le motif se dissout dès que le son cesse ou
  devient percussif. Un geste caméra très rapide arrache quelques comètes à
  longue traîne (étirées le long de leur vitesse) qui refroidissent en vol et
  retombent en cendre.
- Esthétique : poussière blanc chaud additive sur noir profond, trainées par
  ping-pong HDR, grain anti-banding.
- Capteurs **uniquement sur geste explicite** (boutons d'intro ou toggles du
  panneau). Caméra refusée → mode audio seul (empreinte procédurale). Micro
  refusé → matière libre.

## Panneau (repliable ; bottom-sheet sur mobile)

Trois modes en tête : **Non-initié** (intensité, calme→tempête, qualité
auto), **Curieux** (+ force, viscosité, turbulence, trainées, seuil de
silence, teinte de la frange, braises, cymatique, respiration), **Pro**
(+ taille des grains, nombre exact de particules, exposition, gains
basses/aigus/transitoires, part de cendre, cycle de la matière,
sédimentation, filaments, seuil tonal, comètes, overlay du champ de vent en
voiles chauds). Plus : toggles caméra/micro/miroir, **Chaos**
(aspiration du vent inversé ~0,7 s puis burst de turbulence décroissant),
**Reset** (matière re-semée + réglages), FPS, statut, jauge de cristal.

Tous les réglages agissent immédiatement : les buffers sont alloués une fois
à 400 k particules (32 octets chacune : position/vitesse + chaleur, âge,
état comète), le nombre vivant n'est qu'un uniform + un nombre d'instances
par appel de draw — aucune reconstruction, aucune latence.

Mobile : le panneau devient une bottom-sheet à poignée large (52 px), cibles
tactiles ≥ 44 px, sliders à 16 px (pas de zoom iOS). Qualité auto par défaut
sur écran tactile : paliers 50 k/120 k/200 k/400 k selon les fps mesurés.
Maintenir le doigt sur la scène émet de la poussière sous le doigt.

## Pipeline GPU (vgpu)

1. `copyExternalImageToTexture` : frame caméra → texture (jamais rendue).
2. Effet `luma` : caméra → luminance 192×108 (miroir + cover-crop).
3. Effet `flow` : deux lumas → champ (rg = vent, b = empreinte, a = énergie).
4. Compute `simulate` (workgroup 256) : vent + curl simplex + cycle de vie
   (braise/cendre/sédiment) + filaments de repos + rafales + cymatique de
   Chladni (analytique) + comètes + cristallisation + cibles wordmark
   (storage buffer) + chaos + émission tactile, dans un `pingPongStorage` de
   400 k × 32 o.
5. Rendu instancié additif (6 sommets × N) dans les trainées ping-pong,
   précédé du fondu ; teinte braise et étirement des comètes par instance.
6. Effet `present` : tonemap RGB (les trainées portent la couleur), teinte
   chaude, vignette, frange RGB sur transitoires (teinte réglable), overlay
   de vent optionnel, dither.

## État / vérifié · non vérifié

Vérifié sur cette machine (session v0.3, fenêtre Brave, 186–272 fps à 200 k
grains) : formation du wordmark Ephesis à l'ouverture (fidèle au lettrage de
référence), dissolution au choix, recomposition après inactivité ; repos en
filaments de fumée sans aucun rectangle ; part de cendre mesurée par lecture
GPU à ~18 % avec sédimentation vers les bords et renaissance douce ;
cristallisation sous silence micro réel (et relâchement à la coupure du
micro) ; force de Chladni vérifiée en forçant l'enveloppe (figure nette
m=3, n=5) ; détection de hauteur validée hors navigateur (sinus 110–880 Hz
justes au cent près, harmoniques comprises, bruit rejeté) ; braises orange
éparses sur transitoire forcé (jamais un décor, la cendre ne se rallume pas
au son) ; trois modes du panneau avec les nouveaux réglages à effet
immédiat.

Non vérifié en conditions réelles, à tester à la main : la cymatique sous un
vrai son tenu (voix, note — la chaîne micro→hauteur→figure n'a pas pu être
exercée de bout en bout, les haut-parleurs de test étant restés muets), les
braises sous vraie percussion, les comètes et le remous du lit de cendres
sous vrai geste caméra, le panache tactile, la media query mobile sur écran
étroit.

Note : dans une fenêtre en arrière-plan, le navigateur suspend
`requestAnimationFrame` ; la pièce est simplement en pause, c'est normal.

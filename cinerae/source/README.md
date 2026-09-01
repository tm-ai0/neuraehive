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
  (Lucas-Kanade un point) nourrit un **champ de vent à mémoire** : le vent
  s'advecte lui-même (semi-lagrangien), ses remous sont resserrés par
  confinement de vorticité, il meurt lentement (~1,5–2 s), et l'injection est
  non linéaire (quadratique en vitesse) — un geste rapide commande le champ,
  une dérive lente chuchote. Les grains ne subissent pas une poussée aveugle
  mais une **traînée vers la vitesse du vent local** (poussière dans l'air) :
  une main qui balaie emporte la matière derrière elle avec un léger retard,
  et le courant continue de porter une à deux secondes après le passage.
  Toggle miroir dans le panneau.
- **Aucun bord n'est perceptible** : la simulation vit sur un domaine étendu
  de ±8,5 % hors champ ; sortie et ré-entrée se font hors écran, et le lit de
  cendre se dépose à cheval sur le bord, principalement hors cadre.
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
  longue traîne : l'étirement suit la vitesse mais **sature**, la lumière se
  répartit sur la longueur (jamais une barre cramée), tête brillante et queue
  qui s'éteint ; elles refroidissent en vol et retombent en cendre.
- La turbulence est un **curl simplex à trois octaves dérivantes**, corrigées
  de l'aspect : la plus grande structure dépasse la largeur de l'écran et
  chaque octave glisse à sa propre vitesse dans l'espace et le temps — de la
  fumée, jamais une grille de tourbillons repérable.
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
voiles chauds, interrupteur **« retour du titre »** — actif par défaut, il
autorise la recomposition du wordmark après 40 s de vrai silence sans geste
caméra ; coupé, le titre ne revient jamais tout seul). Plus : toggles
caméra/micro/miroir, **Chaos** (aspiration du vent inversé ~0,7 s + burst de
turbulence décroissant, et tirage de nouvelles valeurs pour les curseurs
matière — force, viscosité, turbulence, trainées, respiration, filaments,
comètes, braises — qui **glissent vers leurs cibles** avec une animation
courte et décalée et une surbrillance brève), **Reset** (matière re-semée,
curseurs qui glissent de la même façon vers les défauts), FPS, statut, jauge
de cristal.

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
3. Effet `flow` : deux lumas + champ précédent → champ à mémoire (rg = vent
   auto-advecté + confinement de vorticité + décroissance lente + injection
   non linéaire du flux optique, b = empreinte, a = énergie). Le renderer
   attend deux vraies frames luma avant de déclarer la caméra au champ, pour
   ne jamais ingérer une comparaison contre une texture jamais rendue.
4. Compute `simulate` (workgroup 256) : entraînement par le vent (traînée
   vers la vitesse locale) + curl simplex 3 octaves + cycle de vie
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

Vérifié sur cette machine (session v0.4, fenêtre Edge Beta, caméra
synthétique injectée — blob lumineux balayant un canvas capturé en
`captureStream`) : le geste emporte la poussière — champ mesuré par lecture
GPU : zéro exact au repos sur caméra statique (aucune auto-excitation),
pic à 0,8 pendant un balayage de 0,7 s, direction cohérente avec le miroir,
décroissance du courant sur ~2 s après le passage ; visuellement la bande
balayée est peignée dans le sens du geste, la matière suit avec retard et
le sillage roule en tourbillons (confinement de vorticité) ; comètes en
filaments effilés à toutes les vitesses testées, plus aucune barre ;
turbulence sans maille visible à turbulence 2,0 / viscosité 0,6 sous
agitation, structures plus larges que l'écran ; aucun bord perceptible au
repos ni en mouvement (zooms sur les quatre bords) ; retour du titre après
40 s d'immobilité réelle, fonte au premier geste, interrupteur Pro qui le
bloque, Reset qui le réactive ; Chaos et Reset font glisser les curseurs
avec décalage et surbrillance, valeurs vérifiées en mouvement entre deux
captures ; fps identiques à v0.3 dans les mêmes conditions (110–130 contre
108–124 à 200 k grains, écran d'intro).

Hérité de v0.3 et toujours valable : wordmark Ephesis fidèle, cendre ~18 %
mesurée, cristallisation sous silence micro réel, Chladni forcé net,
détection de hauteur validée hors navigateur, braises éparses sur
transitoire forcé.

Non vérifié en conditions réelles, à tester à la main devant la vraie
caméra : la sensation du geste réel (main, manche, corps — la caméra
synthétique n'a qu'un seul blob très contrasté, un vrai flux est plus
bruité et plus doux : les seuils d'injection quadratique et de couplage
peuvent demander un ajustement fin) ; les comètes et le remue-cendre sous
vrai geste ; la cymatique sous vrai son tenu ; les braises sous vraie
percussion ; le panache tactile ; mobile réel.

Note : dans une fenêtre en arrière-plan, le navigateur suspend
`requestAnimationFrame` ; la pièce est simplement en pause, c'est normal.

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

## Les empreintes (v0.5)

Le mécanisme du titre est généralisé en une **bibliothèque d'empreintes** :
un seul buffer de cibles GPU (16 384 points max, vec4 = position + normale),
rempli par un échantillonnage CPU une fois par sélection — une empreinte ne
coûte rien à l'image une fois échantillonnée. Le titre n'est plus qu'une
empreinte parmi d'autres (celle par défaut). Chaque empreinte se comporte
comme le titre : **le silence y cristallise la matière** (enveloppe cristal
redirigée vers les cibles de la forme), le son la fait fondre, le geste
l'érode, et **une personne qui traverse la forme l'efface là où elle passe**
(l'énergie de mouvement locale coupe la tenue du grain, le vent l'emporte ;
le silence reconstruit ensuite).

Familles : **fond simple** (aucune empreinte, cristallisation coupée,
réactivité caméra/son réduite à ~25 % — veille d'installation) ; **volumes
3D** en rotation lente (sphère filaire, cube, cône, tore — ré-échantillonnés
à ~7 Hz avec un hash déterministe par indice, sans quoi les cibles sautent
et la forme s'effondre en blob) ; **formes 2D** (cercle, anneau, carré,
croix, spirale, étoile) ; **math** (Lissajous animé, attracteur de De Jong,
Chladni figée plein écran, arbre récursif) ; **ondes** (sinus / triangle /
carré adouci / superposition, fréquence, amplitude, épaisseur, nombre,
dérive de phase — paramètres exposés proprement pour la matrice de
modulation et le MIDI à venir) ; **texte libre** en Ephesis (même recette
typo que le titre, points triés par x → cristallisation **lettre à
lettre** via l'échelonnement par rang dans le shader) ; **image importée**
(SVG/PNG/JPG par bouton ou glisser-déposer, masque alpha×luminance avec
auto-inversion sombre-sur-clair, tout reste local) ; **caméra** — « image
gelée » (le comportement historique : le silence fige l'image de luminance
en grille) et « silhouette » (l'empreinte de luminance est relue du GPU,
pondérée contour + remplissage ; la personne recule, la forme reste) ;
**multi** (2 à 9 formes semées aléatoirement, tailles variées) ; et un mode
**aléatoire au long silence** (nouvelle empreinte toutes les ~24 s de
silence continu, transition par glissement des cibles — un morphing, jamais
une coupure). Chaos tire aussi une empreinte au hasard une fois sur deux ;
Reset ramène le titre.

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
  Un **gain adaptatif** égalise le ressenti entre une main à 40 cm et une
  personne entière à 2–3 m : la fraction de l'image réellement en mouvement
  (statistique d'aire, robuste à la distance) module l'injection — petite
  silhouette lointaine boostée jusqu'à ×4, main proche laissée à ×1 — avec
  un retour lent vers la neutralité quand la scène se vide. Multiplicateur
  manuel « gain du geste » en Pro. Toggle miroir dans le panneau.
- **Aucun bord n'est perceptible** : la simulation vit sur un domaine étendu
  de ±8,5 % hors champ ; sortie et ré-entrée se font hors écran, et le lit de
  cendre se dépose à cheval sur le bord, principalement hors cadre.
- Le micro pilote l'état de la matière : un vrai silence prolongé **sans
  geste caméra ni toucher** → cristallisation vers l'empreinte choisie (le
  titre par défaut ; l'empreinte de luminance caméra reste disponible via
  « caméra · image gelée ») ; le son la fait fondre, un geste remet le
  compte à rebours à zéro sans faire fondre la forme (seule l'érosion
  locale agit pendant le jeu). La durée de silence requise est réglable en
  Pro (défaut 2 s). Basses →
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

Le panneau porte une section **empreintes** compacte : Non-initié voit six
chips soignées (titre, fond, sphère, étoile, spirale, ondes) ; Curieux voit
les familles, les variantes, le texte libre, le multi et l'interrupteur
aléatoire ; Pro ajoute l'import d'image et les paramètres fins par famille
(onde : fréquence/amplitude/épaisseur/nombre/dérive ; multi :
nombre/taille ; volume : rotation ; lissajous : a/b), qui n'apparaissent
que quand la famille est active.

## Panneau (repliable ; bottom-sheet sur mobile)

Trois modes en tête : **Non-initié** (intensité, calme→tempête, qualité
auto), **Curieux** (+ force, viscosité, turbulence, trainées, seuil de
silence, teinte de la frange, braises, cymatique, respiration), **Pro**
(+ taille des grains, nombre exact de particules, exposition, gains
basses/aigus/transitoires, part de cendre, cycle de la matière,
sédimentation, filaments, seuil tonal, comètes, gain du geste, durée du
silence, interrupteur
**« retour de l'empreinte »** — actif par défaut, il autorise la
recristallisation au silence et la recomposition complète après 40 s
d'immobilité ; coupé, la matière ne revient jamais toute seule). Plus : toggles
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

Vérifié sur cette machine (session v0.5, Edge via l'extension, caméra
synthétique — figure debout + blob balayable — et micro synthétique
silencieux avec oscillateur commandable) : le silence cristallise le titre
par l'enveloppe cristal (nouveau comportement par défaut) ; sphère filaire
et tore en rotation continue après le correctif du hash déterministe par
indice ; étoile, attracteur de De Jong, Chladni figée, arbre récursif,
trois sinus dérivants, multi 4 formes — tous nets au rendu avec leur duvet
de poussière ; texte « poussière » cristallisé lettre à lettre (capture à
mi-course : « pouss » net, « ière » en nuage) ; image PNG importée par le
sélecteur programmatique (croissant alpha) devenue masque ; silhouette
figée qui reste après le départ de la personne, miroir cohérent ; image
gelée = pointillisme de luminance v0.4 conservé ; traversée de la
silhouette qui emporte l'étoile tenue puis reformation complète au silence ;
aléatoire au long silence (deux tirages observés à 24 s d'écart, morphing
par glissement) ; Chaos qui tire une empreinte une fois sur deux (observé) ;
Reset qui ramène le titre ; aucune erreur console ; 61-69 fps constants à
200 k et 62 fps à 400 k grains (plafond vsync de l'écran, la charge n'est
pas le facteur limitant).

Non vérifié en v0.5, à tester à la main : le glisser-déposer réel d'un
fichier depuis l'explorateur (le chemin File → masque est vérifié, pas les
événements drag du vrai OS) ; la silhouette et l'effacement au passage avec
une vraie personne devant la vraie caméra ; les variantes non capturées
(cube, cône, cercle/anneau/carré/croix isolées, triangle/carré/mélange des
ondes, Lissajous à l'écran) qui partagent leurs générateurs avec des
variantes vérifiées ; le panneau empreintes sur mobile réel.

Hérité de v0.4 (session Edge Beta, caméra synthétique, fenêtre Edge Beta, caméra
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

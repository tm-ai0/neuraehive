# Cineræ

Poussière de lumière WebGPU pilotée par la caméra (flux optique) et le son (micro). Pièce de la page experiments du site NeuraeHive et instrument d'installation (personnes debout à 2 ou 3 m).

## Lancer
npm run dev, puis l'adresse affichée. Ajouter ?debug à l'adresse pour lire les mesures du geste (m/a/g/c/s/p/h/v dans document.documentElement.dataset.cinerae ; p = enveloppe de présence, h = mains, v = voix). Vérification au rendu réel : Claude in Chrome sur Edge, captures dans .debug (dans .gitignore, jamais commité).

## Invariants
- 400 000 grains sous qualité auto (v0.7.1 : 90 fps et plus, plafonné par l'écran, palier auto jamais descendu). Toute feature qui coûte à l'image est refusée.
- La caméra n'est jamais affichée. Le fantôme caméra est une option Pro, désactivée par défaut.
- Tout reste local : scènes, captures, images importées. Rien n'est envoyé.
- Panneau trois modes : Umbra (un curseur moi ◀▶ le monde + teintes), Anima (cinq questions), Pro (tout). Pas de mur de réglages. Tout texte visible passe par le dictionnaire FR/EN (src/i18n.ts) ; les curseurs nomment des effets visibles, jamais des sources.
- Le touch reste, le MIDI s'ajoute.
- Le registre de réglages (panel.ts, defs) est la seule porte : tout réglage existant ou futur y entre, avec son drapeau Chaos (plage + snap éventuel). Presets, crossfade, matrice, MIDI et Chaos ne passent que par lui — jamais de réglage hors registre.
- Le crossfade A ↔ B est continu de bout en bout : les anciens choix (fusion, symétrie, pilote de couleur, couche nette) sont des quantités fractionnaires que les shaders mélangent ; ce qui reste vraiment discret (une matière, une scène) se fond par un mélange de rendu sur la durée du crossfade (paire de matières + mélange stochastique par grain), jamais par un saut à 50 %.

## Décisions fermées, ne pas rouvrir
- Lettrage Ephesis redressé de 8°, trait 1,1 px, "neræ" à -0.045em.
- Cycle de vie braise, blanc chaud, cendre, lit sédimenté. Cymatique de Chladni sur la hauteur détectée.
- Bibliothèque d'empreintes v0.5 : un buffer de cibles GPU, échantillonnage CPU une fois à la sélection. Silence cristallise, son fond, geste érode.
- Vent v0.5.1 : gain adaptatif sur la fraction d'image en mouvement (main à 40 cm reste à ×1, silhouette à 3 m monte vers ×2 à ×4) ; seuils aire 0,003 et énergie 0,12, référence 0,09. Le compteur de silence n'avance que sans son, sans geste et sans touch ; interrupteur Pro "retour de l'empreinte", actif par défaut, durée réglable.
- Chaos anime les curseurs et tire une empreinte une fois sur deux. Reset ramène le titre.
- Figuratif retiré des empreintes.
- v0.7.1 : deux couches, une seule réserve de grains. Corps et fond ont chacun leur matière (fumée, liquide, encre, points, dither, lignes, moiré, contours), le partage est un biais de repos, la matière se conserve (le fond forme la personne, ses grains y retournent). Jamais de trame ordonnée sur une palette claire (garde Papier dans renderer.ts). Palettes = Teintes en pastilles, presets = Scènes aux noms de moments.
- Seuil et délai de présence : défauts 0,0015 et 8 s, à trancher devant une vraie caméra seulement.

## Périmètre git
Repo local sans remote. Commits locaux ciblés sur le diff de la tâche. Jamais de push, jamais de branche défensive. Un seul processus à la fois sur ce dossier.

## Fin de tâche
Relire CLAUDE.md et BACKLOG.md depuis le disque. Mettre BACKLOG.md à jour. Restitution TLDR d'abord, phrases complètes, captures à l'appui, liste de ce qui reste à tester devant la vraie caméra.

# Cineræ

Poussière de lumière WebGPU pilotée par la caméra (flux optique) et le son (micro). Pièce de la page experiments du site NeuraeHive et instrument d'installation (personnes debout à 2 ou 3 m).

## Lancer
npm run dev, puis l'adresse affichée. Ajouter ?debug à l'adresse pour lire les mesures du geste (m/a/g/c/s/p dans document.documentElement.dataset.cinerae ; p = enveloppe de présence). Vérification au rendu réel : Claude in Chrome sur Edge, captures dans .debug (dans .gitignore, jamais commité).

## Invariants
- 200 000 grains au fps de référence (v0.5.1 : 60 à 65 fps plafonnés par l'écran). Toute feature qui coûte à l'image est refusée.
- La caméra n'est jamais affichée. Le fantôme caméra est une option Pro, désactivée par défaut.
- Tout reste local : presets, captures, images importées. Rien n'est envoyé.
- Panneau trois modes : Non-initié (presets, palettes), Curieux, Pro. Pas de mur de réglages.
- Le touch reste, le MIDI s'ajoute.

## Décisions fermées, ne pas rouvrir
- Lettrage Ephesis redressé de 8°, trait 1,1 px, "neræ" à -0.045em.
- Cycle de vie braise, blanc chaud, cendre, lit sédimenté. Cymatique de Chladni sur la hauteur détectée.
- Bibliothèque d'empreintes v0.5 : un buffer de cibles GPU, échantillonnage CPU une fois à la sélection. Silence cristallise, son fond, geste érode.
- Vent v0.5.1 : gain adaptatif sur la fraction d'image en mouvement (main à 40 cm reste à ×1, silhouette à 3 m monte vers ×2 à ×4) ; seuils aire 0,003 et énergie 0,12, référence 0,09. Le compteur de silence n'avance que sans son, sans geste et sans touch ; interrupteur Pro "retour de l'empreinte", actif par défaut, durée réglable.
- Chaos anime les curseurs et tire une empreinte une fois sur deux. Reset ramène le titre.
- Figuratif retiré des empreintes.

## Périmètre git
Repo local sans remote. Commits locaux ciblés sur le diff de la tâche. Jamais de push, jamais de branche défensive. Un seul processus à la fois sur ce dossier.

## Fin de tâche
Relire CLAUDE.md et BACKLOG.md depuis le disque. Mettre BACKLOG.md à jour. Restitution TLDR d'abord, phrases complètes, captures à l'appui, liste de ce qui reste à tester devant la vraie caméra.

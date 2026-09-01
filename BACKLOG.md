# Backlog Cineræ

## Versions
- v0.3 (54a20e0) : lettrage, cycle de vie, filaments, cymatique, panneau trois modes.
- v0.5 (656362a) : bibliothèque d'empreintes.
- v0.5.1 (5cb920b) : gain adaptatif à la distance, retour de l'empreinte explicite, vérification des grains, turbulence, bords, Chaos.

## À tester à la main, devant la vraie caméra
- Vent à 40 cm : ressenti du balayage, gain proche de ×1 (lire ?debug).
- Vent debout à 3 m : marche, bras, rotation ; gain qui monte ; vérifier que le bruit du capteur ne franchit pas les seuils dans une pièce sombre, sinon remonter le seuil ou recaler la référence 0,09.
- Silence réel : parler puis se taire et s'immobiliser, chronométrer contre "durée du silence".
- Empreintes : silhouette d'une vraie personne, effacement au passage, glisser-déposer depuis l'explorateur, panneau sur mobile réel.
- Cymatique en chantant ; braises en tapant.

## Non vérifié au rendu
- Tirage aléatoire des empreintes à 24 s (même compteur que le cristal, validé au code seulement).
- Surbrillance de Reset en vol (même mécanisme que Chaos, vu pour Chaos).

## P1
- ORCHESTRE v0.6 : presets et crossfade A/B, look (palettes, fusion, profondeur, symétrie, temps, cendre mémoire, fantôme caméra), matrice de modulation, MIDI learn.
- Test avec un vrai contrôleur MIDI.

## P2
- MediaPipe corps et mains.
- Mode Duo : deux personnes, deux teintes de vent (après MediaPipe).
- OSC (TouchDesigner, lignée Synaptic Mirror).

## P3
- 9e carte du site NH, publication page experiments.
- Migration dans le repo neuraehive (licence PolyForm Noncommercial, assets CC BY-NC-SA).

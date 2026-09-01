# Backlog Cineræ

## Versions
- v0.3 (54a20e0) : lettrage, cycle de vie, filaments, cymatique, panneau trois modes.
- v0.5 (656362a) : bibliothèque d'empreintes.
- v0.5.1 (5cb920b) : gain adaptatif à la distance, retour de l'empreinte explicite, vérification des grains, turbulence, bords, Chaos.
- v0.6 : presets fichier + crossfade A/B, look (6 palettes nommées, éditeur de dégradé 2-5 couleurs, couleur par âge/vitesse/densité/profondeur, fusion 5 modes dont soustractif papier, halo, grain papier, parallaxe 3 couches + flou de profondeur, symétrie miroir/quadrants/radiale, temps gel/ralenti/retour, stroboscope, cendre mémoire effaçable au claquement, fantôme caméra Pro), matrice de modulation (10 LFO max, sources son + geste, cibles = tout réglage y compris crossfade et paramètres d'empreintes), MIDI learn, capture PNG, enregistrement webm, plein écran avec panneau qui s'efface, sections repliables.

## À tester à la main, devant la vraie caméra
- Vent à 40 cm : ressenti du balayage, gain proche de ×1 (lire ?debug).
- Vent debout à 3 m : marche, bras, rotation ; gain qui monte ; vérifier que le bruit du capteur ne franchit pas les seuils dans une pièce sombre, sinon remonter le seuil ou recaler la référence 0,09.
- Silence réel : parler puis se taire et s'immobiliser, chronométrer contre "durée du silence".
- Empreintes : silhouette d'une vraie personne, effacement au passage, glisser-déposer depuis l'explorateur, panneau sur mobile réel.
- Cymatique en chantant ; braises en tapant.
- v0.6 : parallaxe des couches sous un vrai geste (le décalage est dynamique, seul le flou a été vu en statique) ; cendre mémoire creusée par une vraie personne qui traverse ; stroboscope et sync transitoires des LFO sur de vrais claquements ; sources basses/aigus/geste de la matrice à l'oreille et au corps ; mandala radial avec une personne au centre.
- v0.6 : vrai contrôleur MIDI — learn potard par potard, liaison sur le crossfade, reprise des liaisons depuis un preset rechargé.

## Non vérifié au rendu
- Tirage aléatoire des empreintes à 24 s (même compteur que le cristal, validé au code seulement).
- Surbrillance de Reset en vol (même mécanisme que Chaos, vu pour Chaos).
- v0.6 : symétries miroir H/V/quadrants (la radiale est vérifiée, même passe de repli d'UV) ; fusions écran/tamisée isolées (dodge vu via Phosphore, soustractif via Encre) ; drag continu du curseur crossfade au doigt (les valeurs cliquées et modulées sont vérifiées).

## Notes d'environnement (vérification navigateur)
- Edge bloque les téléchargements automatiques multiples de localhost : accepter une fois l'invite « Download multiple files », sinon PNG/webm/preset restent en .crdownload (le contenu des fichiers est complet et valide).

## P1
- (vide — ORCHESTRE v0.6 livré)

## P2
- MediaPipe corps et mains.
- Mode Duo : deux personnes, deux teintes de vent (après MediaPipe).
- OSC (TouchDesigner, lignée Synaptic Mirror).
- Cibles de matrice sur les paramètres des LFO eux-mêmes (FM de LFO), écarté du v0.6 pour garder le registre statique.

## P3
- 9e carte du site NH, publication page experiments.
- Migration dans le repo neuraehive (licence PolyForm Noncommercial, assets CC BY-NC-SA).

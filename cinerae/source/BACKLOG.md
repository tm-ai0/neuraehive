# Backlog Cineræ

## Versions
- v0.3 (54a20e0) : lettrage, cycle de vie, filaments, cymatique, panneau trois modes.
- v0.5 (656362a) : bibliothèque d'empreintes.
- v0.5.1 (5cb920b) : gain adaptatif à la distance, retour de l'empreinte explicite, vérification des grains, turbulence, bords, Chaos.
- v0.6 : presets fichier + crossfade A/B, look (6 palettes nommées, éditeur de dégradé 2-5 couleurs, couleur par âge/vitesse/densité/profondeur, fusion 5 modes dont soustractif papier, halo, grain papier, parallaxe 3 couches + flou de profondeur, symétrie miroir/quadrants/radiale, temps gel/ralenti/retour, stroboscope, cendre mémoire effaçable au claquement, fantôme caméra Pro), matrice de modulation (10 LFO max, sources son + geste, cibles = tout réglage y compris crossfade et paramètres d'empreintes), MIDI learn, capture PNG, enregistrement webm, plein écran avec panneau qui s'efface, sections repliables.
- v0.7 : mode présence, état de base de la pièce. L'image caméra en miroir place les grains en continu (jamais de vidéo) via six trames procédurales évaluées dans le shader de simulation sur la luminance du champ de vent (bruit, dithering ordonné, lignes, moiré, points, contours — coût par frame minime, aucun readback nouveau). Curseurs grains/taille/élasticité dès Curieux (élasticité 0 = poussière libre historique, 1 = portrait rigide), seuil + délai de présence en Pro. Enveloppe de présence sur l'aire de mouvement existante (sonde 4 Hz, lissage asymétrique : rassemblement ~1 s, dispersion douce), qui fond le cristal comme le titre, bloque la recristallisation et le retour du titre tant qu'une personne est là. Pendant la présence les filaments de repos et la turbulence ambiante s'apaisent et la poussière libre s'assombrit — le portrait domine. Bichromie lumière/ombre : la luminance caméra pilote le dégradé de la palette et la luminosité des grains tenus. Empreinte fond = poussière abstraite pure. Presets/Chaos/Reset/matrice/MIDI atteignent les réglages présence (defs ordinaires) ; Chaos tire une trame une fois sur quatre. 61-62 fps à 200 000 grains, présence active.

## À tester à la main, devant la vraie caméra
- Vent à 40 cm : ressenti du balayage, gain proche de ×1 (lire ?debug).
- Vent debout à 3 m : marche, bras, rotation ; gain qui monte ; vérifier que le bruit du capteur ne franchit pas les seuils dans une pièce sombre, sinon remonter le seuil ou recaler la référence 0,09.
- Silence réel : parler puis se taire et s'immobiliser, chronométrer contre "durée du silence".
- Empreintes : silhouette d'une vraie personne, effacement au passage, glisser-déposer depuis l'explorateur, panneau sur mobile réel.
- Cymatique en chantant ; braises en tapant.
- v0.6 : parallaxe des couches sous un vrai geste (le décalage est dynamique, seul le flou a été vu en statique) ; cendre mémoire creusée par une vraie personne qui traverse ; stroboscope et sync transitoires des LFO sur de vrais claquements ; sources basses/aigus/geste de la matrice à l'oreille et au corps ; mandala radial avec une personne au centre.
- v0.6 : vrai contrôleur MIDI — learn potard par potard, liaison sur le crossfade, reprise des liaisons depuis un preset rechargé.
- v0.7 présence, devant une vraie personne : le portrait se lit-il en une seconde ("c'est moi, en poussière") à 40 cm et à 2-3 m ; la respiration/le balancement naturels suffisent-ils à tenir la présence (seuil 0,0015 — la silhouette synthétique parfaitement immobile perd la présence après le délai, une vraie personne ne devrait pas ; sinon baisser le seuil ou monter le délai Pro, défaut 8 s) ; l'élasticité au geste (écarter les grains du bras, les voir revenir) ; les six trames sur un vrai visage/corps et en contre-jour (fond clair = portrait en négatif, voulu) ; la bichromie avec Braise/Givre/Encre ; l'entrée-sortie répétée de plusieurs personnes.

## Non vérifié au rendu
- Tirage aléatoire des empreintes à 24 s (même compteur que le cristal, validé au code seulement).
- Surbrillance de Reset en vol (même mécanisme que Chaos, vu pour Chaos).
- v0.6 : symétries miroir H/V/quadrants (la radiale est vérifiée, même passe de repli d'UV) ; fusions écran/tamisée isolées (dodge vu via Phosphore, soustractif via Encre) ; drag continu du curseur crossfade au doigt (les valeurs cliquées et modulées sont vérifiées).
- v0.7 : MIDI learn sur un réglage présence (même registre de defs que les cibles vérifiées, non testé faute de contrôleur) ; presets rechargés portant les valeurs présence (capture/apply passent par le même chemin que les defs vérifiés) ; différence visuelle bruit vs dithering ordonné (les deux vus lisibles, la structure Bayer fine reste à confirmer sur un portrait immobile réel) ; seuil de présence Pro (le délai a été vérifié à 30 s, le seuil garde sa valeur par défaut).

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

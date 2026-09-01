# Cineræ

Poussière de lumière WebGPU pilotée par la caméra (flux optique) et le son (micro). Pièce de la page experiments du site NeuraeHive et instrument d'installation (personnes debout à 2 ou 3 m).

## Lancer
npm run dev, puis l'adresse affichée. Ajouter ?debug à l'adresse pour lire les mesures du geste (m/a/g/c/s/p/h/v/d dans document.documentElement.dataset.cinerae ; p = enveloppe de présence, h = mains, v = voix, s = secondes d'inactivité, d = angle de danse). Vérification au rendu réel : Claude in Chrome sur Edge, captures dans .debug (dans .gitignore, jamais commité).

## Invariants
- 400 000 grains sous qualité auto (v0.7.1 : 90 fps et plus, plafonné par l'écran, palier auto jamais descendu). Toute feature qui coûte à l'image est refusée.
- La caméra n'est jamais affichée au public. Le fantôme caméra est une option Pro désactivée par défaut ; la caméra brute (v0.7.1c) est un interrupteur Pro de calibration, transient (jamais dans une scène, jamais tiré par Chaos), coupé d'office en quittant Pro et par Reset.
- Tout reste local : scènes, captures, images importées. Rien n'est envoyé.
- Panneau trois modes : Umbra (un curseur frôler ◀▶ bousculer qui dose la poussée + teintes), Anima (cinq sections courtes : corps, geste, musique, particules, look), Pro (tout). Pas de mur de réglages ; étiquettes de trois mots au plus, concrètes, l'explication vit dans le hint. Tout texte visible passe par le dictionnaire FR/EN (src/i18n.ts).
- v0.7.1b, panneau sobre : accordéon à section unique (ouvrir ferme les autres), aucun scroll nulle part — une section trop haute se découpe en sous-onglets, jamais en défilement. Toutes les lignes partagent un gabarit à hauteur fixe (nom à gauche, valeur à droite, piste nette pleine largeur). Les hints s'affichent dans l'emplacement réservé en bas du panneau, jamais en insérant du texte dans la pile. Pas d'ornement : ni strates, ni pastilles muettes, ni croquis, ni mots génériques à la place des valeurs (les libellés de régime — gel, retour, poussière libre — restent).
- Le touch reste, le MIDI s'ajoute.
- Le registre de réglages (panel.ts, defs) est la seule porte : tout réglage existant ou futur y entre, avec son drapeau Chaos (plage + snap éventuel). Presets, crossfade, matrice, MIDI et Chaos ne passent que par lui — jamais de réglage hors registre.
- Le crossfade A ↔ B est continu de bout en bout : les anciens choix (fusion, symétrie, pilote de couleur, couche nette) sont des quantités fractionnaires que les shaders mélangent ; ce qui reste vraiment discret (une matière, une scène) se fond par un mélange de rendu sur la durée du crossfade (paire de matières + mélange stochastique par grain), jamais par un saut à 50 %.

## Décisions fermées, ne pas rouvrir
- Lettrage Ephesis redressé de 8°, trait 1,1 px, "neræ" à -0.045em.
- Cycle de vie braise, blanc chaud, cendre, lit sédimenté. Cymatique de Chladni sur la hauteur détectée.
- Bibliothèque d'empreintes v0.5 : un buffer de cibles GPU, échantillonnage CPU une fois à la sélection. (« Silence cristallise, son fond » remplacé en v0.7.1c : l'empreinte choisie se forme seule et ne fond plus au son — la musique l'anime ; le geste érode toujours.)
- Vent v0.5.1 : gain adaptatif sur la fraction d'image en mouvement (main à 40 cm reste à ×1, silhouette à 3 m monte vers ×2 à ×4) ; seuils aire 0,003 et énergie 0,12, référence 0,09. Le compteur de silence n'avance que sans son, sans geste et sans touch ; interrupteur Pro "retour de l'empreinte", actif par défaut, durée réglable.
- Chaos anime les curseurs et tire une empreinte une fois sur deux. Reset ramène le titre.
- Figuratif retiré des empreintes.
- v0.7.1 : deux couches, une seule réserve de grains. Corps et fond ont chacun leur matière (fumée, liquide, encre, points, dither, lignes, moiré, contours), le partage est un biais de repos, la matière se conserve (le fond forme la personne, ses grains y retournent). Jamais de trame ordonnée sur une palette claire (garde Papier dans renderer.ts). Palettes = Teintes en pastilles, presets = Scènes aux noms de moments.
- Seuil et délai de présence : défauts 0,0015 et 8 s, à trancher devant une vraie caméra seulement.
- v0.7.1b, poussée : le corps est un obstacle. Def "push" au registre (0..2, défaut 1, Chaos 0,3-1,8) : bourrade le long du geste (impulsion sur l'énergie de mouvement, le corps cède ×0,35) + expulsion hors de la silhouette fusionnée avec la marge d'ombre (evict = margin×1,6 + push×2,4). Le curseur Umbra écrit push et bodyMargin (v×2). Teintes = bandeaux du vrai dégradé (fond puis stops) avec nom lisible.
- v0.7.1c, la pièce danse : l'empreinte choisie se forme seule (cristal +1/6 s, familles ≠ fond) et ne fond jamais au son ; corps et empreinte cohabitent sur la même réserve (le ressort cristal ignore les grains corps : ×(1-presW) sur attraction et drag). Danse = transformation GPU des cibles (rotation, échelle, ondulation 3 lobes, dérive) autour du centre de l'empreinte, enveloppe intégrée CPU : basses → pompe, transitoires → impulsions de rotation, aigus → ondulation, respiration lente sans musique ; def "danse" (0..2, défaut 1, Chaos 0,3-1,8) la dose, la symétrie radiale tourne au même pouls (symSpin). Le mot en retour d'idle (titleMode) ne danse pas. Fractales = famille d'empreintes (julia vivant par itération inverse avec c orbitant, fougère de Barnsley, dragon ordonné). Présence : un seul réglage "sensibilité" (50 % = les défauts validés 0,0015/8 s, seuil ×4^(0,5−v), délai ×2^(2v−1)). Chaos garde un historique de 8 tirages (valeurs + couleurs + empreinte), bouton ↶ et touche Z. Frange chroma fondue à 0 sur 18 % de bord (jamais de bord droit). Titre : jitter réduit de moitié, grains ×0,68 en mode titre.

## Périmètre git
Repo local sans remote. Commits locaux ciblés sur le diff de la tâche. Jamais de push, jamais de branche défensive. Un seul processus à la fois sur ce dossier.

## Fin de tâche
Relire CLAUDE.md et BACKLOG.md depuis le disque. Mettre BACKLOG.md à jour. Restitution TLDR d'abord, phrases complètes, captures à l'appui, liste de ce qui reste à tester devant la vraie caméra.

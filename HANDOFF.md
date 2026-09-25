# HANDOFF ; Cineræ

Point d'entrée de toute conversation. Le haut du fichier appartient à Claude.ai ; chaque session Claude Code n'écrit que sa propre section en fin de tâche. CLAUDE.md et BACKLOG.md restent la source de vérité technique.

## État (25/09/2026, Claude.ai)

- v0.7.3 commitée localement, jamais poussée : c4757de (matière éclats) et d86894b (panneau : Démo à un curseur, Pro en 3 méta-sections regarder / composer / brancher, puce MIDI, monogramme Ephesis).
- Lanceur PC pour Thomas : lancer-test-webcam.bat (port dédié 5199, ouvre http://localhost:5199/cinerae/). Non suivi par git.
- Mockup de référence panneau : lab/mockup-panneau-v073-simplifie.html (piste A retenue, bascule avant/après personnalité). Non suivi.
- Vidéo de référence : exemple.mp4 à la racine. Non suivie.
- Thomas a vu éclats tourner sur PC (stries magenta / vertes autour du mouvement) : rendu voulu.

## Décisions fermées (25/09/2026)

- Roue de teintes des éclats (ambre / azur / magenta / vert) : indépendante des Teintes de scène. Statu quo.
- Pro ne garde plus les quatre curseurs en tête. Chacun rejoint la section où il agit : matière → regarder > corps > forme ; lumière → brancher > réglages > lumière ; mémoire → brancher > réglages > temps ; miroir → brancher > réglages > espace. Démo inchangée : matière seule.
- Dans une méta-section, un seul rang d'onglets soulignés (les sections). Tout niveau plus profond (forme / tenue / geste, familles d'empreinte) passe en puces.
- Lisibilité du corps garantie quelle que soit la matière : séparer le corps vivant (contour net de l'instant) du sillage (traînée artistique). Constat : sur PC, matière encre, lumière 29, mémoire élevée, la silhouette de Thomas n'était pas reconnaissable.
- Sélecteur de sources caméra et micro (liste des périphériques de la machine) dans brancher, à la place des seules puces avant / arrière.
- Bug vu : "partage" rendu deux fois dans l'onglet empreinte.
- Chantier CAMÉRA : puce "caméra" dans l'en-tête à côté de midi, Pro seulement, état visible (point + nom court de la source) ; un tap ouvre un menu flottant avec allumer / éteindre, source, sens du geste, caméra brute, fantôme, et une vignette en direct de la caméra ; touche C sur PC pour caméra brute ; aucune vignette permanente sur l'image ; le menu pilote les mêmes réglages que brancher > caméra, sans doublon d'état.
- Empreintes interactives (chantier OBJETS) : les empreintes deviennent des objets physiques poussés par le mouvement du corps ; élan, dérive, amortissement, restent où on les laisse ; jusqu'à 4 objets ; bords de l'image qui renvoient doucement ; objets qui se repoussent mollement ; chaque objet reste une empreinte (attire les grains) ; ajout par un + dans empreinte ET par double-toucher sur l'image ; vitrine après 20 s remet la composition ; au registre, un jeu de réglages par emplacement d'objet. Pro d'abord, scène "Objets" hors rotation, public après validation Redmi et vraies personnes.
- Attraper / tenir avec la main (suivi des mains, MediaPipe déjà en dépendance, modèles locaux dans public/models) : chantier MAINS à part, après OBJETS.

## Chantiers suivants, dans l'ordre

Ordre retenu : CAMÉRA → FOND → OBJETS → MAINS → icônes.

1. PROMPT LISIBLE (Claude Code, Fable 5.1) : corps vivant / sillage, Pro allégé, puces au second niveau, sources, doublon partage. Lancé le 25/09, livré (8d8c598).
2. PROMPT CAMÉRA : puce caméra en en-tête avec menu flottant, bouton VOIR, touche C. Livré le 25/09 (v0.7.5, voir la section Claude Code plus bas).
3. PROMPT FOND : fond appris (la salle vide mémorisée), masque du corps tiré de la différence au fond, corps net dessus, bouton « reprendre le fond » pour ré-apprendre la salle.
4. PROMPT OBJETS : empreintes physiques poussées par le corps, plusieurs à la fois.
5. PROMPT MAINS : attraper / tenir / tourner un objet avec la main (suivi des mains).
6. Icônes pour les formes d'empreinte et les matières : changement de layout, mockup d'abord.

## À faire par Thomas (test, 1 minute)

Pro > brancher > caméra > "caméra brute" : la silhouette se détache-t-elle à la source ? Puis lumière 70 / mémoire 10, immobile puis un bras. Une phrase par étape.

## Claude Code, v0.7.4 LISIBLE (25/09/2026)

- État : les cinq points du PROMPT LISIBLE sont livrés et mesurés (voir BACKLOG v0.7.4). Commit local, jamais poussé.
- Décisions prises : le corps vivant est le canal alpha du trail (80 ms de mémoire sur l'horloge réelle), composé après le grade avec une marge d'ombre hors du contour et un relèvement de luminance qui garde la couleur ; def « corps net » défaut 0,4, Chaos [0,25-0,7]. Le micro se choisit dans regarder > son (sous l'interrupteur micro), pas dans brancher > réglages : la caméra se choisit à côté de son interrupteur, le micro pareil. Les listes de sources n'apparaissent que si la machine donne au moins un nom ; sinon les puces avant / arrière. Le choix d'une source n'entre pas dans le journal ↶ (pas un def du registre).
- Relecture challenger avant commit : la première formule d'ombre assombrissait les interstices à l'intérieur du corps et effaçait le lavis d'encre et la couleur des éclats ; corrigée (ombre hors du contour seulement, relèvement de luminance au lieu d'un mélange vers la teinte), mesure intérieure ajoutée (luminance moyenne et écart-type inchangés). Le ralenti gonflait le corps vivant (mémoire sur le temps simulé) ; corrigé (horloge réelle lissée). Point mineur retenu : un deviceId périmé est oublié dès que le repli ouvre un autre appareil.
- Prochain pas : le test d'une minute de Thomas devant la vraie webcam (encre / lumière 29 / mémoire 80, corps net 40 puis 0 puis 70), puis le Redmi pour les puces et les sources. Ensuite PROMPT OBJETS.
- Fichiers touchés : src/shaders/fade.wgsl, particles.wgsl, present.wgsl, src/renderer.ts, src/panel.ts, src/main.ts, src/camera.ts, src/audio.ts, src/i18n.ts ; BACKLOG.md, HANDOFF.md. Harnais (non suivi, .debug) : lisible_lib.py, lisible-protocol.py, lisible-panel.py, check-lisible.mjs, synth.js (paramètre scale), captures lisible-*.jpg, lisible-pw.json, lisible-panel*.json.
- Attention : pendant la session, deux « taskkill chrome.exe » ont été lancés pour arrêter des Chrome Playwright orphelins ; si un Chrome personnel était ouvert sur ce PC, il a été fermé aussi.

## Claude Code, v0.7.5 CAMÉRA (25/09/2026)

- État : les cinq points du PROMPT CAMÉRA sont livrés et mesurés (voir BACKLOG v0.7.5 et les captures .debug/camera-pw-*.jpg) : VOIR dans la rangée du bas en Pro, puce caméra dans l'en-tête avec menu flottant et vignette, touche C, docs (CLAUDE.md, HANDOFF.md, BACKLOG.md). Commit local, jamais poussé.
- Décisions prises : la touche C était déjà prise par Chaos ; le prompt demandant C pour la caméra brute, Chaos passe sur X (aide mise à jour). C en Démo ne fait rien (la caméra brute reste Pro). Le nom court de la puce vient du label de la piste vidéo ouverte (premier mot, 8 caractères au plus), pas de la liste ; sans nom, avant / arrière. La vignette est le MediaStream du moteur attaché à un second <video>, jamais une seconde capture, détachée à la fermeture. Le menu vit dans l'en-tête (z-index 2 au-dessus du corps, fond opaque). Un bug CSS préexistant a dû être corrigé pour tenir sur une ligne : le générique « .cinerae-panel button { font: inherit } » écrasait les tailles et la graisse de la puce midi, d'AIDE et de la rangée du bas (rendus à 18 px regular depuis v0.7.3) ; AIDE / CHAOS / GARDER apparaissent donc maintenant en 600 comme le mockup l'écrivait, à valider à l'œil.
- Relecture challenger avant commit : GO ; il a re-mesuré l'en-tête à 1024×768 (une ligne, noms « Logitech » / « Microsof » / « arrière » sans coupure, AIDE ne peut pas passer à la ligne puisque seule la puce caméra rétrécit), la rangée à rem 8 et 10 (marge 13-17 %), le menu (388 px de haut, dans le panneau) et l'absence de toute trace de C = chaos. Un cas résiduel corrigé : AIDE ouvert au clavier laissait le menu ouvert par-dessus l'aide ; le menu se ferme maintenant dès que l'aide s'ouvre (mesuré : ouvert → Entrée sur AIDE → fermé, 0 vidéo). Non vérifié par lui : polices non Windows (Roboto sur le Redmi), vrai label getUserMedia, miroir de la vignette en vraie lumière.
- Vérification : Playwright headed Chrome, caméra synthétique (stub cloné par appel, piste nommée « Webcam intégrée »), 1280×800 et 800×1280 ; le vérificateur unlazy (gate-check.mjs) refuse tout fichier sur cette machine (lstat rend dev 0 sous Windows) : les gates de .debug/GATES-camera.md sont prouvées par .debug/check-camera.mjs, jamais par le checker.
- Prochain pas : test de Thomas devant la vraie webcam (nom court de la puce, vignette, VOIR / C, graisse des boutons), Redmi en paysage (en-tête à cinq contrôles, rangée à quatre). Ensuite PROMPT FOND (fond appris, masque du corps, corps net dessus, « reprendre le fond »), puis OBJETS, MAINS, icônes.
- Fichiers touchés : src/panel.ts, src/main.ts, src/i18n.ts, index.html ; CLAUDE.md, BACKLOG.md, HANDOFF.md. Harnais (non suivi, .debug) : camera-protocol.py, check-camera.mjs, cam-measure-head.py, cam-measure-fit.py, GATES-camera.md, camera-pw.json, camera-portrait.json, captures camera-pw-*.jpg et camera-portrait-*.jpg.
- Aucun navigateur fermé de force pendant la session : seuls les Chrome lancés par Playwright ont été fermés (browser.close()).


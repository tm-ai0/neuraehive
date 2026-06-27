# RECAP + PLAN — Instrument visuel (ex « corruption_lab »)
### Document de reprise pour le prochain chat · digression créative (splashscreen HackBGRT toujours EN PAUSE)

---

## 0. TL;DR — le recadrage

L'outil a dépassé son cahier des charges initial (faire un splash de boot statique). C'est devenu un **moteur d'expérimentation vidéo temps réel dans le navigateur** — « un Resolume de browser ». Le vrai sujet n'est pas la *corruption* d'une image, c'est **l'animation d'une image fixe : la matière inerte à qui on insuffle un mouvement, presque divinement**. Tout (le nom, l'UI, la pédagogie) doit servir CETTE idée.

Ce doc = ce qui est fait + une roadmap qui répond aux 6 critiques de Thomas + les décisions à trancher avant de coder.

---

## 1. DÉCISIONS À TRANCHER EN HAUT DU PROCHAIN CHAT

Rien n'avance proprement tant que ces 5 points ne sont pas tranchés :

1. **Le nom.** Recommandation forte : **Anima / Animæ** (latin : le souffle qui anime la matière morte → littéralement la thèse du projet ; lien étymologique avec *animation* + l'anima jungienne). Alternatives dans ton univers Æ : **Élan** (élan vital, Bergson), **Pneuma** (souffle grec), **Insuffle**, **Rêverie**, **Vivar**, ou sous l'ombrelle **Æthereact**. → À choisir.
2. **CPU vs GPU** (LA décision d'archi, voir §8). Réécriture React/Canvas2D propre d'abord, OU saut direct WebGL2/GPU (tu as déjà les compétences via NH Synaptic Mirror) ? Reco : **React/CPU v3 d'abord** pour l'UX + undo, **puis** port WebGL2 v4 pour la perf.
3. **Priorité entrées vivantes** : webcam/vidéo en premier, ou audio-réactif en premier ? (Reco : webcam d'abord — c'est la preuve la plus spectaculaire du concept « Resolume browser ».)
4. **Cible plateforme** : desktop-perf d'abord, ou tactile/mobile dès le départ ?
5. **Sortie** : le plein écran / 2e écran (projo) suffit-il, ou besoin d'un pont vers d'autres softs (Spout/OBS, type pipeline Synaptic Mirror) ? Ça change l'archi de sortie.

---

## 2. CE QUI EST FAIT (état actuel)

### Artifact 1 — `glitch-playground.html` (v2 « motion », ~36 Ko, 1 fichier, Canvas2D + JS pur)
Labo interactif fonctionnel. Pipeline d'effets, dans cet ordre fixe :
`noirs sales → pixel sort → bandes (datamosh) → aberration chromatique → echo → scanlines → vignette`
- **Sources** : `champ` / `éclats` / `maille` (procédurales sur noir, seedées), `tunnel` (perspective Z, LUT + texture tuilée), + import d'image.
- **Moteur d'animation** : play/pause (barre espace), 5 moteurs combinables — *strobe graine* (le clic-rafale automatisé), *dérive rotation*, *roll scanlines*, *churn bandes*, *tunnel Z*. **Maintien clic = warp ×3** (repris du « hold to interact » de la réf Heintzmann).
- **Export** : frame PNG, frame `splash.bmp` (24-bit, héritage splashscreen), **enregistrement WebM** (`captureStream` + `MediaRecorder`), copie/téléchargement des réglages JSON.
- Résolution live réglable 400→960 (palliatif perf, voir §7).
- RNG seedé (mulberry32) → reproductible.

### Artifact 2 — `glitch_bmp.py` (~13 Ko, Pillow + numpy)
Même pipeline en CLI. Génère `splash.bmp` **24-bit non compressé garanti** (en-tête 54 o, vérifié). Avale le JSON du playground (`--settings`). Pour image haute def / batch / génération procédurale scriptée. *(Lié au splashscreen — secondaire pour la digression créative, mais à conserver.)*

### Contexte splashscreen (EN PAUSE, à ne pas oublier)
HackBGRT sur laptop Hasee. BMP 24-bit statique, 1920×1080, bords fondus au noir (HackBGRT ne scale pas, centre+rogne). Specs + procédure + filet de sécurité = dans le bloc de reprise précédent + Notion. **On y reviendra plus tard.**

---

## 3. LA VISION — « Resolume de navigateur » : c'est jouable ?

**Verdict honnête : oui, et de façon impressionnante — avec des limites précises.**

✅ **Très faisable en navigateur** : entrées live (webcam, vidéo, image, audio), chaîne d'effets temps réel, **audio-réactivité** (WebAudio FFT), **contrôle MIDI** (Web MIDI — tu utilises déjà du MIDI), enregistrement WebM, plein écran / 2e écran, presets. → Un vrai instrument VJ de FX.

⚠️ **La vérité d'archi** : la version actuelle est **Canvas2D + CPU**. C'est pour ça qu'elle tourne en basse def. Un moteur classe-Resolume en 1080p60 veut des **shaders WebGL2 (GPU)** — et **tu as déjà ce moteur** (Synaptic Mirror). La quasi-totalité des effets sont *triviaux et rapides* sur GPU. (Voir §8.)

❌ **Ce que le navigateur ne réplique pas nativement** : la sortie **Spout/NDI** vers d'autres logiciels (le point fort de Resolume). Sortie projo/plein écran = facile ; sortie *comme texture dans un autre soft VJ* = nécessite un pont natif (tu connais déjà Spout→OBS→RTSP via Synaptic Mirror). À acter en §1.5.

---

## 4. RÉPONSES AUX 6 CRITIQUES

### ① Renommage + UI « simple dans sa complexité » + didactique
**Constat** : trop dense, obscur, mot « corruption » à jeter. **Le pattern que tu connais déjà et qu'on applique : progressive disclosure** (tu l'as fait sur Synaptic Mirror).

Proposition d'architecture UI à 2 couches :
- **Mode Performance (par défaut)** : peu de contrôles, gros, friendly. Des **presets/états** nommés (ex. *Éveil, Spectre, Rémanence, Songe, Tunnel*) → clic = beau rendu instantané → puis on ajuste. + bouton chaos pour la sérendipité.
- **Mode Studio (sur demande)** : la grille de sliders actuelle, repliée derrière un toggle « avancé ».

**Macros expressives** au lieu de micro-paramètres (le cœur de la simplicité). Chaque macro = 1 potard qui pilote plusieurs params, dépliable pour voir/régler le détail :

| Macro | Pilote (params bruts) | Sens |
|---|---|---|
| **Souffle** | vitesse + dérive + roll | « à quel point c'est vivant » |
| **Fracture** | bandes + pixel sort | « à quel point c'est cassé » |
| **Spectre** | aberration + sa rotation | « dédoublement couleur » |
| **Rémanence** | echo (nb/dist/falloff) | « traînées / fantômes » |
| **Matière** | grain + noirs sales + scanlines | « texture / pellicule » |
| **Profondeur** | tunnel Z + rotation | « aspiration / 3D » |

> Sur la question « il existe un skill / une /commande pour ça ? » → **réponse honnête** : pas de slash-commande magique qui pond une UI pédago pro. Ce qui existe : le **skill `frontend-design`** (direction esthétique, déjà utilisé) et, pour un outil multi-composants complexe, une **approche React + Tailwind + shadcn/ui** (« web-artifacts-builder »). C'est la bonne tooling — et elle rend l'undo/redo + l'UI modulaire propres. La « /commande » que tu imagines = moi qui construis ça bien avec ces skills, en React.

### ② Undo / Redo
**Oui, et ça devient naturel** si on restructure l'état en **un seul objet sérialisable** (ce qui est l'autre raison de passer en React/`useReducer`).

```
State = { source, seed, macros{…}, params{…}, toggles{…}, motion{…} }
history = { past: State[], present: State, future: State[] }
commit(next): past.push(present); present = next; future = []
undo(): future.unshift(present); present = past.pop()
redo(): past.push(present); present = future.shift()
```
- **Snapshot** au relâché du contrôle (`pointerup`), preset, chaos, reset, toggle, changement de source — **pas** à chaque tick de slider.
- Raccourcis **Cmd/Ctrl+Z** / **Cmd/Ctrl+Shift+Z**. Historique plafonné (~50).
- Portée = la **configuration**, pas les frames vidéo (à clarifier côté UI).

### ③ « Alt-text » / expliquer chaque paramètre, visuellement et subtilement
Double lecture de ta demande, et on fait les deux :
- **Vraie accessibilité** : `aria-label` + alt réels sur les contrôles (bonus inclusivité).
- **Couche pédago « learn mode »** (le vrai sujet passionnant). Mécaniques proposées :
  - **Solo par effet** (comme un solo de table de mixage) : afficher *uniquement* la contribution de cet effet → on comprend son rôle instantanément.
  - **Micro-aperçu animé** : une vignette ~120×68 par effet, en boucle, montrant l'effet seul sur une image de référence.
  - **One-liner poétique + mécanique claire** au survol/tap. Ex. *Pixel sort* → « Les pixels clairs s'étirent et coulent le long de la lumière, comme une peinture qui fond. » + (mécanique : trie les pixels par luminosité dans les zones claires).
  - **Sweep-démo** : en learn mode, toucher un contrôle balaie sa valeur 1×/2× pour *montrer* l'effet en direct.
  - **Tour guidé** au premier lancement (optionnel).

### ④ Entrées vidéo + audio (+ clarifier le bouton « IMAGE GEN AI »)
**Mea culpa sur le label** : « IMAGE GEN AI » est trompeur — il **n'génère rien en IA**, il **importe juste un fichier image**. À renommer simplement **« Importer »** avec un sous-menu de type de source.

Architecture d'entrées unifiée (`SourceProvider` qui fournit la frame de base à chaque tick) :
- **Image** (fichier) — drawImage une fois.
- **Vidéo** (fichier OU **webcam** via `getUserMedia`) — `drawImage(video)` chaque frame → le pipeline corrompt la vidéo live. **C'est ça, le moment "Resolume".**
- **Génératif** (champ/éclats/maille/tunnel) — l'existant.
- **Audio** (micro ou fichier) → `AnalyserNode` (FFT) → features `{basse, medium, aigu, rms, beat}` → **matrice de modulation** assignable : n'importe quelle feature pilote n'importe quelle macro (basse→Spectre, beat→strobe, etc.). 

> La **matrice de modulation** (+ des **LFO** internes) est ce qui transforme un panneau de réglages en *instrument*. C'est la feature reine de la phase « instrument ».
> **MIDI** (Web MIDI) : mapper des CC sur les macros — direct dans ton workflow VJ.

### ⑤ Résolution & perf
État actuel : CPU, donc le sélecteur de résolution + le solo/désactivation des effets lourds sont des palliatifs. Les deux effets coûteux = **pixel sort** et **echo**.
Stratégie :
- **Court terme (CPU)** : séparer **résolution preview** (adaptative, fluide) de **résolution export/record** (pleine def) ; **résolution dynamique** (baisse auto si fps < cible, remonte si marge) ; **OffscreenCanvas + Web Worker** pour sortir le pipeline du thread UI ; throttle du pixel sort.
- **Vraie réponse (GPU)** : voir §8. Sur GPU, on rend en pleine def ; l'echo devient du **feedback ping-pong** (plus simple ET plus beau qu'en CPU).

### ⑥ Tactile / tablette / mobile
- **XY-pad sur le canvas** : un doigt pilote 2 macros simultanément (primitive live, façon TouchOSC). Le « maintien = warp » marche déjà au tactile.
- **Gestes** : pinch = vitesse/zoom, deux doigts = rotation, drag = direction du tunnel (steer).
- **Layout responsive** : panneau en **bottom-sheet** qui se tire vers le haut ; presets en grosses cartes tapables.
- **Perf mobile** : les GPU mobiles gèrent bien WebGL2 → argument de plus pour §8. **Wake-lock** + plein écran pour l'usage scène. Gestion de l'orientation.

---

## 5. (rappel) — le fork central : CPU vs WebGL2 → §8 ci-dessous

---

## 8. ARCHITECTURE — CPU (actuel) vs GPU/WebGL2 (cible instrument)

| | CPU / Canvas2D (actuel) | GPU / WebGL2 (cible) |
|---|---|---|
| Perf | basse def pour chaînes lourdes | **1080p60** réaliste |
| Effort | faible (déjà là) | moyen-élevé (réécriture moteur) |
| Atout | simple, portable | tu as **déjà** le savoir-faire (Synaptic Mirror) |

**Difficulté de portage des effets sur GPU** :
- *Faciles & rapides* : aberration, scanlines, vignette, déplacement/bandes, **tunnel**, grain/noirs sales.
- *Echo/feedback* : **ping-pong FBO** — plus simple et plus beau sur GPU (vrai feedback de frame).
- *Pixel sort* : **le seul vraiment pénible sur GPU** (le tri n'aime pas le GPU). Options : (a) approximer par un *smear* directionnel de luminance, (b) multi-pass type bitonic (complexe), (c) garder une passe pixel-sort **CPU uniquement pour les stills/export**.

**Recommandation** : phaser. Polir une **v3 CPU** (UX + undo + entrées, def modeste), **puis** une **v4 WebGL2** pour la perf pleine. Si tu veux t'engager direct sur le GPU vu tes compétences, c'est défendable aussi — à trancher en §1.2.

---

## 9. PHASAGE PROPOSÉ

- **Phase A — Fondation UX (React)** : renommage, undo/redo, presets/états, macros + progressive disclosure, learn mode, accessibilité. *(CPU.)* → rend l'outil friendly. **Premier geste recommandé au prochain chat.**
- **Phase B — Entrées vivantes** : import vidéo + **webcam** + audio-réactif basique. → valide le concept « Resolume browser ».
- **Phase C — Le grand saut perf** : port **WebGL2/GPU** (réutilise l'expérience Synaptic Mirror). Pleine def, 60 fps.
- **Phase D — Instrument complet** : **matrice de modulation audio + LFO**, **MIDI**, **XY-pad tactile**, sortie plein écran/2e écran, presets partageables.
- **Transverse** : raffinements tactile/mobile, qualité d'enregistrement (WebCodecs).

→ **Si on doit choisir UN point de départ** : Phase A (la friendliness que tu demandes + l'archi qui débloque tout le reste). Mais glisser un proto **webcam** (début de B) très tôt, parce que c'est la démo qui prouve la thèse.

---

## 10. RAPPEL — manière de travailler (préférences Thomas)
FR, direct, concis, zéro flatterie, contre-arguments bienvenus. Sature vite sur la technique → vulgariser, **une étape à la fois**, attendre confirmation, pas de jargon non expliqué. Aime les apartés qui expliquent le « pourquoi ». **Prévenir avant saturation tokens.** Travail itératif, le code vit dans le chat (pas dans le Claude d'Edge, qui ne voit pas ce fil).

---

## 11. PREMIER MESSAGE SUGGÉRÉ POUR LE PROCHAIN CHAT
> « Reprise du projet instrument visuel (doc RECAP-PLAN joint). Décisions prises : nom = [____], archi = [React/CPU v3 | saut WebGL2], priorité entrée = [webcam | audio]. On attaque la Phase A. »

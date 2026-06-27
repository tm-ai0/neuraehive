# CLAUDE.md — Animæ

> À lire EN PREMIER à chaque reprise, avec `design.md`. C'est le cadre. Tu t'y tiens.

## Le projet
**Animæ** — instrument visuel dans le navigateur : **donner du mouvement / un corps à une image fixe** (« insuffler le mouvement à la matière inerte »). Sous l'ombrelle **Æthereact**. Nom verrouillé (ligature æ).

## Base de code — RÈGLE D'OR
- On part de **`glitch-playground.html`** : le moteur « fun » existe déjà (sources field/shards/mesh/tunnel, pipeline d'effets, **chaos/random**, motion, export).
- On le fait évoluer **PETIT À PETIT, une modif à la fois.**
- ❌ **INTERDIT : reconstruire de zéro, repartir d'un fichier « propre », lancer des protos parallèles.**
  (`animae.html` et `glitch-playground (2).html` = anciens essais, archives. Ne pas travailler dessus.)

## Méthode (stricte)
- UNE modif → tu montres → tu **attends la validation** de Thomas. Pas de sprint.
- Pas de murs de texte. Concis. Doute sur la direction → **1 question**, pas trois.
- Le code vit dans le fichier / le chat ; itératif.

## Esthétique
- Cible visuelle précise : **voir `design.md`** (3D psyché, bluffant, fun, intriqué — **PAS** du post-FX 2D plat).
- ❌ Ce n'est **pas** NH Synaptic Mirror. Ne pas le refaire.
- DA « spectre » (piste C) : voir `design.md`.

## Entrées
image + **vidéo / webcam** + **audio-réactif** (le « Resolume de browser »). La webcam = la preuve la plus spectaculaire de la thèse.

## Public
Sélecteur de mode : **Simple / Public / VJ** (low floor / high ceiling / wide walls).

## Tech
- Itération : **three.js r128** ou canvas 2D, **un seul HTML autonome**.
- Lourd = **chez Thomas / Vite** : WebGPU/TSL, profondeur IA (Depth-Anything), Daydream img2img. On NE promet PAS ça dans l'aperçu claude.ai.
- **Honnêteté tech > esbroufe.** Toujours dire les limites (le sandbox bloque la webcam dans l'aperçu, l'IA de profondeur est trop lente en live → luminance en temps réel, etc.).

## Préférences Thomas
FR · direct, concis, **zéro flatterie** · contre-arguments bienvenus · **une étape à la fois, attendre confirmation** · pas de jargon non expliqué · aime les apartés « pourquoi » · **prévenir avant saturation tokens** · designer → visuel > texte.

## Privé
Le fil **idios / Prince Myshkine** (l'intraduisible, la rencontre de deux esprits différents dans la bienveillance) reste **strictement entre Thomas et l'assistant** — jamais dans un livrable, un carnet, le site, le marketing.

## À NE PAS faire (rappel)
reconstruire · sur-produire · deviner la DA · refaire Synaptic Mirror · sprinter sans validation · sur-promettre.

## Roadmap (modif par modif, à valider une à une)
1. Renommer « corruption_lab » → **Animæ** + passer l'UI en **DA piste C** (cf. `design.md`).
2. Ajouter **webcam / vidéo** en source (en plus de l'upload image).
3. UX : **sélecteur de mode** Simple / Public / VJ (progressive disclosure).
4. Pousser le **tunnel** vers le vrai psyché ; effets « plus ouf et plus faciles à piloter » (macros).
5. (Plus tard, gros pas **annoncé**) amener **three.js** dans le fichier pour le vrai 3D, puis Vite/WebGPU chez Thomas.

## Fichiers du dossier
- `glitch-playground.html` — **LA base** de travail.
- `animae.html` — proto 3D shader r128 (ancien essai, archive).
- `glitch-playground (2).html` — variante (archive).
- `glitch_bmp.py` — CLI splash HackBGRT (projet splash, séparé, en pause).
- `splash.bmp`, `corruption.webm`, `apercu_defauts.png` — sorties / captures.

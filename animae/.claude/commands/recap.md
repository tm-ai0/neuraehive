# /recap — Mise à jour CLAUDE.md + commit

Met à jour la section **État actuel** de CLAUDE.md avec ce qui a changé depuis le dernier commit, puis fait un git commit automatique.

## Instructions

1. Lis `CLAUDE.md` en entier.

2. Lance ces commandes en parallèle pour collecter le contexte :
   - `git log --oneline -10` — les 10 derniers commits
   - `git diff HEAD --stat` — fichiers modifiés non commités
   - `git status --short` — état du working tree

3. À partir de ce contexte, rédige un **bloc de mise à jour** synthétique (3-8 lignes max) qui décrit :
   - Ce qui a été fait depuis le dernier commit (ou depuis la dernière session si rien de commité)
   - L'étape Roadmap courante (numéro + statut : en cours / fait / bloqué)
   - La prochaine action concrète à faire

4. Dans `CLAUDE.md`, **remplace ou crée** la section `## État actuel` (juste avant `## Roadmap`) avec ce bloc.
   - Si la section existe déjà, remplace-la entièrement.
   - Si elle n'existe pas, insère-la juste avant `## Roadmap`.
   - Format :
     ```
     ## État actuel
     _Mis à jour le YYYY-MM-DD_

     **Derniers changements :** …
     **Étape Roadmap :** #N — [statut]
     **Prochaine action :** …
     ```

5. Stage et commite **uniquement `CLAUDE.md`** avec le message :
   ```
   recap : mise à jour état projet [YYYY-MM-DD]
   ```
   (date réelle du jour)

6. Confirme à Thomas en une ligne : ce qui a été noté + le sha du commit.

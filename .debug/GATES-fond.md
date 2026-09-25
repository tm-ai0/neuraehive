# Gates: PROMPT FOND (fond appris, masque du corps, interrupteur, reprendre le fond)

Note : gate-check.mjs (unlazy) refuse tout fichier sur cette machine (lstat rend dev 0 sous Windows). Preuves tenues par les oracles de .debug/check-fond.mjs sur .debug/fond-pw.json (Playwright headed Chrome, caméra synthétique .debug/synth.js).

OWNS: src/shaders/luma.wgsl, src/shaders/flow.wgsl, src/shaders/bggain.wgsl, src/shaders/bgmask.wgsl, src/shaders/bglearn.wgsl, src/renderer.ts, src/main.ts, src/panel.ts, src/i18n.ts, CLAUDE.md, BACKLOG.md, HANDOFF.md, .debug/**

Scope: fond appris par pixel sur le GPU (moyenne + bruit par pixel, gain global compensé, figé sous le corps), masque du corps lissé (couleur, ombre tolérée) qui remplace la luminance dans le canal b du champ quand il est appris (fondu par pixel, repli luminance sinon), interrupteur « fond appris » (registre, hors Chaos) + bouton « reprendre le fond » dans brancher > caméra et dans le menu de la puce, vitrine qui reprend le fond, rien d'enregistré.

- [ ] G1: typecheck et build passent
  CHECK: node .debug/check-fond.mjs build
  EXPECT: FOND_BUILD_OK
  EVIDENCE: pending

- [ ] G2: devant un fond chargé (escalier), le masque tombe dans l'ellipse et pas dehors : part masquée dans l'ellipse ≥ 0,6 et part masquée hors ellipse ≤ 0,03, à l'entrée, après 10 s immobile et après le geste ; salle vide : part masquée ≤ 0,01
  CHECK: node .debug/check-fond.mjs mask
  EXPECT: FOND_MASK_OK
  EVIDENCE: pending

- [ ] G3: un changement global d'exposition (×0,7 puis ×1,3, salle vide) ne fait pas apparaître de corps : part masquée ≤ 0,03 et p ≤ 0,3 sur 3 s ; contrôle positif : la même exposition SANS fond appris (repli luminance, comportement 0f909dd) fait monter p au-dessus de 0,5
  CHECK: node .debug/check-fond.mjs expo
  EXPECT: FOND_EXPO_OK
  EVIDENCE: pending

- [ ] G4: une ombre synthétique (×0,65) sous l'ellipse n'est pas prise pour un corps : part masquée dans la zone d'ombre ≤ 0,25 alors que la part dans l'ellipse reste ≥ 0,6
  CHECK: node .debug/check-fond.mjs shadow
  EXPECT: FOND_SHADOW_OK
  EVIDENCE: pending

- [ ] G5: « reprendre le fond » repart de zéro : confiance moyenne ≥ 0,8 avant, ≤ 0,1 juste après, puis remonte ≥ 0,8 ; le bouton et l'interrupteur existent dans brancher > caméra ET dans le menu de la puce, hors Chaos (def sans plage chaos), cibles ≥ 44 px
  CHECK: node .debug/check-fond.mjs reset
  EXPECT: FOND_RESET_OK
  EVIDENCE: pending

- [ ] G6: fond appris à off = comportement 0f909dd : le canal b du champ (readLuma) sur un fond statique est égal, texel par texel, à celui mesuré sur un serveur servant le commit 0f909dd (écart max ≤ 2/255) ; et à on, il en diffère (contrôle positif)
  CHECK: node .debug/check-fond.mjs off
  EXPECT: FOND_OFF_OK
  EVIDENCE: pending

- [ ] G7: fps et grains inchangés : palier de grains identique on / off, fps on ≥ 0,9 × fps off
  CHECK: node .debug/check-fond.mjs perf
  EXPECT: FOND_PERF_OK
  EVIDENCE: pending

- [ ] G8: la vitrine reprend le fond (entrée en vitrine → confiance ≤ 0,1 la seconde suivante) ; FR/EN complets pour les nouvelles clés ; aucun tiret cadratin dans i18n
  CHECK: node .debug/check-fond.mjs vitrine
  EXPECT: FOND_VITRINE_OK
  EVIDENCE: pending

- [ ] G9: relecture challenger (immobile imprimé, ombres / reflets, auto-exposition) faite avant le commit, ses objections traitées ou consignées
  EVIDENCE: pending

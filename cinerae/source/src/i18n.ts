// Two languages, one dictionary. Every visible word of the piece goes
// through t(); the choice is remembered locally, the browser's language is
// the default. v0.7.1c: labels are short and concrete — three words at
// most, never a metaphor; the hint carries the one-line explanation.

export type Lang = "fr" | "en";

const STORE = "cinerae-lang";

let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved === "fr" || saved === "en") return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
})();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  lang = next;
  try {
    localStorage.setItem(STORE, next);
  } catch {}
}

// [fr, en]
const DICT: Record<string, [string, string]> = {
  // ---- modes ---------------------------------------------------------------
  "mode.umbra": ["Umbra", "Umbra"],
  "mode.anima": ["Anima", "Anima"],
  "mode.pro": ["Pro", "Pro"],
  // ---- sections ------------------------------------------------------------
  "sec.scenes": ["scènes", "scenes"],
  "sec.corps": ["corps", "body"],
  "sec.geste": ["geste", "gesture"],
  "sec.musique": ["musique", "music"],
  "sec.particules": ["particules", "particles"],
  "sec.look": ["look", "look"],
  "sec.empreintes": ["empreintes", "imprints"],
  "sec.modulation": ["modulation", "modulation"],
  "sec.midi": ["midi", "midi"],
  "sec.aide": ["aide", "help"],
  // ---- controls: short, concrete, three words at most ----------------------
  "ctl.umbra": ["frôler ◀▶ bousculer", "graze ◀▶ shove"],
  "hint.umbra": [
    "à gauche la poussière me traverse, à droite mon corps la laboure",
    "left, the dust drifts through me — right, my body plows it",
  ],
  "ctl.presenceShare": ["part du corps", "body share"],
  "hint.presenceShare": [
    "combien de grains quittent le fond pour former la personne",
    "how many grains leave the field to form the person",
  ],
  "ctl.bodyMat": ["matière", "matter"],
  "hint.bodyMat": [
    "ce dont le corps est fait : fumée, encre, points…",
    "what the body is made of: smoke, ink, dots…",
  ],
  "ctl.presenceSize": ["taille", "size"],
  "hint.presenceSize": [
    "des grains plus gros, un portrait plus charnu",
    "bigger grains, a fleshier portrait",
  ],
  "ctl.presenceHold": ["serrage", "grip"],
  "hint.presenceHold": [
    "ce qui tient le portrait serré — parler le desserre",
    "what holds the portrait together — speaking loosens it",
  ],
  "ctl.elastic": ["élastique", "stretch"],
  "hint.elastic": [
    "le bras écarte les grains, ils reviennent — voilà jusqu'où",
    "an arm scatters the grains, they come back — this is how far",
  ],
  "ctl.presenceTrail": ["traînée", "wake"],
  "hint.presenceTrail": [
    "chaque mouvement laisse un sillage qui s'efface en quelques secondes",
    "every move leaves a wake that fades over a few seconds",
  ],
  "ctl.presenceSense": ["sensibilité", "sensitivity"],
  "hint.presenceSense": [
    "haut : la pièce me voit vite et me garde ; bas : il faut bouger",
    "high: the piece sees and keeps me easily; low: you must move",
  ],
  "ctl.corpsTint": ["lumière / ombre", "light / shadow"],
  "hint.corpsTint": [
    "les deux couleurs qui peignent le corps",
    "the two colors that paint the body",
  ],
  "ctl.push": ["poussée", "push"],
  "hint.push": [
    "mon bras repousse les grains devant lui, ils roulent en sillage derrière",
    "my arm shoves the grains ahead of it — they roll off in a wake behind",
  ],
  "ctl.gesture": ["vent", "wind"],
  "hint.gesture": [
    "un même geste souffle plus fort ou plus doux sur la poussière",
    "the same gesture blows harder or softer on the dust",
  ],
  "ctl.bodyMargin": ["marge", "margin"],
  "hint.bodyMargin": [
    "la poussière libre laisse une marge d'ombre autour du corps",
    "the free dust leaves a shadow margin around the body",
  ],
  "ctl.comet": ["comètes", "comets"],
  "hint.comet": [
    "un geste rapide arrache des grains qui filent en traits de feu",
    "a fast sweep tears grains off into streaks of fire",
  ],
  "ctl.force": ["force", "strength"],
  "hint.force": [
    "le poids du courant que le mouvement crée",
    "the weight of the current a movement creates",
  ],
  "ctl.viscosity": ["viscosité", "viscosity"],
  "hint.viscosity": [
    "un air épais freine tout, un air fin laisse tout filer",
    "thick air slows everything, thin air lets everything fly",
  ],
  "ctl.mirror": ["miroir", "mirror"],
  "hint.mirror": [
    "mon geste à droite pousse la poussière à droite",
    "my move to the right pushes the dust to the right",
  ],
  "ctl.windOverlay": ["voiles", "veils"],
  "hint.windOverlay": [
    "rendre le courant d'air visible en voiles lents",
    "make the air current visible as slow veils",
  ],
  "ctl.musicReact": ["réactivité", "reactivity"],
  "hint.musicReact": [
    "combien la musique secoue la poussière — graves, aigus, attaques",
    "how much the music shakes the dust — bass, highs, attacks",
  ],
  "ctl.bassGain": ["graves", "bass"],
  "hint.bassGain": [
    "les basses poussent la matière comme une pression sourde",
    "bass pushes the matter like a deep pressure",
  ],
  "ctl.trebleGain": ["aigus", "highs"],
  "hint.trebleGain": [
    "les sons clairs agitent la poussière en fines étincelles",
    "bright sounds stir the dust into fine sparks",
  ],
  "ctl.transientGain": ["attaques", "attacks"],
  "hint.transientGain": [
    "un claquement ou un beat disperse tout d'un coup",
    "a clap or a beat scatters everything at once",
  ],
  "ctl.danse": ["danse", "dance"],
  "hint.danse": [
    "les formes tournent, pompent et ondulent sur la musique",
    "shapes turn, pump and ripple with the music",
  ],
  "ctl.voiceEase": ["voix", "voice"],
  "hint.voiceEase": [
    "parler relâche le portrait ; se taire le resserre",
    "speaking relaxes the portrait; going quiet tightens it",
  ],
  "ctl.cymatic": ["cymatique", "cymatics"],
  "hint.cymatic": [
    "une note tenue aligne la poussière en figures de sable",
    "a held note aligns the dust into sand figures",
  ],
  "ctl.ember": ["braises", "embers"],
  "hint.ember": [
    "chaque attaque sonore fait naître quelques braises oranges",
    "each sonic attack births a few orange embers",
  ],
  "ctl.silence": ["seuil micro", "mic floor"],
  "hint.silence": [
    "sous ce niveau, le micro entend le silence",
    "below this level, the microphone hears silence",
  ],
  "ctl.tonal": ["seuil de note", "note floor"],
  "hint.tonal": [
    "plus c'est haut, plus il faut une note franche pour dessiner",
    "the higher, the cleaner the note must be to draw",
  ],
  "ctl.count": ["grains", "grains"],
  "hint.count": [
    "toute la réserve, jusqu'à 400 000 — la qualité auto veille",
    "the whole reserve, up to 400,000 — auto quality watches over it",
  ],
  "ctl.size": ["taille", "size"],
  "hint.size": ["du sable fin aux flocons", "from fine sand to flakes"],
  "ctl.turbulence": ["turbulence", "turbulence"],
  "hint.turbulence": [
    "le fourmillement permanent de la poussière",
    "the constant swarming of the dust",
  ],
  "ctl.breath": ["rafales", "gusts"],
  "hint.breath": [
    "au repos, un vent se lève parfois et couche tout du même côté",
    "at rest, a wind sometimes rises and bends everything one way",
  ],
  "ctl.filament": ["filaments", "filaments"],
  "hint.filament": [
    "au calme, la poussière se peigne en fibres lentes",
    "in stillness, the dust combs itself into slow fibers",
  ],
  "ctl.ashShare": ["cendre", "ash"],
  "hint.ashShare": [
    "la fraction de grains qui vit éteinte, en lit sombre",
    "the fraction of grains living dark, as a bed",
  ],
  "ctl.sediment": ["sédiment", "sediment"],
  "hint.sediment": [
    "la cendre glisse vers les bords et s'y dépose",
    "ash slides to the edges and settles there",
  ],
  "ctl.lifeCycle": ["cycle de vie", "life cycle"],
  "hint.lifeCycle": [
    "braise, blanc, cendre, retour — la durée d'une vie de grain",
    "ember, white, ash, return — the length of a grain's life",
  ],
  "ctl.timeScale": ["temps", "time"],
  "hint.timeScale": [
    "du gel au retour arrière — le temps de la matière",
    "from freeze to rewind — the matter's time",
  ],
  "ctl.trails": ["traînées", "trails"],
  "hint.trails": [
    "la lumière s'attarde derrière chaque grain, plus ou moins longtemps",
    "light lingers behind each grain, for longer or shorter",
  ],
  "ctl.memoryGain": ["mémoire", "memory"],
  "hint.memoryGain": [
    "là où l'on a bougé, un lit de cendre se souvient — un claquement l'efface",
    "where things moved, a bed of ash remembers — a clap wipes it",
  ],
  "ctl.memorySeconds": ["durée mémoire", "memory length"],
  "hint.memorySeconds": [
    "le temps que la cendre met à oublier",
    "the time the ash takes to forget",
  ],
  "ctl.imprintReturn": ["retour du titre", "title return"],
  "hint.imprintReturn": [
    "au long calme, le nom Cineræ se recompose seul",
    "after a long lull, the Cineræ name re-forms on its own",
  ],
  "ctl.fondMat": ["matière", "matter"],
  "hint.fondMat": [
    "la texture du fond : fumée, lignes, moiré…",
    "the texture of the field: smoke, lines, moiré…",
  ],
  "ctl.fondVisible": ["visibilité", "visibility"],
  "hint.fondVisible": [
    "quand quelqu'un est là, le fond s'efface jusqu'à ce niveau",
    "while someone is there, the field dims down to this level",
  ],
  "ctl.fondReact": ["suit le geste", "follows gestures"],
  "hint.fondReact": [
    "le vent du geste traverse aussi le fond — ou pas",
    "the gesture's wind also sweeps the field — or not",
  ],
  "ctl.ghost": ["fantôme", "ghost"],
  "hint.ghost": [
    "un voile à peine visible de l'image caméra — coupé par défaut",
    "a barely-there veil of the camera image — off by default",
  ],
  "ctl.colorDriver": ["la couleur suit", "color follows"],
  "hint.colorDriver": [
    "ce qui décide de la couleur d'un grain",
    "what decides a grain's color",
  ],
  "ctl.blendMode": ["fusion", "blend"],
  "hint.blendMode": [
    "comment les grains s'additionnent — jusqu'à l'encre sur papier",
    "how grains add up — all the way to ink on paper",
  ],
  "ctl.halo": ["halo", "halo"],
  "hint.halo": [
    "un souffle lumineux autour des zones denses",
    "a luminous breath around the dense areas",
  ],
  "ctl.paperGrain": ["grain papier", "paper grain"],
  "hint.paperGrain": [
    "la surface respire comme une feuille",
    "the surface breathes like a sheet",
  ],
  "ctl.strobe": ["strobe", "strobe"],
  "hint.strobe": [
    "les attaques sonores pincent la lumière, brièvement",
    "sonic attacks pinch the light, briefly",
  ],
  "ctl.fringe": ["frange", "fringe"],
  "hint.fringe": [
    "la couleur qui déborde sur les attaques sonores",
    "the color that bleeds on sonic attacks",
  ],
  "ctl.exposure": ["exposition", "exposure"],
  "hint.exposure": [
    "toute l'image plus sombre ou plus lumineuse",
    "the whole image, darker or brighter",
  ],
  "ctl.depthAmount": ["profondeur", "depth"],
  "hint.depthAmount": [
    "trois couches de poussière, proches et lointaines",
    "three layers of dust, near and far",
  ],
  "ctl.focusLayer": ["couche nette", "focus layer"],
  "hint.focusLayer": [
    "celle qui reste au point, les autres s'adoucissent",
    "the one in focus — the others soften",
  ],
  "ctl.dofBlur": ["flou", "blur"],
  "hint.dofBlur": [
    "les couches hors point fondent en disques doux",
    "out-of-focus layers melt into soft discs",
  ],
  "ctl.symMode": ["symétrie", "symmetry"],
  "hint.symMode": [
    "l'image se replie — miroir, quadrants, mandala",
    "the image folds — mirror, quadrants, mandala",
  ],
  "ctl.symN": ["branches", "branches"],
  "hint.symN": [
    "le nombre de pétales du mandala",
    "how many petals the mandala grows",
  ],
  "ctl.xfade": ["crossfade A ↔ B", "crossfade A ↔ B"],
  "hint.xfade": [
    "tout glisse d'un état à l'autre, sans à-coup, couleurs comprises",
    "everything glides between two states, colors included, no jump",
  ],
  "ctl.waveFreq": ["fréquence", "frequency"],
  "hint.waveFreq": ["des ondulations plus serrées", "tighter undulations"],
  "ctl.waveAmp": ["amplitude", "amplitude"],
  "hint.waveAmp": ["des vagues plus hautes", "taller waves"],
  "ctl.waveThick": ["épaisseur", "thickness"],
  "hint.waveThick": ["le trait de l'onde", "the wave's stroke"],
  "ctl.waveCount": ["nombre", "count"],
  "hint.waveCount": ["combien d'ondes superposées", "how many waves stacked"],
  "ctl.waveDrift": ["dérive", "drift"],
  "hint.waveDrift": ["la phase glisse toute seule", "the phase slides on its own"],
  "ctl.multiN": ["nombre", "count"],
  "hint.multiN": ["combien de formes semées", "how many shapes seeded"],
  "ctl.multiSize": ["taille", "size"],
  "hint.multiSize": ["la taille de chaque forme", "the size of each shape"],
  "ctl.spin": ["rotation", "spin"],
  "hint.spin": ["le volume tourne sur lui-même", "the volume turns on itself"],
  "ctl.lissaA": ["rythme a", "rhythm a"],
  "hint.lissaA": ["le rythme horizontal de la courbe", "the curve's horizontal rhythm"],
  "ctl.lissaB": ["rythme b", "rhythm b"],
  "hint.lissaB": ["le rythme vertical de la courbe", "the curve's vertical rhythm"],
  // ---- materials -----------------------------------------------------------
  "mat.fumee": ["fumée", "smoke"],
  "mat.liquide": ["liquide", "liquid"],
  "mat.encre": ["encre", "ink"],
  "mat.points": ["points", "dots"],
  "mat.dither": ["dither", "dither"],
  "mat.lignes": ["lignes", "lines"],
  "mat.moire": ["moiré", "moiré"],
  "mat.contours": ["contours", "outlines"],
  // ---- select options ------------------------------------------------------
  "opt.driverAge": ["l'âge du grain", "the grain's age"],
  "opt.driverSpeed": ["la vitesse", "speed"],
  "opt.driverDensity": ["la densité", "density"],
  "opt.driverDepth": ["la profondeur", "depth"],
  "opt.blendAdd": ["additif", "additive"],
  "opt.blendScreen": ["écran", "screen"],
  "opt.blendSoft": ["lumière tamisée", "soft light"],
  "opt.blendDodge": ["dodge", "dodge"],
  "opt.blendPaper": ["encre sur papier", "ink on paper"],
  "opt.layerFar": ["lointaine", "far"],
  "opt.layerMid": ["moyenne", "middle"],
  "opt.layerNear": ["proche", "near"],
  "opt.symNone": ["aucune", "none"],
  "opt.symH": ["miroir horizontal", "horizontal mirror"],
  "opt.symV": ["miroir vertical", "vertical mirror"],
  "opt.symQuad": ["quatre quadrants", "four quadrants"],
  "opt.symRadial": ["radiale (mandala)", "radial (mandala)"],
  // ---- verbal values -------------------------------------------------------
  "val.holdFree": ["poussière libre", "free dust"],
  "val.holdSoft": ["souple", "loose"],
  "val.holdElastic": ["élastique", "springy"],
  "val.holdRigid": ["portrait rigide", "rigid portrait"],
  "val.timeFrozen": ["gel", "frozen"],
  "val.timeRewind": ["retour", "rewind"],
  "val.timeNormal": ["normal", "normal"],
  "val.timeSlow": ["ralenti", "slowed"],
  "val.warm": ["chaude", "warm"],
  "val.cool": ["froide", "cool"],
  "val.neutral": ["neutre", "neutral"],
  // ---- switches ------------------------------------------------------------
  "sw.camera": ["caméra", "camera"],
  "sw.mic": ["micro", "microphone"],
  "sw.auto": ["qualité auto", "auto quality"],
  "sw.mirror": ["miroir", "mirror"],
  "sw.overlay": ["voiles", "veils"],
  "sw.imprintReturn": ["retour du titre", "title return"],
  "sw.randomImprint": ["aléatoire au calme", "random when calm"],
  "sw.lfoSync": ["sync attaques", "sync to attacks"],
  "sw.midiLearn": ["apprentissage", "learn"],
  "sw.rawCam": ["caméra brute", "raw camera"],
  "hint.rawCam": [
    "l'image caméra sans effets, pour calibrer — Pro seulement, jamais en public",
    "the plain camera image, for calibration — Pro only, never for the public",
  ],
  // ---- buttons -------------------------------------------------------------
  "btn.chaos": ["Chaos", "Chaos"],
  "btn.undo": ["Annuler le dernier chaos", "Undo the last chaos"],
  "hint.undo": [
    "revenir au réglage d'avant le dernier tirage — touche Z",
    "go back to before the last draw — Z key",
  ],
  "btn.reset": ["Reset", "Reset"],
  "btn.save": ["sauver", "save"],
  "btn.load": ["charger", "load"],
  "btn.fullscreen": ["plein écran", "fullscreen"],
  "btn.midiOn": ["activer le midi", "enable midi"],
  // ---- small UI ------------------------------------------------------------
  "ui.modulated": ["modulé", "modulated"],
  "ui.color": ["couleur", "color"],
  "ui.bg": ["fond", "background"],
  "ui.light": ["lumière", "light"],
  "ui.shadow": ["ombre", "shadow"],
  "ui.lfoRate": ["vitesse", "rate"],
  "ui.lfoAmp": ["ampleur", "amount"],
  "ui.lfoPhase": ["phase", "phase"],
  "ui.lfoTarget": ["cible", "target"],
  "ui.lfoDepth": ["profondeur", "depth"],
  "ui.links": ["liens", "links"],
  "ui.addLink": ["+ lien", "+ link"],
  "ui.midiTurn": ["tourner un potard pour lier…", "turn a knob to bind…"],
  "ui.midiTouch": [
    "toucher le nom d'un réglage, puis tourner un potard",
    "touch a setting's name, then turn a knob",
  ],
  "ui.midiSaved": [
    "liaisons enregistrées dans les scènes",
    "bindings are saved with scenes",
  ],
  "ui.freeText": ["texte libre…", "free text…"],
  "ui.pushL": ["frôler", "graze"],
  "ui.pushR": ["bousculer", "shove"],
  "ui.langSwitch": ["Switch to English", "Passer en français"],
  "ui.openPanel": ["Ouvrir les réglages", "Open the settings"],
  "ui.closePanel": ["Replier les réglages", "Collapse the settings"],
  "ui.togglePanel": [
    "Ouvrir ou fermer les réglages",
    "Open or close the settings",
  ],
  "ui.crystal": ["empreinte", "imprint"],
  // ---- sub-tab groups ------------------------------------------------------
  "grp.forme": ["forme", "shape"],
  "grp.tenue": ["tenue", "hold"],
  "grp.grains": ["grains", "grains"],
  "grp.temps": ["temps", "time"],
  "grp.teinte": ["teintes", "tints"],
  "grp.degrade": ["dégradé", "gradient"],
  "grp.fond": ["fond", "field"],
  "grp.lumiere": ["lumière", "light"],
  "grp.espace": ["espace", "space"],
  "grp.reglages": ["réglages", "settings"],
  "grp.modes": ["modes", "modes"],
  "grp.clavier": ["clavier", "keys"],
  "grp.gestes": ["gestes", "touch"],
  "grp.camext": ["caméra", "camera"],
  "grp.liens": ["liens", "links"],
  // ---- hints for rows without a def ---------------------------------------
  "hint.teinte": [
    "une teinte : la couleur de la poussière, de son fond à sa lumière",
    "a tint: the dust's color, from its ground to its light",
  ],
  "hint.scenes": [
    "une scène change tout : matière, temps, teinte",
    "a scene changes everything: matter, time, tint",
  ],
  "hint.save": [
    "enregistrer l'état complet dans un fichier local",
    "save the full state to a local file",
  ],
  "hint.load": ["charger une scène depuis un fichier", "load a scene from a file"],
  "hint.slotA": ["capturer l'état courant dans A", "capture the current state into A"],
  "hint.slotB": ["capturer l'état courant dans B", "capture the current state into B"],
  "hint.xfadeFlow": [
    "capturer → A, changer, capturer → B, puis morpher",
    "capture → A, change things, capture → B, then morph",
  ],
  "hint.png": ["une image PNG, enregistrée localement", "a PNG image, saved locally"],
  "hint.rec": ["une vidéo webm, enregistrée localement", "a webm video, saved locally"],
  "hint.fullscreen": [
    "le panneau et le curseur s'effacent tout seuls",
    "the panel and cursor fade away on their own",
  ],
  "hint.gradient": [
    "le dégradé de la poussière, 2 à 5 couleurs",
    "the dust's gradient, 2 to 5 colors",
  ],
  // ---- imprint families and variants --------------------------------------
  "fam.titre": ["titre", "title"],
  "fam.fond": ["fond", "field"],
  "fam.volume": ["volumes", "volumes"],
  "fam.forme": ["formes", "shapes"],
  "fam.math": ["math", "math"],
  "fam.fractale": ["fractales", "fractals"],
  "fam.ondes": ["ondes", "waves"],
  "fam.texte": ["texte", "text"],
  "fam.camera": ["caméra", "camera"],
  "fam.multi": ["multi", "multi"],
  "fam.image": ["image…", "image…"],
  "var.sphere": ["sphère", "sphere"],
  "var.cube": ["cube", "cube"],
  "var.cone": ["cône", "cone"],
  "var.tore": ["tore", "torus"],
  "var.cercle": ["cercle", "circle"],
  "var.anneau": ["anneau", "ring"],
  "var.carre": ["carré", "square"],
  "var.croix": ["croix", "cross"],
  "var.spirale": ["spirale", "spiral"],
  "var.etoile": ["étoile", "star"],
  "var.lissajous": ["lissajous", "lissajous"],
  "var.attracteur": ["attracteur", "attractor"],
  "var.chladni": ["chladni", "chladni"],
  "var.arbre": ["arbre", "tree"],
  "var.julia": ["julia", "julia"],
  "var.fougere": ["fougère", "fern"],
  "var.dragon": ["dragon", "dragon"],
  "var.sinus": ["sinus", "sine"],
  "var.triangle": ["triangle", "triangle"],
  "var.melange": ["mélange", "blend"],
  "var.gelee": ["image gelée", "frozen image"],
  "var.silhouette": ["silhouette", "silhouette"],
  // ---- tints and scenes ----------------------------------------------------
  "teinte.cendre": ["Cendre", "Ash"],
  "teinte.braise": ["Braise", "Ember"],
  "teinte.givre": ["Givre", "Frost"],
  "teinte.cuivre": ["Cuivre", "Copper"],
  "teinte.phosphore": ["Phosphore", "Phosphor"],
  "teinte.papier": ["Papier", "Paper"],
  "scene.veillee": ["Veillée", "Vigil"],
  "scene.givre-matin": ["Givre du matin", "Morning frost"],
  "scene.forge": ["Forge", "Forge"],
  "scene.maree": ["Marée", "Tide"],
  "scene.transe": ["Transe", "Trance"],
  "scene.encre": ["Encre", "Ink"],
  "scene.pulsar": ["Pulsar", "Pulsar"],
  "scene.canopee": ["Canopée", "Canopy"],
  // ---- statuses ------------------------------------------------------------
  "st.waiting": ["en attente", "waiting"],
  "st.camOn": ["caméra active", "camera on"],
  "st.camOff": ["sans caméra", "no camera"],
  "st.micOn": ["micro actif", "microphone on"],
  "st.micOff": ["sans micro", "no microphone"],
  "st.camRefused": ["caméra refusée — mode audio seul", "camera refused — audio only"],
  "st.micRefused": [
    "micro refusé — matière libre, non réactive",
    "microphone refused — free, non-reactive matter",
  ],
  "st.badPreset": ["scène illisible", "unreadable scene"],
  "st.captureFail": ["capture impossible", "capture failed"],
  "st.camInactive": [
    "caméra inactive — silhouette indisponible",
    "camera off — silhouette unavailable",
  ],
  "st.noSilhouette": [
    "silhouette introuvable — rien devant la caméra ?",
    "no silhouette found — nothing in front of the camera?",
  ],
  "st.emptyText": ["texte vide — rien à cristalliser", "empty text — nothing to crystallize"],
  "st.dropImage": [
    "déposer une image sur la scène, ou passer par image…",
    "drop an image on the stage, or use image…",
  ],
  "st.badImage": ["image sans matière exploitable", "image with nothing usable"],
  "st.unreadableImage": ["image illisible", "unreadable image"],
  // ---- overlay -------------------------------------------------------------
  "overlay.intro": [
    "Poussière de lumière pilotée par le mouvement et le son. La caméra n'est jamais affichée : seul son mouvement souffle sur les particules. La musique anime la matière, le corps la sculpte. Tout reste local, rien n'est enregistré ni envoyé.",
    "Dust of light driven by movement and sound. The camera is never shown: only its motion blows on the particles. Music animates the matter, the body sculpts it. Everything stays local — nothing is recorded or sent.",
  ],
  "overlay.startFull": ["Activer caméra + micro", "Enable camera + microphone"],
  "overlay.startAudio": ["Micro seul", "Microphone only"],
  "overlay.drop": [
    "déposer l'image — tout reste local",
    "drop the image — everything stays local",
  ],
  // ---- aide ----------------------------------------------------------------
  "aide.umbra": [
    "un seul curseur, du frôlement à la bousculade, et les teintes",
    "one slider, from a graze to a shove, plus the tints",
  ],
  "aide.anima": [
    "cinq sections : corps, geste, musique, particules, look",
    "five sections: body, gesture, music, particles, look",
  ],
  "aide.pro": [
    "tout, plus les scènes, le crossfade, la matrice et le MIDI",
    "everything, plus scenes, crossfade, the matrix and MIDI",
  ],
  "aide.key.f": ["plein écran", "fullscreen"],
  "aide.key.c": ["chaos", "chaos"],
  "aide.key.z": ["annule le dernier chaos", "undoes the last chaos"],
  "aide.key.r": ["reset", "reset"],
  "aide.key.p": ["image PNG", "PNG image"],
  "aide.key.v": ["vidéo webm", "webm video"],
  "aide.key.space": ["gèle le temps", "freezes time"],
  "aide.key.esc": ["replie le panneau", "folds the panel"],
  "aide.kspace": ["Espace", "Space"],
  "aide.kesc": ["Échap", "Esc"],
  "aide.touchTitle": ["tablette", "tablet"],
  "aide.touch": [
    "Toucher l'écran sème de la poussière sous le doigt ; glisser souffle un vent.",
    "Touching the screen seeds dust under your finger; dragging blows a wind.",
  ],
  "aide.ndiTitle": ["NDI, capture, OBS", "NDI, capture, OBS"],
  "aide.ndi": [
    "Une caméra NDI ou un flux OBS peut jouer ici : installer <a href=\"https://ndi.video/tools/\" target=\"_blank\" rel=\"noopener\">NDI Tools</a> (Windows), lancer l'outil <b>Webcam Input</b>, choisir la source — elle apparaît alors comme une webcam que la pièce peut ouvrir. Une carte de capture HDMI se présente déjà comme une webcam, rien à faire.",
    "An NDI camera or an OBS feed can play here: install <a href=\"https://ndi.video/tools/\" target=\"_blank\" rel=\"noopener\">NDI Tools</a> (Windows), run the <b>Webcam Input</b> tool, pick the source — it then shows up as a webcam the piece can open. An HDMI capture card already shows up as a webcam, nothing to do.",
  ],
  "aide.linktree": ["Linktree — Thomas Maury", "Linktree — Thomas Maury"],
};

export function t(key: string): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang === "fr" ? 0 : 1];
}

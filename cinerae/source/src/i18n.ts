// Two languages, one dictionary. Every visible word of the piece goes
// through t(); the choice is remembered locally, the browser's language is
// the default. The tone is the same in both: cool, direct, no jargon —
// a slider names a visible effect, its hint is one line that makes you
// want to move it.

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
  "sec.moi": ["qui je suis", "who I am"],
  "sec.geste": ["ce que fait mon geste", "what my gesture does"],
  "sec.voix": ["ce que fait ma voix", "what my voice does"],
  "sec.temps": ["le temps et la mémoire", "time and memory"],
  "sec.look": ["le look", "the look"],
  "sec.empreintes": ["empreintes", "imprints"],
  "sec.modulation": ["modulation", "modulation"],
  "sec.midi": ["midi", "midi"],
  "sec.aide": ["aide", "help"],
  // ---- controls: name the visible effect, never the source -----------------
  "ctl.umbra": ["frôler ◀▶ bousculer", "graze ◀▶ shove"],
  "hint.umbra": [
    "à gauche la poussière me traverse, à droite mon corps la laboure",
    "left, the dust drifts through me — right, my body plows it",
  ],
  "ctl.push": ["mon corps pousse", "my body pushes"],
  "hint.push": [
    "mon bras repousse les grains devant lui, ils roulent en sillage derrière",
    "my arm shoves the grains ahead of it — they roll off in a wake behind",
  ],
  "ctl.presenceShare": ["ma part de poussière", "my share of the dust"],
  "hint.presenceShare": [
    "combien de grains quittent le monde pour me former",
    "how many grains leave the world to form me",
  ],
  "ctl.count": ["combien de grains", "how many grains"],
  "hint.count": [
    "toute la réserve, jusqu'à 400 000 — la qualité auto veille sur la fluidité",
    "the whole reserve, up to 400,000 — auto quality keeps it fluid",
  ],
  "ctl.bodyMat": ["ma matière", "my matter"],
  "hint.bodyMat": [
    "ce dont je suis fait : fumée, encre, points…",
    "what I am made of: smoke, ink, dots…",
  ],
  "ctl.presenceTrail": ["ma traînée", "my wake"],
  "hint.presenceTrail": [
    "chaque mouvement laisse un sillage qui s'efface en quelques secondes",
    "every move leaves a wake that fades over a few seconds",
  ],
  "ctl.presenceHold": ["serrage", "grip"],
  "hint.presenceHold": [
    "ce qui me tient serré — parler me desserre, le silence me resserre",
    "what holds me together — speaking loosens it, silence tightens it",
  ],
  "ctl.elastic": ["élastique", "stretch"],
  "hint.elastic": [
    "mon bras écarte les grains, ils reviennent — voilà jusqu'où",
    "my arm scatters the grains, they come back — this is how far",
  ],
  "ctl.presenceSize": ["taille de mes grains", "size of my grains"],
  "hint.presenceSize": [
    "des grains plus gros, un portrait plus charnu",
    "bigger grains, a fleshier portrait",
  ],
  "ctl.presenceThreshold": [
    "ce qu'il faut bouger pour exister",
    "how much to move to exist",
  ],
  "hint.presenceThreshold": [
    "en dessous, la pièce ne me voit pas — respirer doit suffire",
    "below this, the piece can't see me — breathing should be enough",
  ],
  "ctl.presenceDelay": [
    "combien de temps la pièce me garde",
    "how long the piece keeps me",
  ],
  "hint.presenceDelay": [
    "immobile, je reste en poussière encore ce temps-là",
    "standing still, I remain in dust for this long",
  ],
  "ctl.corpsTint": ["teinte lumière / ombre", "light / shadow tint"],
  "hint.corpsTint": [
    "les deux couleurs qui me peignent : ma lumière, mon ombre",
    "the two colors that paint me: my light, my shadow",
  ],
  "ctl.gesture": ["mon geste souffle", "my gesture blows"],
  "hint.gesture": [
    "un même geste souffle plus fort ou plus doux sur la poussière",
    "the same gesture blows harder or softer on the dust",
  ],
  "ctl.bodyMargin": ["le monde s'écarte de moi", "the world steps aside"],
  "hint.bodyMargin": [
    "la poussière libre me laisse une marge d'ombre autour du corps",
    "the free dust leaves a shadow margin around my body",
  ],
  "ctl.comet": ["les gestes vifs arrachent des comètes", "sharp moves tear comets"],
  "hint.comet": [
    "un geste rapide arrache des grains qui filent en traits de feu",
    "a fast sweep tears grains off into streaks of fire",
  ],
  "ctl.force": ["force du vent", "wind strength"],
  "hint.force": [
    "le poids du courant que mon mouvement crée",
    "the weight of the current my movement creates",
  ],
  "ctl.viscosity": ["épaisseur de l'air", "thickness of the air"],
  "hint.viscosity": [
    "un air épais freine tout, un air fin laisse tout filer",
    "thick air slows everything, thin air lets everything fly",
  ],
  "ctl.mirror": ["miroir caméra", "camera mirror"],
  "hint.mirror": [
    "mon geste à droite pousse la poussière à droite",
    "my move to the right pushes the dust to the right",
  ],
  "ctl.windOverlay": ["voiles de vent", "wind veils"],
  "hint.windOverlay": [
    "rendre le courant d'air visible en voiles lents",
    "make the air current visible as slow veils",
  ],
  "ctl.bassGain": ["les graves font trembler", "lows make it tremble"],
  "hint.bassGain": [
    "les basses poussent la matière comme une pression sourde",
    "bass pushes the matter like a deep pressure",
  ],
  "ctl.trebleGain": ["les aigus font scintiller", "highs make it sparkle"],
  "hint.trebleGain": [
    "les sons clairs agitent la poussière en fines étincelles",
    "bright sounds stir the dust into fine sparks",
  ],
  "ctl.transientGain": ["les claquements dispersent", "claps scatter"],
  "hint.transientGain": [
    "un claquement de mains disperse tout d'un coup",
    "a handclap scatters everything at once",
  ],
  "ctl.voiceEase": ["ma voix me desserre", "my voice loosens me"],
  "hint.voiceEase": [
    "parler relâche mon portrait ; me taire le resserre",
    "speaking relaxes my portrait; going quiet tightens it",
  ],
  "ctl.cymatic": ["le chant dessine des figures", "song draws figures"],
  "hint.cymatic": [
    "une note tenue aligne la poussière en figures de sable",
    "a held note aligns the dust into sand figures",
  ],
  "ctl.ember": ["les éclats allument des braises", "bursts light embers"],
  "hint.ember": [
    "chaque attaque sonore fait naître quelques braises oranges",
    "each sonic attack births a few orange embers",
  ],
  "ctl.silence": ["ce qui compte comme silence", "what counts as silence"],
  "hint.silence": [
    "en dessous de ce niveau, la pièce entend le silence",
    "below this level, the piece hears silence",
  ],
  "ctl.tonal": ["netteté du chant requise", "how clear the song must be"],
  "hint.tonal": [
    "plus c'est haut, plus il faut une note franche pour dessiner",
    "the higher, the cleaner the note must be to draw",
  ],
  "ctl.timeScale": ["le temps", "time"],
  "hint.timeScale": [
    "du gel au retour arrière — le temps de la matière m'appartient",
    "from freeze to rewind — the matter's time is mine",
  ],
  "ctl.trails": ["traînées du monde", "the world's trails"],
  "hint.trails": [
    "la lumière s'attarde derrière chaque grain, plus ou moins longtemps",
    "light lingers behind each grain, for longer or shorter",
  ],
  "ctl.memoryGain": ["cendre mémoire", "memory ash"],
  "hint.memoryGain": [
    "là où l'on a bougé, un lit de cendre se souvient — un claquement l'efface",
    "where things moved, a bed of ash remembers — a clap wipes it",
  ],
  "ctl.memorySeconds": ["durée de la mémoire", "how long it remembers"],
  "hint.memorySeconds": [
    "le temps que la cendre met à oublier",
    "the time the ash takes to forget",
  ],
  "ctl.lifeCycle": ["cycle de la matière", "the matter's cycle"],
  "hint.lifeCycle": [
    "braise, blanc, cendre, retour — la durée d'une vie de grain",
    "ember, white, ash, return — the length of a grain's life",
  ],
  "ctl.silenceDelay": ["silence avant cristallisation", "silence before crystal"],
  "hint.silenceDelay": [
    "le calme qu'il faut tenir avant que l'empreinte prenne",
    "the stillness to hold before the imprint sets",
  ],
  "ctl.imprintReturn": ["retour de l'empreinte", "the imprint returns"],
  "hint.imprintReturn": [
    "au long silence, l'empreinte choisie se recompose seule",
    "in long silence, the chosen imprint re-forms on its own",
  ],
  "ctl.fondMat": ["matière du fond", "the world's matter"],
  "hint.fondMat": [
    "la texture du monde autour : fumée, lignes, moiré…",
    "the texture of the world around: smoke, lines, moiré…",
  ],
  "ctl.fondVisible": ["visible du fond", "how visible the world stays"],
  "hint.fondVisible": [
    "quand je suis là, le monde s'efface jusqu'à ce niveau",
    "while I am there, the world dims down to this level",
  ],
  "ctl.turbulence": ["agitation du fond", "the world's unrest"],
  "hint.turbulence": [
    "le fourmillement permanent de la poussière libre",
    "the constant swarming of the free dust",
  ],
  "ctl.fondReact": ["le fond suit mon geste", "the world follows my gesture"],
  "hint.fondReact": [
    "mon vent traverse aussi la poussière du fond — ou pas",
    "my wind also sweeps the background dust — or not",
  ],
  "ctl.colorDriver": ["la couleur suit", "color follows"],
  "hint.colorDriver": [
    "ce qui décide de la couleur d'un grain",
    "what decides a grain's color",
  ],
  "ctl.blendMode": ["fusion de la lumière", "how light fuses"],
  "hint.blendMode": [
    "comment les grains s'additionnent — jusqu'à l'encre sur papier",
    "how grains add up — all the way to ink on paper",
  ],
  "ctl.halo": ["halo", "halo"],
  "hint.halo": [
    "un souffle lumineux autour des zones denses",
    "a luminous breath around the dense areas",
  ],
  "ctl.paperGrain": ["grain du papier", "paper tooth"],
  "hint.paperGrain": [
    "la surface respire comme une feuille",
    "the surface breathes like a sheet",
  ],
  "ctl.depthAmount": ["profondeur", "depth"],
  "hint.depthAmount": [
    "trois couches de poussière, proches et lointaines",
    "three layers of dust, near and far",
  ],
  "ctl.focusLayer": ["couche nette", "sharp layer"],
  "hint.focusLayer": [
    "celle qui reste au point, les autres s'adoucissent",
    "the one in focus — the others soften",
  ],
  "ctl.dofBlur": ["flou de profondeur", "depth blur"],
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
  "ctl.strobe": ["stroboscope discret", "discreet strobe"],
  "hint.strobe": [
    "les attaques sonores pincent la lumière, brièvement",
    "sonic attacks pinch the light, briefly",
  ],
  "ctl.size": ["taille des grains", "grain size"],
  "hint.size": [
    "du sable fin aux flocons",
    "from fine sand to flakes",
  ],
  "ctl.exposure": ["exposition", "exposure"],
  "hint.exposure": [
    "toute l'image plus sombre ou plus lumineuse",
    "the whole image, darker or brighter",
  ],
  "ctl.fringe": ["teinte de la frange", "fringe tint"],
  "hint.fringe": [
    "la couleur qui déborde sur les attaques sonores",
    "the color that bleeds on sonic attacks",
  ],
  "ctl.breath": ["respiration", "breath"],
  "hint.breath": [
    "au repos, un vent se lève parfois et couche tout du même côté",
    "at rest, a wind sometimes rises and bends everything one way",
  ],
  "ctl.filament": ["filaments de repos", "resting filaments"],
  "hint.filament": [
    "au calme, la poussière se peigne en fibres lentes",
    "in stillness, the dust combs itself into slow fibers",
  ],
  "ctl.ashShare": ["part de cendre", "share of ash"],
  "hint.ashShare": [
    "la fraction de grains qui vit éteinte, en lit sombre",
    "the fraction of grains living dark, as a bed",
  ],
  "ctl.sediment": ["sédimentation", "sedimentation"],
  "hint.sediment": [
    "la cendre glisse vers les bords et s'y dépose",
    "ash slides to the edges and settles there",
  ],
  "ctl.ghost": ["fantôme caméra", "camera ghost"],
  "hint.ghost": [
    "un voile à peine visible de l'image caméra — coupé par défaut",
    "a barely-there veil of the camera image — off by default",
  ],
  "ctl.xfade": ["crossfade A ↔ B", "crossfade A ↔ B"],
  "hint.xfade": [
    "tout glisse d'un état à l'autre, sans à-coup, couleurs comprises",
    "everything glides between two states, colors included, no jump",
  ],
  "ctl.waveFreq": ["onde · fréquence", "wave · frequency"],
  "hint.waveFreq": ["des ondulations plus serrées", "tighter undulations"],
  "ctl.waveAmp": ["onde · amplitude", "wave · amplitude"],
  "hint.waveAmp": ["des vagues plus hautes", "taller waves"],
  "ctl.waveThick": ["onde · épaisseur", "wave · thickness"],
  "hint.waveThick": ["le trait de l'onde", "the wave's stroke"],
  "ctl.waveCount": ["onde · nombre", "wave · count"],
  "hint.waveCount": ["combien d'ondes superposées", "how many waves stacked"],
  "ctl.waveDrift": ["onde · dérive", "wave · drift"],
  "hint.waveDrift": ["la phase glisse toute seule", "the phase slides on its own"],
  "ctl.multiN": ["multi · nombre", "multi · count"],
  "hint.multiN": ["combien de formes semées", "how many shapes seeded"],
  "ctl.multiSize": ["multi · taille", "multi · size"],
  "hint.multiSize": ["la taille de chaque forme", "the size of each shape"],
  "ctl.spin": ["volume · rotation", "volume · spin"],
  "hint.spin": ["le volume tourne sur lui-même", "the volume turns on itself"],
  "ctl.lissaA": ["lissajous · a", "lissajous · a"],
  "hint.lissaA": ["le rythme horizontal de la courbe", "the curve's horizontal rhythm"],
  "ctl.lissaB": ["lissajous · b", "lissajous · b"],
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
  "opt.driverSpeed": ["la vitesse (calme → mouvement)", "speed (calm → motion)"],
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
  "sw.mirror": ["miroir caméra", "camera mirror"],
  "sw.overlay": ["voiles de vent", "wind veils"],
  "sw.imprintReturn": ["retour de l'empreinte", "the imprint returns"],
  "sw.randomImprint": ["aléatoire au long silence", "random on long silence"],
  "sw.lfoSync": ["sync transitoires", "sync to transients"],
  "sw.midiLearn": ["apprentissage", "learn"],
  // ---- buttons -------------------------------------------------------------
  "btn.chaos": ["Chaos", "Chaos"],
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
  "ui.crystal": ["cristal", "crystal"],
  // ---- hints for rows without a def ---------------------------------------
  "hint.teinte": [
    "une teinte : la couleur de la poussière, de son fond à sa lumière",
    "a tint: the dust's color, from its ground to its light",
  ],
  // ---- sub-tab groups ------------------------------------------------------
  "grp.corps": ["le corps", "the body"],
  "grp.tenue": ["la tenue", "the hold"],
  "grp.teinte": ["teintes", "tints"],
  "grp.degrade": ["dégradé", "gradient"],
  "grp.matiere": ["matière", "matter"],
  "grp.lumiere": ["lumière", "light"],
  "grp.espace": ["espace", "space"],
  "grp.vie": ["vie", "life"],
  "grp.forme": ["forme", "shape"],
  "grp.reglages": ["réglages", "settings"],
  "grp.modes": ["modes", "modes"],
  "grp.clavier": ["clavier", "keys"],
  "grp.gestes": ["gestes", "touch"],
  "grp.camext": ["caméra", "camera"],
  "grp.liens": ["liens", "links"],
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
    "le dégradé de la poussière libre, 2 à 5 couleurs",
    "the free dust's gradient, 2 to 5 colors",
  ],
  // ---- imprint families and variants --------------------------------------
  "fam.titre": ["titre", "title"],
  "fam.fond": ["fond", "field"],
  "fam.volume": ["volumes", "volumes"],
  "fam.forme": ["formes", "shapes"],
  "fam.math": ["math", "math"],
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
    "Poussière de lumière pilotée par le mouvement et le son. La caméra n'est jamais affichée : seul son mouvement souffle sur les particules. Le silence cristallise la matière, le son la fait fondre. Tout reste local, rien n'est enregistré ni envoyé.",
    "Dust of light driven by movement and sound. The camera is never shown: only its motion blows on the particles. Silence crystallizes the matter, sound melts it. Everything stays local — nothing is recorded or sent.",
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
    "cinq questions : qui je suis, mon geste, ma voix, le temps, le look",
    "five questions: who I am, my gesture, my voice, time, the look",
  ],
  "aide.pro": [
    "tout, plus les scènes, le crossfade, la matrice et le MIDI",
    "everything, plus scenes, crossfade, the matrix and MIDI",
  ],
  "aide.key.f": ["plein écran", "fullscreen"],
  "aide.key.c": ["chaos", "chaos"],
  "aide.key.r": ["reset", "reset"],
  "aide.key.p": ["image PNG", "PNG image"],
  "aide.key.v": ["vidéo webm", "webm video"],
  "aide.key.space": ["gèle le temps", "freezes time"],
  "aide.key.esc": ["replie le panneau", "folds the panel"],
  "aide.kspace": ["Espace", "Space"],
  "aide.kesc": ["Échap", "Esc"],
  "aide.touchTitle": ["tablette", "tablet"],
  "aide.touch": [
    "Toucher l'écran sème de la poussière sous le doigt ; glisser souffle un vent. Toucher le nom d'un curseur le fait se démontrer deux secondes.",
    "Touching the screen seeds dust under your finger; dragging blows a wind. Tap a slider's name and it demos itself for two seconds.",
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

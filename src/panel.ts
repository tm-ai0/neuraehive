// Settings panel, v0.7.2 — a finger understands it in ten seconds. A right
// drawer opened by a swipe from the right edge (or the edge tab), closed by
// a swipe to the right, a tap outside or Escape. Two modes: DÉMO shows four
// full-bar sliders named by what they do (matière, lumière, miroir,
// mémoire) and the bottom row CHAOS · ↶ · GARDER, nothing else; PRO keeps
// the same four sliders on top, then today's sections folded, each with
// its state summarized on its line (corps, empreinte, son, scènes,
// modulation, midi, caméra, réglages). v0.7.3 — DÉMO plays matière alone,
// Pro folds the sections into regarder / composer / brancher. v0.7.4 — Pro
// stacks nothing on top: each journey heads the page where it acts; one
// underlined row per meta, chips below; sources by device name. AIDE is
// five short pages. Every
// visible word goes through the FR/EN dictionary. The def registry is the
// single gate: presets, crossfade, Chaos (per-def flag + range), matrix and
// MIDI reach every setting through it. Z and ↶ step one gesture back.
import { IMPRINT_VARIANTS, type ImprintFamily, type ImprintSettings } from "./imprints";
import type { CameraFacing, MediaDevice } from "./camera";
import { cloneLookColors, PALETTES, type LookColors, type Rgb } from "./look";
import { getLang, setLang, t } from "./i18n";
import type { Midi } from "./midi";
import {
  LFO_SHAPES,
  TEMPO_DIVS,
  type LfoShape,
  type ModLink,
  type ModMatrix,
  type ParamRef,
} from "./modmatrix";
import type { PresetData, Presets } from "./presets";
import type { Tuning } from "./renderer";

export type PanelMode = "demo" | "pro";

export interface PanelState {
  tuning: Tuning;
  audio: {
    silenceThreshold: number;
    bassGain: number;
    trebleGain: number;
    transientGain: number;
    tonalThreshold: number;
  };
  quality: { auto: boolean; cap: number };
  behavior: {
    presenceSense: number;
    /** v0.7.1e — the tempo follows the music's own beats when on. */
    tempoAuto: boolean;
    /** v0.7.1f — seconds of full silence before a random imprint draw. */
    silenceDelay: number;
    /** v0.7.2 — front or rear camera (the tablet demo films with the rear). */
    cameraFacing: CameraFacing;
    /** v0.7.4 — a chosen camera / microphone by device id ("" = automatic),
     * kept in localStorage; the facing chips stay the fallback when the
     * machine gives no device names. */
    cameraId: string;
    micId: string;
    /** v0.7.2 — the showcase after 20 s without a touch. */
    vitrine: boolean;
  };
  imprint: ImprintSettings;
  colors: LookColors;
  /** v0.7.4 — the sources the machine offers, refreshed by the host. */
  devices: { cameras: MediaDevice[]; mics: MediaDevice[] };
}

export interface PanelHooks {
  onSensor(kind: "camera" | "mic", enabled: boolean): void;
  onCameraFacing(facing: CameraFacing): void;
  /** v0.7.4 — a device picked from the list ("" = automatic). */
  onCameraDevice(id: string): void;
  onMicDevice(id: string): void;
  /** v0.7.5 — the engine's own camera stream, for the head menu's thumbnail
   * (same capture, no second getUserMedia); null when the camera is off. */
  getCameraStream(): MediaStream | null;
  /** v0.7.6 — relearn the room from the next camera frame. */
  onBgReset(): void;
  onChaos(): void;
  onReset(): void;
  onInteraction(): void;
  onImprintSelect(family: ImprintFamily, variant: string): void;
  onImprintText(text: string): void;
  onImprintFile(file: File): void;
  onImprintParams(): void;
  onCrossfade(value: number): void;
  getXfade(): number;
  onPaletteSelect(name: string): void;
  onCapturePng(): void;
  onToggleRecord(): boolean;
  onFullscreen(): void;
  /** v0.7.2 — GARDER: the souvenir (PNG + 4 s loop + QR). */
  onKeep(): void;
  /** Language switched: the host refreshes its own texts (overlay, status). */
  onLang(): void;
  getPresets(): Presets | undefined;
  getMod(): ModMatrix | undefined;
  getMidi(): Midi | undefined;
}

type SectionId =
  | "corps"
  | "empreinte"
  | "son"
  | "scenes"
  | "modulation"
  | "midi"
  | "camera"
  | "reglages";

interface ControlDef extends ParamRef {
  section: SectionId;
  /** Sub-tab of a grouped section this row belongs to. */
  group?: string;
  format?: (v: number) => string;
  /** Extra gate (imprint family params, gated look rows). */
  visible?: () => boolean;
  /** Render as a <select> of these options instead of a slider. */
  options?: () => { value: number; label: string }[];
  /** Moving it reveals or hides other rows: re-render on release. */
  reveals?: boolean;
  /** v0.7.2 — the words written under a big slider, left to right. */
  ends?: string[];
}

const percent = (v: number) => `${Math.round(v * 100)} %`;
const hundred = (v: number) => String(Math.round(v * 100));
const thousands = (v: number) =>
  v >= 999_500 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} M` : `${Math.round(v / 1000)} k`;
const plain = (v: number) =>
  Number(v)
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "");

const rgbToHex = (c: Rgb) =>
  "#" +
  c
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
const hexToRgb = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];

const CHEVRON = `<svg class="cinerae-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>`;

// The Linktree mark, redrawn as a minimal asterisk-tree.
const LINKTREE_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M8 1.5v7M8 8.5 3.2 4.9M8 8.5l4.8-3.6M2.4 8.5h11.2M8 8.5v6"/></svg>`;

const MATERIAL_KEYS = [
  "fumee",
  "liquide",
  "encre",
  "points",
  "dither",
  "lignes",
  "moire",
  "contours",
  "eclats",
] as const;

// Sub-tabs of the grouped sections: short pages inside a folded section.
const SECTION_GROUPS: Partial<Record<SectionId, string[]>> = {
  corps: ["forme", "tenue", "geste"],
  reglages: ["grains", "temps", "teinte", "degrade", "fond", "lumiere", "espace", "systeme"],
};

const SECTION_ORDER: SectionId[] = [
  "corps",
  "empreinte",
  "son",
  "scenes",
  "modulation",
  "midi",
  "camera",
  "reglages",
];

// v0.7.3 — Pro folds the eight sections into three meta-sections, each a
// details with its sections as sub-tabs: regarder (corps, empreinte, son),
// composer (scènes, modulation), brancher (midi, caméra, réglages).
type MetaId = "regarder" | "composer" | "brancher";
const META_ORDER: MetaId[] = ["regarder", "composer", "brancher"];
const META_SECTIONS: Record<MetaId, SectionId[]> = {
  regarder: ["corps", "empreinte", "son"],
  composer: ["scenes", "modulation"],
  brancher: ["midi", "camera", "reglages"],
};

const AIDE_PAGES = ["demo", "gestes", "garder", "pro", "liens"] as const;
type AidePage = (typeof AIDE_PAGES)[number];

// v0.7.1d — a journey slider travels through a designed arc: piecewise
// smooth interpolation through control points; every curve passes through
// the component's default at the slider's home position.
type Journey = [number, number][];
const journey = (m: number, pts: Journey): number => {
  if (m <= pts[0]![0]) return pts[0]![1];
  for (let k = 1; k < pts.length; k++) {
    const [x1, v1] = pts[k]!;
    if (m <= x1) {
      const [x0, v0] = pts[k - 1]!;
      const u = (m - x0) / Math.max(1e-6, x1 - x0);
      const e = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * e;
    }
  }
  return pts[pts.length - 1]![1];
};

// v0.7.1f — the undo journal covers every gesture, not only Chaos.
const GESTURE_MAX = 20;

export function createPanel(
  root: HTMLElement,
  state: PanelState,
  hooks: PanelHooks
) {
  let mode: PanelMode = "demo";
  let aideOpen = false;
  let aidePage: AidePage = "demo";
  let open = false;
  let sensors = { camera: false, mic: false };
  let midiLearn = false;
  let lastScene = "";
  let fpsShown = 0;
  // v0.7.3 — which meta-sections are unfolded and which sub-tab each shows;
  // openSections mirrors the sections currently visible (a tab of an open
  // meta), for the live syncs that only run while a section is on screen.
  const openMetas = new Set<MetaId>(["regarder"]);
  const metaTab: Record<MetaId, SectionId> = { regarder: "corps", composer: "scenes", brancher: "midi" };
  const openSections = new Set<SectionId>();
  const groupOpen: Partial<Record<SectionId, string>> = {};

  // ----- the registry -------------------------------------------------------
  // Every setting is a def: label + hint from the dictionary, its section,
  // and the chaos flag/range when Chaos may draw it.
  const def = (
    key: string,
    section: SectionId,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    extra: Partial<ControlDef> = {}
  ): ControlDef => ({
    key,
    section,
    min,
    max,
    step,
    get,
    set,
    get label() {
      return t(`ctl.${key}`);
    },
    ...extra,
  });

  const matOptions = () =>
    MATERIAL_KEYS.map((k, i) => ({ value: i, label: t(`mat.${k}`) }));

  // ---- the journey sliders, one dimension each ----------------------------
  // v0.7.2 — DÉMO plays four: matière (what the body is made of, from free
  // dust to a crystal portrait), lumière (night to day, an exposure), miroir
  // (the fold, its value the number of axes) and mémoire (instant to
  // sediment: trails, ash bed, settling). mouvement and couleur stay in Pro.
  // They are ordinary registry defs (captured by scenes, traversed by the
  // crossfade, drawn by Chaos, modulation targets); their writes cascade
  // through writeDef, and the component defs, written after them in
  // registry order, always win when both are driven.
  const macroValues: Record<string, number> = {
    matiere: 0.35,
    eclipse: 0.65,
    memoire: 0.2,
    maree: 0.42,
    prisme: 0,
  };
  const MACRO_CURVES: Record<string, Record<string, Journey>> = {
    // matière — poussière (free dust that drifts through me) · fumée (the
    // home smoke portrait) · encre (ink body, long brush wake) · cristal
    // (a rigid screen of points, held tight).
    matiere: {
      bodyMat: [[0, 0], [0.35, 0], [0.66, 2], [1, 3]],
      presenceHold: [[0, 0], [0.35, 0.6], [0.66, 0.75], [1, 1]],
      elastic: [[0, 1], [0.35, 0.6], [1, 0.15]],
      presenceShare: [[0, 0.45], [0.35, 0.7], [1, 0.85]],
      presenceTrail: [[0, 1], [0.35, 2.5], [0.66, 3.5], [1, 1.2]],
      push: [[0, 0.2], [0.35, 1], [1, 1.4]],
    },
    // lumière — v0.7.1g, it reads like an exposure. 0 = night bedded in
    // ash, the home daylight at 0.65 (the corona on the way up), 1 = washed
    // full day.
    eclipse: {
      exposure: [[0, 0.55], [0.3, 1.1], [0.65, 1.6], [1, 2.7]],
      compBright: [[0, 0.38], [0.38, 1.15], [0.65, 1], [1, 1.5]],
      halo: [[0, 0.35], [0.38, 0.9], [0.65, 0], [1, 0]],
      contrast: [[0, 0.85], [0.3, 0.45], [0.65, 0], [1, 0]],
      ashShare: [[0, 0.33], [0.65, 0.15], [1, 0.07]],
      paperGrain: [[0, 0.65], [0.65, 0], [1, 0]],
      fondVisible: [[0, 0.06], [0.65, 0.35], [1, 0.75]],
      bodyMargin: [[0, 1.9], [0.65, 1], [1, 0.4]],
    },
    // mémoire — instantané (short trails, no ash bed) to sédiment (light
    // lingers, an ash bed remembers, ash settles at the edges).
    memoire: {
      trails: [[0, 0.55], [0.2, 0.9], [1, 0.985]],
      memoryGain: [[0, 0], [0.2, 0], [0.6, 0.25], [1, 0.6]],
      memorySeconds: [[0, 4], [0.2, 12], [1, 45]],
      sediment: [[0, 0.1], [0.2, 0.6], [1, 1.8]],
    },
    // mouvement (Pro) — an oily sea of big slow flakes, the home tide, then
    // a storm of fine fast spray.
    maree: {
      force: [[0, 0.25], [0.42, 1.2], [0.75, 2.7], [1, 2.4]],
      viscosity: [[0, 6.8], [0.42, 2.2], [0.75, 1.1], [1, 0.7]],
      turbulence: [[0, 0.05], [0.42, 0.55], [0.8, 1.2], [1, 1.95]],
      size: [[0, 3.6], [0.42, 1.55], [1, 1.0]],
      breath: [[0, 0.1], [0.42, 1], [1, 1.95]],
      filament: [[0, 1.6], [0.42, 1], [1, 0.15]],
      timeScale: [[0, 0.3], [0.42, 1], [1, 1]],
    },
    // couleur (Pro) — it only colors: the hue turns the whole frame, the
    // driver changes what paints each grain.
    prisme: {
      compHue: [[0, 0], [0.5, 0.35], [1, 0.85]],
      colorDriver: [[0, 0], [0.45, 1], [1, 1.9]],
    },
  };
  const setMacro = (key: string, v: number) => {
    macroValues[key] = v;
    const curves = MACRO_CURVES[key]!;
    for (const [target, pts] of Object.entries(curves)) {
      writeDef(target, journey(v, pts));
    }
    syncKeys(Object.keys(curves));
  };
  const macroDef = (
    key: string,
    section: SectionId,
    chaos: [number, number],
    extra: Partial<ControlDef> = {}
  ): ControlDef =>
    def(key, section, 0, 1, 0.005,
      () => macroValues[key]!, (v) => setMacro(key, v),
      { format: hundred, chaos, ...extra });

  const controls: ControlDef[] = [
    // ---- the journeys first: on a preset or crossfade write, their cascade
    // lands before the component defs' own values overwrite it ------------
    // v0.7.4 — Pro no longer stacks them on top: each journey heads the page
    // where it acts (matière in corps > forme, lumière in réglages >
    // lumière, mémoire in réglages > temps, miroir in réglages > espace).
    // Démo still plays matière alone on top.
    macroDef("matiere", "corps", [0.05, 0.95], {
      ends: ["end.poussiere", "end.fumee", "end.encre", "end.cristal"],
      group: "forme",
    }),
    // v0.7.1g — Chaos draws lumière inside the measured readable range.
    macroDef("eclipse", "reglages", [0.15, 0.85], { ends: ["end.nuit", "end.jour"], group: "lumiere" }),
    macroDef("memoire", "reglages", [0, 0.8], { ends: ["end.instantane", "end.sediment"], group: "temps" }),
    macroDef("maree", "corps", [0.1, 0.95], { group: "geste" }),
    macroDef("prisme", "reglages", [0, 0.9], { group: "teinte" }),
    // v0.7.1g — miroir: the one fold slider, its value the number of axes.
    // 0 none, 1 one axis, 2 quadrants, 3..8 the radial mandala. Continuous
    // in between (the shaders blend fractional folds, so the crossfade and
    // the LFOs never jump); the hidden symMode/symN below stay the engine
    // components and, written after this def, always win when a scene
    // carries them. v0.7.2 — capped at 8 axes, the demo's reach. v0.7.4 —
    // declared here so it heads réglages > espace.
    def("miroir", "reglages", 0, 8, 1,
      () => {
        const m = state.tuning.symMode;
        if (m >= 4) return Math.max(3, state.tuning.symN);
        if (m > 3) return 2 + (m - 3);
        if (m > 1) return 1 + (m - 1) / 2;
        return m;
      },
      (v) => {
        if (v <= 1) {
          state.tuning.symMode = v;
        } else if (v <= 2) {
          state.tuning.symMode = 1 + (v - 1) * 2;
        } else if (v <= 3) {
          state.tuning.symMode = 3 + (v - 2);
          state.tuning.symN = 3;
        } else {
          state.tuning.symMode = 4;
          state.tuning.symN = Math.min(12, v);
        }
      },
      {
        chaos: [0, 8],
        chaosSnap: true,
        group: "espace",
        ends: ["end.aucun", "end.axes8"],
        format: (v) =>
          v < 0.5
            ? t("val.mirNone")
            : `${Math.round(v)} ${Math.round(v) > 1 ? t("val.axes") : t("val.axe")}`,
      }),
    def("symMode", "reglages", 0, 4, 0.01,
      () => state.tuning.symMode, (v) => (state.tuning.symMode = v),
      { hidden: true }),
    def("symN", "reglages", 3, 12, 0.01,
      () => state.tuning.symN, (v) => (state.tuning.symN = v),
      { hidden: true }),
    // ---- corps -----------------------------------------------------------
    def("presenceShare", "corps", 0.1, 1, 0.01,
      () => state.tuning.presenceShare, (v) => (state.tuning.presenceShare = v),
      { format: percent, chaos: [0.35, 1], group: "forme" }),
    def("bodyMat", "corps", 0, 8, 1,
      () => state.tuning.bodyMat, (v) => {
        state.tuning.bodyMat = v;
        state.tuning.matBlend = 0; // the hand takes over from the crossfade
      },
      { discrete: true, options: matOptions, chaos: [0, 8], chaosSnap: true, group: "forme" }),
    // v0.7.4 — corps net: the live body (this frame's grains) lifted above
    // the field and the wake by a contrast floor. Chaos never draws it low
    // enough to lose the person.
    def("corpsNet", "corps", 0, 1, 0.01,
      () => state.tuning.corpsNet, (v) => (state.tuning.corpsNet = v),
      { format: percent, chaos: [0.25, 0.7], group: "forme" }),
    // éclats: the tint of a shoved grain — 0 = the scene's fixed light tint
    // (brightness alone follows the shove), 1 = a hue drawn from the
    // direction of its own flight.
    def("eclatsHue", "corps", 0, 1, 0.01,
      () => state.tuning.eclatsHue, (v) => (state.tuning.eclatsHue = v),
      {
        format: percent, chaos: [0.4, 1], group: "forme",
        // Only shown while a layer (or a crossfade end) is made of éclats.
        visible: () => {
          const tn = state.tuning;
          return [tn.bodyMat, tn.fondMat, tn.bodyMatA, tn.bodyMatB, tn.fondMatA, tn.fondMatB]
            .some((m) => m > 7.5);
        },
      }),
    def("presenceSize", "corps", 0.6, 3, 0.05,
      () => state.tuning.presenceSize, (v) => (state.tuning.presenceSize = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.8, 2.4], group: "forme" }),
    def("presenceHold", "corps", 0, 1, 0.01,
      () => state.tuning.presenceHold, (v) => (state.tuning.presenceHold = v),
      {
        format: (v) =>
          v < 0.05
            ? t("val.holdFree")
            : v < 0.4
              ? t("val.holdSoft")
              : v < 0.8
                ? t("val.holdElastic")
                : t("val.holdRigid"),
        chaos: [0.2, 1],
        group: "tenue",
      }),
    def("elastic", "corps", 0, 1, 0.01,
      () => state.tuning.elastic, (v) => (state.tuning.elastic = v),
      { format: percent, chaos: [0.2, 1], group: "tenue" }),
    def("presenceTrail", "corps", 0, 5, 0.1,
      () => state.tuning.presenceTrail, (v) => (state.tuning.presenceTrail = v),
      { format: (v) => `${plain(v)} s`, chaos: [0.5, 4], group: "tenue" }),
    // One knob replaces threshold + delay: how eagerly the piece sees and
    // keeps a person. 50 % = the validated defaults.
    def("presenceSense", "corps", 0, 1, 0.01,
      () => state.behavior.presenceSense,
      (v) => (state.behavior.presenceSense = v),
      { format: percent, group: "tenue" }),
    // ---- geste (a page of corps) ----------------------------------------
    def("push", "corps", 0, 2, 0.05,
      () => state.tuning.push, (v) => (state.tuning.push = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.8], group: "geste" }),
    def("gesture", "corps", 0.3, 3, 0.05,
      () => state.tuning.gestureGain, (v) => (state.tuning.gestureGain = v),
      { format: (v) => `×${plain(v)}`, group: "geste" }),
    def("bodyMargin", "corps", 0, 2, 0.05,
      () => state.tuning.bodyMargin, (v) => (state.tuning.bodyMargin = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.6], group: "geste" }),
    def("comet", "corps", 0, 2, 0.05,
      () => state.tuning.cometGain, (v) => (state.tuning.cometGain = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6], group: "geste" }),
    def("force", "corps", 0, 3, 0.05,
      () => state.tuning.force, (v) => (state.tuning.force = v),
      { chaos: [0.6, 2.6], group: "geste" }),
    def("viscosity", "corps", 0, 8, 0.1,
      () => state.tuning.viscosity, (v) => (state.tuning.viscosity = v),
      { chaos: [0.8, 5.5], group: "geste" }),
    def("mirror", "camera", 0, 1, 1,
      () => state.tuning.mirror, (v) => (state.tuning.mirror = v),
      { hidden: true }),
    // ---- son -------------------------------------------------------------
    def("bassGain", "son", 0, 2, 0.05,
      () => state.audio.bassGain, (v) => (state.audio.bassGain = v),
      { format: (v) => percent(v / 2) }),
    def("trebleGain", "son", 0, 2, 0.05,
      () => state.audio.trebleGain, (v) => (state.audio.trebleGain = v),
      { format: (v) => percent(v / 2) }),
    def("transientGain", "son", 0, 2, 0.05,
      () => state.audio.transientGain, (v) => (state.audio.transientGain = v),
      { format: (v) => percent(v / 2) }),
    // v0.7.1d — how visibly each band of the sound registers: bass = mass,
    // low mids = breadth, mids = color, treble = sparkle, accents = shock.
    def("soundFx", "son", 0, 2, 0.05,
      () => state.tuning.soundFx, (v) => (state.tuning.soundFx = v),
      { format: (v) => percent(v / 2), chaos: [0.5, 1.8] }),
    def("voiceEase", "son", 0, 1, 0.01,
      () => state.tuning.voiceEase, (v) => (state.tuning.voiceEase = v),
      { format: percent }),
    def("cymatic", "son", 0, 2, 0.05,
      () => state.tuning.cymGain, (v) => (state.tuning.cymGain = v),
      { format: (v) => percent(v / 2) }),
    def("ember", "son", 0, 2, 0.05,
      () => state.tuning.emberGain, (v) => (state.tuning.emberGain = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6] }),
    def("tonal", "son", 0.5, 0.95, 0.01,
      () => state.audio.tonalThreshold,
      (v) => (state.audio.tonalThreshold = v)),
    def("silence", "son", 0.001, 0.15, 0.001,
      () => state.audio.silenceThreshold,
      (v) => (state.audio.silenceThreshold = v)),
    // ---- réglages: grains ------------------------------------------------
    def("count", "reglages", 10_000, 1_000_000, 10_000,
      () => state.tuning.count, (v) => (state.tuning.count = v),
      { format: thousands, group: "grains" }),
    // v0.7.1d — the Pro ceiling auto quality may climb to, never beyond.
    def("countCap", "reglages", 400_000, 1_000_000, 50_000,
      () => state.quality.cap, (v) => (state.quality.cap = v),
      { format: thousands, group: "grains" }),
    def("size", "reglages", 0.8, 5, 0.1,
      () => state.tuning.pointSize, (v) => (state.tuning.pointSize = v),
      { format: (v) => `${plain(v)} px`, group: "grains" }),
    def("turbulence", "reglages", 0, 2, 0.05,
      () => state.tuning.turbulence, (v) => (state.tuning.turbulence = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.5], group: "grains" }),
    def("breath", "reglages", 0, 2, 0.05,
      () => state.tuning.gustStrength, (v) => (state.tuning.gustStrength = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.8], group: "grains" }),
    def("filament", "reglages", 0, 2, 0.05,
      () => state.tuning.filament, (v) => (state.tuning.filament = v),
      { chaos: [0, 2], group: "grains" }),
    def("ashShare", "reglages", 0.05, 0.35, 0.01,
      () => state.tuning.ashShare, (v) => (state.tuning.ashShare = v),
      { format: percent, group: "grains" }),
    def("sediment", "reglages", 0, 2, 0.05,
      () => state.tuning.sediment, (v) => (state.tuning.sediment = v),
      { group: "grains" }),
    def("lifeCycle", "reglages", 15, 120, 1,
      () => state.tuning.lifeSeconds, (v) => (state.tuning.lifeSeconds = v),
      { format: (v) => `${Math.round(v)} s`, group: "grains" }),
    // ---- réglages: temps -------------------------------------------------
    def("timeScale", "reglages", -1, 1, 0.01,
      () => state.tuning.timeScale, (v) => (state.tuning.timeScale = v),
      {
        group: "temps",
        format: (v) =>
          Math.abs(v) < 0.02
            ? t("val.timeFrozen")
            : v < 0
              ? `${t("val.timeRewind")} ×${plain(-v)}`
              : v > 0.95
                ? t("val.timeNormal")
                : `${t("val.timeSlow")} ×${plain(v)}`,
      }),
    def("trails", "reglages", 0.4, 0.995, 0.005,
      () => state.tuning.trailDecay, (v) => (state.tuning.trailDecay = v),
      { format: (v) => percent((v - 0.4) / 0.595), chaos: [0.7, 0.95], group: "temps" }),
    def("memoryGain", "reglages", 0, 1, 0.01,
      () => state.tuning.memoryGain, (v) => (state.tuning.memoryGain = v),
      { format: percent, reveals: true, chaos: [0, 0.5], group: "temps" }),
    def("memorySeconds", "reglages", 2, 60, 1,
      () => state.tuning.memorySeconds, (v) => (state.tuning.memorySeconds = v),
      {
        format: (v) => `${Math.round(v)} s`,
        visible: () => state.tuning.memoryGain > 0.001,
        group: "temps",
      }),
    // v0.7.1f — "au silence": the delay before a random imprint draw.
    def("silenceDelay", "scenes", 5, 120, 1,
      () => state.behavior.silenceDelay,
      (v) => (state.behavior.silenceDelay = v),
      { format: (v) => `${Math.round(v)} s` }),
    // ---- réglages: teinte / fond / lumière / espace ----------------------
    def("compHue", "reglages", 0, 1, 0.005,
      () => state.tuning.compHue, (v) => (state.tuning.compHue = v),
      { format: (v) => `${Math.round(v * 360)}°`, chaos: [0, 1], group: "teinte" }),
    def("colorDriver", "reglages", 0, 3, 1,
      () => state.tuning.colorDriver, (v) => (state.tuning.colorDriver = v),
      {
        discrete: true,
        chaos: [0, 3],
        chaosSnap: true,
        group: "teinte",
        options: () => [
          { value: 0, label: t("opt.driverAge") },
          { value: 1, label: t("opt.driverSpeed") },
          { value: 2, label: t("opt.driverDensity") },
          { value: 3, label: t("opt.driverDepth") },
        ],
      }),
    def("blendMode", "reglages", 0, 4, 1,
      () => state.tuning.blendMode, (v) => (state.tuning.blendMode = v),
      {
        discrete: true,
        chaos: [0, 3],
        chaosSnap: true,
        group: "teinte",
        options: () => [
          { value: 0, label: t("opt.blendAdd") },
          { value: 1, label: t("opt.blendScreen") },
          { value: 2, label: t("opt.blendSoft") },
          { value: 3, label: t("opt.blendDodge") },
          { value: 4, label: t("opt.blendPaper") },
        ],
      }),
    def("fondMat", "reglages", 0, 8, 1,
      () => state.tuning.fondMat, (v) => {
        state.tuning.fondMat = v;
        state.tuning.matBlend = 0;
      },
      { discrete: true, options: matOptions, chaos: [0, 8], chaosSnap: true, group: "fond" }),
    def("fondVisible", "reglages", 0, 1, 0.01,
      () => state.tuning.fondVisible, (v) => (state.tuning.fondVisible = v),
      { format: percent, chaos: [0.15, 0.8], group: "fond" }),
    def("fondReact", "reglages", 0, 2, 0.05,
      () => state.tuning.fondReact, (v) => (state.tuning.fondReact = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6], group: "fond" }),
    def("ghost", "camera", 0, 0.35, 0.005,
      () => state.tuning.ghost, (v) => (state.tuning.ghost = v),
      { format: (v) => percent(v / 0.35) }),
    def("rawCam", "camera", 0, 1, 1,
      () => state.tuning.rawCam, (v) => (state.tuning.rawCam = v),
      { transient: true, hidden: true }),
    // v0.7.6 — the learned background: a room setting, never a scene's,
    // never drawn by Chaos (transient, no chaos range); shown as a switch.
    def("bgLearn", "camera", 0, 1, 1,
      () => state.tuning.bgLearn, (v) => (state.tuning.bgLearn = v),
      { transient: true, hidden: true }),
    def("halo", "reglages", 0, 1, 0.01,
      () => state.tuning.halo, (v) => (state.tuning.halo = v),
      { format: percent, chaos: [0, 0.5], group: "lumiere" }),
    // v0.7.1e — global composition: four whole-frame handles any LFO,
    // journey, scene or MIDI knob can drive.
    def("compBright", "reglages", 0.25, 2, 0.01,
      () => state.tuning.compBright, (v) => (state.tuning.compBright = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.6, 1.5], group: "lumiere" }),
    def("contrast", "reglages", 0, 1, 0.01,
      () => state.tuning.contrast, (v) => (state.tuning.contrast = v),
      { format: percent, chaos: [0, 0.7], group: "lumiere" }),
    def("paperGrain", "reglages", 0, 1, 0.01,
      () => state.tuning.paperGrain, (v) => (state.tuning.paperGrain = v),
      { format: percent, group: "lumiere" }),
    def("strobe", "reglages", 0, 1, 0.01,
      () => state.tuning.strobe, (v) => (state.tuning.strobe = v),
      { format: percent, chaos: [0, 0.3], group: "lumiere" }),
    def("fringe", "reglages", 0, 1, 0.01,
      () => state.tuning.fringeTint, (v) => (state.tuning.fringeTint = v),
      {
        format: (v) =>
          v < 0.4 ? t("val.warm") : v > 0.6 ? t("val.cool") : t("val.neutral"),
        group: "lumiere",
      }),
    def("exposure", "reglages", 0.5, 3, 0.05,
      () => state.tuning.exposure, (v) => (state.tuning.exposure = v),
      { group: "lumiere" }),
    def("depthAmount", "reglages", 0, 1, 0.01,
      () => state.tuning.depthAmount, (v) => (state.tuning.depthAmount = v),
      { format: percent, reveals: true, chaos: [0, 0.8], group: "espace" }),
    def("focusLayer", "reglages", 0, 2, 1,
      () => state.tuning.focusLayer, (v) => (state.tuning.focusLayer = v),
      {
        discrete: true,
        visible: () => state.tuning.depthAmount > 0.001,
        group: "espace",
        options: () => [
          { value: 0, label: t("opt.layerFar") },
          { value: 1, label: t("opt.layerMid") },
          { value: 2, label: t("opt.layerNear") },
        ],
      }),
    def("dofBlur", "reglages", 0, 1, 0.01,
      () => state.tuning.dofBlur, (v) => (state.tuning.dofBlur = v),
      { format: percent, visible: () => state.tuning.depthAmount > 0.001, group: "espace" }),
    def("compZoom", "reglages", 0.6, 1.8, 0.01,
      () => state.tuning.compZoom, (v) => (state.tuning.compZoom = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.85, 1.4], group: "espace" }),
    def("compRot", "reglages", -3.1416, 3.1416, 0.01,
      () => state.tuning.compRot, (v) => (state.tuning.compRot = v),
      {
        format: (v) => `${Math.round((v * 180) / Math.PI)}°`,
        chaos: [-0.8, 0.8],
        group: "espace",
      }),
    // ---- crossfade (rendered by the scenes section, target like any) -----
    def("xfade", "scenes", 0, 1, 0.005,
      () => hooks.getXfade(), (v) => hooks.onCrossfade(v),
      { format: percent, reveals: true, transient: true }),
    // ---- crossfade material pair: registry plumbing, never shown ---------
    def("bodyMatA", "scenes", 0, 8, 0.01,
      () => state.tuning.bodyMatA, (v) => (state.tuning.bodyMatA = v),
      { transient: true, hidden: true }),
    def("bodyMatB", "scenes", 0, 8, 0.01,
      () => state.tuning.bodyMatB, (v) => (state.tuning.bodyMatB = v),
      { transient: true, hidden: true }),
    def("fondMatA", "scenes", 0, 8, 0.01,
      () => state.tuning.fondMatA, (v) => (state.tuning.fondMatA = v),
      { transient: true, hidden: true }),
    def("fondMatB", "scenes", 0, 8, 0.01,
      () => state.tuning.fondMatB, (v) => (state.tuning.fondMatB = v),
      { transient: true, hidden: true }),
    def("matBlend", "scenes", 0, 1, 0.001,
      () => state.tuning.matBlend, (v) => (state.tuning.matBlend = v),
      { transient: true, hidden: true }),
    // ---- empreinte: who owns the frame, where it lives, its transform ----
    def("balance", "empreinte", 0, 1, 0.01,
      () => state.tuning.balance, (v) => (state.tuning.balance = v),
      { format: percent, chaos: [0.15, 0.85], ends: ["ui.balL", "ui.balR"] }),
    // v0.7.1f — "où" is continuous: left the body's hollow, right the whole
    // frame, the middle a stochastic mix of both (the shader blends).
    def("impMode", "empreinte", 0, 2, 0.01,
      () => state.tuning.impMode, (v) => (state.tuning.impMode = v),
      {
        chaos: [0, 2],
        ends: ["ui.ouL", "ui.ouR"],
        format: (v) =>
          v < 0.25
            ? t("val.ouCorps")
            : v > 1.75
              ? t("val.ouPartout")
              : Math.abs(v - 1) < 0.25
                ? t("val.ouMix")
                : percent(v / 2),
      }),
    def("impX", "empreinte", -0.4, 0.4, 0.005,
      () => state.tuning.impX, (v) => (state.tuning.impX = v),
      { format: (v) => percent((v + 0.4) / 0.8), chaos: [-0.22, 0.22] }),
    def("impY", "empreinte", -0.35, 0.35, 0.005,
      () => state.tuning.impY, (v) => (state.tuning.impY = v),
      { format: (v) => percent((v + 0.35) / 0.7), chaos: [-0.18, 0.18] }),
    def("impRot", "empreinte", -3.1416, 3.1416, 0.01,
      () => state.tuning.impRot, (v) => (state.tuning.impRot = v),
      {
        format: (v) => `${Math.round((v * 180) / Math.PI)}°`,
        chaos: [-1.6, 1.6],
      }),
    def("impScale", "empreinte", 0.35, 2.4, 0.01,
      () => state.tuning.impScale, (v) => (state.tuning.impScale = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.6, 1.9] }),
    // ---- v0.7.1e — the shared tempo (rendered by the son section) --------
    def("tempo", "son", 40, 220, 1,
      () => hooks.getMod()?.tempo ?? 120,
      (v) => {
        const m = hooks.getMod();
        if (m) m.tempo = v;
      },
      { format: (v) => `${Math.round(v)} bpm`, hidden: true }),
    // ---- fine parameters of the imprint families (gated by family) -------
    def("waveFreq", "empreinte", 0.5, 8, 0.1,
      () => state.imprint.wave.freq, (v) => (state.imprint.wave.freq = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveAmp", "empreinte", 0.02, 0.25, 0.005,
      () => state.imprint.wave.amp, (v) => (state.imprint.wave.amp = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveThick", "empreinte", 0.001, 0.02, 0.001,
      () => state.imprint.wave.thickness,
      (v) => (state.imprint.wave.thickness = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveCount", "empreinte", 1, 7, 1,
      () => state.imprint.wave.waves, (v) => (state.imprint.wave.waves = v),
      {
        visible: () => state.imprint.family === "ondes",
        imprint: true,
        format: (v) => String(Math.round(v)),
      }),
    def("waveDrift", "empreinte", 0, 2, 0.05,
      () => state.imprint.wave.drift, (v) => (state.imprint.wave.drift = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("multiN", "empreinte", 2, 9, 1,
      () => state.imprint.multi.n, (v) => (state.imprint.multi.n = v),
      {
        visible: () => state.imprint.family === "multi",
        imprint: true,
        format: (v) => String(Math.round(v)),
      }),
    def("multiSize", "empreinte", 0.08, 0.4, 0.01,
      () => state.imprint.multi.size, (v) => (state.imprint.multi.size = v),
      { visible: () => state.imprint.family === "multi", imprint: true }),
    def("spin", "empreinte", 0, 2, 0.05,
      () => state.imprint.spin, (v) => (state.imprint.spin = v),
      { visible: () => state.imprint.family === "volume", imprint: true }),
    def("lissaA", "empreinte", 1, 7, 1,
      () => state.imprint.lissa.a, (v) => (state.imprint.lissa.a = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
      }),
    def("lissaB", "empreinte", 1, 7, 1,
      () => state.imprint.lissa.b, (v) => (state.imprint.lissa.b = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
      }),
  ];
  const byKey = new Map(controls.map((d) => [d.key, d]));
  const D = (key: string) => byKey.get(key)!;

  // Snapshot taken at creation, while the state still holds its defaults:
  // Reset glides every def back to these values.
  const initialValues = new Map<ControlDef, number>(
    controls.map((def) => [def, def.get()])
  );
  // v0.7.1f — the values of the current scene (boot defaults until a scene
  // is applied): what a double-click on a slider comes home to.
  const sceneValues = new Map<string, number>(
    controls.map((d) => [d.key, d.get()])
  );

  // ----- skeleton ----------------------------------------------------------
  const panel = document.createElement("aside");
  panel.className = "cinerae-panel";
  panel.setAttribute("aria-label", "Cineræ");
  root.appendChild(panel);

  // The edge tab: the closed panel's one visible affordance, a full-height
  // strip at the right edge with a grip mark, 56 px wide for the finger.
  const edgeTab = document.createElement("button");
  edgeTab.type = "button";
  edgeTab.className = "cinerae-edge";
  edgeTab.innerHTML = `<span class="cinerae-grip-bar" aria-hidden="true"></span>`;
  root.appendChild(edgeTab);

  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "cinerae-grip";
  grip.innerHTML = `<span class="cinerae-grip-bar" aria-hidden="true"></span>`;
  panel.appendChild(grip);

  const head = document.createElement("header");
  head.className = "cinerae-head";
  panel.appendChild(head);
  const seg = document.createElement("div");
  seg.className = "cinerae-seg";
  seg.setAttribute("role", "group");
  head.appendChild(seg);
  const MODE_IDS: PanelMode[] = ["demo", "pro"];
  const modeButtons = MODE_IDS.map((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.addEventListener("click", () => {
      mode = id;
      aideOpen = false;
      // The raw camera view is a Pro-only calibration tool: leaving Pro
      // always turns it off, the public promise stays true.
      if (id !== "pro" && state.tuning.rawCam > 0.5) writeDef("rawCam", 0);
      hooks.onInteraction();
      renderMode();
    });
    seg.appendChild(b);
    return b;
  });
  // v0.7.3 — the MIDI state lives in the head, linked or not: a tap opens
  // brancher > midi. The monogram is the intro's own lettering, faded.
  const midiChip = document.createElement("button");
  midiChip.type = "button";
  midiChip.className = "cinerae-midi-chip";
  midiChip.innerHTML = `<span class="cinerae-midi-dot" aria-hidden="true"></span><span class="cinerae-midi-label"></span>`;
  const midiLabel = midiChip.querySelector(".cinerae-midi-label") as HTMLElement;
  midiChip.addEventListener("click", () => {
    mode = "pro";
    aideOpen = false;
    openMetas.add("brancher");
    metaTab.brancher = "midi";
    hooks.onInteraction();
    renderMode();
  });
  head.appendChild(midiChip);
  // v0.7.5 — the camera state lives in the head too, Pro only: a dot (on or
  // off) and the source's short name; a tap opens a floating menu with the
  // same defs as brancher > caméra plus a live thumbnail.
  const camChip = document.createElement("button");
  camChip.type = "button";
  camChip.className = "cinerae-midi-chip cinerae-cam-chip";
  camChip.innerHTML = `<span class="cinerae-midi-dot" aria-hidden="true"></span><span class="cinerae-midi-label"></span>`;
  const camLabel = camChip.querySelector(".cinerae-midi-label") as HTMLElement;
  camChip.setAttribute("aria-haspopup", "dialog");
  camChip.addEventListener("click", () => {
    hooks.onInteraction();
    setCamMenu(!camMenuOpen);
  });
  head.appendChild(camChip);
  const helpButton = document.createElement("button");
  helpButton.type = "button";
  helpButton.className = "cinerae-help";
  helpButton.addEventListener("click", () => {
    aideOpen = !aideOpen;
    hooks.onInteraction();
    renderMode();
  });
  head.appendChild(helpButton);
  const mono = document.createElement("span");
  mono.className = "cinerae-mono";
  mono.setAttribute("aria-hidden", "true");
  mono.textContent = "cineræ";
  head.appendChild(mono);
  const camMenu = document.createElement("div");
  camMenu.className = "cinerae-cam-menu";
  camMenu.setAttribute("role", "dialog");
  camMenu.hidden = true;
  head.appendChild(camMenu);
  let camMenuOpen = false;
  const syncMidiChip = () => {
    const midi = hooks.getMidi();
    // Linked = a controller is plugged in (Web MIDI granted AND at least one
    // input), re-synced on every statechange through panel.refresh().
    const inputs = midi?.enabled ? midi.inputs : [];
    const linked = inputs.length > 0;
    midiChip.dataset.linked = String(linked);
    // The chip stays short (the head is 34 vw wide): the dot says linked or
    // not; the device names and the bindings count live in the accessible
    // name and the title (the count is also on brancher's line).
    midiLabel.textContent = "midi";
    const n = midi ? controls.filter((d) => midi.bindingFor(d.key)).length : 0;
    const state = linked
      ? `${t("ui.midiChipOn")} · ${inputs.join(", ")}${n ? ` · ${n} ${t("ui.bindings")}` : ""}`
      : t("ui.midiChipOff");
    midiChip.title = `${state} · ${t("hint.midiChip")}`;
    midiChip.setAttribute("aria-label", state);
  };

  const body = document.createElement("div");
  body.className = "cinerae-body";
  panel.appendChild(body);
  const bigBox = document.createElement("div");
  bigBox.className = "cinerae-sliders";
  const proBox = document.createElement("div");
  proBox.className = "cinerae-pro";
  const aideBox = document.createElement("div");
  aideBox.className = "cinerae-aide";
  body.append(bigBox, proBox, aideBox);

  const foot = document.createElement("footer");
  foot.className = "cinerae-foot";
  panel.appendChild(foot);
  const actions = document.createElement("div");
  actions.className = "cinerae-actions";
  foot.appendChild(actions);

  // ----- chaos, undo, reset: registry-driven, with a gesture journal ------
  const writeDef = (key: string, v: number) => {
    const def = byKey.get(key);
    if (!def) return;
    def.set(Math.min(def.max, Math.max(def.min, v)));
    hooks.getMod()?.onAuthored(key, v);
  };

  interface GestureSnap {
    values: [ControlDef, number][];
    colors: LookColors;
    imprint: { family: ImprintFamily; variant: string };
  }
  // v0.7.1f — one journal for every gesture: slider, select, imprint pick,
  // palette, scene, Chaos, pinch, drag. Z and ↶ step back through it.
  const gestures: GestureSnap[] = [];
  const syncUndo = () => {
    undoButton.disabled = gestures.length === 0;
  };
  const snapshot = (): GestureSnap => ({
    values: controls
      .filter((d) => !d.transient)
      .map((d) => [d, d.get()] as [ControlDef, number]),
    colors: cloneLookColors(state.colors),
    imprint: { family: state.imprint.family, variant: state.imprint.variant },
  });
  const pushGesture = (snap: GestureSnap = snapshot()) => {
    gestures.push(snap);
    if (gestures.length > GESTURE_MAX) gestures.shift();
    syncUndo();
  };

  const chaos = () => {
    hooks.onInteraction();
    // Remember where we stand: a lucky draw clicked past can come back.
    pushGesture();
    hooks.onChaos();
    const targets: { def: ControlDef; to: number }[] = [];
    for (const def of controls) {
      if (!def.chaos || def.transient) continue;
      const lo = Math.max(def.min, def.chaos[0]);
      const hi = Math.min(def.max, def.chaos[1]);
      let to = lo + Math.random() * (hi - lo);
      if (def.chaosSnap) to = Math.round(to);
      targets.push({ def, to });
    }
    glide(targets);
    // One time out of three chaos also draws a palette: the tint belongs
    // to the storm too. (Palettes are choices, not defs: the draw stays here.)
    if (Math.random() < 1 / 3) {
      const p = PALETTES[(Math.random() * PALETTES.length) | 0]!;
      hooks.onPaletteSelect(p.name);
    }
    syncUndo();
    window.setTimeout(() => renderMode(), 600);
  };

  const undoChaos = () => {
    const snap = gestures.pop();
    if (!snap) return;
    hooks.onInteraction();
    glide(snap.values.map(([def, to]) => ({ def, to })));
    // Colors and imprint come back too: the draw touched them.
    state.colors.stops = snap.colors.stops.map((s) => [...s] as Rgb);
    state.colors.bg = [...snap.colors.bg] as Rgb;
    state.colors.grade = [...snap.colors.grade] as Rgb;
    state.colors.ink = [...snap.colors.ink] as Rgb;
    state.colors.corpsLight = [...snap.colors.corpsLight] as Rgb;
    state.colors.corpsShadow = [...snap.colors.corpsShadow] as Rgb;
    state.colors.name = snap.colors.name;
    if (
      snap.imprint.family !== state.imprint.family ||
      snap.imprint.variant !== state.imprint.variant
    ) {
      hooks.onImprintSelect(snap.imprint.family, snap.imprint.variant);
    }
    syncUndo();
    window.setTimeout(() => renderMode(), 600);
  };

  const reset = () => {
    hooks.onInteraction();
    hooks.onReset();
    lastScene = "";
    renderMode();
    glide(
      controls
        .filter((d) => !d.transient)
        .map((def) => ({ def, to: initialValues.get(def)! }))
    );
  };

  const rowButton = (label: string, onClick: () => void, cls = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `cinerae-btn-row ${cls}`.trim();
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  };
  const chaosButton = rowButton("", chaos);
  const undoButton = rowButton("↶", undoChaos, "cinerae-undo");
  const keepButton = rowButton("", () => {
    hooks.onInteraction();
    hooks.onKeep();
  });
  // v0.7.5 — VOIR: the raw camera at the same rank as Chaos and Garder, Pro
  // only (the camera never reaches the public). Same def as brancher > caméra.
  const voirButton = rowButton("", () => {
    hooks.onInteraction();
    toggleRawCam();
  }, "cinerae-voir");
  actions.append(chaosButton, undoButton, voirButton, keepButton);
  syncUndo();
  const toggleRawCam = () => {
    if (mode !== "pro") return false;
    writeDef("rawCam", state.tuning.rawCam > 0.5 ? 0 : 1);
    syncCamera();
    return true;
  };

  // ----- shared row builders ------------------------------------------------
  let rowRefs: {
    def: ControlDef;
    input: HTMLInputElement;
    readout: HTMLElement;
    row: HTMLElement;
    /** v0.7.1f — the thin marker: the authored value (modulation center). */
    tick?: HTMLElement;
    authored?: () => number | undefined;
  }[] = [];

  // v0.7.4 — the selects too: a journey (matière) or a glide writes their
  // def; the rendered select follows, since it now sits on the same page.
  let selectRefs: { def: ControlDef; select: HTMLSelectElement }[] = [];
  const syncSelects = (keys?: ReadonlySet<string> | string[]) => {
    for (const ref of selectRefs) {
      if (keys && !(Array.isArray(keys) ? keys.includes(ref.def.key) : keys.has(ref.def.key))) continue;
      if (!ref.select.isConnected) continue;
      const v = String(Math.round(ref.def.get()));
      if (ref.select.value !== v) ref.select.value = v;
    }
  };

  // v0.7.1f — the double marker: the full bar shows the value really
  // played, the thin tick shows the authored one. When nothing modulates
  // the key the two coincide and the tick hides.
  const updateTick = (ref: (typeof rowRefs)[number]) => {
    if (!ref.tick) return;
    const a = ref.authored?.();
    const played = Number(ref.input.value);
    const span = Math.max(1e-9, ref.def.max - ref.def.min);
    if (a === undefined || Math.abs(a - played) < span * 0.01) {
      ref.tick.style.display = "none";
      return;
    }
    ref.tick.style.display = "";
    ref.tick.style.left = `${(((a - ref.def.min) / span) * 100).toFixed(1)}%`;
  };

  // The bar fill follows the value: the whole bar is the fader.
  const setFill = (input: HTMLInputElement) => {
    const min = Number(input.min);
    const max = Number(input.max);
    const f = ((Number(input.value) - min) / Math.max(1e-9, max - min)) * 100;
    input.style.setProperty("--fill", `${f.toFixed(1)}%`);
  };

  // Reflect a journey's cascade on its visible component rows mid-drag.
  const syncKeys = (keys: string[]) => {
    for (const ref of rowRefs) {
      if (!keys.includes(ref.def.key)) continue;
      ref.input.value = String(ref.def.get());
      setFill(ref.input);
      ref.readout.textContent = (ref.def.format ?? plain)(ref.def.get());
      updateTick(ref);
    }
    syncSelects(keys);
    syncSummaries();
  };

  const makeSelect = (
    parent: HTMLElement,
    label: string,
    options: { value: number; label: string }[],
    get: () => number,
    set: (v: number) => void
  ) => {
    const row = document.createElement("label");
    row.className = "cinerae-select-row";
    const name = document.createElement("span");
    name.className = "cinerae-row-name";
    name.textContent = label;
    const select = document.createElement("select");
    select.className = "cinerae-select";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label;
      select.appendChild(o);
    }
    select.value = String(Math.round(get()));
    select.addEventListener("change", () => {
      hooks.onInteraction();
      set(Number(select.value));
    });
    row.append(name, select);
    parent.appendChild(row);
    return { row, select, name };
  };

  // The fader: a full bar, name and value inside, the words of its ends
  // underneath when it has them. Touching anywhere on the bar drags it.
  const makeFader = (
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    format: (v: number) => string = plain,
    ends: string[] = []
  ) => {
    const row = document.createElement("div");
    row.className = "cinerae-slider";
    const bar = document.createElement("div");
    bar.className = "cinerae-bar";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    if (label) input.setAttribute("aria-label", label);
    const tick = document.createElement("span");
    tick.className = "cinerae-tick";
    tick.style.display = "none";
    const inner = document.createElement("div");
    inner.className = "cinerae-in";
    const name = document.createElement("span");
    name.className = "cinerae-row-name";
    name.textContent = label;
    const readout = document.createElement("span");
    readout.className = "cinerae-value";
    inner.append(name, readout);
    bar.append(input, tick, inner);
    row.appendChild(bar);
    if (ends.length) {
      const e = document.createElement("div");
      e.className = "cinerae-ends";
      for (const key of ends) {
        const s = document.createElement("span");
        s.textContent = t(key);
        e.appendChild(s);
      }
      row.appendChild(e);
    }
    const show = () => {
      readout.textContent = format(get());
      setFill(input);
    };
    show();
    input.addEventListener("input", () => {
      set(Number(input.value));
      show();
      hooks.onInteraction();
    });
    parent.appendChild(row);
    return { row, input, readout, name, show, tick };
  };

  // v0.7.1f — arm the gesture journal on a slider: the state is captured
  // when the hand lands, committed once when the drag really changed it.
  const armUndoSlider = (input: HTMLInputElement) => {
    let pending: { snap: GestureSnap; value: string } | undefined;
    const arm = () => {
      pending = { snap: snapshot(), value: input.value };
    };
    input.addEventListener("pointerdown", arm);
    input.addEventListener("keydown", (e) => {
      if (!pending && !["Tab", "Shift"].includes(e.key)) arm();
    });
    input.addEventListener("change", () => {
      if (pending && pending.value !== input.value) pushGesture(pending.snap);
      pending = undefined;
      syncSummaries();
    });
    input.addEventListener("blur", () => {
      if (pending && pending.value !== input.value) pushGesture(pending.snap);
      pending = undefined;
    });
  };

  const renderDefRow = (def: ControlDef, parent: HTMLElement, withEnds = false) => {
    const mod = hooks.getMod();
    if (def.options) {
      const { row, name, select } = makeSelect(parent, def.label, def.options(), def.get, (v) => {
        pushGesture();
        def.set(v);
        mod?.onAuthored(def.key, v);
        if (def.imprint) hooks.onImprintParams();
        renderMode();
      });
      row.title = t(`hint.${def.key}`);
      decorateRow(row, name, def);
      selectRefs.push({ def, select });
      return row;
    }
    const { row, input, readout, name, tick } = makeFader(
      parent,
      def.label,
      def.min,
      def.max,
      def.step,
      def.get,
      (v) => {
        glideToken++;
        def.set(v);
        mod?.onAuthored(def.key, v);
        if (def.imprint) hooks.onImprintParams();
      },
      def.format ?? plain,
      withEnds ? def.ends ?? [] : []
    );
    row.title = t(`hint.${def.key}`);
    if (def.reveals) input.addEventListener("change", () => renderMode());
    armUndoSlider(input);
    // v0.7.1f — double-click brings the slider back to its value in the
    // current scene (the boot state before any scene is applied).
    row.addEventListener("dblclick", () => {
      const home = sceneValues.get(def.key);
      if (home === undefined || Math.abs(home - def.get()) < 1e-9) return;
      pushGesture();
      def.set(home);
      mod?.onAuthored(def.key, home);
      if (def.imprint) hooks.onImprintParams();
      syncKeys([def.key]);
      hooks.onInteraction();
    });
    decorateRow(row, name, def);
    const ref = {
      def,
      input,
      readout,
      row,
      tick,
      authored: () => hooks.getMod()?.centerOf(def.key),
    };
    rowRefs.push(ref);
    updateTick(ref);
    return row;
  };

  // Modulated dot, MIDI tag, learn-mode arming on the row label.
  const decorateRow = (
    row: HTMLElement,
    name: HTMLElement,
    def: ControlDef
  ) => {
    const mod = hooks.getMod();
    const midi = hooks.getMidi();
    if (mod?.isModulated(def.key)) {
      const dot = document.createElement("span");
      dot.className = "cinerae-mod-dot";
      dot.title = t("ui.modulated");
      name.appendChild(dot);
    }
    const bound = midi?.bindingFor(def.key);
    if (bound) {
      const tag = document.createElement("span");
      tag.className = "cinerae-tag";
      tag.textContent = bound;
      name.appendChild(tag);
    }
    if (midiLearn && midi?.enabled) {
      row.classList.add("learnable");
      if (midi.armedKey === def.key) row.classList.add("armed");
      name.style.pointerEvents = "auto";
      name.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        midi.arm(def.key);
        renderMode();
      });
    }
  };

  const renderSectionDefs = (
    id: SectionId,
    body: HTMLElement,
    group?: string,
    skip: string[] = []
  ) => {
    for (const def of controls) {
      if (def.section !== id || def.hidden) continue;
      if (group !== undefined && def.group !== group) continue;
      if (def.visible && !def.visible()) continue;
      if (skip.includes(def.key)) continue; // rendered by hand elsewhere
      renderDefRow(def, body, Boolean(def.ends));
    }
  };

  const makeSwitch = (
    labelKey: string,
    get: () => boolean,
    toggle: (next: boolean) => void,
    parent: HTMLElement,
    hintKey?: string
  ) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cinerae-switch";
    row.setAttribute("role", "switch");
    if (hintKey) row.title = t(hintKey);
    const name = document.createElement("span");
    const track = document.createElement("span");
    track.className = "cinerae-switch-track";
    track.innerHTML = `<span class="cinerae-switch-thumb"></span>`;
    row.append(name, track);
    const sync = () => {
      name.textContent = t(labelKey);
      row.setAttribute("aria-checked", String(get()));
    };
    row.addEventListener("click", () => {
      hooks.onInteraction();
      toggle(!get());
      sync();
      syncSummaries();
    });
    parent.appendChild(row);
    sync();
    return { row, sync };
  };

  const makeChip = (
    parent: HTMLElement,
    label: string,
    active: boolean,
    onPick: () => void
  ) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cinerae-chip";
    chip.setAttribute("aria-pressed", String(active));
    chip.textContent = label;
    chip.addEventListener("click", () => {
      hooks.onInteraction();
      onPick();
    });
    parent.appendChild(chip);
    return chip;
  };

  const miniButton = (
    parent: HTMLElement,
    label: string,
    onClick: () => void,
    hint = ""
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cinerae-chip";
    b.textContent = label;
    if (hint) b.title = hint;
    b.addEventListener("click", () => {
      hooks.onInteraction();
      onClick();
    });
    parent.appendChild(b);
    return b;
  };

  const line = (parent: HTMLElement, text: string, cls = "cinerae-line") => {
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = text;
    parent.appendChild(p);
    return p;
  };

  // ----- pages of a grouped section ------------------------------------------
  // v0.7.4 — one underlined row per meta (its sections); every deeper level
  // is a row of chips, so two underlined rows never stack.
  const renderGroupTabs = (
    id: SectionId,
    groups: { key: string; label: string }[],
    body: HTMLElement
  ): string => {
    let active = groupOpen[id] ?? groups[0]!.key;
    if (!groups.some((g) => g.key === active)) active = groups[0]!.key;
    groupOpen[id] = active;
    if (groups.length > 1) {
      const bar = document.createElement("div");
      bar.className = "cinerae-chips cinerae-pages";
      for (const g of groups) {
        makeChip(bar, g.label, g.key === active, () => {
          groupOpen[id] = g.key;
          renderMode();
        });
      }
      body.appendChild(bar);
    }
    return active;
  };

  // v0.7.4 — a source list (cameras or microphones): the devices the machine
  // names, "automatique" first. Rendered only when at least one name is
  // known (the browser gives them once the permission was granted); the
  // caller keeps its fallback otherwise. Nothing leaves the machine.
  const renderDeviceRow = (
    body: HTMLElement,
    labelKey: string,
    hintKey: string,
    devices: MediaDevice[],
    currentId: string,
    onPick: (id: string) => void
  ): boolean => {
    if (!devices.some((d) => d.label)) return false;
    const options = [
      { value: 0, label: t("ui.deviceAuto") },
      ...devices.map((d, i) => ({
        value: i + 1,
        label: d.label || `${t(labelKey)} ${i + 1}`,
      })),
    ];
    const { row } = makeSelect(
      body,
      t(labelKey),
      options,
      () => Math.max(0, devices.findIndex((d) => d.id === currentId) + 1),
      (v) => {
        // Not a registry def: no journal entry, so the undo never lands here.
        onPick(v > 0 ? devices[v - 1]!.id : "");
        renderMode();
      }
    );
    row.title = t(hintKey);
    return true;
  };

  const defGroups = (id: SectionId, withExtras: string[] = []): { key: string; label: string }[] =>
    (SECTION_GROUPS[id] ?? []).filter((g) =>
      withExtras.includes(g) ||
      controls.some(
        (d) =>
          d.section === id &&
          d.group === g &&
          !d.hidden &&
          (!d.visible || d.visible())
      )
    ).map((g) => ({ key: g, label: t(`grp.${g}`) }));

  // ----- teintes: the real palette, its name readable -----------------------
  const renderTeintes = (parent: HTMLElement) => {
    const grid = document.createElement("div");
    grid.className = "cinerae-teintes";
    grid.title = t("hint.teinte");
    parent.appendChild(grid);
    for (const p of PALETTES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-teinte";
      b.setAttribute("aria-pressed", String(state.colors.name === p.name));
      const band = document.createElement("span");
      band.className = "cinerae-teinte-band";
      const stops = [
        rgbToHex(p.colors.bg),
        rgbToHex(p.colors.bg),
        ...p.colors.stops.map((s) => rgbToHex(s)),
      ];
      const n = stops.length - 1;
      band.style.background = `linear-gradient(90deg, ${stops
        .map((c, i) => `${c} ${Math.round((i / n) * 100)}%`)
        .join(", ")})`;
      const name = document.createElement("span");
      name.className = "cinerae-teinte-name";
      name.textContent = t(`teinte.${p.name}`);
      b.append(band, name);
      b.addEventListener("click", () => {
        hooks.onInteraction();
        pushGesture();
        hooks.onPaletteSelect(p.name);
      });
      grid.appendChild(b);
    }
  };

  // ----- scènes -------------------------------------------------------------
  const presetFileInput = document.createElement("input");
  presetFileInput.type = "file";
  presetFileInput.accept = "application/json,.json";
  presetFileInput.style.display = "none";
  panel.appendChild(presetFileInput);
  presetFileInput.addEventListener("change", () => {
    const file = presetFileInput.files?.[0];
    if (file) {
      void hooks.getPresets()?.loadFile(file).then((err) => {
        if (err) setStatus(t("st.badPreset"));
        renderMode();
      });
    }
    presetFileInput.value = "";
  });

  const applyScene = (p: PresetData) => {
    pushGesture();
    hooks.getPresets()?.apply(structuredClone(p) as PresetData);
    lastScene = p.name;
    // The applied scene becomes the home of every double-click.
    for (const d of controls) sceneValues.set(d.key, d.get());
    renderMode();
  };

  function renderScenes(body: HTMLElement) {
    const presets = hooks.getPresets();
    const chips = document.createElement("div");
    chips.className = "cinerae-chips";
    chips.title = t("hint.scenes");
    body.appendChild(chips);
    for (const p of presets?.builtIns ?? []) {
      makeChip(chips, t(`scene.${p.name}`), lastScene === p.name, () => applyScene(p));
    }
    // v0.7.1f — "au silence": the piece draws imprints on its own after a
    // stretch of full silence; the delay slider shows when it is on.
    makeSwitch(
      "sw.randomImprint",
      () => state.imprint.random,
      (next) => {
        state.imprint.random = next;
        hooks.onImprintParams();
        renderMode();
      },
      body,
      "hint.randomImprint"
    );
    if (state.imprint.random) renderDefRow(D("silenceDelay"), body);

    const io = document.createElement("div");
    io.className = "cinerae-chips";
    body.appendChild(io);
    miniButton(io, t("btn.save"), () => presets?.saveFile(), t("hint.save"));
    miniButton(io, t("btn.load"), () => presetFileInput.click(), t("hint.load"));
    miniButton(io, "→ A", () => {
      presets?.setSlot("A");
      renderMode();
    }, t("hint.slotA"));
    miniButton(io, "→ B", () => {
      presets?.setSlot("B");
      renderMode();
    }, t("hint.slotB"));
    const slotNames = presets?.slotNames ?? [undefined, undefined];
    line(body, presets?.hasSlots
      ? `A · ${slotNames[0]}  ↔  B · ${slotNames[1]}`
      : t("hint.xfadeFlow"));
    renderDefRow(D("xfade"), body);
  }

  // ----- look pages (inside réglages) ---------------------------------------
  const colorPairRow = (
    parent: HTMLElement,
    labelKey: string,
    hintKey: string,
    entries: { value: Rgb; set: (c: Rgb) => void; title: string }[]
  ) => {
    const row = document.createElement("div");
    row.className = "cinerae-colors";
    row.title = t(hintKey);
    const label = document.createElement("span");
    label.className = "cinerae-row-name";
    label.textContent = t(labelKey);
    row.appendChild(label);
    for (const e of entries) {
      const input = document.createElement("input");
      input.type = "color";
      input.value = rgbToHex(e.value);
      input.title = e.title;
      input.setAttribute("aria-label", e.title);
      input.addEventListener("input", () => {
        e.set(hexToRgb(input.value));
        state.colors.name = "";
        hooks.onInteraction();
      });
      row.appendChild(input);
    }
    parent.appendChild(row);
    return row;
  };

  function renderGradient(body: HTMLElement) {
    const grad = document.createElement("div");
    grad.className = "cinerae-colors";
    grad.title = t("hint.gradient");
    body.appendChild(grad);
    const colorInput = (value: Rgb, onSet: (c: Rgb) => void, title: string) => {
      const input = document.createElement("input");
      input.type = "color";
      input.value = rgbToHex(value);
      input.title = title;
      input.setAttribute("aria-label", title);
      input.addEventListener("input", () => {
        onSet(hexToRgb(input.value));
        state.colors.name = "";
        hooks.onInteraction();
      });
      grad.appendChild(input);
      return input;
    };
    state.colors.stops.forEach((stop, i) => {
      colorInput(stop, (c) => (state.colors.stops[i] = c), `${t("ui.color")} ${i + 1}`);
    });
    const stopBtn = (label: string, enabled: boolean, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-chip";
      b.textContent = label;
      b.disabled = !enabled;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        onClick();
        renderMode();
      });
      grad.appendChild(b);
    };
    stopBtn("+", state.colors.stops.length < 5, () => {
      const last = state.colors.stops[state.colors.stops.length - 1]!;
      state.colors.stops.push([...last] as Rgb);
      state.colors.name = "";
    });
    stopBtn("−", state.colors.stops.length > 2, () => {
      state.colors.stops.pop();
      state.colors.name = "";
    });
    const bgLabel = document.createElement("span");
    bgLabel.className = "cinerae-row-name";
    bgLabel.textContent = t("ui.bg");
    grad.appendChild(bgLabel);
    colorInput(state.colors.bg, (c) => (state.colors.bg = c), t("ui.bg"));
  }

  let recButton: HTMLButtonElement | undefined;
  function renderSysteme(body: HTMLElement) {
    // Language: a two-chip choice.
    const langRow = document.createElement("div");
    langRow.className = "cinerae-select-row";
    const langName = document.createElement("span");
    langName.className = "cinerae-row-name";
    langName.textContent = t("ui.langue");
    const langChips = document.createElement("div");
    langChips.className = "cinerae-chips";
    for (const l of ["fr", "en"] as const) {
      makeChip(langChips, l.toUpperCase(), getLang() === l, () => {
        setLang(l);
        hooks.onLang();
        renderMode();
      });
    }
    langRow.append(langName, langChips);
    body.appendChild(langRow);
    makeSwitch("sw.auto", () => state.quality.auto, (next) => (state.quality.auto = next), body);
    makeSwitch(
      "sw.vitrine",
      () => state.behavior.vitrine,
      (next) => (state.behavior.vitrine = next),
      body,
      "hint.vitrine"
    );
    const cap = document.createElement("div");
    cap.className = "cinerae-chips";
    body.appendChild(cap);
    miniButton(cap, "png", () => hooks.onCapturePng(), t("hint.png"));
    recButton = miniButton(cap, "● rec", () => {
      const on = hooks.onToggleRecord();
      recButton!.classList.toggle("recording", on);
      recButton!.textContent = on ? "■ stop" : "● rec";
    }, t("hint.rec"));
    miniButton(cap, t("btn.fullscreen"), () => hooks.onFullscreen(), t("hint.fullscreen"));
    const resetRow = document.createElement("div");
    resetRow.className = "cinerae-actions";
    resetRow.appendChild(rowButton(t("btn.reset"), reset));
    body.appendChild(resetRow);
  }

  function renderReglages(body: HTMLElement) {
    const active = renderGroupTabs(
      "reglages",
      defGroups("reglages", ["teinte", "degrade", "systeme"]),
      body
    );
    if (active === "teinte") {
      renderTeintes(body);
      renderSectionDefs("reglages", body, "teinte");
    } else if (active === "degrade") {
      renderGradient(body);
    } else if (active === "systeme") {
      renderSysteme(body);
    } else {
      renderSectionDefs("reglages", body, active);
    }
  }

  // ----- corps (forme / tenue / geste) ---------------------------------------
  const matterFields: HTMLElement[] = [];
  function renderCorps(body: HTMLElement) {
    const active = renderGroupTabs("corps", defGroups("corps"), body);
    renderSectionDefs("corps", body, active);
    if (active === "forme") {
      colorPairRow(body, "ctl.corpsTint", "hint.corpsTint", [
        {
          value: state.colors.corpsLight,
          set: (c) => (state.colors.corpsLight = c),
          title: t("ui.light"),
        },
        {
          value: state.colors.corpsShadow,
          set: (c) => (state.colors.corpsShadow = c),
          title: t("ui.shadow"),
        },
      ]);
      // v0.7.1f — the matter counter: who the grain budget goes to.
      const matter = document.createElement("div");
      matter.className = "cinerae-matter";
      matter.title = t("hint.matter");
      matterFields.length = 0;
      for (const key of ["matCorps", "matEmp", "matFond"]) {
        const item = document.createElement("span");
        item.className = "cinerae-matter-item";
        const name = document.createElement("span");
        name.textContent = t(`ui.${key}`);
        const val = document.createElement("span");
        val.className = "cinerae-matter-val";
        val.textContent = "—";
        item.append(name, val);
        matter.appendChild(item);
        matterFields.push(val);
      }
      body.appendChild(matter);
    }
  }

  // ----- son ----------------------------------------------------------------
  const BAND_KEYS = ["bass", "lowMid", "mid", "treble", "hit"] as const;
  const bandFills: HTMLElement[] = [];
  let tapTimes: number[] = [];
  const tapTempo = () => {
    const now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1]! > 2200) {
      tapTimes = [];
    }
    tapTimes.push(now);
    if (tapTimes.length < 2) return;
    if (tapTimes.length > 7) tapTimes.shift();
    let sum = 0;
    for (let k = 1; k < tapTimes.length; k++) sum += tapTimes[k]! - tapTimes[k - 1]!;
    const bpm = 60_000 / (sum / (tapTimes.length - 1));
    writeDef("tempo", Math.min(220, Math.max(40, bpm)));
    syncTempo();
  };
  let tempoBpm: HTMLElement | undefined;
  let tempoDot: HTMLElement | undefined;
  let tempoChips: HTMLButtonElement[] = [];
  const syncTempo = () => {
    const bpm = Math.round(D("tempo").get());
    if (tempoBpm) tempoBpm.textContent = `${bpm} bpm`;
    if (tempoDot) tempoDot.style.animationDuration = `${(60 / bpm).toFixed(3)}s`;
    tempoChips[0]?.setAttribute("aria-pressed", String(state.behavior.tempoAuto));
    tempoChips[1]?.setAttribute("aria-pressed", String(!state.behavior.tempoAuto));
    syncSummaries();
  };
  window.setInterval(() => {
    if (openSections.has("son") && mode === "pro") syncTempo();
  }, 500);

  function renderSon(body: HTMLElement) {
    makeSwitch("sw.mic", () => sensors.mic, (next) => hooks.onSensor("mic", next), body, "hint.swMic");
    // v0.7.4 — the machine's microphones by name, once the browser names them.
    renderDeviceRow(
      body,
      "ui.micDevice",
      "hint.micDevice",
      state.devices.mics,
      state.behavior.micId,
      (id) => {
        state.behavior.micId = id;
        hooks.onMicDevice(id);
      }
    );
    // v0.7.1e — the five-band gauge: what the microphone really hears.
    const bands = document.createElement("div");
    bands.className = "cinerae-bands";
    bands.title = t("hint.bands");
    bandFills.length = 0;
    for (const key of BAND_KEYS) {
      const col = document.createElement("div");
      col.className = "cinerae-band";
      const fill = document.createElement("i");
      const name = document.createElement("span");
      name.textContent = t(`band.${key}`);
      col.append(fill, name);
      bands.appendChild(col);
      bandFills.push(fill);
    }
    bands.style.display = sensors.mic ? "" : "none";
    body.appendChild(bands);
    // v0.7.1f — the tempo line: choice musique (auto) / tap, dot, bpm.
    const tempo = document.createElement("div");
    tempo.className = "cinerae-tempo";
    const seg = document.createElement("div");
    seg.className = "cinerae-seg";
    const music = document.createElement("button");
    music.type = "button";
    music.textContent = t("ui.tempoMusic");
    music.title = t("hint.tempoMusic");
    music.addEventListener("click", () => {
      hooks.onInteraction();
      state.behavior.tempoAuto = !state.behavior.tempoAuto;
      syncTempo();
    });
    const tap = document.createElement("button");
    tap.type = "button";
    tap.textContent = t("btn.tap");
    tap.title = t("hint.tap");
    tap.addEventListener("click", () => {
      hooks.onInteraction();
      state.behavior.tempoAuto = false;
      tapTempo();
    });
    seg.append(music, tap);
    tempoChips = [music, tap];
    tempoDot = document.createElement("span");
    tempoDot.className = "cinerae-tempo-dot";
    tempoDot.setAttribute("aria-label", t("ui.tempoBeat"));
    tempoBpm = document.createElement("span");
    tempoBpm.className = "cinerae-line";
    tempo.append(seg, tempoDot, tempoBpm);
    body.appendChild(tempo);
    syncTempo();
    renderSectionDefs("son", body);
  }

  // ----- caméra -------------------------------------------------------------
  function renderCamera(body: HTMLElement) {
    renderCameraControls(body);
    line(body, t("aide.perf"));
  }

  // v0.7.5 — the camera's controls, rendered once per host (brancher > caméra
  // and the head menu): every command writes the same def, no second state.
  let camSyncs: { row: HTMLElement; sync: () => void }[] = [];
  function renderCameraControls(body: HTMLElement) {
    camSyncs.push(makeSwitch(
      "sw.camera",
      () => sensors.camera,
      (next) => hooks.onSensor("camera", next),
      body,
      "hint.swCamera"
    ));
    // v0.7.4 — the machine's cameras by name; the front / rear chips stay
    // for the tablet when no name is available.
    const listed = renderDeviceRow(
      body,
      "ui.camDevice",
      "hint.camDevice",
      state.devices.cameras,
      state.behavior.cameraId,
      (id) => {
        state.behavior.cameraId = id;
        hooks.onCameraDevice(id);
      }
    );
    if (!listed) {
      const chips = document.createElement("div");
      chips.className = "cinerae-chips";
      chips.title = t("hint.facing");
      body.appendChild(chips);
      for (const f of ["user", "environment"] as const) {
        makeChip(chips, t(`cam.${f}`), state.behavior.cameraFacing === f, () => {
          if (state.behavior.cameraFacing === f) return;
          state.behavior.cameraFacing = f;
          hooks.onCameraFacing(f);
          renderMode();
        });
      }
    }
    camSyncs.push(makeSwitch(
      "sw.mirror",
      () => state.tuning.mirror > 0.5,
      (next) => {
        writeDef("mirror", next ? 1 : 0);
        syncCamera();
      },
      body,
      "hint.mirror"
    ));
    // v0.7.1c — the raw camera: a transient Pro calibration switch.
    camSyncs.push(makeSwitch(
      "sw.rawCam",
      () => state.tuning.rawCam > 0.5,
      (next) => {
        writeDef("rawCam", next ? 1 : 0);
        syncCamera();
      },
      body,
      "hint.rawCam"
    ));
    // v0.7.6 — the learned background: the switch, then one tap to relearn
    // the room (both hosts, the same def, no second state).
    camSyncs.push(makeSwitch(
      "sw.bgLearn",
      () => state.tuning.bgLearn > 0.5,
      (next) => {
        writeDef("bgLearn", next ? 1 : 0);
        syncCamera();
      },
      body,
      "hint.bgLearn"
    ));
    const bgRow = document.createElement("div");
    bgRow.className = "cinerae-actions";
    bgRow.appendChild(rowButton(t("btn.bgReset"), () => {
      hooks.onInteraction();
      hooks.onBgReset();
    }, "cinerae-bg-reset"));
    bgRow.firstElementChild!.setAttribute("title", t("hint.bgReset"));
    body.appendChild(bgRow);
    renderSectionDefs("camera", body);
  }

  // The chip: dot on or off, the opened source's first word (the head is
  // 34 vw wide); the full state lives in the accessible name and the title.
  const syncCamChip = () => {
    const on = sensors.camera;
    camChip.dataset.linked = String(on);
    camChip.hidden = mode !== "pro";
    const track = on ? hooks.getCameraStream()?.getVideoTracks()[0] : undefined;
    const full =
      track?.label ||
      state.devices.cameras.find((d) => d.id === state.behavior.cameraId)?.label ||
      "";
    // Short name: the first word when it fits eight characters, else the
    // longest word that does, else the first word cut.
    const words = full.replace(/\(.*$/, "").trim().split(/\s+/).filter(Boolean);
    const fits = words.filter((w) => w.length <= 8);
    const word =
      words[0] && words[0].length <= 8
        ? words[0]
        : fits.sort((a, b) => b.length - a.length)[0] ?? (words[0] ?? "").slice(0, 8);
    const facing = t(`cam.${state.behavior.cameraFacing}`);
    camLabel.textContent = on ? word || facing : t("sw.camera");
    const tn = state.tuning;
    const stateText = on
      ? `${t("ui.camChipOn")} · ${full || facing} · ${t("sw.rawCam")} ${tn.rawCam > 0.5 ? t("ui.yes") : t("ui.no")} · ${t("ctl.ghost")} ${percent(tn.ghost / 0.35)}`
      : t("ui.camChipOff");
    camChip.title = `${stateText} · ${t("hint.camChip")}`;
    camChip.setAttribute("aria-label", stateText);
    camChip.setAttribute("aria-expanded", String(camMenuOpen));
  };
  // The floating menu: the thumbnail (the engine's stream, mirrored like the
  // raw view, alive only while open) then the same controls as the section.
  const renderCamMenu = () => {
    for (const v of camMenu.querySelectorAll("video")) {
      v.pause();
      v.srcObject = null;
    }
    camMenu.replaceChildren();
    camMenu.setAttribute("aria-label", t("ui.camMenu"));
    if (!camMenuOpen) return;
    const stream = sensors.camera ? hooks.getCameraStream() : null;
    if (stream) {
      const v = document.createElement("video");
      v.className = "cinerae-cam-vignette";
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute("aria-label", t("ui.camVignette"));
      v.title = t("ui.camVignette");
      v.classList.toggle("mirrored", state.tuning.mirror > 0.5);
      v.srcObject = stream;
      camMenu.appendChild(v);
      void v.play().catch(() => undefined);
    } else {
      line(camMenu, t("st.camOff"));
    }
    renderCameraControls(camMenu);
  };
  const setCamMenu = (next: boolean) => {
    if (camMenuOpen === next) return;
    camMenuOpen = next;
    camMenu.hidden = !next;
    renderCamMenu();
    syncCamChip();
  };
  // Every host of the camera defs follows one write: switches (section and
  // menu), VOIR, the chip, the thumbnail's mirror, the meta lines.
  const syncCamera = () => {
    camSyncs = camSyncs.filter((s) => s.row.isConnected);
    for (const s of camSyncs) s.sync();
    voirButton.setAttribute("aria-pressed", String(state.tuning.rawCam > 0.5));
    camMenu.querySelector("video")?.classList.toggle("mirrored", state.tuning.mirror > 0.5);
    syncCamChip();
    syncSummaries();
  };

  // ----- modulation ---------------------------------------------------------
  const RATE_MIN = 0.02;
  const RATE_MAX = 8;
  const rateToSlider = (hz: number) =>
    Math.log(hz / RATE_MIN) / Math.log(RATE_MAX / RATE_MIN);
  const sliderToRate = (x: number) =>
    RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, Math.min(1, Math.max(0, x)));

  const targetOptions = () =>
    controls
      .filter((d) => d.key !== "xfade" && !d.hidden)
      .map((d) => ({ key: d.key, label: d.label }));

  const DIV_LABELS = ["divQ", "divH", "divB1", "divB2", "divM1", "divM2", "divM4"];
  let openLfo = 0; // 0..3 = LFO index, 4 = the links page

  const lfoSpeedText = (lfo: { useTempo: boolean; div: number; rate: number }) =>
    lfo.useTempo
      ? t(`div.${DIV_LABELS[Math.max(0, TEMPO_DIVS.findIndex((d) => d === lfo.div))]}`)
      : `${lfo.rate.toFixed(2)} Hz`;

  function renderLfoBlock(body: HTMLElement, i: number) {
    const mod = hooks.getMod()!;
    const lfo = mod.lfos[i]!;
    const shapeRow = document.createElement("div");
    shapeRow.className = "cinerae-chips";
    shapeRow.title = t("hint.lfoShape");
    body.appendChild(shapeRow);
    for (const shape of LFO_SHAPES) {
      makeChip(shapeRow, t(`lfo.${shape}`), lfo.shape === shape, () => {
        lfo.shape = shape as LfoShape;
        renderMode();
      });
    }
    makeSwitch(
      "sw.lfoTempo",
      () => lfo.useTempo,
      (next) => {
        lfo.useTempo = next;
        renderMode();
      },
      body,
      "hint.lfoTempo"
    );
    if (lfo.useTempo) {
      makeSelect(
        body,
        t("ui.lfoDiv"),
        TEMPO_DIVS.slice(0, 5).map((_, idx) => ({
          value: idx,
          label: t(`div.${DIV_LABELS[idx]}`),
        })),
        () => Math.max(0, TEMPO_DIVS.slice(0, 5).findIndex((d) => d === lfo.div)),
        (v) => (lfo.div = TEMPO_DIVS[v] ?? 4)
      );
    } else {
      makeFader(
        body,
        t("ui.lfoRate"),
        0,
        1,
        0.005,
        () => rateToSlider(lfo.rate),
        (v) => (lfo.rate = sliderToRate(v)),
        () => `${lfo.rate.toFixed(2)} Hz`
      );
    }
    makeFader(body, t("ui.lfoAmp"), 0, 1, 0.01, () => lfo.amp, (v) => (lfo.amp = v), percent);
    const keys = ["", ...targetOptions().map((o) => o.key), "xfade"];
    const { row: targetRow } = makeSelect(
      body,
      t("ui.lfoTarget"),
      keys.map((k, idx) => ({
        value: idx,
        label: k ? byKey.get(k)?.label ?? k : t("ui.lfoNone"),
      })),
      () => Math.max(0, keys.indexOf(lfo.target)),
      (v) => {
        mod.setLfoTarget(i, keys[v] ?? "");
        renderMode();
      }
    );
    targetRow.title = t("hint.lfoTarget");
  }

  function renderModulation(body: HTMLElement) {
    const mod = hooks.getMod();
    if (!mod) return;
    const summaryLine = (label: string, onOpen: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-lfoline";
      b.textContent = label;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        onOpen();
        renderMode();
      });
      body.appendChild(b);
    };
    for (let i = 0; i < mod.lfos.length; i++) {
      const lfo = mod.lfos[i]!;
      const target = lfo.target
        ? byKey.get(lfo.target)?.label ?? lfo.target
        : t("ui.lfoNone");
      if (i === openLfo) {
        const head = document.createElement("div");
        head.className = "cinerae-lfoline open";
        head.textContent = `LFO ${i + 1}`;
        body.appendChild(head);
        renderLfoBlock(body, i);
      } else {
        summaryLine(`LFO ${i + 1} · ${target} · ${lfoSpeedText(lfo)}`, () => {
          openLfo = i;
        });
      }
    }
    if (openLfo === 4) {
      const head = document.createElement("div");
      head.className = "cinerae-lfoline open";
      head.textContent = t("ui.links");
      body.appendChild(head);
      for (const link of [...mod.links]) renderLinkRow(body, mod, link);
      const addRow = document.createElement("div");
      addRow.className = "cinerae-chips";
      body.appendChild(addRow);
      miniButton(addRow, t("ui.addLink"), () => {
        mod.addLink("lfo1", "force");
        renderMode();
      });
    } else {
      summaryLine(`${t("ui.links")} · ${mod.links.length}`, () => {
        openLfo = 4;
      });
    }
  }

  function renderLinkRow(body: HTMLElement, mod: ModMatrix, link: ModLink) {
    const box = document.createElement("div");
    box.className = "cinerae-link";
    body.appendChild(box);
    const selects = document.createElement("div");
    selects.className = "cinerae-link-selects";
    box.appendChild(selects);
    const srcSelect = document.createElement("select");
    srcSelect.className = "cinerae-select";
    for (const s of mod.sourceNames) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      srcSelect.appendChild(o);
    }
    srcSelect.value = link.source;
    srcSelect.addEventListener("change", () => {
      hooks.onInteraction();
      link.source = srcSelect.value;
    });
    const arrow = document.createElement("span");
    arrow.className = "cinerae-link-arrow";
    arrow.textContent = "→";
    const dstSelect = document.createElement("select");
    dstSelect.className = "cinerae-select";
    {
      const o = document.createElement("option");
      o.value = "xfade";
      o.textContent = t("ctl.xfade");
      dstSelect.appendChild(o);
    }
    for (const opt of targetOptions()) {
      const o = document.createElement("option");
      o.value = opt.key;
      o.textContent = opt.label;
      dstSelect.appendChild(o);
    }
    dstSelect.value = link.target;
    dstSelect.addEventListener("change", () => {
      hooks.onInteraction();
      mod.retarget(link, dstSelect.value);
      renderMode();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cinerae-chip";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      hooks.onInteraction();
      mod.removeLink(link);
      renderMode();
    });
    selects.append(srcSelect, arrow, dstSelect, remove);
    makeFader(
      box,
      t("ui.lfoDepth"),
      -1,
      1,
      0.01,
      () => link.depth,
      (v) => (link.depth = v),
      (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)} %`
    );
  }

  // ----- MIDI ---------------------------------------------------------------
  function renderMidi(body: HTMLElement) {
    const midi = hooks.getMidi();
    if (!midi) return;
    line(body, `midi : ${midi.status}`);
    if (!midi.enabled) {
      const row = document.createElement("div");
      row.className = "cinerae-chips";
      body.appendChild(row);
      miniButton(row, t("btn.midiOn"), () => {
        void midi.enable().then(() => renderMode());
      });
      return;
    }
    makeSwitch(
      "sw.midiLearn",
      () => midiLearn,
      (next) => {
        midiLearn = next;
        if (!next) midi.disarm();
        renderMode();
      },
      body
    );
    line(body, midiLearn
      ? midi.armedKey
        ? t("ui.midiTurn")
        : t("ui.midiTouch")
      : t("ui.midiSaved"));
    for (const def of controls) {
      const tag = midi.bindingFor(def.key);
      if (!tag) continue;
      const row = document.createElement("div");
      row.className = "cinerae-binding";
      const name = document.createElement("span");
      name.textContent = `${def.label} · ${tag}`;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "cinerae-chip";
      x.textContent = "×";
      x.addEventListener("click", () => {
        midi.unbind(def.key);
        renderMode();
      });
      row.append(name, x);
      body.appendChild(row);
    }
  }

  // ----- empreinte ----------------------------------------------------------
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.maxLength = 24;
  textInput.className = "cinerae-text";
  textInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") hooks.onImprintText(textInput.value);
  });
  textInput.addEventListener("change", () => hooks.onImprintText(textInput.value));

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/svg+xml,image/png,image/jpeg";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) hooks.onImprintFile(file);
    fileInput.value = "";
  });
  panel.appendChild(fileInput);

  // The family line: the wordmark belongs to the intro (and the showcase);
  // multi stays engine-side (Chaos may draw it).
  const FAMILY_ORDER: ImprintFamily[] = [
    "fond",
    "volume",
    "forme",
    "math",
    "fractale",
    "ondes",
    "texte",
    "camera",
  ];

  function renderImprints(body: HTMLElement) {
    renderDefRow(D("balance"), body, true);
    const sel = state.imprint;
    // v0.7.4 — the families are chips (the meta's section row is the only
    // underlined one); the shapes of the family follow as a second row.
    const fams = document.createElement("div");
    fams.className = "cinerae-chips cinerae-pages";
    body.appendChild(fams);
    const famTab = (label: string, active: boolean, onPick: () => void) =>
      makeChip(fams, label, active, () => {
        pushGesture();
        onPick();
      });
    for (const family of FAMILY_ORDER) {
      famTab(t(`fam.${family}`), sel.family === family, () =>
        hooks.onImprintSelect(family, IMPRINT_VARIANTS[family]?.[0] ?? "")
      );
    }
    famTab(t("fam.image"), sel.family === "image", () => fileInput.click());
    const variants = IMPRINT_VARIANTS[sel.family];
    if (variants) {
      const chips = document.createElement("div");
      chips.className = "cinerae-chips";
      body.appendChild(chips);
      for (const v of variants) {
        makeChip(chips, t(`var.${v}`), sel.variant === v, () => {
          pushGesture();
          hooks.onImprintSelect(sel.family, v);
        });
      }
    }
    if (sel.family === "texte") {
      textInput.placeholder = t("ui.freeText");
      textInput.value = sel.text;
      body.appendChild(textInput);
    }
    // partage is rendered once, on top (v0.7.4: it showed twice).
    renderSectionDefs("empreinte", body, undefined, ["balance"]);
  }

  // ----- aide: five short pages ---------------------------------------------
  function renderAide(box: HTMLElement) {
    const tabs = document.createElement("div");
    tabs.className = "cinerae-subtabs";
    box.appendChild(tabs);
    for (const p of AIDE_PAGES) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t(`aide.tab.${p}`);
      b.setAttribute("aria-pressed", String(p === aidePage));
      b.addEventListener("click", () => {
        aidePage = p;
        hooks.onInteraction();
        renderMode();
      });
      tabs.appendChild(b);
    }
    const item = (term: string, text: string) => {
      const row = document.createElement("div");
      row.className = "cinerae-aide-item";
      const dt = document.createElement("span");
      dt.className = "cinerae-aide-term";
      dt.innerHTML = term;
      const dd = document.createElement("span");
      dd.className = "cinerae-aide-text";
      dd.innerHTML = text;
      row.append(dt, dd);
      box.appendChild(row);
    };
    const para = (text: string) => {
      const p = document.createElement("p");
      p.className = "cinerae-aide-text";
      p.innerHTML = text;
      box.appendChild(p);
    };
    if (aidePage === "demo") {
      para(t("aide.demo.intro"));
      item(t("ctl.matiere"), t("aide.demo.matiere"));
      item(t("btn.chaos"), t("aide.demo.chaos"));
      item("↶", t("aide.demo.undo"));
      item(t("btn.garder"), t("aide.demo.garder"));
    } else if (aidePage === "gestes") {
      para(t("aide.gestes.intro"));
      item(t("aide.gestes.toucherT"), t("aide.gestes.toucher"));
      item(t("aide.gestes.pincerT"), t("aide.gestes.pincer"));
      item(t("aide.gestes.glisserT"), t("aide.gestes.glisser"));
      item(t("aide.gestes.panneauT"), t("aide.gestes.panneau"));
      item(t("aide.gestes.vitrineT"), t("aide.gestes.vitrine"));
    } else if (aidePage === "garder") {
      para(t("aide.garder.intro"));
      item("PNG", t("aide.garder.png"));
      item("WebM", t("aide.garder.webm"));
      item("QR", t("aide.garder.qr"));
      para(t("aide.garder.local"));
    } else if (aidePage === "pro") {
      para(t("aide.pro.intro"));
      item(t("ctl.eclipse"), t("aide.demo.lumiere"));
      item(t("ctl.miroir"), t("aide.demo.miroir"));
      item(t("ctl.memoire"), t("aide.demo.memoire"));
      item(t("meta.regarder"), t("aide.pro.regarder"));
      item(t("meta.composer"), t("aide.pro.composer"));
      item(t("meta.brancher"), t("aide.pro.brancher"));
      item(t("btn.voir"), t("aide.pro.voir"));
      item(t("sw.camera"), t("aide.pro.camChip"));
      const keys: [string, string][] = [
        ["F", "aide.key.f"],
        ["C", "aide.key.c"],
        ["X", "aide.key.x"],
        ["Z", "aide.key.z"],
        ["R", "aide.key.r"],
        ["P", "aide.key.p"],
        ["V", "aide.key.v"],
        [t("aide.kspace"), "aide.key.space"],
        [t("aide.kesc"), "aide.key.esc"],
      ];
      for (const [k, label] of keys) item(`<kbd>${k}</kbd>`, t(label));
      item(t("aide.ndiTitle"), t("aide.ndi"));
      item("PC", t("aide.perf"));
    } else {
      para(t("aide.liens.intro"));
      const links = document.createElement("div");
      links.className = "cinerae-aide-links";
      links.innerHTML =
        `<a href="https://linktr.ee/thomasmaury" target="_blank" rel="noopener">${LINKTREE_ICON} linktr.ee/thomasmaury</a>` +
        `<a href="https://nh.thomasmaury.fr" target="_blank" rel="noopener">nh.thomasmaury.fr</a>`;
      box.appendChild(links);
      const langChips = document.createElement("div");
      langChips.className = "cinerae-chips";
      for (const l of ["fr", "en"] as const) {
        makeChip(langChips, l === "fr" ? "Français" : "English", getLang() === l, () => {
          setLang(l);
          hooks.onLang();
          renderMode();
        });
      }
      box.appendChild(langChips);
    }
  }

  // ----- the demo slider ------------------------------------------------------
  // v0.7.3 — DÉMO plays matière alone. v0.7.4 — Pro stacks nothing on top:
  // lumière, miroir and mémoire live in their sections, once each.
  const DEMO_KEYS = ["matiere"];
  function renderBig() {
    bigBox.replaceChildren();
    if (mode !== "demo") return;
    for (const key of DEMO_KEYS) {
      const row = renderDefRow(D(key), bigBox, true);
      row.classList.add("cinerae-big");
    }
  }

  // ----- the folded Pro sections, each with its state on its line ----------
  const sectionEls = new Map<SectionId, { details: HTMLDetailsElement; state: HTMLElement; body: HTMLElement }>();
  const summaryOf = (id: SectionId): string => {
    const tn = state.tuning;
    switch (id) {
      case "corps":
        return `${percent(tn.presenceShare)} · ${t(`mat.${MATERIAL_KEYS[Math.round(Math.min(8, Math.max(0, tn.bodyMat)))]}`)}`;
      case "empreinte": {
        const im = state.imprint;
        const what = im.family === "fond"
          ? t("fam.fond")
          : im.variant
            ? t(`var.${im.variant}`)
            : t(`fam.${im.family}`);
        return `${what} · ${D("impMode").format!(tn.impMode)}`;
      }
      case "son":
        return sensors.mic
          ? `${state.behavior.tempoAuto ? t("ui.tempoMusic") : t("btn.tap")} · ${Math.round(D("tempo").get())} bpm`
          : t("st.micOff");
      case "scenes":
        return `${lastScene ? t(`scene.${lastScene}`) : t("ui.sceneNone")}${
          state.imprint.random ? ` · ${t("sw.randomImprint")} ${Math.round(state.behavior.silenceDelay)} s` : ""
        }`;
      case "modulation": {
        const mod = hooks.getMod();
        const i = mod?.lfos.findIndex((l) => l.target) ?? -1;
        if (i < 0 || !mod) return t("ui.lfoNone");
        return `LFO ${i + 1} · ${byKey.get(mod.lfos[i]!.target)?.label ?? mod.lfos[i]!.target}`;
      }
      case "midi": {
        const midi = hooks.getMidi();
        const n = controls.filter((d) => midi?.bindingFor(d.key)).length;
        return n ? `${n} ${t("ui.bindings")}` : t("ui.midiNone");
      }
      case "camera": {
        const dev = state.devices.cameras.find((d) => d.id === state.behavior.cameraId);
        const which = dev?.label ? dev.label : t(`cam.${state.behavior.cameraFacing}`);
        return `${sensors.camera ? which : t("st.camOff")} · ${t("sw.rawCam")} ${tn.rawCam > 0.5 ? t("ui.yes") : t("ui.no")}`;
      }
      case "reglages":
        return `${Math.round(tn.count / 1000)} k · ${fpsShown} fps · ${getLang().toUpperCase()}`;
    }
  };
  // The line of a meta: its open section's name and state, or the list of
  // its sections while it is folded.
  const metaLine = (meta: MetaId): string =>
    openMetas.has(meta)
      ? `${t(`sec.${metaTab[meta]}`)} · ${summaryOf(metaTab[meta])}`
      : META_SECTIONS[meta].map((id) => t(`sec.${id}`)).join(" · ");
  const metaEls = new Map<MetaId, { details: HTMLDetailsElement; state: HTMLElement; body: HTMLElement }>();
  const syncSummaries = () => {
    for (const [meta, el] of metaEls) el.state.textContent = metaLine(meta);
    syncMidiChip();
  };
  const syncOpenSections = () => {
    openSections.clear();
    for (const meta of openMetas) openSections.add(metaTab[meta]);
  };

  function renderPro() {
    proBox.replaceChildren();
    sectionEls.clear();
    metaEls.clear();
    syncOpenSections();
    for (const meta of META_ORDER) {
      const details = document.createElement("details");
      details.className = "cinerae-meta";
      details.open = openMetas.has(meta);
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      name.className = "cinerae-meta-name";
      name.textContent = t(`meta.${meta}`);
      const st = document.createElement("span");
      st.className = "cinerae-sec-state";
      summary.append(name, st);
      summary.insertAdjacentHTML("beforeend", CHEVRON);
      const mbody = document.createElement("div");
      mbody.className = "cinerae-meta-body";
      details.append(summary, mbody);
      details.addEventListener("toggle", () => {
        // A programmatic open (re-render) fires toggle too: only the hand's
        // own change counts as an interaction.
        if (details.open === openMetas.has(meta)) return;
        if (details.open) {
          openMetas.add(meta);
          if (!mbody.childElementCount) renderMeta(meta, mbody);
        } else {
          openMetas.delete(meta);
        }
        syncOpenSections();
        hooks.onInteraction();
        syncSummaries();
      });
      proBox.appendChild(details);
      metaEls.set(meta, { details, state: st, body: mbody });
      if (details.open) renderMeta(meta, mbody);
    }
    syncSummaries();
  }

  // One meta unfolded: its sections as underlined tabs, the active one
  // rendered underneath by the section renderer it always had.
  function renderMeta(meta: MetaId, mbody: HTMLElement) {
    mbody.replaceChildren();
    const bar = document.createElement("div");
    bar.className = "cinerae-subtabs cinerae-meta-tabs";
    for (const id of META_SECTIONS[meta]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t(`sec.${id}`);
      b.setAttribute("aria-pressed", String(id === metaTab[meta]));
      b.addEventListener("click", () => {
        if (metaTab[meta] === id) return;
        metaTab[meta] = id;
        syncOpenSections();
        hooks.onInteraction();
        renderMode();
      });
      bar.appendChild(b);
    }
    mbody.appendChild(bar);
    const sbody = document.createElement("div");
    sbody.className = "cinerae-sec-body";
    mbody.appendChild(sbody);
    const id = metaTab[meta];
    const el = metaEls.get(meta)!;
    sectionEls.set(id, { details: el.details, state: el.state, body: sbody });
    renderSection(id, sbody);
  }

  function renderSection(id: SectionId, sbody: HTMLElement) {
    sbody.replaceChildren();
    if (id === "corps") renderCorps(sbody);
    else if (id === "empreinte") renderImprints(sbody);
    else if (id === "son") renderSon(sbody);
    else if (id === "scenes") renderScenes(sbody);
    else if (id === "modulation") renderModulation(sbody);
    else if (id === "midi") renderMidi(sbody);
    else if (id === "camera") renderCamera(sbody);
    else renderReglages(sbody);
  }

  // ----- glide (Chaos / Reset / undo made visible on the sliders) ----------
  // Cancelled by bumping the token: any user touch on a slider does so, so
  // the animation never fights the user's hand.
  let glideToken = 0;

  function glide(targets: { def: ControlDef; to: number }[]) {
    // Selects still snap (sweeping a select through foreign values reads as
    // flicker); their fractional in-between lives in the crossfade instead.
    const sliding = targets.filter((t) => !t.def.options);
    for (const t of targets) {
      if (t.def.options) {
        t.def.set(t.to);
        hooks.getMod()?.onAuthored(t.def.key, t.to);
      }
    }
    const token = ++glideToken;
    const from = sliding.map((t) => t.def.get());
    const start = performance.now();
    const DURATION = 450; // ms per slider
    const STAGGER = Math.min(70, 900 / Math.max(1, sliding.length));
    const frame = () => {
      if (token !== glideToken) return;
      const now = performance.now();
      let done = true;
      sliding.forEach((t, i) => {
        const local = (now - start - i * STAGGER) / DURATION;
        if (local < 1) done = false;
        const c = Math.min(1, Math.max(0, local));
        const eased = c * c * (3 - 2 * c);
        const v = from[i]! + (t.to - from[i]!) * eased;
        t.def.set(v);
        hooks.getMod()?.onAuthored(t.def.key, v);
      });
      for (const ref of rowRefs) {
        ref.input.value = String(ref.def.get());
        setFill(ref.input);
        updateTick(ref);
        const text = (ref.def.format ?? plain)(ref.def.get());
        if (ref.readout.textContent !== text) ref.readout.textContent = text;
      }
      syncSelects();
      if (!done) requestAnimationFrame(frame);
      else syncSummaries();
    };
    requestAnimationFrame(frame);
  }

  // ----- status: a short line under the head, only when something is off --
  const statusLine = document.createElement("div");
  statusLine.className = "cinerae-status";
  head.insertAdjacentElement("afterend", statusLine);
  const setStatus = (text: string) => {
    statusLine.textContent = text;
  };

  // ----- rendering ---------------------------------------------------------
  function renderMode() {
    document.documentElement.lang = getLang();
    modeButtons.forEach((b, i) => {
      const active = MODE_IDS[i] === mode && !aideOpen;
      b.textContent = t(`mode.${MODE_IDS[i]}`);
      b.setAttribute("aria-pressed", String(active));
    });
    helpButton.textContent = t("btn.aide");
    helpButton.setAttribute("aria-pressed", String(aideOpen));
    edgeTab.setAttribute("aria-label", t("ui.openPanel"));
    grip.setAttribute("aria-label", t("ui.closePanel"));
    chaosButton.textContent = t("btn.chaos");
    undoButton.title = t("hint.undo");
    undoButton.setAttribute("aria-label", t("btn.undo"));
    keepButton.textContent = t("btn.garder");
    keepButton.title = t("hint.garder");
    voirButton.hidden = mode !== "pro";
    voirButton.textContent = t("btn.voir");
    voirButton.title = t("hint.voir");
    if (mode !== "pro" || aideOpen) setCamMenu(false);
    syncMidiChip();
    body.dataset.mode = aideOpen ? "aide" : mode;

    rowRefs = [];
    selectRefs = [];
    bigBox.style.display = aideOpen || mode !== "demo" ? "none" : "";
    proBox.style.display = aideOpen || mode !== "pro" ? "none" : "";
    aideBox.style.display = aideOpen ? "" : "none";
    if (!aideOpen) renderBig();
    if (!aideOpen && mode === "pro") renderPro();
    else {
      proBox.replaceChildren();
      sectionEls.clear();
      metaEls.clear();
    }
    aideBox.replaceChildren();
    if (aideOpen) renderAide(aideBox);
    if (camMenuOpen) renderCamMenu();
    syncCamera();
  }

  // ----- open / close: swipe, tap outside, edge tab, grip -------------------
  function applyOpen() {
    panel.classList.toggle("open", open);
    edgeTab.classList.toggle("visible", !open);
  }
  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    hooks.onInteraction();
    applyOpen();
    if (!open) setCamMenu(false);
  };
  // v0.7.5 — the camera menu closes on a tap outside it or on Escape (the
  // panel's own Escape, in main.ts, never sees that key).
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !camMenuOpen) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setCamMenu(false);
  }, { capture: true });
  edgeTab.addEventListener("click", () => setOpen(true));
  grip.addEventListener("click", () => setOpen(false));

  // Swipe from the right edge opens (listened on the window, so the stage's
  // own pointer capture never hides it); a swipe to the right on the panel
  // closes it, unless the hand is on a fader; a tap outside closes it.
  const EDGE_PX = 28;
  let edgeStart: { id: number; x: number; y: number } | undefined;
  let closeStart: { id: number; x: number; y: number } | undefined;
  window.addEventListener("pointerdown", (e) => {
    const target = e.target as Element | null;
    if (camMenuOpen && !target?.closest(".cinerae-cam-menu, .cinerae-cam-chip")) setCamMenu(false);
    const inside = target?.closest(".cinerae-panel") !== null && target?.closest(".cinerae-panel") !== undefined;
    if (!inside) {
      if (open && !target?.closest(".cinerae-edge")) setOpen(false);
      if (!open && e.clientX > window.innerWidth - EDGE_PX) {
        edgeStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    }
  }, { capture: true });
  window.addEventListener("pointermove", (e) => {
    if (edgeStart && e.pointerId === edgeStart.id && edgeStart.x - e.clientX > 40) {
      edgeStart = undefined;
      setOpen(true);
    }
  }, { capture: true });
  const endEdge = () => {
    edgeStart = undefined;
  };
  window.addEventListener("pointerup", endEdge, { capture: true });
  window.addEventListener("pointercancel", endEdge, { capture: true });
  panel.addEventListener("pointerdown", (e) => {
    const target = e.target as Element | null;
    if (target?.closest("input, select, textarea")) return;
    closeStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  panel.addEventListener("pointermove", (e) => {
    if (!closeStart || e.pointerId !== closeStart.id) return;
    const dx = e.clientX - closeStart.x;
    const dy = Math.abs(e.clientY - closeStart.y);
    if (dx > 90 && dy < 60) {
      closeStart = undefined;
      setOpen(false);
    } else if (dy > 60) {
      closeStart = undefined;
    }
  });
  const endClose = () => {
    closeStart = undefined;
  };
  panel.addEventListener("pointerup", endClose);
  panel.addEventListener("pointercancel", endClose);

  renderMode();
  applyOpen();

  return {
    get mode() {
      return mode;
    },
    get isOpen() {
      return open;
    },
    /** The registry every engine shares: presets, crossfade, matrix, MIDI,
     * Chaos. Every setting, present or future, lives here. */
    defs: controls as ParamRef[],
    /** Keyboard shortcuts and stage gestures route through the same
     * handlers as the buttons. */
    chaos,
    undoChaos,
    reset,
    /** v0.7.5 — key C, VOIR: the raw camera, Pro only (false when ignored). */
    toggleRawCam,
    pushGesture: () => pushGesture(),
    toggleCollapsed() {
      setOpen(!open);
    },
    writeDef,
    /** v0.7.2 — write a def from a stage gesture (pinch, drag): the rows
     * follow at once, the journal is armed by the caller. */
    gestureWrite(key: string, v: number) {
      writeDef(key, v);
      syncKeys([key]);
    },
    setFps(fps: number) {
      const f = Math.round(fps);
      if (f !== fpsShown) {
        fpsShown = f;
        if (sectionEls.has("reglages") && metaEls.has("brancher")) {
          metaEls.get("brancher")!.state.textContent = metaLine("brancher");
        }
      }
    },
    /** v0.7.1f — the matter counter: [corps, empreinte, fond] as 0..1. */
    setMatter(shares: readonly number[]) {
      for (let i = 0; i < matterFields.length; i++) {
        const v = Math.round(Math.min(1, Math.max(0, shares[i] ?? 0)) * 100);
        const text = `${v} %`;
        if (matterFields[i]!.isConnected && matterFields[i]!.textContent !== text) {
          matterFields[i]!.textContent = text;
        }
      }
    },
    setStatus,
    setSensors(camera: boolean, mic: boolean) {
      const changed = camera !== sensors.camera || mic !== sensors.mic;
      sensors = { camera, mic };
      if (changed && mode === "pro" && !aideOpen) renderMode();
      else if (changed) syncCamera();
    },
    /** v0.7.1e — feed the five-band gauge (values 0..1, ~30 Hz). */
    setBands(values: readonly number[]) {
      for (let i = 0; i < bandFills.length; i++) {
        const el = bandFills[i]!;
        if (!el.isConnected) return;
        const v = Math.min(1, Math.max(0, values[i] ?? 0));
        el.style.height = `${Math.round(v * 100)}%`;
      }
    },
    /** Reflect externally-driven values (modulation, MIDI) on visible rows,
     * without the change flash: called on a slow cadence by the loop. */
    syncValues(keys: ReadonlySet<string>) {
      for (const ref of rowRefs) {
        if (!keys.has(ref.def.key)) continue;
        ref.input.value = String(ref.def.get());
        setFill(ref.input);
        updateTick(ref);
        const text = (ref.def.format ?? plain)(ref.def.get());
        if (ref.readout.textContent !== text) ref.readout.textContent = text;
      }
      syncSelects(keys);
      if (keys.has("rawCam") || keys.has("mirror")) syncCamera();
    },
    refresh() {
      renderMode();
    },
    collapse() {
      open = false;
      applyOpen();
    },
  };
}

export type Panel = ReturnType<typeof createPanel>;

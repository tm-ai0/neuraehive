// Settings panel, v0.7.1c — limpid. A header, three clearly-tabbed modes
// (Umbra / Anima / Pro), then a single accordion stack: one section open at
// a time. Sections group by what they touch: corps, geste, musique,
// particules, look (+ scènes, empreintes, modulation, midi, aide in Pro).
// Labels are short and concrete — three words at most; the hint slot at the
// bottom carries the one-line explanation. Nothing ever scrolls: fixed-height
// rows, sub-tabs for tall sections. Every visible word goes through the
// FR/EN dictionary. The def registry is the single gate: presets, crossfade,
// Chaos (per-def flag + range), matrix and MIDI all reach every setting
// through it. Chaos keeps an undo history (button + Z).
// Desktop: card top-right. Mobile: bottom sheet with a handle.
import { IMPRINT_VARIANTS, type ImprintFamily, type ImprintSettings } from "./imprints";
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

export type PanelMode = "umbra" | "anima" | "pro";

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
    imprintReturn: boolean;
    presenceSense: number;
    /** v0.7.1e — the tempo follows the music's own beats when on. */
    tempoAuto: boolean;
  };
  imprint: ImprintSettings;
  colors: LookColors;
}

export interface PanelHooks {
  onSensor(kind: "camera" | "mic", enabled: boolean): void;
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
  /** Language switched: the host refreshes its own texts (overlay, status). */
  onLang(): void;
  getPresets(): Presets | undefined;
  getMod(): ModMatrix | undefined;
  getMidi(): Midi | undefined;
}

type SectionId =
  | "scenes"
  | "corps"
  | "geste"
  | "musique"
  | "particules"
  | "look"
  | "empreintes"
  | "modulation"
  | "midi"
  | "aide";

interface ControlDef extends ParamRef {
  modes: PanelMode[];
  section: SectionId;
  /** Sub-tab of a grouped section this row belongs to. */
  group?: string;
  format?: (v: number) => string;
  /** Extra gate on top of modes (imprint family params, gated look rows). */
  visible?: () => boolean;
  /** Render as a <select> of these options instead of a slider. */
  options?: () => { value: number; label: string }[];
  /** Moving it reveals or hides other rows: re-render on release. */
  reveals?: boolean;
}

const percent = (v: number) => `${Math.round(v * 100)} %`;
const thousands = (v: number) => `${Math.round(v / 1000)} k`;
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

const SLIDERS_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/><circle cx="7" cy="6" r="1.8" fill="#050403"/><circle cx="13" cy="10" r="1.8" fill="#050403"/><circle cx="9" cy="14" r="1.8" fill="#050403"/></svg>`;

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
] as const;

// Sub-tabs of the tall sections: a section either fits the window whole or
// splits into these fixed pages — never a scrollbar.
const SECTION_GROUPS: Partial<Record<SectionId, string[]>> = {
  corps: ["forme", "tenue"],
  particules: ["grains", "temps"],
  look: ["teinte", "degrade", "fond", "lumiere", "espace"],
  empreintes: ["forme", "reglages"],
  aide: ["modes", "macros", "clavier", "gestes", "camext", "liens"],
};

// v0.7.1d — a macro is a journey, not a volume: from 0 to 1 each composed
// curve travels through a designed arc with a summit. Piecewise smooth
// interpolation through control points; every curve passes through the
// component's default at the macro's home position.
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

const CHAOS_HISTORY_MAX = 8;

export function createPanel(
  root: HTMLElement,
  state: PanelState,
  hooks: PanelHooks
) {
  let mode: PanelMode = "umbra";
  let collapsed = false;
  let sensors = { camera: false, mic: false };
  let midiLearn = false;
  let umbraValue = 0.5;
  // Accordion: exactly one section open at a time (or none).
  let openSection: SectionId | null = "corps";
  const groupOpen: Partial<Record<SectionId, string>> = {};

  // ----- the registry -------------------------------------------------------
  // Every setting is a def: label + hint from the dictionary, section, the
  // modes that show it, and the chaos flag/range when Chaos may draw it.
  const def = (
    key: string,
    section: SectionId,
    modes: PanelMode[],
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    extra: Partial<ControlDef> = {}
  ): ControlDef => ({
    key,
    section,
    modes,
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

  // ---- v0.7.1e: the three macro journeys, one dimension each ---------------
  // Marée owns the MOVEMENT (speed, turbulence, weight, sizes), Éclipse the
  // LIGHT (exposure, contrast, ash, density), Prisme the COLOR AND GEOMETRY
  // (palette drive, hue, symmetries, depth). Each one pushes at least six
  // defs over at least 60 % of their range, so 0 vs 1 reads across the room
  // — measured, not assumed. They are ordinary registry defs (captured by
  // scenes, traversed by the crossfade, drawn by Chaos, modulation targets);
  // their writes cascade through writeDef, and the component defs — written
  // after them in registry order — always win when both are driven.
  const macroValues: Record<string, number> = {
    maree: 0.42,
    eclipse: 0.35,
    prisme: 0,
  };
  const macroTouch: Record<string, number> = {};
  const MACRO_CURVES: Record<string, Record<string, Journey>> = {
    // Marée — mouvement : an oily sea of big slow flakes, the home tide,
    // then a storm of fine fast spray.
    maree: {
      force: [[0, 0.25], [0.42, 1.2], [0.75, 2.7], [1, 2.4]],
      viscosity: [[0, 6.8], [0.42, 2.2], [0.75, 1.1], [1, 0.7]],
      turbulence: [[0, 0.05], [0.42, 0.55], [0.8, 1.2], [1, 1.95]],
      size: [[0, 3.6], [0.42, 1.55], [1, 1.0]],
      breath: [[0, 0.1], [0.42, 1], [1, 1.95]],
      sediment: [[0, 1.8], [0.42, 0.6], [1, 0.1]],
      filament: [[0, 1.6], [0.42, 1], [1, 0.15]],
      trails: [[0, 0.96], [0.42, 0.9], [0.7, 0.6], [1, 0.86]],
      timeScale: [[0, 0.3], [0.42, 1], [1, 1]],
    },
    // Éclipse — lumière : washed daylight, the corona, then a contrasted
    // night bedded in ash.
    eclipse: {
      exposure: [[0, 2.7], [0.35, 1.6], [0.7, 1.1], [1, 0.55]],
      compBright: [[0, 1.5], [0.35, 1], [0.62, 1.15], [1, 0.38]],
      halo: [[0, 0], [0.35, 0], [0.62, 0.9], [1, 0.35]],
      contrast: [[0, 0], [0.35, 0], [0.7, 0.45], [1, 0.85]],
      ashShare: [[0, 0.07], [0.35, 0.15], [1, 0.33]],
      paperGrain: [[0, 0], [0.35, 0], [1, 0.65]],
      fondVisible: [[0, 0.75], [0.35, 0.35], [1, 0.06]],
      bodyMargin: [[0, 0.4], [0.35, 1], [1, 1.9]],
    },
    // Prisme — couleur et géométrie : the hue turns, the palette follows
    // the speed, depth opens, then the frame folds into a mandala.
    prisme: {
      compHue: [[0, 0], [0.5, 0.35], [1, 0.85]],
      colorDriver: [[0, 0], [0.45, 1], [1, 1.9]],
      symMode: [[0, 0], [0.55, 0], [0.75, 3], [1, 4]],
      symN: [[0, 6], [0.55, 6], [0.75, 3], [1, 11]],
      depthAmount: [[0, 0], [0.5, 0.8], [1, 0.55]],
      dofBlur: [[0, 0], [0.55, 0.35], [1, 0.75]],
      strobe: [[0, 0], [0.7, 0.05], [1, 0.4]],
      focusLayer: [[0, 1], [0.55, 1.7], [1, 0.5]],
    },
  };
  const setMacro = (key: string, v: number) => {
    macroValues[key] = v;
    macroTouch[key] = performance.now();
    const curves = MACRO_CURVES[key]!;
    for (const [target, pts] of Object.entries(curves)) {
      writeDef(target, journey(v, pts));
    }
    syncKeys(Object.keys(curves));
  };
  const macroDef = (key: string, chaos: [number, number]): ControlDef =>
    def(key, "scenes", [], 0, 1, 0.005,
      () => macroValues[key]!, (v) => setMacro(key, v),
      { format: percent, chaos });

  const controls: ControlDef[] = [
    // ---- the three macros first: on a preset or crossfade write, their
    // cascade lands before the component defs' own values overwrite it ----
    macroDef("maree", [0.1, 0.95]),
    macroDef("eclipse", [0.05, 0.9]),
    macroDef("prisme", [0, 0.9]),
    // ---- umbra macro: one slider that doses the body's push --------------
    def("umbra", "corps", [], 0, 1, 0.01, () => umbraValue, (v) => {
      umbraValue = v;
      writeDef("push", v * 2);
      writeDef("bodyMargin", v * 2);
    }, { transient: true, format: percent }),
    // ---- corps -----------------------------------------------------------
    // v0.7.1e — who owns the frame: the body or the imprint. One slider,
    // visible from Umbra, hands the grains and the light from one to the
    // other (the imprint's budget and glow follow it in the shaders).
    def("balance", "corps", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.balance, (v) => (state.tuning.balance = v),
      { format: percent, chaos: [0.15, 0.85], group: "forme" }),
    def("presenceShare", "corps", ["anima", "pro"], 0.1, 1, 0.01,
      () => state.tuning.presenceShare, (v) => (state.tuning.presenceShare = v),
      { format: percent, chaos: [0.35, 1], group: "forme" }),
    def("bodyMat", "corps", ["anima", "pro"], 0, 7, 1,
      () => state.tuning.bodyMat, (v) => {
        state.tuning.bodyMat = v;
        state.tuning.matBlend = 0; // the hand takes over from the crossfade
      },
      { discrete: true, options: matOptions, chaos: [0, 7], chaosSnap: true, group: "forme" }),
    def("presenceSize", "corps", ["anima", "pro"], 0.6, 3, 0.05,
      () => state.tuning.presenceSize, (v) => (state.tuning.presenceSize = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.8, 2.4], group: "forme" }),
    def("presenceHold", "corps", ["anima", "pro"], 0, 1, 0.01,
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
    def("elastic", "corps", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.elastic, (v) => (state.tuning.elastic = v),
      { format: percent, chaos: [0.2, 1], group: "tenue" }),
    def("presenceTrail", "corps", ["anima", "pro"], 0, 5, 0.1,
      () => state.tuning.presenceTrail, (v) => (state.tuning.presenceTrail = v),
      { format: (v) => `${plain(v)} s`, chaos: [0.5, 4], group: "tenue" }),
    // One knob replaces threshold + delay: how eagerly the piece sees and
    // keeps a person. 50 % = the validated defaults.
    def("presenceSense", "corps", ["pro"], 0, 1, 0.01,
      () => state.behavior.presenceSense,
      (v) => (state.behavior.presenceSense = v),
      { format: percent, group: "tenue" }),
    // ---- geste -----------------------------------------------------------
    def("push", "geste", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.push, (v) => (state.tuning.push = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.8] }),
    def("gesture", "geste", ["anima", "pro"], 0.3, 3, 0.05,
      () => state.tuning.gestureGain, (v) => (state.tuning.gestureGain = v),
      { format: (v) => `×${plain(v)}` }),
    def("bodyMargin", "geste", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.bodyMargin, (v) => (state.tuning.bodyMargin = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.6] }),
    def("comet", "geste", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.cometGain, (v) => (state.tuning.cometGain = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6] }),
    def("force", "geste", ["pro"], 0, 3, 0.05,
      () => state.tuning.force, (v) => (state.tuning.force = v),
      { chaos: [0.6, 2.6] }),
    def("viscosity", "geste", ["pro"], 0, 8, 0.1,
      () => state.tuning.viscosity, (v) => (state.tuning.viscosity = v),
      { chaos: [0.8, 5.5] }),
    def("mirror", "geste", [], 0, 1, 1,
      () => state.tuning.mirror, (v) => (state.tuning.mirror = v)),
    // ---- musique ---------------------------------------------------------
    // Anima sees one knob; Pro splits it into the three bands.
    def("musicReact", "musique", ["anima"], 0, 2, 0.05,
      () => state.audio.bassGain, (v) => {
        writeDef("bassGain", v);
        writeDef("trebleGain", v);
        writeDef("transientGain", v);
      },
      { transient: true, format: (v) => percent(v / 2) }),
    def("bassGain", "musique", ["pro"], 0, 2, 0.05,
      () => state.audio.bassGain, (v) => (state.audio.bassGain = v),
      { format: (v) => percent(v / 2) }),
    def("trebleGain", "musique", ["pro"], 0, 2, 0.05,
      () => state.audio.trebleGain, (v) => (state.audio.trebleGain = v),
      { format: (v) => percent(v / 2) }),
    def("transientGain", "musique", ["pro"], 0, 2, 0.05,
      () => state.audio.transientGain, (v) => (state.audio.transientGain = v),
      { format: (v) => percent(v / 2) }),
    // v0.7.1d — how visibly each band of the sound registers: bass = mass,
    // low mids = breadth, mids = color, treble = sparkle, accents = shock.
    def("soundFx", "musique", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.soundFx, (v) => (state.tuning.soundFx = v),
      { format: (v) => percent(v / 2), chaos: [0.5, 1.8] }),
    def("voiceEase", "musique", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.voiceEase, (v) => (state.tuning.voiceEase = v),
      { format: percent }),
    def("cymatic", "musique", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.cymGain, (v) => (state.tuning.cymGain = v),
      { format: (v) => percent(v / 2) }),
    def("ember", "musique", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.emberGain, (v) => (state.tuning.emberGain = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6] }),
    def("tonal", "musique", ["pro"], 0.5, 0.95, 0.01,
      () => state.audio.tonalThreshold,
      (v) => (state.audio.tonalThreshold = v)),
    def("silence", "musique", ["pro"], 0.001, 0.15, 0.001,
      () => state.audio.silenceThreshold,
      (v) => (state.audio.silenceThreshold = v)),
    // ---- particules ------------------------------------------------------
    def("count", "particules", ["anima", "pro"], 10_000, 1_000_000, 10_000,
      () => state.tuning.count, (v) => (state.tuning.count = v),
      { format: thousands, group: "grains" }),
    // v0.7.1d — the Pro ceiling auto quality may climb to, never beyond.
    def("countCap", "particules", ["pro"], 400_000, 1_000_000, 50_000,
      () => state.quality.cap, (v) => (state.quality.cap = v),
      { format: thousands, group: "grains" }),
    def("size", "particules", ["anima", "pro"], 0.8, 5, 0.1,
      () => state.tuning.pointSize, (v) => (state.tuning.pointSize = v),
      { format: (v) => `${plain(v)} px`, group: "grains" }),
    def("turbulence", "particules", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.turbulence, (v) => (state.tuning.turbulence = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.5], group: "grains" }),
    def("breath", "particules", ["pro"], 0, 2, 0.05,
      () => state.tuning.gustStrength, (v) => (state.tuning.gustStrength = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.8], group: "grains" }),
    def("filament", "particules", ["pro"], 0, 2, 0.05,
      () => state.tuning.filament, (v) => (state.tuning.filament = v),
      { chaos: [0, 2], group: "grains" }),
    def("ashShare", "particules", ["pro"], 0.05, 0.35, 0.01,
      () => state.tuning.ashShare, (v) => (state.tuning.ashShare = v),
      { format: percent, group: "grains" }),
    def("sediment", "particules", ["pro"], 0, 2, 0.05,
      () => state.tuning.sediment, (v) => (state.tuning.sediment = v),
      { group: "grains" }),
    def("lifeCycle", "particules", ["pro"], 15, 120, 1,
      () => state.tuning.lifeSeconds, (v) => (state.tuning.lifeSeconds = v),
      { format: (v) => `${Math.round(v)} s`, group: "grains" }),
    def("timeScale", "particules", ["anima", "pro"], -1, 1, 0.01,
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
    def("trails", "particules", ["anima", "pro"], 0.4, 0.995, 0.005,
      () => state.tuning.trailDecay, (v) => (state.tuning.trailDecay = v),
      { format: (v) => percent((v - 0.4) / 0.595), chaos: [0.7, 0.95], group: "temps" }),
    def("memoryGain", "particules", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.memoryGain, (v) => (state.tuning.memoryGain = v),
      { format: percent, reveals: true, chaos: [0, 0.5], group: "temps" }),
    def("memorySeconds", "particules", ["anima", "pro"], 2, 60, 1,
      () => state.tuning.memorySeconds, (v) => (state.tuning.memorySeconds = v),
      {
        format: (v) => `${Math.round(v)} s`,
        visible: () => state.tuning.memoryGain > 0.001,
        group: "temps",
      }),
    def("imprintReturn", "particules", [], 0, 1, 1,
      () => (state.behavior.imprintReturn ? 1 : 0),
      (v) => (state.behavior.imprintReturn = v > 0.5)),
    // ---- look ------------------------------------------------------------
    def("compHue", "look", ["anima", "pro"], 0, 1, 0.005,
      () => state.tuning.compHue, (v) => (state.tuning.compHue = v),
      { format: (v) => `${Math.round(v * 360)}°`, chaos: [0, 1], group: "teinte" }),
    def("colorDriver", "look", ["anima", "pro"], 0, 3, 1,
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
    def("blendMode", "look", ["anima", "pro"], 0, 4, 1,
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
    def("fondMat", "look", ["anima", "pro"], 0, 7, 1,
      () => state.tuning.fondMat, (v) => {
        state.tuning.fondMat = v;
        state.tuning.matBlend = 0;
      },
      { discrete: true, options: matOptions, chaos: [0, 7], chaosSnap: true, group: "fond" }),
    def("fondVisible", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.fondVisible, (v) => (state.tuning.fondVisible = v),
      { format: percent, chaos: [0.15, 0.8], group: "fond" }),
    def("fondReact", "look", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.fondReact, (v) => (state.tuning.fondReact = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6], group: "fond" }),
    def("ghost", "look", ["pro"], 0, 0.35, 0.005,
      () => state.tuning.ghost, (v) => (state.tuning.ghost = v),
      { format: (v) => percent(v / 0.35), group: "fond" }),
    def("rawCam", "look", [], 0, 1, 1,
      () => state.tuning.rawCam, (v) => (state.tuning.rawCam = v),
      { transient: true, hidden: true }),
    def("halo", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.halo, (v) => (state.tuning.halo = v),
      { format: percent, chaos: [0, 0.5], group: "lumiere" }),
    // v0.7.1e — global composition: four whole-frame handles any LFO,
    // macro, scene or MIDI knob can drive.
    def("compBright", "look", ["anima", "pro"], 0.25, 2, 0.01,
      () => state.tuning.compBright, (v) => (state.tuning.compBright = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.6, 1.5], group: "lumiere" }),
    def("contrast", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.contrast, (v) => (state.tuning.contrast = v),
      { format: percent, chaos: [0, 0.7], group: "lumiere" }),
    def("paperGrain", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.paperGrain, (v) => (state.tuning.paperGrain = v),
      { format: percent, group: "lumiere" }),
    def("strobe", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.strobe, (v) => (state.tuning.strobe = v),
      { format: percent, chaos: [0, 0.3], group: "lumiere" }),
    def("fringe", "look", ["pro"], 0, 1, 0.01,
      () => state.tuning.fringeTint, (v) => (state.tuning.fringeTint = v),
      {
        format: (v) =>
          v < 0.4 ? t("val.warm") : v > 0.6 ? t("val.cool") : t("val.neutral"),
        group: "lumiere",
      }),
    def("exposure", "look", ["pro"], 0.5, 3, 0.05,
      () => state.tuning.exposure, (v) => (state.tuning.exposure = v),
      { group: "lumiere" }),
    def("depthAmount", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.depthAmount, (v) => (state.tuning.depthAmount = v),
      { format: percent, reveals: true, chaos: [0, 0.8], group: "espace" }),
    def("focusLayer", "look", ["anima", "pro"], 0, 2, 1,
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
    def("dofBlur", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.dofBlur, (v) => (state.tuning.dofBlur = v),
      { format: percent, visible: () => state.tuning.depthAmount > 0.001, group: "espace" }),
    def("compZoom", "look", ["anima", "pro"], 0.6, 1.8, 0.01,
      () => state.tuning.compZoom, (v) => (state.tuning.compZoom = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.85, 1.4], group: "espace" }),
    def("compRot", "look", ["anima", "pro"], -3.1416, 3.1416, 0.01,
      () => state.tuning.compRot, (v) => (state.tuning.compRot = v),
      {
        format: (v) => `${Math.round((v * 180) / Math.PI)}°`,
        chaos: [-0.8, 0.8],
        group: "espace",
      }),
    def("symMode", "look", ["anima", "pro"], 0, 4, 1,
      () => state.tuning.symMode, (v) => (state.tuning.symMode = v),
      {
        discrete: true,
        chaos: [0, 4],
        chaosSnap: true,
        reveals: true,
        group: "espace",
        options: () => [
          { value: 0, label: t("opt.symNone") },
          { value: 1, label: t("opt.symH") },
          { value: 2, label: t("opt.symV") },
          { value: 3, label: t("opt.symQuad") },
          { value: 4, label: t("opt.symRadial") },
        ],
      }),
    def("symN", "look", ["anima", "pro"], 3, 12, 1,
      () => state.tuning.symN, (v) => (state.tuning.symN = v),
      {
        format: (v) => String(Math.round(v)),
        visible: () => state.tuning.symMode > 3.5,
        chaos: [3, 9],
        chaosSnap: true,
        group: "espace",
      }),
    // ---- crossfade (rendered by the scenes section, target like any) -----
    def("xfade", "scenes", [], 0, 1, 0.005,
      () => hooks.getXfade(), (v) => hooks.onCrossfade(v),
      { format: percent, reveals: true, transient: true }),
    // ---- crossfade material pair: registry plumbing, never shown ---------
    def("bodyMatA", "scenes", [], 0, 7, 0.01,
      () => state.tuning.bodyMatA, (v) => (state.tuning.bodyMatA = v),
      { transient: true, hidden: true }),
    def("bodyMatB", "scenes", [], 0, 7, 0.01,
      () => state.tuning.bodyMatB, (v) => (state.tuning.bodyMatB = v),
      { transient: true, hidden: true }),
    def("fondMatA", "scenes", [], 0, 7, 0.01,
      () => state.tuning.fondMatA, (v) => (state.tuning.fondMatA = v),
      { transient: true, hidden: true }),
    def("fondMatB", "scenes", [], 0, 7, 0.01,
      () => state.tuning.fondMatB, (v) => (state.tuning.fondMatB = v),
      { transient: true, hidden: true }),
    def("matBlend", "scenes", [], 0, 1, 0.001,
      () => state.tuning.matBlend, (v) => (state.tuning.matBlend = v),
      { transient: true, hidden: true }),
    // ---- v0.7.1e — the imprint layer: mode and transform ------------------
    // Position, rotation and scale are ordinary defs: the music dances them,
    // LFOs, macros, Chaos, scenes and MIDI drive them like anything else.
    def("impMode", "empreintes", ["pro"], 0, 2, 1,
      () => state.tuning.impMode, (v) => (state.tuning.impMode = v),
      {
        discrete: true,
        chaos: [0, 2],
        chaosSnap: true,
        group: "reglages",
        options: () => [
          { value: 0, label: t("opt.impCreux") },
          { value: 1, label: t("opt.impMix") },
          { value: 2, label: t("opt.impLibre") },
        ],
      }),
    def("impX", "empreintes", ["pro"], -0.4, 0.4, 0.005,
      () => state.tuning.impX, (v) => (state.tuning.impX = v),
      { format: (v) => percent((v + 0.4) / 0.8), chaos: [-0.22, 0.22], group: "reglages" }),
    def("impY", "empreintes", ["pro"], -0.35, 0.35, 0.005,
      () => state.tuning.impY, (v) => (state.tuning.impY = v),
      { format: (v) => percent((v + 0.35) / 0.7), chaos: [-0.18, 0.18], group: "reglages" }),
    def("impRot", "empreintes", ["pro"], -3.1416, 3.1416, 0.01,
      () => state.tuning.impRot, (v) => (state.tuning.impRot = v),
      {
        format: (v) => `${Math.round((v * 180) / Math.PI)}°`,
        chaos: [-1.6, 1.6],
        group: "reglages",
      }),
    def("impScale", "empreintes", ["pro"], 0.35, 2.4, 0.01,
      () => state.tuning.impScale, (v) => (state.tuning.impScale = v),
      { format: (v) => `×${plain(v)}`, chaos: [0.6, 1.9], group: "reglages" }),
    // ---- v0.7.1e — the shared tempo (rendered by the modulation pages) ----
    def("tempo", "modulation", [], 40, 220, 1,
      () => hooks.getMod()?.tempo ?? 120,
      (v) => {
        const m = hooks.getMod();
        if (m) m.tempo = v;
      },
      { format: (v) => `${Math.round(v)} bpm` }),
    // ---- paramètres fins des empreintes (pro, gated by family) -----------
    def("waveFreq", "empreintes", ["pro"], 0.5, 8, 0.1,
      () => state.imprint.wave.freq, (v) => (state.imprint.wave.freq = v),
      { visible: () => state.imprint.family === "ondes", imprint: true, group: "reglages" }),
    def("waveAmp", "empreintes", ["pro"], 0.02, 0.25, 0.005,
      () => state.imprint.wave.amp, (v) => (state.imprint.wave.amp = v),
      { visible: () => state.imprint.family === "ondes", imprint: true, group: "reglages" }),
    def("waveThick", "empreintes", ["pro"], 0.001, 0.02, 0.001,
      () => state.imprint.wave.thickness,
      (v) => (state.imprint.wave.thickness = v),
      { visible: () => state.imprint.family === "ondes", imprint: true, group: "reglages" }),
    def("waveCount", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.wave.waves, (v) => (state.imprint.wave.waves = v),
      {
        visible: () => state.imprint.family === "ondes",
        imprint: true,
        format: (v) => String(Math.round(v)),
        group: "reglages",
      }),
    def("waveDrift", "empreintes", ["pro"], 0, 2, 0.05,
      () => state.imprint.wave.drift, (v) => (state.imprint.wave.drift = v),
      { visible: () => state.imprint.family === "ondes", imprint: true, group: "reglages" }),
    def("multiN", "empreintes", ["pro"], 2, 9, 1,
      () => state.imprint.multi.n, (v) => (state.imprint.multi.n = v),
      {
        visible: () => state.imprint.family === "multi",
        imprint: true,
        format: (v) => String(Math.round(v)),
        group: "reglages",
      }),
    def("multiSize", "empreintes", ["pro"], 0.08, 0.4, 0.01,
      () => state.imprint.multi.size, (v) => (state.imprint.multi.size = v),
      { visible: () => state.imprint.family === "multi", imprint: true, group: "reglages" }),
    def("spin", "empreintes", ["pro"], 0, 2, 0.05,
      () => state.imprint.spin, (v) => (state.imprint.spin = v),
      { visible: () => state.imprint.family === "volume", imprint: true, group: "reglages" }),
    def("lissaA", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.lissa.a, (v) => (state.imprint.lissa.a = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
        group: "reglages",
      }),
    def("lissaB", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.lissa.b, (v) => (state.imprint.lissa.b = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
        group: "reglages",
      }),
  ];

  // Snapshot taken at creation, while the state still holds its defaults —
  // Reset glides every def back to these values.
  const initialValues = new Map<ControlDef, number>(
    controls.map((def) => [def, def.get()])
  );

  // ----- skeleton ----------------------------------------------------------
  const panel = document.createElement("section");
  panel.className = "cinerae-panel";
  panel.setAttribute("aria-label", "Cineræ");
  root.appendChild(panel);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "cinerae-open";
  openButton.innerHTML = SLIDERS_ICON;
  root.appendChild(openButton);

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "cinerae-handle";
  handle.innerHTML = `<span class="cinerae-handle-bar"></span>`;
  panel.appendChild(handle);

  const header = document.createElement("header");
  header.className = "cinerae-header";
  panel.appendChild(header);

  const fpsLine = document.createElement("span");
  fpsLine.className = "cinerae-fps";
  fpsLine.textContent = "— fps";
  header.appendChild(fpsLine);

  const langButton = document.createElement("button");
  langButton.type = "button";
  langButton.className = "cinerae-lang";
  langButton.addEventListener("click", () => {
    setLang(getLang() === "fr" ? "en" : "fr");
    hooks.onInteraction();
    hooks.onLang();
    renderMode();
  });
  header.appendChild(langButton);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "cinerae-close";
  closeButton.textContent = "–";
  header.appendChild(closeButton);

  const statusLine = document.createElement("div");
  statusLine.className = "cinerae-status";
  panel.appendChild(statusLine);

  const modeBar = document.createElement("div");
  modeBar.className = "cinerae-modes";
  modeBar.setAttribute("role", "tablist");
  panel.appendChild(modeBar);
  const MODE_IDS: PanelMode[] = ["umbra", "anima", "pro"];
  const modeButtons = MODE_IDS.map((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      mode = id;
      // The raw camera view is a Pro-only calibration tool: leaving Pro
      // always turns it off — the public promise stays true.
      if (id !== "pro" && state.tuning.rawCam > 0.5) writeDef("rawCam", 0);
      hooks.onInteraction();
      renderMode();
    });
    modeBar.appendChild(b);
    return b;
  });

  // v0.7.1d — the three macro journeys, at the head of the panel in every
  // mode: what a performer shows to people in thirty seconds.
  const macroBox = document.createElement("div");
  macroBox.className = "cinerae-macros";
  panel.appendChild(macroBox);

  const sensorsBox = document.createElement("div");
  sensorsBox.className = "cinerae-sensors";
  panel.appendChild(sensorsBox);

  // v0.7.1e — the five-band gauge: what the microphone really hears, bar by
  // bar (graves, bas-médiums, médiums, aigus, attaques). Visible whenever
  // the mic runs, so a dead capture reads at a glance.
  const BAND_KEYS = ["bass", "lowMid", "mid", "treble", "hit"] as const;
  const bandsBox = document.createElement("div");
  bandsBox.className = "cinerae-bands";
  panel.appendChild(bandsBox);
  const bandFills: HTMLElement[] = [];
  const bandNames: HTMLElement[] = [];
  for (const key of BAND_KEYS) {
    const col = document.createElement("span");
    col.className = "cinerae-band";
    const track = document.createElement("span");
    track.className = "cinerae-band-track";
    const fill = document.createElement("span");
    fill.className = "cinerae-band-fill";
    track.appendChild(fill);
    const name = document.createElement("span");
    name.className = "cinerae-band-name";
    name.dataset.key = key;
    col.append(track, name);
    bandsBox.appendChild(col);
    bandFills.push(fill);
    bandNames.push(name);
  }
  const syncBandsVisible = () => {
    bandsBox.style.display = mode !== "umbra" && sensors.mic ? "" : "none";
  };

  const makeSwitch = (
    labelKey: string,
    get: () => boolean,
    toggle: (next: boolean) => void,
    parent: HTMLElement = sensorsBox,
    hintKey?: string
  ) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cinerae-switch";
    row.setAttribute("role", "switch");
    if (hintKey) row.dataset.hint = t(hintKey);
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
    });
    parent.appendChild(row);
    sync();
    return { row, sync };
  };

  const cameraSwitch = makeSwitch(
    "sw.camera",
    () => sensors.camera,
    (next) => hooks.onSensor("camera", next)
  );
  const micSwitch = makeSwitch(
    "sw.mic",
    () => sensors.mic,
    (next) => hooks.onSensor("mic", next)
  );

  const actions = document.createElement("div");
  actions.className = "cinerae-actions";
  panel.appendChild(actions);

  const crystalBar = document.createElement("div");
  crystalBar.className = "cinerae-crystal";
  crystalBar.innerHTML = `<span class="cinerae-crystal-label"></span><span class="cinerae-crystal-track"><span class="cinerae-crystal-fill"></span></span>`;
  panel.appendChild(crystalBar);
  const crystalFill = crystalBar.querySelector(".cinerae-crystal-fill") as HTMLElement;
  const crystalLabel = crystalBar.querySelector(".cinerae-crystal-label") as HTMLElement;

  // ----- chaos & reset: registry-driven, with an undo history ---------------
  const writeDef = (key: string, v: number) => {
    const def = controls.find((d) => d.key === key);
    if (!def) return;
    def.set(Math.min(def.max, Math.max(def.min, v)));
    hooks.getMod()?.onAuthored(key, v);
  };

  interface ChaosSnap {
    values: [ControlDef, number][];
    colors: LookColors;
    imprint: { family: ImprintFamily; variant: string };
  }
  const chaosHistory: ChaosSnap[] = [];
  const syncUndo = () => {
    undoButton.disabled = chaosHistory.length === 0;
  };

  const chaos = () => {
    hooks.onInteraction();
    chaosTimes.push(performance.now());
    // Remember where we stand: a lucky draw clicked past can come back.
    chaosHistory.push({
      values: controls
        .filter((d) => !d.transient)
        .map((d) => [d, d.get()] as [ControlDef, number]),
      colors: cloneLookColors(state.colors),
      imprint: { family: state.imprint.family, variant: state.imprint.variant },
    });
    if (chaosHistory.length > CHAOS_HISTORY_MAX) chaosHistory.shift();
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
    // One time out of three chaos also draws a palette — the tint belongs
    // to the storm too. (Palettes are choices, not defs: the draw stays here.)
    if (Math.random() < 1 / 3) {
      const p = PALETTES[(Math.random() * PALETTES.length) | 0]!;
      hooks.onPaletteSelect(p.name);
    }
    syncUndo();
    window.setTimeout(() => renderMode(), 600);
  };

  const undoChaos = () => {
    const snap = chaosHistory.pop();
    if (!snap) return;
    hooks.onInteraction();
    glide(snap.values.map(([def, to]) => ({ def, to })));
    // Colors and imprint come back too — the draw touched them.
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
    umbraValue = 0.5;
    renderMode();
    glide(
      controls
        .filter((d) => !d.transient)
        .map((def) => ({ def, to: initialValues.get(def)! }))
    );
  };

  const chaosButton = document.createElement("button");
  chaosButton.type = "button";
  chaosButton.addEventListener("click", chaos);
  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className = "cinerae-undo";
  undoButton.textContent = "↶";
  undoButton.addEventListener("click", undoChaos);
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.addEventListener("click", reset);
  actions.append(chaosButton, undoButton, resetButton);
  syncUndo();

  // ----- umbra: the tints and one slider, nothing else ----------------------
  const umbraBox = document.createElement("div");
  umbraBox.className = "cinerae-umbra";
  panel.appendChild(umbraBox);

  // ----- accordion sections -------------------------------------------------
  const SECTION_ORDER: SectionId[] = [
    "scenes",
    "corps",
    "geste",
    "musique",
    "particules",
    "look",
    "empreintes",
    "modulation",
    "midi",
    "aide",
  ];
  const sections = {} as Record<
    SectionId,
    { box: HTMLElement; head: HTMLButtonElement; body: HTMLElement; title: HTMLElement }
  >;
  for (const id of SECTION_ORDER) {
    const box = document.createElement("div");
    box.className = "cinerae-section";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "cinerae-section-head";
    head.innerHTML = `<span class="cinerae-section-title"></span><span class="cinerae-section-caret" aria-hidden="true"></span>`;
    const body = document.createElement("div");
    body.className = "cinerae-section-body";
    head.addEventListener("click", () => {
      // One section open at a time: opening one closes the others.
      openSection = openSection === id ? null : id;
      hooks.onInteraction();
      renderMode();
    });
    box.append(head, body);
    panel.appendChild(box);
    sections[id] = {
      box,
      head,
      body,
      title: head.querySelector(".cinerae-section-title") as HTMLElement,
    };
  }

  // ----- reserved hint slot -------------------------------------------------
  // Hints never move anything: they render here, in a slot that is always
  // present, on hover or focus of any row that carries one.
  const hintBar = document.createElement("div");
  hintBar.className = "cinerae-hintbar";
  panel.appendChild(hintBar);
  const showHint = (target: EventTarget | null) => {
    const el =
      target instanceof Element ? target.closest<HTMLElement>("[data-hint]") : null;
    hintBar.textContent = el?.dataset.hint ?? "";
  };
  panel.addEventListener("mouseover", (e) => showHint(e.target));
  panel.addEventListener("mouseleave", () => (hintBar.textContent = ""));
  panel.addEventListener("focusin", (e) => showHint(e.target));

  // ----- shared row builders ------------------------------------------------
  let rowRefs: {
    def: ControlDef;
    input: HTMLInputElement;
    readout: HTMLSpanElement;
    row: HTMLElement;
  }[] = [];

  // Reflect a macro's cascade on its visible component rows mid-drag.
  const syncKeys = (keys: string[]) => {
    for (const ref of rowRefs) {
      if (!keys.includes(ref.def.key)) continue;
      ref.input.value = String(ref.def.get());
      setFill(ref.input);
      ref.readout.textContent = (ref.def.format ?? plain)(ref.def.get());
    }
  };
  const changedTimers = new Map<HTMLElement, number>();
  const markChanged = (row: HTMLElement) => {
    row.classList.add("changed");
    const prev = changedTimers.get(row);
    if (prev !== undefined) window.clearTimeout(prev);
    changedTimers.set(
      row,
      window.setTimeout(() => {
        row.classList.remove("changed");
        changedTimers.delete(row);
      }, 900)
    );
  };

  // The track fill follows the value — the row itself is the fader.
  const setFill = (input: HTMLInputElement) => {
    const min = Number(input.min);
    const max = Number(input.max);
    const f = ((Number(input.value) - min) / Math.max(1e-9, max - min)) * 100;
    input.style.setProperty("--f", `${f.toFixed(1)}%`);
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

  // The shared fader template: one fixed-height row, name at the left,
  // value at the right, a clean track underneath the whole row. Clicking
  // anywhere on the row drags the fader — nothing else.
  const makeSliderRow = (
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    format: (v: number) => string = plain
  ) => {
    const row = document.createElement("div");
    row.className = "cinerae-row";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    if (label) input.setAttribute("aria-label", label);
    const name = document.createElement("span");
    name.className = "cinerae-row-name";
    name.textContent = label;
    const readout = document.createElement("span");
    readout.className = "cinerae-value";
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
    row.append(input, name, readout);
    parent.appendChild(row);
    return { row, input, readout, name, show };
  };

  const renderDefRow = (def: ControlDef, parent: HTMLElement) => {
    const mod = hooks.getMod();
    if (def.options) {
      const { row, name } = makeSelect(parent, def.label, def.options(), def.get, (v) => {
        def.set(v);
        mod?.onAuthored(def.key, v);
        if (def.imprint) hooks.onImprintParams();
        renderMode();
      });
      row.dataset.hint = t(`hint.${def.key}`);
      decorateRow(row, name, def);
      return;
    }
    const { row, input, readout, name } = makeSliderRow(
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
      def.format ?? plain
    );
    row.dataset.hint = t(`hint.${def.key}`);
    if (def.reveals) input.addEventListener("change", () => renderMode());
    decorateRow(row, name, def);
    rowRefs.push({ def, input, readout, row });
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
      name.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        midi.arm(def.key);
        renderMode();
      });
    }
  };

  const renderSectionDefs = (id: SectionId, body: HTMLElement, group?: string) => {
    for (const def of controls) {
      if (def.section !== id) continue;
      if (group !== undefined && def.group !== group) continue;
      if (!def.modes.includes(mode)) continue;
      if (def.visible && !def.visible()) continue;
      renderDefRow(def, body);
    }
  };

  // ----- sub-tabs of a grouped section --------------------------------------
  // Renders the tab chips, remembers the active page, returns its id.
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
      bar.className = "cinerae-subtabs";
      for (const g of groups) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = g.label;
        b.classList.toggle("active", g.key === active);
        b.setAttribute("aria-pressed", String(g.key === active));
        b.addEventListener("click", () => {
          groupOpen[id] = g.key;
          hooks.onInteraction();
          renderMode();
        });
        bar.appendChild(b);
      }
      body.appendChild(bar);
    }
    return active;
  };

  // Groups of a def-driven section that actually have content in this mode.
  const defGroups = (id: SectionId, withExtras: string[] = []): { key: string; label: string }[] =>
    (SECTION_GROUPS[id] ?? []).filter((g) =>
      withExtras.includes(g) ||
      controls.some(
        (d) =>
          d.section === id &&
          d.group === g &&
          d.modes.includes(mode) &&
          (!d.visible || d.visible())
      )
    ).map((g) => ({ key: g, label: t(`grp.${g}`) }));

  // ----- teintes: the real palette, its name readable -----------------------
  const renderTeintes = (parent: HTMLElement) => {
    const grid = document.createElement("div");
    grid.className = "cinerae-teintes";
    grid.dataset.hint = t("hint.teinte");
    parent.appendChild(grid);
    for (const p of PALETTES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-teinte";
      b.classList.toggle("active", state.colors.name === p.name);
      const band = document.createElement("span");
      band.className = "cinerae-teinte-band";
      // The true palette: its ground first, then the dust gradient.
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
        hooks.onPaletteSelect(p.name);
      });
      grid.appendChild(b);
    }
  };

  // ----- scenes section (pro) ----------------------------------------------
  const presetFileInput = document.createElement("input");
  presetFileInput.type = "file";
  presetFileInput.accept = "application/json,.json";
  presetFileInput.style.display = "none";
  panel.appendChild(presetFileInput);
  presetFileInput.addEventListener("change", () => {
    const file = presetFileInput.files?.[0];
    if (file) {
      void hooks.getPresets()?.loadFile(file).then((err) => {
        if (err) statusLine.textContent = t("st.badPreset");
        renderMode();
      });
    }
    presetFileInput.value = "";
  });

  let recButton: HTMLButtonElement | undefined;

  const miniButton = (
    parent: HTMLElement,
    label: string,
    onClick: () => void,
    hint = ""
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cinerae-mini";
    b.textContent = label;
    if (hint) b.dataset.hint = hint;
    b.addEventListener("click", () => {
      hooks.onInteraction();
      onClick();
    });
    parent.appendChild(b);
    return b;
  };

  function renderScenes(body: HTMLElement) {
    const presets = hooks.getPresets();
    const chips = document.createElement("div");
    chips.className = "cinerae-chips";
    chips.dataset.hint = t("hint.scenes");
    body.appendChild(chips);
    for (const p of presets?.builtIns ?? []) {
      makeChip(chips, t(`scene.${p.name}`), false, () => {
        presets?.apply(structuredClone(p) as PresetData);
        renderMode();
      });
    }

    const io = document.createElement("div");
    io.className = "cinerae-mini-row";
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

    // The crossfade row: the VJ's base gesture, a def like any other.
    const xfadeDef = controls.find((d) => d.key === "xfade")!;
    const slotNames = presets?.slotNames ?? [undefined, undefined];
    const slots = document.createElement("div");
    slots.className = "cinerae-slotline";
    slots.textContent = presets?.hasSlots
      ? `A · ${slotNames[0]}  ↔  B · ${slotNames[1]}`
      : t("hint.xfadeFlow");
    body.appendChild(slots);
    renderDefRow(xfadeDef, body);
  }

  const renderCaptureRow = (body: HTMLElement) => {
    const cap = document.createElement("div");
    cap.className = "cinerae-mini-row";
    body.appendChild(cap);
    miniButton(cap, "png", () => hooks.onCapturePng(), t("hint.png"));
    recButton = miniButton(cap, "● rec", () => {
      const on = hooks.onToggleRecord();
      recButton!.classList.toggle("recording", on);
      recButton!.textContent = on ? "■ stop" : "● rec";
    }, t("hint.rec"));
    miniButton(cap, t("btn.fullscreen"), () => hooks.onFullscreen(), t("hint.fullscreen"));
  };

  // ----- look section -------------------------------------------------------
  const colorPairRow = (
    parent: HTMLElement,
    labelKey: string,
    hintKey: string,
    entries: { value: Rgb; set: (c: Rgb) => void; title: string }[]
  ) => {
    const row = document.createElement("div");
    row.className = "cinerae-colors";
    row.dataset.hint = t(hintKey);
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

  function renderLookGradient(body: HTMLElement) {
    // Gradient editor: 2..5 stops + background, straight into live colors.
    {
      const grad = document.createElement("div");
      grad.className = "cinerae-colors";
      grad.dataset.hint = t("hint.gradient");
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
        b.className = "cinerae-mini";
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
  }

  function renderLook(body: HTMLElement) {
    const extras = mode === "pro" ? ["teinte", "degrade"] : ["teinte"];
    const active = renderGroupTabs("look", defGroups("look", extras), body);
    if (active === "teinte") {
      renderTeintes(body);
      renderSectionDefs("look", body, "teinte");
    } else if (active === "degrade") {
      renderLookGradient(body);
    } else {
      renderSectionDefs("look", body, active);
      if (active === "fond" && mode === "pro") {
        makeSwitch(
          "sw.rawCam",
          () => state.tuning.rawCam > 0.5,
          (next) => writeDef("rawCam", next ? 1 : 0),
          body,
          "hint.rawCam"
        );
      }
    }
    renderCaptureRow(body);
  }

  // ----- corps section (grouped: forme / tenue) -----------------------------
  function renderCorps(body: HTMLElement) {
    const active = renderGroupTabs("corps", defGroups("corps", ["forme", "tenue"]), body);
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
    } else {
      makeSwitch(
        "sw.auto",
        () => state.quality.auto,
        (next) => (state.quality.auto = next),
        body
      );
    }
  }

  // ----- geste: the mirror lives here, visible from Anima -------------------
  function renderGeste(body: HTMLElement) {
    renderSectionDefs("geste", body);
    makeSwitch(
      "sw.mirror",
      () => state.tuning.mirror > 0.5,
      (next) => writeDef("mirror", next ? 1 : 0),
      body,
      "hint.mirror"
    );
  }

  function renderParticules(body: HTMLElement) {
    const active = renderGroupTabs("particules", defGroups("particules"), body);
    renderSectionDefs("particules", body, active);
    if (active === "temps" && mode === "pro") {
      makeSwitch(
        "sw.imprintReturn",
        () => state.behavior.imprintReturn,
        (next) => writeDef("imprintReturn", next ? 1 : 0),
        body,
        "hint.imprintReturn"
      );
    }
  }

  // ----- modulation section -------------------------------------------------
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

  // Tempo divisions, labeled from a quarter beat to four bars.
  const DIV_LABELS = ["divQ", "divH", "divB1", "divB2", "divM1", "divM2", "divM4"];

  // Tap tempo: the mean of the recent tap intervals writes the tempo def.
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
    syncKeys(["tempo"]);
  };

  // v0.7.1e — one LFO page: shape, frequency in Hz or as a tempo division,
  // amplitude, and ONE target — any registry setting, macros, imprint
  // transform and the four global composition handles included.
  function renderLfoBlock(body: HTMLElement, i: number) {
    const mod = hooks.getMod()!;
    const lfo = mod.lfos[i]!;
    const shapeRow = document.createElement("div");
    shapeRow.className = "cinerae-chips";
    shapeRow.dataset.hint = t("hint.lfoShape");
    body.appendChild(shapeRow);
    for (const shape of LFO_SHAPES) {
      makeChip(shapeRow, t(`lfo.${shape}`), lfo.shape === shape, () => {
        lfo.shape = shape as LfoShape;
        renderMode();
      });
    }
    const keys = ["", ...targetOptions().map((o) => o.key), "xfade"];
    const { row: targetRow } = makeSelect(
      body,
      t("ui.lfoTarget"),
      keys.map((k, idx) => ({
        value: idx,
        label: k
          ? controls.find((d) => d.key === k)?.label ?? k
          : t("ui.lfoNone"),
      })),
      () => Math.max(0, keys.indexOf(lfo.target)),
      (v) => {
        mod.setLfoTarget(i, keys[v] ?? "");
        renderMode();
      }
    );
    targetRow.dataset.hint = t("hint.lfoTarget");
    makeSliderRow(
      body,
      t("ui.lfoAmp"),
      0,
      1,
      0.01,
      () => lfo.amp,
      (v) => (lfo.amp = v),
      percent
    );
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
        TEMPO_DIVS.map((_, idx) => ({ value: idx, label: t(`div.${DIV_LABELS[idx]}`) })),
        () => Math.max(0, TEMPO_DIVS.findIndex((d) => d === lfo.div)),
        (v) => (lfo.div = TEMPO_DIVS[v] ?? 4)
      );
      const tempoDef = controls.find((d) => d.key === "tempo")!;
      renderDefRow(tempoDef, body);
      const tRow = document.createElement("div");
      tRow.className = "cinerae-mini-row";
      body.appendChild(tRow);
      miniButton(tRow, t("btn.tap"), tapTempo, t("hint.tap"));
      makeSwitch(
        "sw.tempoAuto",
        () => state.behavior.tempoAuto,
        (next) => (state.behavior.tempoAuto = next),
        body,
        "hint.tempoAuto"
      );
    } else {
      makeSliderRow(
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
    makeSliderRow(
      body,
      t("ui.lfoPhase"),
      0,
      1,
      0.01,
      () => lfo.phase,
      (v) => (lfo.phase = v),
      percent
    );
    makeSwitch(
      "sw.lfoSync",
      () => lfo.sync,
      (next) => (lfo.sync = next),
      body
    );
  }

  function renderModulation(body: HTMLElement) {
    const mod = hooks.getMod();
    if (!mod) return;
    const groups = [
      ...mod.lfos.map((_, i) => ({ key: `lfo${i + 1}`, label: `lfo ${i + 1}` })),
      { key: "liens", label: t("ui.links") },
    ];
    const active = renderGroupTabs("modulation", groups, body);
    if (active === "liens") {
      for (const link of [...mod.links]) {
        renderLinkRow(body, mod, link);
      }
      const addRow = document.createElement("div");
      addRow.className = "cinerae-mini-row";
      body.appendChild(addRow);
      miniButton(addRow, t("ui.addLink"), () => {
        mod.addLink("lfo1", "force");
        renderMode();
      });
    } else {
      const i = Number(active.slice(3)) - 1;
      if (mod.lfos[i]) renderLfoBlock(body, i);
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
    remove.className = "cinerae-mini";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      hooks.onInteraction();
      mod.removeLink(link);
      renderMode();
    });
    selects.append(srcSelect, arrow, dstSelect, remove);
    makeSliderRow(
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

  // ----- MIDI section -------------------------------------------------------
  function renderMidi(body: HTMLElement) {
    const midi = hooks.getMidi();
    if (!midi) return;
    const status = document.createElement("div");
    status.className = "cinerae-slotline";
    status.textContent = `midi : ${midi.status}`;
    body.appendChild(status);
    if (!midi.enabled) {
      const row = document.createElement("div");
      row.className = "cinerae-mini-row";
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
    const hint = document.createElement("div");
    hint.className = "cinerae-slotline";
    hint.textContent = midiLearn
      ? midi.armedKey
        ? t("ui.midiTurn")
        : t("ui.midiTouch")
      : t("ui.midiSaved");
    body.appendChild(hint);
    for (const def of controls) {
      const tag = midi.bindingFor(def.key);
      if (!tag) continue;
      const row = document.createElement("div");
      row.className = "cinerae-mini-row cinerae-binding";
      const name = document.createElement("span");
      name.textContent = `${def.label} — ${tag}`;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "cinerae-mini";
      x.textContent = "×";
      x.addEventListener("click", () => {
        midi.unbind(def.key);
        renderMode();
      });
      row.append(name, x);
      body.appendChild(row);
    }
  }

  // ----- empreintes ---------------------------------------------------------
  const familyChips = document.createElement("div");
  familyChips.className = "cinerae-chips";
  const variantChips = document.createElement("div");
  variantChips.className = "cinerae-chips";

  const textRow = document.createElement("div");
  textRow.className = "cinerae-text-row";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.maxLength = 24;
  textInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") hooks.onImprintText(textInput.value);
  });
  textInput.addEventListener("change", () => hooks.onImprintText(textInput.value));
  textRow.appendChild(textInput);

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

  const FAMILY_ORDER: ImprintFamily[] = [
    "titre",
    "fond",
    "volume",
    "forme",
    "math",
    "fractale",
    "ondes",
    "texte",
    "camera",
    "multi",
  ];

  const makeChip = (
    parent: HTMLElement,
    label: string,
    active: boolean,
    onPick: () => void
  ) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cinerae-chip";
    chip.classList.toggle("active", active);
    chip.textContent = label;
    chip.addEventListener("click", () => {
      hooks.onInteraction();
      onPick();
    });
    parent.appendChild(chip);
  };

  function renderImprints(body: HTMLElement) {
    const active = renderGroupTabs(
      "empreintes",
      defGroups("empreintes", ["forme"]),
      body
    );
    if (active !== "forme") {
      renderSectionDefs("empreintes", body, "reglages");
      return;
    }
    body.append(familyChips, variantChips, textRow);
    familyChips.replaceChildren();
    variantChips.replaceChildren();
    const sel = state.imprint;
    for (const family of FAMILY_ORDER) {
      makeChip(familyChips, t(`fam.${family}`), sel.family === family, () =>
        hooks.onImprintSelect(family, IMPRINT_VARIANTS[family]?.[0] ?? "")
      );
    }
    makeChip(familyChips, t("fam.image"), sel.family === "image", () =>
      fileInput.click()
    );
    const variants = IMPRINT_VARIANTS[sel.family];
    variantChips.style.display = variants ? "" : "none";
    if (variants) {
      for (const v of variants) {
        makeChip(variantChips, t(`var.${v}`), sel.variant === v, () =>
          hooks.onImprintSelect(sel.family, v)
        );
      }
    }
    textRow.style.display = sel.family === "texte" ? "" : "none";
    textInput.placeholder = t("ui.freeText");
    textInput.value = sel.text;
    makeSwitch(
      "sw.randomImprint",
      () => state.imprint.random,
      (next) => {
        state.imprint.random = next;
        hooks.onImprintParams();
      },
      body
    );
  }

  // ----- aide ---------------------------------------------------------------
  // Short and airy: one page per topic, terms on the left, plain words on
  // the right. Each future chantier adds its own page here.
  function renderAide(body: HTMLElement) {
    const groups = SECTION_GROUPS.aide!.map((g) => ({ key: g, label: t(`grp.${g}`) }));
    const active = renderGroupTabs("aide", groups, body);
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
      body.appendChild(row);
    };
    if (active === "modes") {
      item("Umbra", t("aide.umbra"));
      item("Anima", t("aide.anima"));
      item("Pro", t("aide.pro"));
    } else if (active === "macros") {
      item(t("aide.macroTitle"), t("aide.macros"));
      item(t("aide.pulseTitle"), t("aide.pulse"));
      makeSwitch(
        "sw.invites",
        () => invitesOn,
        (next) => {
          invitesOn = next;
          if (!next) stopInvite();
          try {
            localStorage.setItem(INVITE_STORE, next ? "on" : "off");
          } catch {}
        },
        body,
        "hint.invites"
      );
    } else if (active === "clavier") {
      const keys: [string, string][] = [
        ["F", "aide.key.f"],
        ["C", "aide.key.c"],
        ["Z", "aide.key.z"],
        ["R", "aide.key.r"],
        ["P", "aide.key.p"],
        ["V", "aide.key.v"],
        [t("aide.kspace"), "aide.key.space"],
        [t("aide.kesc"), "aide.key.esc"],
      ];
      for (const [k, label] of keys) {
        item(`<kbd>${k}</kbd>`, t(label));
      }
    } else if (active === "gestes") {
      item(t("aide.touchTitle"), t("aide.touch"));
    } else if (active === "camext") {
      item(t("aide.ndiTitle"), t("aide.ndi"));
    } else {
      const links = document.createElement("div");
      links.className = "cinerae-aide-links";
      links.innerHTML =
        `<a href="https://nh.thomasmaury.fr" target="_blank" rel="noopener">nh.thomasmaury.fr</a>` +
        `<a class="cinerae-linktree" href="https://linktr.ee/thomasmaury" target="_blank" rel="noopener" aria-label="${t("aide.linktree")}" title="${t("aide.linktree")}">${LINKTREE_ICON}</a>`;
      body.appendChild(links);
    }
  }

  // ----- macros: the three journeys, rendered in every mode -----------------
  const macroRefs: Record<string, HTMLElement> = {};
  function renderMacros() {
    macroBox.replaceChildren();
    for (const key of ["maree", "eclipse", "prisme"]) {
      const def = controls.find((d) => d.key === key)!;
      renderDefRow(def, macroBox);
      const ref = rowRefs[rowRefs.length - 1]!;
      ref.row.classList.add("cinerae-macro");
      macroRefs[key] = ref.row;
    }
  }

  // ----- invitations: the panel guides without speaking ---------------------
  // A small analyzer of what the room is doing makes ONE slider pulse for a
  // few seconds — the one whose movement would change the scene the most.
  // Never two at once, never under the hand, never in Pro, long rests in
  // between, honors prefers-reduced-motion, and one switch turns it off.
  const INVITE_STORE = "cinerae-invites";
  let invitesOn = (() => {
    try {
      return localStorage.getItem(INVITE_STORE) !== "off";
    } catch {
      return true;
    }
  })();
  let pointerInside = false;
  let inviteRow: HTMLElement | null = null;
  let inviteTimer: number | undefined;
  let inviteCooldownUntil = performance.now() + 60_000; // grace after boot
  let lastPanelTouch = performance.now();
  let bassOnlyS = 0;
  let rotateIdx = 0;
  const chaosTimes: number[] = [];

  const stopInvite = () => {
    inviteRow?.classList.remove("invited");
    inviteRow = null;
    if (inviteTimer !== undefined) {
      window.clearTimeout(inviteTimer);
      inviteTimer = undefined;
    }
  };
  panel.addEventListener("pointerenter", () => {
    pointerInside = true;
    stopInvite();
  });
  panel.addEventListener("pointerleave", () => {
    pointerInside = false;
  });
  panel.addEventListener("pointerdown", () => {
    lastPanelTouch = performance.now();
    stopInvite();
  });

  const startInvite = (key: string) => {
    const row = macroRefs[key];
    if (!row || !row.isConnected) return;
    inviteRow = row;
    row.classList.add("invited");
    inviteTimer = window.setTimeout(stopInvite, 5400);
    inviteCooldownUntil = performance.now() + 75_000;
  };

  const guide = (info: {
    micOn: boolean;
    silenceS: number;
    bass: number;
    mid: number;
    treble: number;
  }) => {
    const now = performance.now();
    // A stretch of bass with nothing above it: the music is one register.
    if (info.micOn && info.bass > 0.25 && info.treble < 0.06 && info.mid < 0.08)
      bassOnlyS += 1;
    else bassOnlyS = 0;
    if (!invitesOn || mode === "pro" || collapsed || pointerInside) return;
    // Under prefers-reduced-motion the invitation still shows, as a steady
    // glow instead of a pulse — the CSS carries the difference (v0.7.1e).
    if (document.body.classList.contains("cinerae-idle")) return;
    if (inviteRow || now < inviteCooldownUntil) return;
    const tn = state.tuning;
    let key: string | undefined;
    const recentChaos = chaosTimes.filter((x) => now - x < 120_000);
    if (recentChaos.length >= 3) {
      // Chaos chained three times: the hand wants change — offer the
      // journey it has visited least recently.
      key = ["maree", "eclipse", "prisme"].sort(
        (a, b) => (macroTouch[a] ?? 0) - (macroTouch[b] ?? 0)
      )[0];
      chaosTimes.length = 0;
    } else if (
      tn.exposure < 0.85 ||
      tn.exposure > 2.3 ||
      (tn.halo > 0.8 && tn.trailDecay > 0.93)
    ) {
      // The screen is nearly black or washing out: the light journey
      // resolves both ends.
      key = "eclipse";
    } else if (bassOnlyS > 8) {
      // Only bass reads: color and depth are the biggest untouched change.
      key = "prisme";
    } else if (info.micOn && info.silenceS > 45) {
      // A long real silence: movement does not need music.
      key = "maree";
    } else if (now - lastPanelTouch > 300_000) {
      key = ["maree", "eclipse", "prisme"][rotateIdx++ % 3];
      lastPanelTouch = now; // one nudge, then the five minutes start over
    }
    if (key) startInvite(key);
  };

  // ----- umbra body ---------------------------------------------------------
  function renderUmbra() {
    umbraBox.replaceChildren();
    if (mode !== "umbra") {
      umbraBox.style.display = "none";
      return;
    }
    umbraBox.style.display = "";
    renderTeintes(umbraBox);
    const macro = controls.find((d) => d.key === "umbra")!;
    const wrap = document.createElement("div");
    wrap.className = "cinerae-umbra-slider";
    umbraBox.appendChild(wrap);
    const ends = document.createElement("div");
    ends.className = "cinerae-umbra-ends";
    ends.innerHTML = `<span>${t("ui.pushL")}</span><span>${t("ui.pushR")}</span>`;
    wrap.appendChild(ends);
    const { row, input } = makeSliderRow(
      wrap,
      "",
      macro.min,
      macro.max,
      macro.step,
      macro.get,
      (v) => {
        glideToken++;
        macro.set(v);
        hooks.getMod()?.onAuthored(macro.key, v);
      },
      () => ""
    );
    input.setAttribute("aria-label", t("ctl.umbra"));
    row.dataset.hint = t("hint.umbra");
    row.classList.add("cinerae-umbra-row");

    // v0.7.1e — the second Umbra gesture: who owns the frame, the body or
    // the imprint. Same ends-labeled slider, driving the balance def.
    const bal = controls.find((d) => d.key === "balance")!;
    const balWrap = document.createElement("div");
    balWrap.className = "cinerae-umbra-slider";
    umbraBox.appendChild(balWrap);
    const balEnds = document.createElement("div");
    balEnds.className = "cinerae-umbra-ends";
    balEnds.innerHTML = `<span>${t("ui.balL")}</span><span>${t("ui.balR")}</span>`;
    balWrap.appendChild(balEnds);
    const balRow = makeSliderRow(
      balWrap,
      "",
      bal.min,
      bal.max,
      bal.step,
      bal.get,
      (v) => {
        glideToken++;
        bal.set(v);
        hooks.getMod()?.onAuthored(bal.key, v);
      },
      () => ""
    );
    balRow.input.setAttribute("aria-label", t("ctl.balance"));
    balRow.row.dataset.hint = t("hint.balance");
    balRow.row.classList.add("cinerae-umbra-row");
    rowRefs.push({ def: bal as ControlDef, input: balRow.input, readout: balRow.readout, row: balRow.row });
  }

  // ----- glide (Chaos / Reset made visible on the sliders) ------------------
  // Cancelled by bumping the token — any user touch on a slider does so, so
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
    // Cascade capped at ~0.9 s total: a full-registry undo lands as fast
    // as a chaos draw instead of trickling for seconds.
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
      // The state lives, the matter follows: refresh every visible row.
      for (const ref of rowRefs) {
        ref.input.value = String(ref.def.get());
        setFill(ref.input);
        const text = (ref.def.format ?? plain)(ref.def.get());
        if (ref.readout.textContent !== text) {
          ref.readout.textContent = text;
          markChanged(ref.row);
        }
      }
      if (!done) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ----- rendering ---------------------------------------------------------
  function renderMode() {
    document.documentElement.lang = getLang();
    langButton.textContent = getLang() === "fr" ? "en" : "fr";
    langButton.setAttribute("aria-label", t("ui.langSwitch"));
    openButton.setAttribute("aria-label", t("ui.openPanel"));
    closeButton.setAttribute("aria-label", t("ui.closePanel"));
    handle.setAttribute("aria-label", t("ui.togglePanel"));
    crystalLabel.textContent = t("ui.crystal");
    chaosButton.textContent = t("btn.chaos");
    undoButton.dataset.hint = t("hint.undo");
    undoButton.setAttribute("aria-label", t("btn.undo"));
    resetButton.textContent = t("btn.reset");
    modeButtons.forEach((b, i) => {
      const active = MODE_IDS[i] === mode;
      b.textContent = t(`mode.${MODE_IDS[i]}`);
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    cameraSwitch.sync();
    micSwitch.sync();

    const minimal = mode === "umbra";
    sensorsBox.style.display = minimal ? "none" : "";
    actions.style.display = minimal ? "none" : "";
    crystalBar.style.display = minimal ? "none" : "";
    syncBandsVisible();
    bandsBox.dataset.hint = t("hint.bands");
    bandNames.forEach((el) => {
      el.textContent = t(`band.${el.dataset.key}`);
    });

    stopInvite();
    rowRefs = [];
    renderMacros();
    renderUmbra();

    const visible: Partial<Record<SectionId, boolean>> = {
      scenes: mode === "pro",
      corps: !minimal,
      geste: !minimal,
      musique: !minimal,
      particules: !minimal,
      look: !minimal,
      empreintes: mode === "pro",
      modulation: mode === "pro",
      midi: mode === "pro",
      aide: true,
    };
    for (const id of SECTION_ORDER) {
      const { box, head, body, title } = sections[id];
      box.style.display = visible[id] ? "" : "none";
      const open = visible[id] === true && openSection === id;
      box.classList.toggle("open", open);
      head.setAttribute("aria-expanded", String(open));
      title.textContent = t(`sec.${id}`);
      body.replaceChildren();
      if (!open) continue;
      if (id === "scenes") renderScenes(body);
      else if (id === "corps") renderCorps(body);
      else if (id === "geste") renderGeste(body);
      else if (id === "musique") renderSectionDefs("musique", body);
      else if (id === "particules") renderParticules(body);
      else if (id === "look") renderLook(body);
      else if (id === "empreintes") renderImprints(body);
      else if (id === "modulation") renderModulation(body);
      else if (id === "midi") renderMidi(body);
      else if (id === "aide") renderAide(body);
    }
  }

  function applyCollapsed() {
    panel.classList.toggle("collapsed", collapsed);
    openButton.classList.toggle("visible", collapsed);
  }
  const setCollapsed = (next: boolean) => {
    collapsed = next;
    hooks.onInteraction();
    applyCollapsed();
  };
  closeButton.addEventListener("click", () => setCollapsed(true));
  openButton.addEventListener("click", () => setCollapsed(false));
  handle.addEventListener("click", () => setCollapsed(!collapsed));

  renderMode();
  applyCollapsed();

  return {
    get mode() {
      return mode;
    },
    /** The registry every engine shares: presets, crossfade, matrix, MIDI,
     * Chaos. Every setting, present or future, lives here. */
    defs: controls as ParamRef[],
    /** Keyboard shortcuts route through the same handlers as the buttons. */
    chaos,
    undoChaos,
    reset,
    toggleCollapsed() {
      setCollapsed(!collapsed);
    },
    writeDef,
    setFps(fps: number) {
      fpsLine.textContent = `${Math.round(fps)} fps`;
    },
    setStatus(text: string) {
      statusLine.textContent = text;
    },
    setCrystal(value: number) {
      crystalFill.style.width = `${Math.round(value * 100)}%`;
    },
    setSensors(camera: boolean, mic: boolean) {
      sensors = { camera, mic };
      cameraSwitch.sync();
      micSwitch.sync();
      syncBandsVisible();
    },
    /** v0.7.1e — feed the five-band gauge (values 0..1, ~30 Hz). */
    setBands(values: readonly number[]) {
      for (let i = 0; i < bandFills.length; i++) {
        const v = Math.min(1, Math.max(0, values[i] ?? 0));
        bandFills[i]!.style.height = `${Math.round(v * 100)}%`;
      }
    },
    /** Reflect externally-driven values (modulation, MIDI) on visible rows,
     * without the change flash — called on a slow cadence by the loop. */
    syncValues(keys: ReadonlySet<string>) {
      for (const ref of rowRefs) {
        if (!keys.has(ref.def.key)) continue;
        ref.input.value = String(ref.def.get());
        setFill(ref.input);
        const text = (ref.def.format ?? plain)(ref.def.get());
        if (ref.readout.textContent !== text) ref.readout.textContent = text;
      }
    },
    refresh() {
      renderMode();
    },
    collapse() {
      collapsed = true;
      applyCollapsed();
    },
    /** v0.7.1d — once a second, the orchestrator tells the panel what the
     * room is doing; the panel may answer by pulsing one macro slider. */
    guide,
  };
}

export type Panel = ReturnType<typeof createPanel>;

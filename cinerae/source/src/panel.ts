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
    presenceSense: number;
    /** v0.7.1e — the tempo follows the music's own beats when on. */
    tempoAuto: boolean;
    /** v0.7.1f — seconds of full silence before a random imprint draw. */
    silenceDelay: number;
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
// splits into these fixed pages — never a scrollbar. v0.7.1f — empreintes
// is one page: family tabs, shapes, where, transform.
const SECTION_GROUPS: Partial<Record<SectionId, string[]>> = {
  corps: ["forme", "tenue"],
  particules: ["grains", "temps"],
  look: ["teinte", "degrade", "fond", "lumiere", "espace"],
  // v0.7.1g — the aide left the accordion: it lives in a side drawer with
  // a vertical scroll (the one sanctioned exception), no sub-tabs.
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

// v0.7.1f — the undo journal covers every gesture, not only Chaos.
const GESTURE_MAX = 20;

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
    eclipse: 0.65,
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
    // Éclipse — lumière : v0.7.1g, it reads like an exposure. 0 = night
    // bedded in ash, the home daylight at 0.65 (the corona on the way up),
    // 1 = washed full day. Same arc as before, mirrored.
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
    // Prisme — couleur : v0.7.1g, it only colors. The hue turns the whole
    // frame, the driver changes what paints each grain. The folds moved to
    // the miroir slider; depth and blur stay individual settings.
    prisme: {
      compHue: [[0, 0], [0.5, 0.35], [1, 0.85]],
      colorDriver: [[0, 0], [0.45, 1], [1, 1.9]],
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
    // v0.7.1g — Chaos draws lumière inside the measured readable range:
    // outside it the frame blows to white or sinks to black (harness,
    // mean luminance at 480×270 — see the v0.7.1g report).
    macroDef("eclipse", [0.15, 0.85]),
    macroDef("prisme", [0, 0.9]),
    // ---- umbra macro: one slider that doses the body's push --------------
    def("umbra", "corps", [], 0, 1, 0.01, () => umbraValue, (v) => {
      umbraValue = v;
      writeDef("push", v * 2);
      writeDef("bodyMargin", v * 2);
    }, { transient: true, format: percent }),
    // ---- corps -----------------------------------------------------------
    // v0.7.1e/f — who owns the frame: the body or the imprint. Lives in the
    // command block (all modes), never duplicated in a section.
    def("balance", "corps", [], 0, 1, 0.01,
      () => state.tuning.balance, (v) => (state.tuning.balance = v),
      { format: percent, chaos: [0.15, 0.85] }),
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
    // v0.7.1f — "au silence": the delay before a random imprint draw.
    def("silenceDelay", "scenes", [], 5, 120, 1,
      () => state.behavior.silenceDelay,
      (v) => (state.behavior.silenceDelay = v),
      { format: (v) => `${Math.round(v)} s` }),
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
    // v0.7.1g — miroir: the one fold slider, its value the number of axes.
    // 0 none, 1 one axis, 2 quadrants, 3..12 the radial mandala. Continuous
    // in between (the shaders blend fractional folds, so the crossfade and
    // the LFOs never jump); the hidden symMode/symN below stay the engine
    // components and, written after this def, always win when a scene
    // carries them.
    def("miroir", "look", ["anima", "pro"], 0, 12, 1,
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
        chaos: [0, 9],
        chaosSnap: true,
        group: "espace",
        format: (v) =>
          v < 0.5
            ? t("val.mirNone")
            : `${Math.round(v)} ${Math.round(v) > 1 ? t("val.axes") : t("val.axe")}`,
      }),
    def("symMode", "look", [], 0, 4, 0.01,
      () => state.tuning.symMode, (v) => (state.tuning.symMode = v),
      { hidden: true }),
    def("symN", "look", [], 3, 12, 0.01,
      () => state.tuning.symN, (v) => (state.tuning.symN = v),
      { hidden: true }),
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
    // v0.7.1f — "où" is continuous: left the body's hollow, right the whole
    // frame, the middle a stochastic mix of both (the shader blends).
    def("impMode", "empreintes", ["pro"], 0, 2, 0.01,
      () => state.tuning.impMode, (v) => (state.tuning.impMode = v),
      {
        chaos: [0, 2],
        format: (v) =>
          v < 0.25
            ? t("val.ouCorps")
            : v > 1.75
              ? t("val.ouPartout")
              : Math.abs(v - 1) < 0.25
                ? t("val.ouMix")
                : percent(v / 2),
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
  // v0.7.1f — the values of the current scene (boot defaults until a scene
  // is applied): what a double-click on a slider comes home to.
  const sceneValues = new Map<string, number>(
    controls.map((d) => [d.key, d.get()])
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

  // v0.7.1f — the command block: everything played live sits here, always
  // visible, never folded. Macros, then the share slider with its matter
  // counter, the sensor line, the tempo line, the band gauge, the actions.
  const macroBox = document.createElement("div");
  macroBox.className = "cinerae-macros";
  panel.appendChild(macroBox);

  // Share slider (corps ◀▶ empreinte) + matter counter.
  const partageBox = document.createElement("div");
  partageBox.className = "cinerae-partage";
  panel.appendChild(partageBox);
  const matterBox = document.createElement("div");
  matterBox.className = "cinerae-matter";
  panel.appendChild(matterBox);
  const matterFields: HTMLElement[] = [];
  for (const key of ["matCorps", "matEmp", "matFond"]) {
    const item = document.createElement("span");
    item.className = "cinerae-matter-item";
    const name = document.createElement("span");
    name.className = "cinerae-matter-name";
    name.dataset.key = key;
    const val = document.createElement("span");
    val.className = "cinerae-matter-val";
    val.textContent = "—";
    item.append(name, val);
    matterBox.appendChild(item);
    matterFields.push(val);
  }

  const sensorsBox = document.createElement("div");
  sensorsBox.className = "cinerae-sensors";
  panel.appendChild(sensorsBox);

  // v0.7.1f — the tempo line: bpm readout, a dot blinking on the beat,
  // and the choice musique (auto) / tap.
  const tempoBox = document.createElement("div");
  tempoBox.className = "cinerae-tempo";
  panel.appendChild(tempoBox);
  const tempoDot = document.createElement("span");
  tempoDot.className = "cinerae-tempo-dot";
  const tempoBpm = document.createElement("span");
  tempoBpm.className = "cinerae-tempo-bpm";
  const tempoChips = document.createElement("span");
  tempoChips.className = "cinerae-tempo-chips";
  const tempoMusicChip = document.createElement("button");
  tempoMusicChip.type = "button";
  tempoMusicChip.className = "cinerae-chip";
  const tempoTapChip = document.createElement("button");
  tempoTapChip.type = "button";
  tempoTapChip.className = "cinerae-chip";
  tempoChips.append(tempoMusicChip, tempoTapChip);
  tempoBox.append(tempoDot, tempoBpm, tempoChips);
  let tempoShown = 0;
  const syncTempoBox = () => {
    const bpm = Math.round(
      controls.find((d) => d.key === "tempo")?.get() ?? 120
    );
    if (bpm !== tempoShown) {
      tempoShown = bpm;
      tempoBpm.textContent = `${bpm} bpm`;
      tempoDot.style.animationDuration = `${(60 / bpm).toFixed(3)}s`;
    }
    tempoMusicChip.classList.toggle("active", state.behavior.tempoAuto);
    tempoTapChip.classList.toggle("active", !state.behavior.tempoAuto);
  };
  tempoMusicChip.addEventListener("click", () => {
    hooks.onInteraction();
    state.behavior.tempoAuto = !state.behavior.tempoAuto;
    syncTempoBox();
  });
  tempoTapChip.addEventListener("click", () => {
    hooks.onInteraction();
    state.behavior.tempoAuto = false;
    tapTempo();
    syncTempoBox();
  });
  window.setInterval(syncTempoBox, 500);

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
    bandsBox.style.display = sensors.mic ? "" : "none";
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
    (next) => hooks.onSensor("camera", next),
    sensorsBox,
    "hint.swCamera"
  );
  const micSwitch = makeSwitch(
    "sw.mic",
    () => sensors.mic,
    (next) => hooks.onSensor("mic", next),
    sensorsBox,
    "hint.swMic"
  );
  // v0.7.1g — the sensor switches call for the hand until they are on: the
  // invitation pulse language, steady glow under prefers-reduced-motion,
  // quiet the moment the sensor runs.
  const syncAttend = () => {
    cameraSwitch.row.classList.toggle("cinerae-attend", !sensors.camera);
    micSwitch.row.classList.toggle("cinerae-attend", !sensors.mic);
  };
  syncAttend();
  // v0.7.1f — the raw camera lives on the sensor line, Pro only.
  const rawSwitch = makeSwitch(
    "sw.rawCam",
    () => state.tuning.rawCam > 0.5,
    (next) => writeDef("rawCam", next ? 1 : 0),
    sensorsBox,
    "hint.rawCam"
  );

  const actions = document.createElement("div");
  actions.className = "cinerae-actions";
  panel.appendChild(actions);

  // v0.7.1g — the mute crystal gauge under Chaos is gone: it named nothing
  // the hand could act on. Every remaining bar is a real, labeled fader.

  // ----- chaos & reset: registry-driven, with an undo history ---------------
  const writeDef = (key: string, v: number) => {
    const def = controls.find((d) => d.key === key);
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
  // palette, scene, Chaos. Z and ↶ step back through it, twenty deep.
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
    chaosTimes.push(performance.now());
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
    const snap = gestures.pop();
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
    /** v0.7.1f — the thin marker: the authored value (modulation center). */
    tick?: HTMLElement;
    authored?: () => number | undefined;
  }[] = [];

  // v0.7.1f — the double marker: the full track shows the value really
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

  // Reflect a macro's cascade on its visible component rows mid-drag.
  const syncKeys = (keys: string[]) => {
    for (const ref of rowRefs) {
      if (!keys.includes(ref.def.key)) continue;
      ref.input.value = String(ref.def.get());
      setFill(ref.input);
      ref.readout.textContent = (ref.def.format ?? plain)(ref.def.get());
      updateTick(ref);
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
    const tick = document.createElement("span");
    tick.className = "cinerae-tick";
    tick.style.display = "none";
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
    row.append(input, tick, name, readout);
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
    });
    input.addEventListener("blur", () => {
      if (pending && pending.value !== input.value) pushGesture(pending.snap);
      pending = undefined;
    });
  };

  const renderDefRow = (def: ControlDef, parent: HTMLElement) => {
    const mod = hooks.getMod();
    if (def.options) {
      const { row, name } = makeSelect(parent, def.label, def.options(), def.get, (v) => {
        pushGesture();
        def.set(v);
        mod?.onAuthored(def.key, v);
        if (def.imprint) hooks.onImprintParams();
        renderMode();
      });
      row.dataset.hint = t(`hint.${def.key}`);
      decorateRow(row, name, def);
      return;
    }
    const { row, input, readout, name, tick } = makeSliderRow(
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
        pushGesture();
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
        pushGesture();
        presets?.apply(structuredClone(p) as PresetData);
        // The applied scene becomes the home of every double-click.
        for (const d of controls) sceneValues.set(d.key, d.get());
        renderMode();
      });
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
    if (state.imprint.random) {
      const delayDef = controls.find((d) => d.key === "silenceDelay")!;
      renderDefRow(delayDef, body);
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
    syncTempoBox();
  };

  // v0.7.1f — one LFO unfolded at a time, the other three summarized on one
  // line each (number, target, speed). The unfolded one: shape as five text
  // chips, tempo sync with its divisions or a free frequency, amplitude,
  // target. The tempo itself lives in the command block.
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
    shapeRow.dataset.hint = t("hint.lfoShape");
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
      t("ui.lfoAmp"),
      0,
      1,
      0.01,
      () => lfo.amp,
      (v) => (lfo.amp = v),
      percent
    );
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
        ? controls.find((d) => d.key === lfo.target)?.label ?? lfo.target
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

  // v0.7.1f — the family line: underlined tabs, one row. The wordmark
  // belongs to the intro; multi stays engine-side (Chaos may draw it).
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

  // v0.7.1f — one page: the family line (underlined tabs), the shapes of
  // the family, then où, position, rotation, échelle and the family's own
  // fine settings.
  function renderImprints(body: HTMLElement) {
    familyChips.className = "cinerae-subtabs cinerae-famline";
    body.append(familyChips, variantChips, textRow);
    familyChips.replaceChildren();
    variantChips.replaceChildren();
    const sel = state.imprint;
    const famTab = (label: string, active: boolean, onPick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
      b.addEventListener("click", () => {
        hooks.onInteraction();
        pushGesture();
        onPick();
      });
      familyChips.appendChild(b);
    };
    for (const family of FAMILY_ORDER) {
      famTab(t(`fam.${family}`), sel.family === family, () =>
        hooks.onImprintSelect(family, IMPRINT_VARIANTS[family]?.[0] ?? "")
      );
    }
    famTab(t("fam.image"), sel.family === "image", () => fileInput.click());
    const variants = IMPRINT_VARIANTS[sel.family];
    variantChips.style.display = variants ? "" : "none";
    if (variants) {
      for (const v of variants) {
        makeChip(variantChips, t(`var.${v}`), sel.variant === v, () => {
          pushGesture();
          hooks.onImprintSelect(sel.family, v);
        });
      }
    }
    textRow.style.display = sel.family === "texte" ? "" : "none";
    textInput.placeholder = t("ui.freeText");
    textInput.value = sel.text;
    renderSectionDefs("empreintes", body);
  }

  // ----- aide ---------------------------------------------------------------
  // v0.7.1g — the aide is a side drawer with a vertical scroll: the one
  // sanctioned exception to the zero-scroll rule, so no line is ever cut.
  // One column, short sections, terms left, plain words right.
  const aideDrawer = document.createElement("aside");
  aideDrawer.className = "cinerae-aide-drawer";
  root.appendChild(aideDrawer);
  // The drawer routes its hints to the panel's reserved slot, like any row.
  aideDrawer.addEventListener("mouseover", (e) => showHint(e.target));
  aideDrawer.addEventListener("mouseleave", () => (hintBar.textContent = ""));
  aideDrawer.addEventListener("focusin", (e) => showHint(e.target));

  function renderAide(body: HTMLElement) {
    const head = (label: string) => {
      const h = document.createElement("div");
      h.className = "cinerae-aide-head";
      h.textContent = label;
      body.appendChild(h);
    };
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
    head(t("grp.modes"));
    item("Umbra", t("aide.umbra"));
    item("Anima", t("aide.anima"));
    item("Pro", t("aide.pro"));
    head(t("grp.curseurs"));
    item(t("ctl.maree"), t("aide.maree"));
    item(t("ctl.eclipse"), t("aide.eclipse"));
    item(t("ctl.prisme"), t("aide.prisme"));
    item(t("ctl.miroir"), t("aide.miroir"));
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
    head(t("grp.clavier"));
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
    head(t("grp.gestes"));
    item(t("aide.touchTitle"), t("aide.touch"));
    item(t("aide.undoTitle"), t("aide.undo"));
    head(t("grp.camext"));
    item(t("aide.ndiTitle"), t("aide.ndi"));
    head(t("grp.liens"));
    const links = document.createElement("div");
    links.className = "cinerae-aide-links";
    links.innerHTML =
      `<a href="https://nh.thomasmaury.fr" target="_blank" rel="noopener">nh.thomasmaury.fr</a>` +
      `<a class="cinerae-linktree" href="https://linktr.ee/thomasmaury" target="_blank" rel="noopener" aria-label="${t("aide.linktree")}" title="${t("aide.linktree")}">${LINKTREE_ICON}</a>`;
    body.appendChild(links);
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
    armUndoSlider(input);
    input.setAttribute("aria-label", t("ctl.umbra"));
    row.dataset.hint = t("hint.umbra");
    row.classList.add("cinerae-umbra-row");
    // v0.7.1g — the miroir lives in Umbra too: the fold is a first-class
    // gesture, its value the number of axes.
    const mir = controls.find((d) => d.key === "miroir")!;
    renderDefRow(mir, umbraBox);
  }

  // v0.7.1f — the share slider lives in the command block, in every mode:
  // ends-labeled, journal-armed, ticked like any def row.
  function renderPartage() {
    partageBox.replaceChildren();
    const bal = controls.find((d) => d.key === "balance")!;
    const ends = document.createElement("div");
    ends.className = "cinerae-umbra-ends";
    ends.innerHTML = `<span>${t("ui.balL")}</span><span>${t("ui.balR")}</span>`;
    partageBox.appendChild(ends);
    const balRow = makeSliderRow(
      partageBox,
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
    armUndoSlider(balRow.input);
    const ref = {
      def: bal,
      input: balRow.input,
      readout: balRow.readout,
      row: balRow.row,
      tick: balRow.tick,
      authored: () => hooks.getMod()?.centerOf(bal.key),
    };
    rowRefs.push(ref);
    updateTick(ref);
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
        updateTick(ref);
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

    // v0.7.1f — the command block never hides: every mode sees it whole.
    const minimal = mode === "umbra";
    rawSwitch.row.style.display = mode === "pro" ? "" : "none";
    rawSwitch.sync();
    syncBandsVisible();
    syncTempoBox();
    bandsBox.dataset.hint = t("hint.bands");
    bandNames.forEach((el) => {
      el.textContent = t(`band.${el.dataset.key}`);
    });
    matterBox.dataset.hint = t("hint.matter");
    matterBox.querySelectorAll<HTMLElement>(".cinerae-matter-name").forEach((el) => {
      el.textContent = t(`ui.${el.dataset.key}`);
    });
    tempoMusicChip.textContent = t("ui.tempoMusic");
    tempoMusicChip.dataset.hint = t("hint.tempoMusic");
    tempoTapChip.textContent = t("btn.tap");
    tempoTapChip.dataset.hint = t("hint.tap");
    tempoDot.setAttribute("aria-label", t("ui.tempoBeat"));

    stopInvite();
    rowRefs = [];
    renderMacros();
    renderPartage();
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
      // aide renders in its side drawer below, never in the stack.
    }

    // v0.7.1g — the aide drawer follows its accordion head.
    const aideOpen = openSection === "aide" && !collapsed;
    aideDrawer.classList.toggle("open", aideOpen);
    aideDrawer.replaceChildren();
    if (aideOpen) renderAide(aideDrawer);
  }

  function applyCollapsed() {
    panel.classList.toggle("collapsed", collapsed);
    openButton.classList.toggle("visible", collapsed);
    // Folding the panel folds the aide drawer with it.
    aideDrawer.classList.toggle("open", !collapsed && openSection === "aide");
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
      // v0.7.1f — the header carries both vital signs: fps and grains.
      fpsLine.textContent =
        `${Math.round(fps)} fps · ${Math.round(state.tuning.count / 1000)} k`;
    },
    /** v0.7.1f — the matter counter: [corps, empreinte, fond] as 0..1. */
    setMatter(shares: readonly number[]) {
      for (let i = 0; i < matterFields.length; i++) {
        const v = Math.round(Math.min(1, Math.max(0, shares[i] ?? 0)) * 100);
        const text = `${v} %`;
        if (matterFields[i]!.textContent !== text) {
          matterFields[i]!.textContent = text;
        }
      }
    },
    setStatus(text: string) {
      statusLine.textContent = text;
    },
    setSensors(camera: boolean, mic: boolean) {
      sensors = { camera, mic };
      cameraSwitch.sync();
      micSwitch.sync();
      syncBandsVisible();
      syncAttend();
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
        updateTick(ref);
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

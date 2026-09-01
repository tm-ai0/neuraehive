// Settings panel. Three modes: Umbra (one "moi ◀▶ le monde" slider and the
// tint pastilles), Anima (five question sections — Qui je suis / Ce que fait
// mon geste / Ce que fait ma voix / Le temps et la mémoire / Le look), Pro
// (the same plus fine settings, scenes, A/B crossfade, matrix, MIDI). Every
// visible word goes through the FR/EN dictionary; every slider names a
// visible effect and carries a one-line hint; tapping a slider's name plays
// a two-second demo sweep. The def registry is the single gate: presets,
// crossfade, Chaos (per-def flag + range), matrix and MIDI all reach every
// setting through it.
// Desktop: collapsible card top-right. Mobile: bottom sheet with a handle.
// Every control writes straight into live state read by the render loop.
import { IMPRINT_VARIANTS, type ImprintFamily, type ImprintSettings } from "./imprints";
import { PALETTES, sampleStops, type LookColors, type Rgb } from "./look";
import { getLang, setLang, t, words } from "./i18n";
import type { Midi } from "./midi";
import { LFO_SHAPES, type LfoShape, type ModLink, type ModMatrix, type ParamRef } from "./modmatrix";
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
  quality: { auto: boolean };
  behavior: {
    imprintReturn: boolean;
    silenceDelay: number;
    presenceThreshold: number;
    presenceDelay: number;
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
  | "moi"
  | "geste"
  | "voix"
  | "temps"
  | "look"
  | "empreintes"
  | "modulation"
  | "midi"
  | "aide";

interface ControlDef extends ParamRef {
  modes: PanelMode[];
  section: SectionId;
  format?: (v: number) => string;
  /** Verbal readout already — never replaced by the generic word scale. */
  verbal?: boolean;
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

// Micro-sketches of grains for the section heads: nothing but dots and a
// stroke or two — dust drawings, never app icons.
const SKETCH: Record<string, string> = {
  moi: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="4.4" r="0.9"/><circle cx="7.6" cy="6.6" r="0.7"/><circle cx="10.4" cy="6.6" r="0.7"/><circle cx="6.8" cy="9" r="0.8"/><circle cx="9" cy="8.6" r="0.7"/><circle cx="11.2" cy="9" r="0.8"/><circle cx="7.4" cy="11.6" r="0.7"/><circle cx="10.6" cy="11.6" r="0.7"/><circle cx="8.2" cy="14" r="0.8"/><circle cx="9.9" cy="14" r="0.8"/><circle cx="3.4" cy="5.4" r="0.5" opacity="0.4"/><circle cx="14.8" cy="7.4" r="0.5" opacity="0.4"/><circle cx="14" cy="12.8" r="0.5" opacity="0.4"/><circle cx="3.8" cy="12" r="0.5" opacity="0.4"/></g></svg>`,
  geste: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="13.5" r="0.9"/><circle cx="5.4" cy="12.2" r="0.8"/><circle cx="7.8" cy="10.6" r="0.7"/><circle cx="10" cy="8.8" r="0.7"/><circle cx="12" cy="6.8" r="0.8"/><circle cx="13.8" cy="4.6" r="0.9"/><circle cx="6.6" cy="14.6" r="0.5" opacity="0.4"/><circle cx="9.6" cy="12.6" r="0.5" opacity="0.4"/><circle cx="12.4" cy="10.2" r="0.5" opacity="0.4"/></g></svg>`,
  voix: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="3.4" cy="9" r="0.9"/><circle cx="5.8" cy="6.6" r="0.7"/><circle cx="5.8" cy="11.4" r="0.7"/><circle cx="8.4" cy="4.8" r="0.6"/><circle cx="8.4" cy="9" r="0.6"/><circle cx="8.4" cy="13.2" r="0.6"/><circle cx="11" cy="6" r="0.6" opacity="0.7"/><circle cx="11" cy="12" r="0.6" opacity="0.7"/><circle cx="13.6" cy="7.6" r="0.5" opacity="0.4"/><circle cx="13.6" cy="10.4" r="0.5" opacity="0.4"/></g></svg>`,
  temps: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="3.4" r="0.8"/><circle cx="12.6" cy="5" r="0.7"/><circle cx="14" cy="9" r="0.8"/><circle cx="12.6" cy="13" r="0.7"/><circle cx="9" cy="14.6" r="0.8"/><circle cx="5.4" cy="13" r="0.7" opacity="0.6"/><circle cx="4" cy="9" r="0.6" opacity="0.4"/><circle cx="5.4" cy="5" r="0.5" opacity="0.3"/><circle cx="9" cy="9" r="0.6"/></g></svg>`,
  look: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="4.4" cy="6" r="1.1" opacity="0.95"/><circle cx="8.6" cy="4.6" r="0.9" opacity="0.75"/><circle cx="12.8" cy="6.2" r="1" opacity="0.55"/><circle cx="6.4" cy="10" r="0.9" opacity="0.65"/><circle cx="10.8" cy="10.4" r="1" opacity="0.45"/><circle cx="4.8" cy="13.6" r="0.8" opacity="0.35"/><circle cx="9" cy="13.8" r="0.7" opacity="0.3"/><circle cx="13.2" cy="13.4" r="0.8" opacity="0.25"/></g></svg>`,
  scenes: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="5" r="0.8"/><circle cx="7" cy="5" r="0.6" opacity="0.6"/><circle cx="4" cy="9" r="0.6" opacity="0.6"/><circle cx="7" cy="9" r="0.8"/><circle cx="11" cy="5" r="0.6" opacity="0.6"/><circle cx="14" cy="5" r="0.6" opacity="0.4"/><circle cx="11" cy="9" r="0.6" opacity="0.4"/><circle cx="14" cy="9" r="0.6" opacity="0.6"/><circle cx="9" cy="13.4" r="0.8"/><circle cx="6" cy="13.4" r="0.5" opacity="0.4"/><circle cx="12" cy="13.4" r="0.5" opacity="0.4"/></g></svg>`,
  empreintes: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="4" r="0.7"/><circle cx="12" cy="5.4" r="0.6"/><circle cx="13.4" cy="8.4" r="0.7"/><circle cx="12" cy="11.4" r="0.6"/><circle cx="9" cy="12.8" r="0.7"/><circle cx="6" cy="11.4" r="0.6"/><circle cx="4.6" cy="8.4" r="0.7"/><circle cx="6" cy="5.4" r="0.6"/><circle cx="9" cy="8.4" r="0.5" opacity="0.5"/></g></svg>`,
  modulation: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="9" r="0.6"/><circle cx="5.2" cy="6" r="0.6"/><circle cx="7.4" cy="4.8" r="0.6"/><circle cx="9.6" cy="6" r="0.6"/><circle cx="11.8" cy="9" r="0.6"/><circle cx="14" cy="12" r="0.6"/><circle cx="15.6" cy="13" r="0.6" opacity="0.5"/></g></svg>`,
  midi: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="5" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="13" cy="5" r="1"/><circle cx="5" cy="9" r="0.6" opacity="0.5"/><circle cx="9" cy="9" r="0.6" opacity="0.5"/><circle cx="13" cy="9" r="0.6" opacity="0.5"/><circle cx="7" cy="13" r="0.7"/><circle cx="11" cy="13" r="0.7"/></g></svg>`,
  aide: `<svg viewBox="0 0 18 18" aria-hidden="true"><g fill="currentColor"><circle cx="7" cy="5.4" r="0.7"/><circle cx="9.4" cy="4.6" r="0.7"/><circle cx="11.4" cy="5.8" r="0.7"/><circle cx="11.8" cy="8" r="0.7"/><circle cx="10.2" cy="9.8" r="0.7"/><circle cx="9" cy="11.4" r="0.6"/><circle cx="9" cy="14.2" r="0.8"/></g></svg>`,
};

const SLIDERS_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/><circle cx="7" cy="6" r="1.8" fill="#050403"/><circle cx="13" cy="10" r="1.8" fill="#050403"/><circle cx="9" cy="14" r="1.8" fill="#050403"/></svg>`;

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
  const sectionOpen: Record<SectionId, boolean> = {
    scenes: true,
    moi: true,
    geste: false,
    voix: false,
    temps: false,
    look: true,
    empreintes: false,
    modulation: false,
    midi: false,
    aide: false,
  };

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

  const controls: ControlDef[] = [
    // ---- umbra macro: one slider that ties the room's balance ------------
    def("umbra", "moi", [], 0, 1, 0.01, () => umbraValue, (v) => {
      umbraValue = v;
      writeDef("presenceShare", 0.95 - v * 0.75);
      writeDef("fondVisible", 0.12 + v * 0.88);
      writeDef("bodyMargin", 1.6 - v * 1.2);
    }, { transient: true, verbal: true, format: (v) => words(1 - v) }),
    // ---- moi : qui je suis ----------------------------------------------
    def("presenceShare", "moi", ["anima", "pro"], 0.1, 1, 0.01,
      () => state.tuning.presenceShare, (v) => (state.tuning.presenceShare = v),
      { format: percent, chaos: [0.35, 1] }),
    def("count", "moi", ["anima", "pro"], 10_000, 400_000, 10_000,
      () => state.tuning.count, (v) => (state.tuning.count = v),
      { format: thousands, verbal: true }),
    def("bodyMat", "moi", ["anima", "pro"], 0, 7, 1,
      () => state.tuning.bodyMat, (v) => {
        state.tuning.bodyMat = v;
        state.tuning.matBlend = 0; // the hand takes over from the crossfade
      },
      { discrete: true, options: matOptions, chaos: [0, 7], chaosSnap: true }),
    def("presenceTrail", "moi", ["anima", "pro"], 0, 5, 0.1,
      () => state.tuning.presenceTrail, (v) => (state.tuning.presenceTrail = v),
      { format: (v) => `${plain(v)} s`, verbal: true, chaos: [0.5, 4] }),
    def("presenceHold", "moi", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.presenceHold, (v) => (state.tuning.presenceHold = v),
      {
        verbal: true,
        format: (v) =>
          v < 0.05
            ? t("val.holdFree")
            : v < 0.4
              ? t("val.holdSoft")
              : v < 0.8
                ? t("val.holdElastic")
                : t("val.holdRigid"),
        chaos: [0.2, 1],
      }),
    def("elastic", "moi", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.elastic, (v) => (state.tuning.elastic = v),
      { format: percent, chaos: [0.2, 1] }),
    def("presenceSize", "moi", ["anima", "pro"], 0.6, 3, 0.05,
      () => state.tuning.presenceSize, (v) => (state.tuning.presenceSize = v),
      { format: (v) => `×${plain(v)}`, verbal: true, chaos: [0.8, 2.4] }),
    def("presenceThreshold", "moi", ["pro"], 0.0005, 0.01, 0.0005,
      () => state.behavior.presenceThreshold,
      (v) => (state.behavior.presenceThreshold = v)),
    def("presenceDelay", "moi", ["pro"], 1, 30, 0.5,
      () => state.behavior.presenceDelay,
      (v) => (state.behavior.presenceDelay = v),
      { format: (v) => `${plain(v)} s`, verbal: true }),
    // ---- geste : ce que fait mon geste ----------------------------------
    def("gesture", "geste", ["anima", "pro"], 0.3, 3, 0.05,
      () => state.tuning.gestureGain, (v) => (state.tuning.gestureGain = v),
      { format: (v) => `×${plain(v)}`, verbal: true }),
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
    def("windOverlay", "geste", [], 0, 1, 0.01,
      () => state.tuning.windOverlay, (v) => (state.tuning.windOverlay = v)),
    // ---- voix : ce que fait ma voix -------------------------------------
    def("bassGain", "voix", ["anima", "pro"], 0, 2, 0.05,
      () => state.audio.bassGain, (v) => (state.audio.bassGain = v),
      { format: (v) => percent(v / 2) }),
    def("trebleGain", "voix", ["anima", "pro"], 0, 2, 0.05,
      () => state.audio.trebleGain, (v) => (state.audio.trebleGain = v),
      { format: (v) => percent(v / 2) }),
    def("transientGain", "voix", ["anima", "pro"], 0, 2, 0.05,
      () => state.audio.transientGain, (v) => (state.audio.transientGain = v),
      { format: (v) => percent(v / 2) }),
    def("voiceEase", "voix", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.voiceEase, (v) => (state.tuning.voiceEase = v),
      { format: percent }),
    def("cymatic", "voix", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.cymGain, (v) => (state.tuning.cymGain = v),
      { format: (v) => percent(v / 2) }),
    def("ember", "voix", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.emberGain, (v) => (state.tuning.emberGain = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6] }),
    def("silence", "voix", ["pro"], 0.001, 0.15, 0.001,
      () => state.audio.silenceThreshold,
      (v) => (state.audio.silenceThreshold = v)),
    def("tonal", "voix", ["pro"], 0.5, 0.95, 0.01,
      () => state.audio.tonalThreshold,
      (v) => (state.audio.tonalThreshold = v)),
    // ---- temps : le temps et la mémoire ---------------------------------
    def("timeScale", "temps", ["anima", "pro"], -1, 1, 0.01,
      () => state.tuning.timeScale, (v) => (state.tuning.timeScale = v),
      {
        verbal: true,
        format: (v) =>
          Math.abs(v) < 0.02
            ? t("val.timeFrozen")
            : v < 0
              ? `${t("val.timeRewind")} ×${plain(-v)}`
              : v > 0.95
                ? t("val.timeNormal")
                : `${t("val.timeSlow")} ×${plain(v)}`,
      }),
    def("trails", "temps", ["anima", "pro"], 0.4, 0.995, 0.005,
      () => state.tuning.trailDecay, (v) => (state.tuning.trailDecay = v),
      { format: (v) => percent((v - 0.4) / 0.595), chaos: [0.7, 0.95] }),
    def("memoryGain", "temps", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.memoryGain, (v) => (state.tuning.memoryGain = v),
      { format: percent, reveals: true, chaos: [0, 0.5] }),
    def("memorySeconds", "temps", ["anima", "pro"], 2, 60, 1,
      () => state.tuning.memorySeconds, (v) => (state.tuning.memorySeconds = v),
      {
        format: (v) => `${Math.round(v)} s`,
        verbal: true,
        visible: () => state.tuning.memoryGain > 0.001,
      }),
    def("lifeCycle", "temps", ["pro"], 15, 120, 1,
      () => state.tuning.lifeSeconds, (v) => (state.tuning.lifeSeconds = v),
      { format: (v) => `${Math.round(v)} s` }),
    def("silenceDelay", "temps", ["pro"], 0.5, 15, 0.5,
      () => state.behavior.silenceDelay, (v) => (state.behavior.silenceDelay = v),
      { format: (v) => `${plain(v)} s` }),
    def("imprintReturn", "temps", [], 0, 1, 1,
      () => (state.behavior.imprintReturn ? 1 : 0),
      (v) => (state.behavior.imprintReturn = v > 0.5)),
    // ---- look : le monde autour -----------------------------------------
    def("fondMat", "look", ["anima", "pro"], 0, 7, 1,
      () => state.tuning.fondMat, (v) => {
        state.tuning.fondMat = v;
        state.tuning.matBlend = 0;
      },
      { discrete: true, options: matOptions, chaos: [0, 7], chaosSnap: true }),
    def("fondVisible", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.fondVisible, (v) => (state.tuning.fondVisible = v),
      { format: percent, chaos: [0.15, 0.8] }),
    def("turbulence", "look", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.turbulence, (v) => (state.tuning.turbulence = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.5] }),
    def("fondReact", "look", ["anima", "pro"], 0, 2, 0.05,
      () => state.tuning.fondReact, (v) => (state.tuning.fondReact = v),
      { format: (v) => percent(v / 2), chaos: [0.4, 1.6] }),
    def("colorDriver", "look", ["anima", "pro"], 0, 3, 1,
      () => state.tuning.colorDriver, (v) => (state.tuning.colorDriver = v),
      {
        discrete: true,
        chaos: [0, 3],
        chaosSnap: true,
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
        options: () => [
          { value: 0, label: t("opt.blendAdd") },
          { value: 1, label: t("opt.blendScreen") },
          { value: 2, label: t("opt.blendSoft") },
          { value: 3, label: t("opt.blendDodge") },
          { value: 4, label: t("opt.blendPaper") },
        ],
      }),
    def("halo", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.halo, (v) => (state.tuning.halo = v),
      { format: percent, chaos: [0, 0.5] }),
    def("paperGrain", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.paperGrain, (v) => (state.tuning.paperGrain = v),
      { format: percent }),
    def("depthAmount", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.depthAmount, (v) => (state.tuning.depthAmount = v),
      { format: percent, reveals: true, chaos: [0, 0.8] }),
    def("focusLayer", "look", ["anima", "pro"], 0, 2, 1,
      () => state.tuning.focusLayer, (v) => (state.tuning.focusLayer = v),
      {
        discrete: true,
        visible: () => state.tuning.depthAmount > 0.001,
        options: () => [
          { value: 0, label: t("opt.layerFar") },
          { value: 1, label: t("opt.layerMid") },
          { value: 2, label: t("opt.layerNear") },
        ],
      }),
    def("dofBlur", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.dofBlur, (v) => (state.tuning.dofBlur = v),
      { format: percent, visible: () => state.tuning.depthAmount > 0.001 }),
    def("symMode", "look", ["anima", "pro"], 0, 4, 1,
      () => state.tuning.symMode, (v) => (state.tuning.symMode = v),
      {
        discrete: true,
        chaos: [0, 4],
        chaosSnap: true,
        reveals: true,
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
        verbal: true,
        visible: () => state.tuning.symMode > 3.5,
        chaos: [3, 9],
        chaosSnap: true,
      }),
    def("strobe", "look", ["anima", "pro"], 0, 1, 0.01,
      () => state.tuning.strobe, (v) => (state.tuning.strobe = v),
      { format: percent, chaos: [0, 0.3] }),
    def("size", "look", ["pro"], 0.8, 5, 0.1,
      () => state.tuning.pointSize, (v) => (state.tuning.pointSize = v)),
    def("exposure", "look", ["pro"], 0.5, 3, 0.05,
      () => state.tuning.exposure, (v) => (state.tuning.exposure = v)),
    def("fringe", "look", ["pro"], 0, 1, 0.01,
      () => state.tuning.fringeTint, (v) => (state.tuning.fringeTint = v),
      {
        verbal: true,
        format: (v) =>
          v < 0.4 ? t("val.warm") : v > 0.6 ? t("val.cool") : t("val.neutral"),
      }),
    def("breath", "look", ["pro"], 0, 2, 0.05,
      () => state.tuning.gustStrength, (v) => (state.tuning.gustStrength = v),
      { format: (v) => percent(v / 2), chaos: [0.3, 1.8] }),
    def("filament", "look", ["pro"], 0, 2, 0.05,
      () => state.tuning.filament, (v) => (state.tuning.filament = v),
      { chaos: [0, 2] }),
    def("ashShare", "look", ["pro"], 0.05, 0.35, 0.01,
      () => state.tuning.ashShare, (v) => (state.tuning.ashShare = v),
      { format: percent }),
    def("sediment", "look", ["pro"], 0, 2, 0.05,
      () => state.tuning.sediment, (v) => (state.tuning.sediment = v)),
    def("ghost", "look", ["pro"], 0, 0.35, 0.005,
      () => state.tuning.ghost, (v) => (state.tuning.ghost = v),
      { format: (v) => percent(v / 0.35) }),
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
    // ---- paramètres fins des empreintes (pro, gated by family) -----------
    def("waveFreq", "empreintes", ["pro"], 0.5, 8, 0.1,
      () => state.imprint.wave.freq, (v) => (state.imprint.wave.freq = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveAmp", "empreintes", ["pro"], 0.02, 0.25, 0.005,
      () => state.imprint.wave.amp, (v) => (state.imprint.wave.amp = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveThick", "empreintes", ["pro"], 0.001, 0.02, 0.001,
      () => state.imprint.wave.thickness,
      (v) => (state.imprint.wave.thickness = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("waveCount", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.wave.waves, (v) => (state.imprint.wave.waves = v),
      {
        visible: () => state.imprint.family === "ondes",
        imprint: true,
        format: (v) => String(Math.round(v)),
        verbal: true,
      }),
    def("waveDrift", "empreintes", ["pro"], 0, 2, 0.05,
      () => state.imprint.wave.drift, (v) => (state.imprint.wave.drift = v),
      { visible: () => state.imprint.family === "ondes", imprint: true }),
    def("multiN", "empreintes", ["pro"], 2, 9, 1,
      () => state.imprint.multi.n, (v) => (state.imprint.multi.n = v),
      {
        visible: () => state.imprint.family === "multi",
        imprint: true,
        format: (v) => String(Math.round(v)),
        verbal: true,
      }),
    def("multiSize", "empreintes", ["pro"], 0.08, 0.4, 0.01,
      () => state.imprint.multi.size, (v) => (state.imprint.multi.size = v),
      { visible: () => state.imprint.family === "multi", imprint: true }),
    def("spin", "empreintes", ["pro"], 0, 2, 0.05,
      () => state.imprint.spin, (v) => (state.imprint.spin = v),
      { visible: () => state.imprint.family === "volume", imprint: true }),
    def("lissaA", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.lissa.a, (v) => (state.imprint.lissa.a = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
        verbal: true,
      }),
    def("lissaB", "empreintes", ["pro"], 1, 7, 1,
      () => state.imprint.lissa.b, (v) => (state.imprint.lissa.b = v),
      {
        visible: () =>
          state.imprint.family === "math" && state.imprint.variant === "lissajous",
        imprint: true,
        format: (v) => String(Math.round(v)),
        verbal: true,
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

  const crystalBar = document.createElement("div");
  crystalBar.className = "cinerae-crystal";
  crystalBar.innerHTML = `<span class="cinerae-crystal-label"></span><span class="cinerae-crystal-track"><span class="cinerae-crystal-fill"></span></span>`;
  panel.appendChild(crystalBar);
  const crystalFill = crystalBar.querySelector(".cinerae-crystal-fill") as HTMLElement;
  const crystalLabel = crystalBar.querySelector(".cinerae-crystal-label") as HTMLElement;

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
      hooks.onInteraction();
      renderMode();
    });
    modeBar.appendChild(b);
    return b;
  });

  const sensorsBox = document.createElement("div");
  sensorsBox.className = "cinerae-sensors";
  panel.appendChild(sensorsBox);

  const makeSwitch = (
    labelKey: string,
    get: () => boolean,
    toggle: (next: boolean) => void,
    parent: HTMLElement = sensorsBox
  ) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cinerae-switch";
    row.setAttribute("role", "switch");
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

  // ----- chaos & reset: registry-driven --------------------------------------
  const writeDef = (key: string, v: number) => {
    const def = controls.find((d) => d.key === key);
    if (!def) return;
    def.set(Math.min(def.max, Math.max(def.min, v)));
    hooks.getMod()?.onAuthored(key, v);
  };

  const chaos = () => {
    hooks.onInteraction();
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
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.addEventListener("click", reset);
  actions.append(chaosButton, resetButton);

  // ----- umbra: one slider, the tints, nothing else -------------------------
  const umbraBox = document.createElement("div");
  umbraBox.className = "cinerae-umbra";
  panel.appendChild(umbraBox);

  // ----- collapsible sections ----------------------------------------------
  const SECTION_ORDER: SectionId[] = [
    "scenes",
    "moi",
    "geste",
    "voix",
    "temps",
    "look",
    "empreintes",
    "modulation",
    "midi",
    "aide",
  ];
  const sections = {} as Record<
    SectionId,
    { box: HTMLElement; body: HTMLElement; title: HTMLElement }
  >;
  for (const id of SECTION_ORDER) {
    const box = document.createElement("div");
    box.className = `cinerae-section cinerae-strata-${id}`;
    const head = document.createElement("button");
    head.type = "button";
    head.className = "cinerae-section-head";
    head.innerHTML = `<span class="cinerae-sketch">${SKETCH[id] ?? ""}</span><span class="cinerae-section-title"></span><span class="cinerae-section-caret"></span>`;
    const body = document.createElement("div");
    body.className = "cinerae-section-body";
    head.addEventListener("click", () => {
      sectionOpen[id] = !sectionOpen[id];
      hooks.onInteraction();
      renderMode();
    });
    box.append(head, body);
    panel.appendChild(box);
    sections[id] = {
      box,
      body,
      title: head.querySelector(".cinerae-section-title") as HTMLElement,
    };
  }

  // ----- shared row builders ------------------------------------------------
  let rowRefs: {
    def: ControlDef;
    input: HTMLInputElement;
    readout: HTMLSpanElement;
    row: HTMLLabelElement;
  }[] = [];
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

  // In Umbra and Anima a slider reads in plain words; Pro reads the numbers.
  const displayFormat = (def: ControlDef): ((v: number) => string) => {
    if (mode === "pro" || def.verbal) return def.format ?? plain;
    return (v: number) => words((v - def.min) / Math.max(1e-9, def.max - def.min));
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
    const row = document.createElement("label");
    row.className = "cinerae-row";
    const name = document.createElement("span");
    name.className = "cinerae-row-name";
    name.textContent = label;
    const readout = document.createElement("span");
    readout.className = "cinerae-value";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    const show = () => (readout.textContent = format(get()));
    show();
    input.addEventListener("input", () => {
      set(Number(input.value));
      show();
      hooks.onInteraction();
    });
    row.append(name, input, readout);
    parent.appendChild(row);
    return { row, input, readout, name, show };
  };

  // Two-second demo sweep: tap a slider's name and the setting shows itself —
  // glides to its floor, sweeps to its ceiling, comes home.
  const demoSweep = (def: ControlDef, input: HTMLInputElement, show: () => void) => {
    const from = def.get();
    const token = ++glideToken;
    const start = performance.now();
    const DUR = 2000;
    const frame = () => {
      if (token !== glideToken) return;
      const c = Math.min(1, (performance.now() - start) / DUR);
      // min -> max -> back home, eased as one smooth breath.
      let v: number;
      if (c < 0.25) {
        const u = c / 0.25;
        v = from + (def.min - from) * u * u * (3 - 2 * u);
      } else if (c < 0.75) {
        const u = (c - 0.25) / 0.5;
        v = def.min + (def.max - def.min) * u * u * (3 - 2 * u);
      } else {
        const u = (c - 0.75) / 0.25;
        v = def.max + (from - def.max) * u * u * (3 - 2 * u);
      }
      def.set(v);
      hooks.getMod()?.onAuthored(def.key, v);
      input.value = String(def.get());
      show();
      if (c < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
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
    const { row, input, readout, name, show } = makeSliderRow(
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
      displayFormat(def)
    );
    row.dataset.hint = t(`hint.${def.key}`);
    if (def.reveals) input.addEventListener("change", () => renderMode());
    name.addEventListener("click", (e) => {
      if (midiLearn && hooks.getMidi()?.enabled) return; // learn owns the tap
      e.preventDefault();
      hooks.onInteraction();
      demoSweep(def, input, show);
    });
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

  const renderSectionDefs = (id: SectionId, body: HTMLElement) => {
    for (const def of controls) {
      if (def.section !== id) continue;
      if (!def.modes.includes(mode)) continue;
      if (def.visible && !def.visible()) continue;
      renderDefRow(def, body);
    }
  };

  // ----- teintes (pastilles of colored dust) --------------------------------
  const renderTeintes = (parent: HTMLElement) => {
    const rowBox = document.createElement("div");
    rowBox.className = "cinerae-pastilles";
    rowBox.dataset.hint = t("hint.teinte");
    parent.appendChild(rowBox);
    for (const p of PALETTES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-pastille";
      b.classList.toggle("active", state.colors.name === p.name);
      b.title = t(`teinte.${p.name}`);
      b.setAttribute("aria-label", t(`teinte.${p.name}`));
      const c0 = rgbToHex(sampleStops(p.colors.stops, 0.15));
      const c1 = rgbToHex(sampleStops(p.colors.stops, 0.85));
      const bg = rgbToHex(p.colors.bg);
      b.style.background = `radial-gradient(circle at 32% 30%, ${c1} 0%, ${c0} 55%, ${bg} 100%)`;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        hooks.onPaletteSelect(p.name);
      });
      rowBox.appendChild(b);
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
    title = ""
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cinerae-mini";
    b.textContent = label;
    if (title) b.title = title;
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
    const hint = document.createElement("div");
    hint.className = "cinerae-hint";
    hint.textContent = presets?.hasSlots
      ? `A · ${slotNames[0]}  ↔  B · ${slotNames[1]}`
      : t("hint.xfadeFlow");
    body.appendChild(hint);
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
    label.className = "cinerae-color-label";
    label.textContent = t(labelKey);
    row.appendChild(label);
    for (const e of entries) {
      const input = document.createElement("input");
      input.type = "color";
      input.value = rgbToHex(e.value);
      input.title = e.title;
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

  function renderLook(body: HTMLElement) {
    renderTeintes(body);

    if (mode === "pro") {
      // Gradient editor: 2..5 stops + background, straight into live colors.
      const grad = document.createElement("div");
      grad.className = "cinerae-colors";
      grad.dataset.hint = t("hint.gradient");
      body.appendChild(grad);
      const colorInput = (value: Rgb, onSet: (c: Rgb) => void, title: string) => {
        const input = document.createElement("input");
        input.type = "color";
        input.value = rgbToHex(value);
        input.title = title;
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
      bgLabel.className = "cinerae-color-label";
      bgLabel.textContent = t("ui.bg");
      grad.appendChild(bgLabel);
      colorInput(state.colors.bg, (c) => (state.colors.bg = c), t("ui.bg"));
    }

    renderSectionDefs("look", body);
    renderCaptureRow(body);
  }

  // ----- moi section (adds the corps tint pair) ----------------------------
  function renderMoi(body: HTMLElement) {
    renderSectionDefs("moi", body);
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
    const autoBox = document.createElement("div");
    body.appendChild(autoBox);
    makeSwitch(
      "sw.auto",
      () => state.quality.auto,
      (next) => (state.quality.auto = next),
      autoBox
    );
  }

  // ----- geste / temps switches (pro) --------------------------------------
  function renderGeste(body: HTMLElement) {
    renderSectionDefs("geste", body);
    if (mode !== "pro") return;
    const box = document.createElement("div");
    body.appendChild(box);
    makeSwitch(
      "sw.mirror",
      () => state.tuning.mirror > 0.5,
      (next) => writeDef("mirror", next ? 1 : 0),
      box
    );
    makeSwitch(
      "sw.overlay",
      () => state.tuning.windOverlay > 0.01,
      (next) => writeDef("windOverlay", next ? 0.85 : 0),
      box
    );
  }

  function renderTemps(body: HTMLElement) {
    renderSectionDefs("temps", body);
    if (mode !== "pro") return;
    const box = document.createElement("div");
    body.appendChild(box);
    makeSwitch(
      "sw.imprintReturn",
      () => state.behavior.imprintReturn,
      (next) => writeDef("imprintReturn", next ? 1 : 0),
      box
    );
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

  function makeTargetSelect(
    parent: HTMLElement,
    label: string,
    current: string | undefined,
    withNone: boolean,
    onPick: (key: string) => void
  ) {
    const row = document.createElement("label");
    row.className = "cinerae-select-row";
    const name = document.createElement("span");
    name.textContent = label;
    const select = document.createElement("select");
    select.className = "cinerae-select";
    if (withNone) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "—";
      select.appendChild(o);
    }
    const xf = document.createElement("option");
    xf.value = "xfade";
    xf.textContent = t("ctl.xfade");
    select.appendChild(xf);
    for (const opt of targetOptions()) {
      const o = document.createElement("option");
      o.value = opt.key;
      o.textContent = opt.label;
      select.appendChild(o);
    }
    select.value = current ?? "";
    select.addEventListener("change", () => {
      hooks.onInteraction();
      onPick(select.value);
    });
    row.append(name, select);
    parent.appendChild(row);
  }

  function renderLfoBlock(body: HTMLElement, i: number, simple: boolean) {
    const mod = hooks.getMod()!;
    const lfo = mod.lfos[i]!;
    const head = document.createElement("div");
    head.className = "cinerae-lfo-head";
    head.textContent = `lfo ${i + 1}`;
    body.appendChild(head);
    const shapeRow = document.createElement("div");
    shapeRow.className = "cinerae-chips";
    body.appendChild(shapeRow);
    for (const shape of LFO_SHAPES) {
      makeChip(shapeRow, shape, lfo.shape === shape, () => {
        lfo.shape = shape as LfoShape;
        renderMode();
      });
    }
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
    if (!simple) {
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
    }
    const syncBox = document.createElement("div");
    body.appendChild(syncBox);
    makeSwitch(
      "sw.lfoSync",
      () => lfo.sync,
      (next) => (lfo.sync = next),
      syncBox
    );
    if (simple) {
      const source = `lfo${i + 1}`;
      const link = mod.links.find((l) => l.source === source);
      makeTargetSelect(body, t("ui.lfoTarget"), link?.target, true, (key) => {
        if (!key) {
          if (link) mod.removeLink(link);
        } else if (link) {
          mod.retarget(link, key);
        } else {
          mod.addLink(source, key);
        }
        renderMode();
      });
      if (link) {
        makeSliderRow(
          body,
          t("ui.lfoDepth"),
          -1,
          1,
          0.01,
          () => link.depth,
          (v) => (link.depth = v),
          (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)} %`
        );
      }
    }
  }

  function renderModulation(body: HTMLElement) {
    const mod = hooks.getMod();
    if (!mod) return;
    for (let i = 0; i < mod.lfos.length; i++) renderLfoBlock(body, i, false);

    const lfoBtns = document.createElement("div");
    lfoBtns.className = "cinerae-mini-row";
    body.appendChild(lfoBtns);
    const mini = (label: string, onClick: () => void, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-mini";
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        onClick();
        renderMode();
      });
      lfoBtns.appendChild(b);
    };
    mini("+ lfo", () => mod.addLfo(), mod.lfos.length >= 10);
    mini("− lfo", () => mod.removeLfo(), mod.lfos.length <= 1);

    // The matrix: source -> target links, each with its own depth.
    const title = document.createElement("div");
    title.className = "cinerae-lfo-head";
    title.textContent = t("ui.links");
    body.appendChild(title);
    for (const link of [...mod.links]) {
      renderLinkRow(body, mod, link);
    }
    const addRow = document.createElement("div");
    addRow.className = "cinerae-mini-row";
    body.appendChild(addRow);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "cinerae-mini";
    add.textContent = t("ui.addLink");
    add.addEventListener("click", () => {
      hooks.onInteraction();
      mod.addLink("lfo1", "force");
      renderMode();
    });
    addRow.appendChild(add);
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
    status.className = "cinerae-hint";
    status.textContent = `midi : ${midi.status}`;
    body.appendChild(status);
    if (!midi.enabled) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-mini";
      b.textContent = t("btn.midiOn");
      b.addEventListener("click", () => {
        hooks.onInteraction();
        void midi.enable().then(() => renderMode());
      });
      body.appendChild(b);
      return;
    }
    const learnBox = document.createElement("div");
    body.appendChild(learnBox);
    makeSwitch(
      "sw.midiLearn",
      () => midiLearn,
      (next) => {
        midiLearn = next;
        if (!next) midi.disarm();
        renderMode();
      },
      learnBox
    );
    const hint = document.createElement("div");
    hint.className = "cinerae-hint";
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

  const randomSwitchBox = document.createElement("div");
  const randomSwitch = makeSwitch(
    "sw.randomImprint",
    () => state.imprint.random,
    (next) => {
      state.imprint.random = next;
      hooks.onImprintParams();
    },
    randomSwitchBox
  );

  const FAMILY_ORDER: ImprintFamily[] = [
    "titre",
    "fond",
    "volume",
    "forme",
    "math",
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
    body.append(familyChips, variantChips, textRow, randomSwitchBox);
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
    randomSwitchBox.style.display = "";
    randomSwitch.sync();
    renderSectionDefs("empreintes", body);
  }

  // ----- aide ---------------------------------------------------------------
  // A short, living help — not a manual. Each future chantier adds its own
  // block to this same section (a titled sub-block appended below).
  function renderAide(body: HTMLElement) {
    const block = (titleKey: string, html: string) => {
      const box = document.createElement("div");
      box.className = "cinerae-aide-block";
      const h = document.createElement("div");
      h.className = "cinerae-aide-title";
      h.textContent = t(titleKey);
      const p = document.createElement("div");
      p.className = "cinerae-aide-text";
      p.innerHTML = html;
      box.append(h, p);
      body.appendChild(box);
    };
    block("aide.modesTitle", t("aide.modes"));
    block("aide.keysTitle", t("aide.keys"));
    block("aide.touchTitle", t("aide.touch"));
    block("aide.ndiTitle", t("aide.ndi"));
    const links = document.createElement("div");
    links.className = "cinerae-aide-text cinerae-aide-links";
    links.innerHTML =
      `<a href="https://nh.thomasmaury.fr" target="_blank" rel="noopener">nh.thomasmaury.fr</a>` +
      ` · <a href="https://nh.thomasmaury.fr/experiments" target="_blank" rel="noopener">${t("aide.expLink")}</a>`;
    body.appendChild(links);
  }

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
    ends.innerHTML = `<span>${t("ui.me")}</span><span>${t("ui.world")}</span>`;
    wrap.appendChild(ends);
    const { row } = makeSliderRow(
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
    row.dataset.hint = t("hint.umbra");
    row.classList.add("cinerae-umbra-row");
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
    const STAGGER = 70; // ms between sliders, in `targets` order
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
        const text = displayFormat(ref.def)(ref.def.get());
        if (ref.readout.textContent !== text) {
          ref.readout.textContent = text;
          markChanged(ref.row);
        }
      }
      if (!done) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ----- panel tint: the strata borrow the active palette -------------------
  function applyPanelTint() {
    const mid = sampleStops(state.colors.stops, 0.5);
    panel.style.setProperty(
      "--strata-tint",
      `rgb(${Math.round(mid[0] * 255)} ${Math.round(mid[1] * 255)} ${Math.round(mid[2] * 255)})`
    );
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
    resetButton.textContent = t("btn.reset");
    modeButtons.forEach((b, i) => {
      const active = MODE_IDS[i] === mode;
      b.textContent = t(`mode.${MODE_IDS[i]}`);
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    cameraSwitch.sync();
    micSwitch.sync();
    applyPanelTint();

    const minimal = mode === "umbra";
    sensorsBox.style.display = minimal ? "none" : "";
    actions.style.display = minimal ? "none" : "";
    crystalBar.style.display = minimal ? "none" : "";

    rowRefs = [];
    renderUmbra();

    const visible: Partial<Record<SectionId, boolean>> = {
      scenes: mode === "pro",
      moi: !minimal,
      geste: !minimal,
      voix: !minimal,
      temps: !minimal,
      look: !minimal,
      empreintes: mode === "pro",
      modulation: mode === "pro",
      midi: mode === "pro",
      aide: true,
    };
    for (const id of SECTION_ORDER) {
      const { box, body, title } = sections[id];
      box.style.display = visible[id] ? "" : "none";
      box.classList.toggle("open", sectionOpen[id]);
      title.textContent = t(`sec.${id}`);
      body.replaceChildren();
      if (!visible[id] || !sectionOpen[id]) continue;
      if (id === "scenes") renderScenes(body);
      else if (id === "moi") renderMoi(body);
      else if (id === "geste") renderGeste(body);
      else if (id === "voix") renderSectionDefs("voix", body);
      else if (id === "temps") renderTemps(body);
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
    },
    /** Reflect externally-driven values (modulation, MIDI) on visible rows,
     * without the change flash — called on a slow cadence by the loop. */
    syncValues(keys: ReadonlySet<string>) {
      for (const ref of rowRefs) {
        if (!keys.has(ref.def.key)) continue;
        ref.input.value = String(ref.def.get());
        const text = displayFormat(ref.def)(ref.def.get());
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
  };
}

export type Panel = ReturnType<typeof createPanel>;

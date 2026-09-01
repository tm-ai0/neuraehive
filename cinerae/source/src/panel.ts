// Settings panel. Three complexity modes (non-initié / curieux / pro),
// sensor switches, Chaos and Reset, and collapsible sections: presets
// (built-ins, local file, A/B crossfade, capture), empreintes, look
// (palettes, gradient editor, fusion, depth, symmetry, time), modulation
// (LFOs and the matrix), MIDI (learn). Desktop: collapsible card top-right.
// Mobile (coarse pointer / narrow): bottom sheet with a large handle.
// Every control writes straight into live state read by the render loop —
// no rebuild, no debounce, no latency.
import { IMPRINT_VARIANTS, type ImprintFamily, type ImprintSettings } from "./imprints";
import { PALETTES, type LookColors, type Rgb } from "./look";
import type { Midi } from "./midi";
import { LFO_SHAPES, type LfoShape, type ModLink, type ModMatrix, type ParamRef } from "./modmatrix";
import type { PresetData, Presets } from "./presets";
import type { Tuning } from "./renderer";

export type PanelMode = "simple" | "curieux" | "pro";

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
  // ---- v0.6: presets, crossfade, capture, palette, engines ----------------
  onCrossfade(value: number): void;
  getXfade(): number;
  onPaletteSelect(name: string): void;
  onCapturePng(): void;
  onToggleRecord(): boolean;
  onFullscreen(): void;
  getPresets(): Presets | undefined;
  getMod(): ModMatrix | undefined;
  getMidi(): Midi | undefined;
}

type SectionId =
  | "presets"
  | "presence"
  | "empreintes"
  | "look"
  | "modulation"
  | "midi"
  | "reglages";

interface ControlDef extends ParamRef {
  modes: PanelMode[];
  section: SectionId;
  format?: (v: number) => string;
  /** Extra gate on top of modes (imprint family params, gated look rows). */
  visible?: () => boolean;
  /** Notify the imprint engine after a set (regenerates the cloud). */
  imprint?: boolean;
  /** Render as a <select> of these options instead of a slider. */
  options?: { value: number; label: string }[];
  /** Moving it reveals or hides other rows: re-render on release. */
  reveals?: boolean;
}

const MODES: { id: PanelMode; label: string }[] = [
  { id: "simple", label: "Non-initié" },
  { id: "curieux", label: "Curieux" },
  { id: "pro", label: "Pro" },
];

const SLIDERS_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/><circle cx="7" cy="6" r="1.8" fill="#050403"/><circle cx="13" cy="10" r="1.8" fill="#050403"/><circle cx="9" cy="14" r="1.8" fill="#050403"/></svg>`;

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

export function createPanel(
  root: HTMLElement,
  state: PanelState,
  hooks: PanelHooks
) {
  let mode: PanelMode = "simple";
  let collapsed = false;
  let sensors = { camera: false, mic: false };
  let midiLearn = false;
  const sectionOpen: Record<SectionId, boolean> = {
    presets: true,
    presence: true,
    empreintes: true,
    look: false,
    modulation: false,
    midi: false,
    reglages: false,
  };

  const controls: ControlDef[] = [
    {
      key: "force",
      label: "force du vent",
      min: 0,
      max: 3,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "reglages",
      get: () => state.tuning.force,
      set: (v) => (state.tuning.force = v),
    },
    {
      key: "viscosity",
      label: "viscosité",
      min: 0,
      max: 8,
      step: 0.1,
      modes: ["curieux", "pro"],
      section: "reglages",
      get: () => state.tuning.viscosity,
      set: (v) => (state.tuning.viscosity = v),
    },
    {
      key: "turbulence",
      label: "turbulence",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "reglages",
      get: () => state.tuning.turbulence,
      set: (v) => (state.tuning.turbulence = v),
    },
    {
      key: "trails",
      label: "trainées",
      min: 0.4,
      max: 0.995,
      step: 0.005,
      modes: ["curieux", "pro"],
      section: "look",
      format: (v) => percent((v - 0.4) / 0.595),
      get: () => state.tuning.trailDecay,
      set: (v) => (state.tuning.trailDecay = v),
    },
    {
      key: "silence",
      label: "seuil de silence",
      min: 0.001,
      max: 0.15,
      step: 0.001,
      modes: ["curieux", "pro"],
      section: "reglages",
      get: () => state.audio.silenceThreshold,
      set: (v) => (state.audio.silenceThreshold = v),
    },
    {
      key: "fringe",
      label: "teinte de la frange",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "reglages",
      format: (v) => (v < 0.4 ? "chaude" : v > 0.6 ? "froide" : "neutre"),
      get: () => state.tuning.fringeTint,
      set: (v) => (state.tuning.fringeTint = v),
    },
    {
      key: "ember",
      label: "braises",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "reglages",
      format: (v) => percent(v / 2),
      get: () => state.tuning.emberGain,
      set: (v) => (state.tuning.emberGain = v),
    },
    {
      key: "cymatic",
      label: "cymatique",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "reglages",
      format: (v) => percent(v / 2),
      get: () => state.tuning.cymGain,
      set: (v) => (state.tuning.cymGain = v),
    },
    {
      key: "breath",
      label: "respiration",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "reglages",
      format: (v) => percent(v / 2),
      get: () => state.tuning.gustStrength,
      set: (v) => (state.tuning.gustStrength = v),
    },
    {
      key: "size",
      label: "taille des grains",
      min: 0.8,
      max: 5,
      step: 0.1,
      modes: ["pro"],
      section: "reglages",
      get: () => state.tuning.pointSize,
      set: (v) => (state.tuning.pointSize = v),
    },
    {
      key: "count",
      label: "particules",
      min: 10_000,
      max: 400_000,
      step: 10_000,
      modes: ["pro"],
      section: "reglages",
      format: thousands,
      get: () => state.tuning.count,
      set: (v) => (state.tuning.count = v),
    },
    {
      key: "exposure",
      label: "exposition",
      min: 0.5,
      max: 3,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.tuning.exposure,
      set: (v) => (state.tuning.exposure = v),
    },
    {
      key: "bassGain",
      label: "gain basses",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.audio.bassGain,
      set: (v) => (state.audio.bassGain = v),
    },
    {
      key: "trebleGain",
      label: "gain aigus",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.audio.trebleGain,
      set: (v) => (state.audio.trebleGain = v),
    },
    {
      key: "transientGain",
      label: "gain transitoires",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.audio.transientGain,
      set: (v) => (state.audio.transientGain = v),
    },
    {
      key: "ashShare",
      label: "part de cendre",
      min: 0.05,
      max: 0.35,
      step: 0.01,
      modes: ["pro"],
      section: "reglages",
      format: percent,
      get: () => state.tuning.ashShare,
      set: (v) => (state.tuning.ashShare = v),
    },
    {
      key: "lifeCycle",
      label: "cycle de la matière",
      min: 15,
      max: 120,
      step: 1,
      modes: ["pro"],
      section: "reglages",
      format: (v) => `${Math.round(v)} s`,
      get: () => state.tuning.lifeSeconds,
      set: (v) => (state.tuning.lifeSeconds = v),
    },
    {
      key: "sediment",
      label: "sédimentation",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.tuning.sediment,
      set: (v) => (state.tuning.sediment = v),
    },
    {
      key: "filament",
      label: "filaments",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      get: () => state.tuning.filament,
      set: (v) => (state.tuning.filament = v),
    },
    {
      key: "tonal",
      label: "seuil tonal",
      min: 0.5,
      max: 0.95,
      step: 0.01,
      modes: ["pro"],
      section: "reglages",
      get: () => state.audio.tonalThreshold,
      set: (v) => (state.audio.tonalThreshold = v),
    },
    {
      key: "comet",
      label: "comètes",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      format: (v) => percent(v / 2),
      get: () => state.tuning.cometGain,
      set: (v) => (state.tuning.cometGain = v),
    },
    {
      key: "gesture",
      label: "gain du geste",
      min: 0.3,
      max: 3,
      step: 0.05,
      modes: ["pro"],
      section: "reglages",
      format: (v) => `×${plain(v)}`,
      get: () => state.tuning.gestureGain,
      set: (v) => (state.tuning.gestureGain = v),
    },
    {
      key: "silenceDelay",
      label: "durée du silence",
      min: 0.5,
      max: 15,
      step: 0.5,
      modes: ["pro"],
      section: "reglages",
      format: (v) => `${plain(v)} s`,
      get: () => state.behavior.silenceDelay,
      set: (v) => (state.behavior.silenceDelay = v),
    },
    // ---- look ---------------------------------------------------------------
    {
      key: "colorDriver",
      label: "couleur pilotée par",
      min: 0,
      max: 3,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      discrete: true,
      options: [
        { value: 0, label: "âge" },
        { value: 1, label: "vitesse (calme → mouvement)" },
        { value: 2, label: "densité" },
        { value: 3, label: "profondeur" },
      ],
      get: () => state.tuning.colorDriver,
      set: (v) => (state.tuning.colorDriver = v),
    },
    {
      key: "blendMode",
      label: "fusion des grains",
      min: 0,
      max: 4,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      discrete: true,
      options: [
        { value: 0, label: "additif" },
        { value: 1, label: "écran" },
        { value: 2, label: "lumière tamisée" },
        { value: 3, label: "dodge" },
        { value: 4, label: "soustractif (papier)" },
      ],
      get: () => state.tuning.blendMode,
      set: (v) => (state.tuning.blendMode = v),
    },
    {
      key: "halo",
      label: "halo doux",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      get: () => state.tuning.halo,
      set: (v) => (state.tuning.halo = v),
    },
    {
      key: "paperGrain",
      label: "grain papier",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      get: () => state.tuning.paperGrain,
      set: (v) => (state.tuning.paperGrain = v),
    },
    {
      key: "depthAmount",
      label: "profondeur (parallaxe)",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      reveals: true,
      get: () => state.tuning.depthAmount,
      set: (v) => (state.tuning.depthAmount = v),
    },
    {
      key: "focusLayer",
      label: "couche nette",
      min: 0,
      max: 2,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      discrete: true,
      visible: () => state.tuning.depthAmount > 0.001,
      options: [
        { value: 0, label: "lointaine" },
        { value: 1, label: "moyenne" },
        { value: 2, label: "proche" },
      ],
      get: () => state.tuning.focusLayer,
      set: (v) => (state.tuning.focusLayer = v),
    },
    {
      key: "dofBlur",
      label: "flou de profondeur",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      visible: () => state.tuning.depthAmount > 0.001,
      get: () => state.tuning.dofBlur,
      set: (v) => (state.tuning.dofBlur = v),
    },
    {
      key: "symMode",
      label: "symétrie",
      min: 0,
      max: 4,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      discrete: true,
      options: [
        { value: 0, label: "aucune" },
        { value: 1, label: "miroir horizontal" },
        { value: 2, label: "miroir vertical" },
        { value: 3, label: "quatre quadrants" },
        { value: 4, label: "radiale" },
      ],
      get: () => state.tuning.symMode,
      set: (v) => (state.tuning.symMode = v),
    },
    {
      key: "symN",
      label: "branches",
      min: 3,
      max: 12,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      format: (v) => String(Math.round(v)),
      visible: () => state.tuning.symMode > 3.5,
      get: () => state.tuning.symN,
      set: (v) => (state.tuning.symN = v),
    },
    {
      key: "timeScale",
      label: "temps",
      min: -1,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: (v) =>
        Math.abs(v) < 0.02
          ? "gel"
          : v < 0
            ? `retour ×${plain(-v)}`
            : v > 0.95
              ? "normal"
              : `ralenti ×${plain(v)}`,
      get: () => state.tuning.timeScale,
      set: (v) => (state.tuning.timeScale = v),
    },
    {
      key: "strobe",
      label: "stroboscope",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      get: () => state.tuning.strobe,
      set: (v) => (state.tuning.strobe = v),
    },
    {
      key: "memoryGain",
      label: "cendre mémoire",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "look",
      format: percent,
      reveals: true,
      get: () => state.tuning.memoryGain,
      set: (v) => (state.tuning.memoryGain = v),
    },
    {
      key: "memorySeconds",
      label: "durée de mémoire",
      min: 2,
      max: 60,
      step: 1,
      modes: ["curieux", "pro"],
      section: "look",
      format: (v) => `${Math.round(v)} s`,
      visible: () => state.tuning.memoryGain > 0.001,
      get: () => state.tuning.memorySeconds,
      set: (v) => (state.tuning.memorySeconds = v),
    },
    {
      key: "ghost",
      label: "fantôme caméra",
      min: 0,
      max: 0.35,
      step: 0.005,
      modes: ["pro"],
      section: "look",
      format: (v) => percent(v / 0.35),
      get: () => state.tuning.ghost,
      set: (v) => (state.tuning.ghost = v),
    },
    // ---- présence -----------------------------------------------------------
    {
      key: "presenceTrame",
      label: "trame du portrait",
      min: 0,
      max: 5,
      step: 1,
      modes: ["curieux", "pro"],
      section: "presence",
      discrete: true,
      options: [
        { value: 0, label: "bruit" },
        { value: 1, label: "dithering ordonné" },
        { value: 2, label: "lignes" },
        { value: 3, label: "moiré" },
        { value: 4, label: "trame de points" },
        { value: 5, label: "contours" },
      ],
      get: () => state.tuning.presenceTrame,
      set: (v) => (state.tuning.presenceTrame = v),
    },
    {
      key: "presenceShare",
      label: "grains du portrait",
      min: 0.1,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "presence",
      format: percent,
      get: () => state.tuning.presenceShare,
      set: (v) => (state.tuning.presenceShare = v),
    },
    {
      key: "presenceSize",
      label: "taille du portrait",
      min: 0.6,
      max: 3,
      step: 0.05,
      modes: ["curieux", "pro"],
      section: "presence",
      format: (v) => `×${plain(v)}`,
      get: () => state.tuning.presenceSize,
      set: (v) => (state.tuning.presenceSize = v),
    },
    {
      key: "presenceHold",
      label: "élasticité",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["curieux", "pro"],
      section: "presence",
      format: (v) =>
        v < 0.05
          ? "poussière libre"
          : v < 0.4
            ? "souple"
            : v < 0.8
              ? "élastique"
              : "portrait rigide",
      get: () => state.tuning.presenceHold,
      set: (v) => (state.tuning.presenceHold = v),
    },
    {
      key: "presenceThreshold",
      label: "seuil de présence",
      min: 0.0005,
      max: 0.01,
      step: 0.0005,
      modes: ["pro"],
      section: "presence",
      get: () => state.behavior.presenceThreshold,
      set: (v) => (state.behavior.presenceThreshold = v),
    },
    {
      key: "presenceDelay",
      label: "délai de présence",
      min: 1,
      max: 30,
      step: 0.5,
      modes: ["pro"],
      section: "presence",
      format: (v) => `${plain(v)} s`,
      get: () => state.behavior.presenceDelay,
      set: (v) => (state.behavior.presenceDelay = v),
    },
    // ---- crossfade (rendered by the presets section, target like any) ------
    {
      key: "xfade",
      label: "crossfade A ↔ B",
      min: 0,
      max: 1,
      step: 0.005,
      modes: [],
      section: "presets",
      format: percent,
      reveals: true, // refresh chips and readouts on release, never mid-drag
      get: () => hooks.getXfade(),
      set: (v) => hooks.onCrossfade(v),
    },
    // ---- paramètres fins des empreintes (pro, gated by family) ------------
    {
      key: "waveFreq",
      label: "onde · fréquence",
      min: 0.5,
      max: 8,
      step: 0.1,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "ondes",
      imprint: true,
      get: () => state.imprint.wave.freq,
      set: (v) => (state.imprint.wave.freq = v),
    },
    {
      key: "waveAmp",
      label: "onde · amplitude",
      min: 0.02,
      max: 0.25,
      step: 0.005,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "ondes",
      imprint: true,
      get: () => state.imprint.wave.amp,
      set: (v) => (state.imprint.wave.amp = v),
    },
    {
      key: "waveThick",
      label: "onde · épaisseur",
      min: 0.001,
      max: 0.02,
      step: 0.001,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "ondes",
      imprint: true,
      get: () => state.imprint.wave.thickness,
      set: (v) => (state.imprint.wave.thickness = v),
    },
    {
      key: "waveCount",
      label: "onde · nombre",
      min: 1,
      max: 7,
      step: 1,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "ondes",
      imprint: true,
      format: (v) => String(Math.round(v)),
      get: () => state.imprint.wave.waves,
      set: (v) => (state.imprint.wave.waves = v),
    },
    {
      key: "waveDrift",
      label: "onde · dérive de phase",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "ondes",
      imprint: true,
      get: () => state.imprint.wave.drift,
      set: (v) => (state.imprint.wave.drift = v),
    },
    {
      key: "multiN",
      label: "multi · nombre",
      min: 2,
      max: 9,
      step: 1,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "multi",
      imprint: true,
      format: (v) => String(Math.round(v)),
      get: () => state.imprint.multi.n,
      set: (v) => (state.imprint.multi.n = v),
    },
    {
      key: "multiSize",
      label: "multi · taille",
      min: 0.08,
      max: 0.4,
      step: 0.01,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "multi",
      imprint: true,
      get: () => state.imprint.multi.size,
      set: (v) => (state.imprint.multi.size = v),
    },
    {
      key: "spin",
      label: "volume · rotation",
      min: 0,
      max: 2,
      step: 0.05,
      modes: ["pro"],
      section: "empreintes",
      visible: () => state.imprint.family === "volume",
      imprint: true,
      get: () => state.imprint.spin,
      set: (v) => (state.imprint.spin = v),
    },
    {
      key: "lissaA",
      label: "lissajous · a",
      min: 1,
      max: 7,
      step: 1,
      modes: ["pro"],
      section: "empreintes",
      visible: () =>
        state.imprint.family === "math" && state.imprint.variant === "lissajous",
      imprint: true,
      format: (v) => String(Math.round(v)),
      get: () => state.imprint.lissa.a,
      set: (v) => (state.imprint.lissa.a = v),
    },
    {
      key: "lissaB",
      label: "lissajous · b",
      min: 1,
      max: 7,
      step: 1,
      modes: ["pro"],
      section: "empreintes",
      visible: () =>
        state.imprint.family === "math" && state.imprint.variant === "lissajous",
      imprint: true,
      format: (v) => String(Math.round(v)),
      get: () => state.imprint.lissa.b,
      set: (v) => (state.imprint.lissa.b = v),
    },
  ];

  // Snapshot taken at creation, while the state still holds its defaults —
  // Reset glides every def back to these values.
  const initialValues = new Map<ControlDef, number>(
    controls.map((def) => [def, def.get()])
  );

  // Chaos target ranges by def key, clamped to each def's min/max.
  const CHAOS_RANGES: Record<string, [number, number]> = {
    force: [0.6, 2.6],
    viscosity: [0.8, 5.5],
    turbulence: [0.3, 1.5],
    trails: [0.7, 0.95],
    breath: [0.3, 1.8],
    filament: [0, 2],
    comet: [0.4, 1.6],
    ember: [0.4, 1.6],
    halo: [0, 0.5],
    strobe: [0, 0.3],
    depthAmount: [0, 0.8],
    presenceHold: [0.2, 1],
    presenceShare: [0.35, 1],
    presenceSize: [0.8, 2.4],
  };

  // ----- skeleton ----------------------------------------------------------
  const panel = document.createElement("section");
  panel.className = "cinerae-panel";
  panel.setAttribute("aria-label", "Réglages Cineræ");
  root.appendChild(panel);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "cinerae-open";
  openButton.setAttribute("aria-label", "Ouvrir les réglages");
  openButton.innerHTML = SLIDERS_ICON;
  root.appendChild(openButton);

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "cinerae-handle";
  handle.setAttribute("aria-label", "Ouvrir ou fermer les réglages");
  handle.innerHTML = `<span class="cinerae-handle-bar"></span>`;
  panel.appendChild(handle);

  const header = document.createElement("header");
  header.className = "cinerae-header";
  panel.appendChild(header);

  const fpsLine = document.createElement("span");
  fpsLine.className = "cinerae-fps";
  fpsLine.textContent = "— fps";
  header.appendChild(fpsLine);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "cinerae-close";
  closeButton.setAttribute("aria-label", "Replier les réglages");
  closeButton.textContent = "–";
  header.appendChild(closeButton);

  const statusLine = document.createElement("div");
  statusLine.className = "cinerae-status";
  statusLine.textContent = "en attente";
  panel.appendChild(statusLine);

  const crystalBar = document.createElement("div");
  crystalBar.className = "cinerae-crystal";
  crystalBar.innerHTML = `<span class="cinerae-crystal-label">cristal</span><span class="cinerae-crystal-track"><span class="cinerae-crystal-fill"></span></span>`;
  panel.appendChild(crystalBar);
  const crystalFill = crystalBar.querySelector(".cinerae-crystal-fill") as HTMLElement;

  const modeBar = document.createElement("div");
  modeBar.className = "cinerae-modes";
  modeBar.setAttribute("role", "tablist");
  panel.appendChild(modeBar);
  const modeButtons = MODES.map((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = m.label;
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      mode = m.id;
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
    label: string,
    get: () => boolean,
    toggle: (next: boolean) => void,
    parent: HTMLElement = sensorsBox
  ) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cinerae-switch";
    row.setAttribute("role", "switch");
    const name = document.createElement("span");
    name.textContent = label;
    const track = document.createElement("span");
    track.className = "cinerae-switch-track";
    track.innerHTML = `<span class="cinerae-switch-thumb"></span>`;
    row.append(name, track);
    const sync = () => row.setAttribute("aria-checked", String(get()));
    row.addEventListener("click", () => {
      hooks.onInteraction();
      toggle(!get());
      sync();
    });
    parent.appendChild(row);
    return { row, sync };
  };

  const cameraSwitch = makeSwitch(
    "caméra",
    () => sensors.camera,
    (next) => hooks.onSensor("camera", next)
  );
  const micSwitch = makeSwitch(
    "micro",
    () => sensors.mic,
    (next) => hooks.onSensor("mic", next)
  );
  const mirrorSwitch = makeSwitch(
    "miroir caméra",
    () => state.tuning.mirror > 0.5,
    (next) => (state.tuning.mirror = next ? 1 : 0)
  );
  const overlaySwitch = makeSwitch(
    "champ de vent",
    () => state.tuning.windOverlay > 0.01,
    (next) => (state.tuning.windOverlay = next ? 0.85 : 0)
  );
  const imprintReturnSwitch = makeSwitch(
    "retour de l'empreinte",
    () => state.behavior.imprintReturn,
    (next) => (state.behavior.imprintReturn = next)
  );
  const autoSwitch = makeSwitch(
    "qualité auto",
    () => state.quality.auto,
    (next) => (state.quality.auto = next)
  );

  const actions = document.createElement("div");
  actions.className = "cinerae-actions";
  panel.appendChild(actions);
  const chaosButton = document.createElement("button");
  chaosButton.type = "button";
  chaosButton.textContent = "Chaos";
  chaosButton.addEventListener("click", () => {
    hooks.onInteraction();
    hooks.onChaos();
    const targets: { def: ControlDef; to: number }[] = [];
    for (const def of controls) {
      const range = CHAOS_RANGES[def.key];
      if (!range) continue;
      const lo = Math.max(def.min, range[0]);
      const hi = Math.min(def.max, range[1]);
      targets.push({ def, to: lo + Math.random() * (hi - lo) });
    }
    glide(targets);
    // One time out of three chaos also draws a palette, one out of four a
    // symmetry — the look belongs to the storm too.
    if (Math.random() < 1 / 3) {
      const p = PALETTES[(Math.random() * PALETTES.length) | 0]!;
      hooks.onPaletteSelect(p.name);
    }
    if (Math.random() < 1 / 4) {
      writeDef("symMode", (Math.random() * 5) | 0);
      writeDef("symN", 3 + ((Math.random() * 7) | 0));
      renderMode();
    }
    // ... and one out of four a new portrait trame — presence plays along.
    if (Math.random() < 1 / 4) {
      writeDef("presenceTrame", (Math.random() * 6) | 0);
      renderMode();
    }
  });
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset";
  resetButton.addEventListener("click", () => {
    hooks.onInteraction();
    hooks.onReset();
    renderMode();
    glide(controls.map((def) => ({ def, to: initialValues.get(def)! })));
  });
  actions.append(chaosButton, resetButton);

  const writeDef = (key: string, v: number) => {
    const def = controls.find((d) => d.key === key);
    if (!def) return;
    def.set(Math.min(def.max, Math.max(def.min, v)));
    hooks.getMod()?.onAuthored(key, v);
  };

  // ----- collapsible sections ----------------------------------------------
  const sections = {} as Record<SectionId, { box: HTMLElement; body: HTMLElement }>;
  const makeSection = (id: SectionId, title: string) => {
    const box = document.createElement("div");
    box.className = "cinerae-section";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "cinerae-section-head";
    head.innerHTML = `<span class="cinerae-section-caret"></span><span>${title}</span>`;
    const body = document.createElement("div");
    body.className = "cinerae-section-body";
    head.addEventListener("click", () => {
      sectionOpen[id] = !sectionOpen[id];
      hooks.onInteraction();
      renderMode();
    });
    box.append(head, body);
    panel.appendChild(box);
    sections[id] = { box, body };
    return sections[id];
  };
  makeSection("presets", "presets");
  makeSection("presence", "présence");
  makeSection("empreintes", "empreintes");
  makeSection("look", "look");
  makeSection("modulation", "modulation");
  makeSection("midi", "midi");
  makeSection("reglages", "réglages");

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

  const renderDefRow = (def: ControlDef, parent: HTMLElement) => {
    const mod = hooks.getMod();
    if (def.options) {
      const { row, name } = makeSelect(parent, def.label, def.options, def.get, (v) => {
        def.set(v);
        mod?.onAuthored(def.key, v);
        if (def.imprint) hooks.onImprintParams();
        renderMode();
      });
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
      dot.title = "modulé";
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

  // ----- presets section ----------------------------------------------------
  const presetFileInput = document.createElement("input");
  presetFileInput.type = "file";
  presetFileInput.accept = "application/json,.json";
  presetFileInput.style.display = "none";
  panel.appendChild(presetFileInput);
  presetFileInput.addEventListener("change", () => {
    const file = presetFileInput.files?.[0];
    if (file) {
      void hooks.getPresets()?.loadFile(file).then((err) => {
        if (err) statusLine.textContent = err;
        renderMode();
      });
    }
    presetFileInput.value = "";
  });

  let recButton: HTMLButtonElement | undefined;

  function renderPresets(body: HTMLElement) {
    const presets = hooks.getPresets();
    const chips = document.createElement("div");
    chips.className = "cinerae-chips";
    body.appendChild(chips);
    for (const p of presets?.builtIns ?? []) {
      makeChip(chips, p.name.toLowerCase(), false, () => {
        presets?.apply(structuredClone(p) as PresetData);
        renderMode();
      });
    }

    const io = document.createElement("div");
    io.className = "cinerae-mini-row";
    body.appendChild(io);
    const mini = (label: string, onClick: () => void, title = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-mini";
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        onClick();
      });
      io.appendChild(b);
      return b;
    };
    mini("sauver", () => presets?.saveFile(), "enregistrer l'état complet dans un fichier local");
    mini("charger", () => presetFileInput.click(), "charger un preset depuis un fichier");
    mini("→ A", () => {
      presets?.setSlot("A");
      renderMode();
    }, "capturer l'état courant dans A");
    mini("→ B", () => {
      presets?.setSlot("B");
      renderMode();
    }, "capturer l'état courant dans B");

    // The crossfade row: the VJ's base gesture, a def like any other.
    const xfadeDef = controls.find((d) => d.key === "xfade")!;
    const slotNames = presets?.slotNames ?? [undefined, undefined];
    const hint = document.createElement("div");
    hint.className = "cinerae-hint";
    hint.textContent = presets?.hasSlots
      ? `A · ${slotNames[0]}  ↔  B · ${slotNames[1]}`
      : "capturer → A, changer, capturer → B, puis morpher";
    body.appendChild(hint);
    renderDefRow(xfadeDef, body);

    const cap = document.createElement("div");
    cap.className = "cinerae-mini-row";
    body.appendChild(cap);
    const capBtn = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cinerae-mini";
      b.textContent = label;
      b.addEventListener("click", () => {
        hooks.onInteraction();
        onClick();
      });
      cap.appendChild(b);
      return b;
    };
    capBtn("png", () => hooks.onCapturePng());
    recButton = capBtn("● rec", () => {
      const on = hooks.onToggleRecord();
      recButton!.classList.toggle("recording", on);
      recButton!.textContent = on ? "■ stop" : "● rec";
    });
    capBtn("plein écran", () => hooks.onFullscreen());
  }

  // ----- look section -------------------------------------------------------
  function renderLook(body: HTMLElement) {
    const chips = document.createElement("div");
    chips.className = "cinerae-chips";
    body.appendChild(chips);
    for (const p of PALETTES) {
      makeChip(chips, p.label, state.colors.name === p.name, () =>
        hooks.onPaletteSelect(p.name)
      );
    }
    if (mode === "simple") return;

    // Gradient editor: 2..5 stops + background, straight into live colors.
    const grad = document.createElement("div");
    grad.className = "cinerae-colors";
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
      colorInput(stop, (c) => (state.colors.stops[i] = c), `couleur ${i + 1}`);
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
    bgLabel.textContent = "fond";
    grad.appendChild(bgLabel);
    colorInput(state.colors.bg, (c) => (state.colors.bg = c), "fond");

    for (const def of controls) {
      if (def.section !== "look") continue;
      if (!def.modes.includes(mode)) continue;
      if (def.visible && !def.visible()) continue;
      renderDefRow(def, body);
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
      .filter((d) => d.key !== "xfade")
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
    xf.textContent = "crossfade A ↔ B";
    select.appendChild(xf);
    for (const t of targetOptions()) {
      const o = document.createElement("option");
      o.value = t.key;
      o.textContent = t.label;
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
      "vitesse",
      0,
      1,
      0.005,
      () => rateToSlider(lfo.rate),
      (v) => (lfo.rate = sliderToRate(v)),
      () => `${lfo.rate.toFixed(2)} Hz`
    );
    makeSliderRow(
      body,
      "ampleur",
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
        "phase",
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
      "sync transitoires",
      () => lfo.sync,
      (next) => (lfo.sync = next),
      syncBox
    );
    if (simple) {
      // Curieux: one link per LFO, target + depth, nothing else to learn.
      const source = `lfo${i + 1}`;
      const link = mod.links.find((l) => l.source === source);
      makeTargetSelect(body, "cible", link?.target, true, (key) => {
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
          "profondeur",
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
    const simple = mode === "curieux";
    const shown = simple ? Math.min(2, mod.lfos.length) : mod.lfos.length;
    for (let i = 0; i < shown; i++) renderLfoBlock(body, i, simple);

    if (simple) return;

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
    title.textContent = "liens";
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
    add.textContent = "+ lien";
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
      o.textContent = "crossfade A ↔ B";
      dstSelect.appendChild(o);
    }
    for (const t of targetOptions()) {
      const o = document.createElement("option");
      o.value = t.key;
      o.textContent = t.label;
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
      "profondeur",
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
      b.textContent = "activer le midi";
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
      "apprentissage",
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
        ? "tourner un potard pour lier…"
        : "toucher le nom d'un réglage, puis tourner un potard"
      : "liaisons enregistrées dans les presets";
    body.appendChild(hint);
    // Bound controls, with an unbind cross.
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
  const imprintBody = () => sections.empreintes.body;

  const familyChips = document.createElement("div");
  familyChips.className = "cinerae-chips";
  const variantChips = document.createElement("div");
  variantChips.className = "cinerae-chips";

  const textRow = document.createElement("div");
  textRow.className = "cinerae-text-row";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.maxLength = 24;
  textInput.placeholder = "texte libre…";
  textInput.setAttribute("aria-label", "Texte de l'empreinte");
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
    "aléatoire au long silence",
    () => state.imprint.random,
    (next) => {
      state.imprint.random = next;
      hooks.onImprintParams();
    },
    randomSwitchBox
  );

  const FAMILY_LABELS: [ImprintFamily, string][] = [
    ["titre", "titre"],
    ["fond", "fond"],
    ["volume", "volumes"],
    ["forme", "formes"],
    ["math", "math"],
    ["ondes", "ondes"],
    ["texte", "texte"],
    ["camera", "caméra"],
    ["multi", "multi"],
  ];
  const VARIANT_LABELS: Record<string, string> = {
    sphere: "sphère",
    cube: "cube",
    cone: "cône",
    tore: "tore",
    cercle: "cercle",
    anneau: "anneau",
    carre: "carré",
    croix: "croix",
    spirale: "spirale",
    etoile: "étoile",
    lissajous: "lissajous",
    attracteur: "attracteur",
    chladni: "chladni",
    arbre: "arbre",
    sinus: "sinus",
    triangle: "triangle",
    melange: "mélange",
    gelee: "image gelée",
    silhouette: "silhouette",
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
    for (const [family, label] of FAMILY_LABELS) {
      makeChip(familyChips, label, sel.family === family, () =>
        hooks.onImprintSelect(family, IMPRINT_VARIANTS[family]?.[0] ?? "")
      );
    }
    if (mode === "pro") {
      makeChip(familyChips, "image…", sel.family === "image", () =>
        fileInput.click()
      );
    }
    const variants = IMPRINT_VARIANTS[sel.family];
    variantChips.style.display = variants ? "" : "none";
    if (variants) {
      for (const v of variants) {
        makeChip(variantChips, VARIANT_LABELS[v] ?? v, sel.variant === v, () =>
          hooks.onImprintSelect(sel.family, v)
        );
      }
    }
    textRow.style.display = sel.family === "texte" ? "" : "none";
    textInput.value = sel.text;
    randomSwitchBox.style.display = "";
    randomSwitch.sync();
    for (const def of controls) {
      if (def.section !== "empreintes") continue;
      if (!def.modes.includes(mode)) continue;
      if (def.visible && !def.visible()) continue;
      renderDefRow(def, body);
    }
  }

  // ----- glide (Chaos / Reset made visible on the sliders) ------------------
  // Cancelled by bumping the token — any user touch on a slider does so, so
  // the animation never fights the user's hand.
  let glideToken = 0;

  function glide(targets: { def: ControlDef; to: number }[]) {
    // Categorical selects snap instead of sweeping through foreign modes.
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
    modeButtons.forEach((b, i) => {
      const active = MODES[i]!.id === mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    mirrorSwitch.row.style.display = "";
    overlaySwitch.row.style.display = mode === "pro" ? "" : "none";
    imprintReturnSwitch.row.style.display = mode === "pro" ? "" : "none";
    overlaySwitch.sync();
    imprintReturnSwitch.sync();
    autoSwitch.sync();
    mirrorSwitch.sync();

    rowRefs = [];

    const visible: Partial<Record<SectionId, boolean>> = {
      presets: true,
      look: true,
      presence: mode !== "simple",
      empreintes: mode !== "simple",
      modulation: mode !== "simple",
      midi: mode === "pro",
      reglages: mode !== "simple",
    };
    for (const id of Object.keys(sections) as SectionId[]) {
      const { box, body } = sections[id];
      box.style.display = visible[id] ? "" : "none";
      box.classList.toggle("open", sectionOpen[id]);
      body.replaceChildren();
      if (!visible[id] || !sectionOpen[id]) continue;
      if (id === "presets") renderPresets(body);
      else if (id === "empreintes") renderImprints(body);
      else if (id === "look") renderLook(body);
      else if (id === "modulation") renderModulation(body);
      else if (id === "midi") renderMidi(body);
      else if (id === "presence") {
        for (const def of controls) {
          if (def.section !== "presence") continue;
          if (!def.modes.includes(mode)) continue;
          if (def.visible && !def.visible()) continue;
          renderDefRow(def, body);
        }
      } else if (id === "reglages") {
        for (const def of controls) {
          if (def.section !== "reglages") continue;
          if (!def.modes.includes(mode)) continue;
          if (def.visible && !def.visible()) continue;
          renderDefRow(def, body);
        }
      }
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
    /** The registry every engine shares: presets, crossfade, matrix, MIDI. */
    defs: controls as ParamRef[],
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
  };
}

export type Panel = ReturnType<typeof createPanel>;

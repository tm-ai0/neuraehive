// Settings panel. Three complexity modes (non-initié / curieux / pro),
// sensor switches, Chaos and Reset. Desktop: collapsible card top-right.
// Mobile (coarse pointer / narrow): bottom sheet with a large handle.
// Every control writes straight into live state read by the render loop —
// no rebuild, no debounce, no latency.
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
}

export interface PanelHooks {
  onSensor(kind: "camera" | "mic", enabled: boolean): void;
  onChaos(): void;
  onReset(): void;
  onInteraction(): void;
}

interface ControlDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  modes: PanelMode[];
  format?: (v: number) => string;
  get(): number;
  set(v: number): void;
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

export function createPanel(
  root: HTMLElement,
  state: PanelState,
  hooks: PanelHooks
) {
  let mode: PanelMode = "simple";
  let collapsed = false;
  let sensors = { camera: false, mic: false };

  const controls: ControlDef[] = [
    {
      key: "intensity",
      label: "intensité",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["simple"],
      format: percent,
      get: () => state.tuning.force / 3,
      set: (v) => (state.tuning.force = v * 3),
    },
    {
      key: "storm",
      label: "calme → tempête",
      min: 0,
      max: 1,
      step: 0.01,
      modes: ["simple"],
      format: percent,
      get: () => state.tuning.turbulence / 1.6,
      set: (v) => {
        state.tuning.turbulence = v * 1.6;
        state.tuning.viscosity = 6.5 - v * 5.7;
      },
    },
    {
      key: "force",
      label: "force du vent",
      min: 0,
      max: 3,
      step: 0.05,
      modes: ["curieux", "pro"],
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
      get: () => state.tuning.turbulence,
      set: (v) => (state.tuning.turbulence = v),
    },
    {
      key: "trails",
      label: "trainées",
      min: 0.6,
      max: 0.97,
      step: 0.005,
      modes: ["curieux", "pro"],
      format: (v) => percent((v - 0.6) / 0.37),
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
      format: (v) => percent(v / 2),
      get: () => state.tuning.cometGain,
      set: (v) => (state.tuning.cometGain = v),
    },
  ];

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
    toggle: (next: boolean) => void
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
    sensorsBox.appendChild(row);
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
  });
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset";
  resetButton.addEventListener("click", () => {
    hooks.onInteraction();
    hooks.onReset();
    renderMode();
  });
  actions.append(chaosButton, resetButton);

  const slidersBox = document.createElement("div");
  slidersBox.className = "cinerae-sliders";
  panel.appendChild(slidersBox);

  // ----- rendering ---------------------------------------------------------
  function renderMode() {
    modeButtons.forEach((b, i) => {
      const active = MODES[i]!.id === mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    mirrorSwitch.row.style.display = "";
    overlaySwitch.row.style.display = mode === "pro" ? "" : "none";
    overlaySwitch.sync();
    autoSwitch.sync();
    mirrorSwitch.sync();

    slidersBox.replaceChildren();
    for (const def of controls) {
      if (!def.modes.includes(mode)) continue;
      const row = document.createElement("label");
      row.className = "cinerae-row";
      const name = document.createElement("span");
      name.textContent = def.label;
      const readout = document.createElement("span");
      readout.className = "cinerae-value";
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(def.get());
      const show = () =>
        (readout.textContent = (def.format ?? plain)(def.get()));
      show();
      input.addEventListener("input", () => {
        def.set(Number(input.value));
        show();
        hooks.onInteraction();
      });
      row.append(name, input, readout);
      slidersBox.appendChild(row);
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

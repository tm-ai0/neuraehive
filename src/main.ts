// Boot and orchestration. The piece opens on the wordmark: particles converge
// from chaos and crystallize CINERÆ — the first crystallization. A choice
// dissolves everything; matter takes over. v0.7.2 — the stage itself is an
// instrument (touch parts the ash, a pinch folds the mirror, a vertical
// drag sets the light), GARDER makes a souvenir (PNG + 4 s loop + QR) and
// after 20 s without a touch the showcase cycles the scenes under the
// wordmark. Sensors start only from an explicit user gesture.
import { requestMicrophone, type MicSource } from "./audio";
import { requestCamera, type CameraFacing, type CameraSource } from "./camera";
import {
  DEFAULT_IMPRINT_SETTINGS,
  IMPRINT_VARIANTS,
  generateImprint,
  isAnimated,
  restingLife,
  sampleImageCloud,
  sampleTextCloud,
  silhouetteCloud,
  titleCloud,
  type ImprintCloud,
  type ImprintFamily,
  type ImprintLife,
  type ImprintSettings,
} from "./imprints";
import { capturePng, createRecorder, createStage } from "./capture";
import { t } from "./i18n";
import { createKeep } from "./keep";
import { applyPalette, PALETTES } from "./look";
import { createMidi, type Midi } from "./midi";
import { createModMatrix, type ModMatrix, type ParamRef } from "./modmatrix";
import { createPanel } from "./panel";
import { createPresets, type PresetData, type Presets } from "./presets";
import { createRenderer, DEFAULT_TUNING, type Renderer } from "./renderer";
import { sampleWordmark } from "./wordmark";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const overlayError = document.getElementById("overlay-error")!;
const fatal = document.getElementById("fatal")!;

const INTRO_FORM_TIME = 4.5; // s, load -> word
const DISSOLVE_TIME = 1.3; // s, word -> matter
const MOTION_STILL = 0.02; // camera motion below this counts as stillness
// v0.7.1d — the invariant becomes "at least 400 000 grains, fps held":
// auto quality climbs these tiers and keeps the highest one this machine
// holds; the Pro grain ceiling caps the climb.
const QUALITY_TIERS = [
  50_000, 120_000, 200_000, 400_000, 550_000, 700_000, 850_000, 1_000_000,
];

// A whole body at 3 m barely dents the frame-wide motion mean, so gesture
// detection also watches the moving AREA (fraction of texels that really
// move). The adaptive gesture gain grows as that area shrinks — a distant
// figure gets boosted toward what a hand at arm's length feels like — and
// drifts slowly home when the frame goes quiet.
const MOTION_AREA_PLAY = 0.003; // above this share of the frame, someone plays
const WIND_AREA_REF = 0.09; // moving area of a full sweep at arm's length
const WIND_AUTO_MAX = 4;
const MOTION_PROBE_MS = 250;
const DEBUG = new URLSearchParams(location.search).has("debug");
// v0.7.2 — the showcase: after this long without a touch (and nobody in
// front of the camera) the scenes cycle on their own, one every period.
const VITRINE_IDLE_MS = 20_000;
const VITRINE_PERIOD_MS = 20_000;
const KEEP_URL = "https://linktr.ee/thomasmaury";
const CAM_STORE = "cinerae-camera";

const AUDIO_DEFAULTS = {
  silenceThreshold: 0.02,
  bassGain: 1,
  trebleGain: 1,
  transientGain: 1,
  tonalThreshold: 0.75, // periodicity clarity above which a tone is "held"
};

// Chladni figures by rising pitch: one pair of plate modes per ~major third,
// growing in complexity as the tone climbs.
const CHLADNI_MODES: [number, number][] = [
  [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5],
  [3, 5], [4, 5], [3, 6], [5, 6], [4, 7], [5, 8],
];
const smooth01 = (t: number) => t * t * (3 - 2 * t);

const ANIM_INTERVAL = 140; // ms between re-samplings of a living imprint
const FOND_DAMP = 0.25; // audio reactivity left to the fond mode

// Chaos and the random mode draw from the families that need no asset or
// camera: every variant, flattened, plus a fresh multi seed. v0.7.1f — the
// title family left the pool: the wordmark belongs to the intro only.
const RANDOM_POOL: [ImprintFamily, string][] = [
  ["multi", ""],
  ...(["volume", "forme", "math", "fractale", "ondes"] as const).flatMap(
    (family) =>
      (IMPRINT_VARIANTS[family] ?? []).map(
        (variant) => [family, variant] as [ImprintFamily, string]
      )
  ),
];

function fail(message: string, error?: unknown) {
  console.error("[cinerae]", message, error ?? "");
  fatal.textContent = message;
  fatal.style.display = "flex";
}

async function boot() {
  let renderer: Renderer;
  let titleImprint: ImprintCloud;
  try {
    titleImprint = titleCloud(await sampleWordmark());
    renderer = await createRenderer(canvas, titleImprint);
  } catch (error) {
    fail(
      "WebGPU n'a pas pu démarrer. Il faut un navigateur récent (Chrome/Edge) avec un GPU actif.",
      error
    );
    return;
  }

  // ----- shared live state (read by the render loop every frame) -----------
  const audioState = { ...AUDIO_DEFAULTS };
  // Auto quality is on for everyone: the piece opens at 400 k and climbs
  // tier by tier as long as the GPU holds the frame rate, up to the Pro
  // grain ceiling; it steps down on its own wherever 60 fps breaks.
  const quality = { auto: true, cap: 1_000_000 };
  // v0.7.1c — one presence sensitivity knob replaces threshold + delay.
  // At 0.5 it lands exactly on the validated defaults (0.0015, 8 s).
  const behavior = {
    presenceSense: 0.5,
    tempoAuto: false,
    // v0.7.1f — "au silence": seconds of full silence before the piece
    // draws a new imprint on its own (the switch lives in scènes).
    silenceDelay: 24,
    // v0.7.2 — front or rear camera, remembered locally (the tablet demo
    // films with the rear one); the showcase switch.
    cameraFacing: ((): CameraFacing => {
      try {
        return localStorage.getItem(CAM_STORE) === "environment" ? "environment" : "user";
      } catch {
        return "user";
      }
    })(),
    vitrine: true,
  };
  const presenceThreshold = () =>
    0.0015 * Math.pow(4, 0.5 - behavior.presenceSense);
  const presenceDelay = () =>
    8 * Math.pow(2, (behavior.presenceSense - 0.5) * 2);
  const imprintSettings: ImprintSettings = structuredClone(
    DEFAULT_IMPRINT_SETTINGS
  );
  let imageImprint: ImprintCloud | undefined;
  let textImprint: ImprintCloud | undefined;
  let animTimer: number | undefined;
  let randomNext = behavior.silenceDelay;

  let phase: "intro" | "live" = "intro";
  let titleTarget = 1;
  let titleSpeed = 1 / INTRO_FORM_TIME;
  let mic: MicSource | undefined;
  let cameraSource: CameraSource | undefined;
  let crystal = 0;
  let lastActivity = performance.now();
  // v0.7.2 — the last TOUCH (stage, panel, keys): what the showcase waits
  // on. Sound and camera motion never count, a noisy hall must not keep
  // the showcase from starting, a visitor in front must (presence gate).
  let lastTouch = performance.now();
  // v0.7.1c — the dance: rotation/scale/ripple state integrated from music.
  let danceAngle = 0;
  let danceKick = 0;
  let dancePhase = 0;
  let dancePump = 0;
  let symAngle = 0;
  // v0.7.1e — the music MOVES the imprint, not only its contours: a springy
  // sway fed by the low mids, a jolt on each accent that springs back.
  let swayX = 0;
  let swayY = 0;
  let joltX = 0;
  let joltVX = 0;
  // The lightning: one whole-frame flash per strong accent, fast decay.
  let flashEnv = 0;
  // Tempo detection: recent strong-onset times, folded into 70-180 BPM.
  let beatTimes: number[] = [];
  // v0.7.1d — the imprint life, integrated every frame from the bands and
  // read by the generators at each 7 Hz re-sampling. Every field is smooth.
  const life: ImprintLife = restingLife(0);
  let lifeTiltVel = 0;
  let lifeWindVel = 0;
  let lifeFoldVel = 0;
  let prevTransient = 0;
  // Chladni imprint: mode pair follows the music's spectral balance, with a
  // sand transition (blend) between two plates.
  let chlIdx = 4;
  let chlPendIdx = -1;
  let chlPendSince = 0;
  // Accent shockwave: retriggered on each strong rising transient.
  let shockT = Infinity;
  let shockStrength = 0;
  let motionAvg = 0;
  let motionArea = 0;
  let windAuto = 1;
  let presenceEnv = 0;
  let presenceSeen = -Infinity;
  // v0.7.1g — the welcome: armed when the camera wakes, fired on the first
  // presence seen — two seconds where all the dust rushes to the body.
  let welcomeArmed = false;
  let welcomeStart = -Infinity;
  let handTarget = 0;
  const cameraMoving = () =>
    motionAvg > MOTION_STILL || motionArea > MOTION_AREA_PLAY;
  let chaosStart = -Infinity;
  let gustStart = -Infinity;
  let gustNext = performance.now() + (10 + Math.random() * 10) * 1000;
  let gustDirX = 1;
  let gustDirY = 0;
  let cym = 0;
  let sustain = 0;
  let cymIdx = 0;
  let pendingIdx = -1;
  let pendingSince = 0;
  let autoTier = QUALITY_TIERS.indexOf(renderer.tuning.count);
  if (autoTier < 0) autoTier = 2;
  let slowSince: number | undefined;
  let fastSince: number | undefined;

  const markActivity = () => {
    lastActivity = performance.now();
  };
  const markTouch = () => {
    lastActivity = performance.now();
    lastTouch = lastActivity;
    if (vitrineOn) leaveVitrine();
  };

  // ----- GARDER: the souvenir -----------------------------------------------
  // The stage keeps living for the 4 s loop, then freezes; the mark and the
  // QR sit on the frozen image until REPRENDRE. Both files land in the
  // local downloads, nothing leaves the machine.
  const keep = createKeep(canvas, { url: KEEP_URL, mark: "cineræ", loopSeconds: 4 });
  const keepBox = document.createElement("section");
  keepBox.className = "cinerae-keep";
  keepBox.setAttribute("aria-label", "Cineræ");
  keepBox.innerHTML =
    `<div class="cinerae-toast" role="status"><span class="cinerae-toast-text"></span><button type="button" class="cinerae-toast-btn"></button></div>` +
    `<div class="cinerae-mark" aria-hidden="true">cineræ</div>` +
    `<div class="cinerae-qr">${keep.qrSvg()}<span>linktr.ee/thomasmaury</span></div>`;
  document.body.appendChild(keepBox);
  const keepText = keepBox.querySelector(".cinerae-toast-text") as HTMLElement;
  const keepResume = keepBox.querySelector(".cinerae-toast-btn") as HTMLButtonElement;
  let keepActive = false;
  let keepTimeBefore = 1;
  const applyKeepLanguage = () => {
    keepResume.textContent = t("btn.resume");
  };
  keepResume.addEventListener("click", () => {
    if (!keepActive) return;
    keepActive = false;
    keepBox.classList.remove("on");
    panel.writeDef("timeScale", keepTimeBefore || 1);
    panel.refresh();
    markTouch();
  });
  async function keepSouvenir() {
    if (keepActive) return;
    keepActive = true;
    if (vitrineOn) leaveVitrine();
    panel.collapse();
    keepBox.classList.remove("vitrine");
    keepBox.classList.add("on");
    keepResume.style.display = "none";
    keepText.textContent = t("keep.recording");
    const result = await keep.capture((phase) => {
      if (phase === "saving") {
        // The loop is in the can: freeze the image the PNG will keep.
        keepTimeBefore = renderer.tuning.timeScale;
        panel.writeDef("timeScale", 0);
        keepText.textContent = t("keep.saving");
      }
    });
    if (!keepActive) return; // resumed meanwhile
    keepText.textContent = result.png && result.webm
      ? t("keep.saved")
      : result.png
        ? t("keep.savedPng")
        : t("keep.failed");
    keepResume.style.display = "";
  }

  // ----- VITRINE: the showcase ---------------------------------------------
  // Twenty seconds without a touch and nobody in front: the scenes cycle,
  // one every twenty seconds, the wordmark held in the dust, the QR as a
  // watermark. Any touch leaves it and gives the imprint back.
  let vitrineOn = false;
  const vitrineTitle: ImprintCloud = { ...titleImprint, coverage: 0.3, offsetY: 0.5 };
  let vitrineNext = 0;
  let vitrineIdx = 0;
  let vitrineImprint: { family: ImprintFamily; variant: string } | undefined;
  const enterVitrine = () => {
    vitrineOn = true;
    vitrineImprint = { family: imprintSettings.family, variant: imprintSettings.variant };
    keepBox.classList.add("vitrine", "on");
    panel.collapse();
    vitrineStep();
  };
  const vitrineStep = () => {
    const scenes = presets?.builtIns ?? [];
    if (scenes.length) {
      const scene = scenes[vitrineIdx % scenes.length]!;
      vitrineIdx++;
      presets?.apply(structuredClone(scene) as PresetData);
    }
    // The title in dust: the wordmark is the imprint of the showcase.
    void applyImprint("titre", "", { silent: true });
    vitrineNext = performance.now() + VITRINE_PERIOD_MS;
  };
  const leaveVitrine = () => {
    vitrineOn = false;
    keepBox.classList.remove("vitrine");
    if (!keepActive) keepBox.classList.remove("on");
    const back = vitrineImprint ?? { family: "fond" as ImprintFamily, variant: "" };
    vitrineImprint = undefined;
    void applyImprint(back.family, back.variant, { silent: true });
  };

  // ----- engines (created after the panel; hooks close over these) ---------
  let mod: ModMatrix | undefined;
  let midi: Midi | undefined;
  let presets: Presets | undefined;
  let modImprintDirty = false;
  const dirtyKeys = new Set<string>();
  const recorder = createRecorder(canvas);
  const stage = createStage();

  // Every authored write (preset, crossfade, MIDI) goes through here so the
  // modulation centers follow the hand and the panel rows stay in sync.
  const writeParam = (def: ParamRef, value: number) => {
    def.set(value);
    mod?.onAuthored(def.key, value);
    if (def.imprint) modImprintDirty = true;
    dirtyKeys.add(def.key);
  };

  // ----- panel --------------------------------------------------------------
  const panel = createPanel(
    document.body,
    {
      tuning: renderer.tuning,
      audio: audioState,
      quality,
      behavior,
      imprint: imprintSettings,
      colors: renderer.look,
    },
    {
      onSensor(kind, enabled) {
        if (kind === "camera") void (enabled ? startCamera() : stopCamera());
        else void (enabled ? startMic() : stopMic());
      },
      onCameraFacing(facing) {
        try {
          localStorage.setItem(CAM_STORE, facing);
        } catch {}
        if (cameraSource) {
          void stopCamera().then(() => startCamera());
        }
      },
      onKeep() {
        void keepSouvenir();
      },
      onChaos() {
        chaosStart = performance.now();
        // One time out of two, chaos also draws a new imprint.
        if (Math.random() < 0.5) {
          const [family, variant] =
            RANDOM_POOL[(Math.random() * RANDOM_POOL.length) | 0]!;
          void applyImprint(family, variant);
        }
      },
      onReset() {
        // The sliders glide home from the panel; here everything else comes
        // back to the full opening state — LFOs, links, tempo, macros,
        // imprint, colors. Only the learned MIDI bindings survive (v0.7.1e).
        renderer.resetMatter();
        crystal = 0;
        renderer.tuning.mirror = DEFAULT_TUNING.mirror;
        renderer.tuning.rawCam = 0;
        behavior.presenceSense = 0.5;
        behavior.tempoAuto = false;
        behavior.silenceDelay = 24;
        behavior.vitrine = true;
        mod?.load(undefined);
        beatTimes = [];
        applyPalette(renderer.look, PALETTES[0]!);
        Object.assign(
          imprintSettings,
          structuredClone(DEFAULT_IMPRINT_SETTINGS)
        );
        textImprint = undefined;
        void applyImprint("fond", "");
      },
      onInteraction: markTouch,
      onImprintSelect(family, variant) {
        void applyImprint(family, variant);
      },
      onImprintText(text) {
        imprintSettings.text = text;
        textImprint = undefined;
        void applyImprint("texte", "");
      },
      onImprintFile(file) {
        void importImage(file);
      },
      onImprintParams() {
        // A fine parameter moved (or the random switch): refresh the cloud
        // of the current generator-driven family right away.
        if (generateImprint(imprintSettings, sampleContext()) !== null)
          void applyImprint(imprintSettings.family, imprintSettings.variant);
      },
      // ---- v0.6 -----------------------------------------------------------
      onCrossfade(value) {
        presets?.applyCrossfade(value);
      },
      getXfade: () => presets?.xfade ?? 0,
      onPaletteSelect(name) {
        const palette = PALETTES.find((p) => p.name === name);
        if (!palette) return;
        applyPalette(renderer.look, palette);
        const blendDef = panel.defs.find((d) => d.key === "blendMode");
        if (blendDef) writeParam(blendDef, palette.blend);
        panel.refresh();
      },
      onCapturePng() {
        void capturePng(canvas).then((ok) => {
          if (!ok) panel.setStatus(t("st.captureFail"));
        });
      },
      onToggleRecord: () => recorder.toggle(),
      onFullscreen() {
        void stage.toggleFullscreen();
      },
      onLang() {
        applyLanguage();
        updateStatus();
      },
      getPresets: () => presets,
      getMod: () => mod,
      getMidi: () => midi,
    }
  );

  // ----- modulation, MIDI, presets (share the panel's def registry) --------
  mod = createModMatrix(panel.defs);
  midi = createMidi(panel.defs, {
    onWrite(key, value) {
      mod?.onAuthored(key, value);
      dirtyKeys.add(key);
    },
    onChange() {
      panel.refresh();
    },
  });
  presets = createPresets(panel.defs, renderer.look, imprintSettings, {
    writeParam,
    baseValue: (key) => mod?.centerOf(key),
    applyImprint(family, variant, text) {
      if (family === "texte") {
        imprintSettings.text = text;
        textImprint = undefined;
      }
      void applyImprint(family, variant, { silent: true, quiet: true });
    },
    getMod: () => mod?.serialize() ?? { lfos: [], links: [] },
    setMod: (data) => mod?.load(data),
    getMidi: () => midi?.serialize() ?? {},
    setMidi: (data) => midi?.load(data),
    onApplied() {
      panel.refresh();
    },
  });
  panel.refresh();

  // ----- imprints -----------------------------------------------------------
  function sampleContext() {
    return {
      time: performance.now() / 1000,
      screenAspect: window.innerWidth / Math.max(1, window.innerHeight),
      life,
    };
  }

  function syncImprintAnimation() {
    const animated = isAnimated(imprintSettings);
    if (animated && animTimer === undefined) {
      animTimer = window.setInterval(() => {
        const cloud = generateImprint(imprintSettings, sampleContext());
        if (cloud) renderer.setImprint(cloud, "shape");
      }, ANIM_INTERVAL);
    } else if (!animated && animTimer !== undefined) {
      window.clearInterval(animTimer);
      animTimer = undefined;
    }
  }

  // Modulated imprint parameters (an LFO on a drawn wave) re-sample the
  // cloud on the same slow cadence as living imprints — the particles' own
  // physics smooth the steps, and the frame never pays for the sampling.
  window.setInterval(() => {
    if (!modImprintDirty) return;
    modImprintDirty = false;
    const cloud = generateImprint(imprintSettings, sampleContext());
    if (cloud) renderer.setImprint(cloud, "shape");
  }, ANIM_INTERVAL);

  async function applyImprint(
    family: ImprintFamily,
    variant: string,
    opts: { silent?: boolean; quiet?: boolean } = {}
  ) {
    const s = imprintSettings;
    if (family === "titre") {
      s.family = "titre";
      s.variant = "";
      // The showcase spreads the word over a third of the screen height:
      // an imprint's grain budget on the intro's small cap blows to white.
      renderer.setImprint(vitrineOn ? vitrineTitle : titleImprint, "shape");
    } else if (family === "camera" && variant === "silhouette") {
      if (!cameraSource) {
        panel.setStatus(t("st.camInactive"));
        panel.refresh();
        return;
      }
      const luma = await renderer.readLuma();
      const cloud = silhouetteCloud(luma.data, luma.width, luma.height);
      if (!cloud) {
        panel.setStatus(t("st.noSilhouette"));
        panel.refresh();
        return;
      }
      s.family = "camera";
      s.variant = "silhouette";
      renderer.setImprint(cloud, "shape");
    } else if (family === "camera") {
      // The frozen live-luminance image: the historical behavior of silence,
      // kept as its own imprint. Idle re-forms the wordmark, as before.
      s.family = "camera";
      s.variant = "gelee";
      renderer.setImprint(titleImprint, "camera");
    } else if (family === "texte") {
      const cloud = textImprint ?? (await sampleTextCloud(s.text));
      if (!cloud) {
        panel.setStatus(t("st.emptyText"));
        panel.refresh();
        return;
      }
      textImprint = cloud;
      s.family = "texte";
      s.variant = "";
      renderer.setImprint(cloud, "shape");
    } else if (family === "image") {
      if (!imageImprint) {
        panel.setStatus(t("st.dropImage"));
        panel.refresh();
        return;
      }
      s.family = "image";
      s.variant = "";
      renderer.setImprint(imageImprint, "shape");
    } else {
      s.family = family;
      s.variant = variant;
      const cloud = generateImprint(s, sampleContext());
      if (cloud) renderer.setImprint(cloud, "shape");
    }
    syncImprintAnimation();
    // quiet: called from the crossfade or a preset apply mid-gesture — the
    // caller refreshes the panel itself, never mid-drag.
    if (!opts.quiet) panel.refresh();
    if (!opts.silent) markActivity();
  }

  async function importImage(file: File) {
    try {
      const cloud = await sampleImageCloud(file);
      if (!cloud) {
        panel.setStatus(t("st.badImage"));
        return;
      }
      imageImprint = cloud;
      await applyImprint("image", "");
    } catch (error) {
      console.warn("[cinerae] import image:", error);
      panel.setStatus(t("st.unreadableImage"));
    }
  }

  // Drag & drop d'une image, partout sur la scène. Tout reste local.
  const dropHint = document.getElementById("drop-hint")!;
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropHint.classList.add("visible");
  });
  window.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropHint.classList.remove("visible");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dropHint.classList.remove("visible");
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) void importImage(file);
  });

  // Multi is the only family laid out against the screen aspect: re-seed it
  // when the window really changes shape.
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (imprintSettings.family === "multi")
        void applyImprint("multi", "", { silent: true });
    }, 300);
  });

  // v0.7.1f — the header carries fps and grains, the switches carry the
  // sensor states: the status line only speaks when a sensor is missing.
  const updateStatus = () => {
    const missing: string[] = [];
    if (!cameraSource) missing.push(t("st.camOff"));
    if (!mic) missing.push(t("st.micOff"));
    panel.setStatus(missing.join(" · "));
    panel.setSensors(Boolean(cameraSource), Boolean(mic));
  };

  // Every visible word outside the panel follows the language too.
  const applyLanguage = () => {
    document.getElementById("overlay-text")!.textContent = t("overlay.intro");
    document.getElementById("start-full")!.textContent = t("overlay.startFull");
    document.getElementById("start-audio")!.textContent = t("overlay.startAudio");
    document.getElementById("drop-hint")!.textContent = t("overlay.drop");
    applyKeepLanguage();
  };
  applyLanguage();

  // ----- sensors (each start is triggered by an explicit click) ------------
  async function startCamera() {
    if (cameraSource) return;
    try {
      cameraSource = await requestCamera(behavior.cameraFacing);
      renderer.attachCamera(cameraSource);
      welcomeArmed = true;
    } catch (error) {
      console.warn("[cinerae] caméra refusée ou indisponible:", error);
      panel.setStatus(t("st.camRefused"));
    }
    updateStatus();
  }
  async function stopCamera() {
    renderer.detachCamera();
    cameraSource?.dispose();
    cameraSource = undefined;
    motionAvg = 0;
    motionArea = 0;
    windAuto = 1;
    welcomeArmed = false;
    updateStatus();
  }
  async function startMic() {
    if (mic) return;
    try {
      mic = await requestMicrophone();
    } catch (error) {
      console.warn("[cinerae] micro refusé ou indisponible:", error);
      panel.setStatus(t("st.micRefused"));
    }
    updateStatus();
  }
  async function stopMic() {
    mic?.dispose();
    mic = undefined;
    renderer.dynamics.bass = 0;
    renderer.dynamics.lowMid = 0;
    renderer.dynamics.mid = 0;
    renderer.dynamics.treble = 0;
    renderer.dynamics.transient = 0;
    renderer.dynamics.voice = 0;
    renderer.dynamics.shockAmp = 0;
    cym = 0;
    sustain = 0;
    renderer.dynamics.cymatic = 0;
    updateStatus();
  }

  // ----- intro flow ---------------------------------------------------------
  const introTimer = window.setTimeout(() => {
    if (phase === "intro") overlay.classList.add("shown");
  }, 2600);

  function beginLive(withCamera: boolean) {
    if (phase !== "intro") return;
    phase = "live";
    window.clearTimeout(introTimer);
    overlay.classList.remove("shown");
    overlay.classList.add("gone");
    titleTarget = 0;
    titleSpeed = 1 / DISSOLVE_TIME;
    renderer.dynamics.touchStrength = 0; // a lingering intro hover never seeds
    markTouch();
    overlayError.textContent = "";
    panel.collapse();
    void (async () => {
      if (withCamera) await startCamera();
      await startMic();
    })();
  }
  document.getElementById("start-full")!.addEventListener("click", () => beginLive(true));
  document.getElementById("start-audio")!.addEventListener("click", () => beginLive(false));

  // ----- stage gestures -----------------------------------------------------
  // v0.7.2 — the stage is an instrument. One finger: a hand in the ash, the
  // grains part under it (the shader's radial shove, now on the whole
  // screen, live included). Two fingers: a pinch folds the mirror, its
  // spread the number of axes. One finger dragged vertically: the light,
  // night at the bottom, day at the top. Every gesture is one journal
  // entry, so ↶ and Z bring the image back.
  const setTouch = (x: number, y: number, strength: number) => {
    renderer.dynamics.touchX = x / window.innerWidth;
    renderer.dynamics.touchY = y / window.innerHeight;
    renderer.dynamics.touchStrength = strength;
  };
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let pinch: { d0: number; base: number } | undefined;
  let drag: { base: number } | undefined;
  let gestureArmed = false;
  const EDGE_PX = 28;
  const readDef = (key: string) => panel.defs.find((d) => d.key === key)?.get() ?? 0;
  canvas.addEventListener("pointerdown", (event) => {
    markTouch();
    // The right edge belongs to the panel's swipe: never a touch there.
    if (event.clientX > window.innerWidth - EDGE_PX) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {}
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY,
    });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d0: Math.max(24, Math.hypot(a!.x - b!.x, a!.y - b!.y)), base: readDef("miroir") };
      drag = undefined;
      renderer.dynamics.touchStrength = 0;
      if (!gestureArmed) {
        panel.pushGesture();
        gestureArmed = true;
      }
    } else if (pointers.size === 1) {
      setTouch(event.clientX, event.clientY, 1);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (phase === "intro") {
      setTouch(event.clientX, event.clientY, 0.9);
      return;
    }
    const p = pointers.get(event.pointerId);
    if (!p) return;
    markTouch();
    p.x = event.clientX;
    p.y = event.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      // Spreading two fingers over ~a third of the screen adds 8 axes.
      const axes = pinch.base + ((d - pinch.d0) / (window.innerWidth * 0.35)) * 8;
      panel.gestureWrite("miroir", Math.max(0, Math.min(8, axes)));
      return;
    }
    if (pointers.size === 1) {
      setTouch(event.clientX, event.clientY, 1);
      const dy = p.y0 - p.y;
      const dx = Math.abs(p.x - p.x0);
      if (!drag && Math.abs(dy) > 30 && Math.abs(dy) > 1.5 * dx) {
        drag = { base: readDef("eclipse") };
        if (!gestureArmed) {
          panel.pushGesture();
          gestureArmed = true;
        }
      }
      if (drag) {
        // The full light range over ~60 % of the screen height.
        const v = drag.base + dy / (window.innerHeight * 0.6);
        panel.gestureWrite("eclipse", Math.max(0, Math.min(1, v)));
      }
    }
  });
  const endTouch = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = undefined;
    if (pointers.size === 0) {
      drag = undefined;
      gestureArmed = false;
      renderer.dynamics.touchStrength = 0;
    }
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);
  canvas.addEventListener("pointerleave", (event) => {
    if (phase === "intro") renderer.dynamics.touchStrength = 0;
    else endTouch(event);
  });

  // ----- keyboard shortcuts (documented in the panel's help) ---------------
  let timeBefore = 1;
  window.addEventListener("keydown", (event) => {
    markTouch();
    const el = event.target as HTMLElement | null;
    if (el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
    if (phase !== "live") return;
    switch (event.key.toLowerCase()) {
      case "f":
        void stage.toggleFullscreen();
        break;
      case "c":
        panel.chaos();
        break;
      case "z":
        panel.undoChaos();
        break;
      case "r":
        panel.reset();
        break;
      case "p":
        void capturePng(canvas).then((ok) => {
          if (!ok) panel.setStatus(t("st.captureFail"));
        });
        break;
      case "v":
        recorder.toggle();
        break;
      case " ": {
        event.preventDefault();
        const now = renderer.tuning.timeScale;
        if (Math.abs(now) < 0.02) {
          panel.writeDef("timeScale", timeBefore || 1);
        } else {
          timeBefore = now;
          panel.writeDef("timeScale", 0);
        }
        panel.refresh();
        break;
      }
      case "escape":
        panel.toggleCollapsed();
        break;
    }
  });

  // ----- camera motion probe -----------------------------------------------
  // Feeds the stillness gate (idle return, recrystallization) and the
  // adaptive gesture gain, so it runs fast enough to catch a single sweep.
  let probing = false;
  window.setInterval(() => {
    if (!cameraSource || probing) return;
    probing = true;
    renderer
      .readMotion()
      .then(({ avg, area }) => {
        motionAvg = avg;
        motionArea = area;
        // Presence watches its own, lower threshold: a standing person's
        // breath and sway keep the portrait alive without counting as play.
        if (area > presenceThreshold()) presenceSeen = performance.now();
        // Hands: fast movement over a small area. A whole body sweeps wide
        // and slow, a standing sway is smaller still — a hand is in between
        // and quick, with high energy per moving texel.
        const speedPer = avg / Math.max(area, 1e-4);
        handTarget =
          Math.max(0, Math.min(1, (area - 0.004) / 0.006)) *
          Math.max(0, Math.min(1, (0.06 - area) / 0.04)) *
          Math.min(1, speedPer / 0.45);
        if (cameraMoving()) {
          markActivity();
          const desired = Math.min(
            WIND_AUTO_MAX,
            Math.max(1, Math.sqrt(WIND_AREA_REF / Math.max(area, 1e-4)))
          );
          windAuto += (desired - windAuto) * 0.12;
        } else {
          windAuto += (1 - windAuto) * 0.004;
        }
        if (DEBUG) {
          document.documentElement.dataset.cinerae =
            `m=${motionAvg.toFixed(4)} a=${motionArea.toFixed(4)} ` +
            `g=${windAuto.toFixed(2)} c=${crystal.toFixed(2)} ` +
            `s=${((performance.now() - lastActivity) / 1000).toFixed(1)} ` +
            `p=${presenceEnv.toFixed(2)} ` +
            `h=${renderer.dynamics.hand.toFixed(2)} ` +
            `v=${renderer.dynamics.voice.toFixed(2)} ` +
            `d=${danceAngle.toFixed(2)}`;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        probing = false;
      });
  }, MOTION_PROBE_MS);

  // ----- per-frame orchestration -------------------------------------------
  let last = performance.now();
  let panelSyncAcc = 0;
  let bandsAcc = 0;
  // v0.7.1e — ?debug measurement harness state (filled below when DEBUG).
  const kickState: {
    until: number;
    prev?: ImageData;
    countdown: number;
    best: number;
    results: number[];
    grab?: () => ImageData;
    diff?: (a: ImageData, b: ImageData) => number;
  } = { until: 0, countdown: 0, best: 0, results: [] };
  let kickPrevT = 0;
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // Presence envelope: someone stands in the frame when the moving area
    // crossed the threshold recently. The asymmetric smoothing gathers the
    // portrait in about a second and disperses it gently, and keeps sensor
    // noise from flickering it. v0.7.1g — the fond family no longer mutes
    // it: fond is the opening default since v0.7.1f, and the piece must
    // show the visitor from the first second without touching a slider.
    const present =
      cameraSource !== undefined &&
      (now - presenceSeen) / 1000 < presenceDelay();
    const presTau = present ? 0.45 : 1.4;
    presenceEnv += ((present ? 1 : 0) - presenceEnv) * (1 - Math.exp(-dt / presTau));
    // v0.7.1g — the welcome, the piece's first gesture: on the first
    // presence after the camera wakes, the whole reserve rushes onto the
    // body for two seconds, then lets go (the renderer widens the corps
    // share by this envelope, all on the CPU).
    if (welcomeArmed && present) {
      welcomeStart = now;
      welcomeArmed = false;
    }
    const wT = (now - welcomeStart) / 1000;
    const welcome =
      wT < 2
        ? smooth01(Math.min(1, wT / 0.3))
        : Math.max(0, 1 - smooth01(Math.min(1, (wT - 2) / 1.2)));
    renderer.dynamics.welcome = welcome;
    // v0.7.1c — presence and imprint cohabit: the corps keeps its grains,
    // the imprint takes the rest (the shader splits them), so the envelope
    // no longer dies when the crystal holds.
    renderer.dynamics.presence =
      Math.max(presenceEnv, welcome) * (1 - renderer.dynamics.titleMode);
    // Hands ride the presence: fast small motion warms and brightens where
    // it happens, and fades out in under a second when the hands rest.
    renderer.dynamics.hand +=
      (handTarget * presenceEnv - renderer.dynamics.hand) *
      (1 - Math.exp(-dt / 0.4));

    // Audio analysis -> dynamics, with the Pro band gains applied. The two
    // mid bands ride the mean of the bass/treble gains so the Anima
    // "réactivité" macro scales the whole spectrum.
    if (mic) {
      const a = mic.update(dt);
      const midGain = (audioState.bassGain + audioState.trebleGain) / 2;
      renderer.dynamics.bass = Math.min(1.5, a.bass * audioState.bassGain);
      renderer.dynamics.lowMid = Math.min(1.5, a.lowMid * midGain);
      renderer.dynamics.mid = Math.min(1.5, a.mid * midGain);
      renderer.dynamics.treble = Math.min(1.5, a.treble * audioState.trebleGain);
      renderer.dynamics.transient = Math.min(
        1.5,
        a.transient * audioState.transientGain
      );
      if (a.level >= audioState.silenceThreshold) markActivity();

      // Voice envelope: speaking loosens the corps' grip in a quarter of a
      // second; going quiet lets it tighten back over a slow breath.
      const voiceT = Math.min(
        1,
        Math.max(0, (a.level - audioState.silenceThreshold) * 12)
      );
      const vTau = voiceT > renderer.dynamics.voice ? 0.25 : 1.2;
      renderer.dynamics.voice +=
        (voiceT - renderer.dynamics.voice) * (1 - Math.exp(-dt / vTau));

      // v0.7.1c — sound no longer melts the imprint: the music animates it
      // instead (dance envelope below). Nothing to do here anymore.

      // Cymatics: a held tonal sound (note, drone, sung voice) builds the
      // figure progressively; silence or a percussive attack dissolves it.
      const tonal =
        a.pitch > 0 &&
        a.tonality > audioState.tonalThreshold &&
        a.level >= audioState.silenceThreshold &&
        a.transient < 0.5;
      if (tonal) {
        sustain += dt;
        const midi = 69 + 12 * Math.log2(a.pitch / 440);
        const idx = Math.max(
          0,
          Math.min(CHLADNI_MODES.length - 1, Math.floor((midi - 45) / 4))
        );
        // Hysteresis: the figure only follows a pitch that settles, so a
        // vibrato does not flicker between neighbouring patterns.
        if (idx !== cymIdx) {
          if (idx !== pendingIdx) {
            pendingIdx = idx;
            pendingSince = now;
          } else if (now - pendingSince > 250) {
            cymIdx = idx;
          }
        } else {
          pendingIdx = -1;
        }
      } else {
        sustain = Math.max(0, sustain - dt * 4);
      }
      cym =
        tonal && sustain > 0.35
          ? Math.min(1, cym + dt / 2.2)
          : Math.max(0, cym - dt / (a.transient > 0.4 ? 0.3 : 0.8));
      renderer.dynamics.cymatic = cym;
      renderer.dynamics.cymM = CHLADNI_MODES[cymIdx]![0];
      renderer.dynamics.cymN = CHLADNI_MODES[cymIdx]![1];
    }
    // The fond imprint is a resting background: the matter breathes alone,
    // camera and sound barely reach it, nothing crystallizes.
    const fond = imprintSettings.family === "fond";
    renderer.dynamics.reactivity = fond ? 0.3 : 1;
    if (fond) {
      renderer.dynamics.bass *= FOND_DAMP;
      renderer.dynamics.lowMid *= FOND_DAMP;
      renderer.dynamics.mid *= FOND_DAMP;
      renderer.dynamics.treble *= FOND_DAMP;
      renderer.dynamics.transient *= FOND_DAMP;
      renderer.dynamics.cymatic *= FOND_DAMP;
      crystal = Math.max(0, crystal - dt * 1.2);
    }

    // Modulation matrix: a few dozen CPU ops per frame, the image never
    // pays. Sources: LFOs, the sound bands, the gesture energy.
    if (mod) {
      const gesture = Math.min(
        1,
        motionArea / WIND_AREA_REF + renderer.dynamics.touchStrength * 0.6
      );
      if (
        mod.update(dt, {
          bass: renderer.dynamics.bass,
          treble: renderer.dynamics.treble,
          transient: renderer.dynamics.transient,
          gesture,
        })
      ) {
        modImprintDirty = true;
      }
      for (const key of mod.activeTargets()) dirtyKeys.add(key);
    }

    // A strong clap wipes the cendre mémoire clean.
    if (
      renderer.tuning.memoryGain > 0.001 &&
      renderer.dynamics.transient > 0.85
    ) {
      renderer.dynamics.memoryClear = 1;
    }

    // Panel rows driven from outside (LFO, MIDI, crossfade) follow at ~7 Hz.
    panelSyncAcc += dt;
    if (panelSyncAcc > 0.15 && dirtyKeys.size) {
      panelSyncAcc = 0;
      panel.syncValues(dirtyKeys);
      dirtyKeys.clear();
    }

    // v0.7.1c — the chosen imprint forms on its own and never melts with
    // sound: the music animates it instead. Only the fond family holds no
    // shape; a present body or the returning wordmark still reclaim the
    // matter, and a passing gesture erodes it locally in the shader.
    if (phase === "live" && imprintSettings.family !== "fond") {
      crystal = Math.min(1, crystal + dt / 6);
    }
    // Only the returning wordmark reclaims the matter globally; a person
    // shares the reserve with the imprint instead of melting it.
    crystal = Math.max(0, crystal - dt * renderer.dynamics.titleMode * 0.6);
    renderer.dynamics.crystal = crystal;

    // Random mode ("au silence"): a long lull (no sound, no gesture, no
    // touch) draws a new imprint; the matter glides to the new targets.
    const idleS = (now - lastActivity) / 1000;
    if (idleS < 1) randomNext = behavior.silenceDelay;
    else if (imprintSettings.random && phase === "live" && idleS > randomNext) {
      randomNext += behavior.silenceDelay;
      const current = `${imprintSettings.family}/${imprintSettings.variant}`;
      const picks = RANDOM_POOL.filter(([f, v]) => `${f}/${v}` !== current);
      const [family, variant] = picks[(Math.random() * picks.length) | 0]!;
      void applyImprint(family, variant, { silent: true });
    }

    // v0.7.1c/e — the dance envelope. Without music: a slow turn, a gentle
    // breath, a faint ripple. With music: bass pumps the scale, transients
    // kick the spin, treble shimmers the ripple — and the whole imprint
    // MOVES: the low mids sway it, each accent jolts it sideways and the
    // spring brings it back. "Intensité son" is the one dose since v0.7.1e;
    // the authored imprint transform (impX/impY/impRot/impScale — registry
    // defs, so LFOs, macros, Chaos, scenes and MIDI drive them) composes
    // with the danced motion here, on the CPU, at zero shader cost.
    {
      const d = renderer.dynamics;
      const tn = renderer.tuning;
      const mus = tn.soundFx * 0.75;
      danceKick = Math.max(danceKick * Math.exp(-dt * 3), d.transient * 1.1);
      danceAngle += dt * (0.03 + (d.bass * 0.4 + danceKick * 0.9) * mus);
      dancePhase += dt * (0.25 + d.treble * 2.0 * mus);
      dancePump +=
        (d.bass * 0.09 * mus - dancePump) * (1 - Math.exp(-dt / 0.12));
      const swayTX =
        Math.sin((now / 1000) * 0.9 + dancePhase * 0.13) *
        0.055 * Math.min(1, d.lowMid * 1.3) * mus;
      const swayTY =
        Math.cos((now / 1000) * 0.7 + dancePhase * 0.09) *
        0.04 * Math.min(1, d.lowMid * 1.3) * mus;
      swayX += (swayTX - swayX) * (1 - Math.exp(-dt / 0.35));
      swayY += (swayTY - swayY) * (1 - Math.exp(-dt / 0.35));
      // Accent jolt: a damped spring, knocked in the life block below.
      joltVX += (-joltX * 28 - joltVX * 5.5) * dt;
      joltX += joltVX * dt;
      // The wordmark never dances (v0.7.1c): as the showcase's imprint it
      // holds its angle, the music still breathes its scale and sway.
      const ang = (imprintSettings.family === "titre" ? 0 : danceAngle) + tn.impRot;
      d.danceCos = Math.cos(ang);
      d.danceSin = Math.sin(ang);
      d.danceScale =
        (1 + Math.sin((now / 1000) * 0.45) * 0.02 + dancePump + life.amp * 0.05)
        * tn.impScale;
      d.danceWarp = 0.012 + (d.treble * 0.05 + d.lowMid * 0.04) * mus;
      d.danceTime = dancePhase;
      const clampDrift = (v: number) => Math.max(-0.45, Math.min(0.45, v));
      d.danceDriftX = clampDrift(
        Math.sin((now / 1000) * 0.11) * 0.012 * (1 + mus * 0.5)
        + tn.impX + swayX + joltX
      );
      d.danceDriftY = clampDrift(
        Math.cos((now / 1000) * 0.13) * 0.01 * (1 + mus * 0.5)
        + tn.impY + swayY
      );
      // The radial fold turns with the same pulse: Transe rotates on the music.
      symAngle += dt * mus * (0.04 + d.bass * 0.45 + danceKick * 0.8);
      d.symSpin = symAngle;
    }

    // v0.7.1d — the imprint life: what each shape's own animation reads at
    // its 7 Hz re-sampling. Idle, everything breathes on slow clocks; with
    // music, each band feeds its register, scaled by "intensité son".
    {
      const d = renderer.dynamics;
      const sfx = renderer.tuning.soundFx;
      const tS = now / 1000;
      life.breath = Math.sin(tS * 0.3);
      life.kick = Math.max(
        life.kick * Math.exp(-dt * 4),
        Math.min(1, d.transient * 1.1 * sfx)
      );
      life.phase += dt * (0.35 + d.treble * 2.2 * sfx);
      life.spin += dt * (0.12 + (d.bass * 0.22 + life.kick * 0.7) * sfx);
      life.amp += (Math.min(1, d.lowMid * 1.2 * sfx) - life.amp) * (1 - Math.exp(-dt / 0.18));
      life.mid += (Math.min(1, d.mid * 1.2 * sfx) - life.mid) * (1 - Math.exp(-dt / 0.25));
      life.hi += (Math.min(1, d.treble * sfx) - life.hi) * (1 - Math.exp(-dt / 0.15));
      // Tilt: a damped spring around the idle breath; each rising accent
      // knocks it over, alternating sides so the ring really tips.
      const rising = d.transient > 0.55 && prevTransient <= 0.55;
      if (rising) {
        lifeTiltVel += (Math.floor(life.spin * 7) % 2 === 0 ? 1 : -1)
          * Math.min(1, d.transient) * 2.6 * sfx;
        // v0.7.1e — the same accent jolts the imprint sideways...
        joltVX += (Math.floor(life.spin * 13) % 2 === 0 ? 1 : -1)
          * Math.min(1, d.transient) * 0.9 * sfx;
        // ...and lights the whole frame: the lightning envelope.
        flashEnv = Math.max(
          flashEnv,
          Math.min(1.25, d.transient * 0.85 * sfx)
        );
        // Tempo detection: strong onsets, folded into 70-180 BPM.
        if (behavior.tempoAuto && d.transient > 0.6) {
          beatTimes.push(now);
          if (beatTimes.length > 12) beatTimes.shift();
          const bpms: number[] = [];
          for (let k = 1; k < beatTimes.length; k++) {
            const iv = beatTimes[k]! - beatTimes[k - 1]!;
            if (iv < 180 || iv > 4000) continue;
            let bpm = 60_000 / iv;
            while (bpm < 70) bpm *= 2;
            while (bpm > 180) bpm /= 2;
            bpms.push(bpm);
          }
          if (bpms.length >= 5) {
            bpms.sort((a, b) => a - b);
            const med = bpms[bpms.length >> 1]!;
            const close = bpms.filter((x) => Math.abs(x - med) < med * 0.08);
            if (close.length >= 4) {
              const bpm = close.reduce((a, b) => a + b, 0) / close.length;
              const tempoDef = panel.defs.find((p) => p.key === "tempo");
              if (tempoDef && Math.abs(tempoDef.get() - bpm) > 1.5) {
                writeParam(tempoDef, bpm);
              }
            }
          }
        }
      }
      // The lightning decays in a breath — one or two bright frames, a
      // short tail the present pass turns into a full-frame flash.
      flashEnv *= Math.exp(-dt * 8);
      d.flash = flashEnv;
      lifeTiltVel += ((life.breath * 0.35 - life.tilt) * 3 - lifeTiltVel * 2.2) * dt;
      life.tilt += lifeTiltVel * dt;
      // Wind: a springy sway fed by the bass, always at least a breeze.
      const windTarget = life.breath * 0.18
        + d.bass * sfx * (0.55 + 0.45 * Math.sin(tS * 0.7));
      lifeWindVel += ((windTarget - life.wind) * 2.8 - lifeWindVel * 1.6) * dt;
      life.wind += lifeWindVel * dt;
      life.windPhase += dt * (0.5 + d.bass * 1.5 * sfx);
      // Dragon fold: rests folded, unfolds on the accents, springs back.
      if (rising) lifeFoldVel -= Math.min(1, d.transient) * 2.4 * sfx;
      const foldRest = 0.93 + life.breath * 0.035;
      lifeFoldVel += ((foldRest - life.fold) * 10 - lifeFoldVel * 4.5) * dt;
      life.fold = Math.min(1, Math.max(0.55, life.fold + lifeFoldVel * dt));
      // Chladni plate: the mode follows the spectral balance — a brighter
      // spectrum climbs to a higher mode — through a sand transition.
      const total = d.bass + d.lowMid + d.mid + d.treble;
      if (mic && total > 0.08) {
        const brightness = (d.treble * 1.6 + d.mid * 0.8) / (total + 0.15);
        const target = Math.max(0, Math.min(CHLADNI_MODES.length - 1,
          Math.floor(brightness * CHLADNI_MODES.length * 1.4)));
        if (target !== chlIdx && life.chladni.blend === 0) {
          if (target !== chlPendIdx) {
            chlPendIdx = target;
            chlPendSince = now;
          } else if (now - chlPendSince > 600) {
            chlIdx = target;
            life.chladni.mB = CHLADNI_MODES[chlIdx]![0];
            life.chladni.nB = CHLADNI_MODES[chlIdx]![1];
            life.chladni.blend = 1e-4;
            chlPendIdx = -1;
          }
        }
      }
      if (life.chladni.blend > 0) {
        life.chladni.blend = Math.min(1, life.chladni.blend + dt / 1.4);
        if (life.chladni.blend >= 1) {
          life.chladni.mA = life.chladni.mB;
          life.chladni.nA = life.chladni.nB;
          life.chladni.blend = 0;
        }
      }
      // Shockwave: each strong rising accent rings a wave out of the
      // imprint's center; the front travels, the strength decays.
      if (rising && d.transient > 0.6 && sfx > 0.01) {
        shockT = 0;
        shockStrength = Math.min(1, d.transient) * Math.min(1.5, sfx);
      }
      if (shockT < 1.6) {
        shockT += dt;
        d.shockR = shockT * 0.55;
        d.shockAmp = shockStrength * Math.exp(-shockT * 2.4);
      } else {
        d.shockAmp = 0;
      }
      prevTransient = d.transient;
    }
    renderer.dynamics.windGain = Math.min(
      5,
      windAuto * renderer.tuning.gestureGain
    );

    // Title envelope: intro formation, then dissolution — the wordmark
    // belongs to the intro only since v0.7.1f (no idle re-formation).
    const t = renderer.dynamics.titleMode;
    const step = titleSpeed * dt;
    renderer.dynamics.titleMode =
      t < titleTarget ? Math.min(titleTarget, t + step) : Math.max(titleTarget, t - step);
    // While the word melts, keep kicking entropy back into the cluster.
    renderer.dynamics.dissolve = titleTarget === 0 && t > 0.02 ? 0.4 : 0;

    // Resting gust: every 10-20 s a wind rises, bends everything the same
    // way for a breath, then dies. The shader quiets it outside of rest.
    if (now >= gustNext) {
      gustStart = now;
      const angle = Math.random() * Math.PI * 2;
      gustDirX = Math.cos(angle);
      gustDirY = Math.sin(angle);
      gustNext = now + (10 + Math.random() * 10) * 1000;
    }
    const gustT = (now - gustStart) / 1000;
    const gustEnv =
      gustT >= 0 && gustT < 5
        ? gustT < 0.8
          ? smooth01(gustT / 0.8)
          : Math.exp(-(gustT - 0.8) / 1.1)
        : 0;
    renderer.dynamics.gustX = gustDirX * gustEnv * 0.7;
    renderer.dynamics.gustY = gustDirY * gustEnv * 0.7;

    // Chaos envelope: inverted-wind aspiration, then a turbulence burst.
    const chaosT = (now - chaosStart) / 1000;
    renderer.dynamics.chaosAspire =
      chaosT >= 0 && chaosT < 0.7 ? Math.sin((chaosT / 0.7) * Math.PI) : 0;
    renderer.dynamics.chaosBurst =
      chaosT >= 0.55 && chaosT < 2.2
        ? Math.exp(-(chaosT - 0.55) * 2.6) : 0;

    // Auto quality: step tiers down fast when slow, up cautiously when
    // fast — never above the Pro grain ceiling.
    if (quality.auto) {
      const fps = renderer.fps;
      if (QUALITY_TIERS[autoTier]! > quality.cap && autoTier > 0) {
        // The ceiling moved below the current tier: step down right away.
        autoTier--;
        renderer.tuning.count = QUALITY_TIERS[autoTier]!;
        updateStatus();
      }
      if (fps > 1 && fps < 45) {
        slowSince ??= now;
        fastSince = undefined;
        if (now - slowSince > 2000 && autoTier > 0) {
          autoTier--;
          renderer.tuning.count = QUALITY_TIERS[autoTier]!;
          slowSince = now;
          updateStatus();
        }
      } else if (fps > 57) {
        fastSince ??= now;
        slowSince = undefined;
        if (
          now - fastSince > 8000 &&
          autoTier < QUALITY_TIERS.length - 1 &&
          QUALITY_TIERS[autoTier + 1]! <= quality.cap
        ) {
          autoTier++;
          renderer.tuning.count = QUALITY_TIERS[autoTier]!;
          fastSince = now;
          updateStatus();
        }
      } else {
        slowSince = undefined;
        fastSince = undefined;
      }
    }

    // v0.7.2 — the showcase: no touch for 20 s, nobody in front, not
    // keeping, the switch on. Then a scene every 20 s until a touch.
    if (phase === "live" && !keepActive) {
      if (!vitrineOn) {
        if (
          behavior.vitrine &&
          now - lastTouch > VITRINE_IDLE_MS &&
          presenceEnv < 0.3 &&
          document.visibilityState === "visible"
        ) {
          enterVitrine();
        }
      } else if (now >= vitrineNext) {
        vitrineStep();
      }
    }

    // v0.7.1e — the five-band gauge: what the microphone really hears.
    bandsAcc += dt;
    if (bandsAcc > 0.033) {
      bandsAcc = 0;
      const d = renderer.dynamics;
      panel.setBands([
        Math.min(1, d.bass),
        Math.min(1, d.lowMid),
        Math.min(1, d.mid),
        Math.min(1, d.treble),
        Math.min(1, d.transient),
      ]);
      // v0.7.1f — the matter counter: who the grain budget goes to. The
      // shares mirror the shader's own hash split (impShare, corps share ×
      // presence); the luminance gating of corps grains happens per texel
      // on the GPU and is not readable here — this is the budget, noted so
      // in the hint.
      const imp = renderer.tuning.balance * 0.55 * Math.min(1, crystal);
      const corps =
        (1 - imp) * renderer.tuning.presenceShare * presenceEnv;
      panel.setMatter([corps, imp, Math.max(0, 1 - imp - corps)]);
    }

    // ?debug — kick watcher: around each rising accent, measure the share
    // of pixels that change between consecutive frames (the proof that a
    // kick reads on screen).
    if (DEBUG && now < kickState.until && kickState.grab && kickState.diff) {
      const img = kickState.grab();
      const t = renderer.dynamics.transient;
      const risingK = t > 0.6 && kickPrevT <= 0.6;
      if (kickState.prev) {
        if (risingK) {
          kickState.countdown = 3;
          kickState.best = 0;
        }
        if (kickState.countdown > 0) {
          kickState.best = Math.max(
            kickState.best,
            kickState.diff(kickState.prev, img)
          );
          kickState.countdown--;
          if (kickState.countdown === 0) kickState.results.push(kickState.best);
        }
      }
      kickState.prev = img;
      kickPrevT = t;
    }

    panel.setFps(renderer.fps);
    if (renderer.failure) {
      fail("Le rendu GPU s'est arrêté — voir la console pour le détail.");
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  updateStatus();

  // v0.7.1e — ?debug only: the measurement harness behind every visual
  // claim. window.__cinerae.grab("a") snapshots the canvas (480×270),
  // diff("a","b") returns the percentage of pixels whose any channel moved
  // by more than the threshold, kick(s) arms the consecutive-frame watcher
  // around each strong accent. Measured, never estimated.
  if (DEBUG) {
    const W = 480;
    const H = 270;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const shots = new Map<string, ImageData>();
    const grabNow = (): ImageData => {
      cx.drawImage(canvas, 0, 0, W, H);
      return cx.getImageData(0, 0, W, H);
    };
    // A WebGPU canvas is cleared outside its frame task: a snapshot must run
    // inside a rAF callback (after the renderer's), and retry if it caught
    // the cleared buffer.
    const grabReal = async (): Promise<ImageData> => {
      let img: ImageData = grabNow();
      for (let k = 0; k < 5; k++) {
        img = await new Promise<ImageData>((resolve) =>
          requestAnimationFrame(() => resolve(grabNow()))
        );
        let s = 0;
        for (let i = 0; i < img.data.length; i += 4 * 199) s += img.data[i]!;
        if (s > 0) return img;
      }
      return img;
    };
    const diffPct = (a: ImageData, b: ImageData, thr = 10): number => {
      let changed = 0;
      const n = W * H;
      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const d = Math.max(
          Math.abs(a.data[j]! - b.data[j]!),
          Math.abs(a.data[j + 1]! - b.data[j + 1]!),
          Math.abs(a.data[j + 2]! - b.data[j + 2]!)
        );
        if (d > thr) changed++;
      }
      return Math.round((changed / n) * 1000) / 10;
    };
    kickState.grab = grabNow;
    kickState.diff = (a, b) => diffPct(a, b, 10);
    // v0.7.2 — the souvenir probe: every blob handed to a download link is
    // measured (size, type, PNG dimensions, and the brightness of the QR
    // corner against the frame) so GARDER is verified even where the
    // browser never materializes the files on disk.
    const downloads: Record<string, unknown>[] = [];
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download && this.href.startsWith("blob:")) {
        const name = this.download;
        void fetch(this.href)
          .then((r) => r.blob())
          .then(async (b) => {
            const entry: Record<string, unknown> = { name, size: b.size, type: b.type };
            if (b.type === "image/png") {
              const bmp = await createImageBitmap(b);
              entry.w = bmp.width;
              entry.h = bmp.height;
              const c = document.createElement("canvas");
              c.width = bmp.width;
              c.height = bmp.height;
              const g = c.getContext("2d", { willReadFrequently: true })!;
              g.drawImage(bmp, 0, 0);
              const mean = (x: number, y: number, w: number, h: number) => {
                const d = g.getImageData(x, y, w, h).data;
                let sum = 0;
                for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
                return sum / (d.length / 4) / 3;
              };
              const qr = Math.round(bmp.height * 0.11);
              const m = Math.round(bmp.height * 0.03);
              entry.frameMean = Math.round(mean(0, 0, bmp.width, bmp.height));
              entry.qrMean = Math.round(mean(bmp.width - m - qr, bmp.height - m - qr, qr, qr));
            }
            downloads.push(entry);
          });
      }
      return anchorClick.call(this);
    };
    (window as unknown as Record<string, unknown>).__cinerae = {
      async grab(tag: string) {
        shots.set(tag, await grabReal());
        return tag;
      },
      diff(a: string, b: string, thr = 10) {
        const ia = shots.get(a);
        const ib = shots.get(b);
        if (!ia || !ib) return -1;
        return diffPct(ia, ib, thr);
      },
      kick(seconds = 12) {
        kickState.until = performance.now() + seconds * 1000;
        kickState.results.length = 0;
        kickState.prev = undefined;
        return "armed";
      },
      kickResults() {
        return [...kickState.results];
      },
      downloads() {
        return [...downloads];
      },
    };
  }
}

void boot();

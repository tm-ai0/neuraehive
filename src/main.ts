// Boot and orchestration. The piece opens on the wordmark: particles converge
// from chaos and crystallize CINERÆ — the first crystallization. A choice
// dissolves everything; matter takes over. After long total stillness the
// title slowly re-forms on its own, and melts at the first sign of life.
// Sensors start only from an explicit user gesture, never automatically.
import { requestMicrophone, type MicSource } from "./audio";
import { requestCamera, type CameraSource } from "./camera";
import {
  DEFAULT_IMPRINT_SETTINGS,
  IMPRINT_VARIANTS,
  generateImprint,
  isAnimated,
  sampleImageCloud,
  sampleTextCloud,
  silhouetteCloud,
  titleCloud,
  type ImprintCloud,
  type ImprintFamily,
  type ImprintSettings,
} from "./imprints";
import { capturePng, createRecorder, createStage } from "./capture";
import { applyPalette, PALETTES } from "./look";
import { createMidi, type Midi } from "./midi";
import { createModMatrix, type ModMatrix, type ParamRef } from "./modmatrix";
import { createPanel } from "./panel";
import { createPresets, type Presets } from "./presets";
import { createRenderer, DEFAULT_TUNING, type Renderer } from "./renderer";
import { sampleWordmark } from "./wordmark";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const overlayError = document.getElementById("overlay-error")!;
const fatal = document.getElementById("fatal")!;

const INTRO_FORM_TIME = 4.5; // s, load -> word
const REFORM_TIME = 14; // s, idle -> word, slow
const DISSOLVE_TIME = 1.3; // s, word -> matter
const IDLE_DELAY = 40; // s of total stillness before the word returns
const MOTION_STILL = 0.02; // camera motion below this counts as stillness
const QUALITY_TIERS = [50_000, 120_000, 200_000, 400_000];

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
const RANDOM_SILENCE_DELAY = 24; // s of silence between random imprints
const FOND_DAMP = 0.25; // audio reactivity left to the fond mode

// Chaos and the random mode draw from the families that need no asset or
// camera: every variant, flattened, plus the title and a fresh multi seed.
const RANDOM_POOL: [ImprintFamily, string][] = [
  ["titre", ""],
  ["multi", ""],
  ...(["volume", "forme", "math", "ondes"] as const).flatMap((family) =>
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
  const quality = { auto: window.matchMedia("(pointer: coarse)").matches };
  const behavior = { imprintReturn: true, silenceDelay: 2 };
  const imprintSettings: ImprintSettings = structuredClone(
    DEFAULT_IMPRINT_SETTINGS
  );
  let imageImprint: ImprintCloud | undefined;
  let textImprint: ImprintCloud | undefined;
  let animTimer: number | undefined;
  let randomNext = RANDOM_SILENCE_DELAY;

  let phase: "intro" | "live" = "intro";
  let titleTarget = 1;
  let titleSpeed = 1 / INTRO_FORM_TIME;
  let mic: MicSource | undefined;
  let cameraSource: CameraSource | undefined;
  let crystal = 0;
  let silenceTime = 0;
  let lastActivity = performance.now();
  let motionAvg = 0;
  let motionArea = 0;
  let windAuto = 1;
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
        // The sliders glide home from the panel; here only the matter and
        // the non-slider fields come back to their defaults.
        renderer.resetMatter();
        crystal = 0;
        renderer.tuning.mirror = DEFAULT_TUNING.mirror;
        renderer.tuning.windOverlay = DEFAULT_TUNING.windOverlay;
        behavior.imprintReturn = true;
        applyPalette(renderer.look, PALETTES[0]!);
        Object.assign(
          imprintSettings,
          structuredClone(DEFAULT_IMPRINT_SETTINGS)
        );
        textImprint = undefined;
        void applyImprint("titre", "");
      },
      onInteraction: markActivity,
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
          if (!ok) panel.setStatus("capture impossible");
        });
      },
      onToggleRecord: () => recorder.toggle(),
      onFullscreen() {
        void stage.toggleFullscreen();
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
      renderer.setImprint(titleImprint, "shape");
    } else if (family === "camera" && variant === "silhouette") {
      if (!cameraSource) {
        panel.setStatus("caméra inactive — silhouette indisponible");
        panel.refresh();
        return;
      }
      const luma = await renderer.readLuma();
      const cloud = silhouetteCloud(luma.data, luma.width, luma.height);
      if (!cloud) {
        panel.setStatus("silhouette introuvable — rien devant la caméra ?");
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
        panel.setStatus("texte vide — rien à cristalliser");
        panel.refresh();
        return;
      }
      textImprint = cloud;
      s.family = "texte";
      s.variant = "";
      renderer.setImprint(cloud, "shape");
    } else if (family === "image") {
      if (!imageImprint) {
        panel.setStatus("déposer une image sur la scène, ou passer par image…");
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
        panel.setStatus("image sans matière exploitable");
        return;
      }
      imageImprint = cloud;
      await applyImprint("image", "");
    } catch (error) {
      console.warn("[cinerae] import image:", error);
      panel.setStatus("image illisible");
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

  const updateStatus = () => {
    const cam = cameraSource ? "caméra active" : "sans caméra";
    const audio = mic ? "micro actif" : "sans micro";
    const auto = quality.auto
      ? ` · auto ${Math.round(renderer.tuning.count / 1000)} k`
      : "";
    panel.setStatus(`${cam} · ${audio}${auto}`);
    panel.setSensors(Boolean(cameraSource), Boolean(mic));
  };

  // ----- sensors (each start is triggered by an explicit click) ------------
  async function startCamera() {
    if (cameraSource) return;
    try {
      cameraSource = await requestCamera();
      renderer.attachCamera(cameraSource);
    } catch (error) {
      console.warn("[cinerae] caméra refusée ou indisponible:", error);
      panel.setStatus("caméra refusée — mode audio seul");
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
    updateStatus();
  }
  async function startMic() {
    if (mic) return;
    try {
      mic = await requestMicrophone();
    } catch (error) {
      console.warn("[cinerae] micro refusé ou indisponible:", error);
      panel.setStatus("micro refusé — matière libre, non réactive");
    }
    updateStatus();
  }
  async function stopMic() {
    mic?.dispose();
    mic = undefined;
    renderer.dynamics.bass = 0;
    renderer.dynamics.treble = 0;
    renderer.dynamics.transient = 0;
    cym = 0;
    sustain = 0;
    renderer.dynamics.cymatic = 0;
    // Without an ear, no silence to hear: release the crystal so the matter
    // goes back to living freely instead of staying frozen forever.
    crystal = 0;
    silenceTime = 0;
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
    markActivity();
    overlayError.textContent = "";
    panel.collapse();
    void (async () => {
      if (withCamera) await startCamera();
      await startMic();
    })();
  }
  document.getElementById("start-full")!.addEventListener("click", () => beginLive(true));
  document.getElementById("start-audio")!.addEventListener("click", () => beginLive(false));

  // ----- touch dust ---------------------------------------------------------
  const setTouch = (event: PointerEvent, strength: number) => {
    renderer.dynamics.touchX = event.clientX / window.innerWidth;
    renderer.dynamics.touchY = event.clientY / window.innerHeight;
    renderer.dynamics.touchStrength = phase === "live" ? strength : 0;
  };
  canvas.addEventListener("pointerdown", (event) => {
    markActivity();
    canvas.setPointerCapture(event.pointerId);
    setTouch(event, 1);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (renderer.dynamics.touchStrength > 0) {
      markActivity();
      setTouch(event, 1);
    }
  });
  const endTouch = () => {
    renderer.dynamics.touchStrength = 0;
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);
  window.addEventListener("keydown", markActivity);

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
            `s=${silenceTime.toFixed(1)}`;
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
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // Audio analysis -> dynamics, with the Pro band gains applied.
    if (mic) {
      const a = mic.update(dt);
      renderer.dynamics.bass = Math.min(1.5, a.bass * audioState.bassGain);
      renderer.dynamics.treble = Math.min(1.5, a.treble * audioState.trebleGain);
      renderer.dynamics.transient = Math.min(
        1.5,
        a.transient * audioState.transientGain
      );
      if (a.level >= audioState.silenceThreshold) markActivity();

      // A real silence is quiet AND still: a body sweeping through the frame
      // or a finger on the dust counts as playing, and playing always
      // restarts the countdown — the matter never recrystallizes mid-gesture.
      const playing =
        (cameraSource !== undefined && cameraMoving()) ||
        renderer.dynamics.touchStrength > 0;
      if (a.level < audioState.silenceThreshold && !playing) {
        silenceTime += dt;
        if (behavior.imprintReturn && silenceTime > behavior.silenceDelay)
          crystal = Math.min(1, crystal + dt / 8);
        // Random mode: each long silence draws a new imprint; the held
        // matter simply glides to the new targets — a morphing, not a cut.
        if (imprintSettings.random && silenceTime > randomNext) {
          randomNext += RANDOM_SILENCE_DELAY;
          const current = `${imprintSettings.family}/${imprintSettings.variant}`;
          const picks = RANDOM_POOL.filter(
            ([f, v]) => `${f}/${v}` !== current
          );
          const [family, variant] =
            picks[(Math.random() * picks.length) | 0]!;
          void applyImprint(family, variant, { silent: true });
        }
      } else if (a.level >= audioState.silenceThreshold) {
        silenceTime = 0;
        randomNext = RANDOM_SILENCE_DELAY;
        crystal = Math.max(0, crystal - dt * (0.4 + a.level * 5));
      } else {
        // Silent but gesturing: the held form only erodes where the body
        // passes (in the shader); globally it neither builds nor melts.
        silenceTime = 0;
        randomNext = RANDOM_SILENCE_DELAY;
      }

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

    // The camera imprint melts while the wordmark takes the matter over.
    crystal = Math.max(0, crystal - dt * renderer.dynamics.titleMode * 0.6);
    renderer.dynamics.crystal = crystal;
    renderer.dynamics.windGain = Math.min(
      5,
      windAuto * renderer.tuning.gestureGain
    );

    // Title envelope: intro formation, dissolution, idle re-formation.
    if (phase === "live") {
      const idleFor = (now - lastActivity) / 1000;
      if (
        behavior.imprintReturn &&
        renderer.imprintCount > 0 &&
        !cameraMoving() &&
        idleFor > IDLE_DELAY &&
        titleTarget === 0
      ) {
        titleTarget = 1;
        titleSpeed = 1 / REFORM_TIME;
      } else if (idleFor <= 1 && titleTarget === 1) {
        titleTarget = 0;
        titleSpeed = 1 / DISSOLVE_TIME;
      }
    }
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

    // Auto quality: step tiers down fast when slow, up cautiously when fast.
    if (quality.auto) {
      const fps = renderer.fps;
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
        if (now - fastSince > 8000 && autoTier < QUALITY_TIERS.length - 1) {
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

    panel.setFps(renderer.fps);
    panel.setCrystal(Math.max(crystal, renderer.dynamics.titleMode));
    if (renderer.failure) {
      fail("Le rendu GPU s'est arrêté — voir la console pour le détail.");
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  updateStatus();
}

void boot();

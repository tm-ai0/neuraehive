// Boot and orchestration. The piece opens on the wordmark: particles converge
// from chaos and crystallize CINERÆ — the first crystallization. A choice
// dissolves everything; matter takes over. After long total stillness the
// title slowly re-forms on its own, and melts at the first sign of life.
// Sensors start only from an explicit user gesture, never automatically.
import { requestMicrophone, type MicSource } from "./audio";
import { requestCamera, type CameraSource } from "./camera";
import { createPanel } from "./panel";
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

function fail(message: string, error?: unknown) {
  console.error("[cinerae]", message, error ?? "");
  fatal.textContent = message;
  fatal.style.display = "flex";
}

async function boot() {
  let renderer: Renderer;
  try {
    renderer = await createRenderer(canvas, await sampleWordmark());
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
  const behavior = { titleReturn: true };

  let phase: "intro" | "live" = "intro";
  let titleTarget = 1;
  let titleSpeed = 1 / INTRO_FORM_TIME;
  let mic: MicSource | undefined;
  let cameraSource: CameraSource | undefined;
  let crystal = 0;
  let silenceTime = 0;
  let lastActivity = performance.now();
  let motionAvg = 0;
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

  // ----- panel --------------------------------------------------------------
  const panel = createPanel(
    document.body,
    { tuning: renderer.tuning, audio: audioState, quality, behavior },
    {
      onSensor(kind, enabled) {
        if (kind === "camera") void (enabled ? startCamera() : stopCamera());
        else void (enabled ? startMic() : stopMic());
      },
      onChaos() {
        chaosStart = performance.now();
      },
      onReset() {
        // The sliders glide home from the panel; here only the matter and
        // the non-slider fields come back to their defaults.
        renderer.resetMatter();
        crystal = 0;
        renderer.tuning.mirror = DEFAULT_TUNING.mirror;
        renderer.tuning.windOverlay = DEFAULT_TUNING.windOverlay;
        behavior.titleReturn = true;
      },
      onInteraction: markActivity,
    }
  );

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

  // ----- camera stillness probe (drives the idle return of the title) ------
  let probing = false;
  window.setInterval(() => {
    if (!cameraSource || probing) return;
    probing = true;
    renderer
      .readMotion()
      .then((m) => {
        motionAvg = m;
        if (m > MOTION_STILL) markActivity();
      })
      .catch(() => undefined)
      .finally(() => {
        probing = false;
      });
  }, 1000);

  // ----- per-frame orchestration -------------------------------------------
  let last = performance.now();
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

      if (a.level < audioState.silenceThreshold) {
        silenceTime += dt;
        if (silenceTime > 2) crystal = Math.min(1, crystal + dt / 8);
      } else {
        silenceTime = 0;
        crystal = Math.max(0, crystal - dt * (0.4 + a.level * 5));
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
    // The camera imprint melts while the wordmark takes the matter over.
    crystal = Math.max(0, crystal - dt * renderer.dynamics.titleMode * 0.6);
    renderer.dynamics.crystal = crystal;

    // Title envelope: intro formation, dissolution, idle re-formation.
    if (phase === "live") {
      const idleFor = (now - lastActivity) / 1000;
      if (
        behavior.titleReturn &&
        motionAvg <= MOTION_STILL &&
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

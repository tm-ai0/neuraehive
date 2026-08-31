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
};

function fail(message: string, error?: unknown) {
  console.error("[cinerae]", message, error ?? "");
  fatal.textContent = message;
  fatal.style.display = "flex";
}

async function boot() {
  let renderer: Renderer;
  try {
    renderer = await createRenderer(canvas, sampleWordmark());
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
    { tuning: renderer.tuning, audio: audioState, quality },
    {
      onSensor(kind, enabled) {
        if (kind === "camera") void (enabled ? startCamera() : stopCamera());
        else void (enabled ? startMic() : stopMic());
      },
      onChaos() {
        chaosStart = performance.now();
      },
      onReset() {
        Object.assign(renderer.tuning, DEFAULT_TUNING);
        Object.assign(audioState, AUDIO_DEFAULTS);
        renderer.resetMatter();
        crystal = 0;
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
    }
    // The camera imprint melts while the wordmark takes the matter over.
    crystal = Math.max(0, crystal - dt * renderer.dynamics.titleMode * 0.6);
    renderer.dynamics.crystal = crystal;

    // Title envelope: intro formation, dissolution, idle re-formation.
    if (phase === "live") {
      const idleFor = (now - lastActivity) / 1000;
      if (idleFor > IDLE_DELAY && titleTarget === 0) {
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

// Boot: the render loop starts immediately (idle drift, no sensors).
// Camera and microphone start only on explicit click, never automatically.
import { requestMicrophone, type MicSource } from "./audio";
import { requestCamera } from "./camera";
import { createPanel } from "./panel";
import { createRenderer, DEFAULT_TUNING, type Renderer } from "./renderer";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const overlayError = document.getElementById("overlay-error")!;
const fatal = document.getElementById("fatal")!;

function fail(message: string, error?: unknown) {
  console.error("[cinerae]", message, error ?? "");
  fatal.textContent = message;
  fatal.style.display = "flex";
}

async function boot() {
  let renderer: Renderer;
  try {
    renderer = await createRenderer(canvas);
  } catch (error) {
    fail(
      "WebGPU n'a pas pu démarrer. Il faut un navigateur récent (Chrome/Edge) avec un GPU actif.",
      error
    );
    return;
  }

  const panel = createPanel(document.body, {
    force: DEFAULT_TUNING.force,
    viscosity: DEFAULT_TUNING.viscosity,
    turbulence: DEFAULT_TUNING.turbulence,
    silenceThreshold: 0.02,
    particleCount: renderer.particleCount,
  }, {
    onChange(values) {
      renderer.tuning.force = values.force;
      renderer.tuning.viscosity = values.viscosity;
      renderer.tuning.turbulence = values.turbulence;
      silenceThreshold = values.silenceThreshold;
      renderer.setParticleCount(values.particleCount);
    },
  });

  let mic: MicSource | undefined;
  let silenceThreshold = 0.02;
  let silenceTime = 0;
  let crystal = 0;
  let cameraOn = false;
  let micOn = false;

  // Audio → matter state, ~60 Hz alongside the GPU loop.
  let last = performance.now();
  const audioTick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (mic) {
      const a = mic.update(dt);
      renderer.dynamics.bass = a.bass;
      renderer.dynamics.treble = a.treble;
      renderer.dynamics.transient = a.transient;

      if (a.level < silenceThreshold) {
        silenceTime += dt;
        // Two quiet seconds, then the matter crystallizes over ~8 s.
        if (silenceTime > 2) crystal = Math.min(1, crystal + dt / 8);
      } else {
        silenceTime = 0;
        crystal = Math.max(0, crystal - dt * (0.4 + a.level * 5));
      }
      renderer.dynamics.crystal = crystal;
    }

    panel.setFps(renderer.fps);
    panel.setCrystal(crystal);
    if (renderer.failure) {
      fail("Le rendu GPU s'est arrêté — voir la console pour le détail.");
      return;
    }
    requestAnimationFrame(audioTick);
  };
  requestAnimationFrame(audioTick);

  const updateStatus = () => {
    const cam = cameraOn ? "caméra active" : "sans caméra";
    const audio = micOn ? "micro actif" : "sans micro";
    panel.setStatus(`${cam} · ${audio}`);
  };
  updateStatus();

  async function startSensors(withCamera: boolean) {
    overlayError.textContent = "";
    const problems: string[] = [];

    if (withCamera) {
      try {
        const camera = await requestCamera();
        renderer.attachCamera(camera);
        cameraOn = true;
      } catch (error) {
        console.warn("[cinerae] caméra refusée ou indisponible:", error);
        problems.push("caméra refusée — mode audio seul");
      }
    }
    try {
      mic = await requestMicrophone();
      micOn = true;
    } catch (error) {
      console.warn("[cinerae] micro refusé ou indisponible:", error);
      problems.push("micro refusé — matière libre, non réactive");
    }

    updateStatus();
    overlay.classList.add("hidden");
    if (problems.length) panel.setStatus(problems.join(" · "));
  }

  document.getElementById("start-full")!.addEventListener("click", () => {
    void startSensors(true);
  });
  document.getElementById("start-audio")!.addEventListener("click", () => {
    void startSensors(false);
  });
}

void boot();

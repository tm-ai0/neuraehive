import { startCamera } from "./camera";
import { PoseEngine } from "./pose";
import { HandsEngine } from "./hands";
import { FaceEngine } from "./face";
import { DepthEngine } from "./depth";

type Panneau = "silhouette" | "corps" | "mains" | "visage" | "profondeur";

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const nb = (v: number, dec = 2): string => v.toFixed(dec).replace(".", ",");

const pose = new PoseEngine();
const hands = new HandsEngine();
const face = new FaceEngine();
const depth = new DepthEngine();

let video: HTMLVideoElement | null = null;
const on: Record<Panneau, boolean> = { silhouette: false, corps: false, mains: false, visage: false, profondeur: false };
let fps = 0;
let lastFrame = 0;

const ctxDe = (id: string) => ($(`#p-${id} canvas`) as HTMLCanvasElement).getContext("2d")!;
const contextes: Record<Panneau, CanvasRenderingContext2D> = {
  silhouette: ctxDe("silhouette"),
  corps: ctxDe("corps"),
  mains: ctxDe("mains"),
  visage: ctxDe("visage"),
  profondeur: ctxDe("profondeur"),
};

interface SentirSignal { on: boolean; hz: number; ms: number; [k: string]: unknown }
declare global {
  interface Window {
    __sentir?: {
      fps: number;
      gpu: string;
      silhouette: SentirSignal;
      corps: SentirSignal;
      mains: SentirSignal;
      visage: SentirSignal;
      profondeur: SentirSignal;
    };
  }
}

async function activer(quoi: Panneau, btn: HTMLButtonElement): Promise<void> {
  btn.textContent = "chargement…";
  btn.classList.add("charge");
  try {
    if (quoi === "silhouette" || quoi === "corps") await pose.init();
    else if (quoi === "mains") await hands.init();
    else if (quoi === "visage") await face.init();
    else if (quoi === "profondeur") {
      await pose.init(); // le repli imité lit la silhouette
      await depth.start(video!, pose);
    }
    on[quoi] = true;
    btn.textContent = "couper";
    btn.classList.remove("charge");
    btn.classList.add("on");
  } catch (e) {
    btn.textContent = "en échec";
    btn.classList.remove("charge");
    console.error(`[sentir] activation ${quoi} :`, e);
  }
}

function couper(quoi: Panneau, btn: HTMLButtonElement): void {
  on[quoi] = false;
  if (quoi === "profondeur") depth.stop();
  btn.textContent = "activer";
  btn.classList.remove("on");
  const c = contextes[quoi];
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
}

function jauge(id: string, v: number): void {
  ($(`#j-${id}`) as HTMLElement).style.width = `${Math.round(v * 100)}%`;
  $(`#v-${id}`).textContent = nb(v);
}

function statsTexte(id: Panneau, hz: number, ms: number, extra = ""): void {
  $(`#p-${id} .stats`).textContent = `cadence ${nb(hz, 1)} Hz · latence ${nb(ms, 0)} ms${extra}`;
}

function majAffichage(): void {
  $("#fpsLab").textContent = nb(fps, 0);
  if (on.silhouette) {
    statsTexte("silhouette", pose.meter.hz, pose.meter.ms);
    jauge("aire", pose.aire);
    jauge("hauteur", pose.boiteHauteur);
  }
  if (on.corps) {
    statsTexte("corps", pose.meter.hz, pose.meter.ms);
    jauge("presence", pose.presence);
  }
  if (on.mains) {
    statsTexte("mains", hands.meter.hz, hands.meter.ms);
    const g = hands.mains.find((m) => m.cote === "gauche");
    const d = hands.mains.find((m) => m.cote === "droite");
    $("#g-mains").innerHTML =
      `gauche : <b>${g?.geste ?? "—"}</b> · droite : <b>${d?.geste ?? "—"}</b>`;
    const meilleure = hands.mains[0];
    jauge("ouverture", meilleure?.ouverture ?? 0);
    jauge("pince", meilleure?.pince ?? 0);
  }
  if (on.visage) {
    const b = face.brut;
    statsTexte("visage", face.meter.hz, face.meter.ms, ` · bouche ${nb(b.pucker)} ${nb(b.funnel)} ${nb(b.joues)} ${nb(b.machoire)}`);
    jauge("souffle", face.souffle);
    jauge("lumiere", face.lumiere);
    jauge("clin", face.clin);
  }
  if (on.profondeur) {
    const modeTxt = depth.mode === "onnx" && depth.precision ? `onnx ${depth.precision}` : depth.mode;
    statsTexte("profondeur", depth.meter.hz, depth.meter.ms, ` · ${modeTxt}`);
    jauge("proche", depth.proche);
  }
}

function publier(): void {
  window.__sentir = {
    fps,
    gpu,
    silhouette: { on: on.silhouette, aire: pose.aire, hauteur: pose.boiteHauteur, hz: pose.meter.hz, ms: pose.meter.ms, detail: pose.detail },
    corps: { on: on.corps, presence: pose.presence, points: pose.landmarks?.length ?? 0, hz: pose.meter.hz, ms: pose.meter.ms },
    mains: {
      on: on.mains,
      liste: hands.mains.map((m) => ({ cote: m.cote, geste: m.geste, ouverture: m.ouverture, pince: m.pince })),
      hz: hands.meter.hz,
      ms: hands.meter.ms,
    },
    visage: { on: on.visage, souffle: face.souffle, lumiere: face.lumiere, clin: face.clin, brut: face.brut, hz: face.meter.hz, ms: face.meter.ms },
    profondeur: { on: on.profondeur, mode: depth.mode, precision: depth.precision, proche: depth.proche, hz: depth.meter.hz, ms: depth.meter.ms },
  };
}

let dernierAffichage = 0;
function boucle(now: number): void {
  requestAnimationFrame(boucle);
  if (lastFrame > 0) {
    const dt = now - lastFrame;
    if (dt > 0) fps += (1000 / dt - fps) * 0.1;
  }
  lastFrame = now;
  if (video && video.readyState >= 2) {
    const poseUtile = on.silhouette || on.corps || (on.profondeur && depth.mode === "imitée");
    if (poseUtile) pose.demander(video, now);
    if (on.mains) hands.demander(video, now);
    if (on.visage) face.demander(video, now);
    if (on.silhouette) pose.drawSilhouette(contextes.silhouette, 320, 240);
    if (on.corps) pose.drawCorps(contextes.corps, 320, 240);
    if (on.mains) hands.draw(contextes.mains, 320, 240);
    if (on.visage) face.draw(contextes.visage, 320, 240);
    if (on.profondeur) depth.draw(contextes.profondeur, 320, 240);
  }
  publier();
  if (now - dernierAffichage > 120) {
    dernierAffichage = now;
    majAffichage();
  }
}
requestAnimationFrame(boucle);

// Quel GPU rend vraiment (mesuré ici : Chrome partait sur l'Intel intégré au lieu
// de la RTX tant que Windows ne l'avait pas réglé en « haute performance »).
const gpu = (() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const brut = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "gpu inconnu";
  return brut.replace(/^ANGLE \((\w+), /, "").replace(/ \(0x[0-9A-Fa-f]+\).*$/, "");
})();
$("#note").textContent = `${gpu} · chaque signal s'active un par un ; modèles servis en local, rien n'est envoyé`;

const btnCam = $("#btnCam") as HTMLButtonElement;
const btnVoir = $("#btnVoir") as HTMLButtonElement;

btnCam.addEventListener("click", async () => {
  if (video) return;
  btnCam.textContent = "ouverture…";
  try {
    video = await startCamera();
    (window as unknown as { __sentirVideo?: HTMLVideoElement }).__sentirVideo = video;
    btnCam.textContent = "caméra active";
    btnCam.classList.add("on");
    btnVoir.disabled = false;
    document.querySelectorAll<HTMLButtonElement>("button[data-t]").forEach((b) => (b.disabled = false));
  } catch (e) {
    btnCam.textContent = "caméra refusée";
    console.error("[sentir] caméra :", e);
  }
});

btnVoir.addEventListener("click", () => {
  const panneau = $("#p-camera");
  const montre = panneau.style.display === "none";
  panneau.style.display = montre ? "" : "none";
  btnVoir.classList.toggle("on", montre);
  if (montre && video) {
    const vv = $("#videoVoir") as HTMLVideoElement;
    vv.srcObject = video.srcObject;
    void vv.play();
  }
});

document.querySelectorAll<HTMLButtonElement>("button[data-t]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const quoi = btn.dataset.t as Panneau;
    if (on[quoi]) couper(quoi, btn);
    else void activer(quoi, btn);
  });
});

// ?on=silhouette,corps,… (ou all) : démarrage automatique pour la mesure.
const auto = new URLSearchParams(location.search).get("on");
if (auto) {
  btnCam.click();
  const attente = setInterval(() => {
    if (!video) return;
    clearInterval(attente);
    const voulu = auto === "all"
      ? (["silhouette", "corps", "mains", "visage", "profondeur"] as Panneau[])
      : (auto.split(",") as Panneau[]);
    document.querySelectorAll<HTMLButtonElement>("button[data-t]").forEach((b) => {
      if (voulu.includes(b.dataset.t as Panneau)) b.click();
    });
  }, 200);
}

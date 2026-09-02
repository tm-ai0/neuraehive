/// <reference lib="webworker" />
// Les trois tâches MediaPipe vivent ici : le fil principal reste libre,
// il n'envoie que des ImageBitmap et reçoit des résultats déjà digérés.
import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";

export type Quoi = "pose" | "mains" | "visage";

export interface MsgInit { type: "init"; quoi: Quoi }
export interface MsgFrame { type: "frame"; quoi: Quoi; bitmap: ImageBitmap; t: number }
export type MsgVersWorker = MsgInit | MsgFrame;

export interface ResPose {
  type: "res"; quoi: "pose"; latence: number;
  detail: { detect: number; masque: number };
  landmarks: { x: number; y: number; z: number; visibility?: number }[] | null;
  aire: number; boiteHauteur: number; centreX: number;
  maskBitmap: ImageBitmap | null;
}
export interface ResMains {
  type: "res"; quoi: "mains"; latence: number;
  mains: { brut: string; points: { x: number; y: number; z: number }[] }[];
}
export interface ResVisage {
  type: "res"; quoi: "visage"; latence: number;
  points: { x: number; y: number }[] | null;
  formes: Record<string, number> | null;
}
export type MsgDuWorker = { type: "pret"; quoi: Quoi } | { type: "echec"; quoi: Quoi; erreur: string } | ResPose | ResMains | ResVisage;

// Le loader wasm est un script classique : importé comme module ES dans un worker,
// son ModuleFactory reste en portée module et MediaPipe ne le trouve pas. On évalue
// donc son texte en portée globale du worker, puis on décrit le fileset à la main.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let filesetP: Promise<WasmFileset> | null = null;
function fileset(): Promise<WasmFileset> {
  filesetP ??= (async () => {
    const base = `${self.location.origin}/models/wasm`;
    const code = await (await fetch(`${base}/vision_wasm_internal.js`)).text();
    (0, eval)(code); // pose self.ModuleFactory ; MediaPipe saute alors son propre import
    return {
      wasmLoaderPath: `${base}/vision_wasm_internal.js`,
      wasmBinaryPath: `${base}/vision_wasm_internal.wasm`,
    } as WasmFileset;
  })();
  return filesetP;
}

let pose: PoseLandmarker | null = null;
let mains: HandLandmarker | null = null;
let visage: FaceLandmarker | null = null;

const poster = (m: MsgDuWorker, transfert: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfert);

async function init(quoi: Quoi): Promise<void> {
  try {
    const v = await fileset();
    if (quoi === "pose" && !pose) {
      pose = await PoseLandmarker.createFromOptions(v, {
        // lite mesuré 2× plus rapide que full pour un masque équivalent à 2-3 m
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        outputSegmentationMasks: true,
      });
    } else if (quoi === "mains" && !mains) {
      mains = await HandLandmarker.createFromOptions(v, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } else if (quoi === "visage" && !visage) {
      visage = await FaceLandmarker.createFromOptions(v, {
        baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    }
    poster({ type: "pret", quoi });
  } catch (e) {
    poster({ type: "echec", quoi, erreur: String(e) });
  }
}

let maskImage: ImageData | null = null;

async function traiterPose(bitmap: ImageBitmap, t: number): Promise<void> {
  const t0 = performance.now();
  const res = pose!.detectForVideo(bitmap, t);
  const tDetect = performance.now() - t0;
  const lm = res.landmarks[0] ?? null;
  let aire = 0, boiteHauteur = 0, centreX = 0.5;
  let maskBitmap: ImageBitmap | null = null;
  const mask = res.segmentationMasks?.[0];
  if (mask) {
    const data = mask.getAsFloat32Array();
    const w = mask.width, h = mask.height;
    if (!maskImage || maskImage.width !== w || maskImage.height !== h) maskImage = new ImageData(w, h);
    const px = maskImage.data;
    let compte = 0, minY = h, maxY = -1, sommeX = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      px[i * 4] = 224; px[i * 4 + 1] = 210; px[i * 4 + 2] = 186;
      px[i * 4 + 3] = v > 0.1 ? Math.min(255, v * 300) | 0 : 0;
      if (v > 0.5) {
        compte++;
        sommeX += i % w;
        const y = (i / w) | 0;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    aire = compte / data.length;
    boiteHauteur = maxY >= minY ? (maxY - minY + 1) / h : 0;
    if (compte > 0) centreX = sommeX / compte / w;
    maskBitmap = await createImageBitmap(maskImage);
  }
  (res as unknown as { close?: () => void }).close?.();
  const latence = performance.now() - t0;
  poster(
    {
      type: "res", quoi: "pose", latence,
      detail: { detect: tDetect, masque: latence - tDetect },
      landmarks: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null,
      aire, boiteHauteur, centreX, maskBitmap,
    },
    maskBitmap ? [maskBitmap] : [],
  );
}

function traiterMains(bitmap: ImageBitmap, t: number): void {
  const t0 = performance.now();
  const res = mains!.detectForVideo(bitmap, t);
  const latence = performance.now() - t0;
  poster({
    type: "res", quoi: "mains", latence,
    mains: res.landmarks.map((pts, i) => ({
      brut: res.handedness[i]?.[0]?.categoryName ?? "Right",
      points: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    })),
  });
}

function traiterVisage(bitmap: ImageBitmap, t: number): void {
  const t0 = performance.now();
  const res = visage!.detectForVideo(bitmap, t);
  const latence = performance.now() - t0;
  const cats = res.faceBlendshapes?.[0]?.categories ?? null;
  poster({
    type: "res", quoi: "visage", latence,
    points: res.faceLandmarks[0]?.map((p) => ({ x: p.x, y: p.y })) ?? null,
    formes: cats ? Object.fromEntries(cats.map((c) => [c.categoryName, c.score])) : null,
  });
}

self.onmessage = async (e: MessageEvent<MsgVersWorker>) => {
  const msg = e.data;
  if (msg.type === "init") {
    await init(msg.quoi);
    return;
  }
  const { quoi, bitmap, t } = msg;
  try {
    if (quoi === "pose" && pose) await traiterPose(bitmap, t);
    else if (quoi === "mains" && mains) traiterMains(bitmap, t);
    else if (quoi === "visage" && visage) traiterVisage(bitmap, t);
  } finally {
    bitmap.close();
  }
};

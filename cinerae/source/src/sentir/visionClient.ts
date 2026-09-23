// Côté fil principal : UN worker par tâche (pose, mains, visage tournent en parallèle
// au lieu de s'attendre dans une file), une frame en vol par tâche au plus.
import type { Quoi, MsgDuWorker, ResPose, ResMains, ResVisage } from "./worker";

type Res = ResPose | ResMains | ResVisage;

const workers = new Map<Quoi, Worker>();
const prets = new Map<Quoi, { resolve: () => void; reject: (e: Error) => void }>();
const initPromesses = new Map<Quoi, Promise<void>>(); // init idempotente : silhouette, corps et profondeur partagent la pose
const enVol = new Set<Quoi>();
const handlers = new Map<Quoi, (r: Res) => void>();

function leWorker(quoi: Quoi): Worker {
  let worker = workers.get(quoi);
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workers.set(quoi, worker);
    worker.onmessage = (e: MessageEvent<MsgDuWorker>) => {
      const m = e.data;
      if (m.type === "pret") {
        prets.get(m.quoi)?.resolve();
        prets.delete(m.quoi);
      } else if (m.type === "echec") {
        prets.get(m.quoi)?.reject(new Error(m.erreur));
        prets.delete(m.quoi);
      } else {
        enVol.delete(m.quoi);
        handlers.get(m.quoi)?.(m);
      }
    };
  }
  return worker;
}

export function initTache(quoi: Quoi): Promise<void> {
  let p = initPromesses.get(quoi);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      prets.set(quoi, { resolve, reject });
      leWorker(quoi).postMessage({ type: "init", quoi });
    });
    initPromesses.set(quoi, p);
    p.catch(() => initPromesses.delete(quoi)); // un échec permet de retenter
  }
  return p;
}

export function surResultat(quoi: Quoi, h: (r: Res) => void): void {
  handlers.set(quoi, h);
}

// La pose reçoit une frame réduite : le détecteur redimensionne de toute façon,
// et le masque de segmentation sort à la taille d'entrée — 256 px suffit et
// divise le coût de relecture GPU par ~5.
const LARGEURS: Record<Quoi, number> = { pose: 256, mains: 640, visage: 640 };

// Envoie la frame courante si la tâche est libre ; sinon on saute (backpressure).
export function envoyer(quoi: Quoi, video: HTMLVideoElement, t: number): void {
  if (enVol.has(quoi)) return;
  enVol.add(quoi);
  const w = LARGEURS[quoi];
  const h = Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth));
  createImageBitmap(video, { resizeWidth: w, resizeHeight: h })
    .then((bitmap) => leWorker(quoi).postMessage({ type: "frame", quoi, bitmap, t }, [bitmap]))
    .catch(() => enVol.delete(quoi));
}

import { HandLandmarker } from "@mediapipe/tasks-vision"; // constantes de squelette seulement
import { initTache, surResultat, envoyer } from "./visionClient";
import type { ResMains } from "./worker";
import { Meter, clamp01 } from "./meter";

export type Geste = "pousser" | "tirer" | "serrer" | "lâcher" | "—";

interface Pt { x: number; y: number; z: number }

export interface MainInfo {
  cote: "gauche" | "droite";
  points: Pt[];
  ouverture: number; // 0 poing .. 1 paume ouverte
  pince: number; // 0 doigts écartés .. 1 pouce-index joints
  geste: Geste;
}

interface Suivi {
  ouverture: number;
  pince: number;
  basT: number; // dernier instant où la main était fermée
  lacherJusqua: number;
}

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

function d(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class HandsEngine {
  meter = new Meter();
  mains: MainInfo[] = [];
  private suivis = new Map<string, Suivi>();

  async init(): Promise<void> {
    surResultat("mains", (r) => this.recevoir(r as ResMains));
    await initTache("mains");
  }

  demander(video: HTMLVideoElement, now: number): void {
    envoyer("mains", video, now);
  }

  private recevoir(r: ResMains): void {
    const now = performance.now();
    const mains: MainInfo[] = [];
    for (const m of r.mains) {
      const pts = m.points;
      // Image non miroir : MediaPipe étiquette comme en selfie inversé.
      const cote: MainInfo["cote"] = m.brut === "Left" ? "droite" : "gauche";
      const echelle = d(pts[0], pts[9]) || 1e-4;
      let etendus = 0;
      for (let f = 0; f < 4; f++) {
        if (d(pts[0], pts[TIPS[f]]) > d(pts[0], pts[PIPS[f]]) * 1.08) etendus++;
      }
      const ouvertureBrute = etendus / 4;
      const pinceBrute = clamp01(1 - d(pts[4], pts[8]) / (echelle * 1.1));

      const s = this.suivis.get(cote) ?? { ouverture: ouvertureBrute, pince: 0, basT: 0, lacherJusqua: 0 };
      s.ouverture += (ouvertureBrute - s.ouverture) * 0.35;
      s.pince += (pinceBrute - s.pince) * 0.35;
      if (s.ouverture < 0.3) s.basT = now;
      // « lâcher » : ouverture franche depuis un poing dans la demi-seconde.
      if (s.ouverture > 0.72 && s.basT > 0 && now - s.basT < 550) s.lacherJusqua = now + 700;
      this.suivis.set(cote, s);

      let geste: Geste = "—";
      if (now < s.lacherJusqua) geste = "lâcher";
      else if (s.pince > 0.78 && s.ouverture < 0.8) geste = "tirer";
      else if (s.ouverture < 0.22) geste = "serrer";
      else if (s.ouverture > 0.85) geste = "pousser";

      mains.push({ cote, points: pts, ouverture: s.ouverture, pince: s.pince, geste });
    }
    this.mains = mains;
    this.meter.tick(r.latence, now);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    for (const m of this.mains) {
      const X = (p: Pt) => (1 - p.x) * w;
      const Y = (p: Pt) => p.y * h;
      ctx.strokeStyle = m.geste === "—" ? "rgba(138,131,111,0.6)" : "rgba(224,164,88,0.9)";
      ctx.lineWidth = 1.5;
      for (const c of HandLandmarker.HAND_CONNECTIONS) {
        const a = m.points[c.start];
        const b = m.points[c.end];
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        ctx.stroke();
      }
      ctx.fillStyle = "#e0d6c0";
      for (const p of m.points) {
        ctx.beginPath();
        ctx.arc(X(p), Y(p), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const poignet = m.points[0];
      ctx.fillStyle = "#e0a458";
      ctx.font = "13px system-ui";
      ctx.fillText(`${m.cote}${m.geste === "—" ? "" : " · " + m.geste}`, X(poignet) - 30, Y(poignet) + 18);
    }
  }
}

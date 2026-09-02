import { PoseLandmarker } from "@mediapipe/tasks-vision"; // constantes de squelette seulement
import { initTache, surResultat, envoyer } from "./visionClient";
import type { ResPose } from "./worker";
import { Meter, clamp01 } from "./meter";

interface Pt { x: number; y: number; z: number; visibility?: number }

// Proxy du moteur pose (worker) : silhouette (masque) + corps (33 points).
export class PoseEngine {
  meter = new Meter();
  landmarks: Pt[] | null = null;
  aire = 0; // fraction de l'image couverte par la silhouette
  boiteHauteur = 0; // hauteur de la boîte de la silhouette, 0..1
  centreX = 0.5;
  vitesseX = 0; // unités image / s, pour la parallaxe du repli profondeur
  maskBitmap: ImageBitmap | null = null;
  detail = { detect: 0, masque: 0 };
  private lastT = 0;

  async init(): Promise<void> {
    surResultat("pose", (r) => this.recevoir(r as ResPose));
    await initTache("pose");
  }

  demander(video: HTMLVideoElement, now: number): void {
    envoyer("pose", video, now);
  }

  private recevoir(r: ResPose): void {
    const now = performance.now();
    this.landmarks = r.landmarks;
    this.aire = r.aire;
    this.boiteHauteur = r.boiteHauteur;
    this.detail = r.detail;
    if (this.lastT > 0) {
      const dt = (now - this.lastT) / 1000;
      if (dt > 0) this.vitesseX += ((r.centreX - this.centreX) / dt - this.vitesseX) * 0.3;
    }
    this.centreX = r.centreX;
    this.lastT = now;
    this.maskBitmap?.close();
    this.maskBitmap = r.maskBitmap;
    this.meter.tick(r.latence, now);
  }

  // Présence normalisée : visibilité moyenne des 33 points.
  get presence(): number {
    if (!this.landmarks) return 0;
    let s = 0;
    for (const p of this.landmarks) s += p.visibility ?? 0;
    return clamp01(s / this.landmarks.length);
  }

  drawSilhouette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    if (!this.maskBitmap) return;
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.maskBitmap, -w, 0, w, h);
    ctx.restore();
  }

  drawCorps(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    const pts = this.landmarks;
    if (!pts) return;
    const X = (p: Pt) => (1 - p.x) * w; // miroir
    const Y = (p: Pt) => p.y * h;
    ctx.strokeStyle = "rgba(224,164,88,0.65)";
    ctx.lineWidth = 1.5;
    for (const c of PoseLandmarker.POSE_CONNECTIONS) {
      const a = pts[c.start];
      const b = pts[c.end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
      ctx.stroke();
    }
    ctx.fillStyle = "#e0d6c0";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(X(p), Y(p), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

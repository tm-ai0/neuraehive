import { initTache, surResultat, envoyer } from "./visionClient";
import type { ResVisage } from "./worker";
import { Meter, clamp01 } from "./meter";

// Blendshapes réduits à trois verbes : souffle (bouche), lumière (sourcils), clin (yeux).
export class FaceEngine {
  meter = new Meter();
  souffle = 0;
  lumiere = 0;
  clin = 0;
  brut = { pucker: 0, funnel: 0, joues: 0, machoire: 0 }; // composantes du souffle, pour calibrer devant une vraie personne
  private points: { x: number; y: number }[] | null = null;

  async init(): Promise<void> {
    surResultat("visage", (r) => this.recevoir(r as ResVisage));
    await initTache("visage");
  }

  demander(video: HTMLVideoElement, now: number): void {
    envoyer("visage", video, now);
  }

  private recevoir(r: ResVisage): void {
    this.points = r.points;
    if (r.formes) {
      const g = (n: string) => r.formes![n] ?? 0;
      this.brut = { pucker: g("mouthPucker"), funnel: g("mouthFunnel"), joues: g("cheekPuff"), machoire: g("jawOpen") };
      // Souffler = joues gonflées ou lèvres en avant ; à 2 m ces formes restent
      // faibles (mesuré 0,01-0,04 sur capture), d'où un gain ×3 après un plancher.
      const bouche = Math.max(this.brut.joues, this.brut.funnel, this.brut.pucker, this.brut.machoire * 0.5);
      const soufBrut = clamp01((bouche - 0.02) * 3);
      const lumBrut = clamp01(g("browInnerUp") * 1.25);
      const clinBrut = clamp01(Math.max(g("eyeBlinkLeft"), g("eyeBlinkRight")));
      this.souffle += (soufBrut - this.souffle) * 0.4;
      this.lumiere += (lumBrut - this.lumiere) * 0.4;
      this.clin += (clinBrut - this.clin) * 0.6;
    } else {
      this.souffle *= 0.9;
      this.lumiere *= 0.9;
      this.clin *= 0.9;
    }
    this.meter.tick(r.latence, performance.now());
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    if (!this.points) return;
    ctx.fillStyle = "rgba(224,214,192,0.55)";
    for (const p of this.points) {
      ctx.fillRect((1 - p.x) * w, p.y * h, 1.2, 1.2);
    }
  }
}

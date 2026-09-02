// Cadence réelle (Hz) et latence (ms) d'un signal, lissées par EMA.
export class Meter {
  hz = 0;
  ms = 0;
  private last = 0;

  tick(latenceMs: number, now: number): void {
    if (this.last > 0) {
      const dt = now - this.last;
      if (dt > 0) this.hz += (1000 / dt - this.hz) * 0.15;
    }
    this.last = now;
    this.ms += (latenceMs - this.ms) * 0.2;
  }

  reset(): void {
    this.hz = 0;
    this.ms = 0;
    this.last = 0;
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

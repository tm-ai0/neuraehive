// Modulation matrix, synth style. Sources: up to ten LFOs (sine, triangle,
// saw, square, smoothed random — rate, amplitude, phase, transient sync),
// the sound (bass, treble, transients) and the gesture energy. Targets: any
// registered panel parameter, the A/B crossfade included. Each link has a
// depth; the target keeps a center value the modulation breathes around.
// Everything runs on the CPU in a few dozen operations per frame — the
// image never pays for it.

export interface ParamRef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Categorical value: rendered as a select. The crossfade still morphs it
   * continuously — fractional values blend in the render. */
  discrete?: boolean;
  /** Writing it reshapes the imprint cloud (resampled on a slow cadence). */
  imprint?: boolean;
  /** Chaos may draw this parameter, inside this range (clamped to min/max).
   * Every setting, present or future, declares its chaos reach here — the
   * registry is the only gate. */
  chaos?: [number, number];
  /** Chaos rounds its draw to a whole value (materials, symmetries). */
  chaosSnap?: boolean;
  /** Derived or transport value (macro, crossfade): never captured in a
   * preset, never a chaos target. */
  transient?: boolean;
  /** Internal plumbing (crossfade material pair): registered so every
   * engine can write it, but never shown and never a modulation target. */
  hidden?: boolean;
  get(): number;
  set(v: number): void;
}

export type LfoShape = "sinus" | "triangle" | "scie" | "carre" | "aleatoire";
export const LFO_SHAPES: LfoShape[] = [
  "sinus",
  "triangle",
  "scie",
  "carre",
  "aleatoire",
];

export interface Lfo {
  shape: LfoShape;
  rate: number; // Hz
  amp: number; // 0..1
  phase: number; // 0..1 offset
  sync: boolean; // retrigger on audio transients
}

export interface ModLink {
  source: string; // "lfo1".."lfo10" | "basses" | "aigus" | "transitoires" | "geste"
  target: string; // ParamRef key
  depth: number; // -1..1
}

export interface ModSources {
  bass: number;
  treble: number;
  transient: number;
  gesture: number;
}

export const MAX_LFOS = 10;

export interface ModMatrixData {
  lfos: Lfo[];
  links: ModLink[];
}

const defaultLfo = (): Lfo => ({
  shape: "sinus",
  rate: 0.25,
  amp: 1,
  phase: 0,
  sync: false,
});

export function createModMatrix(params: ParamRef[]) {
  const byKey = new Map(params.map((p) => [p.key, p]));
  // Two LFOs from the start: the Curieux mode plays them without ceremony.
  const lfos: Lfo[] = [defaultLfo(), defaultLfo()];
  const links: ModLink[] = [];
  const centers = new Map<string, number>();

  // Per-LFO runtime: free-running phase + smoothed-random endpoints.
  const acc: number[] = Array.from({ length: MAX_LFOS }, () => Math.random());
  const rndPrev: number[] = Array.from({ length: MAX_LFOS }, () => 0);
  const rndNext: number[] = Array.from(
    { length: MAX_LFOS },
    () => Math.random() * 2 - 1
  );
  let prevTransient = 0;

  const linksOf = (key: string) => links.filter((l) => l.target === key);

  function ensureCenter(key: string) {
    if (!centers.has(key)) centers.set(key, byKey.get(key)?.get() ?? 0);
  }

  function releaseTarget(key: string) {
    if (linksOf(key).length > 0) return;
    const c = centers.get(key);
    centers.delete(key);
    const def = byKey.get(key);
    if (def && c !== undefined) def.set(Math.min(def.max, Math.max(def.min, c)));
  }

  function lfoSignal(i: number): number {
    const lfo = lfos[i];
    if (!lfo) return 0;
    const p = (acc[i]! + lfo.phase) % 1;
    let s: number;
    switch (lfo.shape) {
      case "sinus":
        s = Math.sin(p * Math.PI * 2);
        break;
      case "triangle":
        s = 1 - 4 * Math.abs(p - 0.5);
        break;
      case "scie":
        s = p * 2 - 1;
        break;
      case "carre":
        s = p < 0.5 ? 1 : -1;
        break;
      case "aleatoire": {
        const f = p * p * (3 - 2 * p);
        s = rndPrev[i]! + (rndNext[i]! - rndPrev[i]!) * f;
        break;
      }
    }
    return s * lfo.amp;
  }

  function sourceSignal(source: string, s: ModSources): number {
    if (source.startsWith("lfo")) {
      const i = Number(source.slice(3)) - 1;
      return i >= 0 && i < lfos.length ? lfoSignal(i) : 0;
    }
    // Audio and gesture are unipolar: silence rests at the center value.
    switch (source) {
      case "basses":
        return Math.min(1, s.bass);
      case "aigus":
        return Math.min(1, s.treble);
      case "transitoires":
        return Math.min(1, s.transient);
      case "geste":
        return Math.min(1, s.gesture);
      default:
        return 0;
    }
  }

  return {
    lfos,
    links,
    get sourceNames(): string[] {
      return [
        ...lfos.map((_, i) => `lfo${i + 1}`),
        "basses",
        "aigus",
        "transitoires",
        "geste",
      ];
    },
    addLfo(): boolean {
      if (lfos.length >= MAX_LFOS) return false;
      lfos.push(defaultLfo());
      return true;
    },
    removeLfo() {
      if (lfos.length <= 1) return;
      lfos.pop();
      const gone = `lfo${lfos.length + 1}`;
      for (let i = links.length - 1; i >= 0; i--) {
        if (links[i]!.source === gone) {
          const key = links[i]!.target;
          links.splice(i, 1);
          releaseTarget(key);
        }
      }
    },
    addLink(source: string, target: string): ModLink | undefined {
      if (!byKey.has(target)) return undefined;
      ensureCenter(target);
      const link: ModLink = { source, target, depth: 0.3 };
      links.push(link);
      return link;
    },
    removeLink(link: ModLink) {
      const i = links.indexOf(link);
      if (i < 0) return;
      links.splice(i, 1);
      releaseTarget(link.target);
    },
    /** Re-point an existing link (the Curieux one-row UI). */
    retarget(link: ModLink, target: string) {
      if (!byKey.has(target)) return;
      const old = link.target;
      link.target = target;
      releaseTarget(old);
      ensureCenter(target);
    },
    isModulated(key: string): boolean {
      return centers.has(key);
    },
    /** The base value the modulation breathes around, if this key has one. */
    centerOf(key: string): number | undefined {
      return centers.get(key);
    },
    /** An authored write (slider, MIDI, preset, crossfade) moves the center,
     * so the modulation keeps breathing around the hand's position. */
    onAuthored(key: string, value: number) {
      if (centers.has(key)) centers.set(key, value);
    },
    activeTargets(): string[] {
      return [...centers.keys()];
    },
    /** One frame. Returns true when an imprint parameter was touched. */
    update(dt: number, sources: ModSources): boolean {
      // Advance LFO phases; transient rising edge retriggers synced ones.
      const rising = sources.transient > 0.55 && prevTransient <= 0.55;
      prevTransient = sources.transient;
      for (let i = 0; i < lfos.length; i++) {
        const lfo = lfos[i]!;
        if (rising && lfo.sync) acc[i] = 0;
        const before = acc[i]!;
        acc[i] = before + dt * Math.max(0, lfo.rate);
        if (acc[i]! >= 1) {
          acc[i] = acc[i]! % 1;
          rndPrev[i] = rndNext[i]!;
          rndNext[i] = Math.random() * 2 - 1;
        }
      }
      if (links.length === 0) return false;

      // The crossfade first: its write cascades into other targets' centers.
      const keys = [...centers.keys()].sort((a, b) =>
        a === "xfade" ? -1 : b === "xfade" ? 1 : 0
      );
      let imprintTouched = false;
      for (const key of keys) {
        const def = byKey.get(key);
        if (!def) continue;
        const own = linksOf(key);
        if (own.length === 0) continue;
        let v = centers.get(key)!;
        const span = (def.max - def.min) * 0.5;
        for (const link of own) {
          v += link.depth * sourceSignal(link.source, sources) * span;
        }
        def.set(Math.min(def.max, Math.max(def.min, v)));
        if (def.imprint) imprintTouched = true;
      }
      return imprintTouched;
    },
    serialize(): ModMatrixData {
      return {
        lfos: lfos.map((l) => ({ ...l })),
        links: links.map((l) => ({ ...l })),
      };
    },
    load(data: ModMatrixData | undefined) {
      for (const key of [...centers.keys()]) {
        centers.delete(key);
      }
      links.length = 0;
      lfos.length = 0;
      const inLfos = data?.lfos?.length ? data.lfos : [defaultLfo(), defaultLfo()];
      for (const l of inLfos.slice(0, MAX_LFOS)) lfos.push({ ...defaultLfo(), ...l });
      if (lfos.length < 2) lfos.push(defaultLfo());
      for (const l of data?.links ?? []) {
        if (!byKey.has(l.target)) continue;
        ensureCenter(l.target);
        links.push({ source: l.source, target: l.target, depth: l.depth ?? 0.3 });
      }
    },
  };
}

export type ModMatrix = ReturnType<typeof createModMatrix>;

// Modulation matrix, synth style. v0.7.1e — four LFOs, always four, each
// with a shape (sine, triangle, saw, square, sampled random), a frequency
// in Hz or as a division of the shared tempo (a quarter beat to four bars),
// an amplitude and ONE direct target: any registered panel parameter — the
// macros, the imprint transforms and the four global composition settings
// (luminosité, zoom, rotation, teinte) included. The links page still wires
// the sound bands and the gesture to extra targets. Each target keeps a
// center value the modulation breathes around. Everything runs on the CPU
// in a few dozen operations per frame — the image never pays for it.

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

/** Tempo divisions, in beats per LFO cycle: 1/4 beat up to 4 bars (4/4). */
export const TEMPO_DIVS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

export interface Lfo {
  shape: LfoShape;
  rate: number; // Hz (free mode)
  amp: number; // 0..1 — the one amplitude control
  phase: number; // 0..1 offset
  sync: boolean; // retrigger on audio transients
  useTempo: boolean; // frequency follows the shared tempo
  div: number; // beats per cycle when useTempo (TEMPO_DIVS)
  target: string; // ParamRef key, "" = none
}

export interface ModLink {
  source: string; // "lfo1".."lfo4" | "basses" | "aigus" | "transitoires" | "geste"
  target: string; // ParamRef key
  depth: number; // -1..1
}

export interface ModSources {
  bass: number;
  treble: number;
  transient: number;
  gesture: number;
}

export const LFO_COUNT = 4;

export interface ModMatrixData {
  lfos: Lfo[];
  links: ModLink[];
  tempo?: number;
}

const defaultLfo = (): Lfo => ({
  shape: "sinus",
  rate: 0.25,
  amp: 0.5,
  phase: 0,
  sync: false,
  useTempo: false,
  div: 4,
  target: "",
});

export function createModMatrix(params: ParamRef[]) {
  const byKey = new Map(params.map((p) => [p.key, p]));
  // Always four LFOs: a fixed rack, no ceremony.
  const lfos: Lfo[] = Array.from({ length: LFO_COUNT }, defaultLfo);
  const links: ModLink[] = [];
  const centers = new Map<string, number>();
  let tempo = 120; // BPM, shared by every tempo-synced LFO

  // Per-LFO runtime: free-running phase + smoothed-random endpoints.
  const acc: number[] = Array.from({ length: LFO_COUNT }, () => Math.random());
  const rndPrev: number[] = Array.from({ length: LFO_COUNT }, () => 0);
  const rndNext: number[] = Array.from(
    { length: LFO_COUNT },
    () => Math.random() * 2 - 1
  );
  let prevTransient = 0;

  const occupantsOf = (key: string) =>
    links.filter((l) => l.target === key).length +
    lfos.filter((l) => l.target === key).length;

  function ensureCenter(key: string) {
    if (!centers.has(key)) centers.set(key, byKey.get(key)?.get() ?? 0);
  }

  function releaseTarget(key: string) {
    if (occupantsOf(key) > 0) return;
    const c = centers.get(key);
    centers.delete(key);
    const def = byKey.get(key);
    if (def && c !== undefined) def.set(Math.min(def.max, Math.max(def.min, c)));
  }

  function lfoHz(lfo: Lfo): number {
    if (!lfo.useTempo) return Math.max(0, lfo.rate);
    return tempo / 60 / Math.max(0.25, lfo.div);
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
    get tempo() {
      return tempo;
    },
    set tempo(bpm: number) {
      tempo = Math.min(220, Math.max(40, bpm));
    },
    get sourceNames(): string[] {
      return [
        ...lfos.map((_, i) => `lfo${i + 1}`),
        "basses",
        "aigus",
        "transitoires",
        "geste",
      ];
    },
    /** Point an LFO at a registry key ("" clears it). Centers follow. */
    setLfoTarget(i: number, target: string) {
      const lfo = lfos[i];
      if (!lfo) return;
      if (target && !byKey.has(target)) return;
      const old = lfo.target;
      lfo.target = target;
      if (old && old !== target) releaseTarget(old);
      if (target) ensureCenter(target);
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
        acc[i] = acc[i]! + dt * lfoHz(lfo);
        if (acc[i]! >= 1) {
          acc[i] = acc[i]! % 1;
          rndPrev[i] = rndNext[i]!;
          rndNext[i] = Math.random() * 2 - 1;
        }
      }

      // Sum every contribution per target: the LFOs' direct targets first,
      // then the wired links — both breathe around the same center.
      const delta = new Map<string, number>();
      for (let i = 0; i < lfos.length; i++) {
        const key = lfos[i]!.target;
        if (!key) continue;
        delta.set(key, (delta.get(key) ?? 0) + lfoSignal(i));
      }
      for (const link of links) {
        delta.set(
          link.target,
          (delta.get(link.target) ?? 0) +
            link.depth * sourceSignal(link.source, sources)
        );
      }
      if (delta.size === 0) return false;

      // The crossfade first: its write cascades into other targets' centers.
      const keys = [...delta.keys()].sort((a, b) =>
        a === "xfade" ? -1 : b === "xfade" ? 1 : 0
      );
      let imprintTouched = false;
      for (const key of keys) {
        const def = byKey.get(key);
        if (!def) continue;
        ensureCenter(key);
        const span = (def.max - def.min) * 0.5;
        const v = centers.get(key)! + delta.get(key)! * span;
        def.set(Math.min(def.max, Math.max(def.min, v)));
        if (def.imprint) imprintTouched = true;
      }
      return imprintTouched;
    },
    serialize(): ModMatrixData {
      return {
        lfos: lfos.map((l) => ({ ...l })),
        links: links.map((l) => ({ ...l })),
        tempo,
      };
    },
    load(data: ModMatrixData | undefined) {
      for (const key of [...centers.keys()]) {
        centers.delete(key);
      }
      links.length = 0;
      tempo = Math.min(220, Math.max(40, data?.tempo ?? 120));
      for (let i = 0; i < LFO_COUNT; i++) {
        const src = data?.lfos?.[i];
        lfos[i] = { ...defaultLfo(), ...src };
        if (lfos[i]!.target && !byKey.has(lfos[i]!.target)) lfos[i]!.target = "";
        if (lfos[i]!.target) ensureCenter(lfos[i]!.target);
        acc[i] = Math.random();
      }
      for (const l of data?.links ?? []) {
        if (!byKey.has(l.target)) continue;
        ensureCenter(l.target);
        links.push({ source: l.source, target: l.target, depth: l.depth ?? 0.3 });
      }
    },
  };
}

export type ModMatrix = ReturnType<typeof createModMatrix>;

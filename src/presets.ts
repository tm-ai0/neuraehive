// Presets: the full panel state as one small JSON — every registered
// parameter, the palette colors, the imprint choice, the modulation matrix
// and the MIDI bindings. Saved to a local file, loaded from one, never sent
// anywhere. A/B slots hold two full states and one slider morphs every
// value continuously between them, colors included — the VJ's base gesture.

import {
  cloneLookColors,
  lerpLookColors,
  PALETTES,
  applyPalette,
  type LookColors,
} from "./look";
import type { ImprintFamily, ImprintSettings } from "./imprints";
import type { ModMatrixData, ParamRef } from "./modmatrix";
import type { MidiBindings } from "./midi";

export interface PresetData {
  version: 1;
  name: string;
  values: Record<string, number>;
  colors: LookColors;
  imprint: { family: ImprintFamily; variant: string; text: string; random: boolean };
  mod?: ModMatrixData;
  midi?: MidiBindings;
}

export interface PresetHooks {
  /** Authored write: def.set + modulation center + row display. */
  writeParam(def: ParamRef, value: number): void;
  /** The center value of a modulated param (its base), if any. */
  baseValue(key: string): number | undefined;
  applyImprint(family: ImprintFamily, variant: string, text: string): void;
  getMod(): ModMatrixData;
  setMod(data: ModMatrixData | undefined): void;
  getMidi(): MidiBindings;
  setMidi(data: MidiBindings | undefined): void;
  /** Colors or imprint changed from outside the panel: re-render it. */
  onApplied(): void;
}

export function createPresets(
  params: ParamRef[],
  colors: LookColors,
  imprint: ImprintSettings,
  hooks: PresetHooks
) {
  // The crossfade and the macro sliders are transport, not state: they
  // never enter a captured preset.
  const stateParams = params.filter((p) => p.key !== "xfade" && !p.transient);
  const byKey = new Map(stateParams.map((p) => [p.key, p]));
  const allByKey = new Map(params.map((p) => [p.key, p]));
  const writeKey = (key: string, v: number) => {
    const def = allByKey.get(key);
    if (def) hooks.writeParam(def, Math.min(def.max, Math.max(def.min, v)));
  };

  let xfade = 0;
  let slotA: PresetData | undefined;
  let slotB: PresetData | undefined;
  let xfadeSide: "A" | "B" = "A"; // which discrete side is currently applied

  function capture(name: string): PresetData {
    const values: Record<string, number> = {};
    for (const def of stateParams) {
      values[def.key] = hooks.baseValue(def.key) ?? def.get();
    }
    return {
      version: 1,
      name,
      values,
      colors: cloneLookColors(colors),
      imprint: {
        family: imprint.family,
        variant: imprint.variant,
        text: imprint.text,
        random: imprint.random,
      },
      mod: hooks.getMod(),
      midi: hooks.getMidi(),
    };
  }

  function writeColors(next: LookColors) {
    colors.stops = next.stops.map((s) => [...s] as typeof s);
    colors.bg = [...next.bg] as typeof next.bg;
    colors.grade = [...next.grade] as typeof next.grade;
    colors.ink = [...next.ink] as typeof next.ink;
    colors.name = next.name;
  }

  function apply(data: PresetData, opts: { withWiring?: boolean } = {}) {
    for (const [key, value] of Object.entries(data.values)) {
      const def = byKey.get(key);
      if (def && Number.isFinite(value)) {
        hooks.writeParam(def, Math.min(def.max, Math.max(def.min, value)));
      }
    }
    writeColors(data.colors);
    // A scene applies whole: no crossfade material pair left active.
    writeKey("matBlend", 0);
    imprint.random = data.imprint.random;
    hooks.applyImprint(
      data.imprint.family,
      data.imprint.variant,
      data.imprint.text
    );
    if (opts.withWiring !== false) {
      if (data.mod) hooks.setMod(data.mod);
      if (data.midi) hooks.setMidi(data.midi);
    }
    hooks.onApplied();
  }

  // The default state, snapshotted at boot — the base of the built-ins.
  const defaultState = capture("défaut");

  function builtIn(
    name: string,
    paletteName: string,
    overrides: Record<string, number>,
    imprintOverride?: PresetData["imprint"]
  ): PresetData {
    const p = structuredClone(defaultState);
    p.name = name;
    Object.assign(p.values, overrides);
    const palette = PALETTES.find((x) => x.name === paletteName)!;
    applyPalette(p.colors, palette);
    p.values.blendMode = palette.blend;
    if (imprintOverride) p.imprint = imprintOverride;
    delete p.mod;
    delete p.midi;
    return p;
  }

  // Scenes: moments, not colors. Each one dresses the body in a matter and
  // sets the weather around it; the tint underneath is just one ingredient.
  const builtIns: PresetData[] = [
    // Veillée — the piece at rest: smoke body in a dense dust field.
    builtIn("veillee", "cendre", {
      bodyMat: 0,
      fondMat: 0,
      trails: 0.9,
    }),
    // Givre du matin — slow frost, the body a screen of points.
    builtIn("givre-matin", "givre", {
      viscosity: 4.2,
      trails: 0.93,
      halo: 0.4,
      colorDriver: 1,
      timeScale: 0.55,
      force: 0.9,
      bodyMat: 3,
      fondMat: 0,
    }),
    // Forge — embers, sparks, a smoke body that tears easily.
    builtIn("forge", "braise", {
      ember: 1.6,
      turbulence: 0.85,
      trails: 0.87,
      colorDriver: 1,
      halo: 0.25,
      bodyMat: 0,
      comet: 1.4,
    }),
    // Marée — phosphorescent water: everything pours.
    builtIn("maree", "phosphore", {
      bodyMat: 1,
      fondMat: 1,
      trails: 0.93,
      halo: 0.35,
      viscosity: 3,
      colorDriver: 1,
    }),
    // Transe — the copper mandala turns on the music around whoever stands.
    builtIn("transe", "cuivre", {
      symMode: 4,
      symN: 8,
      colorDriver: 0,
      halo: 0.3,
      trails: 0.9,
      bodyMat: 7,
      balance: 0.65,
    }),
    // Pulsar — a living Julia set pumping on the beat, phosphor sparks.
    builtIn(
      "pulsar",
      "phosphore",
      {
        balance: 0.7,
        halo: 0.45,
        trails: 0.93,
        colorDriver: 1,
        turbulence: 0.4,
        bodyMat: 3,
        presenceShare: 0.45,
        fondVisible: 0.25,
        ember: 1.2,
        strobe: 0.15,
      },
      { family: "fractale", variant: "julia", text: "lumière", random: false }
    ),
    // Canopée — a copper fern swaying to the music, outlined bodies below.
    builtIn(
      "canopee",
      "cuivre",
      {
        balance: 0.6,
        trails: 0.94,
        halo: 0.3,
        viscosity: 3,
        bodyMat: 7,
        fondVisible: 0.3,
        colorDriver: 0,
      },
      { family: "math", variant: "arbre", text: "lumière", random: false }
    ),
    // Encre — ink body on a dimmed paper field, long brush strokes.
    builtIn(
      "encre",
      "papier",
      {
        bodyMat: 2,
        fondMat: 0,
        fondVisible: 0.25,
        trails: 0.95,
        presenceTrail: 3,
        paperGrain: 0.5,
        turbulence: 0.25,
        force: 0.9,
        exposure: 1.3,
        colorDriver: 0,
      },
      { family: "ondes", variant: "sinus", text: "lumière", random: false }
    ),
    // Éclats — the shove made visible: a body of colored shards that fly in
    // the direction of every gesture; the field keeps its default smoke.
    builtIn("eclats", "cendre", {
      bodyMat: 8,
      fondMat: 0,
      push: 1.4,
      trails: 0.9,
    }),
  ];

  function applyCrossfade(t: number) {
    xfade = Math.min(1, Math.max(0, t));
    if (!slotA || !slotB) return;
    for (const def of stateParams) {
      const a = slotA.values[def.key];
      const b = slotB.values[def.key];
      if (a === undefined || b === undefined) continue;
      // Continuous end to end: former "choices" (fusion, symmetry,
      // materials, drivers) take fractional values the render blends.
      const v = a + (b - a) * xfade;
      hooks.writeParam(def, Math.min(def.max, Math.max(def.min, v)));
    }
    // Materials never sweep through the ladder between A and B: the render
    // blends the two endpoint materials directly, grain by grain.
    const bA = slotA.values.bodyMat;
    const bB = slotB.values.bodyMat;
    if (bA !== undefined && bB !== undefined) {
      writeKey("bodyMatA", bA);
      writeKey("bodyMatB", bB);
    }
    const fA = slotA.values.fondMat;
    const fB = slotB.values.fondMat;
    if (fA !== undefined && fB !== undefined) {
      writeKey("fondMatA", fA);
      writeKey("fondMatB", fB);
    }
    writeKey("matBlend", xfade);
    writeColors(lerpLookColors(slotA.colors, slotB.colors, xfade));
    const side = xfade < 0.5 ? "A" : "B";
    if (side !== xfadeSide) {
      xfadeSide = side;
      const im = side === "A" ? slotA.imprint : slotB.imprint;
      imprint.random = im.random;
      hooks.applyImprint(im.family, im.variant, im.text);
    }
    // No onApplied here: the crossfade runs every input event (or every
    // frame under modulation) and must never rebuild the panel mid-drag.
  }

  function download(blob: Blob, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    // Late revoke: a throttled tab must not orphan the browser's download.
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }

  return {
    builtIns,
    get xfade() {
      return xfade;
    },
    get hasSlots() {
      return Boolean(slotA && slotB);
    },
    get slotNames(): [string | undefined, string | undefined] {
      return [slotA?.name, slotB?.name];
    },
    capture,
    apply,
    applyCrossfade,
    setSlot(which: "A" | "B") {
      const snap = capture(which === "A" ? "état A" : "état B");
      if (which === "A") slotA = snap;
      else slotB = snap;
      xfadeSide = xfade < 0.5 ? "A" : "B";
    },
    saveFile() {
      const data = capture(`cinerae ${new Date().toLocaleString("fr-FR")}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      download(blob, `cinerae-preset-${stamp}.json`);
    },
    async loadFile(file: File): Promise<string | undefined> {
      try {
        const data = JSON.parse(await file.text()) as PresetData;
        if (!data || data.version !== 1 || typeof data.values !== "object") {
          return "preset illisible — format inconnu";
        }
        apply(data);
        return undefined;
      } catch {
        return "preset illisible";
      }
    },
  };
}

export type Presets = ReturnType<typeof createPresets>;

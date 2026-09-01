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
  // The crossfade is itself a target (of modulation and MIDI); it is
  // transport, not state: it never enters a captured preset.
  const stateParams = params.filter((p) => p.key !== "xfade");
  const byKey = new Map(stateParams.map((p) => [p.key, p]));

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

  const builtIns: PresetData[] = [
    builtIn("Cendre", "cendre", {}),
    builtIn("Braise", "braise", {
      ember: 1.6,
      turbulence: 0.85,
      trails: 0.87,
      colorDriver: 1,
      halo: 0.25,
    }),
    builtIn("Givre", "givre", {
      viscosity: 4.2,
      trails: 0.93,
      halo: 0.4,
      colorDriver: 1,
      timeScale: 0.55,
      force: 0.9,
    }),
    builtIn("Mandala cuivre", "cuivre", {
      symMode: 4,
      symN: 8,
      colorDriver: 0,
      halo: 0.3,
      trails: 0.9,
    }),
    builtIn("Phosphore", "phosphore", {
      colorDriver: 1,
      blendMode: 3,
      trails: 0.72,
      strobe: 0.25,
      turbulence: 0.9,
    }),
    builtIn(
      "Encre",
      "encre",
      {
        paperGrain: 0.45,
        turbulence: 0.3,
        force: 0.9,
        exposure: 1.3,
        colorDriver: 0,
      },
      { family: "ondes", variant: "sinus", text: "lumière", random: false }
    ),
  ];

  function applyCrossfade(t: number) {
    xfade = Math.min(1, Math.max(0, t));
    if (!slotA || !slotB) return;
    for (const def of stateParams) {
      const a = slotA.values[def.key];
      const b = slotB.values[def.key];
      if (a === undefined || b === undefined) continue;
      const v = def.discrete ? (xfade < 0.5 ? a : b) : a + (b - a) * xfade;
      hooks.writeParam(def, Math.min(def.max, Math.max(def.min, v)));
    }
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

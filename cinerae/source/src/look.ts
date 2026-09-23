// The look: named tints (teintes) and the live color state the renderer
// reads every frame. A tint is a gradient of 2..5 stops (evenly spaced),
// a background, a final grade tint, an ink color for the paper mode, and
// the body's own light/shadow pair (bichromie of the portrait layer).
// The default "Cendre" keeps the historical warm-white dust.

export type Rgb = [number, number, number];

export interface LookColors {
  /** Gradient stops, 2..5, evenly spaced along the driver axis. */
  stops: Rgb[];
  /** Canvas background (paper color in the subtractive mode). */
  bg: Rgb;
  /** Final multiplicative grade of the present pass. */
  grade: Rgb;
  /** Ink color of the subtractive (paper) mode. */
  ink: Rgb;
  /** Body layer: what the camera light paints a held grain with. */
  corpsLight: Rgb;
  /** Body layer: what the camera shadow paints a held grain with. */
  corpsShadow: Rgb;
  /** Name of the palette these colors came from, "" once hand-edited. */
  name: string;
}

export interface Palette {
  name: string;
  colors: Omit<LookColors, "name">;
  /** Suggested fusion mode applied with the palette (0 = additive). */
  blend: number;
  /** Light paper sheet: ordered screens would weave moiré artifacts on it,
   * so only stochastic body materials are allowed while it is active. */
  light?: boolean;
}

const hex = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];

export const PALETTES: Palette[] = [
  {
    name: "cendre",
    // Pure white stops + the historical warm grade = the v0.5 render.
    colors: {
      stops: [hex("#ffffff"), hex("#ffffff")],
      bg: hex("#050403"),
      grade: [1, 0.92, 0.8],
      ink: hex("#1c1712"),
      corpsShadow: hex("#4a4036"),
      corpsLight: hex("#fff2dd"),
    },
    blend: 0,
  },
  {
    name: "braise",
    colors: {
      stops: [hex("#e63c10"), hex("#ff9d3c"), hex("#ffe0a8")],
      bg: hex("#070302"),
      grade: [1, 0.9, 0.78],
      ink: hex("#33130a"),
      corpsShadow: hex("#7c2410"),
      corpsLight: hex("#ffe0a8"),
    },
    blend: 0,
  },
  {
    name: "givre",
    colors: {
      stops: [hex("#7fb2ff"), hex("#c8e4ff"), hex("#f2fbff")],
      bg: hex("#030408"),
      grade: [0.85, 0.93, 1],
      ink: hex("#12203a"),
      corpsShadow: hex("#27406a"),
      corpsLight: hex("#f2fbff"),
    },
    blend: 0,
  },
  {
    name: "cuivre",
    colors: {
      stops: [hex("#a04818"), hex("#e08a3c"), hex("#ffd9a0")],
      bg: hex("#060403"),
      grade: [1, 0.88, 0.76],
      ink: hex("#2e1a0c"),
      corpsShadow: hex("#5c2f12"),
      corpsLight: hex("#ffd9a0"),
    },
    blend: 0,
  },
  {
    name: "phosphore",
    colors: {
      stops: [hex("#1aff66"), hex("#b8ffd0")],
      bg: hex("#020503"),
      grade: [0.82, 1, 0.88],
      ink: hex("#0c2916"),
      corpsShadow: hex("#0e5c2c"),
      corpsLight: hex("#d8ffe6"),
    },
    blend: 0,
  },
  {
    name: "papier",
    // Flat warm-gray sheet, charcoal body: shadow = saturated black edge
    // ink, light = the diluted grey of a wash. Ordered screens are banned
    // on this light sheet (they weave a corduroy artifact): light: true.
    colors: {
      stops: [hex("#241f18"), hex("#5a4f40")],
      bg: hex("#cfc8ba"),
      grade: [1, 1, 1],
      ink: hex("#241f18"),
      corpsShadow: hex("#16130e"),
      corpsLight: hex("#6e6557"),
    },
    blend: 4,
    light: true,
  },
];

export function defaultLookColors(): LookColors {
  const p = PALETTES[0]!;
  return { ...clonePaletteColors(p), name: p.name };
}

function clonePaletteColors(p: Palette): Omit<LookColors, "name"> {
  return {
    stops: p.colors.stops.map((s) => [...s] as Rgb),
    bg: [...p.colors.bg] as Rgb,
    grade: [...p.colors.grade] as Rgb,
    ink: [...p.colors.ink] as Rgb,
    corpsLight: [...p.colors.corpsLight] as Rgb,
    corpsShadow: [...p.colors.corpsShadow] as Rgb,
  };
}

export function applyPalette(colors: LookColors, palette: Palette) {
  Object.assign(colors, clonePaletteColors(palette));
  colors.name = palette.name;
}

/** Perceived lightness of the canvas background: above ~0.5 the sheet is
 * light and ordered body screens are forbidden (Papier rule). */
export function isLightBg(colors: LookColors): boolean {
  const [r, g, b] = colors.bg;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/** Sample a gradient of evenly spaced stops at t in [0,1]. */
export function sampleStops(stops: Rgb[], t: number): Rgb {
  const n = stops.length;
  if (n === 1) return [...stops[0]!] as Rgb;
  const x = Math.min(Math.max(t, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const f = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Continuous morph between two color states (the A/B crossfade). Gradients
 * of different stop counts are resampled to the larger count. */
export function lerpLookColors(a: LookColors, b: LookColors, t: number): LookColors {
  const n = Math.max(a.stops.length, b.stops.length);
  const stops: Rgb[] = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    stops.push(lerp3(sampleStops(a.stops, u), sampleStops(b.stops, u), t));
  }
  return {
    stops,
    bg: lerp3(a.bg, b.bg, t),
    grade: lerp3(a.grade, b.grade, t),
    ink: lerp3(a.ink, b.ink, t),
    corpsLight: lerp3(a.corpsLight, b.corpsLight, t),
    corpsShadow: lerp3(a.corpsShadow, b.corpsShadow, t),
    name: t < 0.5 ? a.name : b.name,
  };
}

export function cloneLookColors(c: LookColors): LookColors {
  return {
    stops: c.stops.map((s) => [...s] as Rgb),
    bg: [...c.bg] as Rgb,
    grade: [...c.grade] as Rgb,
    ink: [...c.ink] as Rgb,
    corpsLight: [...(c.corpsLight ?? [1, 1, 1])] as Rgb,
    corpsShadow: [...(c.corpsShadow ?? [0.2, 0.2, 0.2])] as Rgb,
    name: c.name,
  };
}

// The imprint library. Every imprint is a one-shot CPU sampling that fills
// the same GPU target buffer the wordmark used to own: vec4 per point,
// xy = position, zw = unit normal scaled by the desired dust softness.
// Once sampled, an imprint costs the frame nothing; animated imprints
// (rotating volumes, drifting waves, Lissajous) are re-sampled on a slow
// cadence and the particles' own physics smooth the steps into motion.
//
// Two spaces: "shape" points are height-normalized and centered (like the
// wordmark, laid out by the renderer), "uv" points live directly in screen
// UV [0,1]^2 with scale 1 (waves, Chladni, silhouette, multi).
//
// Point order matters: the shader can stagger engagement by target rank, so
// curves ordered along their parameter draw themselves progressively and a
// text sorted by x crystallizes letter by letter.
import { TITLE_POINTS, type Wordmark } from "./wordmark";

export const IMPRINT_MAX_POINTS = 16_384;

export interface ImprintCloud {
  data: Float32Array<ArrayBuffer>;
  count: number;
  space: "shape" | "uv";
  /** shape space: ink width / ink height. */
  aspect: number;
  /** shape space: fraction of screen height; 0 = wordmark cap formula. */
  coverage: number;
  /** shape space: vertical center in UV. */
  offsetY: number;
  /** 0 = every point engages together, ->1 = strictly ordered build. */
  stagger: number;
}

export type ImprintFamily =
  | "titre"
  | "fond"
  | "volume"
  | "forme"
  | "math"
  | "fractale"
  | "ondes"
  | "texte"
  | "image"
  | "camera"
  | "multi";

export interface ImprintSettings {
  family: ImprintFamily;
  variant: string;
  random: boolean;
  text: string;
  wave: {
    shape: "sinus" | "triangle" | "carre" | "melange";
    freq: number;
    amp: number;
    thickness: number;
    waves: number;
    drift: number;
  };
  multi: { n: number; size: number };
  spin: number;
  lissa: { a: number; b: number };
}

// v0.7.1f — the piece opens and resets on pure abstract dust: the wordmark
// belongs to the intro only, the "titre" family left the picker.
export const DEFAULT_IMPRINT_SETTINGS: ImprintSettings = {
  family: "fond",
  variant: "",
  random: false,
  text: "lumière",
  wave: { shape: "sinus", freq: 2.5, amp: 0.09, thickness: 0.004, waves: 3, drift: 0.6 },
  multi: { n: 4, size: 0.2 },
  spin: 1,
  lissa: { a: 3, b: 2 },
};

export const IMPRINT_VARIANTS: Partial<Record<ImprintFamily, string[]>> = {
  volume: ["sphere", "cube", "cone", "tore"],
  forme: ["cercle", "anneau", "carre", "croix", "spirale", "etoile"],
  math: ["lissajous", "attracteur", "chladni", "arbre"],
  fractale: ["julia", "fougere", "dragon"],
  ondes: ["sinus", "triangle", "carre", "melange"],
  camera: ["gelee", "silhouette"],
};

// v0.7.1d — every imprint lives by its nature: an idle breath of its own,
// a sound deformation of its own, superposed. The orchestrator integrates
// this state every frame from the audio bands; the generators only read it.
// All fields are smooth in time, so the 7 Hz re-sampling morphs, never jumps.
export interface ImprintLife {
  /** Ever-advancing phase — waves travel on it, treble accelerates it. */
  phase: number;
  /** Integrated rotation angle — slow at rest, kicked by transients. */
  spin: number;
  /** 3D tilt of ring/attractor projections: breath + transient impulses. */
  tilt: number;
  /** Springy bass wind, ~-1..1 — the fern and the tree sway on it. */
  wind: number;
  /** Traveling phase of the gust rolling along a swaying shape. */
  windPhase: number;
  /** Smoothed low-mids 0..1 — the breadth of shapes. */
  amp: number;
  /** Smoothed mids 0..1 — Julia parameter, attractor depth. */
  mid: number;
  /** Smoothed treble 0..1 — harmonics drawn into the waves. */
  hi: number;
  /** Transient envelope 0..1, decays in ~0.3 s. */
  kick: number;
  /** Dragon fold 0.55..1 — 1 = fully folded; accents unfold it. */
  fold: number;
  /** Slow idle breath, sin of a ~20 s clock, -1..1. */
  breath: number;
  /** Chladni plate: current and next mode pair, sand mid-transition. */
  chladni: { mA: number; nA: number; mB: number; nB: number; blend: number };
}

/** The life a lone sampling context carries: slow breath, no sound. */
export function restingLife(time: number): ImprintLife {
  return {
    phase: time * 0.35,
    spin: time * 0.12,
    tilt: Math.sin(time * 0.21) * 0.3,
    wind: Math.sin(time * 0.17) * 0.25,
    windPhase: time * 0.5,
    amp: 0,
    mid: 0,
    hi: 0,
    kick: 0,
    fold: 0.93 + Math.sin(time * 0.3) * 0.03,
    breath: Math.sin(time * 0.3),
    chladni: { mA: 3, nA: 5, mB: 3, nB: 5, blend: 0 },
  };
}

export interface ImprintContext {
  time: number;
  screenAspect: number;
  life?: ImprintLife;
}

const TAU = Math.PI * 2;

// Deterministic per-index hash: animated imprints are re-sampled on a slow
// cadence, so every index must keep the SAME point on the shape across
// re-samplings — otherwise the targets jump and the matter averages into a
// blob instead of following the motion.
function hash01(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function makeCloud(
  count: number,
  space: "shape" | "uv",
  opts: Partial<Pick<ImprintCloud, "aspect" | "coverage" | "offsetY" | "stagger">> = {}
): ImprintCloud {
  return {
    data: new Float32Array(count * 4),
    count,
    space,
    aspect: opts.aspect ?? 1,
    coverage: opts.coverage ?? 0.55,
    offsetY: opts.offsetY ?? 0.5,
    stagger: opts.stagger ?? 0,
  };
}

function put(c: ImprintCloud, i: number, x: number, y: number, nx: number, ny: number) {
  const o = i * 4;
  c.data[o] = x;
  c.data[o + 1] = y;
  c.data[o + 2] = nx;
  c.data[o + 3] = ny;
}

export function titleCloud(wordmark: Wordmark): ImprintCloud {
  return {
    data: wordmark.data,
    count: TITLE_POINTS,
    space: "shape",
    aspect: wordmark.aspect,
    coverage: 0, // the validated wordmark cap formula
    offsetY: 0.42,
    stagger: 0,
  };
}

export function fondCloud(): ImprintCloud {
  return makeCloud(0, "shape");
}

// ---- 2D formes (shape space, ordered along their parameter) ---------------
// Deterministic per index (hash01, never Math.random): re-sampled at 7 Hz,
// every index must keep the same point on the shape across re-samplings.

type FlatShape = (count: number, life: ImprintLife) => ImprintCloud;

// The circle is really a ring in space: it turns slowly on itself and tips
// over on the transients — a coin of dust spinning in the dark.
function ring3D(count: number, life: ImprintLife, r0: number, r1: number, stagger: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger });
  const yaw = life.spin * 0.55;
  const tilt = 0.5 + life.breath * 0.25 + life.tilt;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ct = Math.cos(tilt);
  for (let i = 0; i < count; i++) {
    const a = (i / count + hash01(i) * 0.004) * TAU - Math.PI / 2;
    const r = r0 === r1 ? r0 : Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * hash01(i * 7 + 3));
    // In-plane point, rotate around the vertical axis, then tip the plane.
    const x1 = Math.cos(a) * r * cy;
    const y2 = Math.sin(a) * r * ct;
    put(c, i, x1, y2, Math.cos(a) * (cy || 0.2), Math.sin(a) * (ct || 0.2));
  }
  return c;
}

const cercle: FlatShape = (count, life) => ring3D(count, life, 0.5, 0.5, 0.5);
const anneau: FlatShape = (count, life) => ring3D(count, life, 0.36, 0.5, 0.35);

// The square holds its posture and breathes by its edges: low mids bow them
// outward, a hit pinches them back; a slow wobble keeps it off balance.
function carre(count: number, life: ImprintLife): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.5 });
  const th = Math.sin(life.spin * 0.45) * 0.1;
  const cr = Math.cos(th);
  const sr = Math.sin(th);
  const bow = life.breath * 0.02 + life.amp * 0.08 - life.kick * 0.05;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * 4;
    const edge = Math.floor(t) % 4;
    const u = (t % 1) - 0.5;
    const b = Math.cos(u * Math.PI) * bow;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    if (edge === 0) { x = u; y = -0.5 - b; ny = -1; }
    else if (edge === 1) { x = 0.5 + b; y = u; nx = 1; }
    else if (edge === 2) { x = -u; y = 0.5 + b; ny = 1; }
    else { x = -0.5 - b; y = -u; nx = -1; }
    put(c, i, x * cr - y * sr, x * sr + y * cr, nx * cr - ny * sr, nx * sr + ny * cr);
  }
  return c;
}

// The cross pivots gently and its arms trade length on the low mids.
function croix(count: number, life: ImprintLife): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.25 });
  const th = Math.sin(life.spin * 0.4) * 0.11;
  const cr = Math.cos(th);
  const sr = Math.sin(th);
  const swellH = 1 + (life.breath * 0.04 + life.amp * 0.14) * Math.sin(life.phase * 0.9);
  const swellV = 2 - swellH;
  for (let i = 0; i < count; i++) {
    const along = hash01(i * 3 + 1) - 0.5;
    const across = (hash01(i * 3 + 2) + hash01(i * 5 + 4) - 1) * 0.085;
    const a = hash01(i * 7 + 5) * TAU;
    const [x, y] = i % 2 === 0
      ? [along * swellH, across]
      : [across, along * swellV];
    put(c, i, x * cr - y * sr, x * sr + y * cr, Math.cos(a), Math.sin(a));
  }
  return c;
}

// The spiral winds and unwinds — low mids tighten the coil — while the whole
// arm turns slowly on itself.
function spirale(count: number, life: ImprintLife): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.6 });
  const turns = 3.25 + life.breath * 0.3 + life.amp * 0.9;
  const rot = life.spin * 0.35;
  for (let i = 0; i < count; i++) {
    const t = Math.sqrt((i + hash01(i * 3 + 1)) / count); // arc-length-ish density
    const a = t * turns * TAU + rot;
    const r = 0.5 * t;
    put(c, i, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a));
  }
  return c;
}

// The star flares: every accent throws its inner radius out, a brief blaze,
// then it sharpens back to its points.
function etoile(count: number, life: ImprintLife): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.5 });
  const R = 0.5 - life.kick * 0.04;
  const r = Math.min(0.42, 0.2 * (1 + life.kick * 0.6 + life.breath * 0.1 + life.amp * 0.2));
  const th = Math.sin(life.spin * 0.4) * 0.08;
  const verts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5 + th;
    const rad = k % 2 === 0 ? R : r;
    verts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const lens: number[] = [];
  let total = 0;
  for (let k = 0; k < 10; k++) {
    const [x0, y0] = verts[k]!;
    const [x1, y1] = verts[(k + 1) % 10]!;
    total += Math.hypot(x1 - x0, y1 - y0);
    lens.push(total);
  }
  for (let i = 0; i < count; i++) {
    const s = ((i + hash01(i * 5 + 2)) / count) * total;
    let k = 0;
    while (k < 9 && lens[k]! < s) k++;
    const prev = k === 0 ? 0 : lens[k - 1]!;
    const u = (s - prev) / (lens[k]! - prev);
    const [x0, y0] = verts[k]!;
    const [x1, y1] = verts[(k + 1) % 10]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    put(c, i, x0 + dx * u, y0 + dy * u, dy / l, -dx / l);
  }
  return c;
}

const FORMES: Record<string, FlatShape> = { cercle, anneau, carre, croix, spirale, etoile };

// ---- 3D volumes, slow rotation, orthographic projection -------------------

function volumePoint(variant: string, i: number): [number, number, number] {
  const h1 = hash01(i * 3 + 1);
  const h2 = hash01(i * 3 + 2);
  const h3 = hash01(i * 3 + 3);
  if (variant === "cube") {
    const s = 0.36;
    const edge = Math.floor(h1 * 12) % 12;
    const u = h2 * 2 - 1;
    const axis = edge >> 2; // 0: x varies, 1: y varies, 2: z varies
    const c1 = (edge & 1) === 0 ? -1 : 1;
    const c2 = (edge & 2) === 0 ? -1 : 1;
    if (axis === 0) return [u * s, c1 * s, c2 * s];
    if (axis === 1) return [c1 * s, u * s, c2 * s];
    return [c1 * s, c2 * s, u * s];
  }
  if (variant === "cone") {
    if (h1 < 0.45) {
      const a = h2 * TAU;
      return [Math.cos(a) * 0.42, 0.38, Math.sin(a) * 0.42];
    }
    if (h1 < 0.85) {
      const line = Math.floor(h2 * 10) % 10;
      const a = (line / 10) * TAU;
      const t = h3;
      return [Math.cos(a) * 0.42 * t, 0.38 * t - 0.5 * (1 - t), Math.sin(a) * 0.42 * t];
    }
    const a = h2 * TAU;
    const t = 0.35 + 0.3 * Math.round(h3);
    return [Math.cos(a) * 0.42 * t, 0.38 * t - 0.5 * (1 - t), Math.sin(a) * 0.42 * t];
  }
  if (variant === "tore") {
    const R = 0.34;
    const r = 0.145;
    const u = h1 * TAU;
    // Inverse-CDF-ish stretch instead of rejection, to stay deterministic:
    // bias v toward the outer rim where there is more surface.
    const v = h2 * TAU + (r / R) * Math.sin(h2 * TAU) * 0.5;
    const w = R + r * Math.cos(v);
    return [Math.cos(u) * w, Math.sin(v) * r, Math.sin(u) * w];
  }
  // sphere: wireframe of meridians and latitudes
  if (h1 < 0.55) {
    const m = Math.floor(h2 * 8) % 8;
    const a0 = (m / 8) * Math.PI;
    const t = h3 * TAU;
    const x = Math.cos(t) * 0.5;
    const y = Math.sin(t) * 0.5;
    return [y * Math.cos(a0), x, y * Math.sin(a0)];
  }
  const ring = 1 + (Math.floor(h2 * 5) % 5);
  const phi = (ring / 6) * Math.PI;
  const a = h3 * TAU;
  return [
    Math.sin(phi) * 0.5 * Math.cos(a),
    Math.cos(phi) * 0.5,
    Math.sin(phi) * 0.5 * Math.sin(a),
  ];
}

function volumeCloud(variant: string, life: ImprintLife, spin: number): ImprintCloud {
  const count = 6144;
  const c = makeCloud(count, "shape", { stagger: 0.3, coverage: 0.6 });
  // The tumble rides the integrated spin: idle it matches the historical
  // slow rotation, and every transient sends the volume rolling faster.
  const ax = 0.5 + life.spin * 1.75 * spin + life.tilt * 0.5;
  const ay = 0.7 + life.spin * 2.8 * spin;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  for (let i = 0; i < count; i++) {
    const [px, py, pz] = volumePoint(variant, i);
    // rotate around y, then x; orthographic drop of z
    const x1 = px * cy + pz * sy;
    const z1 = -px * sy + pz * cy;
    const y2 = py * cx - z1 * sx;
    const a = hash01(i * 5 + 4) * TAU;
    put(c, i, x1, y2, Math.cos(a), Math.sin(a));
  }
  return c;
}

// ---- mathématiques --------------------------------------------------------

// The curve never stops tracing itself — the phase only advances, treble
// hurries it — and the low mids stretch its horizontal reach.
function lissajousCloud(a: number, b: number, life: ImprintLife): ImprintCloud {
  const count = 6144;
  const c = makeCloud(count, "shape", { stagger: 0.55, aspect: 1.24, coverage: 0.6 });
  const delta = life.phase * 0.3;
  const sx = 0.62 * (1 + (life.breath * 0.03 + life.amp * 0.1) * Math.sin(life.phase * 0.5));
  for (let i = 0; i < count; i++) {
    const t = ((i + hash01(i)) / count) * TAU;
    const x = Math.sin(a * t + delta) * sx;
    const y = Math.sin(b * t) * 0.5;
    const tx = a * Math.cos(a * t + delta) * sx;
    const ty = b * Math.cos(b * t) * 0.5;
    const l = Math.hypot(tx, ty) || 1;
    put(c, i, x, y, ty / l, -tx / l);
  }
  return c;
}

// De Jong veils, mounted on a turning pedestal: each point lifts a third
// coordinate out of the same map, the whole sculpture rotates slowly and
// tips on the hits, and the mids deepen the relief. The 2D orbit itself
// never changes — chaos is too sensitive to morph — so every index keeps
// its exact point across re-samplings.
const DEJONG = { a: -2.24, b: 0.43, c: -0.65, d: -2.43 };
let dejongRaw: Float32Array | undefined;
function dejongOrbit(count: number): Float32Array {
  if (dejongRaw && dejongRaw.length >= count * 2) return dejongRaw;
  const raw = new Float32Array(count * 2);
  let x = 0.1;
  let y = 0.1;
  for (let i = 0; i < 24; i++) {
    const nx = Math.sin(DEJONG.a * y) - Math.cos(DEJONG.b * x);
    y = Math.sin(DEJONG.c * x) - Math.cos(DEJONG.d * y);
    x = nx;
  }
  for (let i = 0; i < count; i++) {
    const nx = Math.sin(DEJONG.a * y) - Math.cos(DEJONG.b * x);
    y = Math.sin(DEJONG.c * x) - Math.cos(DEJONG.d * y);
    x = nx;
    raw[i * 2] = x;
    raw[i * 2 + 1] = y;
  }
  dejongRaw = raw;
  return raw;
}

function attracteurCloud(life: ImprintLife): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "shape", { stagger: 0.3, coverage: 0.62 });
  const raw = dejongOrbit(count);
  const yaw = life.spin * 0.5;
  const tilt = 0.35 + life.breath * 0.2 + life.tilt * 0.6;
  const depth = (0.55 + life.mid * 0.9) * 0.3;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const pts = new Float32Array(count * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = raw[i * 2]!;
    const y = raw[i * 2 + 1]!;
    const z = (Math.sin(DEJONG.c * x * 1.4) - Math.cos(DEJONG.d * y * 1.1)) * depth;
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * ct - z1 * st;
    pts[i * 2] = x1;
    pts[i * 2 + 1] = y2;
    if (x1 < minX) minX = x1;
    if (x1 > maxX) maxX = x1;
    if (y2 < minY) minY = y2;
    if (y2 > maxY) maxY = y2;
  }
  const unit = Math.max(1e-4, maxY - minY);
  c.aspect = (maxX - minX) / unit;
  const cx = (minX + maxX) / 2;
  const cyc = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const an = hash01(i * 19 + 11) * TAU;
    put(
      c,
      i,
      (pts[i * 2]! - cx) / unit,
      (pts[i * 2 + 1]! - cyc) / unit,
      Math.cos(an) * 0.7,
      Math.sin(an) * 0.7
    );
  }
  return c;
}

// A real plate: the mode pair follows the music's spectral balance, and a
// change of mode is a transition of sand — every grain slides from the old
// nodal lines to the new ones through the blended plate equation. Each index
// descends from its own fixed seed onto the zero set (Newton steps), so the
// figure morphs continuously as the blend advances.
function chladniCloud(life: ImprintLife): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "uv", { stagger: 0.25 });
  const pi = Math.PI;
  const { mA, nA, mB, nB, blend } = life.chladni;
  const w = Math.min(1, Math.max(0, blend));
  const plate = (m: number, n: number, x: number, y: number): [number, number, number] => {
    const cnx = Math.cos(n * pi * x);
    const cmy = Math.cos(m * pi * y);
    const cmx = Math.cos(m * pi * x);
    const cny = Math.cos(n * pi * y);
    return [
      cnx * cmy - cmx * cny,
      (-n * Math.sin(n * pi * x) * cmy + m * Math.sin(m * pi * x) * cny) * pi,
      (-m * cnx * Math.sin(m * pi * y) + n * cmx * Math.sin(n * pi * y)) * pi,
    ];
  };
  for (let i = 0; i < count; i++) {
    let x = 0.03 + hash01(i * 2 + 1) * 0.94;
    let y = 0.03 + hash01(i * 2 + 2) * 0.94;
    let gx = 0;
    let gy = 0;
    for (let k = 0; k < 9; k++) {
      const [aA, gxA, gyA] = plate(mA, nA, x, y);
      const [aB, gxB, gyB] = plate(mB, nB, x, y);
      const a = aA + (aB - aA) * w;
      gx = gxA + (gxB - gxA) * w;
      gy = gyA + (gyB - gyA) * w;
      const g2 = gx * gx + gy * gy + 1e-5;
      let sx = (a * gx) / g2;
      let sy = (a * gy) / g2;
      const sl = Math.hypot(sx, sy);
      if (sl > 0.08) {
        sx *= 0.08 / sl;
        sy *= 0.08 / sl;
      }
      x = Math.min(0.985, Math.max(0.015, x - sx * 0.9));
      y = Math.min(0.985, Math.max(0.015, y - sy * 0.9));
    }
    const l = Math.hypot(gx, gy);
    if (l > 1e-4) put(c, i, x, y, (gx / l) * 0.3, (gy / l) * 0.3);
    else {
      const a = hash01(i * 5 + 3) * TAU;
      put(c, i, x, y, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
    }
  }
  return c;
}

// The tree structure grows once from a fixed seed (so re-samplings keep it),
// then sways under the same bass wind as the fern — bending by height, with
// a gust ripple traveling through the crown.
interface TreeSeg { x0: number; y0: number; x1: number; y1: number; w: number }
let treeSegs: TreeSeg[] | undefined;
let treeCdf: number[] = [];
let treeTotal = 0;
let treeBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
function growTree() {
  if (treeSegs) return;
  const segs: TreeSeg[] = [];
  let seed = 0x1234abcd;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const grow = (x: number, y: number, angle: number, len: number, depth: number) => {
    const x1 = x + Math.cos(angle) * len;
    const y1 = y + Math.sin(angle) * len;
    segs.push({ x0: x, y0: y, x1, y1, w: len * Math.sqrt(depth + 1) });
    if (depth <= 0) return;
    const kids = depth > 4 ? 2 : rnd() < 0.35 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = 0.32 + rnd() * 0.3;
      const off = kids === 2 ? (k === 0 ? -spread : spread) : (k - 1) * spread;
      grow(x1, y1, angle + off + (rnd() - 0.5) * 0.12, len * (0.68 + rnd() * 0.1), depth - 1);
    }
  };
  grow(0, 0.5, -Math.PI / 2, 0.3, 7);
  treeSegs = segs;
  treeCdf = [];
  treeTotal = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    treeTotal += s.w;
    treeCdf.push(treeTotal);
    minX = Math.min(minX, s.x0, s.x1);
    maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  treeBox = { minX, maxX, minY, maxY };
}

function arbreCloud(life: ImprintLife): ImprintCloud {
  growTree();
  const count = 6144;
  const segs = treeSegs!;
  const unit = Math.max(1e-4, treeBox.maxY - treeBox.minY);
  const cx = (treeBox.minX + treeBox.maxX) / 2;
  const cy = (treeBox.minY + treeBox.maxY) / 2;
  const c = makeCloud(count, "shape", {
    stagger: 0.55,
    aspect: (treeBox.maxX - treeBox.minX) / unit,
    coverage: 0.62,
  });
  // Ordered by creation (trunk first): the tree grows as it crystallizes.
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = ((i + hash01(i * 3 + 1)) / count) * treeTotal;
    while (seg < segs.length - 1 && treeCdf[seg]! < s) seg++;
    const g = segs[seg]!;
    const u = hash01(i * 3 + 2);
    const dx = g.x1 - g.x0;
    const dy = g.y1 - g.y0;
    const l = Math.hypot(dx, dy) || 1;
    let px = (g.x0 + dx * u - cx) / unit;
    const py = (g.y0 + dy * u - cy) / unit;
    const h = Math.min(1, Math.max(0, 0.5 - py));
    px += life.wind * (0.2 * h * h + 0.05 * h * Math.sin(h * 3.1 - life.windPhase));
    put(c, i, px, py, dy / l, -dx / l);
  }
  return c;
}

// ---- fractales ------------------------------------------------------------

// Julia set by inverse iteration: z <- ±sqrt(z - c), signs hashed per step.
// The parameter c orbits slowly — a living fractal — and the mids push it
// off its circle, breaking the set into dust and gathering it back. The
// whole set breathes and drifts in its own plane.
function juliaCloud(time: number, life: ImprintLife): ImprintCloud {
  const count = 8192;
  const th = time * 0.045;
  const R = 0.7885 * (0.965 + life.mid * 0.085);
  const cr = R * Math.cos(th);
  const ci = R * Math.sin(th);
  const raw = new Float32Array(count * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const a0 = hash01(i * 11 + 1) * TAU;
    let x = Math.cos(a0) * 1.2;
    let y = Math.sin(a0) * 1.2;
    for (let k = 0; k < 26; k++) {
      const wx = x - cr;
      const wy = y - ci;
      const r = Math.hypot(wx, wy);
      const half = Math.atan2(wy, wx) / 2;
      const sr = Math.sqrt(r);
      x = sr * Math.cos(half);
      y = sr * Math.sin(half);
      if (hash01(i * 37 + k * 5 + 2) < 0.5) {
        x = -x;
        y = -y;
      }
    }
    raw[i * 2] = x;
    raw[i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const unit = Math.max(1e-4, maxY - minY);
  const c = makeCloud(count, "shape", {
    stagger: 0.3,
    coverage: 0.62,
    aspect: (maxX - minX) / unit,
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Breath and plane drift, applied after normalization so they read as the
  // whole set inhaling and floating, not as a re-framing.
  const s = 1 + life.breath * 0.04 + life.amp * 0.07;
  const dx = Math.sin(time * 0.13) * 0.05;
  const dy = Math.cos(time * 0.11) * 0.04;
  for (let i = 0; i < count; i++) {
    const an = hash01(i * 13 + 5) * TAU;
    put(
      c,
      i,
      ((raw[i * 2]! - cx) / unit) * s + dx,
      ((raw[i * 2 + 1]! - cy) / unit) * s + dy,
      Math.cos(an) * 0.6,
      Math.sin(an) * 0.6
    );
  }
  return c;
}

// Barnsley fern: each point runs its own hashed IFS walk — deterministic per
// index, so re-samplings keep every grain on its frond. The bass carries a
// wind through it: the fronds bend by height, tips first, with a gust
// ripple rolling up the stem.
function fougereCloud(life: ImprintLife): ImprintCloud {
  const count = 8192;
  const raw = new Float32Array(count * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    for (let k = 0; k < 34; k++) {
      const r = hash01(i * 101 + k * 9 + 3);
      let nx: number;
      let ny: number;
      if (r < 0.01) {
        nx = 0;
        ny = 0.16 * y;
      } else if (r < 0.86) {
        nx = 0.85 * x + 0.04 * y;
        ny = -0.04 * x + 0.85 * y + 1.6;
      } else if (r < 0.93) {
        nx = 0.2 * x - 0.26 * y;
        ny = 0.23 * x + 0.22 * y + 1.6;
      } else {
        nx = -0.15 * x + 0.28 * y;
        ny = 0.26 * x + 0.24 * y + 0.44;
      }
      x = nx;
      y = ny;
    }
    raw[i * 2] = x;
    raw[i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const unit = Math.max(1e-4, maxY - minY);
  const c = makeCloud(count, "shape", {
    stagger: 0.35,
    coverage: 0.68,
    aspect: (maxX - minX) / unit,
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const an = hash01(i * 17 + 7) * TAU;
    // Screen y grows downward: flip so the fern stands upright.
    const px = (raw[i * 2]! - cx) / unit;
    const py = -(raw[i * 2 + 1]! - cy) / unit;
    const h = Math.min(1, Math.max(0, 0.5 - py)); // height above the root
    put(
      c,
      i,
      px + life.wind * (0.22 * h * h + 0.05 * h * Math.sin(h * 3.1 - life.windPhase)),
      py,
      Math.cos(an) * 0.5,
      Math.sin(an) * 0.5
    );
  }
  return c;
}

// Heighway dragon: an ordered turtle walk along the curve, so the stagger
// draws it stroke by stroke as it condenses. The turn angle is the fold:
// at 1 every crease is a right angle — the true dragon — and every accent
// slackens it, the curve unfolding for a beat before creasing back. The
// position of each step is continuous in the fold, so the whole spine
// rolls open and shut without a grain ever jumping.
function dragonCloud(life: ImprintLife): ImprintCloud {
  const steps = 8192;
  const theta = (Math.PI / 2) * Math.min(1, Math.max(0.55, life.fold));
  const xs = new Float32Array(steps + 1);
  const ys = new Float32Array(steps + 1);
  let x = 0;
  let y = 0;
  let heading = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (let k = 1; k <= steps; k++) {
    x += Math.cos(heading);
    y += Math.sin(heading);
    xs[k] = x;
    ys[k] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    // Turn direction of the dragon sequence at step k, scaled by the fold.
    const left = (((k & -k) << 1) & k) === 0;
    heading += left ? theta : -theta;
  }
  const count = 8192;
  const unit = Math.max(1e-4, maxY - minY);
  const c = makeCloud(count, "shape", {
    stagger: 0.6,
    coverage: 0.6,
    aspect: (maxX - minX) / unit,
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const t = ((i + hash01(i * 3 + 1)) / count) * (steps - 1);
    const k = Math.min(steps - 1, Math.floor(t));
    const u = t - k;
    const px = xs[k]! + (xs[k + 1]! - xs[k]!) * u;
    const py = ys[k]! + (ys[k + 1]! - ys[k]!) * u;
    const sx = xs[k + 1]! - xs[k]!;
    const sy = ys[k + 1]! - ys[k]!;
    const l = Math.hypot(sx, sy) || 1;
    put(c, i, (px - cx) / unit, (py - cy) / unit, sy / l, -sx / l);
  }
  return c;
}

// ---- ondes (uv space, animated drift) -------------------------------------

function waveY(shape: ImprintSettings["wave"]["shape"], ph: number): number {
  if (shape === "triangle") return (2 / Math.PI) * Math.asin(Math.sin(ph));
  if (shape === "carre") return Math.tanh(Math.sin(ph) * 3.5);
  if (shape === "melange")
    return (Math.sin(ph) + 0.5 * Math.sin(2 * ph + 0.8) + 0.33 * Math.sin(3 * ph + 2.4)) / 1.4;
  return Math.sin(ph);
}

// The wave advances period by period, continuously — the phase never stops —
// then the sound twists it: low mids swell the amplitude, mids warp the
// local frequency, treble draws harmonics into the line.
function ondesCloud(w: ImprintSettings["wave"], life: ImprintLife): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "uv", { stagger: 0.45 });
  const waves = Math.max(1, Math.round(w.waves));
  const perWave = count / waves;
  const ampG = 1 + life.amp * 0.8 + life.breath * 0.06;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(i / perWave);
    const x = (i % perWave) / perWave + hash01(i) * 0.002;
    const yk = waves === 1 ? 0.5 : 0.18 + (0.64 * k) / (waves - 1);
    let ph = x * w.freq * TAU + life.phase * (0.4 + w.drift * 0.6) + k * 1.9;
    ph += life.mid * 1.5 * Math.sin(x * 3.1 * TAU * 0.5 + life.phase * 0.7 + k);
    const jitter = hash01(i * 7 + 1) + hash01(i * 7 + 2) - 1;
    let y = yk + waveY(w.shape, ph) * w.amp * ampG + jitter * w.thickness;
    y += life.hi * 0.3 * w.amp * Math.sin(3 * ph + life.phase);
    put(c, i, x, y, 0, 0.28);
  }
  return c;
}

// ---- multi-empreintes (uv space) ------------------------------------------

function multiCloud(p: ImprintSettings["multi"], screenAspect: number): ImprintCloud {
  const n = Math.max(2, Math.round(p.n));
  const total = Math.min(IMPRINT_MAX_POINTS, 2048 * n);
  const c = makeCloud(total, "uv", { stagger: 0.5 });
  const pool = Object.keys(FORMES);
  const per = Math.floor(total / n);
  const placed: { x: number; y: number; s: number }[] = [];
  let idx = 0;
  for (let k = 0; k < n; k++) {
    const s = p.size * (0.75 + 0.5 * Math.random());
    let cx = 0.5;
    let cy = 0.5;
    for (let attempt = 0; attempt < 14; attempt++) {
      const mx = (s * 0.55) / screenAspect + 0.03;
      const my = s * 0.55 + 0.05;
      cx = mx + Math.random() * (1 - 2 * mx);
      cy = my + Math.random() * (1 - 2 * my);
      if (placed.every((q) => Math.hypot((q.x - cx) * screenAspect, q.y - cy) > (q.s + s) * 0.62))
        break;
    }
    placed.push({ x: cx, y: cy, s });
    const shape = FORMES[pool[Math.floor(Math.random() * pool.length)]!]!(per, restingLife(0));
    for (let j = 0; j < per && idx < total; j++, idx++) {
      const o = j * 4;
      put(
        c,
        idx,
        cx + (shape.data[o]! * s) / screenAspect,
        cy + shape.data[o + 1]! * s,
        shape.data[o + 2]! * 0.35,
        shape.data[o + 3]! * 0.35
      );
    }
  }
  c.count = idx;
  return c;
}

// ---- texte libre (Ephesis recipe, sorted by x for letter-by-letter) -------

export async function sampleTextCloud(text: string): Promise<ImprintCloud | null> {
  const clean = text.trim();
  if (!clean) return null;
  await document.fonts.load("88px Ephesis").catch(() => undefined);
  const SS = 3;
  const fs = 88 * SS;
  const straighten = Math.tan((8 * Math.PI) / 180);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${fs}px Ephesis`;
  const textW = measure.measureText(clean).width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textW + fs * 1.8);
  canvas.height = Math.ceil(fs * 3);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${fs}px Ephesis`;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.1 * SS;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setTransform(1, 0, straighten, 1, 0, 0);
  ctx.fillText(clean, fs * 0.4, fs * 1.7);
  ctx.strokeText(clean, fs * 0.4, fs * 1.7);

  const { width: w, height: h } = canvas;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
  const ink: number[] = [];
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x]! < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      ink.push(y * w + x);
    }
  }
  const count = 6144;
  if (ink.length < count / 8) return null;
  const unit = Math.max(1, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]!;

  const picks: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    for (;;) {
      const idx = ink[(Math.random() * ink.length) | 0]!;
      if (Math.random() * 255 < alpha[idx]!) {
        picks.push({ x: idx % w, y: (idx / w) | 0 });
        break;
      }
    }
  }
  picks.sort((a, b) => a.x - b.x); // letter-by-letter engagement order

  const c = makeCloud(count, "shape", {
    stagger: 0.85,
    aspect: (maxX - minX) / unit,
    coverage: 0,
    offsetY: 0.5,
  });
  picks.forEach(({ x, y }, i) => {
    const gx = at(x + 2, y) - at(x - 2, y);
    const gy = at(x, y + 2) - at(x, y - 2);
    const l = Math.hypot(gx, gy);
    let nx: number;
    let ny: number;
    if (l > 24) {
      nx = gx / l;
      ny = gy / l;
    } else {
      const a = Math.random() * TAU;
      nx = Math.cos(a);
      ny = Math.sin(a);
    }
    put(c, i, (x + Math.random() - 0.5 - cx) / unit, (y + Math.random() - 0.5 - cy) / unit, nx, ny);
  });
  return c;
}

// ---- image importée (SVG / PNG / JPG -> masque local, rien n'est envoyé) --

export async function sampleImageCloud(file: File): Promise<ImprintCloud | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image illisible"));
      img.src = url;
    });
    const iw = img.naturalWidth || 480;
    const ih = img.naturalHeight || 480;
    const scale = Math.min(1, 480 / Math.max(iw, ih));
    const w = Math.max(2, Math.round(iw * scale));
    const h = Math.max(2, Math.round(ih * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    // Weight = alpha x luminance; on opaque photos, auto-invert when the
    // subject is dark on light so the mask follows the drawing, not the paper.
    const weight = new Float32Array(w * h);
    let lumaSum = 0;
    let alphaSum = 0;
    for (let i = 0; i < w * h; i++) {
      const a = rgba[i * 4 + 3]! / 255;
      const l =
        (0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!) / 255;
      weight[i] = a * l;
      lumaSum += l * a;
      alphaSum += a;
    }
    const opaque = alphaSum > 0.985 * w * h;
    if (opaque && lumaSum / Math.max(1, alphaSum) > 0.5) {
      for (let i = 0; i < w * h; i++) weight[i] = 1 - weight[i]!;
    }
    for (let i = 0; i < w * h; i++) if (weight[i]! < 0.08) weight[i] = 0;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    const filled: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (weight[y * w + x]! <= 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        filled.push(y * w + x);
      }
    }
    const count = 8192;
    if (filled.length < 64) return null;
    const unit = Math.max(1, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= w || y >= h ? 0 : weight[y * w + x]!;
    const c = makeCloud(count, "shape", {
      stagger: 0.3,
      aspect: (maxX - minX) / unit,
      coverage: 0.66,
      offsetY: 0.5,
    });
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      for (;;) {
        const idx = filled[(Math.random() * filled.length) | 0]!;
        if (Math.random() < weight[idx]!) {
          x = idx % w;
          y = (idx / w) | 0;
          break;
        }
      }
      const gx = at(x + 2, y) - at(x - 2, y);
      const gy = at(x, y + 2) - at(x, y - 2);
      const l = Math.hypot(gx, gy);
      if (l > 0.12) put(c, i, (x + Math.random() - 0.5 - cx) / unit, (y + Math.random() - 0.5 - cy) / unit, gx / l, gy / l);
      else {
        const a = Math.random() * TAU;
        put(c, i, (x + Math.random() - 0.5 - cx) / unit, (y + Math.random() - 0.5 - cy) / unit, Math.cos(a), Math.sin(a));
      }
    }
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- silhouette caméra (from the GPU luminance imprint readback) ----------

export function silhouetteCloud(
  luma: Float32Array,
  w: number,
  h: number
): ImprintCloud | null {
  const weight = new Float32Array(w * h);
  const at = (x: number, y: number) =>
    luma[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  let sum = 0;
  let max = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      // Contour first, a whisper of fill so the figure reads as a body.
      const v = Math.hypot(gx, gy) * 2.4 + at(x, y) * 0.22;
      weight[y * w + x] = v;
      sum += v;
      if (v > max) max = v;
    }
  }
  if (sum < 1 || max < 0.05) return null;
  const count = 8192;
  const c = makeCloud(count, "uv", { stagger: 0.3 });
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    for (;;) {
      x = (Math.random() * w) | 0;
      y = (Math.random() * h) | 0;
      if (Math.random() * max < weight[y * w + x]!) break;
    }
    const gx = at(x + 1, y) - at(x - 1, y);
    const gy = at(x, y + 1) - at(x, y - 1);
    const l = Math.hypot(gx, gy);
    if (l > 1e-3) put(c, i, (x + Math.random()) / w, (y + Math.random()) / h, (gx / l) * 0.3, (gy / l) * 0.3);
    else {
      const a = Math.random() * TAU;
      put(c, i, (x + Math.random()) / w, (y + Math.random()) / h, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
    }
  }
  return c;
}

// ---- dispatcher for the synchronous families ------------------------------

// v0.7.1d — every generated imprint lives: nothing on screen is ever still.
// The multi seeds are laid out randomly (not index-stable), so multi keeps
// only the global dance transform, like the sampled families (text, image).
export function isAnimated(s: ImprintSettings): boolean {
  return ["volume", "forme", "math", "fractale", "ondes"].includes(s.family);
}

export function generateImprint(
  s: ImprintSettings,
  ctx: ImprintContext
): ImprintCloud | null {
  const life = ctx.life ?? restingLife(ctx.time);
  switch (s.family) {
    case "fond":
      return fondCloud();
    case "volume":
      return volumeCloud(s.variant || "sphere", life, s.spin);
    case "forme":
      return (FORMES[s.variant] ?? cercle)(4096, life);
    case "math":
      if (s.variant === "attracteur") return attracteurCloud(life);
      if (s.variant === "chladni") return chladniCloud(life);
      if (s.variant === "arbre") return arbreCloud(life);
      return lissajousCloud(Math.round(s.lissa.a), Math.round(s.lissa.b), life);
    case "fractale":
      if (s.variant === "fougere") return fougereCloud(life);
      if (s.variant === "dragon") return dragonCloud(life);
      return juliaCloud(ctx.time, life);
    case "ondes":
      return ondesCloud({ ...s.wave, shape: (s.variant as ImprintSettings["wave"]["shape"]) || s.wave.shape }, life);
    case "multi":
      return multiCloud(s.multi, ctx.screenAspect);
    default:
      return null; // titre / texte / image / camera are provided by the caller
  }
}

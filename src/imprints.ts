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

export const DEFAULT_IMPRINT_SETTINGS: ImprintSettings = {
  family: "titre",
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

const TAU = Math.PI * 2;
const tri = () => Math.random() + Math.random() - 1; // triangular in [-1,1]

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

type FlatShape = (count: number) => ImprintCloud;

function cercle(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.5 });
  for (let i = 0; i < count; i++) {
    const a = (i / count + Math.random() * 0.004) * TAU - Math.PI / 2;
    put(c, i, Math.cos(a) * 0.5, Math.sin(a) * 0.5, Math.cos(a), Math.sin(a));
  }
  return c;
}

function anneau(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.35 });
  const r0 = 0.36;
  const r1 = 0.5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU - Math.PI / 2;
    const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * Math.random());
    put(c, i, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a));
  }
  return c;
}

function carre(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.5 });
  for (let i = 0; i < count; i++) {
    const t = (i / count) * 4;
    const edge = Math.floor(t) % 4;
    const u = (t % 1) - 0.5;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    if (edge === 0) { x = u; y = -0.5; ny = -1; }
    else if (edge === 1) { x = 0.5; y = u; nx = 1; }
    else if (edge === 2) { x = -u; y = 0.5; ny = 1; }
    else { x = -0.5; y = -u; nx = -1; }
    put(c, i, x, y, nx, ny);
  }
  return c;
}

function croix(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.25 });
  for (let i = 0; i < count; i++) {
    const along = Math.random() - 0.5;
    const across = tri() * 0.085;
    const a = Math.random() * TAU;
    if (i % 2 === 0) put(c, i, along, across, Math.cos(a), Math.sin(a));
    else put(c, i, across, along, Math.cos(a), Math.sin(a));
  }
  return c;
}

function spirale(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.6 });
  const turns = 3.25;
  for (let i = 0; i < count; i++) {
    const t = Math.sqrt((i + Math.random()) / count); // arc-length-ish density
    const a = t * turns * TAU;
    const r = 0.5 * t;
    put(c, i, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a), Math.sin(a));
  }
  return c;
}

function etoile(count: number): ImprintCloud {
  const c = makeCloud(count, "shape", { stagger: 0.5 });
  const R = 0.5;
  const r = 0.2;
  const verts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
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
    const s = ((i + Math.random()) / count) * total;
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

function volumeCloud(variant: string, time: number, spin: number): ImprintCloud {
  const count = 6144;
  const c = makeCloud(count, "shape", { stagger: 0.3, coverage: 0.6 });
  const ax = 0.5 + time * 0.21 * spin;
  const ay = 0.7 + time * 0.34 * spin;
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

function lissajousCloud(a: number, b: number, time: number): ImprintCloud {
  const count = 6144;
  const c = makeCloud(count, "shape", { stagger: 0.55, aspect: 1.24, coverage: 0.6 });
  const delta = time * 0.07;
  for (let i = 0; i < count; i++) {
    const t = ((i + hash01(i)) / count) * TAU;
    const x = Math.sin(a * t + delta) * 0.62;
    const y = Math.sin(b * t) * 0.5;
    const tx = a * Math.cos(a * t + delta) * 0.62;
    const ty = b * Math.cos(b * t) * 0.5;
    const l = Math.hypot(tx, ty) || 1;
    put(c, i, x, y, ty / l, -tx / l);
  }
  return c;
}

function attracteurCloud(): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "shape", { stagger: 0.3, coverage: 0.62 });
  // Peter de Jong, a set with a deep, veiled structure.
  const a = -2.24;
  const b = 0.43;
  const cc = -0.65;
  const d = -2.43;
  let x = 0.1;
  let y = 0.1;
  for (let i = 0; i < 24; i++) {
    const nx = Math.sin(a * y) - Math.cos(b * x);
    y = Math.sin(cc * x) - Math.cos(d * y);
    x = nx;
  }
  const raw = new Float32Array(count * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const nx = Math.sin(a * y) - Math.cos(b * x);
    y = Math.sin(cc * x) - Math.cos(d * y);
    x = nx;
    raw[i * 2] = x;
    raw[i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const unit = Math.max(1e-4, maxY - minY);
  c.aspect = (maxX - minX) / unit;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < count; i++) {
    const an = Math.random() * TAU;
    put(
      c,
      i,
      (raw[i * 2]! - cx) / unit,
      (raw[i * 2 + 1]! - cy) / unit,
      Math.cos(an) * 0.7,
      Math.sin(an) * 0.7
    );
  }
  return c;
}

function chladniCloud(): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "uv", { stagger: 0.25 });
  const m = 3;
  const n = 5;
  const pi = Math.PI;
  const amp = (x: number, y: number) =>
    Math.cos(n * pi * x) * Math.cos(m * pi * y) - Math.cos(m * pi * x) * Math.cos(n * pi * y);
  let i = 0;
  let guard = 0;
  while (i < count && guard++ < count * 60) {
    const x = Math.random();
    const y = Math.random();
    if (Math.abs(amp(x, y)) > 0.09) continue;
    const e = 0.004;
    const gx = amp(x + e, y) - amp(x - e, y);
    const gy = amp(x, y + e) - amp(x, y - e);
    const l = Math.hypot(gx, gy);
    if (l > 1e-4) put(c, i, x, y, (gx / l) * 0.3, (gy / l) * 0.3);
    else {
      const a = Math.random() * TAU;
      put(c, i, x, y, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
    }
    i++;
  }
  c.count = i;
  return c;
}

function arbreCloud(): ImprintCloud {
  const count = 6144;
  interface Seg { x0: number; y0: number; x1: number; y1: number; w: number }
  const segs: Seg[] = [];
  const grow = (x: number, y: number, angle: number, len: number, depth: number) => {
    const x1 = x + Math.cos(angle) * len;
    const y1 = y + Math.sin(angle) * len;
    segs.push({ x0: x, y0: y, x1, y1, w: len * Math.sqrt(depth + 1) });
    if (depth <= 0) return;
    const kids = depth > 4 ? 2 : Math.random() < 0.35 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const spread = 0.32 + Math.random() * 0.3;
      const off = kids === 2 ? (k === 0 ? -spread : spread) : (k - 1) * spread;
      grow(x1, y1, angle + off + (Math.random() - 0.5) * 0.12, len * (0.68 + Math.random() * 0.1), depth - 1);
    }
  };
  grow(0, 0.5, -Math.PI / 2, 0.3, 7);
  const cdf: number[] = [];
  let total = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    total += s.w;
    cdf.push(total);
    minX = Math.min(minX, s.x0, s.x1);
    maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  const unit = Math.max(1e-4, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const c = makeCloud(count, "shape", {
    stagger: 0.55,
    aspect: (maxX - minX) / unit,
    coverage: 0.62,
  });
  // Ordered by creation (trunk first): the tree grows as it crystallizes.
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = ((i + Math.random()) / count) * total;
    while (seg < segs.length - 1 && cdf[seg]! < s) seg++;
    const g = segs[seg]!;
    const u = Math.random();
    const dx = g.x1 - g.x0;
    const dy = g.y1 - g.y0;
    const l = Math.hypot(dx, dy) || 1;
    put(
      c,
      i,
      (g.x0 + dx * u - cx) / unit,
      (g.y0 + dy * u - cy) / unit,
      dy / l,
      -dx / l
    );
  }
  return c;
}

// ---- fractales ------------------------------------------------------------

// Julia set by inverse iteration: z <- ±sqrt(z - c), signs hashed per step.
// The parameter c orbits slowly, so the set morphs forever — a living
// fractal even before the music-driven dance transform touches it.
function juliaCloud(time: number): ImprintCloud {
  const count = 8192;
  const th = time * 0.045;
  const cr = 0.7885 * Math.cos(th);
  const ci = 0.7885 * Math.sin(th);
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
  for (let i = 0; i < count; i++) {
    const an = hash01(i * 13 + 5) * TAU;
    put(
      c,
      i,
      (raw[i * 2]! - cx) / unit,
      (raw[i * 2 + 1]! - cy) / unit,
      Math.cos(an) * 0.6,
      Math.sin(an) * 0.6
    );
  }
  return c;
}

// Barnsley fern: each point runs its own hashed IFS walk — deterministic per
// index, so re-samplings keep every grain on its frond.
function fougereCloud(): ImprintCloud {
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
    put(
      c,
      i,
      (raw[i * 2]! - cx) / unit,
      -(raw[i * 2 + 1]! - cy) / unit,
      Math.cos(an) * 0.5,
      Math.sin(an) * 0.5
    );
  }
  return c;
}

// Heighway dragon: an ordered turtle walk along the curve, so the stagger
// draws it stroke by stroke as it condenses.
function dragonCloud(): ImprintCloud {
  const steps = 8192;
  const xs = new Float32Array(steps + 1);
  const ys = new Float32Array(steps + 1);
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (let k = 1; k <= steps; k++) {
    x += dx;
    y += dy;
    xs[k] = x;
    ys[k] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    // Turn direction of the dragon sequence at step k.
    const left = (((k & -k) << 1) & k) === 0;
    const ndx = left ? -dy : dy;
    const ndy = left ? dx : -dx;
    dx = ndx;
    dy = ndy;
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

function ondesCloud(w: ImprintSettings["wave"], time: number): ImprintCloud {
  const count = 8192;
  const c = makeCloud(count, "uv", { stagger: 0.45 });
  const waves = Math.max(1, Math.round(w.waves));
  const perWave = count / waves;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(i / perWave);
    const x = (i % perWave) / perWave + hash01(i) * 0.002;
    const yk = waves === 1 ? 0.5 : 0.18 + (0.64 * k) / (waves - 1);
    const ph = x * w.freq * TAU + time * w.drift * 0.5 + k * 1.9;
    const jitter = hash01(i * 7 + 1) + hash01(i * 7 + 2) - 1;
    const y = yk + waveY(w.shape, ph) * w.amp + jitter * w.thickness;
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
    const shape = FORMES[pool[Math.floor(Math.random() * pool.length)]!]!(per);
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

export function isAnimated(s: ImprintSettings): boolean {
  return (
    (s.family === "volume" && s.spin > 0.01) ||
    (s.family === "ondes" && s.wave.drift > 0.01) ||
    (s.family === "math" && s.variant === "lissajous") ||
    (s.family === "fractale" && s.variant === "julia")
  );
}

export function generateImprint(
  s: ImprintSettings,
  ctx: { time: number; screenAspect: number }
): ImprintCloud | null {
  switch (s.family) {
    case "fond":
      return fondCloud();
    case "volume":
      return volumeCloud(s.variant || "sphere", ctx.time, s.spin);
    case "forme":
      return (FORMES[s.variant] ?? cercle)(4096);
    case "math":
      if (s.variant === "attracteur") return attracteurCloud();
      if (s.variant === "chladni") return chladniCloud();
      if (s.variant === "arbre") return arbreCloud();
      return lissajousCloud(Math.round(s.lissa.a), Math.round(s.lissa.b), ctx.time);
    case "fractale":
      if (s.variant === "fougere") return fougereCloud();
      if (s.variant === "dragon") return dragonCloud();
      return juliaCloud(ctx.time);
    case "ondes":
      return ondesCloud({ ...s.wave, shape: (s.variant as ImprintSettings["wave"]["shape"]) || s.wave.shape }, ctx.time);
    case "multi":
      return multiCloud(s.multi, ctx.screenAspect);
    default:
      return null; // titre / texte / image / camera are provided by the caller
  }
}

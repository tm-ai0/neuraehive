// The definitive "cineræ" wordmark: Ephesis (embedded locally, no runtime
// network), straightened by 8°, stroke fattened 1.1 px at the 88 px reference,
// "neræ" pulled 4 px left to erase the i–n snag. The lettering is rendered
// offscreen and TITLE_POINTS targets are sampled from the actual ink, so the
// crystallized title is this exact drawing in dust at every screen size.
// Output: vec4 per point — xy = position in ink-height units centered on the
// word, zw = unit normal (edge gradient; random inside the stroke).
import ephesisUrl from "./assets/fonts/Ephesis-Regular.ttf?url";

export const TITLE_POINTS = 4096;

export interface Wordmark {
  data: Float32Array<ArrayBuffer>;
  /** Ink width / ink height, for layout math. */
  aspect: number;
}

const WORD_HEAD = "ci";
const WORD_TAIL = "neræ";
const REF_SIZE = 88; // px — the validated reference rendering
const STRAIGHTEN = (8 * Math.PI) / 180; // skewX undoing part of the italic lean
const STROKE_REF = 1.1; // px of fattening stroke at REF_SIZE
const TIGHTEN_REF = 4; // px pulling "neræ" toward "ci" (≈ -0.045em)
const SS = 3; // supersampling factor for crisp ink

export async function sampleWordmark(): Promise<Wordmark> {
  const face = new FontFace("Ephesis", `url(${ephesisUrl})`);
  await face.load();
  document.fonts.add(face);

  const fs = REF_SIZE * SS;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(fs * 6);
  canvas.height = Math.ceil(fs * 3);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${fs}px Ephesis`;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = STROKE_REF * SS;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // x' = x + tan(8°)·y shifts the tops left relative to the baseline —
  // the inverse of the italic lean. Measurements are transform-independent.
  ctx.setTransform(1, 0, Math.tan(STRAIGHTEN), 1, 0, 0);

  const x0 = fs * 0.6;
  const y0 = fs * 1.7; // baseline, roomy for the script descenders
  const xTail = x0 + ctx.measureText(WORD_HEAD).width - TIGHTEN_REF * SS;
  for (const [text, x] of [
    [WORD_HEAD, x0],
    [WORD_TAIL, xTail],
  ] as const) {
    ctx.fillText(text, x, y0);
    ctx.strokeText(text, x, y0);
  }

  const { width: w, height: h } = canvas;
  const alpha = new Uint8Array(w * h);
  {
    const rgba = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
  }

  // Ink bounding box, to center the word and set its unit height.
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  const ink: number[] = []; // packed pixel indices with alpha above threshold
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = alpha[y * w + x]!;
      if (a < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      ink.push(y * w + x);
    }
  }
  if (ink.length < TITLE_POINTS / 4) {
    throw new Error("Le lettrage Ephesis n'a pas produit d'encre exploitable.");
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const unit = Math.max(1, maxY - minY);

  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]!;

  // Rejection-sample the ink, alpha-weighted, so point density follows the
  // actual coverage of the strokes.
  const data = new Float32Array(TITLE_POINTS * 4);
  for (let i = 0; i < TITLE_POINTS; i++) {
    let x = 0;
    let y = 0;
    for (;;) {
      const idx = ink[(Math.random() * ink.length) | 0]!;
      if (Math.random() * 255 < alpha[idx]!) {
        x = idx % w;
        y = (idx / w) | 0;
        break;
      }
    }
    // Normal from the local alpha gradient; random deep inside the stroke.
    const gx = at(x + 2, y) - at(x - 2, y);
    const gy = at(x, y + 2) - at(x, y - 2);
    const len = Math.hypot(gx, gy);
    let nx: number;
    let ny: number;
    if (len > 24) {
      nx = gx / len;
      ny = gy / len;
    } else {
      const angle = Math.random() * Math.PI * 2;
      nx = Math.cos(angle);
      ny = Math.sin(angle);
    }
    const o = i * 4;
    data[o] = (x + Math.random() - 0.5 - cx) / unit;
    data[o + 1] = (y + Math.random() - 0.5 - cy) / unit;
    data[o + 2] = nx;
    data[o + 3] = ny;
  }

  return { data, aspect: (maxX - minX) / unit };
}

// "Garder": a souvenir for the visitor. A short WebM loop of the living image
// followed by a PNG of its last frame, both composited with the small
// "cineræ" lettering (bottom left) and a QR code (bottom right) pointing to
// the artist's link page. Everything stays local: the files go through
// <a download>, nothing is sent anywhere.
//
// The QR code is encoded here, in this file, with no library: byte mode,
// error correction level M, smallest version that fits the payload, mask
// chosen by the four penalty rules of ISO/IEC 18004.

export interface KeepOptions {
  url: string; // QR payload, e.g. "https://linktr.ee/thomasmaury"
  mark: string; // discreet lettering, e.g. "cineræ"
  loopSeconds: number; // loop duration, 4
}

export interface KeepResult {
  png: boolean;
  webm: boolean;
}

export type KeepPhase = "recording" | "saving" | "done";

// ---------------------------------------------------------------------------
// QR encoder (byte mode, level M, versions 1..40)
// ---------------------------------------------------------------------------

// Error correction codewords per block and number of blocks, level M only,
// indexed by version (index 0 unused).
const EC_PER_BLOCK_M = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
  26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28,
];
const BLOCKS_M = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17,
  18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

// GF(256) with the QR primitive polynomial x^8 + x^4 + x^3 + x^2 + 1.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
}
const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;

/** Reed-Solomon generator polynomial of the given degree (monic, high first). */
function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gfMul(poly[j]!, root);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder of data * x^degree by the generator. */
function rsRemainder(data: ArrayLike<number>, gen: Uint8Array): Uint8Array {
  const degree = gen.length - 1;
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!;
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1]!, factor);
  }
  return rem;
}

/** Number of data modules available for codewords, before the 8-bit floor. */
function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const totalCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8);
const dataCodewords = (ver: number) =>
  totalCodewords(ver) - EC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!;

/** Centre coordinates of the alignment patterns along one axis. */
function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

class BitBuffer {
  bits: number[] = [];
  push(value: number, count: number) {
    for (let i = count - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** Data codewords for byte mode at the given version: mode, count, payload,
 * terminator, byte alignment and the 0xEC / 0x11 padding. */
function encodeBytes(payload: Uint8Array, ver: number): Uint8Array {
  const capacity = dataCodewords(ver) * 8;
  const bb = new BitBuffer();
  bb.push(0x4, 4); // byte mode
  bb.push(payload.length, ver >= 10 ? 16 : 8);
  for (const byte of payload) bb.push(byte, 8);
  bb.push(0, Math.min(4, capacity - bb.bits.length)); // terminator
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) {
    bb.push(pad, 8);
  }
  const out = new Uint8Array(bb.bits.length / 8);
  for (let i = 0; i < bb.bits.length; i++) {
    out[i >>> 3] = out[i >>> 3]! | (bb.bits[i]! << (7 - (i & 7)));
  }
  return out;
}

/** Split into blocks, append the EC codewords, interleave. */
function addEccAndInterleave(data: Uint8Array, ver: number): Uint8Array {
  const numBlocks = BLOCKS_M[ver]!;
  const eccLen = EC_PER_BLOCK_M[ver]!;
  const raw = totalCodewords(ver);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const gen = rsGenerator(eccLen);

  const blocks: Uint8Array[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.subarray(k, k + len);
    k += len;
    const block = new Uint8Array(shortLen + 1);
    block.set(dat, 0);
    block.set(rsRemainder(dat, gen), shortLen + 1 - eccLen);
    blocks.push(block);
  }
  const out = new Uint8Array(raw);
  let n = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      // Short blocks have no codeword at the padding index.
      if (i === shortLen - eccLen && j < numShort) continue;
      out[n++] = blocks[j]![i]!;
    }
  }
  return out;
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class QrGrid {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly ver: number) {
    this.size = ver * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false)
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false)
    );
  }

  private setFn(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  private finder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFn(x, y, d !== 2 && d !== 4);
      }
    }
  }

  private alignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFunctionPatterns() {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(n - 4, 3);
    this.finder(3, n - 4);
    const pos = alignmentPositions(this.ver);
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const corner =
          (i === 0 && j === 0) ||
          (i === 0 && j === pos.length - 1) ||
          (i === pos.length - 1 && j === 0);
        if (!corner) this.alignment(pos[i]!, pos[j]!);
      }
    }
    this.drawFormatBits(0); // reserve the area, rewritten once the mask is chosen
    this.drawVersion();
  }

  drawFormatBits(mask: number) {
    // Level M is 00 in the format field.
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const n = this.size;
    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(i));
    this.setFn(8, 7, bit(6));
    this.setFn(8, 8, bit(7));
    this.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.setFn(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFn(8, n - 15 + i, bit(i));
    this.setFn(8, n - 8, true); // the always-dark module
  }

  private drawVersion() {
    if (this.ver < 7) return;
    let rem = this.ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.ver << 12) | rem;
    const n = this.size;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, dark);
      this.setFn(b, a, dark);
    }
  }

  drawCodewords(data: Uint8Array) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // hop over the vertical timing column
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    const fn = MASKS[mask]!;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y]![x] && fn(x, y)) {
          this.modules[y]![x] = !this.modules[y]![x];
        }
      }
    }
  }

  penalty(): number {
    const n = this.size;
    const m = this.modules;
    let score = 0;
    const at = (x: number, y: number) => m[y]![x]!;

    // Rules 1 and 3 along rows and columns.
    for (let axis = 0; axis < 2; axis++) {
      const get = axis === 0 ? at : (x: number, y: number) => at(y, x);
      for (let y = 0; y < n; y++) {
        let runColor = get(0, y);
        let run = 1;
        for (let x = 1; x <= n; x++) {
          const c = x < n ? get(x, y) : !runColor;
          if (x < n && c === runColor) {
            run++;
            continue;
          }
          if (run >= 5) score += 3 + (run - 5);
          runColor = c;
          run = 1;
        }
        // Finder-like 1:1:3:1:1 with 4 light modules on either side.
        for (let x = 0; x + 7 <= n; x++) {
          if (
            get(x, y) &&
            !get(x + 1, y) &&
            get(x + 2, y) &&
            get(x + 3, y) &&
            get(x + 4, y) &&
            !get(x + 5, y) &&
            get(x + 6, y)
          ) {
            let before = x >= 4;
            for (let k = 1; before && k <= 4; k++) if (get(x - k, y)) before = false;
            let after = x + 10 < n;
            for (let k = 7; after && k <= 10; k++) if (get(x + k, y)) after = false;
            if (before || after) score += 40;
          }
        }
      }
    }
    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y + 1 < n; y++) {
      for (let x = 0; x + 1 < n; x++) {
        const c = at(x, y);
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) {
          score += 3;
        }
      }
    }
    // Rule 4: dark proportion away from 50 %.
    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const total = n * n;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += k * 10;
    return score;
  }
}

export interface QrCode {
  version: number;
  mask: number;
  matrix: boolean[][];
}

/** Encode text as a QR symbol: byte mode (UTF-8), level M, smallest
 * version that fits, mask chosen by penalty. Throws only when the payload
 * exceeds version 40. */
export function encodeQr(text: string): QrCode {
  const payload = new TextEncoder().encode(text);
  let ver = 1;
  for (; ver <= 40; ver++) {
    const need = 4 + (ver >= 10 ? 16 : 8) + payload.length * 8;
    if (need <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new Error("QR: contenu trop long pour la version 40.");

  const codewords = addEccAndInterleave(encodeBytes(payload, ver), ver);
  const grid = new QrGrid(ver);
  grid.drawFunctionPatterns();
  grid.drawCodewords(codewords);

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask);
    grid.drawFormatBits(mask);
    const score = grid.penalty();
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
    grid.applyMask(mask); // masks are XOR: applying twice undoes
  }
  grid.applyMask(best);
  grid.drawFormatBits(best);
  return { version: ver, mask: best, matrix: grid.modules.map((row) => [...row]) };
}

/** Inline SVG of the matrix: one rect per horizontal run of dark modules,
 * currentColor, transparent background, crisp edges. */
export function qrToSvg(matrix: boolean[][]): string {
  const n = matrix.length;
  const rects: string[] = [];
  for (let y = 0; y < n; y++) {
    const row = matrix[y]!;
    for (let x = 0; x < n; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < n && row[x + w]) w++;
      rects.push(`<rect x="${x}" y="${y}" width="${w}" height="1"/>`);
      x += w;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" ` +
    `shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">` +
    rects.join("") +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Composite, loop, downloads
// ---------------------------------------------------------------------------

const stamp = () =>
  new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // A throttled background tab can stretch the browser's download pipeline:
  // revoking too early leaves an unfinalized .crdownload behind.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

const nextFrame = () =>
  new Promise<number>((resolve) => requestAnimationFrame(resolve));

const INK = "#161412";
const PAPER = "#e8e2d6";
const QUIET = 2; // quiet zone, in modules, around the symbol

export function createKeep(source: HTMLCanvasElement, opts: KeepOptions) {
  let qr: QrCode | undefined;
  const code = () => (qr ??= encodeQr(opts.url));

  let inflight: Promise<KeepResult> | undefined;

  /** Draw the lettering and the QR on top of whatever is on ctx. */
  const overlay = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const margin = H * 0.03;
    ctx.save();

    // Lettering, bottom left.
    const fontPx = H * 0.035;
    ctx.font = `${fontPx.toFixed(1)}px Ephesis, system-ui`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = fontPx * 0.18;
    ctx.shadowOffsetY = fontPx * 0.04;
    ctx.fillStyle = "rgba(232, 226, 214, 0.75)";
    ctx.fillText(opts.mark, margin, H - margin - fontPx * 0.28);

    // QR, bottom right: light paper with a two-module quiet zone, dark modules.
    const matrix = code().matrix;
    const n = matrix.length;
    const side = H * 0.11;
    const cell = side / (n + QUIET * 2);
    const x0 = W - margin - side;
    const y0 = H - margin - side;
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = side * 0.06;
    ctx.shadowOffsetY = side * 0.015;
    ctx.fillStyle = "rgba(232, 226, 214, 0.9)";
    ctx.fillRect(x0, y0, side, side);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = INK;
    for (let y = 0; y < n; y++) {
      const row = matrix[y]!;
      for (let x = 0; x < n; ) {
        if (!row[x]) {
          x++;
          continue;
        }
        let w = 1;
        while (x + w < n && row[x + w]) w++;
        // Snap to whole pixels so neighbouring modules never leave seams.
        const px = Math.round(x0 + (QUIET + x) * cell);
        const py = Math.round(y0 + (QUIET + y) * cell);
        const pw = Math.round(x0 + (QUIET + x + w) * cell) - px;
        const ph = Math.round(y0 + (QUIET + y + 1) * cell) - py;
        ctx.fillRect(px, py, Math.max(1, pw), Math.max(1, ph));
        x += w;
      }
    }
    ctx.restore();
  };

  const run = async (onPhase?: (phase: KeepPhase) => void): Promise<KeepResult> => {
    const result: KeepResult = { png: false, webm: false };
    const phase = (p: KeepPhase) => {
      try {
        onPhase?.(p);
      } catch (error) {
        console.warn("[cinerae] garder: onPhase a levé", error);
      }
    };

    const W = source.width;
    const H = source.height;
    if (!(W > 0 && H > 0)) {
      console.warn("[cinerae] garder: canvas source vide");
      phase("done");
      return result;
    }

    const composite = document.createElement("canvas");
    composite.width = W;
    composite.height = H;
    const ctx = composite.getContext("2d");
    if (!ctx) {
      console.warn("[cinerae] garder: contexte 2D indisponible");
      phase("done");
      return result;
    }
    // A tiny probe tells whether the WebGPU canvas actually yielded pixels
    // (it can read all black outside the renderer's own frame).
    const probe = document.createElement("canvas");
    probe.width = 48;
    probe.height = 27;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    const sourceLooksBlank = (): boolean => {
      if (!pctx) return false;
      try {
        pctx.drawImage(source, 0, 0, probe.width, probe.height);
        const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i]! + d[i + 1]! + d[i + 2]!;
        return s === 0;
      } catch {
        return false;
      }
    };
    const drawFrame = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(source, 0, 0, W, H);
      overlay(ctx, W, H);
    };

    // 1. The loop: MediaRecorder on the composite canvas, fed every frame.
    phase("recording");
    let recorder: MediaRecorder | undefined;
    const chunks: Blob[] = [];
    let stopped: Promise<void> = Promise.resolve();
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder indisponible");
      }
      const stream = composite.captureStream(30);
      const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 8_000_000,
      });
      const rec = recorder;
      stopped = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.onerror = (event) => {
          console.warn("[cinerae] garder: enregistrement en erreur", event);
          resolve();
        };
      });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      await nextFrame();
      drawFrame();
      rec.start(1000);
    } catch (error) {
      console.warn("[cinerae] garder: enregistrement impossible", error);
      recorder = undefined;
    }

    const durationMs = Math.max(0, opts.loopSeconds) * 1000;
    if (recorder) {
      const t0 = performance.now();
      for (;;) {
        const now = await nextFrame();
        drawFrame();
        if (now - t0 >= durationMs) break;
      }
      try {
        if (recorder.state !== "inactive") recorder.stop();
        // Guard: a recorder that never fires onstop must not hang the visitor.
        await Promise.race([
          stopped,
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (error) {
        console.warn("[cinerae] garder: arrêt de l'enregistrement", error);
      }
    }

    // 2. Saving: the loop first, then the last frame.
    phase("saving");
    if (recorder && chunks.length) {
      try {
        download(new Blob(chunks, { type: "video/webm" }), `cinerae-${stamp()}.webm`);
        result.webm = true;
      } catch (error) {
        console.warn("[cinerae] garder: téléchargement webm", error);
      }
    } else if (recorder) {
      console.warn("[cinerae] garder: aucune donnée vidéo produite");
    }

    try {
      // Read inside a frame; retry a few frames if the source came out black.
      for (let k = 0; k < 5; k++) {
        await nextFrame();
        const blank = sourceLooksBlank();
        drawFrame();
        if (!blank) break;
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        try {
          composite.toBlob((b) => resolve(b), "image/png");
        } catch (error) {
          console.warn("[cinerae] garder: toBlob", error);
          resolve(null);
        }
      });
      if (blob) {
        download(blob, `cinerae-${stamp()}.png`);
        result.png = true;
      } else {
        console.warn("[cinerae] garder: PNG vide");
      }
    } catch (error) {
      console.warn("[cinerae] garder: image finale impossible", error);
    }

    phase("done");
    return result;
  };

  return {
    /** Records loopSeconds of the living scene (source composited with the
     * lettering and the QR) as WebM, then the last composite frame as PNG.
     * Both downloads are triggered (cinerae-<stamp>.webm / .png). Resolves
     * once both are launched or have failed; the booleans say which. Calls
     * onPhase along the way: "recording", "saving", "done". Never throws. */
    capture(onPhase?: (phase: KeepPhase) => void): Promise<KeepResult> {
      if (inflight) return inflight;
      inflight = run(onPhase)
        .catch((error): KeepResult => {
          console.warn("[cinerae] garder: échec", error);
          try {
            onPhase?.("done");
          } catch {
            /* ignore */
          }
          return { png: false, webm: false };
        })
        .finally(() => {
          inflight = undefined;
        });
      return inflight;
    },
    /** The QR as inline SVG (rect modules, currentColor, transparent
     * background, viewBox, crisp edges, aria-hidden) for DOM overlays. */
    qrSvg(): string {
      return qrToSvg(code().matrix);
    },
    /** The QR matrix (true = dark module). */
    qrMatrix(): boolean[][] {
      return code().matrix.map((row) => [...row]);
    },
  };
}

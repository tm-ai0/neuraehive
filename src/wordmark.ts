// CINERÆ wordmark: the validated stroke paths, sampled into particle targets.
// Uses the browser's own SVG path measurement, so arcs are exact.
// Output: vec4 per point — xy = position in cap-height units centered on the
// word, zw = unit normal (for perpendicular condensation jitter in-shader).

const GLYPH_PATHS = [
  "M224 88 A20 32 0 1 0 224 138", // C
  "M248 81 L248 145", // I
  "M272 145 L272 81 L312 145 L312 81", // N
  "M368 81 L334 81 L334 145 L368 151 M334 113 L362 113", // E
  "M386 145 L386 81 L410 81 A14 15 0 0 1 410 111 L386 111 M402 111 L422 145", // R
  "M426 145 L460 81 M460 81 L460 145 M460 81 L490 81 M443 113 L484 113 M460 145 L492 145", // Æ
];

export const TITLE_POINTS = 2048;
const CAP_HEIGHT = 64; // y 81 -> 145

export function sampleWordmark(): Float32Array<ArrayBuffer> {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  const paths = GLYPH_PATHS.map((d) => {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    return p;
  });
  document.body.appendChild(svg);

  try {
    const lengths = paths.map((p) => p.getTotalLength());
    const total = lengths.reduce((a, b) => a + b, 0);

    // Bounding box of the sampled strokes, to center the word exactly.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of paths) {
      const box = p.getBBox();
      minX = Math.min(minX, box.x);
      maxX = Math.max(maxX, box.x + box.width);
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (81 + 145) / 2; // optical center between cap line and baseline

    const data = new Float32Array(TITLE_POINTS * 4);
    let written = 0;
    for (let g = 0; g < paths.length; g++) {
      const path = paths[g]!;
      const length = lengths[g]!;
      const quota =
        g === paths.length - 1
          ? TITLE_POINTS - written
          : Math.round((length / total) * TITLE_POINTS);
      for (let k = 0; k < quota && written < TITLE_POINTS; k++) {
        const at = ((k + 0.5) / quota) * length;
        const point = path.getPointAtLength(at);
        const eps = Math.min(0.5, length / 2);
        const ahead = path.getPointAtLength(Math.min(length, at + eps));
        const behind = path.getPointAtLength(Math.max(0, at - eps));
        let tx = ahead.x - behind.x;
        let ty = ahead.y - behind.y;
        const norm = Math.hypot(tx, ty) || 1;
        tx /= norm;
        ty /= norm;
        const o = written * 4;
        data[o] = (point.x - centerX) / CAP_HEIGHT;
        data[o + 1] = (point.y - centerY) / CAP_HEIGHT;
        data[o + 2] = -ty; // normal = tangent rotated 90°
        data[o + 3] = tx;
        written++;
      }
    }
    // If rounding left a tail unfilled, repeat from the start of the data.
    for (let i = written; i < TITLE_POINTS; i++) {
      data.copyWithin(i * 4, (i - written) * 4, (i - written) * 4 + 4);
    }
    return data;
  } finally {
    svg.remove();
  }
}

/** Aspect ratio (width / cap-height) of the sampled word, for layout math. */
export const WORDMARK_ASPECT = (492 - 204) / CAP_HEIGHT;

// v0.7.6 — shared distance between a camera pixel and the learned background.
// The camera color is first brought back to the background's exposure by the
// global per-channel gain (bggain.wgsl). Then the difference is split along
// the background color: a plain darkening with the same chromaticity is a
// shadow, tolerated up to 85 % while it stays mild (alpha 0.55..1); a deep
// darkening (dark clothes on a light wall), any brightening and any change
// of chromaticity count in full.
export fn bgDistance(cur: vec3f, bg: vec3f) -> vec2f {
  let full = length(cur - bg);
  let bb = max(dot(bg, bg), 1e-4);
  let alpha = dot(cur, bg) / bb;
  let shadowPart = min(full, max(0.0, 1.0 - alpha) * sqrt(bb));
  let tolerance = 0.85 * smoothstep(0.25, 0.55, alpha);
  return vec2f(max(0.0, full - tolerance * shadowPart), full);
}

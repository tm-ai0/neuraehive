// v0.7.6 — global exposure of the camera against the learned background,
// on a 1x1 target: the webcam moves its exposure and white balance on its
// own, and without this the whole room would turn into a body at once. A
// coarse grid of the frame is summed per channel, weighted by "not body"
// (last frame's mask), and the ratio background / camera is the gain that
// brings the camera back into the background's units. When almost every
// sample is masked (a sudden change before the mask settles) the plain
// unweighted ratio takes over, so the estimate can never get stuck.
struct GainParams {
  reset: f32,
};

@group(0) @binding(0) var<uniform> params: GainParams;
@group(0) @binding(1) var cam: texture_2d<f32>;
@group(0) @binding(2) var bg: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.reset > 0.5) {
    return vec4f(1.0, 1.0, 1.0, 1.0);
  }
  let dims = vec2i(textureDimensions(cam, 0));
  let nx = 24;
  let ny = 14;
  var sumC = vec3f(0.0);
  var sumB = vec3f(0.0);
  var sumCw = vec3f(0.0);
  var sumBw = vec3f(0.0);
  var wsum = 0.0;
  for (var j = 0; j < ny; j++) {
    for (var i = 0; i < nx; i++) {
      let p = vec2i(
        (i * dims.x + dims.x / 2) / nx,
        (j * dims.y + dims.y / 2) / ny,
      );
      let c = textureLoad(cam, p, 0).rgb;
      let b = textureLoad(bg, p, 0).rgb;
      let w = 1.0 - clamp(textureLoad(mask, p, 0).r, 0.0, 1.0);
      sumC += c;
      sumB += b;
      sumCw += c * w;
      sumBw += b * w;
      wsum += w;
    }
  }
  let n = f32(nx * ny);
  let useW = wsum > 0.15 * n;
  let sc = select(sumC, sumCw, useW);
  let sb = select(sumB, sumBw, useW);
  // A near-black channel gives no exposure information: keep gain 1 there.
  let ok = sc > vec3f(0.02 * n) & sb > vec3f(0.02 * n);
  let gain = select(vec3f(1.0), clamp(sb / max(sc, vec3f(1e-3)), vec3f(0.5), vec3f(2.0)), ok);
  return vec4f(gain, 1.0);
}

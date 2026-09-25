// v0.7.6 — the body mask: what differs from the learned background beyond
// a threshold that follows the noise of each pixel. Per texel of the flow
// field, never any IA, never any network. The raw decision is boxed over
// 3x3 texels and eased over ~100 ms so camera noise never becomes sand;
// the flow pass eases it once more (its 0.12 mix) before the grains read it.
// Output: r = smoothed mask, g = seconds this texel has been masked while
// the whole frame was still (the ghost clock, see bglearn.wgsl), b = the
// confidence that the background under this texel has been seen (0 right
// after a reset, 1 after ~3 s of unmasked observation), a = the plain color
// distance (fed to the noise estimate).
import { bgDistance } from "./bgcommon.wgsl";

struct MaskParams {
  dt: f32,
  reset: f32,
  still: f32, // 1 = nothing moves anywhere in the frame (CPU motion probe)
};

@group(0) @binding(0) var<uniform> params: MaskParams;
@group(0) @binding(1) var cam: texture_2d<f32>;
@group(0) @binding(2) var bg: texture_2d<f32>;
@group(0) @binding(3) var maskPrev: texture_2d<f32>;
@group(0) @binding(4) var gainTex: texture_2d<f32>;

fn rawAt(p: vec2i, gain: vec3f) -> vec2f {
  let cur = textureLoad(cam, p, 0).rgb * gain;
  let b = textureLoad(bg, p, 0);
  let d = bgDistance(cur, b.rgb);
  // Threshold: a floor plus three sigmas of this pixel's own noise; soft
  // over the next 80 % so a grazing difference reads as a half body.
  let thr = 0.05 + 3.0 * sqrt(max(b.a, 0.0));
  return vec2f(smoothstep(thr, thr * 1.8, d.x), d.y);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.reset > 0.5) {
    return vec4f(0.0);
  }
  let dims = vec2i(textureDimensions(cam, 0));
  let p = vec2i(uv * vec2f(dims));
  let gain = textureLoad(gainTex, vec2i(0), 0).rgb;
  var box = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let q = clamp(p + vec2i(i, j), vec2i(0), dims - vec2i(1));
      box += rawAt(q, gain).x;
    }
  }
  box /= 9.0;
  let center = rawAt(p, gain);
  let prev = textureLoad(maskPrev, p, 0);
  let ease = 1.0 - exp(-params.dt / 0.1);
  let eased = mix(prev.r, box, ease);
  // The ghost clock only runs while nothing moves anywhere: a standing
  // visitor still breathes and sways, a silhouette left in the background
  // after someone walked away does not.
  let masked = box > 0.5;
  let ghostSec = select(0.0, prev.g + params.dt * params.still, masked);
  let conf = min(1.0, prev.b + params.dt / 3.0 * (1.0 - box));
  return vec4f(eased, ghostSec, conf, center.y);
}

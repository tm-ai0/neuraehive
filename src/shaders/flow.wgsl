// Optical-flow field from two consecutive luminance frames.
// Output per texel: rg = smoothed flow velocity (field UV / s),
// b = smoothed luminance (crystallization imprint), a = motion energy.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct FlowParams {
  texel: vec2f,
  hasCamera: f32, // 0 -> procedural imprint, no flow
  smoothing: f32, // temporal lerp factor for the flow field
};

@group(0) @binding(0) var<uniform> params: FlowParams;
@group(0) @binding(1) var lumaCurr: texture_2d<f32>;
@group(0) @binding(2) var lumaPrev: texture_2d<f32>;
@group(0) @binding(3) var fieldPrev: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

fn lumaAt(tex: texture_2d<f32>, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, samp, uv, 0.0).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let prev = textureSampleLevel(fieldPrev, samp, uv, 0.0);

  if (params.hasCamera < 0.5) {
    // Audio-only mode: no wind, and the crystal freezes into a slow
    // procedural nebula instead of a camera imprint.
    let p = (uv - vec2f(0.5)) * vec2f(1.777, 1.0);
    let rings = 0.55 + 0.45 * cos(length(p) * 22.0 - 1.5);
    let cloud = fbmSimplex2d(p * 5.0, 4, 2.17, 0.5) * 0.5 + 0.5;
    let imprint = clamp(rings * 0.35 + cloud * 0.75 - 0.18, 0.0, 1.0);
    return vec4f(0.0, 0.0, imprint, 0.0);
  }

  let dx = params.texel.x;
  let dy = params.texel.y;
  let c = lumaAt(lumaCurr, uv);
  let p = lumaAt(lumaPrev, uv);

  // One-point Lucas-Kanade: motion pushes along the brightness gradient,
  // proportional to the temporal difference. Never attracts.
  let gx = lumaAt(lumaCurr, uv + vec2f(dx, 0.0)) - lumaAt(lumaCurr, uv - vec2f(dx, 0.0));
  let gy = lumaAt(lumaCurr, uv + vec2f(0.0, dy)) - lumaAt(lumaCurr, uv - vec2f(0.0, dy));
  let dt = c - p;
  let g2 = gx * gx + gy * gy;
  var v = vec2f(0.0);
  if (g2 > 1e-5) {
    v = -dt * vec2f(gx, gy) / (g2 + 0.02);
  }
  let mag = length(v);
  if (mag > 1.5) {
    v *= 1.5 / mag;
  }

  let flow = mix(prev.rg, v, params.smoothing);
  let luma = mix(prev.b, c, 0.12);
  let energy = mix(prev.a, min(abs(dt) * 6.0, 1.0), 0.25);
  return vec4f(flow, luma, energy);
}

// Wind field with memory, fed by the optical flow of two consecutive
// luminance frames. Each frame the previous wind is carried along itself
// (semi-Lagrangian advection), its eddies are sharpened back (vorticity
// confinement), it dies slowly (~1.5 s), and the fresh camera flow is
// injected non-linearly — a fast gesture commands the field, a slow drift
// barely whispers. So a sweeping hand leaves a current that keeps carrying
// and swirling after the hand is gone.
// Output per texel: rg = wind velocity, b = smoothed luminance
// (crystallization imprint), a = motion energy.
// v0.7.6 — where the learned background is confident (bgmask.wgsl, b =
// confidence), the b channel carries the BODY MASK instead of the raw
// luminance: the silhouette is what differs from the room, not what is
// bright. The blend is per pixel and continuous, so the switch from the
// luminance fallback to the mask never jumps; with the switch off the
// expression collapses to the historical luminance exactly.
import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";

struct FlowParams {
  texel: vec2f,
  hasCamera: f32, // 0 -> procedural imprint, no flow
  dt: f32,
  gain: f32, // adaptive gesture gain: a distant body counts like a close hand
  bgOn: f32, // v0.7.6 — 1 = the learned background feeds the silhouette
};

@group(0) @binding(0) var<uniform> params: FlowParams;
@group(0) @binding(1) var lumaCurr: texture_2d<f32>;
@group(0) @binding(2) var lumaPrev: texture_2d<f32>;
@group(0) @binding(3) var fieldPrev: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;
@group(0) @binding(5) var mask: texture_2d<f32>;

fn lumaAt(tex: texture_2d<f32>, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, samp, uv, 0.0).a;
}

fn windAt(uv: vec2f) -> vec2f {
  return textureSampleLevel(fieldPrev, samp, uv, 0.0).rg;
}

// Curl of the remembered wind, in texel-difference units.
fn curlAt(uv: vec2f) -> f32 {
  let dx = vec2f(params.texel.x, 0.0);
  let dy = vec2f(0.0, params.texel.y);
  return (windAt(uv + dx).y - windAt(uv - dx).y)
    - (windAt(uv + dy).x - windAt(uv - dy).x);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let prev = textureSampleLevel(fieldPrev, samp, uv, 0.0);

  if (params.hasCamera < 0.5) {
    // Audio-only mode: no wind, and the crystal freezes into a slow
    // procedural nebula instead of a camera imprint.
    let p = (uv - vec2f(0.5)) * vec2f(1.777, 1.0);
    let rings = 0.55 + 0.45 * cos(length(p) * 22.0 - 1.5);
    let cloud = fbmSimplex2d(p * 3.2, 4, 2.17, 0.5) * 0.5 + 0.5;
    let imprint = clamp(rings * 0.22 + cloud * 0.85 - 0.28, 0.0, 1.0);
    return vec4f(0.0, 0.0, imprint, 0.0);
  }

  // The current carries itself: what blows here came from slightly upwind.
  let back = uv - prev.rg * params.dt * 2.2;
  var wind = textureSampleLevel(fieldPrev, samp, back, 0.0).rg;

  // Vorticity confinement: push wind toward the swirls the linear sampling
  // keeps smearing out, so the wake rolls instead of just fading.
  let dx = vec2f(params.texel.x, 0.0);
  let dy = vec2f(0.0, params.texel.y);
  let gradC = vec2f(
    abs(curlAt(uv + dx)) - abs(curlAt(uv - dx)),
    abs(curlAt(uv + dy)) - abs(curlAt(uv - dy)),
  );
  let n = gradC / (length(gradC) + 1e-4);
  wind += vec2f(n.y, -n.x) * curlAt(uv) * 6.0 * params.dt;

  // Slow death of the current: it keeps carrying grains for a second or two.
  wind *= exp(-params.dt * 0.75);

  // One-point Lucas-Kanade: motion pushes along the brightness gradient,
  // proportional to the temporal difference. Never attracts.
  let tdx = params.texel.x;
  let tdy = params.texel.y;
  let c = lumaAt(lumaCurr, uv);
  let p = lumaAt(lumaPrev, uv);
  let gx = lumaAt(lumaCurr, uv + vec2f(tdx, 0.0)) - lumaAt(lumaCurr, uv - vec2f(tdx, 0.0));
  let gy = lumaAt(lumaCurr, uv + vec2f(0.0, tdy)) - lumaAt(lumaCurr, uv - vec2f(0.0, tdy));
  let dtL = c - p;
  let g2 = gx * gx + gy * gy;
  var v = vec2f(0.0);
  if (g2 > 1e-5) {
    v = -dtL * vec2f(gx, gy) / (g2 + 0.02);
  }
  let magRaw = length(v);
  if (magRaw > 1.5) {
    v *= 1.5 / magRaw;
  }
  // A whole person at 3 m writes a much fainter flow than a hand at 40 cm:
  // the adaptive gain rescales the gesture before the quadratic injection,
  // so the felt intensity stays comparable at both distances.
  v *= params.gain;
  let mag = length(v);

  // Non-linear injection: the write strength grows with the square of the
  // gesture speed, so sensor noise and slow drifts barely mark the field
  // while a fast sweep takes it over in a few frames.
  let w = min(mag * mag * 22.0, 0.75);
  wind = mix(wind, v * 2.2, w);
  let wm = length(wind);
  if (wm > 2.5) {
    wind *= 2.5 / wm;
  }

  // v0.7.6 — body mask where the background is learned, luminance elsewhere.
  let m = textureSampleLevel(mask, samp, uv, 0.0);
  let blend = params.bgOn * clamp(m.b, 0.0, 1.0);
  let sil = select(c, mix(c, clamp(m.r, 0.0, 1.0), blend), blend > 0.0);
  let luma = mix(prev.b, sil, 0.12);
  let energy = mix(prev.a, min(abs(dtL) * 6.0, 1.0), 0.25);
  return vec4f(wind, luma, energy);
}

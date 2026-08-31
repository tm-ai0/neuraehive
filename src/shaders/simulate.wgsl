// Particle simulation. Position/velocity live in screen-UV space [0,1]^2.
// The optical-flow field pushes like wind (never attracts); audio shapes the
// matter: bass -> force, treble -> turbulence, silence -> crystallization.
import { simplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct SimParams {
  dt: f32,
  time: f32,
  force: f32,
  viscosity: f32,
  turbulence: f32,
  crystal: f32,     // 0 = fluid dust, 1 = frozen imprint
  bass: f32,
  treble: f32,
  transient: f32,
  gridCols: f32,
  gridRows: f32,
  count: f32,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var field: texture_2d<f32>;
@group(0) @binding(4) var fieldSamp: sampler;

fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hash01(n: u32) -> f32 {
  return f32(pcg(n)) / 4294967295.0;
}

// Each particle owns a jittered grid cell: its "home" when matter crystallizes.
fn homeOf(i: u32) -> vec2f {
  let cols = params.gridCols;
  let col = f32(i % u32(cols));
  let row = f32(i / u32(cols));
  let jitter = vec2f(hash01(i * 2u + 1u), hash01(i * 2u + 2u)) - vec2f(0.5);
  return vec2f(
    (col + 0.5 + jitter.x * 0.9) / cols,
    (row + 0.5 + jitter.y * 0.9) / params.gridRows,
  );
}

fn curlNoise(p: vec2f, t: f32) -> vec2f {
  let e = 0.02;
  let scale = 3.5;
  let q = p * scale;
  let n1 = simplex3d(vec3f(q.x, q.y + e, t));
  let n2 = simplex3d(vec3f(q.x, q.y - e, t));
  let n3 = simplex3d(vec3f(q.x + e, q.y, t));
  let n4 = simplex3d(vec3f(q.x - e, q.y, t));
  return vec2f((n1 - n2), -(n3 - n4)) / (2.0 * e * scale);
}

@compute @workgroup_size(256)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= params.count) {
    return;
  }

  var pos = src[i].xy;
  var vel = src[i].zw;
  let dt = params.dt;

  // Wind from the camera's optical flow; bass adds pressure behind it.
  let f = textureSampleLevel(field, fieldSamp, pos, 0.0);
  var acc = f.rg * params.force * (0.6 + params.bass * 1.6);

  // Treble feeds fine turbulence.
  let turb = params.turbulence * (0.35 + params.treble * 2.0);
  acc += curlNoise(pos, params.time * 0.15 + f32(i % 7u) * 0.001) * turb;

  // Audio transients shatter outward from each particle's own drift.
  if (params.transient > 0.001) {
    let a = hash01(i * 3u + u32(params.time * 997.0)) * 6.2831853;
    acc += vec2f(cos(a), sin(a)) * params.transient * 1.4;
  }

  // Crystallization: silence pulls each grain slowly to its home cell.
  let c = params.crystal;
  let c2 = c * c;
  acc += (homeOf(i) - pos) * c2 * 14.0;

  vel += acc * dt;
  // Viscosity damps motion; a forming crystal damps it much harder.
  vel *= exp(-dt * (params.viscosity + c2 * 22.0));
  let speed = length(vel);
  if (speed > 0.9) {
    vel *= 0.9 / speed;
  }

  pos += vel * dt;
  // Wrap with a small margin so grains re-enter as dust, not as a hard line.
  pos = fract(pos + vec2f(1.0));

  dst[i] = vec4f(pos, vel);
}

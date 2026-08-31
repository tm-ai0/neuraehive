// Particle simulation. Position/velocity live in screen-UV space [0,1]^2.
// The optical-flow field pushes like wind (never attracts); audio shapes the
// matter: bass -> force, treble -> turbulence, silence -> crystallization.
// titleMode pulls every grain onto the CINERÆ wordmark targets; chaos runs an
// inverted-wind aspiration then a turbulence burst; touch emits dust.
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
  titleMode: f32,       // 0 = free matter, 1 = word fully crystallized
  titleCount: f32,
  titleScale: vec2f,    // cap-height units -> UV
  titleOffset: vec2f,   // word center in UV
  chaosAspire: f32,     // inverted-wind aspiration phase
  chaosBurst: f32,      // turbulence burst phase
  dissolve: f32,        // random thermalizing kick while the word melts
  touch: vec3f,         // xy = UV, z = strength
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> titleTargets: array<vec4f>;
@group(0) @binding(4) var field: texture_2d<f32>;
@group(0) @binding(5) var fieldSamp: sampler;

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

// Where this grain condenses on the wordmark: a stroke point plus a small
// gaussian-ish offset along the stroke normal, so lines read as dust, not ink.
fn titleTargetOf(i: u32) -> vec2f {
  let t = titleTargets[i % u32(max(params.titleCount, 1.0))];
  let perp = (hash01(i * 5u + 11u) + hash01(i * 5u + 12u) - 1.0) * 0.030;
  let along = (hash01(i * 5u + 13u) - 0.5) * 0.045;
  let tangent = vec2f(t.w, -t.z);
  let local = t.xy + t.zw * perp + tangent * along;
  return params.titleOffset + local * params.titleScale;
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
  let title = params.titleMode;

  // Touch emission: a small share of the population respawns under the finger
  // every frame, streaming outward as fresh dust.
  if (params.touch.z > 0.001) {
    let salt = u32(params.time * 61.0) * 2654435761u;
    if (hash01(i * 7u + salt) < 0.014 * params.touch.z) {
      let a = hash01(i * 7u + salt + 1u) * 6.2831853;
      let r = sqrt(hash01(i * 7u + salt + 2u)) * 0.012;
      let dir = vec2f(cos(a), sin(a));
      dst[i] = vec4f(params.touch.xy + dir * r, dir * (0.03 + hash01(i * 7u + salt + 3u) * 0.16));
      return;
    }
  }

  // As the word takes hold it quiets the weather: ambient wind, turbulence
  // and kicks fade so the strokes can actually set.
  let calm = 1.0 - title * title * 0.92;

  // Wind from the camera's optical flow; bass adds pressure behind it.
  // The chaos aspiration briefly inverts it and breathes everything inward.
  let f = textureSampleLevel(field, fieldSamp, pos, 0.0);
  let windDir = 1.0 - params.chaosAspire * 3.5;
  var acc = f.rg * params.force * (0.6 + params.bass * 1.6) * windDir * calm;
  acc += (vec2f(0.5) - pos) * params.chaosAspire * 1.8;

  // Treble feeds fine turbulence; the chaos burst multiplies it hard.
  let turb = params.turbulence * (0.35 + params.treble * 2.0) * (1.0 + params.chaosBurst * 5.0) * calm;
  acc += curlNoise(pos, params.time * 0.15 + f32(i % 7u) * 0.001) * turb;

  // Audio transients, the chaos burst and the melting word all shatter
  // outward — the dissolve kick re-seeds entropy so the released cluster
  // mixes back into dust instead of shearing into laminae.
  let kick = (params.transient + params.chaosBurst * 0.8) * calm + params.dissolve;
  if (kick > 0.001) {
    let a = hash01(i * 3u + u32(params.time * 997.0)) * 6.2831853;
    acc += vec2f(cos(a), sin(a)) * kick * 1.4;
  }

  // Crystallization: silence pulls each grain slowly to its home cell.
  // The wordmark takes precedence over the camera imprint.
  let c = params.crystal * (1.0 - title);
  let c2 = c * c;
  acc += (homeOf(i) - pos) * c2 * 14.0;
  let t2 = title * title;
  if (title > 0.001) {
    acc += (titleTargetOf(i) - pos) * t2 * 30.0;
  }

  vel += acc * dt;
  // Viscosity damps motion; a forming crystal or the word damp it much harder.
  vel *= exp(-dt * (params.viscosity + c2 * 22.0 + t2 * 26.0));
  let speed = length(vel);
  if (speed > 0.9) {
    vel *= 0.9 / speed;
  }

  pos += vel * dt;
  // Wrap so grains re-enter as dust — unless the word holds them.
  if (title < 0.5) {
    pos = fract(pos + vec2f(1.0));
  } else {
    pos = clamp(pos, vec2f(-0.05), vec2f(1.05));
  }

  dst[i] = vec4f(pos, vel);
}

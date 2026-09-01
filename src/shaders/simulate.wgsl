// Particle simulation. Position/velocity live in screen-UV space [0,1]^2;
// each particle carries a second vec4: heat (ember glow), age (life cycle,
// wraps at 1), comet (torn-off flight), spare.
//
// Life cycle: born ember on a strong audio transient (orange, brief), cools
// to warm white, ages into ash (darker, slower, sediments toward the edges),
// then quietly re-brightens in place. Vigorous local camera motion stirs the
// ash bed and re-ignites a few embers. At rest the dust condenses onto the
// zero level-set of a slow drifting noise field (iron-filings filaments),
// combed every so often by a global gust. A dominant sustained tone aligns
// the dust on Chladni figures; a very fast camera gesture tears comets off.
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
  titleScale: vec2f,    // ink-height units -> UV
  titleOffset: vec2f,   // word center in UV
  chaosAspire: f32,     // inverted-wind aspiration phase
  chaosBurst: f32,      // turbulence burst phase
  dissolve: f32,        // random thermalizing kick while the word melts
  touch: vec3f,         // xy = UV, z = strength
  gust: vec2f,          // resting-state wind gust (direction x envelope)
  cymMN: vec2f,         // Chladni mode numbers (m, n)
  cymatic: f32,         // sustained-tone envelope x gain, 0..~2
  ember: f32,           // ember birth gain on strong transients
  filament: f32,        // resting filament field strength
  lifeRate: f32,        // 1 / life-cycle seconds
  ashLevel: f32,        // age where dust turns to ash (~0.97 - ash share)
  sediment: f32,        // peripheral drift strength for ash
  cometGain: f32,       // camera-tear sensitivity
  imprintShape: f32,    // 1 = crystal targets the imprint cloud, 0 = home cells
  stagger: f32,         // 0 = all points engage together, ->1 = ordered build
  depthAmount: f32,     // parallax layer separation, 0 = off
  presence: f32,        // someone-in-frame envelope 0..1 (0 = historical render)
  presenceMode: f32,    // trame: 0 bruit, 1 dithering, 2 lignes, 3 moiré, 4 points, 5 contours
  presenceShare: f32,   // share of the population serving the portrait
  presenceHold: f32,    // 0 = free dust, 1 = rigid portrait
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

// Where this grain condenses on the wordmark. Targets are sampled from the
// actual ink, so only a whisper of jitter is needed to soften them to dust.
fn titleTargetOf(i: u32) -> vec2f {
  let t = titleTargets[i % u32(max(params.titleCount, 1.0))];
  let perp = (hash01(i * 5u + 11u) + hash01(i * 5u + 12u) - 1.0) * 0.010;
  let along = (hash01(i * 5u + 13u) - 0.5) * 0.012;
  let tangent = vec2f(t.w, -t.z);
  let local = t.xy + t.zw * perp + tangent * along;
  return params.titleOffset + local * params.titleScale;
}

// The simulation lives a little wider than the screen: matter drifts out of
// frame, wraps out of frame, and no border is ever perceptible.
const MARGIN: f32 = 0.085;

fn curlOctave(q: vec2f, tz: f32, e: f32) -> vec2f {
  let n1 = simplex3d(vec3f(q.x, q.y + e, tz));
  let n2 = simplex3d(vec3f(q.x, q.y - e, tz));
  let n3 = simplex3d(vec3f(q.x + e, q.y, tz));
  let n4 = simplex3d(vec3f(q.x - e, q.y, tz));
  return vec2f((n1 - n2), -(n3 - n4)) / (2.0 * e);
}

// Three drifting octaves of curl noise, aspect-corrected so eddies stay
// round. The largest structure is wider than the screen and every octave
// slides its own way through space and time — smoke, never a lattice.
fn curlNoise(p: vec2f, t: f32, asp: f32) -> vec2f {
  let q = vec2f(p.x * asp, p.y);
  var sum = curlOctave(q * 0.9 + vec2f(t * 0.020, -t * 0.012), t * 0.10, 0.09) * 0.17;
  sum += curlOctave(q * 2.6 + vec2f(-t * 0.035, t * 0.021), t * 0.17, 0.07) * 0.11;
  sum += curlOctave(q * 6.8 + vec2f(t * 0.052, t * 0.033), t * 0.26, 0.05) * 0.06;
  return sum;
}

// 0 = living dust, 1 = ash. Falls after ashLevel, releases just before the
// wrap so the rebirth at age 0 is seamless (the grain re-brightens in place).
fn ashWeight(age: f32) -> f32 {
  return smoothstep(params.ashLevel, params.ashLevel + 0.04, age)
    * (1.0 - smoothstep(0.965, 1.0, age));
}

@compute @workgroup_size(256)
fn cs_main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= params.count) {
    return;
  }

  var pos = src[i * 2u].xy;
  var vel = src[i * 2u].zw;
  var heat = src[i * 2u + 1u].x;
  var age = src[i * 2u + 1u].y;
  var comet = src[i * 2u + 1u].z;
  // Signed dt rewinds only the advection; forces, damping and probabilities
  // integrate on |dt| so a reversed time stays numerically stable.
  let sdt = params.dt;
  let dt = abs(params.dt);
  let title = params.titleMode;

  // Parallax layer: far grains feel the weather less, near ones more.
  let layer = f32(i % 3u);
  let layerF = mix(1.0, mix(0.55, 1.6, layer * 0.5), params.depthAmount);

  // Touch emission: a small share of the population respawns under the finger
  // every frame, streaming outward as fresh dust.
  if (params.touch.z > 0.001) {
    let salt = u32(params.time * 61.0) * 2654435761u;
    if (hash01(i * 7u + salt) < 0.014 * params.touch.z) {
      let a = hash01(i * 7u + salt + 1u) * 6.2831853;
      let r = sqrt(hash01(i * 7u + salt + 2u)) * 0.012;
      let dir = vec2f(cos(a), sin(a));
      dst[i * 2u] = vec4f(params.touch.xy + dir * r, dir * (0.03 + hash01(i * 7u + salt + 3u) * 0.16));
      dst[i * 2u + 1u] = vec4f(0.0, 0.0, 0.0, 0.0);
      return;
    }
  }

  // As the word takes hold it quiets the weather: ambient wind, turbulence
  // and kicks fade so the strokes can actually set.
  let calm = 1.0 - title * title * 0.92;

  let f = textureSampleLevel(field, fieldSamp, pos, 0.0);
  let flowSpeed = length(f.rg);

  // Imprint engagement: target rank can stagger the build (a text
  // crystallizes letter by letter, a curve draws itself), and local camera
  // motion erases a held shape exactly where a person passes through it.
  let rank = f32(i % u32(max(params.titleCount, 1.0))) / max(params.titleCount, 1.0);
  let unstag = max(1.0 - params.stagger, 0.05);
  let tEff = clamp((title - params.stagger * rank) / unstag, 0.0, 1.0);
  let ero = params.imprintShape * smoothstep(0.05, 0.28, f.a);

  // ---- présence ------------------------------------------------------------
  // Continuous portrait: the mirrored camera luminance places the grains
  // through a procedural screen (trame) evaluated at each grain's home cell —
  // the person reads as dust from the first second, never as video. The whole
  // block is inert while the presence envelope is 0 (empty room, no camera,
  // fond imprint) or while the elasticity sits at "poussière libre".
  var presW = 0.0;
  var presLum = 0.0;
  if (params.presence > 0.003 && params.presenceHold > 0.001
      && hash01(i * 41u + 9u) < params.presenceShare) {
    let hp = homeOf(i);
    let lp = smoothstep(0.06, 0.9, textureSampleLevel(field, fieldSamp, hp, 0.0).b);
    let pAsp = params.gridCols / max(params.gridRows, 1.0);
    let pa = vec2f(hp.x * pAsp, hp.y);
    let mode = params.presenceMode;
    var on = false;
    if (mode < 0.5) {
      // bruit: static stochastic threshold, density follows the light
      on = hash01(i * 13u + 7u) < lp;
    } else if (mode < 1.5) {
      // dithering ordonné: Bayer 4x4 over the home cells
      let col = i % u32(params.gridCols);
      let row = i / u32(params.gridCols);
      var m = array<f32, 16>(
        0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
        3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0,
      );
      on = lp > (m[(row % 4u) * 4u + (col % 4u)] + 0.5) / 16.0;
    } else if (mode < 2.5) {
      // lignes: horizontal raster whose thickness follows the light — capped
      // so the raster stays visible even in full light.
      on = abs(fract(hp.y * 44.0) - 0.5) * 2.0 < lp * 0.8;
    } else if (mode < 3.5) {
      // moiré: two slightly rotated line systems interfering
      let d1 = pa.x * 0.2955 + pa.y * 0.9553;
      let d2 = pa.y * 0.9553 - pa.x * 0.2955;
      on = abs(fract(d1 * 30.0) - 0.5) * 2.0 < lp * 0.62
        || abs(fract(d2 * 30.0) - 0.5) * 2.0 < lp * 0.62;
    } else if (mode < 4.5) {
      // trame de points: rotated dot screen, dot area follows the light
      let pr = vec2f(pa.x * 0.9659 - pa.y * 0.2588, pa.x * 0.2588 + pa.y * 0.9659) * 34.0;
      on = length(fract(pr) - vec2f(0.5)) < 0.62 * sqrt(lp);
    } else {
      // contours: the luminance gradient draws the outlines of the body
      let dims = vec2f(textureDimensions(field, 0));
      let ex = vec2f(1.0 / dims.x, 0.0);
      let ey = vec2f(0.0, 1.0 / dims.y);
      let gx = textureSampleLevel(field, fieldSamp, hp + ex, 0.0).b
        - textureSampleLevel(field, fieldSamp, hp - ex, 0.0).b;
      let gy = textureSampleLevel(field, fieldSamp, hp + ey, 0.0).b
        - textureSampleLevel(field, fieldSamp, hp - ey, 0.0).b;
      on = hash01(i * 31u + 5u) < clamp(length(vec2f(gx, gy)) * 14.0 + lp * 0.08, 0.0, 1.0);
    }
    if (on) {
      presW = params.presence;
      presLum = lp;
    }
  }

  // ---- life cycle ----------------------------------------------------------
  // Aging, with a per-particle tempo so the population never pulses in sync.
  age = fract(age + dt * params.lifeRate * (0.7 + 0.6 * hash01(i * 9u + 3u)));
  heat *= exp(-dt * 0.85);

  var ash = ashWeight(age);

  // Strong transient: a sparse scatter of living grains is reborn as embers.
  // Brief and localized, never a wash — and never the sleeping ash bed,
  // which only vigorous camera motion may stir.
  let strong = clamp((params.transient - 0.55) * 2.2, 0.0, 1.0);
  if (strong > 0.0 && params.ember > 0.0 && ash < 0.5) {
    let salt = pcg(u32(params.time * 83.0));
    if (hash01(i * 17u + salt) < strong * params.ember * dt * 0.9) {
      heat = 1.0;
      age = 0.0;
    }
  }

  // Vigorous camera motion stirs the local ash bed; a few grains re-ignite.
  if (ash > 0.5 && f.a > 0.18) {
    let salt = pcg(u32(params.time * 71.0) + 917u);
    if (hash01(i * 23u + salt) < f.a * dt * 5.0) {
      age = hash01(i * 23u + salt + 1u) * 0.1;
      if (hash01(i * 23u + salt + 2u) < 0.18) {
        heat = max(heat, 0.7 + 0.3 * hash01(i * 23u + salt + 3u));
      }
      vel += f.rg * 0.3;
      ash = 0.0;
    }
  }

  // A very fast gesture tears a few grains off as hot comets.
  if (comet < 0.05 && f.a > 0.5 && flowSpeed > 0.35 && params.cometGain > 0.0) {
    let salt = pcg(u32(params.time * 57.0) + 331u);
    if (hash01(i * 29u + salt) < params.cometGain * f.a * dt * 1.2) {
      comet = 1.0;
      heat = max(heat, 0.9);
      age = 0.0;
      vel += f.rg / max(flowSpeed, 1e-4) * (0.45 + 0.35 * hash01(i * 29u + salt + 2u));
    }
  }
  comet *= exp(-dt * 0.75);
  let flight = clamp(comet * 4.0, 0.0, 1.0); // free-flight factor

  // ---- forces --------------------------------------------------------------
  // Wind as entrainment: dust in air feels a drag toward the local wind
  // velocity, so a strong current takes the grains with it — following with
  // a slight lag — while a faint drift barely tugs. Bass adds pressure. Ash
  // is heavy and barely feels it, unless the motion energy churns the bed.
  let windDir = 1.0 - params.chaosAspire * 3.5;
  let ashWind = 1.0 - ash * 0.75 * (1.0 - min(f.a * 2.5, 1.0));
  let wind = f.rg * 1.6 * windDir;
  let couple = params.force * (0.6 + params.bass * 1.6) * calm * ashWind
    * min(flowSpeed * 6.0, 1.0) * 2.5 * layerF;
  var acc = (wind - vel) * couple;
  acc += (vec2f(0.5) - pos) * params.chaosAspire * 1.8;

  let cym = params.cymatic * calm * (1.0 - ash) * (1.0 - flight);

  // How much the scene is at rest: no sound, no camera motion, no word, no
  // held tone. Only then does the filament field take the matter over.
  let act = clamp(
    params.bass * 1.1 + params.treble * 0.9 + params.transient * 1.6
      + flowSpeed * 2.5 + f.a * 2.0 + params.chaosBurst,
    0.0, 1.0
  );
  let cRaw = params.crystal * (1.0 - title);
  let c = clamp((cRaw - params.stagger * rank) / unstag, 0.0, 1.0);
  let c2 = c * c;
  let restness = (1.0 - act) * calm * (1.0 - c2) * (1.0 - min(cym, 1.0));

  // Treble feeds fine turbulence; the chaos burst multiplies it hard. Rest
  // and a held tone both quiet it so structure can emerge from the fur.
  // While someone stands in the frame the ambient weather steps back so the
  // portrait reads: held grains ignore most turbulence, and even the free
  // dust calms down instead of veiling the body with filaments.
  let turb = params.turbulence * (0.35 + params.treble * 2.0)
    * (1.0 + params.chaosBurst * 5.0) * calm
    * (1.0 - restness * 0.6) * (1.0 - min(cym, 1.0) * 0.75)
    * (1.0 - presW * 0.85) * (1.0 - params.presence * 0.55);
  acc += curlNoise(pos, params.time, params.gridCols / max(params.gridRows, 1.0)) * turb * layerF;

  // Resting filaments: condense on the zero level-set of a slow drifting
  // noise (iron filings on a wandering magnet) and slide gently along it.
  let rest = params.filament * restness * (1.0 - flight) * (1.0 - presW)
    * (1.0 - params.presence * 0.75);
  if (rest > 0.003) {
    let asp = params.gridCols / max(params.gridRows, 1.0);
    let q = vec2f(pos.x * asp, pos.y) * 2.3
      + vec2f(params.time * 0.011, -params.time * 0.007);
    let tz = params.time * 0.035;
    let e = 0.05;
    let n0 = simplex3d(vec3f(q.x, q.y, tz));
    let gx = simplex3d(vec3f(q.x + e, q.y, tz)) - simplex3d(vec3f(q.x - e, q.y, tz));
    let gy = simplex3d(vec3f(q.x, q.y + e, tz)) - simplex3d(vec3f(q.x, q.y - e, tz));
    let grad = vec2f(gx, gy) / (2.0 * e);
    let gl = sqrt(dot(grad, grad) + 0.05);
    acc += (-n0 * grad * 3.2 + vec2f(grad.y, -grad.x) * 0.5) / gl * rest;
  }

  // The resting gust: everything bends the same way, then it dies down.
  acc += params.gust * calm * (1.0 - ash * 0.7) * layerF;

  // Cymatics: a dominant sustained tone aligns the dust on the nodal lines
  // of a Chladni figure; the pattern follows the detected pitch.
  if (cym > 0.003) {
    let pi = 3.14159265;
    let m = params.cymMN.x;
    let n = params.cymMN.y;
    let px = pos.x * pi;
    let py = pos.y * pi;
    let amp = cos(n * px) * cos(m * py) - cos(m * px) * cos(n * py);
    let gA = vec2f(
      (-n * sin(n * px) * cos(m * py) + m * sin(m * px) * cos(n * py)) * pi,
      (-m * cos(n * px) * sin(m * py) + n * cos(m * px) * sin(n * py)) * pi,
    );
    acc += -amp * gA / (length(gA) + 1.5) * cym * 3.0;
  }

  // Audio transients, the chaos burst and the melting word all shatter
  // outward — the dissolve kick re-seeds entropy so the released cluster
  // mixes back into dust instead of shearing into laminae.
  let kick = ((params.transient + params.chaosBurst * 0.8) * calm + params.dissolve)
    * (1.0 - ash * 0.6);
  if (kick > 0.001) {
    let a = hash01(i * 3u + u32(params.time * 997.0)) * 6.2831853;
    acc += vec2f(cos(a), sin(a)) * kick * 1.4;
  }

  // Ash sediments toward the peripheral bed. The bed itself straddles the
  // screen edge — mostly out of frame — so it never draws a visible border.
  if (ash > 0.001 && params.sediment > 0.001) {
    let edgeDist = min(min(pos.x, 1.0 - pos.x), min(pos.y, 1.0 - pos.y));
    let fromCenter = pos - vec2f(0.5);
    let l = length(fromCenter);
    if (l > 1e-4) {
      acc += fromCenter / l * smoothstep(-0.05, 0.28, edgeDist) * ash * params.sediment;
    }
  }

  // Crystallization: silence pulls each grain slowly to the selected
  // imprint — or, in camera mode, to its home cell showing the frozen
  // luminance image. A body walking through the form frees it locally.
  let hold = 1.0 - ero;
  let ctarget = select(homeOf(i), titleTargetOf(i), params.imprintShape > 0.5);
  acc += (ctarget - pos) * c2 * 14.0 * hold;
  let t2 = tEff * tEff;
  if (tEff > 0.001) {
    acc += (titleTargetOf(i) - pos) * t2 * 30.0 * hold;
  }

  // Presence spring: the portrait gathers on the body. A moving limb writes
  // motion energy, the portrait yields there and the freed grains scatter
  // around the gesture before coming back — the elasticity says how far.
  var presDrag = 0.0;
  if (presW > 0.001) {
    let ph = params.presenceHold;
    let give = smoothstep(0.06, 0.30, f.a) * (1.0 - ph * 0.7);
    let pull = presW * ph * (1.0 - give) * (1.0 - flight);
    acc += (homeOf(i) - pos) * pull * (10.0 + 30.0 * ph);
    presDrag = pull * (4.0 + 22.0 * ph);
  }

  vel += acc * dt;
  // Viscosity damps motion; ash, a forming crystal, a held tone or the word
  // damp it much harder. Comets fly nearly free.
  let drag = params.viscosity * (1.0 - flight * 0.85) * (1.0 - restness * 0.45)
    + ash * 4.0 + min(cym, 1.0) * 4.0 + (c2 * 22.0 + t2 * 26.0) * hold + presDrag;
  vel *= exp(-dt * drag);
  let maxSpeed = 0.9 + flight * 0.9;
  let speed = length(vel);
  if (speed > maxSpeed) {
    vel *= maxSpeed / speed;
  }

  pos += vel * sdt;
  // Wrap over the extended domain, so leaving and re-entering both happen
  // out of frame — unless the word holds the matter. A comet that flies out
  // lands as fresh ash where it re-enters.
  if (title < 0.5) {
    if (any(pos < vec2f(-MARGIN)) || any(pos > vec2f(1.0 + MARGIN))) {
      if (comet > 0.05) {
        comet = 0.0;
        heat = 0.0;
        age = clamp(params.ashLevel + 0.02, 0.0, 0.95);
        vel *= 0.2;
      }
      let span = 1.0 + 2.0 * MARGIN;
      pos = fract((pos + vec2f(MARGIN)) / span) * span - vec2f(MARGIN);
    }
  } else {
    pos = clamp(pos, vec2f(-0.05), vec2f(1.05));
  }

  dst[i * 2u] = vec4f(pos, vel);
  // Spare channel = presence: 0 for free grains, else the trame luminance
  // packed into [0.02, 1] so the render pass lights and tints the portrait.
  dst[i * 2u + 1u] = vec4f(
    heat, age, comet,
    select(0.0, 0.02 + presLum * 0.98, presW > 0.001),
  );
}

// Final grade: HDR trail -> canvas. Monochrome warm dust on deep black as
// the default; the palette system can recolor it, the fusion mode reshapes
// the tone curve (subtractive = light paper, dark ink), symmetry folds the
// image, the halo blooms it, the memory bed and the camera ghost add their
// veils. Every extra path is inert at its default value, so the default
// render stays the historical one.
struct PresentParams {
  texel: vec2f,
  exposure: f32,
  fringe: f32,      // transient-driven, 0 almost always
  fringeTint: f32,  // 0 = warm red bias, 0.5 = neutral, 1 = cool blue bias
  overlay: f32,     // wind-field overlay opacity
  time: f32,
  bg: vec3f,        // background (paper color in subtractive mode)
  grade: vec3f,     // final multiplicative tint
  ink: vec3f,       // ink color of the subtractive mode
  blendMode: f32,   // 0 additif, 1 écran, 2 tamisée, 3 dodge, 4 soustractif
  symMode: f32,     // 0 none, 1 mirror H, 2 mirror V, 3 quadrants, 4 radial
  symN: f32,        // radial branch count
  halo: f32,        // soft bloom amount
  paperGrain: f32,  // static paper-grain amount
  strobe: f32,      // discreet strobe on transients
  ghost: f32,       // camera-luminance veil (Pro, 0 by default)
  memoryGain: f32,  // cendre mémoire veil strength
};

@group(0) @binding(0) var<uniform> params: PresentParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var memoryTex: texture_2d<f32>;
@group(0) @binding(4) var samp: sampler;

fn grain(uv: vec2f) -> f32 {
  let p = uv * 1000.0 + vec2f(params.time * 61.7, params.time * 39.3);
  let h = fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
  return (h - 0.5) / 255.0 * 3.0;
}

// Static hash noise: the tooth of a paper sheet, anchored to the screen.
fn paperNoise(uv: vec2f) -> f32 {
  let p = uv / params.texel * 0.5;
  let h1 = fract(sin(dot(floor(p), vec2f(127.1, 311.7))) * 43758.5453);
  let h2 = fract(sin(dot(floor(p * 0.31), vec2f(69.7, 251.3))) * 24634.6345);
  return h1 * 0.6 + h2 * 0.4;
}

// Symmetry fold: where this pixel reads the trail from.
fn foldUv(uv: vec2f) -> vec2f {
  let mode = params.symMode;
  var s = uv;
  if (mode < 0.5) {
    return s;
  }
  if (mode < 1.5) {
    s.x = 0.5 - abs(s.x - 0.5);
    return s;
  }
  if (mode < 2.5) {
    s.y = 0.5 - abs(s.y - 0.5);
    return s;
  }
  if (mode < 3.5) {
    return vec2f(0.5 - abs(s.x - 0.5), 0.5 - abs(s.y - 0.5));
  }
  // Radial: fold the angle into one mirrored sector -> a living mandala.
  let aspect = params.texel.y / max(params.texel.x, 1e-6);
  let p = (s - vec2f(0.5)) * vec2f(aspect, 1.0);
  let r = length(p);
  let sector = 6.2831853 / max(params.symN, 2.0);
  var a = atan2(p.y, p.x);
  a = a - sector * floor(a / sector);
  a = min(a, sector - a);
  let q = vec2f(cos(a), sin(a)) * r;
  return q / vec2f(aspect, 1.0) + vec2f(0.5);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let suv = foldUv(uv);
  let center = uv - vec2f(0.5);
  let dir = center * params.fringe * 14.0 * params.texel * 60.0;

  // Spectral separation along the radial axis, transitoires only.
  // The tint biases which side of the spectrum leads. The trail carries real
  // color now (ember orange lives in its rgb), so shift channels, not luma.
  let wr = 1.0 + (0.5 - params.fringeTint) * 1.1;
  let wb = 1.0 + (params.fringeTint - 0.5) * 1.1;
  let base = textureSampleLevel(trail, samp, suv, 0.0).rgb;
  let rShift = textureSampleLevel(trail, samp, suv + dir, 0.0).r;
  let bShift = textureSampleLevel(trail, samp, suv - dir, 0.0).b;
  let r = base.r + (rShift - base.r) * wr;
  let b = base.b + (bShift - base.b) * wb;
  var hdr = vec3f(max(r, 0.0), base.g, max(b, 0.0));

  // Soft halo: a wide cross of taps blooms the HDR trail before the grade.
  if (params.halo > 0.001) {
    let rad = params.texel * 9.0;
    var bloom = textureSampleLevel(trail, samp, suv + vec2f(rad.x, 0.0), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv - vec2f(rad.x, 0.0), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv + vec2f(0.0, rad.y), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv - vec2f(0.0, rad.y), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv + rad * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv - rad * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv + vec2f(rad.x, -rad.y) * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suv - vec2f(rad.x, -rad.y) * 0.7, 0.0).rgb;
    hdr += bloom * 0.125 * params.halo * 1.6;
  }

  // The discreet strobe rides the transient envelope through the exposure.
  let exposure = params.exposure * (1.0 + params.strobe * params.fringe * 2.2);
  let xe = hdr * exposure;

  // Fusion of the accumulated light: the tone curve is the blend.
  var tone: vec3f;
  let mode = params.blendMode;
  if (mode < 0.5) {
    tone = vec3f(1.0) - exp(-xe);                    // additif
  } else if (mode < 1.5) {
    tone = xe / (vec3f(1.0) + xe);                   // écran, soft shoulders
  } else if (mode < 2.5) {
    let t = vec3f(1.0) - exp(-xe);
    tone = t * t * (vec3f(3.0) - 2.0 * t);           // lumière tamisée
  } else if (mode < 3.5) {
    tone = min(xe / max(vec3f(1.0) - xe * 0.6, vec3f(0.05)), vec3f(1.35)); // dodge
  } else {
    tone = vec3f(1.0) - exp(-xe);                    // soustractif: paper below
  }

  let mem = textureSampleLevel(memoryTex, samp, suv, 0.0).r * params.memoryGain;
  let ghost = textureSampleLevel(field, samp, suv, 0.0).b * params.ghost;

  var color: vec3f;
  if (mode >= 3.5) {
    // Paper: light dust becomes dark ink on the background sheet.
    let lum = clamp(dot(tone, vec3f(0.35, 0.45, 0.2)), 0.0, 1.0);
    color = mix(params.bg, params.ink, lum);
    color *= 1.0 - mem * 0.3;
    color *= 1.0 - ghost * 0.25;
  } else {
    color = params.bg + tone * params.grade;
    // Cendre mémoire: a faint ash bed where people have moved.
    color += params.grade * mem * 0.16;
    // Camera ghost (Pro): a barely-there luminance veil behind the dust.
    color += params.grade * ghost * 0.2;
  }

  // Wind-field overlay: motion becomes slow veils in the grade's own tint,
  // direction smeared along the flow itself so currents read as strokes.
  if (params.overlay > 0.001) {
    let v = textureSampleLevel(field, samp, suv, 0.0).rg;
    let v2 = textureSampleLevel(field, samp, suv - v * 0.05, 0.0).rg;
    let mag = (length(v) + length(v2)) * 0.5;
    let veil = min(mag * 2.4, 1.0) * params.overlay;
    if (mode >= 3.5) {
      color *= 1.0 - veil * 0.2;
    } else {
      color += vec3f(1.0, 0.86, 0.68) * veil * 0.22;
    }
  }

  // Paper grain: a static multiplicative tooth, dosable, both modes.
  if (params.paperGrain > 0.001) {
    color *= 1.0 - (paperNoise(uv) - 0.5) * params.paperGrain * 0.4;
  }

  // Gentle vignette, temporal dither against banding.
  let vignette = 1.0 - dot(center, center) * 0.55;
  color *= vignette;
  color += vec3f(grain(uv));
  return vec4f(max(color, vec3f(0.0)), 1.0);
}

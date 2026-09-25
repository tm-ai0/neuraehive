// Final grade: HDR trail -> canvas. Monochrome warm dust on deep black as
// the default; the palette system can recolor it, the fusion mode reshapes
// the tone curve (subtractive = light paper, dark ink), symmetry folds the
// image, the halo blooms it, the memory bed and the camera ghost add their
// veils. Every extra path is inert at its default value, so the default
// render stays the historical one.
//
// v0.7.1 — fusion and symmetry are continuous: a fractional blendMode mixes
// the two adjacent tone curves (and eases into the paper world), and a
// fractional symMode/symN blends two folds by sampling both. The crossfade,
// the matrix and MIDI can traverse every look without a jump.
struct PresentParams {
  texel: vec2f,
  exposure: f32,
  fringe: f32,      // transient-driven, 0 almost always
  fringeTint: f32,  // 0 = warm red bias, 0.5 = neutral, 1 = cool blue bias
  time: f32,
  bg: vec3f,        // background (paper color in subtractive mode)
  grade: vec3f,     // final multiplicative tint
  ink: vec3f,       // ink color of the subtractive mode
  blendMode: f32,   // 0 additif, 1 écran, 2 tamisée, 3 dodge, 4 soustractif — fractional
  symMode: f32,     // 0 none, 1 mirror H, 2 mirror V, 3 quadrants, 4 radial — fractional
  symN: f32,        // radial branch count, fractional
  halo: f32,        // soft bloom amount
  paperGrain: f32,  // static paper-grain amount
  strobe: f32,      // discreet strobe on transients
  ghost: f32,       // camera-luminance veil (Pro, 0 by default)
  memoryGain: f32,  // cendre mémoire veil strength
  symSpin: f32,     // v0.7.1c — rotation of the radial fold (the mandala turns)
  rawCam: f32,      // v0.7.1c — Pro only: show the raw camera image, no effects
  camScale: vec2f,  // raw-camera aspect mapping (same recipe as the luma pass)
  camOffset: vec2f,
  camMirror: f32,
  // v0.7.1e — global composition: the whole frame breathes as one. The bass
  // pumps the zoom, LFOs and macros drive every knob through the registry.
  compZoom: f32,    // 1 = none; sampled mirror-wrapped so no edge ever shows
  compRot: f32,     // radians around the screen center
  compBright: f32,  // final brightness multiplier
  compHue: f32,     // hue rotation, 0..1 = full turn
  contrast: f32,    // S-curve strength on the graded image
  flash: f32,       // whole-frame lightning on each strong accent
  // v0.7.4 — the live body: the corps grains of this frame (trail alpha)
  // composited above the graded image with a contrast floor, so the person
  // reads whatever the matter, the light and the memory.
  corpsLight: vec3f, // the body's light tint (unit luminance in the shader)
  liveFloor: f32,    // 0 = historical render .. 1 = the body reads at full light
  liveGain: f32,     // alpha density -> coverage, normalized to the grain count
};

@group(0) @binding(0) var<uniform> params: PresentParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var memoryTex: texture_2d<f32>;
@group(0) @binding(4) var cam: texture_2d<f32>;
@group(0) @binding(5) var samp: sampler;

fn grain(uv: vec2f) -> f32 {
  let p = uv * 1000.0 + vec2f(params.time * 61.7, params.time * 39.3);
  let h = fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
  return (h - 0.5) / 255.0 * 3.0;
}

// Static hash noise: the tooth of a paper sheet, anchored to the screen.
// v0.7.1g — procedural per-pixel hash (Hoskins style): the old sin() hash
// degenerates at large coordinates into a woven, repeating corduroy. No
// repeated texture anywhere, ever.
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3f(dot(p3, vec3f(p3.y, p3.z, p3.x) + vec3f(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}
fn paperNoise(uv: vec2f) -> f32 {
  let p = floor(uv / params.texel);
  return hash12(p) * 0.65 + hash12(floor(p * 0.23) + vec2f(157.0)) * 0.35;
}

// Symmetry fold for one whole mode: where this pixel reads the trail from.
fn foldUv(uv: vec2f, mode: f32, n: f32) -> vec2f {
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
  // The fold angle carries the music-driven spin: the mandala turns.
  let aspect = params.texel.y / max(params.texel.x, 1e-6);
  let p = (s - vec2f(0.5)) * vec2f(aspect, 1.0);
  let r = length(p);
  let sector = 6.2831853 / max(n, 2.0);
  var a = atan2(p.y, p.x) + params.symSpin;
  a = a - sector * floor(a / sector);
  a = min(a, sector - a);
  let q = vec2f(cos(a), sin(a)) * r;
  return q / vec2f(aspect, 1.0) + vec2f(0.5);
}

// Mirror-repeat so the composition zoom and rotation never sample a smeared
// clamp edge: outside [0,1] the image reflects seamlessly.
fn mirrorUv(p: vec2f) -> vec2f {
  return vec2f(1.0) - abs(vec2f(1.0) - 2.0 * fract(p * 0.5));
}

// Hue rotation around the grey axis (Rodrigues) — cheap, good enough for
// dust, and continuous so LFOs can spin the tint forever.
fn hueRotate(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735026);
  return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

// One tone curve, whole mode. Fractional modes mix two of these.
fn toneOf(mode: i32, xe: vec3f) -> vec3f {
  if (mode <= 0) {
    return vec3f(1.0) - exp(-xe);                    // additif
  } else if (mode == 1) {
    return xe / (vec3f(1.0) + xe);                   // écran, soft shoulders
  } else if (mode == 2) {
    let t = vec3f(1.0) - exp(-xe);
    return t * t * (vec3f(3.0) - 2.0 * t);           // lumière tamisée
  } else if (mode == 3) {
    return min(xe / max(vec3f(1.0) - xe * 0.6, vec3f(0.05)), vec3f(1.35)); // dodge
  }
  return vec3f(1.0) - exp(-xe);                      // soustractif: paper below
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Raw camera (Pro only): the piece steps aside and the plain image shows,
  // mirrored like the wind field — a calibration view, never the public one.
  if (params.rawCam > 0.5) {
    // Same cover-crop + mirror recipe as the luma pass.
    let flipped = vec2f(mix(uv.x, 1.0 - uv.x, params.camMirror), uv.y);
    let cuv = flipped * params.camScale + params.camOffset;
    let img = textureSampleLevel(cam, samp, cuv, 0.0).rgb;
    return vec4f(img, 1.0);
  }

  // v0.7.1e — global composition first: the whole accumulated image zooms
  // and turns around the screen center, aspect-corrected, mirror-wrapped.
  let cAspect = params.texel.y / max(params.texel.x, 1e-6);
  var cp = (uv - vec2f(0.5)) * vec2f(cAspect, 1.0);
  let cCos = cos(-params.compRot);
  let cSin = sin(-params.compRot);
  cp = vec2f(cp.x * cCos - cp.y * cSin, cp.x * cSin + cp.y * cCos)
    / max(params.compZoom, 0.05);
  let tuv = mirrorUv(cp / vec2f(cAspect, 1.0) + vec2f(0.5));

  // Two folds, blended: fractional symmetry is a mix of the two nearest
  // whole folds. When mode and branch count are whole, fMix is 0 and only
  // the first fold is sampled — the historical path.
  let suvA = foldUv(tuv, floor(params.symMode), floor(params.symN));
  let suvB = foldUv(tuv, ceil(params.symMode), ceil(params.symN));
  let fMix = max(
    params.symMode - floor(params.symMode),
    params.symN - floor(params.symN),
  );
  let center = uv - vec2f(0.5);
  // Chroma shift fades to nothing near the frame so the clamped samples can
  // never draw a straight edge — the effect lives in the middle of the image.
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeFade = smoothstep(0.0, 0.18, edge);
  let dir = center * params.fringe * 14.0 * params.texel * 60.0 * edgeFade;

  // Spectral separation along the radial axis, transitoires only.
  // The tint biases which side of the spectrum leads. The trail carries real
  // color now (ember orange lives in its rgb), so shift channels, not luma.
  let wr = 1.0 + (0.5 - params.fringeTint) * 1.1;
  let wb = 1.0 + (params.fringeTint - 0.5) * 1.1;
  let baseA = textureSampleLevel(trail, samp, suvA, 0.0);
  var base = baseA.rgb;
  var liveA = baseA.a;
  var rShift = textureSampleLevel(trail, samp, suvA + dir, 0.0).r;
  var bShift = textureSampleLevel(trail, samp, suvA - dir, 0.0).b;
  if (fMix > 0.001) {
    let baseB = textureSampleLevel(trail, samp, suvB, 0.0);
    base = mix(base, baseB.rgb, fMix);
    liveA = mix(liveA, baseB.a, fMix);
    rShift = mix(rShift, textureSampleLevel(trail, samp, suvB + dir, 0.0).r, fMix);
    bShift = mix(bShift, textureSampleLevel(trail, samp, suvB - dir, 0.0).b, fMix);
  }
  let r = base.r + (rShift - base.r) * wr;
  let b = base.b + (bShift - base.b) * wb;
  var hdr = vec3f(max(r, 0.0), base.g, max(b, 0.0));

  // Soft halo: a wide cross of taps blooms the HDR trail before the grade.
  // The bloom reads the first fold only — at a 9-texel radius the second
  // fold's contribution is indistinguishable, and the taps stay cheap.
  if (params.halo > 0.001) {
    let rad = params.texel * 9.0;
    var bloom = textureSampleLevel(trail, samp, suvA + vec2f(rad.x, 0.0), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA - vec2f(rad.x, 0.0), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA + vec2f(0.0, rad.y), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA - vec2f(0.0, rad.y), 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA + rad * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA - rad * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA + vec2f(rad.x, -rad.y) * 0.7, 0.0).rgb;
    bloom += textureSampleLevel(trail, samp, suvA - vec2f(rad.x, -rad.y) * 0.7, 0.0).rgb;
    hdr += bloom * 0.125 * params.halo * 1.6;
  }

  // The discreet strobe rides the transient envelope through the exposure.
  let exposure = params.exposure * (1.0 + params.strobe * params.fringe * 2.2);
  let xe = hdr * exposure;

  // Fusion of the accumulated light: the tone curve is the blend. A
  // fractional mode mixes the two adjacent curves — fully continuous.
  let bLo = i32(clamp(floor(params.blendMode), 0.0, 4.0));
  let bHi = i32(clamp(ceil(params.blendMode), 0.0, 4.0));
  let tone = mix(
    toneOf(bLo, xe),
    toneOf(bHi, xe),
    params.blendMode - floor(params.blendMode),
  );
  // How deep into the paper world we are (blendMode 3 -> 4 eases into it).
  let paperW = clamp(params.blendMode - 3.0, 0.0, 1.0);

  var mem = textureSampleLevel(memoryTex, samp, suvA, 0.0).r;
  var ghost = textureSampleLevel(field, samp, suvA, 0.0).b;
  if (fMix > 0.001) {
    mem = mix(mem, textureSampleLevel(memoryTex, samp, suvB, 0.0).r, fMix);
    ghost = mix(ghost, textureSampleLevel(field, samp, suvB, 0.0).b, fMix);
  }
  mem *= params.memoryGain;
  ghost *= params.ghost;

  // Paper: light dust becomes dark ink on the background sheet.
  let lum = clamp(dot(tone, vec3f(0.35, 0.45, 0.2)), 0.0, 1.0);
  var paperColor = mix(params.bg, params.ink, lum);
  paperColor *= 1.0 - mem * 0.3;
  paperColor *= 1.0 - ghost * 0.25;

  var lightColor = params.bg + tone * params.grade;
  // Cendre mémoire: a faint ash bed where people have moved.
  lightColor += params.grade * mem * 0.16;
  // Camera ghost (Pro): a barely-there luminance veil behind the dust.
  lightColor += params.grade * ghost * 0.2;

  var color = mix(lightColor, paperColor, paperW);

  // v0.7.1e — contrast: an S-curve pressed onto the graded image.
  if (params.contrast > 0.001) {
    let cc = clamp(color, vec3f(0.0), vec3f(1.0));
    color = mix(color, cc * cc * (vec3f(3.0) - 2.0 * cc), params.contrast);
  }
  // Brightness and hue: the LFO's whole-frame handles.
  color *= params.compBright;
  if (abs(params.compHue) > 0.0015) {
    color = hueRotate(color, params.compHue * 6.2831853);
  }
  // v0.7.4 — the live body above everything the grade did. The trail alpha
  // holds the corps grains of the last 80 ms (the fade pass keeps that
  // little). Two masks are read from it: the body (a tight blur, dense
  // inside the silhouette, falling at its edge) and its surroundings (a
  // wider dilation). Where the surroundings are covered but the body is
  // not, i.e. in a band just outside the contour, the field and the wake
  // step back into a shadow margin (the world steps aside around the
  // person, as the fond already does for its grains); inside the body the
  // margin is nil, so the ink wash and the shards' colors stay what they
  // are. Then the grains are lifted: each pixel's luminance is brought up
  // to the body's own light, in the body's tint, keeping whatever color
  // and light it already had. The floor says how far: 0 = the historical
  // render, byte for byte. In the paper world the body is ink and the
  // margin lightens toward the sheet.
  if (params.liveFloor > 0.001) {
    let live = 1.0 - exp(-max(liveA, 0.0) * params.liveGain);
    let near = params.texel * 2.0;
    let far = params.texel * 6.0;
    let inner = textureSampleLevel(trail, samp, suvA + near, 0.0).a
      + textureSampleLevel(trail, samp, suvA - near, 0.0).a
      + textureSampleLevel(trail, samp, suvA + vec2f(near.x, -near.y), 0.0).a
      + textureSampleLevel(trail, samp, suvA - vec2f(near.x, -near.y), 0.0).a;
    let outer = textureSampleLevel(trail, samp, suvA + vec2f(far.x, 0.0), 0.0).a
      + textureSampleLevel(trail, samp, suvA - vec2f(far.x, 0.0), 0.0).a
      + textureSampleLevel(trail, samp, suvA + vec2f(0.0, far.y), 0.0).a
      + textureSampleLevel(trail, samp, suvA - vec2f(0.0, far.y), 0.0).a
      + textureSampleLevel(trail, samp, suvA + far * 0.7, 0.0).a
      + textureSampleLevel(trail, samp, suvA - far * 0.7, 0.0).a
      + textureSampleLevel(trail, samp, suvA + vec2f(far.x, -far.y) * 0.7, 0.0).a
      + textureSampleLevel(trail, samp, suvA - vec2f(far.x, -far.y) * 0.7, 0.0).a;
    let body = 1.0 - exp(-max(liveA + inner, 0.0) * 0.4 * params.liveGain);
    let around = 1.0 - exp(-max(inner + outer, 0.0) * 0.25 * params.liveGain);
    let rim = 1.0 - body;
    let shade = params.liveFloor * min(1.0, around * rim * rim * 1.6);
    let bodyLum = min(1.0, 0.55 + 0.45 * params.compBright);
    let bodyTone = params.corpsLight
      / max(dot(params.corpsLight, vec3f(0.299, 0.587, 0.114)), 0.05);
    let bed = color * (1.0 - shade);
    let aim = min(1.0, params.liveFloor * 1.6) * live * bodyLum;
    let under = dot(bed, vec3f(0.299, 0.587, 0.114));
    let lit = bed + bodyTone * max(aim - under, 0.0);
    let sheet = mix(color, params.bg, shade * 0.6);
    let inked = mix(sheet, params.ink, min(1.0, params.liveFloor * 1.6) * live);
    color = mix(lit, inked, paperW);
  }
  // The lightning: each strong accent blows a flash through the whole
  // frame — multiplicative so the image itself flares, plus a veil so even
  // the black breathes with the kick. Restrained: the flash must read as
  // light, never blow the frame into fringe-torn white.
  if (params.flash > 0.003) {
    color = color * (1.0 + params.flash * 0.3)
      + (params.grade * 0.5 + vec3f(0.24)) * params.flash * 0.16;
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

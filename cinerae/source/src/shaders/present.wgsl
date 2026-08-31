// Final grade: HDR trail -> canvas. Monochrome warm dust on deep black;
// the RGB spectral fringe exists only on audio transitoires, and its hue is
// tunable. The optional wind overlay renders the optical-flow field as faint
// directional veils in the same warm palette — a reading aid, not a debug view.
struct PresentParams {
  texel: vec2f,
  exposure: f32,
  fringe: f32,      // transient-driven, 0 almost always
  fringeTint: f32,  // 0 = warm red bias, 0.5 = neutral, 1 = cool blue bias
  overlay: f32,     // wind-field overlay opacity
  time: f32,
};

@group(0) @binding(0) var<uniform> params: PresentParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

fn luma(uv: vec2f) -> f32 {
  return textureSampleLevel(trail, samp, uv, 0.0).r;
}

fn grain(uv: vec2f) -> f32 {
  let p = uv * 1000.0 + vec2f(params.time * 61.7, params.time * 39.3);
  let h = fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
  return (h - 0.5) / 255.0 * 3.0;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let center = uv - vec2f(0.5);
  let dir = center * params.fringe * 14.0 * params.texel * 60.0;

  // Spectral separation along the radial axis, transitoires only.
  // The tint biases which side of the spectrum leads.
  let wr = 1.0 + (0.5 - params.fringeTint) * 1.1;
  let wb = 1.0 + (params.fringeTint - 0.5) * 1.1;
  let g = luma(uv);
  let r = g + (luma(uv + dir) - g) * wr;
  let b = g + (luma(uv - dir) - g) * wb;

  let exposure = params.exposure;
  var color = vec3f(
    1.0 - exp(-max(r, 0.0) * exposure),
    1.0 - exp(-g * exposure),
    1.0 - exp(-max(b, 0.0) * exposure),
  );

  // Wind-field overlay: motion becomes slow warm veils, direction smeared
  // along the flow itself so currents read as brushed strokes.
  if (params.overlay > 0.001) {
    let v = textureSampleLevel(field, samp, uv, 0.0).rg;
    let v2 = textureSampleLevel(field, samp, uv - v * 0.05, 0.0).rg;
    let mag = (length(v) + length(v2)) * 0.5;
    let veil = min(mag * 2.4, 1.0) * params.overlay;
    color += vec3f(1.0, 0.86, 0.68) * veil * 0.22;
  }

  // Warm-white tint over deep black, gentle vignette, dither against banding.
  color *= vec3f(1.0, 0.92, 0.80);
  let vignette = 1.0 - dot(center, center) * 0.55;
  color *= vignette;
  color += vec3f(grain(uv));
  return vec4f(max(color, vec3f(0.0)), 1.0);
}

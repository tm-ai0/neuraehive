// Final grade: HDR trail -> canvas. Monochrome warm dust on deep black;
// the RGB spectral fringe exists only on audio transients.
struct PresentParams {
  texel: vec2f,
  exposure: f32,
  fringe: f32,   // transient-driven, 0 almost always
  time: f32,
};

@group(0) @binding(0) var<uniform> params: PresentParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

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

  // Spectral separation along the radial axis, transients only.
  let r = luma(uv + dir);
  let g = luma(uv);
  let b = luma(uv - dir);

  let exposure = params.exposure;
  var color = vec3f(
    1.0 - exp(-r * exposure),
    1.0 - exp(-g * exposure),
    1.0 - exp(-b * exposure),
  );

  // Warm-white tint over deep black, gentle vignette, dither against banding.
  color *= vec3f(1.0, 0.92, 0.80);
  let vignette = 1.0 - dot(center, center) * 0.55;
  color *= vignette;
  color += vec3f(grain(uv));
  return vec4f(max(color, vec3f(0.0)), 1.0);
}

// Camera frame -> low-resolution luminance field. The camera image itself is
// never shown; only this luminance (and its motion) drives the particles.
struct LumaParams {
  // Cover-crop mapping from field UV to camera UV: uv * scale + offset.
  scale: vec2f,
  offset: vec2f,
  mirror: f32,
};

@group(0) @binding(0) var<uniform> params: LumaParams;
@group(0) @binding(1) var cam: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Mirrored by default so on-screen motion matches the performer's motion.
  let flipped = vec2f(mix(uv.x, 1.0 - uv.x, params.mirror), uv.y);
  let camUv = flipped * params.scale + params.offset;
  let rgb = textureSampleLevel(cam, samp, camUv, 0.0).rgb;
  let luma = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  // v0.7.6 — the color rides along for the learned background (rgb); the
  // luminance keeps its own channel (a) so the flow reads the same value.
  return vec4f(rgb, luma);
}

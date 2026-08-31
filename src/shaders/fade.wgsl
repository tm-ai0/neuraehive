// Trail persistence: copy the previous trail, slightly dimmed, into the next
// trail target before the particles draw on top. The subtractive floor kills
// long-lived ghosting that pure multiplication never quite clears.
struct FadeParams {
  decay: f32,
};

@group(0) @binding(0) var<uniform> params: FadeParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let prev = textureSampleLevel(trail, samp, uv, 0.0).rgb;
  let faded = max(prev * params.decay - vec3f(0.0006), vec3f(0.0));
  return vec4f(faded, 1.0);
}

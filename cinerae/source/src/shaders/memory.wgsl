// Cendre mémoire: a slow trace of where people moved. Each texel keeps the
// strongest motion energy it has seen, decaying over a tunable duration —
// a bed of ash that hollows where bodies pass. A strong transient (a hand
// clap) wipes it clean in one frame.
struct MemoryParams {
  keep: f32,  // per-frame decay factor, exp(-dt / duration)
  clear: f32, // 1 = wipe this frame
};

@group(0) @binding(0) var<uniform> params: MemoryParams;
@group(0) @binding(1) var memPrev: texture_2d<f32>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.clear > 0.5) {
    return vec4f(0.0);
  }
  let prev = textureSampleLevel(memPrev, samp, uv, 0.0).r;
  let energy = textureSampleLevel(field, samp, uv, 0.0).a;
  let mem = max(prev * params.keep, min(energy * 1.6, 1.0));
  return vec4f(mem, 0.0, 0.0, 1.0);
}

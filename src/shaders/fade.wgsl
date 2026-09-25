// Trail persistence: copy the previous trail, slightly dimmed, into the next
// trail target before the particles draw on top. The subtractive floor kills
// long-lived ghosting that pure multiplication never quite clears.
//
// v0.7.1 — presence trail: while someone stands in the frame, the trail
// decays much slower inside the body's light, so the corps layer leaves a
// two-to-three-second wake behind every movement of the person.
struct FadeParams {
  decay: f32,
  bodyKeep: f32,  // per-frame keep factor of the presence trail (exp(-dt/tau))
  presence: f32,  // someone-in-frame envelope 0..1
  liveKeep: f32,  // v0.7.4 — keep factor of the live body (alpha), ~80 ms
};

@group(0) @binding(0) var<uniform> params: FadeParams;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let prevA = textureSampleLevel(trail, samp, uv, 0.0);
  let prev = prevA.rgb;
  // The wake lives where the camera light is (or just was): body luminance
  // slows the decay and softens the subtractive floor.
  let body = params.presence
    * smoothstep(0.10, 0.55, textureSampleLevel(field, samp, uv, 0.0).b);
  let keep = mix(params.decay, max(params.decay, params.bodyKeep), body);
  let floorCut = 0.0006 * (1.0 - body * 0.85);
  let faded = max(prev * keep - vec3f(floorCut), vec3f(0.0));
  // v0.7.4 — the alpha channel is the LIVE body: the corps grains of the
  // last few frames only (an 80 ms memory, dense enough to be a body, short
  // enough to be the pose of the instant). The rgb is the wake; the alpha
  // is the person.
  return vec4f(faded, prevA.a * params.liveKeep);
}

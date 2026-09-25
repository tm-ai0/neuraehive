// v0.7.6 — the learned background: per texel of the flow field, the running
// mean color of the room (rgb) and the variance of its noise (a). It learns
// slowly (tau 12 s, so a change of the room's light is absorbed in a few
// tens of seconds) only where no body is seen, and freezes under the mask
// so a standing visitor never prints into the room. A texel masked for
// 20 s while the whole frame was still is a ghost (someone was there at
// the reset, or the reset was taken with a visitor in front): it is then
// absorbed on a faster clock (tau 5 s). A reset takes the current frame as
// the room and a wide initial noise; nothing here is ever stored.
import { bgDistance } from "./bgcommon.wgsl";

struct LearnParams {
  dt: f32,
  reset: f32,
};

@group(0) @binding(0) var<uniform> params: LearnParams;
@group(0) @binding(1) var cam: texture_2d<f32>;
@group(0) @binding(2) var bgPrev: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var gainTex: texture_2d<f32>;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2i(textureDimensions(cam, 0));
  let p = vec2i(uv * vec2f(dims));
  let cur = textureLoad(cam, p, 0).rgb;
  if (params.reset > 0.5) {
    return vec4f(cur, 0.0025);
  }
  let gain = textureLoad(gainTex, vec2i(0), 0).rgb;
  let c = cur * gain;
  let prev = textureLoad(bgPrev, p, 0);
  let m = textureLoad(mask, p, 0);
  let body = clamp(m.r, 0.0, 1.0);
  let ghost = smoothstep(20.0, 24.0, m.g);
  let rateRoom = (1.0 - exp(-params.dt / 12.0)) * (1.0 - body);
  let rateGhost = (1.0 - exp(-params.dt / 5.0)) * ghost;
  let rate = max(rateRoom, rateGhost);
  let mean = mix(prev.rgb, c, rate);
  // Noise: the squared plain distance where nothing is seen, eased over
  // 6 s, floored so a perfectly still synthetic image keeps a sane threshold.
  let d2 = m.a * m.a;
  let rateV = (1.0 - exp(-params.dt / 6.0)) * (1.0 - body);
  let variance = max(mix(prev.a, d2, rateV), 1e-5);
  return vec4f(mean, variance);
}

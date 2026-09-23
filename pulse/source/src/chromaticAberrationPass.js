import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Screen-space RGB split, radial from the frame center so it reads as an
// optical/signal tear rather than a fixed directional smear. uIntensity is a
// UV-space offset magnitude — tiny (a few hundredths) is already dramatic.
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;

    void main() {
      vec2 dir = vUv - 0.5;
      vec2 offset = dir * uIntensity;

      float r = texture2D(tDiffuse, vUv - offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + offset).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

export function createChromaticAberrationPass() {
  return new ShaderPass(ChromaticAberrationShader);
}

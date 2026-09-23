import { simplexNoise3D } from "./noise.glsl.js";

// Shared surface displacement + tension logic used by both the solid blob
// mesh and the companion dissolve-particles system, so the two stay in sync:
// particles appear exactly where/when the mesh erodes, because both sample
// the same noise field with the same uniforms. Include this chunk once per
// shader stage that needs it (each stage must declare its own uniforms).
export const blobDisplacement = /* glsl */ `
  ${simplexNoise3D}

  uniform float uTime;
  uniform float uAmplitude;
  uniform float uFrequency;
  uniform float uSpeed;
  uniform float uFracture;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  // Coarse 2-octave noise: only the low end of the spectrum, used for the
  // liquid masses so no fine high-frequency detail sneaks in and reads as
  // spikiness.
  float fbmLarge(vec3 p) {
    float value = 0.0;
    float amp = 0.6;
    for (int i = 0; i < 2; i++) {
      value += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  // Domain warping: displace the sample point by coarse noise evaluated in
  // three offset copies of itself before sampling the "real" noise. Turns
  // plain noise into fluid, mercury-like flow instead of a fixed bump field.
  vec3 domainWarp(vec3 p, float strength) {
    vec3 q = vec3(
      fbmLarge(p + vec3(1.7, 9.2, 3.1)),
      fbmLarge(p + vec3(8.3, 2.8, 5.7)),
      fbmLarge(p + vec3(4.1, 6.6, 1.9))
    );
    return p + q * strength;
  }

  // The raw blended noise value (roughly [-1, 1]) before amplitude scaling.
  // Doubles as the "tension" signal: its most extreme values are where the
  // surface is under the most liquid stress, and therefore where it should
  // erode into particles first as uDissolve rises.
  float liquidShapeAt(vec3 pos) {
    vec3 p = pos * uFrequency + vec3(0.0, 0.0, uTime * uSpeed);
    float smoothShape = fbm(p);

    float liquidFreq = uFrequency * 0.4 + uFracture * 0.25;
    vec3 pLiquid = pos * liquidFreq + vec3(0.0, 0.0, uTime * uSpeed * 0.5);
    vec3 warped = domainWarp(pLiquid, 0.25 + uFracture * 0.25);
    float liquidShape = fbmLarge(warped);

    return mix(smoothShape, liquidShape, uFracture);
  }

  float displaceFrom(float shape) {
    return shape * uAmplitude * (1.0 + uFracture * 4.5);
  }

  float displace(vec3 pos) {
    return displaceFrom(liquidShapeAt(pos));
  }
`;

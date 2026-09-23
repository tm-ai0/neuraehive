import * as THREE from "three";
import { blobDisplacement } from "./blobDisplacement.glsl.js";

// Dissolve particles: reuses the blob's own geometry (same vertex positions)
// as a point cloud sampling the identical noise field, so specks only appear
// exactly where/when the mesh (blobMaterial.js) erodes a hole — same tension
// value, same uDissolve threshold. Points past the threshold drift outward
// with a per-point jitter and fade in softly; below threshold they collapse
// to zero size, i.e. invisible, so at uDissolve=0 nothing is drawn at all.
// uTime/uAmplitude/uFrequency/uSpeed/uFracture/uDissolve/uColor are passed in
// as shared uniform *references* from the blob material so both stay
// perfectly in sync without main.js having to update them twice.
export function createParticlesMaterial(sharedUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uAmplitude: sharedUniforms.uAmplitude,
      uFrequency: sharedUniforms.uFrequency,
      uSpeed: sharedUniforms.uSpeed,
      uFracture: sharedUniforms.uFracture,
      uDissolve: sharedUniforms.uDissolve,
      uColor: sharedUniforms.uColor,
      uPointSize: { value: 5.5 },
    },
    vertexShader: /* glsl */ `
      ${blobDisplacement}

      uniform float uDissolve;
      uniform float uPointSize;

      varying float vAlpha;

      void main() {
        float shape = liquidShapeAt(position);
        float d = displaceFrom(shape);
        vec3 basePos = position + normal * d;

        // Same erosion criterion as the blob's fragment shader (shapeNorm +
        // per-sample dither vs. a cutoff derived from uDissolve), but
        // evaluated per-vertex with a stable per-point hash instead of a
        // per-pixel one, and softened into a fade rather than a hard cut so
        // particles ease in instead of popping.
        float shapeNorm = clamp(shape * 0.5 + 0.5, 0.0, 1.0);
        float cutoff = mix(0.88, 0.1, uDissolve);
        float rnd = hash(position.xy * 13.7 + position.z * 7.3);
        float edge = shapeNorm + rnd * 0.18 - 0.09;
        float activeAmt = smoothstep(cutoff, cutoff + 0.12, edge);

        // Escape outward proportionally to how far past the threshold this
        // point is, plus a gentle per-point oscillation so the cloud drifts
        // instead of sitting frozen — reads as particles straining to break
        // free, not a static dust shell. Clamped so even at uDissolve=1 the
        // cloud stays close to the surface (an eroding halo) instead of
        // scattering across the whole scene.
        float escape = min(max(edge - cutoff, 0.0), 0.6) * 0.5;
        float jitter = sin(uTime * (1.5 + rnd * 2.0) + rnd * 6.2831) * 0.05;
        vec3 dispersed = basePos + normal * (escape + jitter * activeAmt);

        vec4 mvPosition = modelViewMatrix * vec4(dispersed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uPointSize * activeAmt * (6.0 / -mvPosition.z);

        vAlpha = activeAmt;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        if (vAlpha < 0.01) discard;
        vec2 centered = gl_PointCoord - 0.5;
        float dist = length(centered);
        if (dist > 0.5) discard;
        float soft = smoothstep(0.5, 0.1, dist);
        gl_FragColor = vec4(uColor, soft * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

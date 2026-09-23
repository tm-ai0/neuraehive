import * as THREE from "three";
import { blobDisplacement } from "./blobDisplacement.glsl.js";

// Idle-state blob: organic low-amplitude fbm displacement (a slow "breathing"
// surface). At uFracture=1 the surface is under liquid "tension": domain-warped
// fbm pushes it into large, fluid, mercury-like masses with much bigger
// amplitude, but the silhouette stays fully curved — no ridged/absolute-value
// noise, so there are never sharp creases. The shading normal is rebuilt from
// the actual displaced surface (finite-difference tangent/bitangent sampling)
// so the moving masses genuinely catch light instead of just perturbing the
// silhouette. At uDissolve>0, the highest-tension patches of surface (the
// same noise value that drives the liquid masses) erode away via fragment
// discard, with a dithered edge; the companion particles system (see
// particlesMaterial.js) samples the identical noise field so specks appear
// exactly where/when the mesh opens up.
export function createBlobMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAmplitude: { value: 0.055 },
      uFrequency: { value: 1.4 },
      uSpeed: { value: 0.18 },
      uFracture: { value: 0 }, // 0 = smooth idle surface, 1 = full liquid tension
      uDissolve: { value: 0 }, // 0 = solid surface, 1 = maximally eroded
      uColor: { value: new THREE.Color("#e8edf2") },
      uBackground: { value: new THREE.Color("#0a0a0e") },
    },
    vertexShader: /* glsl */ `
      ${blobDisplacement}

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vTension;

      void main() {
        float shape = liquidShapeAt(position);
        float d = displaceFrom(shape);
        vec3 displaced = position + normal * d;

        // Rebuild the normal from the displaced neighborhood instead of
        // reusing the undisplaced sphere normal, so lighting reflects the
        // actual deformed geometry. The tangent frame must vary continuously
        // over the whole sphere: a naive "pick a different reference axis
        // past this threshold" branch creates a hard discontinuity in the
        // tangent direction across that threshold latitude — invisible at
        // small displacement, but at high fracture amplitude it tears the
        // finite-difference normal into a jagged seam. This branchless
        // construction (Duff et al., "Building an Orthonormal Basis,
        // Revisited") has no such jump.
        float sign_ = normal.z >= 0.0 ? 1.0 : -1.0;
        float a_ = -1.0 / (sign_ + normal.z);
        float b_ = normal.x * normal.y * a_;
        vec3 tangent = vec3(1.0 + sign_ * normal.x * normal.x * a_, sign_ * b_, -sign_ * normal.x);
        vec3 bitangent = vec3(b_, sign_ + normal.y * normal.y * a_, -normal.y);
        float eps = 0.02;

        vec3 posT = position + tangent * eps;
        vec3 posB = position + bitangent * eps;
        vec3 dispT = posT + normal * displace(posT);
        vec3 dispB = posB + normal * displace(posB);

        vec3 displacedNormal = normalize(cross(dispT - displaced, dispB - displaced));
        // cross() sign depends on tangent/bitangent handedness; make sure it
        // points outward like the original normal.
        if (dot(displacedNormal, normal) < 0.0) displacedNormal = -displacedNormal;

        // At rest, keep shading close to the smooth sphere normal (soft matte
        // look); as tension rises, switch over to the true displaced normal so
        // the moving liquid masses actually catch light.
        float normalMix = clamp(0.08 + uFracture * 0.92, 0.0, 1.0);
        vec3 shadingNormal = normalize(mix(normal, displacedNormal, normalMix));

        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;

        vNormal = normalize(normalMatrix * shadingNormal);
        vViewPosition = -mvPosition.xyz;
        vTension = shape;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uBackground;
      uniform float uFracture;
      uniform float uDissolve;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vTension;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        // Dissolve: erode the highest-tension patches first, with a grainy
        // dithered edge instead of a clean iso-line, so it reads as eroding
        // into grain rather than being cut out.
        if (uDissolve > 0.001) {
          float shapeNorm = clamp(vTension * 0.5 + 0.5, 0.0, 1.0);
          float cutoff = mix(0.88, 0.1, uDissolve);
          float dither = hash(gl_FragCoord.xy);
          if (shapeNorm + dither * 0.18 - 0.09 > cutoff) discard;
        }

        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 lightDir = normalize(vec3(0.5, 0.8, 0.65));
        vec3 halfDir = normalize(lightDir + viewDir);

        float diffuse = max(dot(normal, lightDir), 0.0);
        float shading = mix(0.32, 1.0, diffuse); // never fully black on the shadow side

        // Idle surface: broad, soft highlight (matte). Under liquid tension:
        // tighter, glossier highlight that slides across the curved masses
        // (mercury-like sheen) rather than sparkling off hard facets.
        float specPower = mix(8.0, 70.0, uFracture);
        float specStrength = mix(0.12, 1.6, uFracture);
        float specular = pow(max(dot(normal, halfDir), 0.0), specPower) * specStrength;

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5);

        vec3 color = uColor * shading + vec3(specular) + uColor * fresnel * 0.5;

        float visibility = clamp(shading + fresnel * 0.5, 0.0, 1.0);
        color = mix(uBackground, color, visibility);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

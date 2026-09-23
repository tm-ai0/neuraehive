import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBlobMaterial } from "./blobMaterial.js";
import { createParticlesMaterial } from "./particlesMaterial.js";
import { createChromaticAberrationPass } from "./chromaticAberrationPass.js";
import { AudioAnalyzer } from "./audio.js";

const BACKGROUND_COLOR = "#0a0a0e";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 4.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Orbit the camera around the blob on drag instead of deforming the surface.
// autoRotate keeps drifting during a manual drag too (it's additive to the
// user's own orbit delta, not overridden by it) — at this slow a speed that
// reads as the object continuing to breathe/turn rather than fighting the
// user, so no separate "pause then resume after idle" timer is needed.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.76; // ~0.08 rad/s at 60fps, matches the previous manual rotation

const geometry = new THREE.IcosahedronGeometry(1, 96);
const material = createBlobMaterial();
const blob = new THREE.Mesh(geometry, material);
scene.add(blob);

// Dissolve particles: same geometry (so points sample the identical vertex
// set as the mesh), same object transform, shared uniforms with the blob
// material (see particlesMaterial.js) so the two stay perfectly in sync.
const particlesMaterial = createParticlesMaterial(material.uniforms);
const dissolveParticles = new THREE.Points(geometry, particlesMaterial);
blob.add(dissolveParticles);

// EffectComposer renders the scene into an offscreen target before the
// aberration pass — by default that target isn't multisampled, which
// silently throws away the renderer's antialias:true and left jagged edges
// anywhere the surface met the silhouette (most visible on tight concave
// dents, where local silhouette curvature is highest).
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  { samples: 4 }
);
const composer = new EffectComposer(renderer, renderTarget);
composer.addPass(new RenderPass(scene, camera));
const aberrationPass = createChromaticAberrationPass();
aberrationPass.renderToScreen = true;
composer.addPass(aberrationPass);

const clock = new THREE.Clock();

// Maps the smoothed bass energy (audio.js, kept untouched, always [0,1]) to
// the shader's uFracture range. A sqrt-like curve (exponent < 1) makes the
// effect show up earlier in the volume range instead of only at the very
// top, and the gain pushes loud passages up toward the extended 0-2 range.
const FRACTURE_GAIN = 2.0;
const FRACTURE_CURVE = 0.5;

function mapBassToFracture(bass) {
  return Math.pow(Math.min(Math.max(bass, 0), 1), FRACTURE_CURVE) * FRACTURE_GAIN;
}

// TEMP DIAGNOSTIC: swapped from the pow()-curve mapping to a plain linear
// threshold ramp, structurally identical to mapFractureToDissolve() below
// (same shape, same 0-1 output range) — mirroring the mapping that's known
// to work (dissolve particles are visible in real use) to isolate whether
// the aberration problem is this JS mapping never reaching a usable value,
// or something downstream in the shader/composer that ignores it regardless.
// Thresholds picked from real logged treble readings (0.31-0.45 at normal
// volume) so those known-real values land mid-range here, not near zero.
const ABERRATION_TREBLE_START = 0.1;
const ABERRATION_TREBLE_END = 0.5;
const ABERRATION_UV_GAIN = 0.03; // max UV-space RGB offset at intensity=1

function mapTrebleToAberrationIntensity(treble) {
  const t = (treble - ABERRATION_TREBLE_START) / (ABERRATION_TREBLE_END - ABERRATION_TREBLE_START);
  return Math.min(Math.max(t, 0), 1);
}

// The base linear gain above is calibrated for normal volume (intensity
// ~0.3-0.6) and shouldn't move. Peaks need to hit noticeably harder without
// disturbing that calibration, so instead of reshaping the whole curve, a
// second term ramps in only above a threshold, on top of the unchanged base
// term — a "boost on peak" rather than a global curve swap.
const ABERRATION_PEAK_THRESHOLD = 0.7;
const ABERRATION_PEAK_GAIN = 0.025;

function computeAberrationUV(intensity) {
  const base = intensity * ABERRATION_UV_GAIN;
  const peakExcess =
    Math.max(intensity - ABERRATION_PEAK_THRESHOLD, 0) / (1 - ABERRATION_PEAK_THRESHOLD);
  const boost = Math.pow(peakExcess, 2) * ABERRATION_PEAK_GAIN;
  return base + boost;
}

// Dissolution derived directly from the already-computed uFracture value
// (itself bass-driven), so the same regions under the most liquid tension
// are the ones that erode — no separate audio signal needed. The previous
// pass (start 0.8) made dissolve trigger at ordinary moderate volume, turning
// it into a near-permanent state instead of a rare peak event. Raised back
// up so it stays a genuine "extreme peak" moment.
const DISSOLVE_FRACTURE_START = 1.6;
const DISSOLVE_FRACTURE_END = 2.0;

function mapFractureToDissolve(fractureValue) {
  const t =
    (fractureValue - DISSOLVE_FRACTURE_START) / (DISSOLVE_FRACTURE_END - DISSOLVE_FRACTURE_START);
  return Math.min(Math.max(t, 0), 1);
}

const audio = new AudioAnalyzer();
const gate = document.getElementById("audio-gate");
const gateButton = document.getElementById("audio-gate-button");
const gateMessage = document.getElementById("audio-gate-message");

gateButton.addEventListener("click", async () => {
  gateButton.disabled = true;
  gateMessage.textContent = "";
  try {
    await audio.start();
    gate.classList.add("hidden");
  } catch (err) {
    gateButton.disabled = false;
    gateMessage.textContent =
      "Accès micro refusé ou indisponible. Autorise le micro puis réessaie.";
  }
});

// Debug: scrub uFracture directly, independent of audio, to validate the
// visual extremes before relying on live mic input.
let debugFracture = null;
const debugSlider = document.getElementById("debug-fracture");
const debugValue = document.getElementById("debug-fracture-value");
debugSlider.addEventListener("input", () => {
  debugFracture = parseFloat(debugSlider.value);
  debugValue.textContent = debugFracture.toFixed(2);
});

let debugAberration = null;
const debugAberrationSlider = document.getElementById("debug-aberration");
const debugAberrationValue = document.getElementById("debug-aberration-value");
debugAberrationSlider.addEventListener("input", () => {
  debugAberration = parseFloat(debugAberrationSlider.value);
  debugAberrationValue.textContent = debugAberration.toFixed(2);
});

let debugDissolve = null;
const debugDissolveSlider = document.getElementById("debug-dissolve");
const debugDissolveValue = document.getElementById("debug-dissolve-value");
debugDissolveSlider.addEventListener("input", () => {
  debugDissolve = parseFloat(debugDissolveSlider.value);
  debugDissolveValue.textContent = debugDissolve.toFixed(2);
});

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

// Temp: calibrating the treble/bass -> aberration/dissolve mapping against
// real mic data instead of guessing. Throttled to ~1/s so it's readable
// while talking/playing music into the mic. Remove once calibrated.
let lastLogTime = 0;

function animate() {
  clock.getDelta();
  material.uniforms.uTime.value = clock.elapsedTime;

  const { bass, treble } = audio.update();
  const fractureValue = debugFracture !== null ? debugFracture : mapBassToFracture(bass);
  material.uniforms.uFracture.value = fractureValue;

  const dissolveValue =
    debugDissolve !== null ? debugDissolve : mapFractureToDissolve(fractureValue);
  material.uniforms.uDissolve.value = dissolveValue;

  const aberrationIntensity =
    debugAberration !== null ? debugAberration : mapTrebleToAberrationIntensity(treble);
  aberrationPass.uniforms.uIntensity.value = computeAberrationUV(aberrationIntensity);

  if (audio.ready && clock.elapsedTime - lastLogTime > 1) {
    lastLogTime = clock.elapsedTime;
    console.log(
      `[audio] bass=${bass.toFixed(3)} treble=${treble.toFixed(3)} | fracture=${fractureValue.toFixed(3)} dissolve=${dissolveValue.toFixed(3)} aberration=${aberrationIntensity.toFixed(3)} uv=${aberrationPass.uniforms.uIntensity.value.toFixed(4)}`
    );
  }

  controls.update();

  composer.render();
  requestAnimationFrame(animate);
}
animate();

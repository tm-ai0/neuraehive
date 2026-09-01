// The vgpu graph. Per frame: (camera upload) -> luma -> optical flow ->
// particle compute -> trail fade + additive particles -> graded present.
// Buffers are allocated once at MAX_PARTICLES; the live count is a uniform
// plus a per-call instance count, so every control acts without any rebuild.
import {
  clock,
  compute,
  draw,
  effect,
  frameLoop,
  init,
  pingPongStorage,
  sampler,
  storage,
  surface,
  target,
  type Gpu,
  type Target,
  type Texture,
} from "vgpu";

import fadeWgsl from "./shaders/fade.wgsl";
import flowWgsl from "./shaders/flow.wgsl";
import lumaWgsl from "./shaders/luma.wgsl";
import memoryWgsl from "./shaders/memory.wgsl";
import particlesWgsl from "./shaders/particles.wgsl";
import presentWgsl from "./shaders/present.wgsl";
import simulateWgsl from "./shaders/simulate.wgsl";
import { IMPRINT_MAX_POINTS, type ImprintCloud } from "./imprints";
import { defaultLookColors, isLightBg, type LookColors } from "./look";

const FLOW_W = 192;
const FLOW_H = 108;
const FIELD_FORMAT: GPUTextureFormat = "rgba16float";
const WORKGROUP = 256;
const BYTES_PER_PARTICLE = 32; // pos+vel, then heat/age/comet/spare
export const MAX_PARTICLES = 400_000;

export interface Tuning {
  force: number;
  viscosity: number;
  turbulence: number;
  pointSize: number;
  baseAlpha: number;
  trailDecay: number;
  exposure: number;
  fringeTint: number; // 0 warm .. 1 cool
  windOverlay: number; // 0 off .. 1 full veils
  mirror: number; // 1 = mirrored camera (default)
  count: number;
  emberGain: number; // ember births on strong transients
  cymGain: number; // cymatic figure strength
  gustStrength: number; // resting-state gusts
  filament: number; // resting filament field
  ashShare: number; // ~share of the population living as dark ash
  lifeSeconds: number; // full life-cycle duration
  sediment: number; // peripheral drift of ash
  cometGain: number; // camera-tear sensitivity
  gestureGain: number; // manual multiplier over the adaptive gesture gain
  push: number; // v0.7.1b — the body shoves the dust: 0 = it drifts through me
  // ---- look (all inert at their defaults: the historical render) ----------
  colorDriver: number; // 0 âge, 1 vitesse, 2 densité, 3 profondeur
  blendMode: number; // 0 additif, 1 écran, 2 tamisée, 3 dodge, 4 soustractif
  halo: number; // soft bloom amount
  paperGrain: number; // static paper tooth
  depthAmount: number; // parallax layer separation
  focusLayer: number; // 0 far, 1 mid, 2 near
  dofBlur: number; // out-of-focus blur
  symMode: number; // 0 none, 1 mirror H, 2 mirror V, 3 quadrants, 4 radial
  symN: number; // radial branches
  timeScale: number; // -1 rewind .. 0 freeze .. 1 normal
  strobe: number; // discreet strobe on transients
  memoryGain: number; // cendre mémoire veil strength
  memorySeconds: number; // memory duration
  ghost: number; // camera-luminance veil (Pro)
  // ---- présence / deux couches (inert while dynamics.presence stays 0) ----
  bodyMat: number; // corps material 0..7 (fumée, liquide, encre, points, dither, lignes, moiré, contours) — fractional blends
  fondMat: number; // fond material, same scale
  // Crossfade material pair: while matBlend > 0 the shaders blend these two
  // materials directly (stochastic per grain) instead of sweeping the
  // scalar through the whole ladder. Written by the A/B crossfade only.
  bodyMatA: number;
  bodyMatB: number;
  fondMatA: number;
  fondMatB: number;
  matBlend: number;
  presenceShare: number; // resting bias: share of the grains serving the corps
  presenceSize: number; // point-size multiplier of corps grains
  presenceHold: number; // serrage — 0 = free dust (historical), 1 = rigid portrait
  elastic: number; // how far the corps yields under a gesture
  fondVisible: number; // fond brightness while someone is there
  bodyMargin: number; // shadow margin: fond eviction strength around the body
  presenceTrail: number; // seconds of wake left by the corps layer
  voiceEase: number; // how much the voice relaxes the serrage
  fondReact: number; // how much the fond feels the gesture wind
}

export interface Dynamics {
  bass: number;
  treble: number;
  transient: number;
  reactivity: number; // 1 = full camera coupling; the fond mode quiets it
  crystal: number;
  titleMode: number;
  chaosAspire: number;
  chaosBurst: number;
  dissolve: number;
  touchX: number;
  touchY: number;
  touchStrength: number;
  gustX: number; // gust direction x envelope, set by the orchestrator
  gustY: number;
  cymatic: number; // sustained-tone envelope 0..1
  cymM: number; // Chladni mode numbers
  cymN: number;
  windGain: number; // effective gesture gain fed to the flow injection
  memoryClear: number; // 1 = wipe the cendre mémoire this frame (consumed)
  presence: number; // someone-in-frame envelope 0..1, set by the orchestrator
  voice: number; // smoothed voice level 0..1 — relaxes the corps serrage
  hand: number; // hands envelope 0..1 — fast small motion, set by the orchestrator
}

export const DEFAULT_TUNING: Tuning = {
  force: 1.2,
  viscosity: 2.2,
  turbulence: 0.55,
  pointSize: 1.9,
  baseAlpha: 0.11,
  trailDecay: 0.9,
  exposure: 1.6,
  fringeTint: 0.5,
  windOverlay: 0,
  mirror: 1,
  count: 400_000,
  emberGain: 1,
  cymGain: 1,
  gustStrength: 1,
  filament: 1,
  ashShare: 0.15,
  lifeSeconds: 45,
  sediment: 0.6,
  cometGain: 1,
  gestureGain: 1,
  push: 1,
  colorDriver: 0,
  blendMode: 0,
  halo: 0,
  paperGrain: 0,
  depthAmount: 0,
  focusLayer: 1,
  dofBlur: 0,
  symMode: 0,
  symN: 6,
  timeScale: 1,
  strobe: 0,
  memoryGain: 0,
  memorySeconds: 12,
  ghost: 0,
  bodyMat: 0,
  fondMat: 0,
  bodyMatA: 0,
  bodyMatB: 0,
  fondMatA: 0,
  fondMatB: 0,
  matBlend: 0,
  presenceShare: 0.7,
  presenceSize: 1.5,
  presenceHold: 0.6,
  elastic: 0.5,
  fondVisible: 0.35,
  bodyMargin: 1,
  presenceTrail: 2.5,
  voiceEase: 0.6,
  fondReact: 1,
};

interface CameraInput {
  video: HTMLVideoElement;
  width: number;
  height: number;
  consumeDirty(): boolean;
}

function makeSeed(count: number): Float32Array<ArrayBuffer> {
  const seed = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    seed[i * 8] = Math.random();
    seed[i * 8 + 1] = Math.random();
    // Ages spread over the whole cycle, so the ash share is there from the
    // first frame instead of arriving in one synchronized wave.
    seed[i * 8 + 5] = Math.random();
  }
  return seed;
}

function decodeF16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exp = (bits >> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 31) return mant ? Number.NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  initialImprint: ImprintCloud
) {
  const gpu: Gpu = await init();
  const output = surface(gpu, canvas, { dpr: [1, 1.5] });
  const time = clock(gpu);

  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const flowSize: [number, number] = [FLOW_W, FLOW_H];
  const lumaTargets = [
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-luma-a" }),
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-luma-b" }),
  ];
  const fieldTargets = [
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-field-a" }),
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-field-b" }),
  ];
  let lumaIndex = 0; // current write index
  let fieldIndex = 0;

  const makeTrail = (suffix: string): Target =>
    target(gpu, {
      size: [Math.max(1, output.size[0]), Math.max(1, output.size[1])],
      format: FIELD_FORMAT,
      label: `cinerae-trail-${suffix}`,
    });
  let trailTargets = [makeTrail("a"), makeTrail("b")];
  let trailIndex = 0;

  const lumaEffect = effect(gpu, lumaWgsl, { label: "cinerae-luma" });
  const flowEffect = effect(gpu, flowWgsl, { label: "cinerae-flow" });
  const fadeEffect = effect(gpu, fadeWgsl, { label: "cinerae-fade" });
  const presentEffect = effect(gpu, presentWgsl, { label: "cinerae-present" });
  const simulate = compute(gpu, simulateWgsl, { label: "cinerae-simulate" });

  // Cendre mémoire: a tiny ping-pong accumulator of motion energy.
  const memoryEffect = effect(gpu, memoryWgsl, { label: "cinerae-memory" });
  const memoryTargets = [
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-mem-a" }),
    target(gpu, { size: flowSize, format: FIELD_FORMAT, label: "cinerae-mem-b" }),
  ];
  let memoryIndex = 0;

  // One target buffer for every imprint; the live count is just a uniform,
  // so swapping imprints is a single CPU-side buffer write.
  const titleBuffer = storage(gpu, IMPRINT_MAX_POINTS * 16, "read");
  let imprintCloud: ImprintCloud = initialImprint;
  let imprintMode: "shape" | "camera" = "shape";
  titleBuffer.write(initialImprint.data);

  const tuning: Tuning = { ...DEFAULT_TUNING };
  const look: LookColors = defaultLookColors();
  const dynamics: Dynamics = {
    bass: 0,
    treble: 0,
    transient: 0,
    reactivity: 1,
    crystal: 0,
    titleMode: 0,
    chaosAspire: 0,
    chaosBurst: 0,
    dissolve: 0,
    touchX: 0,
    touchY: 0,
    touchStrength: 0,
    gustX: 0,
    gustY: 0,
    cymatic: 0,
    cymM: 1,
    cymN: 2,
    windGain: 1,
    memoryClear: 0,
    presence: 0,
    voice: 0,
    hand: 0,
  };

  let camera: CameraInput | undefined;
  let cameraTexture: Texture | undefined;
  let cameraSeen = false; // at least one uploaded frame
  let lumaFrames = 0; // luma renders since attach; flow needs two real ones

  const buffers = pingPongStorage(gpu, MAX_PARTICLES * BYTES_PER_PARTICLE);
  const initialSeed = makeSeed(MAX_PARTICLES);
  buffers.read.write(initialSeed);
  buffers.write.write(initialSeed);
  const drawable = draw(gpu, {
    shader: particlesWgsl,
    vertices: 6,
    instances: MAX_PARTICLES,
    blend: { color: { src: "one", dst: "one" }, alpha: { src: "one", dst: "one" } },
    label: "cinerae-particles",
  });

  let fps = 0;
  let disposed = false;
  let renderError: unknown;

  const unsubscribeResize = output.onResize(() => {
    if (disposed) return;
    const previous = trailTargets;
    trailTargets = [makeTrail("a"), makeTrail("b")];
    trailIndex = 0;
    for (const t of previous) t.color.destroy();
  });

  // Imprint layout. "uv" clouds already live in screen space; "shape" clouds
  // are height-normalized: coverage 0 keeps the validated wordmark cap
  // formula, otherwise the height takes a fraction of the screen.
  function titleLayout(): { scale: [number, number]; offset: [number, number] } {
    const c = imprintCloud;
    if (c.space === "uv") return { scale: [1, 1], offset: [0, 0] };
    const [w, h] = output.size;
    const aspect = Math.max(c.aspect, 1e-3);
    const capPx =
      c.coverage > 0
        ? Math.max(24, Math.min(c.coverage * h, (0.92 * w) / aspect))
        : Math.max(36, Math.min((0.6 * w) / aspect, 0.2 * h, 150));
    return {
      scale: [capPx / Math.max(1, w), capPx / Math.max(1, h)],
      offset: [0.5, c.offsetY],
    };
  }

  frameLoop(gpu, (frame) => {
    if (disposed || renderError) return;
    try {
      const dt = Math.min(Math.max(time.deltaTime, 0), 1 / 30);
      if (dt > 0) fps += (1 / dt - fps) * 0.05;

      const count = Math.max(1, Math.min(MAX_PARTICLES, Math.round(tuning.count)));
      // At "poussière libre" (hold 0) presence leaves no trace at all: the
      // envelope is muted so even the ambient calming vanishes.
      const presence =
        dynamics.presence * Math.min(1, tuning.presenceHold / 0.1);
      // The voice loosens the serrage; silence tightens it back.
      const holdEff =
        tuning.presenceHold *
        (1 - Math.min(1, dynamics.voice) * tuning.voiceEase * 0.75);
      // Papier rule: ordered screens weave artifacts on a light sheet, so
      // only stochastic materials survive there — screens fall back to ink.
      const guardMat = (m: number) => {
        if (!isLightBg(look)) return m;
        if (m > 6.5) return 7;
        if (m > 2.001) return 2;
        return m;
      };
      // During a crossfade the material pair blends A and B directly; the
      // scalar only rules when no blend is active.
      const blending = tuning.matBlend > 0.001;
      const bodyMat = guardMat(blending ? tuning.bodyMatA : tuning.bodyMat);
      const bodyMatB = guardMat(blending ? tuning.bodyMatB : tuning.bodyMat);
      const fondMat = guardMat(blending ? tuning.fondMatA : tuning.fondMat);
      const fondMatB = guardMat(blending ? tuning.fondMatB : tuning.fondMat);
      const matBlend = blending ? Math.min(1, tuning.matBlend) : 0;
      const aspect = output.size[0] / Math.max(1, output.size[1]);
      const gridCols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
      const gridRows = Math.max(1, Math.ceil(count / gridCols));
      const title = titleLayout();

      // Time: 1 = normal, toward 0 = ralenti, ~0 = gel, negative = rewind.
      const ts = Math.max(-1, Math.min(1, tuning.timeScale));
      const frozen = Math.abs(ts) < 0.02;
      const simDt = dt * ts;
      const adt = Math.abs(simDt);

      const setPresent = (
        trailTex: Target,
        fieldTex: Target,
        memTex: Target
      ) => {
        presentEffect.set({
          params: {
            texel: output.texelSize,
            exposure: tuning.exposure,
            fringe: dynamics.transient,
            fringeTint: tuning.fringeTint,
            overlay: tuning.windOverlay,
            time: time.time,
            bg: look.bg,
            grade: look.grade,
            ink: look.ink,
            blendMode: tuning.blendMode,
            symMode: tuning.symMode,
            symN: tuning.symN,
            halo: tuning.halo,
            paperGrain: tuning.paperGrain,
            strobe: tuning.strobe,
            ghost: tuning.ghost,
            memoryGain: tuning.memoryGain,
          },
          trail: trailTex,
          field: fieldTex,
          memoryTex: memTex,
          samp: linear,
        });
      };

      // Gel: nothing simulates, nothing fades — the last image simply holds
      // (the grade itself stays live, so strobe or palette still respond).
      if (frozen) {
        setPresent(
          trailTargets[1 - trailIndex]!,
          fieldTargets[1 - fieldIndex]!,
          memoryTargets[1 - memoryIndex]!
        );
        frame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) =>
          pass.draw(presentEffect)
        );
        return;
      }

      // 1. Upload the newest camera frame (never displayed).
      if (camera && cameraTexture && camera.consumeDirty()) {
        gpu.gpu.queue.copyExternalImageToTexture(
          { source: camera.video },
          { texture: cameraTexture.gpu },
          { width: camera.width, height: camera.height }
        );
        cameraSeen = true;
      }

      const lumaCurr = lumaTargets[lumaIndex]!;
      const lumaPrev = lumaTargets[1 - lumaIndex]!;
      const fieldNext = fieldTargets[fieldIndex]!;
      const fieldPrev = fieldTargets[1 - fieldIndex]!;
      const trailNext = trailTargets[trailIndex]!;
      const trailPrev = trailTargets[1 - trailIndex]!;

      // 2. Particle step reads last frame's field (one-frame latency is fine).
      simulate.set({
        params: {
          dt: simDt,
          time: time.time,
          force: tuning.force * dynamics.reactivity,
          viscosity: tuning.viscosity,
          turbulence: tuning.turbulence,
          crystal: dynamics.crystal,
          bass: dynamics.bass,
          treble: dynamics.treble,
          transient: dynamics.transient,
          gridCols,
          gridRows,
          count,
          titleMode: dynamics.titleMode,
          titleCount: Math.max(1, imprintCloud.count),
          titleScale: title.scale,
          titleOffset: title.offset,
          chaosAspire: dynamics.chaosAspire,
          chaosBurst: dynamics.chaosBurst,
          dissolve: dynamics.dissolve,
          touch: [dynamics.touchX, dynamics.touchY, dynamics.touchStrength],
          gust: [
            dynamics.gustX * tuning.gustStrength,
            dynamics.gustY * tuning.gustStrength,
          ],
          cymMN: [dynamics.cymM, dynamics.cymN],
          cymatic: dynamics.cymatic * tuning.cymGain,
          ember: tuning.emberGain,
          filament: tuning.filament,
          lifeRate: 1 / Math.max(5, tuning.lifeSeconds),
          ashLevel: Math.min(0.95, Math.max(0.55, 0.97 - tuning.ashShare)),
          sediment: tuning.sediment,
          cometGain: tuning.cometGain,
          imprintShape: imprintMode === "shape" ? 1 : 0,
          stagger: imprintCloud.stagger,
          depthAmount: tuning.depthAmount,
          presence,
          bodyMat,
          bodyMatB,
          fondMat,
          fondMatB,
          matBlend,
          share: tuning.presenceShare,
          hold: holdEff,
          elastic: tuning.elastic,
          margin: tuning.bodyMargin,
          fondReact: tuning.fondReact,
          push: tuning.push,
        },
        src: buffers.read,
        dst: buffers.write,
        titleTargets: titleBuffer,
        field: fieldPrev,
        fieldSamp: linear,
      });
      simulate.dispatch(Math.ceil(count / WORKGROUP));
      buffers.swap();

      // 3. Luma + flow field for the next step. The wind field remembers, so
      // it must never ingest a comparison against a never-rendered luma: wait
      // for two real frames before declaring the camera to the flow pass.
      const hasCamera = cameraSeen && lumaFrames >= 2 ? 1 : 0;
      if (camera && cameraTexture && cameraSeen) {
        const camAspect = camera.width / camera.height;
        const fieldAspect = FLOW_W / FLOW_H;
        const scale: [number, number] =
          camAspect > fieldAspect
            ? [fieldAspect / camAspect, 1]
            : [1, camAspect / fieldAspect];
        lumaEffect.set({
          params: {
            scale,
            offset: [(1 - scale[0]) / 2, (1 - scale[1]) / 2],
            mirror: tuning.mirror,
          },
          cam: cameraTexture,
          samp: linear,
        });
        frame.pass({ target: lumaCurr, clear: [0, 0, 0, 1] }, (pass) =>
          pass.draw(lumaEffect)
        );
        lumaFrames++;
      }
      flowEffect.set({
        params: {
          texel: [1 / FLOW_W, 1 / FLOW_H],
          hasCamera,
          dt,
          gain: dynamics.windGain,
        },
        lumaCurr,
        lumaPrev,
        fieldPrev,
        samp: linear,
      });
      frame.pass({ target: fieldNext, clear: [0, 0, 0, 0] }, (pass) =>
        pass.draw(flowEffect)
      );

      // 3b. Cendre mémoire: accumulate the motion energy on a tiny target.
      const memNext = memoryTargets[memoryIndex]!;
      const memPrev = memoryTargets[1 - memoryIndex]!;
      memoryEffect.set({
        params: {
          keep: Math.exp(-adt / Math.max(1, tuning.memorySeconds)),
          clear:
            dynamics.memoryClear > 0.5 || tuning.memoryGain <= 0.001 ? 1 : 0,
        },
        memPrev,
        field: fieldPrev,
        samp: linear,
      });
      frame.pass({ target: memNext, clear: [0, 0, 0, 0] }, (pass) =>
        pass.draw(memoryEffect)
      );
      dynamics.memoryClear = 0;

      // 4. Trails: dim the previous trail, then add this frame's grains.
      // Inside the body's light the trail decays on its own slow clock —
      // the corps layer leaves a 2-3 s wake behind every movement. The slow
      // decay would pile the steady emission up ~15x, so the corps grains
      // are dimmed by the ratio of the two decay rates: the standing body
      // stays readable, only the wake of a movement lingers.
      const keepGlobal = Math.pow(tuning.trailDecay, adt * 60);
      const keepBody = Math.max(
        keepGlobal,
        Math.exp(-adt / Math.max(0.3, tuning.presenceTrail))
      );
      const corpsComp = Math.max(
        0.04,
        (1 - keepBody) / Math.max(1e-4, 1 - keepGlobal)
      );
      fadeEffect.set({
        params: {
          decay: keepGlobal,
          bodyKeep: keepBody,
          presence,
        },
        trail: trailPrev,
        field: fieldPrev,
        samp: linear,
      });
      const stop = (i: number) => {
        const s = look.stops[Math.min(i, look.stops.length - 1)]!;
        return [s[0], s[1], s[2], 1];
      };
      drawable.set({
        params: {
          viewport: [trailNext.size[0], trailNext.size[1]],
          pointSize: tuning.pointSize,
          crystal: dynamics.crystal,
          baseAlpha: tuning.baseAlpha,
          count,
          gridCols,
          gridRows,
          titleMode: dynamics.titleMode,
          ashLevel: Math.min(0.95, Math.max(0.55, 0.97 - tuning.ashShare)),
          imprintShape: imprintMode === "shape" ? 1 : 0,
          // Denser clouds spread the grains thinner: brighten each one so a
          // stroke reads the same whatever the point count.
          imprintGlow:
            0.55 *
            Math.min(1.6, Math.max(1, Math.sqrt(imprintCloud.count / 4096))),
          stop0: stop(0),
          stop1: stop(1),
          stop2: stop(2),
          stop3: stop(3),
          stop4: stop(4),
          stopCount: Math.max(2, Math.min(5, look.stops.length)),
          colorDriver: tuning.colorDriver,
          depthAmount: tuning.depthAmount,
          focusLayer: tuning.focusLayer,
          dofBlur: tuning.dofBlur,
          presence,
          presenceSize: tuning.presenceSize,
          bodyMat,
          bodyMatB,
          matBlend,
          corpsComp,
          fondVisible: tuning.fondVisible,
          corpsLight: [...look.corpsLight, 1],
          corpsShadow: [...look.corpsShadow, 1],
          hand: dynamics.hand,
        },
        particles: buffers.read,
        field: fieldPrev,
        prevTrail: trailPrev,
        fieldSamp: linear,
      });
      frame.pass({ target: trailNext, clear: [0, 0, 0, 1] }, (pass) => {
        pass.draw(fadeEffect);
        pass.draw(drawable, { instances: count });
      });

      // 5. Grade to the canvas.
      setPresent(trailNext, fieldPrev, memNext);
      frame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) =>
        pass.draw(presentEffect)
      );

      if (camera && cameraSeen) lumaIndex = 1 - lumaIndex;
      fieldIndex = 1 - fieldIndex;
      trailIndex = 1 - trailIndex;
      memoryIndex = 1 - memoryIndex;
    } catch (error) {
      renderError = error;
      console.error("[cinerae] render failed:", error);
    }
  });

  return {
    get fps() {
      return fps;
    },
    get failure() {
      return renderError;
    },
    tuning,
    dynamics,
    look,
    get hasCamera() {
      return camera !== undefined;
    },
    attachCamera(input: CameraInput) {
      cameraTexture = gpu.device.createTexture({
        size: [input.width, input.height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "cinerae-camera",
      });
      camera = input;
      cameraSeen = false;
      lumaFrames = 0;
    },
    detachCamera() {
      camera = undefined;
      cameraSeen = false;
      lumaFrames = 0;
      cameraTexture?.destroy();
      cameraTexture = undefined;
    },
    resetMatter() {
      const seed = makeSeed(MAX_PARTICLES);
      buffers.read.write(seed);
      buffers.write.write(seed);
    },
    /** Swap the imprint the matter crystallizes toward. A held population
     * simply glides to the new targets — the morphing costs nothing. */
    setImprint(cloud: ImprintCloud, mode: "shape" | "camera") {
      imprintCloud = cloud;
      imprintMode = mode;
      if (cloud.count > 0)
        titleBuffer.write(cloud.data.subarray(0, cloud.count * 4));
    },
    get imprintCount() {
      return imprintCloud.count;
    },
    /** Read back the smoothed camera luminance (field b channel). */
    async readLuma(): Promise<{ data: Float32Array; width: number; height: number }> {
      const source = fieldTargets[1 - fieldIndex]!;
      const bytes = await source.read();
      const half = new Uint16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2)
      );
      const data = new Float32Array(FLOW_W * FLOW_H);
      for (let i = 0; i < data.length; i++) data[i] = decodeF16(half[i * 4 + 2]!);
      return { data, width: FLOW_W, height: FLOW_H };
    },
    /** Motion statistics from the flow field's energy channel. `avg` is the
     * frame-wide mean (~0 when still); `area` is the fraction of samples
     * that really move — a small figure far from the camera barely dents
     * the mean but still owns a clear moving area. */
    async readMotion(): Promise<{ avg: number; area: number }> {
      const source = fieldTargets[1 - fieldIndex]!;
      const bytes = await source.read();
      const half = new Uint16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2)
      );
      let sum = 0;
      let n = 0;
      let moving = 0;
      // Alpha channel = motion energy; sample sparsely.
      for (let i = 3; i < half.length; i += 4 * 37) {
        const e = decodeF16(half[i]!);
        sum += e;
        if (e > 0.12) moving++;
        n++;
      }
      return n ? { avg: sum / n, area: moving / n } : { avg: 0, area: 0 };
    },
    dispose() {
      disposed = true;
      unsubscribeResize();
      gpu.dispose();
    },
  };
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;

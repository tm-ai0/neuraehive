// The vgpu graph. Per frame: (camera upload) -> luma -> optical flow ->
// particle compute -> trail fade + additive particles -> graded present.
import {
  clock,
  compute,
  draw,
  effect,
  frameLoop,
  init,
  pingPongStorage,
  sampler,
  surface,
  target,
  type Draw,
  type Gpu,
  type PingPongStorage,
  type Target,
  type Texture,
} from "vgpu";

import fadeWgsl from "./shaders/fade.wgsl";
import flowWgsl from "./shaders/flow.wgsl";
import lumaWgsl from "./shaders/luma.wgsl";
import particlesWgsl from "./shaders/particles.wgsl";
import presentWgsl from "./shaders/present.wgsl";
import simulateWgsl from "./shaders/simulate.wgsl";

const FLOW_W = 192;
const FLOW_H = 108;
const FIELD_FORMAT: GPUTextureFormat = "rgba16float";
const WORKGROUP = 256;
const BYTES_PER_PARTICLE = 16;

export interface Tuning {
  force: number;
  viscosity: number;
  turbulence: number;
  pointSize: number;
  baseAlpha: number;
  trailDecay: number;
  exposure: number;
}

export interface Dynamics {
  bass: number;
  treble: number;
  transient: number;
  crystal: number;
}

export const DEFAULT_TUNING: Tuning = {
  force: 1.2,
  viscosity: 2.2,
  turbulence: 0.55,
  pointSize: 1.9,
  baseAlpha: 0.11,
  trailDecay: 0.84,
  exposure: 1.6,
};

interface CameraInput {
  video: HTMLVideoElement;
  width: number;
  height: number;
  consumeDirty(): boolean;
}

interface ParticleSystem {
  count: number;
  gridCols: number;
  gridRows: number;
  buffers: PingPongStorage;
  drawable: Draw;
}

export async function createRenderer(canvas: HTMLCanvasElement) {
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

  const tuning: Tuning = { ...DEFAULT_TUNING };
  const dynamics: Dynamics = { bass: 0, treble: 0, transient: 0, crystal: 0 };

  let camera: CameraInput | undefined;
  let cameraTexture: Texture | undefined;
  let cameraSeen = false; // at least one uploaded frame

  function buildParticles(count: number): ParticleSystem {
    const aspect = output.size[0] / Math.max(1, output.size[1]);
    const gridCols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const gridRows = Math.max(1, Math.ceil(count / gridCols));
    const buffers = pingPongStorage(gpu, count * BYTES_PER_PARTICLE);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = Math.random();
    }
    buffers.read.write(seed);
    buffers.write.write(seed);
    const drawable = draw(gpu, {
      shader: particlesWgsl,
      vertices: 6,
      instances: count,
      blend: { color: { src: "one", dst: "one" }, alpha: { src: "one", dst: "one" } },
      label: "cinerae-particles",
    });
    return { count, gridCols, gridRows, buffers, drawable };
  }

  let particles = buildParticles(200_000);

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

  frameLoop(gpu, (frame) => {
    if (disposed || renderError) return;
    try {
      const dt = Math.min(Math.max(time.deltaTime, 0), 1 / 30);
      if (dt > 0) fps += (1 / dt - fps) * 0.05;

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
          dt,
          time: time.time,
          force: tuning.force,
          viscosity: tuning.viscosity,
          turbulence: tuning.turbulence,
          crystal: dynamics.crystal,
          bass: dynamics.bass,
          treble: dynamics.treble,
          transient: dynamics.transient,
          gridCols: particles.gridCols,
          gridRows: particles.gridRows,
          count: particles.count,
        },
        src: particles.buffers.read,
        dst: particles.buffers.write,
        field: fieldPrev,
        fieldSamp: linear,
      });
      simulate.dispatch(Math.ceil(particles.count / WORKGROUP));
      particles.buffers.swap();

      // 3. Luma + flow field for the next step.
      const hasCamera = cameraSeen ? 1 : 0;
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
          },
          cam: cameraTexture,
          samp: linear,
        });
        frame.pass({ target: lumaCurr, clear: [0, 0, 0, 1] }, (pass) =>
          pass.draw(lumaEffect)
        );
      }
      flowEffect.set({
        params: {
          texel: [1 / FLOW_W, 1 / FLOW_H],
          hasCamera,
          smoothing: 0.22,
        },
        lumaCurr,
        lumaPrev,
        fieldPrev,
        samp: linear,
      });
      frame.pass({ target: fieldNext, clear: [0, 0, 0, 0] }, (pass) =>
        pass.draw(flowEffect)
      );

      // 4. Trails: dim the previous trail, then add this frame's grains.
      fadeEffect.set({
        params: { decay: Math.pow(tuning.trailDecay, dt * 60) },
        trail: trailPrev,
        samp: linear,
      });
      particles.drawable.set({
        params: {
          viewport: [trailNext.size[0], trailNext.size[1]],
          pointSize: tuning.pointSize,
          crystal: dynamics.crystal,
          baseAlpha: tuning.baseAlpha,
          count: particles.count,
          gridCols: particles.gridCols,
          gridRows: particles.gridRows,
        },
        particles: particles.buffers.read,
        field: fieldPrev,
      });
      frame.pass({ target: trailNext, clear: [0, 0, 0, 1] }, (pass) => {
        pass.draw(fadeEffect);
        pass.draw(particles.drawable);
      });

      // 5. Grade to the canvas.
      presentEffect.set({
        params: {
          texel: output.texelSize,
          exposure: tuning.exposure,
          fringe: dynamics.transient,
          time: time.time,
        },
        trail: trailNext,
        samp: linear,
      });
      frame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) =>
        pass.draw(presentEffect)
      );

      if (camera && cameraSeen) lumaIndex = 1 - lumaIndex;
      fieldIndex = 1 - fieldIndex;
      trailIndex = 1 - trailIndex;
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
    get particleCount() {
      return particles.count;
    },
    setParticleCount(count: number) {
      if (count === particles.count) return;
      particles = buildParticles(count);
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
    },
    dispose() {
      disposed = true;
      unsubscribeResize();
      gpu.dispose();
    },
  };
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;

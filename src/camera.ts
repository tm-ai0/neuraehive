// Off-DOM webcam source. Frames stay local, are never displayed, and only
// feed the GPU luminance/flow field. Started exclusively by explicit click.

export interface CameraSource {
  readonly video: HTMLVideoElement;
  readonly width: number;
  readonly height: number;
  /** True when a new decoded frame is waiting to be uploaded. */
  consumeDirty(): boolean;
  dispose(): void;
}

/** v0.7.2 — which camera: "user" (front) or "environment" (rear, the
 * tablet's demo side). Asked as ideal: a machine without that side falls
 * back to whatever camera it has. */
export type CameraFacing = "user" | "environment";

export async function requestCamera(
  facing: CameraFacing = "user"
): Promise<CameraSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia indisponible dans ce navigateur.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;

  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1 && video.videoWidth > 0) return resolve();
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("Le flux caméra n'a pas démarré.")),
        { once: true }
      );
    });
    await video.play().catch(() => undefined);
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    throw error;
  }

  let dirty = false;
  let disposed = false;
  const host = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  const tick = () => {
    if (disposed) return;
    dirty = true;
    if (host.requestVideoFrameCallback) host.requestVideoFrameCallback(tick);
  };
  if (host.requestVideoFrameCallback) host.requestVideoFrameCallback(tick);

  return {
    video,
    width: video.videoWidth || 1280,
    height: video.videoHeight || 720,
    consumeDirty() {
      // Without requestVideoFrameCallback, upload every render frame.
      if (!host.requestVideoFrameCallback) return video.readyState >= 2;
      const was = dirty;
      dirty = false;
      return was && video.readyState >= 2;
    },
    dispose() {
      disposed = true;
      try {
        video.pause();
      } catch {}
      video.srcObject = null;
      for (const track of stream.getTracks()) track.stop();
    },
  };
}

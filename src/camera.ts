// Off-DOM webcam source. Frames stay local, are never displayed, and only
// feed the GPU luminance/flow field. Started exclusively by explicit click.

export interface CameraSource {
  readonly video: HTMLVideoElement;
  readonly width: number;
  readonly height: number;
  /** v0.7.4 — the device really opened (empty when the browser hides it). */
  readonly deviceId: string;
  /** True when a new decoded frame is waiting to be uploaded. */
  consumeDirty(): boolean;
  dispose(): void;
}

/** v0.7.2 — which camera: "user" (front) or "environment" (rear, the
 * tablet's demo side). Asked as ideal: a machine without that side falls
 * back to whatever camera it has. */
export type CameraFacing = "user" | "environment";

/** v0.7.4 — a source the machine offers (camera or microphone). Labels are
 * empty until the browser has granted the matching permission once. */
export interface MediaDevice {
  id: string;
  label: string;
}

/** The devices of one kind, local enumeration only, nothing leaves. */
export async function listDevices(
  kind: "videoinput" | "audioinput"
): Promise<MediaDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === kind && d.deviceId)
      .map((d) => ({ id: d.deviceId, label: d.label }));
  } catch {
    return [];
  }
}

/** v0.7.4 — a chosen device is asked exactly; without one (or when it is
 * gone) the facing side is asked as ideal, so a tablet without that side
 * still falls back to whatever camera it has. */
export async function requestCamera(
  facing: CameraFacing = "user",
  deviceId = ""
): Promise<CameraSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia indisponible dans ce navigateur.");
  }
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const open = (video: MediaTrackConstraints) =>
    navigator.mediaDevices.getUserMedia({ audio: false, video });
  let stream: MediaStream;
  try {
    stream = await open(
      deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: facing }, ...size }
    );
  } catch (error) {
    if (!deviceId) throw error;
    stream = await open({ facingMode: { ideal: facing }, ...size });
  }

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
    deviceId: stream.getVideoTracks()[0]?.getSettings().deviceId ?? "",
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

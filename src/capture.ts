// Capture and stage tools: one-click PNG of the canvas, local video
// recording (MediaRecorder, webm), clean fullscreen with the panel and the
// cursor fading away after a few still seconds. Everything stays local.

const stamp = () =>
  new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // A throttled background tab can stretch the browser's download pipeline:
  // revoking too early leaves an unfinalized .crdownload behind.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export function capturePng(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) download(blob, `cinerae-${stamp()}.png`);
        resolve(Boolean(blob));
      }, "image/png");
    } catch {
      resolve(false);
    }
  });
}

export function createRecorder(canvas: HTMLCanvasElement) {
  let recorder: MediaRecorder | undefined;
  let chunks: Blob[] = [];

  return {
    get recording() {
      return recorder?.state === "recording";
    },
    /** Start or stop. Returns the new recording state. */
    toggle(): boolean {
      if (recorder?.state === "recording") {
        recorder.stop();
        return false;
      }
      try {
        const stream = canvas.captureStream(60);
        const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m)
        );
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 14_000_000,
        });
        chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (chunks.length)
            download(new Blob(chunks, { type: "video/webm" }), `cinerae-${stamp()}.webm`);
          chunks = [];
          recorder = undefined;
        };
        recorder.start(1000);
        return true;
      } catch (error) {
        console.warn("[cinerae] enregistrement impossible:", error);
        recorder = undefined;
        return false;
      }
    },
  };
}

/** Clean fullscreen: the panel and the cursor fade after ~3 s without a
 * gesture, and come back at the first movement. */
export function createStage(onIdleChange?: (idle: boolean) => void) {
  const IDLE_MS = 3200;
  let timer: number | undefined;
  let idle = false;

  const setIdle = (next: boolean) => {
    if (idle === next) return;
    idle = next;
    document.body.classList.toggle("cinerae-idle", next);
    onIdleChange?.(next);
  };

  const bump = () => {
    setIdle(false);
    window.clearTimeout(timer);
    if (document.fullscreenElement) {
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    }
  };

  for (const type of ["pointermove", "pointerdown", "keydown"] as const) {
    window.addEventListener(type, bump, { passive: true });
  }
  document.addEventListener("fullscreenchange", bump);

  return {
    async toggleFullscreen(): Promise<boolean> {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return false;
        }
        await document.documentElement.requestFullscreen();
        return true;
      } catch {
        return Boolean(document.fullscreenElement);
      }
    },
  };
}

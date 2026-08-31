// Microphone analysis. Raw audio never leaves the page: one AnalyserNode
// feeds four scalars per frame — bass, treble, level, transient.

export interface AudioFrame {
  /** Low band energy (~40-250 Hz), 0..1. */
  bass: number;
  /** High band energy (~2-10 kHz), 0..1. */
  treble: number;
  /** Overall loudness (RMS), 0..~1. */
  level: number;
  /** Spectral-flux onset envelope, spikes on attacks then decays, 0..1. */
  transient: number;
}

export interface MicSource {
  update(dt: number): AudioFrame;
  dispose(): void;
}

export async function requestMicrophone(): Promise<MicSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia indisponible dans ce navigateur.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  const bins = analyser.frequencyBinCount;
  const freq = new Uint8Array(bins);
  const prevFreq = new Uint8Array(bins);
  const wave = new Float32Array(analyser.fftSize);
  const binHz = ctx.sampleRate / analyser.fftSize;
  const band = (lo: number, hi: number) => {
    const a = Math.max(1, Math.floor(lo / binHz));
    const b = Math.min(bins - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += freq[i]!;
    return sum / ((b - a + 1) * 255);
  };

  let fluxAvg = 0.02;
  let transient = 0;

  return {
    update(dt: number): AudioFrame {
      analyser.getByteFrequencyData(freq);
      analyser.getFloatTimeDomainData(wave);

      let sq = 0;
      for (let i = 0; i < wave.length; i++) sq += wave[i]! * wave[i]!;
      const level = Math.sqrt(sq / wave.length);

      // Spectral flux: positive per-bin growth marks attacks.
      let flux = 0;
      for (let i = 1; i < bins; i++) {
        const d = freq[i]! - prevFreq[i]!;
        if (d > 0) flux += d;
      }
      flux /= bins * 255;
      prevFreq.set(freq);
      fluxAvg += (flux - fluxAvg) * Math.min(1, dt * 2);
      const onset = Math.max(0, flux - fluxAvg * 1.6 - 0.004);
      transient = Math.max(transient * Math.exp(-dt * 7), Math.min(1, onset * 28));

      return {
        bass: Math.min(1, band(40, 250) * 1.4),
        treble: Math.min(1, band(2000, 10000) * 2.2),
        level,
        transient,
      };
    },
    dispose() {
      try {
        source.disconnect();
      } catch {}
      for (const track of stream.getTracks()) track.stop();
      void ctx.close().catch(() => undefined);
    },
  };
}

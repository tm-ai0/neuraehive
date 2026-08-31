// Microphone analysis. Raw audio never leaves the page: one AnalyserNode
// feeds six scalars per frame — bass, treble, level, transient, pitch,
// tonality. Pitch + tonality drive the cymatic figures on sustained tones.

export interface AudioFrame {
  /** Low band energy (~40-250 Hz), 0..1. */
  bass: number;
  /** High band energy (~2-10 kHz), 0..1. */
  treble: number;
  /** Overall loudness (RMS), 0..~1. */
  level: number;
  /** Spectral-flux onset envelope, spikes on attacks then decays, 0..1. */
  transient: number;
  /** Detected fundamental in Hz, 0 when nothing tonal dominates. */
  pitch: number;
  /** Clarity of the periodicity, 0..1 — high for notes, drones, sung voice. */
  tonality: number;
}

/**
 * YIN-style pitch detection (cumulative mean normalized difference) on a
 * mono window. Pure so it can be tested outside the browser.
 */
export function detectPitch(
  wave: Float32Array,
  sampleRate: number
): { pitch: number; clarity: number } {
  const n = wave.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / 1000)); // <= 1 kHz
  const tauMax = Math.min(n >> 1, Math.ceil(sampleRate / 55)); // >= 55 Hz
  const w = n - tauMax;
  if (w < 64 || tauMax <= tauMin) return { pitch: 0, clarity: 0 };

  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = wave[i]! - wave[i + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative-mean normalization, then take the first dip under threshold
  // (descending to its local minimum), else the global minimum.
  let cum = 0;
  const nd = new Float32Array(tauMax + 1).fill(1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    cum += d[tau]!;
    nd[tau] = cum > 0 ? (d[tau]! * (tau - tauMin + 1)) / cum : 1;
  }
  let best = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (nd[tau]! < 0.18) {
      while (tau + 1 < tauMax && nd[tau + 1]! < nd[tau]!) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let min = 1;
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      if (nd[tau]! < min) {
        min = nd[tau]!;
        best = tau;
      }
    }
    if (best < 0) return { pitch: 0, clarity: 0 };
  }
  // Parabolic refinement around the minimum.
  let tau = best;
  if (best > tauMin && best < tauMax) {
    const a = nd[best - 1]!;
    const b = nd[best]!;
    const c = nd[best + 1]!;
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-9) tau = best + (a - c) / (2 * denom);
  }
  return {
    pitch: sampleRate / tau,
    clarity: Math.max(0, Math.min(1, 1 - nd[best]!)),
  };
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
  // Cut the byte-spectrum noise floor: with the default -100 dB floor, total
  // silence still reads ~0.4 in every band and fake-drives the simulation.
  analyser.minDecibels = -72;
  analyser.maxDecibels = -22;
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
  // Pitch runs on a half-rate copy: plenty for voice and instruments, and
  // it keeps the difference-function loop cheap enough for every frame.
  const half = new Float32Array(analyser.fftSize >> 1);

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

      let pitch = 0;
      let tonality = 0;
      if (level > 0.004) {
        for (let i = 0; i < half.length; i++) {
          half[i] = (wave[i * 2]! + wave[i * 2 + 1]!) * 0.5;
        }
        const found = detectPitch(half, ctx.sampleRate / 2);
        pitch = found.pitch;
        tonality = found.clarity;
      }

      return {
        bass: Math.min(1, band(40, 250) * 1.4),
        treble: Math.min(1, band(2000, 10000) * 2.2),
        level,
        transient,
        pitch,
        tonality,
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

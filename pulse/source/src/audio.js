// Live mic analysis: splits the spectrum into a bass band (drives surface
// fracture) and a treble band (reserved for chromatic aberration later).
// Values are exponentially smoothed with a fast attack / slower release so
// the visuals punch on transients without being jittery frame-to-frame.

const BASS_HZ = [20, 250];
const TREBLE_HZ = [2000, 8000];

const ATTACK = 0.6;
const RELEASE = 0.08;

export class AudioAnalyzer {
  constructor() {
    this.context = null;
    this.analyser = null;
    this.data = null;
    this.bass = 0;
    this.treble = 0;
    this.overall = 0;
    this.ready = false;
  }

  async start() {
    if (this.ready) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.context = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.context.createMediaStreamSource(stream);

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0; // we smooth manually below
    source.connect(this.analyser);

    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.ready = true;
  }

  _bandAverage(loHz, hiHz) {
    const binHz = this.context.sampleRate / this.analyser.fftSize;
    const lo = Math.max(0, Math.floor(loHz / binHz));
    const hi = Math.min(this.data.length - 1, Math.ceil(hiHz / binHz));

    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += this.data[i];
    return sum / (hi - lo + 1) / 255;
  }

  _smooth(previous, target) {
    const rate = target > previous ? ATTACK : RELEASE;
    return previous + (target - previous) * rate;
  }

  update() {
    if (!this.ready) return { bass: 0, treble: 0, overall: 0 };

    this.analyser.getByteFrequencyData(this.data);

    this.bass = this._smooth(this.bass, this._bandAverage(...BASS_HZ));
    this.treble = this._smooth(this.treble, this._bandAverage(...TREBLE_HZ));
    this.overall = this._smooth(this.overall, (this.bass + this.treble) / 2);

    return { bass: this.bass, treble: this.treble, overall: this.overall };
  }
}

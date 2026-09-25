// Caméra + micro synthétiques pour la vérification (jamais commité).
// Commandes : dataset.cam (JSON), dataset.voice ('1'/'0'), dataset.clap ('1').
(() => {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const cx = cv.getContext('2d');
  let state = { mode: 'none', x: 320, y: 200, sway: 1, osc: 0, oscAmp: 0, r: 110, vx: 0, arm: 0, scale: 1 };
  let t = 0;
  function draw() {
    t += 1 / 30;
    cx.fillStyle = '#101010';
    cx.fillRect(0, 0, 640, 360);
    const ds = document.documentElement.dataset;
    if (ds.cam) { try { Object.assign(state, JSON.parse(ds.cam)); ds.cam = ''; } catch (e) {} }
    if (state.mode === 'person') {
      const sx = state.x + Math.sin(t * 0.7) * 4 * state.sway;
      const sy = state.y + Math.sin(t * 1.1) * 2 * state.sway;
      const k = state.scale || 1;
      const g = cx.createRadialGradient(sx, sy, 10 * k, sx, sy, 150 * k);
      g.addColorStop(0, '#e8e2d4'); g.addColorStop(1, '#3a3630');
      cx.fillStyle = g;
      cx.beginPath(); cx.ellipse(sx, sy - 95 * k, 34 * k, 42 * k, 0, 0, 7); cx.fill();
      cx.beginPath(); cx.ellipse(sx, sy + 45 * k, 78 * k, 130 * k, 0, 0, 7); cx.fill();
      if (state.arm) {
        const ax = sx + Math.sin(t * (state.osc || 5)) * (state.oscAmp || 90) * k;
        cx.fillStyle = '#ddd6c6';
        cx.beginPath(); cx.ellipse(ax, sy - 30 * k, 20 * k, 20 * k, 0, 0, 7); cx.fill();
      }
    } else if (state.mode === 'blob') {
      const bx = state.x + Math.sin(t * (state.osc || 0)) * (state.oscAmp || 0) + (state.vx || 0) * t * 60;
      cx.fillStyle = '#d8d2c4';
      cx.beginPath(); cx.arc(((bx % 700) + 700) % 700 - 30, state.y, state.r, 0, 7); cx.fill();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  const vstream = cv.captureStream(30);
  let audioCtx, oscGain, noiseGain, adest;
  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new AudioContext();
    adest = audioCtx.createMediaStreamDestination();
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 220;
    oscGain = audioCtx.createGain(); oscGain.gain.value = 0;
    osc.connect(oscGain); oscGain.connect(adest); osc.start();
    const nbuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = nbuf; noise.loop = true;
    noiseGain = audioCtx.createGain(); noiseGain.gain.value = 0;
    noise.connect(noiseGain); noiseGain.connect(adest); noise.start();
    void audioCtx.resume();
  }
  setInterval(() => {
    const ds = document.documentElement.dataset;
    if (!audioCtx) return;
    oscGain.gain.value = ds.voice === '1' ? 0.25 : 0;
    if (ds.clap === '1') {
      ds.clap = '';
      noiseGain.gain.setValueAtTime(0.9, audioCtx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    }
  }, 80);
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (c && c.video && !c.audio) return vstream;
    if (c && c.audio && !c.video) { ensureAudio(); return adest.stream; }
    if (c && c.audio && c.video) { ensureAudio(); return vstream; }
    return orig(c);
  };
  document.documentElement.dataset.synthReady = '1';
})();

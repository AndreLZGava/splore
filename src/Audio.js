// WebAudio API — procedural sounds and ambient music

export class Audio {
  constructor() {
    this.ctx = null;
    this._ready = false;
    this._masterGain = null;
    this._ambientGain = null;
    this._sfxGain = null;
    this._ambientNodes = [];
    this._depth = 0;

    // Init on first user interaction
    const init = () => {
      if (this._ready) return;
      this._init();
      window.removeEventListener('click', init);
      window.removeEventListener('keydown', init);
    };
    window.addEventListener('click', init);
    window.addEventListener('keydown', init);
  }

  _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = 0.7;
      this._masterGain.connect(this.ctx.destination);

      this._ambientGain = this.ctx.createGain();
      this._ambientGain.gain.value = 0.4;
      this._ambientGain.connect(this._masterGain);

      this._sfxGain = this.ctx.createGain();
      this._sfxGain.gain.value = 0.6;
      this._sfxGain.connect(this._masterGain);

      this._startAmbient();
      this._ready = true;
    } catch(e) {
      console.warn('Audio not available:', e);
    }
  }

  _startAmbient() {
    // Deep ocean ambient: layered noise
    this._createDroneLayer(60, 0.08);    // sub bass
    this._createDroneLayer(120, 0.05);   // low hum
    this._createDroneLayer(240, 0.03);   // mids
    this._createWaterFlow();
  }

  _createDroneLayer(freq, gain) {
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    const flt = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.value = gain;
    flt.type = 'lowpass';
    flt.frequency.value = freq * 3;

    osc.connect(flt);
    flt.connect(g);
    g.connect(this._ambientGain);
    osc.start();

    // Slow LFO for variation
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.05;
    lfoGain.gain.value = freq * 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    this._ambientNodes.push({ osc, g, lfo });
    return { osc, g };
  }

  _createWaterFlow() {
    // Brown noise approximation via filtered white noise
    const bufSize = this.ctx.sampleRate * 2;
    const buf     = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data    = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      b = (b + (0.02 * white)) / 1.02;
      data[i] = b * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 300;
    flt.Q.value = 0.5;

    const g = this.ctx.createGain();
    g.gain.value = 0.06;

    src.connect(flt);
    flt.connect(g);
    g.connect(this._ambientGain);
    src.start();
    this._ambientNodes.push({ src, g });
  }

  // Update ambient based on depth (negative Z = deeper)
  updateDepth(depth) {
    if (!this._ready) return;
    this._depth = depth;
    const d = Math.max(0, Math.min(1, (-depth + 1500) / 3000));
    // Deep = darker, more bass, less treble
    this._ambientGain.gain.setTargetAtTime(0.25 + d * 0.25, this.ctx.currentTime, 1.0);
    this._ambientNodes.forEach(n => {
      if (n.osc && n.osc.frequency.value < 100) {
        // Boost bass in deep
        n.g.gain.setTargetAtTime(0.08 + (1-d) * 0.08, this.ctx.currentTime, 0.5);
      }
    });
  }

  _playTone(freq, type, duration, gain, decay = 0.8) {
    if (!this._ready) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration * decay);
    osc.connect(g);
    g.connect(this._sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  _playNoise(freq, duration, gainVal, filterType = 'lowpass') {
    if (!this._ready) return;
    const bufSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = freq;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    src.connect(flt);
    flt.connect(g);
    g.connect(this._sfxGain);
    src.start();
  }

  playEat() {
    this._playNoise(800, 0.12, 0.3, 'bandpass');
    this._playTone(440, 'sine', 0.15, 0.15);
  }

  playAttack() {
    this._playNoise(200, 0.2, 0.4, 'lowpass');
    this._playTone(180, 'sawtooth', 0.1, 0.2);
  }

  playHit() {
    this._playNoise(400, 0.18, 0.35, 'highpass');
    this._playTone(220, 'square', 0.12, 0.15);
  }

  playEvolution() {
    if (!this._ready) return;
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 'sine', 0.4, 0.2), i * 100);
    });
  }

  playMating() {
    if (!this._ready) return;
    [330, 440, 330, 440, 554].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 'sine', 0.3, 0.12), i * 150);
    });
  }

  playDeath() {
    if (!this._ready) return;
    this._playTone(220, 'sawtooth', 1.5, 0.3, 1.0);
    this._playNoise(100, 1.5, 0.2);
  }

  playDanger() {
    if (!this._ready) return;
    this._playTone(80, 'sine', 0.8, 0.15);
  }
}

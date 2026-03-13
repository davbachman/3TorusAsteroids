export function createNoiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function scheduleOscTone(params: {
  ctx: AudioContext;
  destination: AudioNode;
  type?: OscillatorType;
  frequency: number;
  gain: number;
  attack?: number;
  decay: number;
  startTime?: number;
  endFrequency?: number;
}): void {
  const {
    ctx,
    destination,
    type = 'square',
    frequency,
    gain,
    attack = 0.002,
    decay,
    startTime = ctx.currentTime,
    endFrequency,
  } = params;

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  if (typeof endFrequency === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startTime + decay);
  }

  amp.gain.setValueAtTime(0.0001, startTime);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), startTime + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

  osc.connect(amp).connect(destination);
  osc.start(startTime);
  osc.stop(startTime + decay + 0.02);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

export function scheduleNoiseBurst(params: {
  ctx: AudioContext;
  destination: AudioNode;
  noiseBuffer: AudioBuffer;
  gain: number;
  decay: number;
  startTime?: number;
  highpassHz?: number;
  lowpassHz?: number;
}): void {
  const {
    ctx,
    destination,
    noiseBuffer,
    gain,
    decay,
    startTime = ctx.currentTime,
    highpassHz,
    lowpassHz,
  } = params;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;

  let node: AudioNode = source;
  let hp: BiquadFilterNode | undefined;
  let lp: BiquadFilterNode | undefined;
  if (highpassHz) {
    hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(highpassHz, startTime);
    node.connect(hp);
    node = hp;
  }
  if (lowpassHz) {
    lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lowpassHz, startTime);
    node.connect(lp);
    node = lp;
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(Math.max(0.0001, gain), startTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);
  node.connect(amp).connect(destination);

  source.start(startTime);
  source.stop(startTime + decay + 0.03);
  source.onended = () => {
    source.disconnect();
    hp?.disconnect();
    lp?.disconnect();
    amp.disconnect();
  };
}

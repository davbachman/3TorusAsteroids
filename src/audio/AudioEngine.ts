import { AsteroidSize } from '../game/state';
import { createNoiseBuffer, scheduleNoiseBurst, scheduleOscTone } from './patches';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private thrustGain: GainNode | null = null;
  private thrustOsc: OscillatorNode | null = null;
  private thrustNoiseSource: AudioBufferSourceNode | null = null;
  private thrustEnabled = false;
  private nextBeatAt = 0;
  private beatHigh = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.2;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = createNoiseBuffer(this.ctx, 1.2);
      this.initThrustLoop();
    }
    void this.ctx.resume();
  }

  private initThrustLoop(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.thrustGain) return;

    const mix = this.ctx.createGain();
    mix.gain.value = 0.0001;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 140;
    filter.Q.value = 0.9;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 85;
    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.5;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.35;

    osc.connect(oscGain).connect(filter);
    noiseSource.connect(noiseGain).connect(filter);
    filter.connect(mix).connect(this.master);

    osc.start();
    noiseSource.start();

    this.thrustGain = mix;
    this.thrustOsc = osc;
    this.thrustNoiseSource = noiseSource;
  }

  setThrust(active: boolean): void {
    this.thrustEnabled = active;
    if (!this.ctx || !this.thrustGain) return;
    const t = this.ctx.currentTime;
    const target = active ? 0.09 : 0.0001;
    this.thrustGain.gain.cancelScheduledValues(t);
    this.thrustGain.gain.setTargetAtTime(target, t, active ? 0.02 : 0.01);
  }

  playFire(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    scheduleOscTone({
      ctx: this.ctx,
      destination: this.master,
      type: 'square',
      frequency: 900,
      endFrequency: 480,
      gain: 0.07,
      decay: 0.07,
      startTime: t,
    });
  }

  playAsteroidExplosion(size: AsteroidSize): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const map = {
      large: { gain: 0.09, decay: 0.28, lowpass: 900, tone: 140 },
      medium: { gain: 0.07, decay: 0.20, lowpass: 1300, tone: 200 },
      small: { gain: 0.05, decay: 0.14, lowpass: 1800, tone: 280 },
    }[size];
    scheduleNoiseBurst({
      ctx: this.ctx,
      destination: this.master,
      noiseBuffer: this.noiseBuffer,
      gain: map.gain,
      decay: map.decay,
      lowpassHz: map.lowpass,
      highpassHz: 80,
      startTime: t,
    });
    scheduleOscTone({
      ctx: this.ctx,
      destination: this.master,
      type: 'triangle',
      frequency: map.tone * 1.4,
      endFrequency: map.tone,
      gain: 0.03,
      decay: Math.max(0.08, map.decay * 0.7),
      startTime: t,
    });
  }

  playShipExplosion(): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    scheduleNoiseBurst({
      ctx: this.ctx,
      destination: this.master,
      noiseBuffer: this.noiseBuffer,
      gain: 0.12,
      decay: 0.45,
      lowpassHz: 1200,
      highpassHz: 60,
      startTime: t,
    });
    scheduleOscTone({
      ctx: this.ctx,
      destination: this.master,
      type: 'sawtooth',
      frequency: 260,
      endFrequency: 55,
      gain: 0.05,
      decay: 0.42,
      startTime: t,
    });
  }

  playUiChirp(): void {
    if (!this.ctx || !this.master) return;
    scheduleOscTone({
      ctx: this.ctx,
      destination: this.master,
      type: 'square',
      frequency: 520,
      endFrequency: 700,
      gain: 0.03,
      decay: 0.06,
    });
  }

  updateHeartbeat(active: boolean, asteroidCount: number): void {
    if (!this.ctx || !this.master) return;
    if (!active || asteroidCount <= 0) {
      this.nextBeatAt = 0;
      return;
    }

    const count = Math.max(1, asteroidCount);
    const interval = Math.max(0.18, 0.9 - Math.min(0.72, (12 - Math.min(12, count)) * 0.06));
    const now = this.ctx.currentTime;

    if (this.nextBeatAt === 0) {
      this.nextBeatAt = now + 0.05;
    }

    if (now >= this.nextBeatAt) {
      const freq = this.beatHigh ? 620 : 430;
      this.beatHigh = !this.beatHigh;
      scheduleOscTone({
        ctx: this.ctx,
        destination: this.master,
        type: 'square',
        frequency: freq,
        endFrequency: freq * 0.98,
        gain: 0.035,
        decay: 0.05,
        startTime: now,
      });
      this.nextBeatAt = now + interval;
    }
  }

  stopGameplayLoops(): void {
    this.setThrust(false);
    this.nextBeatAt = 0;
  }
}

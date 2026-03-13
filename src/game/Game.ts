import { AudioEngine } from '../audio/AudioEngine';
import { KeyboardInput } from '../input/keyboard';
import { SceneRenderer } from '../render/scene';
import { forwardFromQuat } from '../utils/math';
import { createInitialGameState, GameState, InputState, WORLD_SIZE } from './state';
import { forceAsteroidForTesting, seedTitleScene, startNewGame, stepGame } from './update';

const FIXED_DT = 1 / 60;

type DebugApi = {
  getState: () => GameState;
  forceStart: () => void;
  forceAsteroid: () => void;
};

export class Game {
  private state: GameState;
  private readonly scene: SceneRenderer;
  private readonly audio = new AudioEngine();
  private readonly input: KeyboardInput;
  private rafId = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private manualAdvanceMode = false;
  private destroyed = false;

  constructor(private readonly root: HTMLElement) {
    this.scene = new SceneRenderer(root);
    this.state = seedTitleScene(createInitialGameState());
    this.input = new KeyboardInput(window, () => this.audio.unlock());

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('fullscreenchange', this.handleResize);

    this.installHooks();
    this.input.attach();
    this.render();
    this.rafId = window.requestAnimationFrame(this.frame);
  }

  private readonly handleResize = () => {
    this.scene.resize();
    this.render();
  };

  private readonly frame = (timestamp: number) => {
    if (this.destroyed) return;

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
    }
    const deltaSec = Math.min(0.1, Math.max(0, (timestamp - this.lastFrameTime) / 1000));
    this.lastFrameTime = timestamp;

    if (!this.manualAdvanceMode) {
      this.accumulator += deltaSec;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 8) {
        this.accumulator -= FIXED_DT;
        this.stepFixed(FIXED_DT);
        steps += 1;
      }
    }

    this.audio.updateHeartbeat(this.state.mode === 'playing' || this.state.mode === 'respawning', this.state.asteroids.length);
    this.render();
    this.rafId = window.requestAnimationFrame(this.frame);
  };

  private stepFixed(dt: number): void {
    const input = this.input.consumeStepInput();
    const result = stepGame(this.state, input, dt);
    this.state = result.state;
    this.applyEvents(result.events, input);
  }

  private applyEvents(events: ReturnType<typeof stepGame>['events'], input: InputState): void {
    if (events.toggledFullscreen) {
      void this.scene.toggleFullscreen();
    }

    if (events.uiChirp) {
      this.audio.playUiChirp();
    }

    for (let i = 0; i < events.fireCount; i += 1) {
      this.audio.playFire();
    }
    for (const size of events.asteroidExplosions) {
      this.audio.playAsteroidExplosion(size);
    }
    if (events.shipExploded) {
      this.audio.playShipExplosion();
    }

    const thrustShouldPlay =
      events.thrustActive &&
      input.thrust &&
      this.state.mode === 'playing' &&
      this.state.ship.alive;

    if (this.state.mode === 'paused' || this.state.mode === 'title' || this.state.mode === 'gameOver') {
      this.audio.stopGameplayLoops();
    } else {
      this.audio.setThrust(thrustShouldPlay);
    }
  }

  private render(): void {
    this.scene.render(this.state);
  }

  private installHooks(): void {
    const game = this;
    (window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
      __gameDebug?: DebugApi;
    }).render_game_to_text = () => game.renderGameToText();

    (window as Window & {
      advanceTime?: (ms: number) => void;
    }).advanceTime = (ms: number) => {
      game.manualAdvanceMode = true;
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < steps; i += 1) {
        game.stepFixed(FIXED_DT);
      }
      game.audio.updateHeartbeat(
        game.state.mode === 'playing' || game.state.mode === 'respawning',
        game.state.asteroids.length,
      );
      game.render();
    };

    (window as Window & { __gameDebug?: DebugApi }).__gameDebug = {
      getState: () => this.state,
      forceStart: () => {
        this.audio.unlock();
        this.state = startNewGame(this.state);
        this.render();
      },
      forceAsteroid: () => {
        if (this.state.mode === 'title' || this.state.mode === 'gameOver') {
          this.state = startNewGame(this.state);
        }
        forceAsteroidForTesting(this.state, 'large');
        this.render();
      },
    };
  }

  private renderGameToText(): string {
    const shipForward = forwardFromQuat(this.state.ship.orientation);
    const payload = {
      mode: this.state.mode,
      score: this.state.score,
      lives: this.state.lives,
      level: this.state.level,
      world: {
        cubeSize: WORLD_SIZE,
        origin: 'center',
        axes: '+X right, +Y up, +Z depth (far side)',
      },
      ship: {
        alive: this.state.ship.alive,
        invulnerable: this.state.time < this.state.ship.invulnerableUntil,
        position: roundVec(this.state.ship.position),
        velocity: roundVec(this.state.ship.velocity),
        forward: roundVec(shipForward),
      },
      asteroids: this.state.asteroids.map((a) => ({
        id: a.id,
        size: a.size,
        radius: a.radius,
        position: roundVec(a.position),
        velocity: roundVec(a.velocity),
      })),
      bullets: this.state.bullets.map((b) => ({
        id: b.id,
        ttl: +b.ttl.toFixed(3),
        position: roundVec(b.position),
        velocity: roundVec(b.velocity),
      })),
      counts: {
        asteroids: this.state.asteroids.length,
        bullets: this.state.bullets.length,
        fragments: this.state.fragments.length,
      },
    };
    return JSON.stringify(payload);
  }

  destroy(): void {
    this.destroyed = true;
    window.cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('fullscreenchange', this.handleResize);
    this.input.destroy();
    this.scene.destroy();
    this.audio.stopGameplayLoops();
  }
}

function roundVec(v: { x: number; y: number; z: number }) {
  return {
    x: +v.x.toFixed(2),
    y: +v.y.toFixed(2),
    z: +v.z.toFixed(2),
  };
}

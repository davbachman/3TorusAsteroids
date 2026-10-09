import { GeometryId } from '../geometry/types';
import { CURVATURE_RADIUS } from '../geometry/hyperbolic';
import { CURVATURE_RADIUS as SPHERICAL_RADIUS } from '../geometry/spherical';
import { AudioEngine } from '../audio/AudioEngine';
import { PointerSteering } from '../input/pointer';
import { KeyboardInput } from '../input/keyboard';
import { SceneRenderer } from '../render/scene';
import { forwardFromQuat } from '../utils/math';
import { createInitialGameState, getAsteroidSolid, GameState, InputState, WORLD_SIZE } from './state';
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
  private readonly pointer: PointerSteering;
  private rafId = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private manualAdvanceMode = false;
  private destroyed = false;

  constructor(private readonly root: HTMLElement) {
    this.scene = new SceneRenderer(root);
    this.state = seedTitleScene(createInitialGameState());
    this.input = new KeyboardInput(window, () => this.audio.unlock(), () => { void this.scene.toggleFullscreen(); });
    this.pointer = new PointerSteering(this.scene.viewport, () => this.state.mode === 'playing' && this.state.ship.alive);
    this.scene.bindControls({
      press: code => this.input.press(code), hold: (code, id) => this.input.hold(code, id),
      release: id => this.input.release(id), fullscreen: () => { void this.scene.toggleFullscreen(); },
      mute: () => this.audio.toggleMute(),
      externalModel: model => { this.scene.setExternalModel(model); this.render(); },
      povEdges: visible => { this.scene.setPovDomainEdges(visible); this.render(); },
      geometry: geometry=>this.selectGeometry(geometry),
      menu: ()=>this.selectGeometry(this.state.geometry,true),
    });
    window.addEventListener('blur', this.pauseForFocusLoss);
    document.addEventListener('visibilitychange', this.handleVisibility);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('fullscreenchange', this.handleResize);

    this.installHooks();
    this.input.attach();
    this.render();
    this.rafId = window.requestAnimationFrame(this.frame);
  }

  private selectGeometry(geometry:GeometryId,returnToMenu=false):void {
    if(!returnToMenu&&this.state.mode!=='title'&&this.state.mode!=='gameOver')return;
    this.input.clear();this.pointer.reset();this.audio.stopGameplayLoops();
    this.accumulator=0;this.lastFrameTime=0;
    this.state=seedTitleScene(createInitialGameState(geometry));
    this.render();
  }

  private readonly pauseForFocusLoss = () => {
    if (this.state.mode === 'playing' || this.state.mode === 'respawning') this.state.mode = 'paused';
    this.input.clear(); this.pointer.reset();
    this.accumulator = 0; this.lastFrameTime = 0;
    this.audio.suspend();
    this.render();
  };

  private readonly handleVisibility = () => {
    if (document.hidden) this.pauseForFocusLoss();
    this.accumulator = 0; this.lastFrameTime = 0;
  };

  private readonly handleResize = () => {
    this.pointer.reset();
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
    const input = { ...this.input.consumeStepInput(), ...this.pointer.consume() };
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

    if (events.toggledPause) this.pointer.reset();
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
      geometry:this.state.geometry,
      mode: this.state.mode,
      score: this.state.score,
      lives: this.state.lives,
      level: this.state.level,
      world: {
        cubeSize: this.state.geometry==='euclidean'?WORLD_SIZE:undefined,
        domain: this.state.geometry==='spherical'?'Poincaré dodecahedron':this.state.geometry==='hyperbolic'?'Seifert–Weber dodecahedron':'cube',
        coordinates: this.state.geometry==='spherical'?'Spherical gnomonic chart':this.state.geometry==='hyperbolic'?'Klein ball':'Euclidean',
        curvatureRadius:this.state.geometry==='spherical'?SPHERICAL_RADIUS:this.state.geometry==='hyperbolic'?CURVATURE_RADIUS:undefined,
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
        shape: getAsteroidSolid(a.size),
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
    window.removeEventListener('blur', this.pauseForFocusLoss);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.input.destroy(); this.pointer.destroy();
    this.scene.destroy(); this.audio.destroy();
    Reflect.deleteProperty(window, 'render_game_to_text');
    Reflect.deleteProperty(window, 'advanceTime');
    Reflect.deleteProperty(window, '__gameDebug');
  }
}

function roundVec(v: { x: number; y: number; z: number }) {
  return {
    x: +v.x.toFixed(2),
    y: +v.y.toFixed(2),
    z: +v.z.toFixed(2),
  };
}

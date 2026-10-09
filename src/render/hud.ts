import { GeometryId, GEOMETRY_LABELS } from '../geometry/types';
import { GameState } from '../game/state';
import { Viewport } from './layout';

export interface HudActions {
  press: (code: string) => void;
  hold: (code: string, pointerId: number) => void;
  release: (pointerId: number) => void;
  fullscreen: () => void;
  mute: () => boolean;
  povEdges: (visible: boolean) => void;
  geometry: (geometry:GeometryId) => void;
  menu: () => void;
}

export class HudRenderer {
  private readonly toolbar = document.createElement('div');
  private readonly panel = document.createElement('section');
  private readonly touch = document.createElement('div');
  private readonly announcement = document.createElement('p');
  private readonly externalLabel = document.createElement('div');
  private readonly povLabel = document.createElement('div');
  private readonly reticle = document.createElement('div');
  private readonly divider = document.createElement('div');
  private readonly stats: HTMLElement;
  private readonly pause: HTMLButtonElement;
  private readonly message: HTMLElement;
  private readonly start: HTMLButtonElement;
  private readonly choices:HTMLElement;
  private readonly description:HTMLElement;
  private actions?: HudActions;
  private mode?: GameState['mode'];
  private geometry?: GeometryId;
  private lastAnnouncement = '';
  private readonly abort = new AbortController();

  constructor(wrapper: HTMLElement, viewport: HTMLElement) {
    this.toolbar.className = 'toolbar';
    this.toolbar.innerHTML = `<div class="stats" aria-label="Game statistics"></div><nav aria-label="Game controls">
      <button type="button" data-pause>Pause</button><button type="button" data-mute aria-pressed="false">Mute</button>
      <button type="button" data-fullscreen>Fullscreen</button><details class="help"><summary>Controls</summary><div>
      <label class="view-option"><input type="checkbox" data-pov-edges checked> Show POV domain edges</label>
      <p>Move the pointer over the POV view to steer with a trackpad or mouse. No click needed.</p><p>Arrow keys: turn and look. Z: thrust. Space: fire. P: pause or resume. F: fullscreen.</p>
      <p>On touch screens, hold the arrows and thrust; tap Fire.</p>
      <p data-geometry-help></p>
      </div></details></nav>`;
    this.stats = this.toolbar.querySelector('.stats')!;
    this.pause = this.toolbar.querySelector('[data-pause]')!;
    this.panel.className = 'game-panel';
    this.panel.setAttribute('aria-label', 'Game menu');
    this.panel.innerHTML = `<h1>3Torus Asteroids</h1><p data-message></p>
      <fieldset class="geometry-choices"><legend>Choose your geometry</legend>
      <label><input type="radio" name="geometry" value="euclidean" checked> <span>Euclidean (3-Torus)</span></label>
      <label><input type="radio" name="geometry" value="hyperbolic"> <span>Hyperbolic (Seifert–Weber Dodecahedral)</span></label>
      <label><input type="radio" name="geometry" value="spherical"> <span>Spherical (Poincaré Dodecahedral)</span></label>
      </fieldset><p class="geometry-description"></p><p class="instructions">Pointer over POV or arrows to turn<br>Z to thrust · Space to fire<br>Cross a wall to emerge on the opposite side.</p><button type="button" data-start>Start game</button><button type="button" data-menu hidden>Change geometry / new game</button>`;
    this.choices=this.panel.querySelector('.geometry-choices')!;
    this.description=this.panel.querySelector('.geometry-description')!;
    this.message = this.panel.querySelector('[data-message]')!;
    this.start = this.panel.querySelector('[data-start]')!;
    this.announcement.className = 'sr-only';
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.announcement.setAttribute('aria-atomic', 'true');
    this.externalLabel.className = this.povLabel.className = 'pane-label';
    this.externalLabel.textContent = 'EXTERNAL VIEW'; this.povLabel.textContent = 'TORUS POV';
    this.reticle.className = 'reticle'; this.reticle.setAttribute('aria-hidden', 'true');
    this.divider.className = 'pane-divider';
    this.touch.className = 'touch-controls'; this.touch.setAttribute('aria-label', 'Touch flight controls');
    this.touch.innerHTML = `<div class="direction-pad"><button type="button" data-hold="ArrowUp" aria-label="Look up">↑</button>
      <button type="button" data-hold="ArrowLeft" aria-label="Turn left">←</button>
      <button type="button" data-hold="ArrowDown" aria-label="Look down">↓</button>
      <button type="button" data-hold="ArrowRight" aria-label="Turn right">→</button></div>
      <button type="button" data-hold="KeyZ">Thrust</button><button type="button" data-fire>Fire</button>`;
    wrapper.append(this.toolbar, this.touch, this.announcement);
    viewport.append(this.externalLabel, this.povLabel, this.divider, this.reticle, this.panel);
    const options = { signal: this.abort.signal };
    // Pointer activation must not leave toolbar controls consuming flight keys.
    // Keyboard activation (detail === 0) keeps focus for native accessibility.
    this.toolbar.addEventListener('click', event => {
      if (event.detail === 0 || !(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>('button,summary,input');
      if (control === document.activeElement) control?.blur();
    }, options);
    this.panel.querySelector('[data-menu]')!.addEventListener('click',()=>this.actions?.menu(),options);
    this.choices.addEventListener('change',event=>{const target=event.target as HTMLInputElement;if(target.value==='euclidean'||target.value==='hyperbolic'||target.value==='spherical')this.actions?.geometry(target.value);},options);
    this.pause.addEventListener('click', () => this.actions?.press('KeyP'), options);
    this.start.addEventListener('click', () => this.actions?.press(this.mode === 'paused' ? 'KeyP' : 'Enter'), options);
    this.toolbar.querySelector('[data-fullscreen]')!.addEventListener('click', () => this.actions?.fullscreen(), options);
    const mute = this.toolbar.querySelector<HTMLButtonElement>('[data-mute]')!;
    const povEdges = this.toolbar.querySelector<HTMLInputElement>('[data-pov-edges]')!;
    povEdges.addEventListener('change', () => this.actions?.povEdges(povEdges.checked), options);
    mute.addEventListener('click', () => { const muted = this.actions?.mute() ?? false; mute.textContent = muted ? 'Unmute' : 'Mute'; mute.setAttribute('aria-pressed', String(muted)); }, options);
    for (const button of this.touch.querySelectorAll<HTMLButtonElement>('[data-hold]')) {
      button.addEventListener('pointerdown', e => {
        e.preventDefault(); button.setPointerCapture(e.pointerId);
        this.actions?.hold(button.dataset.hold!, e.pointerId);
      }, options);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(event, e => this.actions?.release(e.pointerId), options);
      }
      button.addEventListener('keydown', e => {
        if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); this.actions?.hold(button.dataset.hold!, -1); }
      }, options);
      button.addEventListener('keyup', () => this.actions?.release(-1), options);
      button.addEventListener('blur', () => this.actions?.release(-1), options);
    }
    this.touch.querySelector('[data-fire]')!.addEventListener('click', () => this.actions?.press('Space'), options);
  }

  bind(actions: HudActions): void { this.actions = actions; }

  resize(external: Viewport, pov: Viewport): void {
    for (const [label, rect] of [[this.externalLabel, external], [this.povLabel, pov]] as const) {
      label.style.left = `${rect.x + rect.width / 2}px`; label.style.top = `${rect.y + 10}px`;
    }
    this.reticle.style.left = `${pov.x + pov.width / 2}px`; this.reticle.style.top = `${pov.y + pov.height / 2}px`;
    const stacked = pov.y > 0;
    this.divider.style.cssText = stacked
      ? `top:${pov.y}px;left:0;width:100%;height:1px`
      : `left:${pov.x}px;top:0;height:100%;width:1px`;
  }

  render(state: GameState): void {
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      this.choices.hidden = state.mode !== 'title' && state.mode !== 'gameOver';
      this.panel.querySelector<HTMLButtonElement>('[data-menu]')!.hidden = state.mode !== 'paused';
      this.panel.hidden = !['title', 'paused', 'gameOver'].includes(state.mode);
      this.pause.disabled = state.mode === 'title' || state.mode === 'gameOver';
    }
    // Keep native controls stable between pointer-down and activation (including
    // touch and keyboard activation). Geometry only changes from the menu.
    if (this.geometry !== state.geometry) {
      this.geometry = state.geometry;
      this.panel.querySelector<HTMLInputElement>(`[value="${state.geometry}"]`)!.checked = true;
      this.povLabel.textContent = state.geometry === 'spherical' ? 'SPHERICAL POV' : state.geometry === 'hyperbolic' ? 'HYPERBOLIC POV' : 'TORUS POV';
      const description = state.geometry === 'spherical'
        ? 'A dodecahedral universe with positive curvature. Opposite faces join with a 36° twist.'
        : state.geometry === 'hyperbolic'
        ? 'A dodecahedral universe with negative curvature. Opposite faces join with a 108° twist.'
        : 'A flat universe inside a cube. Opposite faces join without a twist.';
      this.description.textContent = description;
      this.toolbar.querySelector('[data-geometry-help]')!.textContent = description + ' The external view shows one fundamental domain. The POV view looks forward from your ship.';
    }
    const stats = `Score ${state.score} · Lives ${state.lives} · Level ${state.level}`;
    if (this.stats.textContent !== stats) this.stats.textContent = stats;
    setText(this.pause, state.mode === 'paused' ? 'Resume' : 'Pause');
    setText(this.message, state.mode === 'paused' ? 'Paused — resume when you’re ready.' : state.mode === 'gameOver' ? `Game over · Score ${state.score}` : 'Same game. A different kind of space.');
    setText(this.start, state.mode === 'paused' ? 'Resume game' : state.mode === 'gameOver' ? 'Play again' : 'Start game');
    setText(this.externalLabel, state.mode === 'respawning'
      ? (state.respawnAt !== null && state.time < state.respawnAt ? 'SHIP LOST · RESPAWNING' : 'WAITING FOR A SAFE SPAWN')
      : state.levelClearAt !== null && state.asteroids.length === 0 ? 'SECTOR CLEAR' : 'EXTERNAL VIEW');
    const announcement = `${state.mode === 'respawning' ? 'Ship lost. Waiting to respawn.' : state.mode === 'gameOver' ? 'Game over.' : state.mode === 'paused' ? 'Paused.' : state.mode === 'title' ? 'Ready to start.' : 'Playing.'} ${stats} ${GEOMETRY_LABELS[state.geometry]}`;
    if (announcement !== this.lastAnnouncement) { this.announcement.textContent = announcement; this.lastAnnouncement = announcement; }
  }

  notify(message: string): void { this.announcement.textContent = message; }
  destroy(): void { this.abort.abort(); }
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

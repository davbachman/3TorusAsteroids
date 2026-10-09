import { InputState } from '../game/state';

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyP', 'KeyF', 'KeyE', 'Enter']);

export class KeyboardInput {
  private readonly held = new Set<string>();
  private readonly pointers = new Map<number, string>();
  private readonly pressed = new Set<string>();

  constructor(private readonly target: Window, private readonly onInteraction?: () => void,
    private readonly onFullscreen?: () => void, private readonly onTogglePovEdges?: () => void) {}

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (!GAME_KEYS.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element) {
      if (event.target.closest('input,textarea,select,[contenteditable]')) return;
      if (event.target.closest('button,summary') && (event.code === 'Space' || event.code === 'Enter')) return;
    }
    event.preventDefault();
    this.held.add(event.code);
    if (event.code === 'Space' || !event.repeat) this.press(event.code, !event.repeat);
  };

  private readonly keyupHandler = (event: KeyboardEvent) => { this.held.delete(event.code); };
  private readonly blurHandler = () => this.clear();

  press(code: string, allowStart = true): void {
    this.onInteraction?.();
    if (code === 'KeyF' && this.onFullscreen) this.onFullscreen();
    else if (code === 'KeyE') this.onTogglePovEdges?.();
    else this.pressed.add(code);
    if (allowStart && (code === 'Space' || code === 'Enter')) this.pressed.add('Start');
  }
  hold(code: string, pointerId: number): void { this.onInteraction?.(); this.pointers.set(pointerId, code); }
  release(pointerId: number): void { this.pointers.delete(pointerId); }
  clear(): void { this.held.clear(); this.pointers.clear(); this.pressed.clear(); }

  attach(): void {
    this.target.addEventListener('keydown', this.keydownHandler, { passive: false });
    this.target.addEventListener('keyup', this.keyupHandler);
    this.target.addEventListener('blur', this.blurHandler);
  }
  destroy(): void {
    this.target.removeEventListener('keydown', this.keydownHandler);
    this.target.removeEventListener('keyup', this.keyupHandler);
    this.target.removeEventListener('blur', this.blurHandler);
    this.clear();
  }

  isDown(code: string): boolean { return this.held.has(code) || [...this.pointers.values()].includes(code); }

  consumeStepInput(): InputState {
    const input: InputState = {
      left: this.isDown('ArrowLeft'), right: this.isDown('ArrowRight'), up: this.isDown('ArrowUp'), down: this.isDown('ArrowDown'),
      thrust: this.isDown('KeyZ'), firePressed: this.pressed.has('Space'),
      startPressed: this.pressed.has('Start'),
      pausePressed: this.pressed.has('KeyP'), fullscreenPressed: this.pressed.has('KeyF'),
    };
    this.pressed.clear();
    return input;
  }
}

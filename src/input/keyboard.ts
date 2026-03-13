import { InputState } from '../game/state';

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  ' ',
  'Space',
  'Spacebar',
  'KeyZ',
  'KeyP',
  'KeyF',
  'Enter',
]);

export class KeyboardInput {
  private held = new Set<string>();
  private fireCount = 0;
  private startCount = 0;
  private pauseCount = 0;
  private fullscreenCount = 0;
  private readonly target: Window;
  private readonly onFirstInteraction?: () => void;
  private unlocked = false;

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (PREVENT_DEFAULT_KEYS.has(event.code) || PREVENT_DEFAULT_KEYS.has(event.key)) {
      event.preventDefault();
    }

    if (!this.unlocked) {
      this.unlocked = true;
      this.onFirstInteraction?.();
    }

    this.held.add(event.code);

    if (event.code === 'Space') {
      this.fireCount += 1;
      if (!event.repeat) this.startCount += 1;
      return;
    }
    if (event.code === 'Enter' && !event.repeat) {
      this.startCount += 1;
      return;
    }
    if (event.code === 'KeyP' && !event.repeat) {
      this.pauseCount += 1;
      return;
    }
    if (event.code === 'KeyF' && !event.repeat) {
      this.fullscreenCount += 1;
    }
  };

  private readonly keyupHandler = (event: KeyboardEvent) => {
    this.held.delete(event.code);
    if (PREVENT_DEFAULT_KEYS.has(event.code) || PREVENT_DEFAULT_KEYS.has(event.key)) {
      event.preventDefault();
    }
  };

  private readonly blurHandler = () => {
    this.held.clear();
  };

  constructor(target: Window, onFirstInteraction?: () => void) {
    this.target = target;
    this.onFirstInteraction = onFirstInteraction;
  }

  attach(): void {
    this.target.addEventListener('keydown', this.keydownHandler, { passive: false });
    this.target.addEventListener('keyup', this.keyupHandler, { passive: false });
    this.target.addEventListener('blur', this.blurHandler);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.keydownHandler);
    this.target.removeEventListener('keyup', this.keyupHandler);
    this.target.removeEventListener('blur', this.blurHandler);
  }

  consumeStepInput(): InputState {
    const frame: InputState = {
      left: this.held.has('ArrowLeft'),
      right: this.held.has('ArrowRight'),
      up: this.held.has('ArrowUp'),
      down: this.held.has('ArrowDown'),
      thrust: this.held.has('KeyZ'),
      firePressed: this.fireCount > 0,
      startPressed: this.startCount > 0,
      pausePressed: this.pauseCount > 0,
      fullscreenPressed: this.fullscreenCount > 0,
    };

    if (this.fireCount > 0) this.fireCount -= 1;
    if (this.startCount > 0) this.startCount -= 1;
    if (this.pauseCount > 0) this.pauseCount -= 1;
    if (this.fullscreenCount > 0) this.fullscreenCount -= 1;

    return frame;
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }
}

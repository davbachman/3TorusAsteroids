import { viewports } from '../render/layout';

const RADIANS_PER_PIXEL = 0.003;

export class PointerSteering {
  private previous: { x: number; y: number } | null = null;
  private yaw = 0;
  private pitch = 0;

  constructor(private readonly viewport: HTMLElement, private readonly enabled: () => boolean) {
    viewport.addEventListener('pointermove', this.move);
    viewport.addEventListener('pointerleave', this.reset);
  }

  private readonly move = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || !this.enabled() ||
      (event.target instanceof Element && event.target.closest('button,select,.game-panel,.help'))) {
      this.reset(); return;
    }
    const rect = this.viewport.getBoundingClientRect();
    const {pov} = viewports(Math.floor(rect.width), Math.floor(rect.height));
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < pov.x || y < pov.y || x >= pov.x + pov.width || y >= pov.y + pov.height) {
      this.reset(); return;
    }
    if (this.previous) {
      this.yaw -= (x - this.previous.x) * RADIANS_PER_PIXEL;
      this.pitch += (y - this.previous.y) * RADIANS_PER_PIXEL;
    }
    this.previous = {x, y};
  };

  consume(): { lookYaw: number; lookPitch: number } {
    const result = { lookYaw: this.yaw, lookPitch: this.pitch };
    this.yaw = this.pitch = 0;
    return result;
  }
  readonly reset = (): void => { this.previous = null; this.yaw = this.pitch = 0; };
  destroy(): void {
    this.viewport.removeEventListener('pointermove', this.move);
    this.viewport.removeEventListener('pointerleave', this.reset);
    this.reset();
  }
}

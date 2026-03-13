import { GameState } from '../game/state';

export class HudRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context unavailable for HUD canvas');
    }
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(state: GameState): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.2;
    ctx.font = '18px Menlo, Monaco, Consolas, monospace';
    ctx.textBaseline = 'top';

    this.drawSplitScreenFrame();
    this.drawTopLeft(`SCORE ${state.score}`, 16, 12);
    this.drawTopLeft(`LIVES ${state.lives}`, 16, 36);
    this.drawTopLeft(`LEVEL ${state.level}`, 16, 60);

    if (state.mode === 'paused') {
      this.centerBlock(['PAUSED', '', 'P TO RESUME'], 28);
    } else if (state.mode === 'title') {
      this.centerBlock(
        [
          '3D ASTEROIDS',
          'WIREFRAME CUBE',
          '',
          'ARROWS = TURN / LOOK',
          'Z = THRUST',
          'SPACE = FIRE',
          'P = PAUSE   F = FULLSCREEN',
          '',
          'PRESS ENTER OR SPACE',
        ],
        24,
      );
    } else if (state.mode === 'gameOver') {
      this.centerBlock(['GAME OVER', '', 'PRESS ENTER OR SPACE TO RESTART'], 28);
    } else if (state.mode === 'respawning' && state.respawnAt != null) {
      const remaining = Math.max(0, state.respawnAt - state.time);
      this.centerBlock([`SHIP LOST`, `RESPAWN ${remaining.toFixed(1)}s`], 24);
    }

    if ((state.mode === 'playing' || state.mode === 'respawning') && state.time < state.levelMessageUntil) {
      this.centerTextInPane(`LEVEL ${state.level}`, this.height * 0.18, 22, 'left');
    }

    if (state.levelClearAt != null && state.asteroids.length === 0 && (state.mode === 'playing' || state.mode === 'respawning')) {
      this.centerTextInPane('SECTOR CLEAR', this.height * 0.28, 20, 'left');
    }

    ctx.restore();
  }

  private drawTopLeft(text: string, x: number, y: number): void {
    const { ctx } = this;
    ctx.strokeText(text, x, y);
  }

  private drawSplitScreenFrame(): void {
    const { ctx } = this;
    const midX = this.width * 0.5;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, this.height);
    ctx.stroke();

    const prev = ctx.font;
    ctx.font = '14px Menlo, Monaco, Consolas, monospace';
    const leftLabel = 'EXTERNAL VIEW';
    const rightLabel = 'TORUS POV';
    const leftWidth = ctx.measureText(leftLabel).width;
    const rightWidth = ctx.measureText(rightLabel).width;
    ctx.strokeText(leftLabel, this.width * 0.25 - leftWidth * 0.5, 12);
    ctx.strokeText(rightLabel, this.width * 0.75 - rightWidth * 0.5, 12);
    this.drawRightPaneReticle(midX);
    ctx.font = prev;
  }

  private drawRightPaneReticle(midX: number): void {
    const { ctx } = this;
    const cx = midX + (this.width - midX) * 0.5;
    const cy = this.height * 0.5;
    const arm = 10;
    const gap = 4;

    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + arm);
    ctx.stroke();
  }

  private centerText(text: string, y: number, size: number): void {
    const { ctx } = this;
    const prev = ctx.font;
    ctx.font = `${size}px Menlo, Monaco, Consolas, monospace`;
    const m = ctx.measureText(text);
    ctx.strokeText(text, (this.width - m.width) * 0.5, y);
    ctx.font = prev;
  }

  private centerTextInPane(text: string, y: number, size: number, pane: 'left' | 'right'): void {
    const { ctx } = this;
    const prev = ctx.font;
    ctx.font = `${size}px Menlo, Monaco, Consolas, monospace`;
    const m = ctx.measureText(text);
    const paneStart = pane === 'left' ? 0 : this.width * 0.5;
    const paneWidth = this.width * 0.5;
    ctx.strokeText(text, paneStart + (paneWidth - m.width) * 0.5, y);
    ctx.font = prev;
  }

  private centerBlock(lines: string[], size: number): void {
    const { ctx } = this;
    const prev = ctx.font;
    ctx.font = `${size}px Menlo, Monaco, Consolas, monospace`;
    const lineHeight = size + 6;
    const totalHeight = lineHeight * lines.length;
    let y = (this.height - totalHeight) * 0.5;
    for (const line of lines) {
      if (line.length > 0) {
        const m = ctx.measureText(line);
        ctx.strokeText(line, (this.width - m.width) * 0.5, y);
      }
      y += lineHeight;
    }
    ctx.font = prev;
  }
}

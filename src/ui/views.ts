import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { fruitTexture } from './fruits';
import { BOARD_SIZE, CELL, idx, type Board, type Lines } from '../core/board';
import { getPiece } from '../core/pieces';
import type { SpecialsState } from '../core/specials';
import { SPECIAL_COLORS, SPECIAL_GLYPHS, type Theme } from './theme';

const GAP = 2;

function drawCell(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1): void {
  g.roundRect(x + GAP, y + GAP, size - GAP * 2, size - GAP * 2, size * 0.18).fill({ color, alpha });
}

/** Fruit sprite for a block, centered on the cell. Falls back to nothing pre-load. */
function fruitSprite(color: number, stage: number, cx: number, cy: number, cellSize: number): Sprite | null {
  const tex = fruitTexture(color, stage);
  if (!tex) return null;
  const sprite = new Sprite(tex);
  sprite.anchor.set(0.5);
  sprite.position.set(cx, cy);
  sprite.width = sprite.height = cellSize * 0.72;
  return sprite;
}

/** The 8×8 grid: cells, special glyphs, ghost preview, glow and pulse layers. */
export class BoardView {
  readonly container = new Container();
  private bg = new Graphics();
  private cells = new Graphics();
  private ghost = new Graphics();
  private pulse = new Graphics();
  private dim = new Graphics();
  private glyphs = new Container();
  cellSize = 0;

  constructor(private theme: Theme) {
    this.container.addChild(this.bg, this.cells, this.glyphs, this.pulse, this.ghost, this.dim);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  resize(sizePx: number): void {
    this.cellSize = sizePx / BOARD_SIZE;
    this.bg.clear();
    this.bg
      .roundRect(-6, -6, sizePx + 12, sizePx + 12, 14)
      .fill(this.theme.boardBg);
  }

  toCell(localX: number, localY: number): { col: number; row: number } {
    return {
      col: Math.round(localX / this.cellSize),
      row: Math.round(localY / this.cellSize),
    };
  }

  render(board: Board, aux: SpecialsState, stage = 0): void {
    const cs = this.cellSize;
    const g = this.cells;
    g.clear();
    this.glyphs.removeChildren();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const v = board[idx(c, r)];
        const x = c * cs;
        const y = r * cs;
        if (v === CELL.EMPTY) {
          drawCell(g, x, y, cs, this.theme.emptyCell);
        } else if (v >= 1 && v <= 8) {
          drawCell(g, x, y, cs, this.theme.colors[v - 1]);
          const sprite = fruitSprite(v, stage, x + cs / 2, y + cs / 2, cs);
          if (sprite) this.glyphs.addChild(sprite);
          const seconds = aux.times[idx(c, r)];
          if (seconds !== undefined) {
            // rush time target: amber ring + banked-seconds badge
            g.roundRect(x + GAP + 1, y + GAP + 1, cs - GAP * 2 - 2, cs - GAP * 2 - 2, cs * 0.16)
              .stroke({ color: 0xffd166, width: 3 });
            const badge = new Text({
              text: `+${seconds}s`,
              style: { fontSize: cs * 0.28, fill: 0xffd166, fontWeight: '800', stroke: { color: 0x000000, width: 3 } },
            });
            badge.anchor.set(1, 1);
            badge.position.set(x + cs - 3, y + cs - 2);
            this.glyphs.addChild(badge);
          }
        } else {
          drawCell(g, x, y, cs, SPECIAL_COLORS[v] ?? 0x888888);
          const glyph = new Text({
            text: SPECIAL_GLYPHS[v] ?? '?',
            style: { fontSize: cs * 0.5 },
          });
          glyph.anchor.set(0.5);
          glyph.position.set(x + cs / 2, y + cs / 2);
          this.glyphs.addChild(glyph);
          const fuse = aux.bombs[idx(c, r)];
          if (v === CELL.BOMB && fuse !== undefined) {
            const counter = new Text({
              text: String(fuse),
              style: { fontSize: cs * 0.32, fill: 0xffffff, fontWeight: '700' },
            });
            counter.anchor.set(1, 0);
            counter.position.set(x + cs - 4, y + 2);
            this.glyphs.addChild(counter);
          }
        }
      }
    }
  }

  /** Ghost of the dragged piece + glow on lines the drop would complete. */
  renderGhost(
    pieceId: string | null,
    col: number,
    row: number,
    valid: boolean,
    wouldClear: Lines | null,
  ): void {
    const g = this.ghost;
    g.clear();
    if (!pieceId) return;
    const cs = this.cellSize;
    if (wouldClear) {
      for (const r of wouldClear.rows) {
        g.roundRect(0, r * cs + 1, cs * BOARD_SIZE, cs - 2, 6).fill({ color: 0xffffff, alpha: 0.28 });
      }
      for (const c of wouldClear.cols) {
        g.roundRect(c * cs + 1, 0, cs - 2, cs * BOARD_SIZE, 6).fill({ color: 0xffffff, alpha: 0.28 });
      }
    }
    const piece = getPiece(pieceId);
    const color = valid ? this.theme.colors[piece.color - 1] : 0xd23b4e;
    for (const [pc, pr] of piece.cells) {
      const c = col + pc;
      const r = row + pr;
      if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) continue;
      drawCell(g, c * cs, r * cs, cs, color, valid ? 0.45 : 0.35);
    }
  }

  clearGhost(): void {
    this.ghost.clear();
  }

  /** Near-death warning: dim the board, pulse the zones where pieces still fit. */
  renderNearDeath(active: boolean, zones: ReadonlySet<number>, phase: number): void {
    this.dim.clear();
    this.pulse.clear();
    if (!active) return;
    const size = this.cellSize * BOARD_SIZE;
    this.dim.rect(0, 0, size, size).fill({ color: 0x000000, alpha: 0.35 });
    const alpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(phase * 5));
    for (const i of zones) {
      const c = i % BOARD_SIZE;
      const r = Math.floor(i / BOARD_SIZE);
      drawCell(this.pulse, c * this.cellSize, r * this.cellSize, this.cellSize, 0xffffff, alpha);
    }
  }
}

/** The 3-slot piece tray — horizontal under the board, or a vertical column in landscape. */
export class TrayView {
  readonly container = new Container();
  private slots: Container[] = [];
  private vertical = false;
  slotWidth = 0;
  height = 0;

  constructor(private theme: Theme) {
    for (let i = 0; i < 3; i++) {
      const slot = new Container();
      this.container.addChild(slot);
      this.slots.push(slot);
    }
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  resize(length: number, vertical = false): void {
    this.vertical = vertical;
    this.slotWidth = length / 3;
    this.height = this.slotWidth * 0.9;
    this.slots.forEach((s, i) =>
      s.position.set(vertical ? 0 : i * this.slotWidth, vertical ? i * this.slotWidth : 0),
    );
  }

  /** Cell size used to draw tray pieces (pieces are shown shrunken). */
  trayCellSize(pieceId: string): number {
    const p = getPiece(pieceId);
    const maxSpan = Math.max(p.w, p.h, 3);
    return Math.min((this.slotWidth * 0.82) / maxSpan, this.height * 0.8 / maxSpan);
  }

  render(tray: ReadonlyArray<string | null>, hiddenSlot: number | null, stage = 0): void {
    this.slots.forEach((slot, i) => {
      slot.removeChildren();
      const id = tray[i];
      if (!id || i === hiddenSlot) return;
      const piece = getPiece(id);
      const cs = this.trayCellSize(id);
      const wrap = new Container();
      const g = new Graphics();
      wrap.addChild(g);
      for (const [c, r] of piece.cells) {
        drawCell(g, c * cs, r * cs, cs, this.theme.colors[piece.color - 1]);
        const sprite = fruitSprite(piece.color, stage, (c + 0.5) * cs, (r + 0.5) * cs, cs);
        if (sprite) wrap.addChild(sprite);
      }
      wrap.position.set(
        (this.slotWidth - piece.w * cs) / 2,
        (this.height - piece.h * cs) / 2,
      );
      slot.addChild(wrap);
    });
  }

  slotAt(localX: number, localY: number): number | null {
    const along = this.vertical ? localY : localX;
    const across = this.vertical ? localX : localY;
    if (across < -10 || across > (this.vertical ? this.slotWidth : this.height) + 24) return null;
    const i = Math.floor(along / this.slotWidth);
    return i >= 0 && i < 3 ? i : null;
  }
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** Short directional pops when lines clear. Never blocks input. */
export class ParticleSystem {
  readonly container = new Container();
  private particles: Particle[] = [];

  burst(cellIndices: readonly number[], lines: Lines, cellSize: number, color: number): void {
    const rows = new Set(lines.rows);
    const cols = new Set(lines.cols);
    for (const i of cellIndices) {
      const c = i % BOARD_SIZE;
      const r = Math.floor(i / BOARD_SIZE);
      const horizontal = rows.has(r);
      const vertical = cols.has(c);
      for (let n = 0; n < 3; n++) {
        const g = new Graphics();
        const s = cellSize * (0.12 + Math.random() * 0.12);
        g.rect(-s / 2, -s / 2, s, s).fill(color);
        g.position.set((c + 0.5) * cellSize, (r + 0.5) * cellSize);
        const speed = cellSize * (4 + Math.random() * 6);
        const jitter = (Math.random() - 0.5) * cellSize * 2;
        let vx = (Math.random() - 0.5) * speed;
        let vy = (Math.random() - 0.5) * speed;
        if (horizontal && !vertical) {
          vx = (c < BOARD_SIZE / 2 ? -1 : 1) * speed;
          vy = jitter;
        } else if (vertical && !horizontal) {
          vy = (r < BOARD_SIZE / 2 ? -1 : 1) * speed;
          vx = jitter;
        }
        this.container.addChild(g);
        this.particles.push({ g, vx, vy, life: 0, maxLife: 0.15 + Math.random() * 0.05 });
      }
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.g.position.x += p.vx * dt;
      p.g.position.y += p.vy * dt;
      p.g.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }
}

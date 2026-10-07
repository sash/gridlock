import { Container, Graphics, Text } from 'pixi.js';
import { BOARD_SIZE, CELL, idx, type Board, type Lines } from '../core/board';
import { getPiece } from '../core/pieces';
import { BOMB_WARN_AT, WILD_REACH, type SpecialsState } from '../core/specials';
import { SPECIAL_COLORS, SPECIAL_GLYPHS, type Theme } from './theme';

const GAP = 2;

function drawCell(g: Graphics, x: number, y: number, size: number, color: number, alpha = 1): void {
  g.roundRect(x + GAP, y + GAP, size - GAP * 2, size - GAP * 2, size * 0.18).fill({ color, alpha });
}

/**
 * Block with a material that evolves as the player levels up:
 * 0 flat · 1 satin top-light · 2 glossy · 3 beveled gem · 4+ neon rim.
 */
export function drawBlock(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: number,
  tier = 0,
): void {
  const ix = x + GAP;
  const iy = y + GAP;
  const is = size - GAP * 2;
  const radius = size * 0.18;
  g.roundRect(ix, iy, is, is, radius).fill(color);
  if (tier >= 1) {
    // satin: soft light across the top third
    g.roundRect(ix + 2, iy + 2, is - 4, is * 0.34, radius * 0.8).fill({ color: 0xffffff, alpha: 0.16 });
  }
  if (tier >= 2) {
    // gloss: specular dot
    g.circle(ix + is * 0.3, iy + is * 0.28, is * 0.11).fill({ color: 0xffffff, alpha: 0.4 });
  }
  if (tier >= 3) {
    // gem bevel: bright inner edge + grounded base shadow
    g.roundRect(ix + 1.5, iy + 1.5, is - 3, is - 3, radius * 0.85).stroke({ color: 0xffffff, alpha: 0.32, width: 1.5 });
    g.roundRect(ix + 2, iy + is * 0.72, is - 4, is * 0.24, radius * 0.6).fill({ color: 0x000000, alpha: 0.16 });
  }
  if (tier >= 4) {
    // neon rim
    g.roundRect(ix - 0.5, iy - 0.5, is + 1, is + 1, radius).stroke({ color: 0xffffff, alpha: 0.5, width: 2 });
  }
}

/** Rainbow arm colors for the wild zone overlay: up, left, center, right, down. */
const WILD_PALETTE = [0xef476f, 0xffd166, 0x06d6a0, 0x4cc9f0, 0x9b5de5];

/** The 8×8 grid: cells, special glyphs, ghost preview, glow and pulse layers. */
export class BoardView {
  readonly container = new Container();
  private bg = new Graphics();
  private cells = new Graphics();
  private ghost = new Graphics();
  private pulse = new Graphics();
  private dim = new Graphics();
  private warn = new Graphics();
  private glyphs = new Container();
  cellSize = 0;

  constructor(private theme: Theme) {
    this.container.addChild(this.bg, this.cells, this.glyphs, this.warn, this.pulse, this.ghost, this.dim);
  }

  /** Bombs about to petrify throb red so the deadline can't sneak up on you. */
  renderBombWarnings(aux: SpecialsState | null, phase: number): void {
    const g = this.warn;
    g.clear();
    if (!aux) return;
    const cs = this.cellSize;
    const throb = 0.5 + 0.5 * Math.sin(phase * 9);
    for (const [key, fuse] of Object.entries(aux.bombs)) {
      if (fuse > BOMB_WARN_AT) continue;
      const i = Number(key);
      const x = (i % BOARD_SIZE) * cs;
      const y = Math.floor(i / BOARD_SIZE) * cs;
      const grow = 2 + throb * 3;
      g.roundRect(x - grow + GAP, y - grow + GAP, cs - GAP * 2 + grow * 2, cs - GAP * 2 + grow * 2, cs * 0.22)
        .stroke({ color: 0xff3b3b, width: 3, alpha: 0.45 + 0.5 * throb });
    }
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

  render(board: Board, aux: SpecialsState, tier = 0): void {
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
          drawBlock(g, x, y, cs, this.theme.colors[v - 1], tier);
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
    this.renderWildZones(aux, cs);
  }

  /** Wild zones: a rainbow-ringed plus that helps complete lines without blocking. */
  private renderWildZones(aux: SpecialsState, cs: number): void {
    for (const center of aux.wilds) {
      const cc = center % BOARD_SIZE;
      const cr = Math.floor(center / BOARD_SIZE);
      // arms reach WILD_REACH cells; each direction keeps its own rainbow colour
      const arms: Array<[number, number, number]> = [[cc, cr, 2]];
      for (let d = 1; d <= WILD_REACH; d++) {
        arms.push([cc, cr - d, 0], [cc - d, cr, 1], [cc + d, cr, 3], [cc, cr + d, 4]);
      }
      arms.forEach(([c, r, i]) => {
        if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) return;
        this.cells
          .roundRect(c * cs + GAP + 1, r * cs + GAP + 1, cs - GAP * 2 - 2, cs - GAP * 2 - 2, cs * 0.16)
          .stroke({ color: WILD_PALETTE[i], width: 2.5, alpha: 0.95 });
        this.cells
          .roundRect(c * cs + GAP, r * cs + GAP, cs - GAP * 2, cs - GAP * 2, cs * 0.18)
          .fill({ color: 0xffffff, alpha: 0.07 });
      });
      const glyph = new Text({ text: '🌈', style: { fontSize: cs * 0.5 } });
      glyph.anchor.set(0.5);
      glyph.alpha = 0.95;
      glyph.position.set((cc + 0.5) * cs, (cr + 0.5) * cs);
      this.glyphs.addChild(glyph);
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

/** Index of the hold slot in the tray view (after the 3 dealt pieces). */
const HOLD_INDEX = 3;
const TRAY_SLOTS = 4;

/**
 * The piece tray — 3 dealt pieces plus a framed hold slot at the end.
 * Horizontal under the board, or a vertical column in landscape.
 */
export class TrayView {
  readonly container = new Container();
  private slots: Container[] = [];
  private holdFrame = new Graphics();
  private holdLabel = new Text({ text: 'HOLD', style: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 } });
  private vertical = false;
  slotWidth = 0;
  height = 0;

  constructor(private theme: Theme) {
    for (let i = 0; i < TRAY_SLOTS; i++) {
      const slot = new Container();
      this.container.addChild(slot);
      this.slots.push(slot);
    }
    this.holdLabel.anchor.set(0.5, 0);
    this.slots[HOLD_INDEX].addChild(this.holdFrame, this.holdLabel);
  }

  private drawHoldFrame(hot: boolean): void {
    const f = this.holdFrame;
    f.clear();
    const inset = 4;
    f.roundRect(inset, inset, this.slotWidth - inset * 2, this.height - inset * 2, 12)
      .fill({ color: this.theme.emptyCell, alpha: hot ? 0.55 : 0.28 })
      .stroke({ color: hot ? 0xffd166 : this.theme.emptyCell, width: hot ? 3 : 2, alpha: hot ? 1 : 0.9 });
    this.holdLabel.style.fill = hot ? 0xffd166 : this.theme.emptyCell;
    this.holdLabel.alpha = hot ? 1 : 0.9;
    this.holdLabel.position.set(this.slotWidth / 2, inset + 3);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  resize(length: number, vertical = false): void {
    this.vertical = vertical;
    this.slotWidth = length / TRAY_SLOTS;
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

  /** `items` is the 3 dealt pieces followed by the held one. */
  render(items: ReadonlyArray<string | null>, hiddenSlot: number | null, tier = 0, holdHot = false): void {
    this.drawHoldFrame(holdHot);
    this.slots.forEach((slot, i) => {
      slot.removeChildren();
      if (i === HOLD_INDEX) slot.addChild(this.holdFrame, this.holdLabel);
      const id = items[i];
      if (!id || i === hiddenSlot) return;
      const piece = getPiece(id);
      // the held piece shrinks a touch so the HOLD label stays readable
      const cs = this.trayCellSize(id) * (i === HOLD_INDEX ? 0.85 : 1);
      const g = new Graphics();
      for (const [c, r] of piece.cells) {
        drawBlock(g, c * cs, r * cs, cs, this.theme.colors[piece.color - 1], tier);
      }
      g.position.set(
        (this.slotWidth - piece.w * cs) / 2,
        (this.height - piece.h * cs) / 2,
      );
      slot.addChild(g);
    });
  }

  slotAt(localX: number, localY: number): number | null {
    const along = this.vertical ? localY : localX;
    const across = this.vertical ? localX : localY;
    if (across < -10 || across > (this.vertical ? this.slotWidth : this.height) + 24) return null;
    const i = Math.floor(along / this.slotWidth);
    return i >= 0 && i < TRAY_SLOTS ? i : null;
  }
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** Velocity damping per second (0 = none) — blast debris slows as it flies. */
  drag?: number;
}

interface Ring {
  g: Graphics;
  x: number;
  y: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: number;
}

const BLAST_COLORS = [0xffd166, 0xff7849, 0xef476f, 0xffffff];

/** Short directional pops when lines clear. Never blocks input. */
export class ParticleSystem {
  readonly container = new Container();
  private particles: Particle[] = [];
  private rings: Ring[] = [];

  /** Bomb blast: hot debris flung radially plus a double shockwave ring. */
  blast(center: number, cellSize: number): void {
    const x = ((center % BOARD_SIZE) + 0.5) * cellSize;
    const y = (Math.floor(center / BOARD_SIZE) + 0.5) * cellSize;
    for (let n = 0; n < 48; n++) {
      const g = new Graphics();
      const s = cellSize * (0.14 + Math.random() * 0.22);
      g.roundRect(-s / 2, -s / 2, s, s, s * 0.25).fill(BLAST_COLORS[n % BLAST_COLORS.length]);
      g.position.set(x, y);
      g.rotation = Math.random() * Math.PI;
      const angle = Math.random() * Math.PI * 2;
      const speed = cellSize * (8 + Math.random() * 14);
      this.container.addChild(g);
      this.particles.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
        drag: 3.5,
      });
    }
    this.ring(x, y, cellSize * 3.2, 0.42, 0xffd166);
    this.ring(x, y, cellSize * 2.2, 0.3, 0xffffff);
  }

  ring(x: number, y: number, maxR: number, maxLife: number, color: number): void {
    const g = new Graphics();
    this.container.addChild(g);
    this.rings.push({ g, x, y, maxR, life: 0, maxLife, color });
  }

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
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.g.position.x += p.vx * dt;
      p.g.position.y += p.vy * dt;
      p.g.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life += dt;
      const t = Math.min(1, ring.life / ring.maxLife);
      const eased = 1 - (1 - t) * (1 - t);
      ring.g.clear();
      ring.g.circle(ring.x, ring.y, ring.maxR * eased)
        .fill({ color: ring.color, alpha: 0.18 * (1 - t) })
        .stroke({ color: ring.color, width: 6 * (1 - t) + 1, alpha: 1 - t });
      if (t >= 1) {
        ring.g.destroy();
        this.rings.splice(i, 1);
      }
    }
  }
}

/**
 * figures.ts
 *
 * The characters as the Remastered tiles draw them: each in the figure and the colours of their look
 * (game/appearance.ts), dressed from the figure's cell of the sheet by the Ultima V port's rules (avatarRegions.ts),
 * over the EGA colours it was drawn in (figurePixels.ts). Each look's two frames are made once and kept.
 */

import { type Appearance, FIGURES } from '../game/appearance.ts';
import { dress, labels } from './avatarRegions.ts';
import { FIGURE_PIXELS } from './figurePixels.ts';
import { TILE_COLUMNS, TILE_ROWS } from './graphics.ts';

/** The sheet's cells are this many pixels a side (the Remastered sheet's; the rules' four to an EGA pixel). */
const CELL = 64;

/** A cell's rows turned end for end, in place: the figure facing the other way. */
function mirrorRows(px: Uint32Array, n: number): void {
  for (let y = 0; y < n; y++) px.subarray(y * n, (y + 1) * n).reverse();
}

export class FigurePainter {
  private readonly sheet: Uint32Array | null;
  private readonly sheetWidth: number;
  private readonly made = new Map<string, HTMLCanvasElement>();

  /** For the Remastered sheet `tiles` (any other size of sheet draws nothing: `figure` gives null). */
  constructor(tiles: HTMLImageElement | HTMLCanvasElement) {
    this.sheetWidth = tiles.width;
    if (tiles.width !== TILE_COLUMNS * CELL || tiles.height !== TILE_ROWS * CELL) {
      this.sheet = null;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = tiles.width;
    canvas.height = tiles.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(tiles, 0, 0);
    const data = ctx.getImageData(0, 0, tiles.width, tiles.height).data;
    this.sheet = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
  }

  /** The cell of tile `tile`'s frame `frame`, as the sheet has it (RGBA in memory order). */
  private cell(tile: number, frame: number): Uint32Array {
    const out = new Uint32Array(CELL * CELL);
    const [cx, cy] = [(Math.floor(tile / TILE_ROWS) * 2 + frame) * CELL, (tile % TILE_ROWS) * CELL];
    for (let y = 0; y < CELL; y++)
      out.set(this.sheet!.subarray((cy + y) * this.sheetWidth + cx, (cy + y) * this.sheetWidth + cx + CELL), y * CELL);
    return out;
  }

  /** `look`'s figure in its frame `frame` (0 or 1), `beardless` as appearance.ts says: a CELL-pixel canvas, or null. */
  figure(look: Appearance, frame: 0 | 1, beardless: boolean): HTMLCanvasElement | null {
    if (!this.sheet) return null;
    const key = `${look.figure}:${look.skin}:${look.hair}:${look.main}:${look.trim}:${frame}:${beardless ? 1 : 0}`;
    let canvas = this.made.get(key);
    if (canvas) return canvas;
    const figure = FIGURES[look.figure];
    const f = figure.frames[frame];
    const hex = FIGURE_PIXELS[`${f.tile}.${f.frame}`] ?? '';
    const px = Uint8Array.from(hex, (c) => parseInt(c, 16));
    const cell = this.cell(f.tile, f.frame);
    if (f.mirrored) mirrorRows(cell, CELL);
    const out = dress(cell, px, labels(px, figure.base, Math.max(0, Math.min(3, f.source - figure.base))), look, beardless);
    if (f.mirrored) mirrorRows(out, CELL);
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = CELL;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(CELL, CELL);
    new Uint32Array(image.data.buffer).set(out);
    ctx.putImageData(image, 0, 0);
    this.made.set(key, canvas);
    return canvas;
  }
}

/**
 * dungeonView.ts
 *
 * Draws the first-person dungeon view. A port of the drawing half of
 * UltimaDngn.c (`DrawWall`, `DrawDoor`, `DrawChest`, `DrawLadder`,
 * `DrawDungeonBackGround`, `DimDungeon`, `ShowSecret`).
 *
 * The view is composed on a 600x512 offscreen canvas, the size the
 * original used, and then scaled into the map viewport. Wall pieces come
 * from DungeonShapes.jpg (3000x512): the first 1200 pixels hold the wall
 * pieces (with DungeonMasks.png giving their transparency), and 1800..2400
 * is the empty corridor background. All coordinates in the tables below
 * are in the original's half-resolution units and are doubled when used.
 */

import type { DungeonDrawOp } from '../game/dungeon.ts';
import type { GraphicsSet } from './graphics.ts';
import type { DungeonStyle } from './dungeonArt.ts';

// Wall piece rectangles for the 32 view locations (plus 33-35: chest and ladder art).
const DNG_L = [
  0, 0, 225, 0, 75, 225, 0, 75, 187, 225, 0, 75, 113, 187, 225, 0, 75, 113, 170, 188, 226, 0, 75, 112, 130, 170, 188, 225, 112, 130, 152,
  168, 0, 300, 375, 377,
];
const DNG_T = [
  0, 0, 0, 64, 64, 64, 64, 65, 65, 64, 96, 96, 96, 96, 96, 96, 96, 97, 97, 96, 96, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 0,
  208, 208, 208,
];
const DNG_R = [
  300, 75, 300, 75, 225, 300, 75, 113, 225, 300, 75, 113, 187, 225, 300, 74, 112, 130, 187, 225, 300, 75, 112, 130, 170, 188, 225, 300, 132,
  148, 170, 188, 300, 375, 377, 381,
];
const DNG_B = [
  256, 256, 256, 192, 192, 192, 192, 191, 191, 192, 160, 160, 160, 160, 160, 160, 160, 159, 159, 160, 160, 144, 144, 144, 144, 144, 144,
  144, 144, 144, 144, 144, 256, 240, 212, 256,
];
// Where in the sheet each location's piece is, relative to its screen rectangle.
const OF_X = [
  600, 0, 0, 1200, 1200, 1200, 300, 0, 0, 300, 1200, 1200, 1200, 1200, 1200, 300, 300, 0, 0, 300, 300, 1200, 1200, 1200, 1200, 1200, 1200,
  1200, 300, 0, 0, 300,
];
const OF_Y = [
  0, 0, 0, -64, -64, -64, -64, 0, 0, -64, 34, 34, 34, 34, 34, 34, -64, 0, 0, -64, 34, 84, 84, 84, 84, 84, 84, 84, -64, 0, 0, -64,
];
// Whether the piece uses the transparency mask (side walls seen at an angle).
const USE_MASK = [0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];

// Chest and ladder placement for locations 0..20.
const CH_L = [112, 0, 264, 56, 131, 226, 0, 75, 207, 272, 66, 103, 141, 188, 226, 28, 75, 113, 179, 216, 254];
const CH_T = [208, 208, 208, 168, 168, 168, 168, 168, 168, 168, 148, 148, 148, 148, 148, 148, 148, 148, 148, 148, 148];
const CH_R = [186, 36, 300, 74, 169, 244, 18, 93, 225, 300, 74, 112, 159, 197, 234, 46, 84, 121, 187, 225, 272];
const CH_B = [240, 240, 240, 184, 184, 184, 184, 184, 184, 184, 156, 156, 156, 156, 156, 156, 156, 156, 156, 156, 156];
/** 0 = seen head on, 1 = only the left half is visible, 2 = only the right half. */
const CH_SIDE = [0, 2, 1, 1, 0, 2, 2, 2, 1, 1, 1, 1, 0, 2, 2, 0, 2, 2, 1, 1, 0];

// Door polygons.
const DX1 = [
  74, 0, 300, 0, 114, 300, 20, 88, 212, 280, 36, 79, 135, 221, 264, 24, 87, 118, 182, 213, 276, 40, 87, 114, 143, 186, 213, 260, 118, 136,
  164, 182,
];
const DX2 = [
  226, 40, 260, 37, 186, 263, 48, 102, 198, 252, 64, 108, 164, 192, 236, 48, 101, 124, 176, 199, 252, 54, 100, 127, 156, 173, 200, 246, 126,
  140, 160, 174,
];
const DY1 = [
  256, 256, 256, 191, 191, 191, 182, 179, 179, 182, 159, 159, 159, 159, 159, 154, 153, 153, 153, 153, 154, 143, 143, 143, 143, 143, 143,
  143, 140, 138, 138, 140,
];
const DY2 = [
  64, 75, 75, 95, 95, 95, 96, 100, 100, 96, 112, 112, 112, 112, 112, 112, 110, 110, 110, 110, 112, 120, 120, 120, 120, 120, 120, 120, 122,
  124, 124, 122,
];
const DY3 = [
  64, 92, 92, 95, 95, 95, 102, 106, 106, 102, 112, 112, 112, 112, 112, 116, 114, 115, 115, 114, 116, 120, 120, 120, 120, 120, 120, 120, 124,
  126, 126, 124,
];
const DY4 = [
  256, 220, 220, 191, 191, 191, 170, 168, 168, 170, 159, 159, 159, 159, 159, 149, 147, 148, 148, 147, 149, 143, 143, 143, 143, 143, 143,
  143, 137, 134, 134, 137,
];

export const DUNGEON_VIEW_WIDTH = 600;
export const DUNGEON_VIEW_HEIGHT = 512;
export const DUNGEON_SHEET_WIDTH = 3000;
export const DUNGEON_SHEET_HEIGHT = 512;

/** One rectangle of the sheet that the renderer samples, for documenting the sheet's layout. */
export interface SheetRegion {
  name: string;
  /** Source rectangle in sheet pixels. */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** Where it lands in the 600x512 view (undefined for pieces that are stretched). */
  dx?: number;
  dy?: number;
  /** Whether the mask sheet cuts it (angled side walls). */
  masked: boolean;
}

/**
 * Every rectangle of the shapes sheet the renderer reads, derived from the
 * tables above: the 32 wall positions, the chest, the two ladder pieces
 * and the empty corridor background. A new sheet for another tile set
 * must carry its art in these same places (`docs/dungeon-sheet.md`).
 */
export function sheetRegions(): SheetRegion[] {
  const out: SheetRegion[] = [];
  for (let i = 0; i < 32; i++) {
    const x = DNG_L[i] * 2;
    const y = DNG_T[i] * 2;
    out.push({
      name: `wall ${i}`,
      sx: x + OF_X[i] * 2,
      sy: y + OF_Y[i] * 2,
      w: (DNG_R[i] - DNG_L[i]) * 2,
      h: (DNG_B[i] - DNG_T[i]) * 2,
      dx: x,
      dy: y,
      masked: USE_MASK[i] === 1,
    });
  }
  for (const [i, name] of [
    [33, 'chest'],
    [34, 'ladder rung'],
    [35, 'ladder rail'],
  ] as const) {
    out.push({ name, sx: DNG_L[i] * 2, sy: DNG_T[i] * 2, w: (DNG_R[i] - DNG_L[i]) * 2, h: (DNG_B[i] - DNG_T[i]) * 2, masked: false });
  }
  out.push({ name: 'corridor background', sx: 1800, sy: 0, w: 600, h: 512, dx: 0, dy: 0, masked: false });
  return out;
}

/** Combine the shapes sheet with its mask into an RGBA sheet (black in the mask = opaque). */
function applyMask(shapes: HTMLImageElement | HTMLCanvasElement, mask: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = shapes.width;
  canvas.height = shapes.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(shapes, 0, 0);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  mctx.drawImage(mask, 0, 0);
  const rgba = ctx.getImageData(0, 0, mask.width, mask.height);
  const m = mctx.getImageData(0, 0, mask.width, mask.height).data;
  for (let i = 0; i < rgba.data.length; i += 4) rgba.data[i + 3] = 255 - Math.round((m[i] + m[i + 1] + m[i + 2]) / 3);
  ctx.putImageData(rgba, 0, 0);
  return canvas;
}

export class DungeonRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly masked: HTMLCanvasElement;

  /** The renderer for a tile set's dungeon art, or null when the set (and Standard) has none. */
  static forSet(gfx: GraphicsSet): DungeonRenderer | null {
    return gfx.dungeonShapes && gfx.dungeonMasks ? new DungeonRenderer(gfx.dungeonShapes, gfx.dungeonMasks, gfx.dungeonStyle) : null;
  }

  constructor(
    private readonly shapes: HTMLImageElement | HTMLCanvasElement,
    mask: HTMLImageElement,
    /** Painted styles say how a doorway looks; the photographic sheet takes the original's black. */
    private readonly style: DungeonStyle | null = null,
  ) {
    this.masked = applyMask(shapes, mask);
    this.canvas = document.createElement('canvas');
    this.canvas.width = DUNGEON_VIEW_WIDTH;
    this.canvas.height = DUNGEON_VIEW_HEIGHT;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** Compose the view for the given draw list. `torch` below 3 dims it; `secret` is overlaid text. */
  render(ops: DungeonDrawOp[], torch: number, secret: string | null): HTMLCanvasElement {
    const ctx = this.ctx;
    ctx.drawImage(this.shapes, 1800, 0, 600, 512, 0, 0, 600, 512);
    for (const op of ops) {
      switch (op.kind) {
        case 'wall':
          this.wall(op.location);
          break;
        case 'door':
          this.door(op.location);
          break;
        case 'chest':
          this.chest(op.location);
          break;
        case 'ladder':
          this.ladder(op.location, op.down);
          break;
      }
    }
    if (secret) this.secret(secret);
    if (torch < 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.57)';
      ctx.fillRect(0, 0, 600, 512);
    }
    return this.canvas;
  }

  /** Mirrors `DrawWall()`. */
  private wall(location: number): void {
    if (location > 31) return;
    const x = DNG_L[location] * 2;
    const y = DNG_T[location] * 2;
    const w = (DNG_R[location] - DNG_L[location]) * 2;
    const h = (DNG_B[location] - DNG_T[location]) * 2;
    const sx = x + OF_X[location] * 2;
    const sy = y + OF_Y[location] * 2;
    const src = USE_MASK[location] ? this.masked : this.shapes;
    this.ctx.drawImage(src, sx, sy, w, h, x, y, w, h);
  }

  /** Mirrors `DrawDoor()`: a black trapezoid in the wall (a painted style may fill and outline it its own way). */
  private door(location: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.style?.doorFill ?? '#000';
    ctx.beginPath();
    ctx.moveTo(DX1[location] * 2, DY1[location] * 2);
    ctx.lineTo(DX1[location] * 2, DY2[location] * 2);
    ctx.lineTo(DX2[location] * 2, DY3[location] * 2);
    ctx.lineTo(DX2[location] * 2, DY4[location] * 2);
    ctx.closePath();
    ctx.fill();
    if (this.style?.doorLine) {
      ctx.strokeStyle = this.style.doorLine;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /** Mirrors `DrawChest()`. */
  private chest(location: number): void {
    if (location > 20) return;
    const shape = 33;
    let sx = DNG_L[shape] * 2;
    let sw = (DNG_R[shape] - DNG_L[shape]) * 2;
    const sy = DNG_T[shape] * 2;
    const sh = (DNG_B[shape] - DNG_T[shape]) * 2;
    const half = sw / 2;
    if (CH_SIDE[location] === 1) sw -= half;
    if (CH_SIDE[location] === 2) {
      sx += half - 1;
      sw -= half - 1;
    }
    const dx = CH_L[location] * 2;
    const dy = CH_T[location] * 2;
    const dw = (CH_R[location] + 1) * 2 - dx;
    const dh = (CH_B[location] + 1) * 2 - dy;
    this.ctx.drawImage(this.shapes, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  /** Mirrors `DrawLadder()`: rails and a rung drawn from two small textures. */
  private ladder(location: number, down: boolean): void {
    if (location > 20) return;
    const ctx = this.ctx;
    const left = CH_L[location] * 2;
    let top = CH_T[location] * 2;
    const right = CH_R[location] * 2;
    let bottom = CH_B[location] * 2;
    top = bottom - (bottom - top) * 1.5;
    let base = bottom;
    if (!down) {
      const swap = 512 - bottom;
      bottom = 512 - top;
      top = swap;
      base = top;
    }
    const side = CH_SIDE[location];
    const height = ((bottom - top) * 1.25 - (bottom - top)) / 2;
    const width = (bottom - top) / 12;
    const rung = (bottom - top) / 2 + top - width / 2;
    let half = left + (right - left) / 2;
    if (side === 1) half = right;
    if (side === 2) half = left;

    // The hole in the floor or ceiling.
    ctx.fillStyle = '#000';
    ctx.fillRect(left - width - 2, base - height, right - left + 2 * width + 4, 2 * height);

    const rail = (x: number) => this.piece(35, x, top, width, bottom - top);
    const bar = (x1: number, x2: number) => this.piece(34, x1, rung, x2 - x1, width);
    if (side === 0 || side === 1) {
      rail(left);
      bar(left, half + 1);
    }
    if (side === 0 || side === 2) {
      rail(right - width);
      bar(half, right);
    }
  }

  private piece(shape: number, dx: number, dy: number, dw: number, dh: number): void {
    const sx = DNG_L[shape] * 2;
    const sy = DNG_T[shape] * 2;
    const sw = (DNG_R[shape] - DNG_L[shape]) * 2;
    const sh = (DNG_B[shape] - DNG_T[shape]) * 2;
    this.ctx.drawImage(this.shapes, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  /** Mirrors `ShowSecret()`: ghostly writing across the middle of the view. */
  private secret(text: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 301, 283);
    ctx.fillStyle = '#000';
    ctx.fillText(text, 299, 281);
    ctx.fillStyle = '#888';
    ctx.fillText(text, 300, 282);
    ctx.restore();
  }
}

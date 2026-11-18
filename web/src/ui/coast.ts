/**
 * coast.ts
 *
 * Coastlines, for the Remastered, Standard and Nintendo tile sets: a water square
 * shows surf along whatever land is beside it, the way the NES game's
 * shores did, where the other sets keep the Apple II's plain water. The map
 * is unchanged; this only draws over the water.
 *
 * Each water square is drawn over by a piece chosen by which of its eight
 * neighbours are land (`coastMask`). The piece is worked out pixel by pixel
 * on the tiles' 16-pixel grid: how far each pixel is from the nearest land
 * (straight in from a side, round from a corner), and the set's style says
 * what that distance shows (`COAST_STYLES`): a speckled fringe of foam
 * thinning out over three pixels. The speckle is a fixed noise, so it holds
 * still from frame to frame, in four patterns that alternate across the map
 * so neighbouring shores do not repeat.
 */

import { Shape } from '../game/tiles.ts';

/**
 * A set's surf, in bands out from the land, a pixel wide each: in each, the speckle's noise (0 to 1) picks the first
 * colour whose share it is under, counted up through the list, and past the last the water shows.
 */
export type CoastStyle = [colour: string, upTo: number][][];

/** The sets with coastlines, and their surf. */
export const COAST_STYLES: Record<string, CoastStyle> = {
  // The Ultima V port's Remastered shore: a fringe of sand at the waterline (its SHORE_SAND), then its shallows' lighter blue.
  Remastered: [
    [
      ['#9c8452', 0.3],
      ['#8a7448', 0.6],
      ['#7a6640', 0.9],
    ],
    [
      ['#7a6640', 0.2],
      ['#34416f', 0.85],
    ],
    [['#34416f', 0.45]],
  ],
  // White foam, thinning into pale blues over our water.
  Standard: [[['#e4f6ff', 0.85]], [['#bfe9ff', 0.55]], [['#9fdcff', 0.22]]],
  // The NES palette's white and light blue, as Ultima: Exodus drew its surf.
  Nintendo: [
    [
      ['#fcfcfc', 0.8],
      ['#3cbcfc', 1],
    ],
    [
      ['#fcfcfc', 0.5],
      ['#3cbcfc', 0.8],
    ],
    [['#3cbcfc', 0.3]],
  ],
};

/** What a pixel `d` pixels from the land shows in `style`, `noise` deciding the speckle: a colour, or nothing. */
export function surfAt(style: CoastStyle, d: number, noise: number): string | null {
  const band = style[Math.floor(d)];
  return band?.find(([, upTo]) => noise < upTo)?.[0] ?? null;
}

/**
 * The sets whose shore runs only along the land itself, by the shapes that are (game/tiles.ts Shape): Remastered's,
 * as the Ultima V port draws its shore only by soft ground - not along a castle's moat, where the water meets paving
 * and walls. In every other set with coastlines all that is not water is land.
 */
const NATURAL_SHORES: Record<string, ReadonlySet<number>> = {
  Remastered: new Set([Shape.Grass, Shape.Brush, Shape.Forest, Shape.Mountains, Shape.Dungeon, Shape.Town, Shape.Castle]),
};

/** Whether a square of `shape` beside the water has a shore drawn along it in `setName` (water and the void never). */
export function shoreBy(setName: string, shape: number): boolean {
  if (shape === Shape.Water || shape === Shape.Void) return false;
  return NATURAL_SHORES[setName]?.has(shape) ?? true;
}

/** The neighbours as bits of a mask, clockwise from north. */
export const NORTH = 1;
export const NORTH_EAST = 2;
export const EAST = 4;
export const SOUTH_EAST = 8;
export const SOUTH = 16;
export const SOUTH_WEST = 32;
export const WEST = 64;
export const NORTH_WEST = 128;
const AROUND: [number, number, number][] = [
  [0, -1, NORTH],
  [1, -1, NORTH_EAST],
  [1, 0, EAST],
  [1, 1, SOUTH_EAST],
  [0, 1, SOUTH],
  [-1, 1, SOUTH_WEST],
  [-1, 0, WEST],
  [-1, -1, NORTH_WEST],
];

/** Which neighbours of a water square are land, `land(dx, dy)` saying of each: 0 for none, open sea. */
export function coastMask(land: (dx: number, dy: number) => boolean): number {
  let mask = 0;
  for (const [dx, dy, bit] of AROUND) if (land(dx, dy)) mask |= bit;
  return mask;
}

/** The speckle's noise at a pixel of one of the four patterns: fixed, so the surf holds still. */
function noise(px: number, py: number, pattern: number): number {
  let h = (px * 374761393 + py * 668265263 + pattern * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The pattern a map square uses, from its place: the four alternate across the map. */
export function coastPattern(x: number, y: number): number {
  return (((x * 7 + y * 13) % 4) + 4) % 4;
}

/** The 16x16 pixels of the piece for `mask`, row by row: a colour where there is surf, null where the water shows. */
export function coastPixels(mask: number, style: CoastStyle, pattern: number): (string | null)[] {
  const out: (string | null)[] = [];
  const has = (bit: number) => (mask & bit) !== 0;
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      let d = Infinity;
      if (has(NORTH)) d = Math.min(d, py);
      if (has(SOUTH)) d = Math.min(d, 15 - py);
      if (has(WEST)) d = Math.min(d, px);
      if (has(EAST)) d = Math.min(d, 15 - px);
      // Round from a corner where only the diagonal is land, so the surf turns a point of land smoothly.
      const corner = (cx: number, cy: number) => Math.max(0, Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - 0.5);
      if (has(NORTH_WEST)) d = Math.min(d, corner(0, 0));
      if (has(NORTH_EAST)) d = Math.min(d, corner(16, 0));
      if (has(SOUTH_WEST)) d = Math.min(d, corner(0, 16));
      if (has(SOUTH_EAST)) d = Math.min(d, corner(16, 16));
      out.push(d === Infinity ? null : surfAt(style, d, noise(px, py, pattern)));
    }
  }
  return out;
}

/** Draws the coast pieces for a tile set, each made once and kept. */
export class CoastPainter {
  private pieces = new Map<string, HTMLCanvasElement>();

  /** Whether `setName` has coastlines. */
  has(setName: string): boolean {
    return setName in COAST_STYLES;
  }

  /** Draw over the water square at (dx, dy), `size` pixels, the surf for `mask` in `setName`'s style. */
  draw(ctx: CanvasRenderingContext2D, setName: string, mask: number, pattern: number, dx: number, dy: number, size: number): void {
    const style = COAST_STYLES[setName];
    if (!style || mask === 0) return;
    const key = `${setName}:${mask}:${pattern}`;
    let piece = this.pieces.get(key);
    if (!piece) {
      piece = document.createElement('canvas');
      piece.width = piece.height = 16;
      const pctx = piece.getContext('2d')!;
      coastPixels(mask, style, pattern).forEach((colour, i) => {
        if (!colour) return;
        pctx.fillStyle = colour;
        pctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
      });
      this.pieces.set(key, piece);
    }
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(piece, dx, dy, size, size);
    ctx.imageSmoothingEnabled = smoothing;
  }
}

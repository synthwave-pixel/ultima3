/**
 * remastered.ts
 *
 * Draws the Remastered tile sheet (public/graphics/Remastered-Tiles.png) from the PC Ultima V one, as the Ultima V
 * port's Remastered look draws Ultima V's own tiles: each EGA pixel toned to that look's palette and enlarged four to
 * one, a figure or a thing lifted off the ground it was drawn on, a few recoloured (wood brown, the people's skin in
 * one ramp), and a fine black line drawn round whatever stands on a square. Run after either changes:
 *
 *   npm run remastered
 *
 * The treatment is the Ultima V port's own (tools/remastered/originals.ts, copied from it; see the README there),
 * given each tile as the Ultima V tile it was drawn from (tools/remastered/sources.ts) so that tile's own rules
 * apply; a tile drawn for the set alone is toned the same way, lifted off black (the force field's sparks brighter,
 * OWN_COLOURS). The floor and the counter are Standard's: the Ultima V port's Remastered look floors its towns with
 * this port's floor too, and PC Ultima V's counter is a black slab.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, newImage, type Image } from './remastered/png.ts';
import { groundOf, original, TONED } from './remastered/originals.ts';
import { EGA_PALETTE } from './remastered/ega.ts';
import { SOURCES } from './remastered/sources.ts';
import { FIGURES } from '../src/game/appearance.ts';

const here = dirname(fileURLToPath(import.meta.url));
const graphics = join(here, '..', 'public', 'graphics');

const COLUMNS = 12;
const ROWS = 16;
/** EGA pixels a tile side, and sheet pixels in the made sheet. */
const N = 16;
const CELL = 64;
const HI = CELL / N;

/** The tiles the map draws opaque, as a square's terrain (src/tiles.ts TERRAIN); the rest stand on one. */
const TERRAIN = new Set([...range(0, 8), ...range(31, 57)]);
/** Tiles kept from the Standard sheet as they are: the floor, and the counter (PC Ultima V's is a black slab). */
const FROM_STANDARD = new Set([8, 37]);
/**
 * Places the map draws as terrain that stand on the grass: the dungeon's mouth, the towne and the castle, lifted off
 * the ground the EGA drew them on and set on Remastered's own grass, as the Ultima V port lays its land under them.
 */
const ON_GRASS = new Set([5, 6, 7]);
const GRASS = 1;
/** The fine line round a figure, in sheet pixels (the Ultima V port's OUTLINE_WIDTH). */
const OUTLINE = 2;

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Cell (column, row) of tile `index`'s `frame`. */
const cellOf = (index: number, frame: number): [number, number] => [Math.floor(index / ROWS) * 2 + frame, index % ROWS];

/** The EGA colour nearest an RGB. */
function nearest(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  EGA_PALETTE.forEach((c, i) => {
    const d = (r - (c >> 16)) ** 2 + (g - ((c >> 8) & 255)) ** 2 + (b - (c & 255)) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** A cell of the PC Ultima V sheet as N x N EGA colour indices (its own cells are the EGA's pixels doubled). */
function egaCell(sheet: Image, col: number, row: number): Uint8Array {
  const scale = sheet.width / COLUMNS / N;
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const o = ((row * N + y) * scale * sheet.width + (col * N + x) * scale) * 4;
      out[y * N + x] = sheet.data[o + 3] < 128 ? 0 : nearest(sheet.data[o], sheet.data[o + 1], sheet.data[o + 2]);
    }
  return out;
}

const mirror = (px: Uint8Array): Uint8Array => px.map((_, i) => px[Math.floor(i / N) * N + (N - 1 - (i % N))]);

/** Pixels as Ultima V's packed tiles hold them, two to a byte, high nibble first, in slot `t` of `tiles`. */
function pack(tiles: Uint8Array, t: number, px: Uint8Array): void {
  for (let i = 0; i < N * N; i += 2) tiles[t * 128 + (i >> 1)] = (px[i] << 4) | px[i + 1];
}

/**
 * Colours of a tile with no Ultima V source drawn otherwise than toned (EGA colour: 0xRRGGBB), by tile: the force
 * field's sparks a bright cyan, so it reads apart from the water, whose blues the toning gives it too.
 */
const OWN_COLOURS: Record<number, Record<number, number>> = {
  32: { 1: 0x7fd8ff, 0: 0x1a2050 },
};

/** A tile with no Ultima V source: each colour toned; lifted off black unless it is terrain. */
function toned(tiles: Uint8Array, px: Uint8Array, lifted: boolean, own: Record<number, number> = {}): Uint32Array {
  const ground = lifted ? groundOf(tiles, px) : new Uint8Array(N * N);
  const out = new Uint32Array(CELL * CELL);
  for (let i = 0; i < N * N; i++) {
    if (ground[i]) continue;
    const c = own[px[i]] ?? TONED[px[i]];
    const v = (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
    const [x, y] = [(i % N) * HI, Math.floor(i / N) * HI];
    for (let r = 0; r < HI; r++) out.fill(v, (y + r) * CELL + x, (y + r) * CELL + x + HI);
  }
  return out;
}

/** A black line OUTLINE wide round what is drawn in a cell (RGBA in memory order), in its clear pixels. */
function outlined(cell: Uint32Array): Uint32Array {
  const out = cell.slice();
  const drawn = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < CELL && y < CELL && cell[y * CELL + x] >>> 24 >= 128;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      if (drawn(x, y)) continue;
      search: for (let dy = -OUTLINE; dy <= OUTLINE; dy++)
        for (let dx = -OUTLINE; dx <= OUTLINE; dx++)
          if (drawn(x + dx, y + dy)) {
            out[y * CELL + x] = 0xff000000;
            break search;
          }
    }
  return out;
}

/** `cell` laid over the grass already drawn in `sheet` (tile GRASS, whose index comes before every ON_GRASS one). */
function onGrass(sheet: Image, cell: Uint32Array): Uint32Array {
  const view = new Uint32Array(sheet.data.buffer, sheet.data.byteOffset, sheet.width * sheet.height);
  const [gc, gr] = cellOf(GRASS, 0);
  return cell.map((v, i) => (v >>> 24 >= 128 ? v : view[(gr * CELL + Math.floor(i / CELL)) * sheet.width + gc * CELL + (i % CELL)]));
}

function put(sheet: Image, col: number, row: number, cell: Uint32Array): void {
  const view = new Uint32Array(sheet.data.buffer, sheet.data.byteOffset, sheet.width * sheet.height);
  for (let y = 0; y < CELL; y++) view.set(cell.subarray(y * CELL, (y + 1) * CELL), (row * CELL + y) * sheet.width + col * CELL);
}

/** Cell (col, row) of `from` into `to`, at column `toCol` (the same column unless given). */
function copyCell(from: Image, to: Image, col: number, row: number, toCol = col): void {
  const scale = from.width / COLUMNS / CELL;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const s = ((row * CELL + y) * scale * from.width + (col * CELL + x) * scale) * 4;
      const d = ((row * CELL + y) * to.width + toCol * CELL + x) * 4;
      to.data.set(from.data.subarray(s, s + 4), d);
    }
}

const pcu5 = decodePng(readFileSync(join(graphics, 'PC Ultima V-Tiles.png')));
const standard = decodePng(readFileSync(join(graphics, 'Standard-Tiles.png')));
const out = newImage(COLUMNS * CELL, ROWS * CELL);

// Ultima V's packed tiles, holding what originals.ts reads besides the tile itself: the grounds a figure is lifted off
// (the brick floor and the grass, which PC Ultima V has as Ultima V drew them) and the wall its corners are cut from.
const tiles = new Uint8Array(512 * 128);
pack(tiles, 0x44, egaCell(pcu5, ...cellOf(8, 0)));
pack(tiles, 0x05, egaCell(pcu5, ...cellOf(1, 0)));
pack(tiles, 0x4f, egaCell(pcu5, ...cellOf(35, 0)));

for (let index = 0; index < (COLUMNS * ROWS) / 2; index++)
  for (const frame of [0, 1]) {
    const [col, row] = cellOf(index, frame);
    if (FROM_STANDARD.has(index)) {
      copyCell(standard, out, col - frame, row, col); // its first frame in both

      continue;
    }
    const px = egaCell(pcu5, col, row);
    if (px.every((c) => c === 0)) {
      // A tile with one frame: its second the same, as the game may show either.
      if (frame === 1) copyCell(out, out, col - 1, row, col);
      continue;
    }
    // The second frames of 32-35 are Exodus' light panels, terrain whatever their tile is.
    const panel = frame === 1 && index >= 32 && index <= 35;
    const terrain = TERRAIN.has(index) || panel;
    const source = SOURCES[`${index}.${frame}`];
    let cell: Uint32Array;
    if (source) {
      const [t, mirrored] = source;
      pack(tiles, t, mirrored ? mirror(px) : px);
      cell = original(tiles, t, 0, !terrain || ON_GRASS.has(index));
      if (mirrored) for (let y = 0; y < CELL; y++) cell.subarray(y * CELL, (y + 1) * CELL).reverse();
    } else cell = toned(tiles, px, !terrain || ON_GRASS.has(index), panel ? undefined : OWN_COLOURS[index]);
    if (ON_GRASS.has(index)) cell = onGrass(out, cell);
    put(out, col, row, terrain ? cell : outlined(cell));
  }

writeFileSync(join(graphics, 'Remastered-Tiles.png'), encodePng(out));
console.log('wrote public/graphics/Remastered-Tiles.png');

// The figures a character may take (game/appearance.ts FIGURES): their EGA colours, which ui/avatarRegions.ts reads to
// dress them, each the way round the Ultima V tile it was drawn from is.
const pixels: string[] = [];
for (const figure of FIGURES)
  for (const f of figure.frames) {
    const px = egaCell(pcu5, ...cellOf(f.tile, f.frame));
    // As prettier lays a long entry out, so the file written is the file kept.
    pixels.push(`  '${f.tile}.${f.frame}':\n    '${[...(f.mirrored ? mirror(px) : px)].map((c) => c.toString(16)).join('')}',`);
  }
writeFileSync(
  join(here, '..', 'src', 'ui', 'figurePixels.ts'),
  `/**
 * figurePixels.ts
 *
 * Written by tools/remastered.ts (npm run remastered): the EGA colours, sixteen by sixteen, a hex digit each, of the
 * figures a character may take in the Remastered tiles (game/appearance.ts FIGURES), by "tile.frame", each the way
 * round the Ultima V tile it was drawn from is. ui/figures.ts dresses them by these.
 */

export const FIGURE_PIXELS: Record<string, string> = {
${pixels.join('\n')}
};
`,
);
console.log('wrote src/ui/figurePixels.ts');

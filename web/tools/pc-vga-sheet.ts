/**
 * pc-vga-sheet.ts
 *
 * Rebuilds public/graphics/PC VGA-Tiles.png, the PC VGA tile set, in its real colours. LairWare's sheet (Lairware/
 * Resources/Graphics/PC VGA-Tiles.gif) holds eight colours only - every channel full on or off, a VGA palette's 0-63
 * levels taken as on or off - so its greens, browns and greys came out lime, yellow and white. The art is the Ultima
 * III Upgrade's VGA tile set (Voyager Dragon, The Exodus Project: https://ultima3.ultimacodex.com/ultima-3-upgrade/),
 * whose SHAPES.VGA (80 tiles of 16 x 16, a byte a pixel) and U3VGA.PAL (256 colours, 0-63 a channel) this reads:
 *
 *   node tools/pc-vga-sheet.ts <folder holding SHAPES.VGA and U3VGA.PAL>
 *
 * The sheet keeps the game's layout (tiles.ts: index i at column (i / 16) * 2, its second frame one column right,
 * row i % 16; 32 px a cell, the PC's 16 x 16 doubled):
 *
 * - 0-63, the Apple II's tiles: SHAPES.VGA's own, in the same order; the figures' second frames (16-30) are its tiles
 *   64-78, the whirlpool's its 79. Where it has no second frame and LairWare drew one, the first is drawn again (or
 *   mirrored, where LairWare's second frame is its first mirrored).
 * - 64-67, the party's shared figures (fighter, cleric, wizard, thief): its 20-23, with their second frames.
 * - What the PC never drew - the door (the letter I's second frame), Exodus's four light panels, the monster variants
 *   (80-95) - stays LairWare's drawing, its eight colours turned to the VGA colours they stand for, learnt from the
 *   tiles both sheets hold.
 *
 * A cell is see-through where LairWare's is (the sheet's alpha), and where SHAPES.VGA's colour 0 lies in a figure's.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, newImage, type Image } from './remastered/png.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(WEB, 'public', 'graphics', 'PC VGA-Tiles.png');
/** LairWare's sheet as the port had it (its alpha from the mask, the Devil's colours fixed): the layout, and the cells
 * the PC never drew. Read from here, so the tool can be run again. */
const LAIRWARE = join(WEB, 'art', 'pc-vga', 'LairWare-Tiles.png');
const source = process.argv[2];
if (!source) throw new Error('usage: node tools/pc-vga-sheet.ts <folder holding SHAPES.VGA and U3VGA.PAL>');

const shapes = readFileSync(join(source, 'SHAPES.VGA'));
const pal = readFileSync(join(source, 'U3VGA.PAL'));
if (shapes.length !== 80 * 256 || pal.length !== 768) throw new Error('not the Upgrade 3.3 SHAPES.VGA and U3VGA.PAL');
const old = decodePng(readFileSync(LAIRWARE));

const CELL = 32;
const ROWS = 16;
const rgb = (i: number): [number, number, number] =>
  [0, 1, 2].map((k) => Math.round((pal[i * 3 + k] * 255) / 63)) as [number, number, number];
const flat = (c: [number, number, number]): string => c.map((v) => (v >= 128 ? 1 : 0)).join('');
/** The cell of tile `index`, frame `frame`, in the sheet: its top left pixel. */
const at = (index: number, frame: number): [number, number] => [(Math.floor(index / ROWS) * 2 + frame) * CELL, (index % ROWS) * CELL];

/** A cell of `img` as 16 x 16 RGBA (the doubled sheet's every other pixel). */
function cellOf(img: Image, x0: number, y0: number): Uint8Array {
  const out = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      out.set(
        img.data.subarray(((y0 + y * 2) * img.width + x0 + x * 2) * 4, ((y0 + y * 2) * img.width + x0 + x * 2) * 4 + 4),
        (y * 16 + x) * 4,
      );
  return out;
}
/** Nothing drawn: every pixel black or see-through. */
const blank = (c: Uint8Array) => c.every((v, i) => i % 4 === 3 || v === 0 || c[i - (i % 4) + 3] === 0);
const mirror = (c: Uint8Array) => {
  const out = new Uint8Array(c.length);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) out.set(c.subarray((y * 16 + 15 - x) * 4, (y * 16 + 16 - x) * 4), (y * 16 + x) * 4);
  return out;
};
const same = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i]);

/** SHAPES.VGA tile `t`, mirrored or not, in 16 x 16 RGBA; `see` makes colour 0 see-through. */
function tile(t: number, mirrored: boolean, see: boolean): Uint8Array {
  const out = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const i = shapes[t * 256 + y * 16 + (mirrored ? 15 - x : x)];
      out.set([...rgb(i), see && i === 0 ? 0 : 255], (y * 16 + x) * 4);
    }
  return out;
}

const out = newImage(old.width, old.height);
const put = (c: Uint8Array, x0: number, y0: number) => {
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      out.data.set(c.subarray(((y >> 1) * 16 + (x >> 1)) * 4, ((y >> 1) * 16 + (x >> 1)) * 4 + 4), ((y0 + y) * out.width + x0 + x) * 4);
};

// What each of LairWare's eight colours stands for: the VGA colour that most often comes out as it when its channels
// are taken as on or off, over every pixel of SHAPES.VGA.
const votes = new Map<string, Map<string, number>>();
for (const i of shapes) {
  const c = rgb(i);
  const key = flat(c);
  const m = votes.get(key) ?? new Map<string, number>();
  m.set(c.join(','), (m.get(c.join(',')) ?? 0) + 1);
  votes.set(key, m);
}
const done = new Set<string>();

/** SHAPES.VGA tile `t` into the cell of index `index`, frame `frame`, see-through where LairWare's cell is. */
function place(index: number, frame: number, t: number, mirrored = false) {
  const [x0, y0] = at(index, frame);
  const was = cellOf(old, x0, y0);
  const see = was.some((v, i) => i % 4 === 3 && v === 0);
  const now = tile(t, mirrored, see);
  put(now, x0, y0);
  done.add(`${index}:${frame}`);
}

for (let i = 0; i < 64; i++) {
  if (i === 31) continue; // Exodus: blank in every sheet; its panels are the second frames of 32-35
  place(i, 0, i);
  const [x0, y0] = at(i, 1);
  const second = cellOf(old, x0, y0);
  if (i >= 16 && i <= 30) place(i, 1, i + 48);
  else if (i === 12) place(i, 1, 79);
  else if ((i >= 32 && i <= 35) || i === 46)
    continue; // Exodus's panels; the door
  else if (!blank(second)) place(i, 1, i, same(second, mirror(cellOf(old, ...at(i, 0)))));
}
for (let k = 0; k < 4; k++) {
  place(64 + k, 0, 20 + k);
  place(64 + k, 1, 68 + k);
}

// The monster variants (80-95, tiles.ts monsterVariantShape: two for each of thief, orc, skeleton, giant, daemon,
// pincher, dragon and balron), which the PC never had: its monster recoloured, its hue turned a third of the way round
// one way for the first variant and the other for the second, as the other sets' variants are recolours.
function turned(c: Uint8Array, degrees: number): Uint8Array {
  const out = new Uint8Array(c);
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  // Rotation about the grey axis (the usual hue-rotate matrix), so greys and black stay as they are.
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
  for (let p = 0; p < c.length; p += 4) {
    const [r, g, b] = [c[p], c[p + 1], c[p + 2]];
    for (let k = 0; k < 3; k++) out[p + k] = Math.max(0, Math.min(255, Math.round(m[k * 3] * r + m[k * 3 + 1] * g + m[k * 3 + 2] * b)));
  }
  return out;
}
for (let index = 80; index < 96; index++) {
  const base = 23 + ((index - 80) >> 1);
  const degrees = (index - 80) % 2 === 0 ? 120 : -120;
  for (let frame = 0; frame < 2; frame++) {
    const [x0, y0] = at(index, frame);
    put(turned(tile(frame ? base + 48 : base, false, true), degrees), x0, y0);
    done.add(`${index}:${frame}`);
  }
}

// The rest, LairWare's drawings in those colours.
const learnt = new Map<string, [number, number, number]>([['000', [0, 0, 0]]]);
for (const [key, m] of votes) {
  if (key === '000') continue;
  const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  learnt.set(key, best.split(',').map(Number) as [number, number, number]);
}
for (let index = 0; index < 96; index++)
  for (let frame = 0; frame < 2; frame++) {
    if (done.has(`${index}:${frame}`)) continue;
    const [x0, y0] = at(index, frame);
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const o = ((y0 + y) * old.width + x0 + x) * 4;
        const a = old.data[o + 3];
        const c = learnt.get(flat([old.data[o], old.data[o + 1], old.data[o + 2]])) ?? [old.data[o], old.data[o + 1], old.data[o + 2]];
        out.data.set(a === 0 ? [0, 0, 0, 0] : [...c, a], o);
      }
  }

writeFileSync(SHEET, encodePng(out));
console.log(`wrote ${SHEET}`);
for (const [key, c] of learnt) console.log(`  ${key} -> rgb(${c.join(',')})`);

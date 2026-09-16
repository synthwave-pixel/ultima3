/**
 * compose-figures.ts
 *
 * Writes the flat 32 px figure art in art/figures/ into the Standard tile
 * sheet (public/graphics/Standard-Tiles.png), doubled to its 64 px cells with
 * nearest-neighbour scaling. Run after either atlas changes:
 *
 *   npm run figures
 *
 *   art/figures/classes.png  + classes.json   the eleven class figures, two frames each
 *   art/figures/figures.png  + figures.json   monsters, townspeople, vehicles and objects
 *
 * The class figures go to cells 68-78 in career-table order (see
 * game/classFigures.ts) and also replace the old shared party tiles 20-23
 * and 63. The other rows go to the cell their atlas entry names; a
 * single-frame row fills both frame cells unless its second cell holds an
 * Exodus panel (tiles 32-35), and the Exodus row's four states go down the
 * panel column. See docs/figure-art-spec.md for the brief the art follows.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(root, 'public/graphics/Standard-Tiles.png');
const ART = join(root, 'art/figures');
const CELL = 64; // Standard's cell size
const TILE_ROWS = 16;
const EXODUS_PANEL_COLUMN = 5;
/** Career-table order (Fighter, Cleric, Wizard, Thief, Paladin, Barbarian, Lark, Illusionist, Druid, Alchemist, Ranger) to atlas row name. */
const CAREERS = ['fighter', 'cleric', 'wizard', 'thief', 'paladin', 'barbarian', 'lark', 'illusionist', 'druid', 'alchemist', 'ranger'];
const FIRST_CLASS_TILE = 68;
/** The old shared party tiles the class figures also replace. */
const OLD_PARTY: Record<string, number> = { fighter: 20, cleric: 21, wizard: 22, thief: 23, ranger: 63 };

// --- a small PNG codec: 8-bit, colour types 0/2/3/4/6, non-interlaced ---
interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface ClassAtlas {
  classes: { name: string; frames: Rect[] }[];
}
interface FigureAtlas {
  rows: { tile: number; name: string; frames: Rect[] }[];
}

function decodePng(buf: Buffer): Rgba {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  const idat = [];
  let w = 0,
    h = 0,
    colour = 0,
    depth = 0,
    interlace = 0,
    plte = null,
    trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG: depth ${depth}, interlace ${interlace}`);
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour];
  if (!channels) throw new Error(`unsupported PNG colour type ${colour}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0,
        b = prev[i],
        c = i >= channels ? prev[i - channels] : 0;
      if (f === 1) line[i] += a;
      else if (f === 2) line[i] += b;
      else if (f === 3) line[i] += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        line[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4,
        i = x * channels;
      if (colour === 6) out.set(line.subarray(i, i + 4), o);
      else if (colour === 2) {
        out.set(line.subarray(i, i + 3), o);
        out[o + 3] = trns && line[i] === trns[1] && line[i + 1] === trns[3] && line[i + 2] === trns[5] ? 0 : 255;
      } else if (colour === 3) {
        const k = line[i];
        if (!plte) throw new Error('indexed PNG without a palette');
        out.set(plte.subarray(k * 3, k * 3 + 3), o);
        out[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else if (colour === 0) {
        out[o] = out[o + 1] = out[o + 2] = line[i];
        out[o + 3] = trns && line[i] === trns[1] ? 0 : 255;
      } else {
        out[o] = out[o + 1] = out[o + 2] = line[i];
        out[o + 3] = line[i + 1];
      }
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}
function encodePng({ width, height, data }: Rgba): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- composition ---
const sheet = decodePng(readFileSync(SHEET));
if (sheet.width !== 12 * CELL) throw new Error(`sheet is ${sheet.width} wide, expected ${12 * CELL}`);
/** Copy one 32 px cell (half of CELL) of `src` at (sx, sy) into the sheet at cell (col, row), doubled. */
function blit(src: Rgba, sx: number, sy: number, col: number, row: number): void {
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const i = ((sy + (y >> 1)) * src.width + sx + (x >> 1)) * 4,
        o = ((row * CELL + y) * sheet.width + col * CELL + x) * 4;
      sheet.data.set(src.data.subarray(i, i + 4), o);
    }
}
const cellOf = (tile: number, frame: number) => ({ col: Math.floor(tile / TILE_ROWS) * 2 + frame, row: tile % TILE_ROWS });
let written = 0;
/** Cells that get the rim (every figure cell written here, plus the balls). */
const haloCells = new Set<string>();
const place = (src: Rgba, rect: Rect, tile: number, frame: number) => {
  const { col, row } = cellOf(tile, frame);
  blit(src, rect.x, rect.y, col, row);
  haloCells.add(`${col},${row}`);
  written++;
};

// Class figures: cells 68-78 in career order, plus the old party tiles.
const classes = decodePng(readFileSync(join(ART, 'classes.png')));
const classAtlas = JSON.parse(readFileSync(join(ART, 'classes.json'), 'utf8')) as ClassAtlas;
CAREERS.forEach((name, career) => {
  const entry = classAtlas.classes.find((c) => c.name === name);
  if (!entry) throw new Error(`classes.json has no ${name}`);
  entry.frames.forEach((rect, frame) => {
    place(classes, rect, FIRST_CLASS_TILE + career, frame);
    if (name in OLD_PARTY) place(classes, rect, OLD_PARTY[name], frame);
  });
});

// Monsters, people, vehicles and objects.
const figures = decodePng(readFileSync(join(ART, 'figures.png')));
const atlas = JSON.parse(readFileSync(join(ART, 'figures.json'), 'utf8')) as FigureAtlas;
for (const row of atlas.rows) {
  if (row.name === 'exodus') {
    // Four states, delivered in state order 3, 2, 1, 0; the panel column holds state n in row n.
    row.frames.forEach((rect, i) => {
      blit(figures, rect.x, rect.y, EXODUS_PANEL_COLUMN, 3 - i);
      written++;
    });
    continue;
  }
  const frames = row.frames.length === 1 && !(row.tile >= 32 && row.tile <= 35) ? [row.frames[0], row.frames[0]] : row.frames;
  frames.forEach((rect, frame) => place(figures, rect, row.tile, frame));
}
/**
 * The rim: one sheet pixel of 50% black around every figure, so it stands
 * off water, stone and lava (it vanishes into Standard's near-black grass).
 * A transparent pixel with any of its eight neighbours opaque is painted;
 * rim pixels themselves (alpha 128) count as neither, so a rerun is the
 * same as one run. --no-halo leaves the art as drawn.
 */
const HALO = !process.argv.includes('--no-halo');
function halo(col: number, row: number): void {
  const alpha = (x: number, y: number) => sheet.data[((row * CELL + y) * sheet.width + col * CELL + x) * 4 + 3];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < CELL && y < CELL && alpha(x, y) >= 200;
  const paint: number[] = [];
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      if (alpha(x, y) !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && opaque(x + dx, y + dy)) near = true;
      if (near) paint.push(((row * CELL + y) * sheet.width + col * CELL + x) * 4);
    }
  for (const o of paint) sheet.data.set([0, 0, 0, 128], o);
}
if (HALO) {
  for (const ball of [60, 61]) for (const frame of [0, 1]) haloCells.add(`${cellOf(ball, frame).col},${cellOf(ball, frame).row}`);
  for (const key of haloCells) {
    const [col, row] = key.split(',').map(Number);
    if (col === EXODUS_PANEL_COLUMN && row < 4) continue; // the machine's panels fill their cells
    halo(col, row);
  }
  console.log(`rimmed ${haloCells.size} cells`);
}
writeFileSync(SHEET, encodePng(sheet));
console.log(`wrote ${written} cells into ${SHEET}`);

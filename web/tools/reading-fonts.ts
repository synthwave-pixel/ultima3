/**
 * reading-fonts.ts
 *
 * Bakes the lettering the Font setting (Visuals) offers for reading, as the Ultima V port does (issue #28):
 *
 *   public/fonts/Legible.png   Atkinson Hyperlegible Mono, the Braille Institute's, in its ExtraBold (800)
 *   public/fonts/Dyslexic.png  OpenDyslexic Mono, Abbie Gonzalez's
 *
 * from art/fonts/ (their licences beside them). Each is a font sheet as the tile sets' are (graphics.ts): white on
 * black, 96 glyphs from the space in one row, here 64 px square so the letters stay smooth on a large screen. A face is
 * set as large as its tallest letter and its deepest tail let it in the cell, just clear of its edges, and each
 * glyph centred across it: the faces are monospaced, narrower than the cell, so a line of them reads evenly spaced.
 * Only the letters, the figures and the punctuation are the face's (LETTERED, graphics.ts); the other glyphs, which some
 * sets draw as symbols of their own, stay the tile set's.
 *
 * Run in web/ after changing this:
 *
 *   npm run reading-fonts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(WEB, 'public', 'fonts');

export const GLYPHS = 96;
export const CELL = 64;
/** Clear space kept above the tallest letter and below the deepest tail, px. */
const MARGIN = 2;

interface Face {
  name: string;
  file: string;
  family: string;
  weight: number;
  /** The strokes thickened by an outline this share of the size: resvg sets a variable font in its default weight. */
  bold: number;
}

export const FACES: Face[] = [
  { name: 'Legible', file: 'AtkinsonHyperlegibleMono.ttf', family: 'Atkinson Hyperlegible Mono', weight: 800, bold: 0.06 },
  { name: 'Dyslexic', file: 'OpenDyslexicMono-Regular.otf', family: 'OpenDyslexicMono', weight: 400, bold: 0.035 },
];

const svg = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;

const escape = (ch: string): string => `&#${ch.charCodeAt(0)};`;

/** A text element in `face` at `size`, its strokes thickened (Face.bold). */
const text = (face: Face, size: number, attrs: string, content: string): string =>
  `<text ${attrs} font-size="${size}" font-weight="${face.weight}" fill="#fff" stroke="#fff" stroke-width="${(face.bold * size).toFixed(2)}" stroke-linejoin="round">${content}</text>`;

/** The face's text drawn white on black: its RGBA pixels. */
function draw(face: Face, width: number, height: number, body: string): Uint8Array {
  const opts = {
    font: { fontFiles: [join(WEB, 'art', 'fonts', face.file)], loadSystemFonts: false, defaultFontFamily: face.family },
    background: '#000',
  };
  return new Resvg(svg(width, height, body), opts).render().pixels;
}

/** The rows with ink of `text` set at `size` on a baseline at `size` in a canvas twice as tall: [top, bottom]. */
function inkRows(face: Face, content: string, size: number): [number, number] {
  const w = Math.ceil(size * content.length);
  const h = size * 2;
  const px = draw(face, w, h, text(face, size, `x="${size * 0.1}" y="${size}"`, content));
  let top = h;
  let bottom = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4] > 60) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  return [top - size, bottom - size];
}

/** The sheet of `face`, as a PNG. */
export function bakeReadingSheet(face: Face): Buffer {
  // How far the face reaches above and below its baseline, at 100 px: its capitals and ascenders, and its tails.
  const probe = 100;
  // The capitals and ascenders' top and the tails' foot: brackets and bars, which reach further, may touch the edge.
  const [top, bottom] = inkRows(face, 'Hdlbgpqy', probe);
  const size = Math.floor(((CELL - 2 * MARGIN) / (bottom - top + 1)) * probe);
  const baseline = Math.round(MARGIN - (top * size) / probe);
  const width = GLYPHS * CELL;
  const letters: string[] = [];
  for (let g = 1; g < GLYPHS; g++)
    letters.push(
      text(face, size, `x="${g * CELL + CELL / 2}" y="${baseline}" text-anchor="middle"`, escape(String.fromCharCode(g + 0x20))),
    );
  const body = `<rect width="${width}" height="${CELL}" fill="#000"/>${letters.join('')}`;
  const opts = {
    font: { fontFiles: [join(WEB, 'art', 'fonts', face.file)], loadSystemFonts: false, defaultFontFamily: face.family },
    background: '#000',
  };
  return Buffer.from(new Resvg(svg(width, CELL, body), opts).render().asPng());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  for (const face of FACES) {
    const file = join(OUT, `${face.name}.png`);
    writeFileSync(file, bakeReadingSheet(face));
    console.log(`wrote ${file}`);
  }
}

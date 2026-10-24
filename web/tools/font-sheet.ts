/**
 * font-sheet.ts
 *
 * Bakes public/graphics/Standard-Font.png, the Standard tile set's letters, which PC VGA and PC Ultima V borrow:
 * Sixtyfour (art/fonts/, after the Commodore 64's letters, under the SIL Open Font License), the face the Ultima V port
 * letters its own Standard look in.
 *
 * Sixtyfour is drawn on a grid of 8 x 8 dots, its capitals on the top seven rows and the tails of g, j, p, q and y on
 * the eighth. In the game's 32 px cell a dot is 4 px square, but the sheet sets the dots 2 px lower than the face
 * has them, and the tails' row 2 px tall: the capitals then stand where the old font's did, 2 px clear of a border or a
 * highlight bar above them, and no tail is cut off. Every edge falls on a whole pixel, so the letters stay sharp however
 * far the screen is scaled.
 *
 * The '*' stays the old font's diamond, the one place it shows being a fight's ****VICTORY!**** banner. It is read
 * from Lairware-Font.gif, the old font, which Lairware and Macintosh B&W keep.
 *
 * White on black, 96 glyphs from the space in one row, as every tile set's font sheet is (graphics.ts). Run in web/
 * after changing this, and npm run graphics-index if the file is new:
 *
 *   node tools/font-sheet.ts
 *
 * A test bakes it again and checks the file against it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const FACE = join(WEB, 'art', 'fonts', 'Sixtyfour.ttf');
/** The old font: 96 glyphs of 16 px. */
export const OLD_SHEET = join(WEB, 'public', 'graphics', 'Lairware-Font.gif');
export const SHEET = join(WEB, 'public', 'graphics', 'Standard-Font.png');

export const GLYPHS = 96;
export const CELL = 32;
const OLD_CELL = 16;
/** A dot of the face's grid, in the cell's pixels. */
const DOT = CELL / 8;
/** How far below the face's own place the dots are set; the tails' row, the eighth, is as tall. */
const DROP = 2;
/** The old font's glyphs, kept. */
const KEPT = ['*'];

const svg = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;

/** RGBA pixels of an SVG, drawn on black with Sixtyfour its only font. */
function draw(source: string): Uint8Array {
  const opts = { font: { fontFiles: [FACE], loadSystemFonts: false, defaultFontFamily: 'Sixtyfour' }, background: '#000' };
  return new Resvg(source, opts).render().pixels;
}

/** The pixels of a PNG or GIF `width` x `height`, read through the renderer. */
export function decode(image: Buffer, type: 'png' | 'gif', width: number, height: number): Uint8Array {
  const href = `data:image/${type};base64,${image.toString('base64')}`;
  return draw(svg(width, height, `<image width="${width}" height="${height}" href="${href}" image-rendering="optimizeSpeed"/>`));
}

/** The sheet, as a PNG. */
export function bakeFontSheet(): Buffer {
  const width = GLYPHS * CELL;
  // The face, each glyph at 32 px (4 px a dot) in its own cell, on its baseline seven dots down.
  const letters: string[] = [];
  for (let g = 1; g < GLYPHS; g++)
    letters.push(`<text x="${g * CELL}" y="${7 * DOT}" font-size="${CELL}" fill="#fff">&#${g + 0x20};</text>`);
  const face = draw(svg(width, CELL, letters.join('')));
  const lit = (x: number, y: number): boolean => face[(y * width + x) * 4] > 127;
  const old = decode(readFileSync(OLD_SHEET), 'gif', GLYPHS * OLD_CELL, OLD_CELL);
  const oldLit = (x: number, y: number): boolean => old[(y * GLYPHS * OLD_CELL + x) * 4] > 127;

  const rects: string[] = [];
  const rect = (x: number, y: number, w: number, h: number) => rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  for (let g = 1; g < GLYPHS; g++) {
    const left = g * CELL;
    if (KEPT.includes(String.fromCharCode(g + 0x20))) {
      // The old glyph, each of its pixels two of the cell's.
      for (let y = 0; y < OLD_CELL; y++)
        for (let x = 0; x < OLD_CELL; x++) if (oldLit(g * OLD_CELL + x, y)) rect(left + 2 * x, 2 * y, 2, 2);
      continue;
    }
    // Each dot read at its centre, so the face's smoothed edges never count.
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++)
        if (lit(left + col * DOT + DOT / 2, row * DOT + DOT / 2)) rect(left + col * DOT, DROP + row * DOT, DOT, row < 7 ? DOT : DROP);
  }
  const body = `<rect width="${width}" height="${CELL}" fill="#000"/><g fill="#fff" shape-rendering="crispEdges">${rects.join('')}</g>`;
  return Buffer.from(new Resvg(svg(width, CELL, body)).render().asPng());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(SHEET, bakeFontSheet());
  console.log(`wrote ${SHEET}`);
}

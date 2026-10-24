import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bakeFontSheet, decode, CELL, GLYPHS, OLD_SHEET, SHEET } from '../tools/font-sheet.ts';

const WIDTH = GLYPHS * CELL;
const sheet = decode(readFileSync(SHEET), 'png', WIDTH, CELL);
const old = decode(readFileSync(OLD_SHEET), 'gif', GLYPHS * 16, 16);
const index = (ch: string) => ch.charCodeAt(0) - 0x20;
const lit = (ch: string, x: number, y: number) => sheet[(y * WIDTH + index(ch) * CELL + x) * 4] > 127;
/** The first and last rows of the cell a glyph inks. */
const rows = (ch: string): [number, number] => {
  const inked = [...Array(CELL).keys()].filter((y) => [...Array(CELL).keys()].some((x) => lit(ch, x, y)));
  return [inked[0], inked[inked.length - 1]];
};

describe("the Standard tile set's letters (Standard-Font.png, tools/font-sheet.ts)", () => {
  it('is what the tool bakes from Sixtyfour (run node tools/font-sheet.ts after changing it)', () => {
    expect(decode(bakeFontSheet(), 'png', WIDTH, CELL)).toEqual(sheet);
  });

  it('stands the capitals 2 px clear of the cell above, as the old font did, and keeps the tails', () => {
    for (const ch of 'HMTW0(!') expect(rows(ch)).toEqual([2, 29]);
    for (const ch of 'gjpqy,') expect(rows(ch)[1]).toBe(31); // the tails' row, 2 px tall
    expect(rows('_')).toEqual([30, 31]);
    expect(rows('a')).toEqual([10, 29]);
  });

  it("keeps the old font's diamond for '*', a fight's ****VICTORY!****", () => {
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) expect(lit('*', x, y)).toBe(old[((y >> 1) * GLYPHS * 16 + index('*') * 16 + (x >> 1)) * 4] > 127);
  });

  it('leaves the old font to the Mac looks, Lairware and Macintosh B&W', () => {
    const lairware = readFileSync(OLD_SHEET);
    expect(readFileSync(new URL('../public/graphics/Macintosh BW-Font.gif', import.meta.url))).toEqual(lairware);
    expect(rows('H')).not.toEqual([0, 27]); // and Standard has the new one, nudged down
  });
});

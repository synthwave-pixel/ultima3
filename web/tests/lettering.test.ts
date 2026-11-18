import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bakeReadingSheet, CELL, FACES, GLYPHS } from '../tools/reading-fonts.ts';
import { decode } from '../tools/font-sheet.ts';
import { FONT_CHOICES, FONT_LABELS, LETTERED, nextFont, validFont } from '../src/ui/lettering.ts';

describe('the Font setting (#28)', () => {
  it('steps through every font and back to the look', () => {
    const seen = [FONT_CHOICES[0]];
    for (let i = 1; i < FONT_CHOICES.length; i++) seen.push(nextFont(seen[i - 1]));
    expect(seen).toEqual(FONT_CHOICES);
    expect(nextFont(seen[seen.length - 1])).toBe('look');
    for (const font of FONT_CHOICES) expect(`Font: ${FONT_LABELS[font]}`.length).toBeLessThanOrEqual(18);
  });

  it('keeps a font saved, and takes anything else for the look', () => {
    expect(validFont('dyslexic')).toBe('dyslexic');
    expect(validFont('Comic Sans')).toBe('look');
    expect(validFont(undefined)).toBe('look');
  });

  it("letters the letters, figures and punctuation, and leaves the sets' symbols theirs", () => {
    for (const ch of 'AZaz09!?.,:;\'"()-/<>#') expect(LETTERED.test(ch), ch).toBe(true);
    for (const ch of '*@[\\]^_`{|}~ ') expect(LETTERED.test(ch), ch).toBe(false);
  });

  for (const face of FACES)
    it(`${face.name}.png is what tools/reading-fonts.ts bakes (npm run reading-fonts after changing it)`, () => {
      const file = join(import.meta.dirname, '..', 'public', 'fonts', `${face.name}.png`);
      const width = GLYPHS * CELL;
      expect(decode(bakeReadingSheet(face), 'png', width, CELL)).toEqual(decode(readFileSync(file), 'png', width, CELL));
    });
});

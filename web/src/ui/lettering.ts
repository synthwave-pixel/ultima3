/**
 * lettering.ts
 *
 * The Font setting (Visuals), after the Ultima V port's (issue #28): the letters of the menus, the log, the party
 * panel and every page set in a font of the player's choosing, whatever the look:
 *
 *   The look's  each tile set's own letters, as ever
 *   Sixtyfour   U3 2026's (Standard-Font.png), after the Commodore 64's
 *   Legible     Atkinson Hyperlegible Mono, the Braille Institute's, set for reading (tools/reading-fonts.ts)
 *   Dyslexic    OpenDyslexic Mono, Abbie Gonzalez's (tools/reading-fonts.ts)
 *   DOS         the PC's own 8x8 letters (PC EGA-Font.gif)
 *
 * Only the letters, the figures and the punctuation change (LETTERED); the other glyphs stay the look's, since the
 * Apple II sets draw arrows, blocks and bars there, and every set draws a fight's ****VICTORY!**** in its own '*'.
 */

export type FontChoice = 'look' | 'sixtyfour' | 'legible' | 'dyslexic' | 'dos';
export const FONT_CHOICES: FontChoice[] = ['look', 'sixtyfour', 'legible', 'dyslexic', 'dos'];
export const FONT_LABELS: Record<FontChoice, string> = {
  look: "The look's",
  sixtyfour: 'Sixtyfour',
  legible: 'Legible',
  dyslexic: 'Dyslexic',
  dos: 'DOS',
};

/** Where each font's sheet is, beside the page (a font sheet as graphics.ts reads one: 96 glyphs in a row). */
const SHEETS: Record<Exclude<FontChoice, 'look'>, string> = {
  sixtyfour: 'graphics/Standard-Font.png',
  legible: 'fonts/Legible.png',
  dyslexic: 'fonts/Dyslexic.png',
  dos: 'graphics/PC EGA-Font.gif',
};

/** Whether the font is a smooth face, to be scaled with smoothing (the others are pixel fonts). */
export const isSmoothFont = (font: FontChoice): boolean => font === 'legible' || font === 'dyslexic';

/** The glyphs a font chosen draws: the letters, the figures and the punctuation. */
export const LETTERED = /^[A-Za-z0-9!"#$%&'()+,\-./:;<=>?]$/;

/** The choice after `font`, round again (the Visuals line steps through them). */
export function nextFont(font: FontChoice): FontChoice {
  return FONT_CHOICES[(FONT_CHOICES.indexOf(font) + 1) % FONT_CHOICES.length];
}

/** `value` as a choice, or the look's. */
export function validFont(value: unknown): FontChoice {
  return FONT_CHOICES.includes(value as FontChoice) ? (value as FontChoice) : 'look';
}

const loaded = new Map<FontChoice, Promise<HTMLImageElement | null>>();

/** The sheet of the font `font`, loaded once; null for the look's own, or where it would not load. */
export function fontSheet(font: FontChoice): Promise<HTMLImageElement | null> {
  if (font === 'look') return Promise.resolve(null);
  let sheet = loaded.get(font);
  if (!sheet) {
    sheet = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = encodeURI(SHEETS[font]); // beside the page, as the tile sets' sheets are
    });
    loaded.set(font, sheet);
  }
  return sheet;
}

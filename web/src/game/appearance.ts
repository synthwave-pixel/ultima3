/**
 * appearance.ts
 *
 * A character's look in the Remastered tiles (after the Ultima V port's appearance.ts, whose Avatar the player could
 * dress): one of five figures, whatever the class, and its skin, hair and clothes recoloured from presets. Appearance
 * only: the class stays what it is. Kept for each roster entry (World.looks), and drawn only with the Remastered
 * tiles (ui/figures.ts); every other set draws a character as its class, the look kept.
 */

export interface Appearance {
  /** Index into FIGURES. */
  figure: number;
  /** Index into SKIN. */
  skin: number;
  /** Index into HAIR. */
  hair: number;
  /** The main clothes' and the trim's colour: index into HUES (0 as drawn). */
  main: number;
  trim: number;
}

/**
 * The five figures: the Ultima V figures the PC Ultima V tiles hold (the Avatar, the knight, the mage, the bard and
 * the jester), each as that set's tile and two frames, and the Ultima V figure (its first frame) and frame (0 to 3)
 * each was drawn from, whose rules dress it (ui/avatarRegions.ts); `mirrored` where the tile is drawn the other way.
 */
export interface Figure {
  name: string;
  /** The Ultima V figure whose rules dress it: its first frame. */
  base: number;
  frames: { tile: number; frame: 0 | 1; source: number; mirrored?: boolean }[];
}

export const FIGURES: readonly Figure[] = [
  {
    name: 'Fighter',
    base: 0x14c,
    frames: [
      { tile: 63, frame: 0, source: 0x14c },
      { tile: 63, frame: 1, source: 0x14f },
    ],
  },
  {
    name: 'Knight',
    base: 0x148,
    frames: [
      { tile: 64, frame: 0, source: 0x148 },
      { tile: 64, frame: 1, source: 0x149 },
    ],
  },
  {
    name: 'Mage',
    base: 0x140,
    frames: [
      { tile: 66, frame: 0, source: 0x141 },
      { tile: 66, frame: 1, source: 0x142 },
    ],
  },
  {
    name: 'Bard',
    base: 0x144,
    frames: [
      { tile: 67, frame: 0, source: 0x146 },
      { tile: 67, frame: 1, source: 0x147 },
    ],
  },
  {
    name: 'Jester',
    base: 0x158,
    frames: [
      { tile: 17, frame: 0, source: 0x15a, mirrored: true },
      { tile: 17, frame: 1, source: 0x158, mirrored: true },
    ],
  },
];

/** Skin, lightest to darkest: each [light, mid, shade] (0xRRGGBB), for the step of the EGA colour it replaces. */
export const SKIN: readonly [number, number, number][] = [
  [0xe8c4a8, 0xd4a684, 0xa87a5c],
  [0xdcb08a, 0xc49470, 0x946848],
  [0xd0a070, 0xb8865a, 0x8a603c],
  [0xc89868, 0xb07c50, 0x825a36],
  [0xb07a4c, 0x98643a, 0x6e4526],
  [0x8e5a36, 0x784828, 0x54321a],
  [0x6a4228, 0x58341e, 0x3c2414],
  [0x4a2e1c, 0x3c2416, 0x28180e],
];

/** The people's skin: a light brown, common to many (every character's to begin with). */
export const PEOPLE_SKIN = 3;

/**
 * Hair, first as drawn ("default": the fighter's and the knight's helm, the bard's hat, the jester's hood, the mage's
 * own hair); any other colour dyes the hair and turns a helm, a hat or a hood into hair of that colour.
 */
export const HAIR: readonly { name: string; ramp: [number, number, number] | null }[] = [
  { name: 'Default', ramp: null },
  { name: 'Blonde', ramp: [0xe8d078, 0xc8a850, 0x8e7430] },
  { name: 'Brown', ramp: [0x9a6a3e, 0x7a5230, 0x54381e] },
  { name: 'Brunette', ramp: [0x6a4628, 0x50341c, 0x362212] },
  { name: 'Black', ramp: [0x4a4a52, 0x2e2e34, 0x1a1a1e] },
  { name: 'White', ramp: [0xf0ece0, 0xc8c4b8, 0x8e8a80] },
  { name: 'Auburn', ramp: [0xb0603a, 0x8e4a2a, 0x62321a] },
  { name: 'Green', ramp: [0x4e7a3e, 0x36582a, 0x223a1a] },
  { name: 'Purple', ramp: [0x7a4e8e, 0x5a3668, 0x3a2244] },
];

/** A colour for the clothes: a hue (degrees), as drawn (null), or one of no hue - white, grey or black. */
export type Hue = number | null | 'white' | 'grey' | 'black';

/** The clothes' colours: first as drawn, then the twelve hues, thirty degrees apart, then white, grey and black. */
export const HUES: readonly Hue[] = [null, ...Array.from({ length: 12 }, (_, i) => i * 30), 'white', 'grey', 'black'];

/** The hues' names, as the customiser shows them. */
export const HUE_NAMES: readonly string[] = [
  'As drawn',
  'Red',
  'Orange',
  'Yellow',
  'Lime',
  'Green',
  'Jade',
  'Cyan',
  'Azure',
  'Blue',
  'Violet',
  'Purple',
  'Rose',
  'White',
  'Grey',
  'Black',
];

/** The skins' names. */
export const SKIN_NAMES: readonly string[] = ['Fair', 'Light', 'Tan', 'Olive', 'Bronze', 'Brown', 'Dark', 'Deep'];

/** The step of a ramp (0 light, 1 mid, 2 shade) an EGA colour stands for, in skin and in hair. */
export const SKIN_STEP: Record<number, number> = { 14: 0, 12: 0, 15: 0, 6: 1, 7: 1, 4: 2, 8: 2 };
export const HAIR_STEP: Record<number, number> = { 15: 0, 14: 0, 7: 1, 6: 1, 8: 2, 4: 2 };

const RANGES: Record<keyof Appearance, number> = {
  figure: FIGURES.length,
  skin: SKIN.length,
  hair: HAIR.length,
  main: HUES.length,
  trim: HUES.length,
};

/** `x` as an appearance, or null where it is not a whole one within the ranges (a damaged save). */
export function validAppearance(x: unknown): Appearance | null {
  if (typeof x !== 'object' || x === null) return null;
  const a = x as Record<string, unknown>;
  for (const [k, n] of Object.entries(RANGES)) {
    const v = a[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) return null;
  }
  return { figure: a.figure, skin: a.skin, hair: a.hair, main: a.main, trim: a.trim } as Appearance;
}

/** A random appearance ("Surprise me"), by `random` (lo to hi inclusive). */
export function randomAppearance(random: (lo: number, hi: number) => number): Appearance {
  return {
    figure: random(0, FIGURES.length - 1),
    skin: random(0, SKIN.length - 1),
    hair: random(0, HAIR.length - 1),
    main: random(0, HUES.length - 1),
    trim: random(0, HUES.length - 1),
  };
}

/**
 * The look a character of class `classLetter` has until one is chosen: the figure nearest the class, as drawn - but
 * a cleric's and a druid's mage robed in red and in green, so the three magic users are told apart.
 */
export function defaultLook(classLetter: string): Appearance {
  const look = (figure: number, main = 0): Appearance => ({ figure, skin: PEOPLE_SKIN, hair: 0, main, trim: 0 });
  switch (classLetter) {
    case 'F':
    case 'P':
    case 'B':
      return look(1); // fighter, paladin, barbarian: the knight
    case 'R':
      return look(0); // ranger: the Avatar, who stands for the party on the surface in PC Ultima V
    case 'W':
    case 'I':
    case 'A':
      return look(2);
    case 'C':
      return look(2, 1); // red
    case 'D':
      return look(2, 5); // green
    case 'T':
      return look(3);
    case 'L':
      return look(4);
    default:
      return look(0);
  }
}

/** Whether a character of sex `sex` (the record's letter) is drawn without a beard: a mage's beard is a man's. */
export const beardless = (sex: string): boolean => sex !== 'M';

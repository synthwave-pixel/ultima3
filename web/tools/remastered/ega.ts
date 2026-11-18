/**
 * ega.ts
 *
 * What the Ultima V port's originals.ts (copied here, see README.md) took from the rest of that game: the EGA's
 * sixteen colours, the four-to-one enlargement, and the people's skin ramps (its game/appearance.ts).
 */

/** The 16 EGA colours as 0xRRGGBB. */
export const EGA_PALETTE = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa, 0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555,
  0xff55ff, 0xffff55, 0xffffff,
];

/** Sheet pixels to one EGA pixel. */
export const HI = 4;

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

/** The people's skin: a light brown, common to many. */
export const PEOPLE_SKIN = 3;

/** The step of a ramp (0 light, 1 mid, 2 shade) an EGA colour stands for, in skin. */
export const SKIN_STEP: Record<number, number> = { 14: 0, 12: 0, 15: 0, 6: 1, 7: 1, 4: 2, 8: 2 };

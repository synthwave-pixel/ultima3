/**
 * display.ts
 *
 * How each tile set's machine showed its picture, beyond what its sheets
 * hold: the one colour of a monochrome monitor, and whether its ground is
 * light. Whatever the game draws over the tiles in code, the first-person
 * dungeon and the combat marker, reads these so it matches the tiles
 * around it. Sets not named draw on a dark ground, in white. Scanlines are
 * no set's: they are a setting, laid over every set (scanlines.ts).
 */

export interface DisplayStyle {
  /** A monochrome monitor's colour: what the set draws in where the others draw white. */
  phosphor?: string;
  /** The ground is light (the Macintosh set's white), so an overlay is drawn dark rather than bright. */
  lightGround?: boolean;
}

export const DISPLAY_STYLES: Record<string, DisplayStyle> = {
  'Apple II Mono': { phosphor: '#8cf88c' },
  'Macintosh B&W': { lightGround: true },
};

/** The display style of a tile set; an empty one (dark ground, white) for a set not listed. */
export function displayOf(set: string): DisplayStyle {
  return DISPLAY_STYLES[set] ?? {};
}

/** A colour given as "#rrggbb", as [r, g, b]. */
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * The combat marker's colour, as [r, g, b], `elapsed` (0..1) into the
 * member's turn. White, or the monitor's phosphor colour, fading to half
 * as the turn runs out; on a light ground, black fading up to grey instead.
 */
export function markerColour(display: DisplayStyle, elapsed: number): [number, number, number] {
  const fade = 127 * Math.max(0, Math.min(1, elapsed));
  const level = (display.lightGround ? fade : 255 - fade) / 255;
  const base = display.phosphor ? hexRgb(display.phosphor) : ([255, 255, 255] as const);
  return [Math.round(base[0] * level), Math.round(base[1] * level), Math.round(base[2] * level)];
}

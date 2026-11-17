import { describe, it, expect } from 'vitest';
import {
  COAST_STYLES,
  NORTH,
  NORTH_EAST,
  NORTH_WEST,
  SOUTH_WEST,
  WEST,
  coastMask,
  coastPattern,
  coastPixels,
  surfAt,
} from '../src/ui/coast.ts';

const at = (pixels: (string | null)[], x: number, y: number) => pixels[y * 16 + x];
const surfIn = (pixels: (string | null)[], cells: [number, number][]) => cells.filter(([x, y]) => at(pixels, x, y) !== null).length;

describe('coastlines', () => {
  it('say which neighbours of a water square are land', () => {
    expect(coastMask(() => false)).toBe(0);
    expect(coastMask((dx, dy) => dx === 0 && dy === -1)).toBe(NORTH);
    expect(coastMask((dx, dy) => dx === -1 && dy === -1)).toBe(NORTH_WEST);
    expect(coastMask((dx, dy) => dx === -1 || dy === -1)).toBe(NORTH_WEST | NORTH | WEST | NORTH_EAST | SOUTH_WEST);
  });

  it('draw surf along the land and open water past three pixels', () => {
    for (const style of Object.values(COAST_STYLES)) {
      const north = coastPixels(NORTH, style, 0);
      const row = (y: number) => Array.from({ length: 16 }, (_, x): [number, number] => [x, y]);
      expect(surfIn(north, row(0))).toBeGreaterThan(10); // a fringe along the shore, speckled
      for (let y = 3; y < 16; y++) expect(surfIn(north, row(y))).toBe(0);
      expect(coastPixels(0, style, 0).every((p) => p === null)).toBe(true); // open sea: nothing
    }
  });

  it('turn a point of land round, from the corner only', () => {
    const style = COAST_STYLES.Standard;
    const corner = coastPixels(NORTH_WEST, style, 0);
    expect(at(corner, 0, 0)).not.toBeNull();
    expect(
      surfIn(corner, [
        [8, 0],
        [0, 8],
        [8, 8],
        [15, 15],
      ]),
    ).toBe(0);
    const bay = coastPixels(NORTH | WEST, style, 0);
    expect(
      surfIn(bay, [
        [15, 0],
        [0, 15],
      ]),
    ).toBe(2); // both shores, end to end
  });

  it('hold still, the same piece for the same place', () => {
    const style = COAST_STYLES.Nintendo;
    expect(coastPixels(NORTH, style, 2)).toEqual(coastPixels(NORTH, style, 2));
    expect(coastPixels(NORTH, style, 1)).not.toEqual(coastPixels(NORTH, style, 2)); // the patterns differ
    expect(coastPattern(-1, 0)).toBeGreaterThanOrEqual(0); // round the wrapping map's edge too
  });

  it('show the nearest band first, and the water past the last', () => {
    const style = COAST_STYLES.Nintendo;
    expect(surfAt(style, 0, 0.1)).toBe('#fcfcfc');
    expect(surfAt(style, 0, 0.9)).toBe('#3cbcfc');
    expect(surfAt(style, 2, 0.9)).toBeNull();
    expect(surfAt(style, 3, 0)).toBeNull();
  });
});

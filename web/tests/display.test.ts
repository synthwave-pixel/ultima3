import { describe, it, expect } from 'vitest';
import { DISPLAY_STYLES, displayOf, hexRgb, markerColour } from '../src/ui/display.ts';
import { SCANLINE_LEVEL, SCREEN_LINES, scanlineBands } from '../src/ui/scanlines.ts';
import { TILE_SETS } from '../src/ui/help.ts';

describe('display styles', () => {
  it('know one monochrome monitor and one light ground', () => {
    expect(hexRgb(DISPLAY_STYLES['Apple II Mono'].phosphor!)).toEqual([140, 248, 140]);
    expect(TILE_SETS.filter((s) => displayOf(s).phosphor)).toEqual(['Apple II Mono']);
    expect(TILE_SETS.filter((s) => displayOf(s).lightGround)).toEqual(['Macintosh B&W']);
    expect(displayOf('No such set')).toEqual({});
  });

  it('name only sets that are shipped', () => {
    for (const set of Object.keys(DISPLAY_STYLES)) expect(TILE_SETS, set).toContain(set);
  });
});

describe('the combat marker colour', () => {
  it('stays white fading to half on a plain dark set', () => {
    const plain = displayOf('PC VGA');
    expect(markerColour(plain, 0)).toEqual([255, 255, 255]);
    expect(markerColour(plain, 1)).toEqual([128, 128, 128]);
  });

  it("stays black fading up to grey on the Macintosh set's white ground", () => {
    const mac = displayOf('Macintosh B&W');
    expect(markerColour(mac, 0)).toEqual([0, 0, 0]);
    expect(markerColour(mac, 1)).toEqual([127, 127, 127]);
  });

  it('draws in green phosphor on Mono, fading to half as the turn runs out', () => {
    const mono = displayOf('Apple II Mono');
    expect(markerColour(mono, 0)).toEqual([140, 248, 140]);
    expect(markerColour(mono, 1)).toEqual([70, 124, 70]);
  });
});

describe('scanlines', () => {
  it('lay one band per Apple II line, evenly, the lower half of each', () => {
    for (const height of [576, 768, 956, 1080, 1440, 2160]) {
      const bands = scanlineBands(height);
      const pitch = Math.round(height / SCREEN_LINES);
      expect(bands.length, `${height}`).toBe(Math.ceil((height - (pitch - Math.floor(pitch / 2))) / pitch));
      expect(Math.abs(bands.length - SCREEN_LINES), `${height}`).toBeLessThan(SCREEN_LINES * 0.1);
      bands.forEach(([top, rows], i) => {
        expect(top, `${height}`).toBe(i * pitch + pitch - Math.floor(pitch / 2)); // whole pixels, the same pitch all the way down
        expect(rows).toBe(Math.min(Math.floor(pitch / 2), height - top));
        expect(top + rows).toBeLessThanOrEqual(height);
      });
    }
  });

  it('leave a picture too small for a line and its gap alone', () => {
    expect(scanlineBands(200)).toEqual([]); // about one pixel a line
    expect(scanlineBands(0)).toEqual([]);
    expect(scanlineBands(384).length).toBe(SCREEN_LINES); // two pixels a line: one dark, one lit
  });

  it('darken by a medium amount', () => {
    expect(SCANLINE_LEVEL).toBeGreaterThan(0.5);
    expect(SCANLINE_LEVEL).toBeLessThan(0.8);
  });
});

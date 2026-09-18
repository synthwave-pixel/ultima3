import { describe, it, expect } from 'vitest';
import { DUNGEON_STYLES } from '../src/ui/dungeonArt.ts';
import { MOON_STYLES, moonPixel } from '../src/ui/moonArt.ts';
import { TILE_SETS } from '../src/ui/help.ts';
import { sheetRegions, DUNGEON_SHEET_WIDTH, DUNGEON_SHEET_HEIGHT } from '../src/ui/dungeonView.ts';

describe('dungeon art styles', () => {
  it('covers every tile set but Lairware, which keeps the photographic sheet', () => {
    for (const set of TILE_SETS) {
      if (set === 'Lairware') expect(DUNGEON_STYLES[set]).toBeUndefined();
      else expect(DUNGEON_STYLES[set], set).toBeDefined();
    }
    expect(DUNGEON_STYLES.Standard).toBe(DUNGEON_STYLES['PC VGA']);
  });

  it('gives wireframe styles a visible doorway, since a black door would vanish on a black wall', () => {
    for (const [name, style] of Object.entries(DUNGEON_STYLES)) {
      if (style.kind === 'wire' && style.bg === '#000') expect(style.doorLine, name).toBeDefined();
      if (style.kind === 'brick') expect(style.face, name).toBeDefined();
    }
  });

  it('gives the Apple II sets the scanlines their tiles have, and no one else', () => {
    // Measured from the tiles as drawn: Mono dims two rows in four to half, the colour sets one row in four to 80%.
    expect(DUNGEON_STYLES['Apple II Mono'].scanlines).toEqual([1, 1, 0.5, 0.5]);
    expect(DUNGEON_STYLES['Apple II Color'].scanlines).toEqual([1, 1, 1, 0.8]);
    expect(DUNGEON_STYLES['Apple II Color TV'].scanlines).toEqual([1, 1, 1, 0.8]);
    for (const [name, style] of Object.entries(DUNGEON_STYLES)) {
      if (!name.startsWith('Apple II')) expect(style.scanlines, name).toBeUndefined();
    }
  });

  it("lines scanlines up with the tiles: a whole number of groups per tile, and per row of the view's offset", () => {
    // Tiles are 64 screen rows tall and start at row 32; the view is drawn at row 128. A group that divides both
    // keeps the view's dimmed rows on the tiles' dimmed rows.
    for (const [name, style] of Object.entries(DUNGEON_STYLES)) {
      if (!style.scanlines) continue;
      expect(64 % style.scanlines.length, name).toBe(0);
      expect((128 - 32) % style.scanlines.length, name).toBe(0);
      for (const level of style.scanlines) expect(level, name).toBeGreaterThan(0);
    }
  });

  it('draws the monochrome dungeon in the same green phosphor as its tiles', () => {
    const mono = DUNGEON_STYLES['Apple II Mono'];
    expect(mono.line).toBe('#8cf88c');
    expect(mono.wood).toBe('#8cf88c');
    expect(mono.doorLine).toBe('#8cf88c');
    expect(MOON_STYLES['Apple II Mono'].trammel).toBe('#8cf88c'); // the moons already use it
  });

  it('describes a sheet whose pieces all lie inside it', () => {
    for (const r of sheetRegions()) {
      expect(r.sx, r.name).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.w, r.name).toBeLessThanOrEqual(DUNGEON_SHEET_WIDTH);
      expect(r.sy + r.h, r.name).toBeLessThanOrEqual(DUNGEON_SHEET_HEIGHT);
    }
  });
});

describe('painted moons', () => {
  it('cover Standard and the 8-bit and 16-colour sets and leave the rest to their sheets', () => {
    for (const set of ['Standard', 'Commodore 64', 'Apple II Color', 'Apple II Color TV', 'Apple II Mono', 'PC CGA', 'PC EGA'])
      expect(MOON_STYLES[set], set).toBeDefined();
    expect(MOON_STYLES.Standard).toEqual(MOON_STYLES['PC EGA']);
    for (const set of ['Lairware', 'PC VGA', 'PC MCGA', 'PC Ultima V', 'Nintendo', 'Macintosh B&W'])
      expect(MOON_STYLES[set], set).toBeUndefined();
  });

  it('draws a dark new moon, a bright full moon, and crescents that grow on the left then shrink on the right', () => {
    const lit = (phase: number) => {
      let n = 0;
      let left = 0;
      let right = 0;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const on = moonPixel(phase, x, y);
          if (on) {
            n++;
            if (x < 8) left++;
            else right++;
          }
        }
      return { n, left, right };
    };
    expect(lit(0).n).toBe(0);
    expect(lit(4).n).toBeGreaterThan(120);
    expect(lit(1).n).toBeLessThan(lit(2).n);
    expect(lit(2).n).toBeLessThan(lit(3).n);
    expect(lit(3).n).toBeLessThan(lit(4).n);
    expect(lit(2).right).toBe(0); // a waxing half moon is lit on the left only
    expect(lit(6).left).toBe(0); // a waning half moon on the right only
    expect(lit(1).n).toBe(lit(7).n); // the two crescents mirror
  });
});

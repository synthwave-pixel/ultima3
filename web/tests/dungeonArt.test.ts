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

import { describe, expect, it } from 'vitest';
import { helpPages, PAGE_ROWS, PAGE_WIDTH } from '../src/ui/help.ts';

/** Every mode and every kind of tile set: the last page is written for the set in use. */
const ALL = (['keyboard', 'controller'] as const).flatMap((mode) =>
  ['Standard', 'PC VGA'].map((tiles) => ({ what: `${mode}, ${tiles}`, pages: helpPages(mode, tiles) })),
);

/**
 * The page box cuts whatever does not fit, without a word about it: a page
 * grown past PAGE_ROWS silently loses its last lines (the keyboard
 * stand-ins went that way once), and a line past PAGE_WIDTH loses its end.
 */
describe('the help pages', () => {
  for (const { what, pages } of ALL) {
    it(`fit the box in ${what}`, () => {
      for (const page of pages) {
        expect(`${page.title}: ${page.lines.length} lines`).toBe(`${page.title}: ${Math.min(page.lines.length, PAGE_ROWS)} lines`);
        for (const line of page.lines) expect(`${page.title}: ${line}`.length).toBeLessThanOrEqual(`${page.title}: `.length + PAGE_WIDTH);
        expect(page.title.length).toBeLessThanOrEqual(PAGE_WIDTH);
      }
    });
  }

  it('number their pages by how many there are', () => {
    for (const { what, pages } of ALL) {
      expect(`${what}: ${pages[pages.length - 1].title}`).toBe(`${what}: Status ${pages.length}/${pages.length}`);
      expect(`${what}: ${pages[0].title}`).toContain(`1/${pages.length}`);
    }
  });

  it('tell a Standard player about colours and everyone else about the letter', () => {
    const lines = (mode: 'keyboard' | 'controller', tiles: string) =>
      helpPages(mode, tiles)
        .flatMap((p) => p.lines)
        .join('\n');
    expect(lines('keyboard', 'Standard')).toContain('Green: poisoned');
    expect(lines('keyboard', 'Standard')).not.toContain('G: good');
    expect(lines('controller', 'Apple II Mono')).toContain('G: good');
    expect(lines('controller', 'Apple II Mono')).not.toContain('Green: poisoned');
  });

  it('say where the settings and quit are, and offer no auto-combat key', () => {
    const all = ALL.flatMap(({ pages }) => pages.flatMap((p) => p.lines)).join('\n');
    expect(all).toContain('pause menu');
    expect(all).toMatch(/auto\s*combat/i);
    expect(all).not.toMatch(/^H\s+auto combat/m);
  });
});

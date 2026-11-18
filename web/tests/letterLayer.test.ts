import { describe, it, expect } from 'vitest';
import { LetterCells, parseColour } from '../src/ui/letterLayer.ts';

/** A 40 x 24 screen of 32-pixel cells, as the game's canvas is. */
const screen = () => new LetterCells(40, 24, 32);
const at = (cells: LetterCells, col: number, row: number) => cells.glyphs.get(row * 40 + col);

describe('the letters set at the screen size', () => {
  it('take a letter only where it fills a whole cell', () => {
    const cells = screen();
    expect(cells.set(64, 96, 32, 'A')).toBe(true);
    expect(at(cells, 2, 3)).toEqual({ ch: 'A', rgb: [255, 255, 255] });
    expect(cells.set(70, 96, 32, 'B')).toBe(false); // off the grid: drawn from the sheet
    expect(cells.set(64, 96, 16, 'B')).toBe(false); // smaller than a cell
  });

  it('go when drawn over, where the drawing covers the middle of their cell', () => {
    const cells = screen();
    cells.set(64, 96, 32, 'A');
    cells.set(96, 96, 32, 'B');
    cells.clear(60, 90, 78, 130); // over A's middle (80, 112)? no: it stops at 78
    expect(at(cells, 2, 3)).toBeDefined();
    cells.clear(60, 90, 100, 130); // A's middle, not B's (112, 112)
    expect(at(cells, 2, 3)).toBeUndefined();
    expect(at(cells, 3, 3)?.ch).toBe('B');
  });

  it('take a tint, and turn dark on an inverted bar, as the canvas blends them', () => {
    const cells = screen();
    cells.set(0, 0, 32, 'A');
    cells.blend(0, 0, 32, 32, 'multiply', [112, 112, 112]); // a disabled item's grey
    expect(at(cells, 0, 0)?.rgb).toEqual([112, 112, 112]);
    cells.set(32, 0, 32, 'B');
    cells.blend(32, 0, 64, 32, 'difference', [255, 255, 255]); // the cursor's bar
    expect(at(cells, 1, 0)?.rgb).toEqual([0, 0, 0]);
    cells.blend(32, 0, 64, 32, 'multiply', [255, 0, 0]); // a tint over the bar: the letter stays black
    expect(at(cells, 1, 0)?.rgb).toEqual([0, 0, 0]);
  });

  it('come back with a region put back, wherever it is put', () => {
    const cells = screen();
    cells.set(32, 32, 32, 'H');
    cells.set(64, 32, 32, 'I');
    const taken = cells.take(32, 32, 96, 64);
    cells.clear(0, 0, 1280, 768);
    expect(cells.glyphs.size).toBe(0);
    cells.paste(taken, 32, 32);
    expect([at(cells, 1, 1)?.ch, at(cells, 2, 1)?.ch]).toEqual(['H', 'I']);
    cells.paste(taken, 32, 64); // a line further down: the message area scrolled
    expect([at(cells, 1, 2)?.ch, at(cells, 2, 2)?.ch]).toEqual(['H', 'I']);
  });

  it('mark the cells to draw again', () => {
    const cells = screen();
    cells.set(0, 0, 32, 'A');
    expect([...cells.dirty]).toEqual([0]);
    cells.dirty.clear();
    cells.reset();
    expect([...cells.dirty]).toEqual([0]);
    expect(cells.glyphs.size).toBe(0);
  });

  it("read the canvas's colours", () => {
    expect(parseColour('#70a0ff')).toEqual([0x70, 0xa0, 0xff]);
    expect(parseColour('rgba(12, 34, 56, 0.5)')).toEqual([12, 34, 56]);
    expect(parseColour({})).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { Glide, GLIDE_MS, GLIDE_MIN_MS, type Point } from '../src/ui/glide.ts';

const at = (entries: [string, Point][]) => new Map(entries);

describe('smooth motion', () => {
  it('draws a step from where it was, running down to the new square over a glide', () => {
    const g = new Glide();
    g.update('town', at([['m1', { x: 5, y: 5 }]]), 0, 0);
    expect(g.lag('m1', 0)).toEqual({ x: 0, y: 0 });
    expect(g.moving(0)).toBe(false);
    g.update('town', at([['m1', { x: 6, y: 5 }]]), 0, 1000);
    expect(g.lag('m1', 1000)).toEqual({ x: -1, y: 0 }); // still drawn on the old square
    expect(g.lag('m1', 1000 + GLIDE_MS / 2).x).toBeCloseTo(-0.5);
    expect(g.moving(1000 + GLIDE_MS / 2)).toBe(true);
    expect(g.lag('m1', 1000 + GLIDE_MS)).toEqual({ x: 0, y: 0 });
    expect(g.moving(1000 + GLIDE_MS)).toBe(false);
  });

  it('follows a fast key repeat as closely, each step as long as the time since the last', () => {
    const g = new Glide();
    g.update('map', at([['camera', { x: 0, y: 0 }]]), 0, 0);
    g.update('map', at([['camera', { x: 1, y: 0 }]]), 0, 1000);
    g.update('map', at([['camera', { x: 2, y: 0 }]]), 0, 1050); // half-way through a 125 ms glide: 0.6 behind
    const lag = g.lag('camera', 1050);
    expect(lag.x).toBeCloseTo(-1 - (1 - 50 / GLIDE_MS)); // from where it was drawn, not from its last square
    expect(g.moving(1050 + 50)).toBe(false); // this step's glide is the 50 ms since the last
    g.update('map', at([['camera', { x: 3, y: 0 }]]), 0, 1060);
    expect(g.moving(1060 + GLIDE_MIN_MS)).toBe(false);
  });

  it('jumps a jump, a new scene, and something new to the view', () => {
    const g = new Glide();
    g.update('map', at([['camera', { x: 10, y: 10 }]]), 64, 0);
    g.update('map', at([['camera', { x: 30, y: 40 }]]), 64, 500); // a moongate
    expect(g.lag('camera', 500)).toEqual({ x: 0, y: 0 });
    g.update('town', at([['camera', { x: 31, y: 40 }]]), 64, 1000); // entering a town
    expect(g.lag('camera', 1000)).toEqual({ x: 0, y: 0 });
    g.update(
      'town',
      at([
        ['camera', { x: 31, y: 40 }],
        ['m4', { x: 33, y: 41 }],
      ]),
      64,
      1100,
    );
    expect(g.lag('m4', 1100)).toEqual({ x: 0, y: 0 });
  });

  it('steps across the seam of a wrapping map as a step', () => {
    const g = new Glide();
    g.update('map', at([['camera', { x: 63, y: 0 }]]), 64, 0);
    g.update('map', at([['camera', { x: 0, y: 63 }]]), 64, 1000);
    expect(g.lag('camera', 1000)).toEqual({ x: -1, y: 1 });
  });

  it('forgets what has left the view', () => {
    const g = new Glide();
    g.update('map', at([['m2', { x: 1, y: 1 }]]), 0, 0);
    g.update('map', at([]), 0, 100);
    g.update('map', at([['m2', { x: 2, y: 1 }]]), 0, 200); // back in view a square on: not glided from where it left
    expect(g.lag('m2', 200)).toEqual({ x: 0, y: 0 });
  });
});

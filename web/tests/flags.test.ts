import { describe, expect, it } from 'vitest';
import { twiddleFlags } from '../src/ui/graphics.ts';

describe('flags', () => {
  it('flap the castle every 4th idle tick, the town every 3rd and the ship every 2nd', () => {
    const counters = [3, 2, 1]; // the original's starting counts
    const ticks: number[][] = [[], [], []];
    for (let t = 1; t <= 12; t++) twiddleFlags(counters).forEach((flap, i) => flap && ticks[i].push(t));
    expect(ticks).toEqual([
      [4, 8, 12],
      [3, 6, 9, 12],
      [2, 4, 6, 8, 10, 12],
    ]);
  });
});

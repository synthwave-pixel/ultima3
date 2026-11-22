import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { ageChars } from '../src/game/turn.ts';

describe("poison's sting each turn", () => {
  it('says POISON! once for the whole party, and flashes only the stung members, together (#40)', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    for (const m of [0, 2, 3]) world.member(m).status = 'P';
    const hp = [0, 1, 2, 3].map((m) => world.member(m).hitPoints);
    await ageChars(world, io);
    const word = world.resources.strings.Messages[183 - 1];
    expect(io.output.split(word).length - 1).toBe(1);
    expect(io.memberFlashes).toEqual([[3, 2, 0]]);
    expect([0, 1, 2, 3].map((m) => hp[m] - world.member(m).hitPoints)).toEqual([1, 0, 1, 1]);
  });

  it('says nothing with no one poisoned', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    await ageChars(world, io);
    expect(io.memberFlashes).toEqual([]);
    expect(io.output).not.toContain(world.resources.strings.Messages[183 - 1]);
  });
});

import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO, savedCopy } from './helpers.ts';
import { createCharacter, inspectParty, terminateCharacter } from '../src/game/menu.ts';
import { restore } from '../src/game/save.ts';
import { World } from '../src/game/world.ts';
import { defaultLook, FIGURES, randomAppearance, validAppearance, type Appearance } from '../src/game/appearance.ts';
import { labels } from '../src/ui/avatarRegions.ts';
import { Key } from '../src/game/io.ts';
import { FIGURE_PIXELS } from '../src/ui/figurePixels.ts';

describe('appearance', () => {
  it("starts each class on the nearest figure, a cleric's and a druid's mage robed apart", () => {
    expect(FIGURES[defaultLook('F').figure].name).toBe('Knight');
    expect(FIGURES[defaultLook('R').figure].name).toBe('Fighter');
    expect(FIGURES[defaultLook('T').figure].name).toBe('Bard');
    expect(FIGURES[defaultLook('L').figure].name).toBe('Jester');
    expect(defaultLook('W').main).toBe(0);
    expect(defaultLook('C').main).not.toBe(defaultLook('D').main);
  });

  it('keeps only whole looks within range', () => {
    expect(validAppearance({ figure: 4, skin: 7, hair: 8, main: 15, trim: 0 })).not.toBeNull();
    expect(validAppearance({ figure: 5, skin: 0, hair: 0, main: 0, trim: 0 })).toBeNull();
    expect(validAppearance({ figure: 1 })).toBeNull();
    expect(validAppearance('Knight')).toBeNull();
    const r = randomAppearance((lo, hi) => hi - lo);
    expect(validAppearance(r)).toEqual(r);
  });

  it("finds every figure's skin, clothes and trim", () => {
    for (const figure of FIGURES)
      for (const f of figure.frames) {
        const px = Uint8Array.from(FIGURE_PIXELS[`${f.tile}.${f.frame}`], (c) => parseInt(c, 16));
        expect(px.length).toBe(256);
        const regions = labels(px, figure.base, f.source - figure.base);
        for (const r of ['s', 'm', 't']) expect(regions.filter((x) => x === r).length, `${figure.name} ${r}`).toBeGreaterThan(0);
      }
  });

  it('is chosen at creation with the Remastered tiles, kept in the save, and cleared with the character', async () => {
    const world = new World(newWorld().resources, 3);
    const io = new FakeIO(world.resources);
    io.looksDrawn = true;
    const chosen: Appearance = { figure: 4, skin: 6, hair: 2, main: 9, trim: 3 };
    io.adjusted = [chosen.figure, chosen.skin, chosen.hair, chosen.main, chosen.trim];
    io.keys = ['5', 'T', 'F', 'E', 'W', 'Y', ' '];
    io.inputs = ['Mira', '15,10,15,10'];
    await createCharacter(world, io);
    expect(world.looks[4]).toEqual(chosen);

    const copy = new World(world.resources, 3);
    expect(restore(copy, savedCopy(world))).toBe(true);
    expect(copy.looks[4]).toEqual(chosen);
    expect(copy.looks[0]).toBeNull();

    io.keys = ['5', 'Y', ' '];
    await terminateCharacter(world, io);
    expect(world.looks[4]).toBeNull();
  });

  it('is not asked at creation with any other tiles', async () => {
    const world = new World(newWorld().resources, 3);
    const io = new FakeIO(world.resources);
    io.adjusted = [1, 1, 1, 1, 1];
    io.keys = ['5', 'T', 'F', 'E', 'W', 'Y', ' '];
    io.inputs = ['Mira', '15,10,15,10'];
    await createCharacter(world, io);
    expect(world.roster.get(4).name).toBe('Mira');
    expect(world.looks[4]).toBeNull();
  });

  it("changes a party member's look from Inspect party", async () => {
    const world = newWorld(3); // the default party is formed
    const io = new FakeIO(world.resources);
    io.looksDrawn = true;
    io.adjusted = [2, 0, 5, 1, 13];
    const slot = world.party.memberSlot(1);
    io.keys = [String(slot + 1), Key.Escape];
    await inspectParty(world, io);
    expect(world.looks[slot]).toEqual({ figure: 2, skin: 0, hair: 5, main: 1, trim: 13 });
  });

  it('renames a character from their sheet, in any set', async () => {
    const world = newWorld(3);
    const io = new FakeIO(world.resources);
    const slot = world.party.memberSlot(0);
    io.keys = [String(slot + 1), 'R', 'B', Key.Escape];
    io.inputs = ['MIRA'];
    await inspectParty(world, io);
    expect(world.roster.get(slot).name).toBe('MIRA');
  });
});

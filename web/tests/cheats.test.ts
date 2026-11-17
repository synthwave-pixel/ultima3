import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { CHEATS } from '../src/game/cheats.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';
import { knownWords } from '../src/game/journal.ts';
import { PartyShape } from '../src/game/commands.ts';
import { MapValue } from '../src/game/tiles.ts';

const cheat = (key: string) => CHEATS.find((c) => c.key === key)!;

describe('cheats', () => {
  it('restores everyone, adds gold and torches', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.member(0).status = 'D';
    world.member(1).status = 'P';
    world.member(1).hitPoints = 3;
    await cheat('R').apply(world, io);
    expect(world.member(0).status).toBe('G');
    expect(world.member(1).status).toBe('G');
    expect(world.member(1).hitPoints).toBe(world.member(1).maxHitPoints);
    const gold = world.party.gold;
    await cheat('G').apply(world, io);
    expect(world.party.gold).toBe(gold + 100);
    const food = world.party.food;
    await cheat('F').apply(world, io);
    expect(world.party.food).toBe(food + 100);
    await cheat('T').apply(world, io);
    expect(world.party.torches).toBe(5);
    await cheat('M').apply(world, io);
    expect(world.party.gems).toBe(10);
    await cheat('K').apply(world, io);
    expect(world.party.keys).toBe(5);
  });

  it('adds a word for Other, as if heard: only one Other offers, and once', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.inputs = ['evocare'];
    expect(await cheat('W').apply(world, io)).toBe('Known now: EVOCARE. Other offers it from now on.');
    expect(knownWords(world)).toEqual(['EVOCARE']);
    expect(io.output).toContain('Journal updated');
    io.inputs = ['EVOCARE'];
    expect(await cheat('W').apply(world, io)).toBe('EVOCARE is known already.');
    io.inputs = ['SCREAM'];
    expect(await cheat('W').apply(world, io)).toBe('Other offers no word SCREAM.');
    io.inputs = [''];
    expect(await cheat('W').apply(world, io)).toBe('No word added.');
    expect(knownWords(world)).toEqual(['EVOCARE']);
  });

  it('raises every level: a hundred experience and a hundred hit points each, healed to the new maximum', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const p = world.member(0);
    const level = p.level;
    const max = p.maxHitPoints;
    p.hitPoints = 5;
    await cheat('L').apply(world, io);
    expect(p.level).toBe(level + 1);
    expect(p.maxHitPoints).toBe(max + 100);
    expect(p.hitPoints).toBe(max + 100);
    expect(world.member(3).maxHitPoints).toBe(max + 100);
  });

  it('goes home from a town, and asks a dungeon to end', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.returnX = 10;
    world.returnY = 11;
    world.enterMap(MapId.FirstTown);
    world.party.location = Location.Town;
    await cheat('H').apply(world, io);
    expect(world.party.location).toBe(Location.Sosaria);
    expect([world.x, world.y]).toEqual([42, 20]);

    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.dungeon.exit = false;
    expect(cheat('X').available(world)).toBe(true);
    await cheat('X').apply(world, io);
    expect(world.dungeon.exit).toBe(true);
    world.party.location = Location.Sosaria;
    expect(cheat('X').available(world)).toBe(false);
  });

  // Issue #23: Lord British's castle has a ship in its moat (9, 23). Gone home aboard it, the party sat in a ship on
  // dry land at the gate, and the ship left there when they got out stayed on the land for good.
  it('goes home on foot from aboard the ship in Lord British’s moat, and leaves no ship on the land', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.returnX = world.party.surfaceX = 42;
    world.returnY = world.party.surfaceY = 21;
    world.enterMap(MapId.LordBritishCastle);
    world.party.location = Location.Castle;
    [world.x, world.y] = [9, 23];
    expect(world.getXYVal(9, 23)).toBe(MapValue.Frigate);
    world.party.shape = PartyShape.Frigate; // boarded
    world.putXYVal(MapValue.Water, 9, 23);
    await cheat('H').apply(world, io);
    expect(world.party.location).toBe(Location.Sosaria);
    expect([world.x, world.y]).toEqual([42, 20]);
    expect(world.party.shape).toBe(PartyShape.OnFoot);
    expect(world.getXYVal(42, 20)).not.toBe(MapValue.Frigate);
  });

  // Issue #23: on Ambrosia, Go home moved the party to the gate's square of Ambrosia, not Sosaria - and set Sosaria's
  // return square to the gate, on land, where the whirlpool home then left the party aboard a ship.
  it('goes home from Ambrosia to Sosaria, at the gate, on foot', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.party.surfaceX = 2;
    world.party.surfaceY = 0x3e; // where the whirlpool took them, at sea
    world.enterMap(MapId.Ambrosia);
    world.party.location = Location.Ambrosia;
    [world.x, world.y] = [32, 54];
    await cheat('H').apply(world, io);
    expect(world.party.location).toBe(Location.Sosaria);
    expect(world.current).toBe(world.surface);
    expect([world.x, world.y]).toEqual([42, 20]);
    expect([world.party.surfaceX, world.party.surfaceY]).toEqual([42, 20]);
    expect(world.party.shape).toBe(PartyShape.OnFoot);
  });

  it('leaves a ship or a horse where it was on Sosaria when going home, as getting out of it would', async () => {
    for (const [shape, ground, left] of [
      [PartyShape.Frigate, MapValue.Water, MapValue.Frigate],
      [PartyShape.Horse, MapValue.Grass, MapValue.Horse],
    ] as const) {
      const world = newWorld();
      const io = new FakeIO(world.resources);
      world.party.location = Location.Sosaria;
      [world.x, world.y] = [10, 10];
      world.putXYVal(ground, 10, 10);
      world.party.shape = shape;
      await cheat('H').apply(world, io);
      expect(world.getXYVal(10, 10)).toBe(left);
      expect([world.x, world.y]).toEqual([42, 20]);
      expect(world.party.shape).toBe(PartyShape.OnFoot);
    }
  });
});

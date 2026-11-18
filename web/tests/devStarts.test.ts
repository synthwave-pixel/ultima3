import { describe, it, expect } from 'vitest';
import { FakeIO, newWorld } from './helpers.ts';
import { parseAt, pickName, slug, startAt, startNames, tileSetAsked } from '../src/game/devStarts.ts';
import { enter, move } from '../src/game/commands.ts';
import { attackToward } from '../src/game/interact.ts';
import { spawnMonster } from '../src/game/monsters.ts';
import { World } from '../src/game/world.ts';
import { MapId } from '../src/data/resources.ts';
import { Location } from '../src/game/party.ts';
import { MapValue } from '../src/game/tiles.ts';
import { Key } from '../src/game/io.ts';
import { TILE_SETS } from '../src/ui/help.ts';

describe('development starts', () => {
  it('read the address', () => {
    expect(parseAt('world:44,18')).toEqual({ kind: 'world', x: 44, y: 18 });
    expect(parseAt('ambrosia')).toEqual({ kind: 'ambrosia', x: 32, y: 54 });
    expect(parseAt('ambrosia:11,6')).toEqual({ kind: 'ambrosia', x: 11, y: 6 });
    expect(parseAt('place:yew')).toEqual({ kind: 'place', name: 'yew' });
    expect(parseAt('fight:Man-O-War')).toEqual({ kind: 'fight', name: 'Man-O-War' });
    for (const junk of [null, '', 'town:3', 'world:1']) expect(parseAt(junk)).toBeNull();
  });

  it('match names by their letters, a start of one where it is the only one', () => {
    expect(slug('Dungeon DardinÕs Pit')).toBe('dungeondardinspit');
    const { places, fights } = startNames(newWorld());
    expect(pickName(places, 'lcb')).toBe('LCB Towne');
    expect(pickName(places, 'perinian')).toBe('Dungeon Perinian Depths');
    expect(pickName(places, 'dardinspit')).toBe('Dungeon DardinÕs Pit');
    expect(pickName(places, 'm')).toBeNull(); // Moon, the Montors, Morinia
    for (const name of places) expect(pickName(places, slug(name.replace(/^Dungeon /, '')))).toBe(name); // the /debug links
    for (const name of fights) expect(pickName(fights, slug(name))).toBe(name);
    expect(tileSetAsked('commodore64', TILE_SETS)).toBe('Commodore 64');
    expect(tileSetAsked('pc', TILE_SETS)).toBeNull();
    expect(tileSetAsked(null, TILE_SETS)).toBeNull();
  });

  it('enter a town, Dawn, a castle and a dungeon from their squares, as Enter does', () => {
    for (const [name, entered, id] of [
      ['yew', 'town', 404],
      ['dawn', 'town', 408],
      ['lordbritish', 'castle', 400],
      ['perinian', 'dungeon', 416],
    ] as const) {
      const world = newWorld();
      const io = new FakeIO(world.resources);
      expect(startAt(world, { kind: 'place', name })).toEqual({ key: 'E' });
      expect(enter(world, io), name).toBe(entered);
      expect(world.current.id).toBe(id);
    }
  });

  /** Take a start, play its step, and say what the fight is with: its monster shape, or null when no fight began. */
  async function fought(world: World, name: string, standsOn?: (party: number, monster: number) => void): Promise<number | null> {
    expect(startAt(world, { kind: 'fight', name })).toEqual({ key: Key.Right });
    standsOn?.(world.getXYVal(world.x, world.y), world.monsters.tileUnder(world.monsters.at(world.x + 1, world.y)));
    const io = new FakeIO(world.resources);
    const bump = await move(world, io, 'east');
    if (bump?.kind !== 'monster') return null;
    let shape: number | null = null;
    io.keyProvider = () => {
      shape = world.combat?.monsterShape ?? null;
      throw new Error('enough'); // the fight has begun; no need to play it
    };
    await expect(attackToward(world, io, bump.dx, bump.dy)).rejects.toThrow('enough');
    return shape;
  }

  /** The shape a fight with this roamer is with: its own, a Pirate's crew being Thieves. */
  const shapeOf = (world: World, name: string) => {
    const tile = world.resources.strings.Tiles.indexOf(name);
    return tile === MapValue.Pirate >> 2 ? MapValue.Thief >> 1 : tile * 2;
  };

  it('fight each roamer by name, on its own terrain east of the party on grass', async () => {
    for (const name of startNames(newWorld()).fights) {
      const world = newWorld();
      const sea = ['Serpent', 'Man-O-War', 'Pirate'].includes(name);
      const standsOn = (party: number, monster: number) => {
        expect(party, name).toBe(MapValue.Grass);
        expect(monster, name).toBe(sea ? MapValue.Water : MapValue.Grass);
      };
      expect(await fought(world, name, standsOn), name).toBe(shapeOf(world, name));
    }
  });

  it('fight the roamer named on a long-played Sosaria, every slot taken, coming from a town', async () => {
    for (const name of ['dragon', 'man-o-war']) {
      const world = newWorld();
      world.party.rulesPending = false;
      for (let t = 0; t < 5000; t++) spawnMonster(world);
      expect(world.monsters.freeSlot()).toBe(-1);
      expect(startAt(world, { kind: 'place', name: 'yew' })).toEqual({ key: 'E' });
      expect(enter(world, new FakeIO(world.resources))).toBe('town');
      expect(await fought(world, name), name).toBe(shapeOf(world, startNames(world).fights.find((f) => slug(f) === slug(name))!));
      expect(world.current.id).toBe(MapId.Sosaria);
    }
  });

  it('go to Ambrosia, and say why a start is not understood', () => {
    const world = newWorld();
    expect(startAt(world, { kind: 'ambrosia', x: 32, y: 54 })).toEqual({ key: null });
    expect(world.party.location).toBe(Location.Ambrosia);
    expect([world.x, world.y]).toEqual([32, 54]);
    expect(startAt(newWorld(), { kind: 'place', name: 'atlantis' })).toMatch(/no place "atlantis"/);
    expect(startAt(newWorld(), { kind: 'fight', name: 'gazer' })).toMatch(/no monster "gazer"/);
  });
});

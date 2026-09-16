import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { AutoMap, cellVisible, nextMapMode, type AutoMapStore } from '../src/game/automap.ts';
import { runDungeon, toggleMap, stepCompass } from '../src/game/dungeon.ts';
import { DungeonCell } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';
import { Key } from '../src/game/io.ts';

class MemoryStore implements AutoMapStore {
  text: string | null = null;
  read() {
    return this.text;
  }
  write(text: string) {
    this.text = text;
  }
}

describe('the auto-map mask', () => {
  it('marks the 3x3 around a cell, wrapping at the edges', () => {
    const map = new AutoMap();
    map.mark(1, 0, 0, 0);
    expect(map.seenCount(1, 0)).toBe(9);
    expect(map.isSeen(1, 0, 15, 15)).toBe(true);
    expect(map.isSeen(1, 0, 1, 1)).toBe(true);
    expect(map.isSeen(1, 0, 2, 2)).toBe(false);
    expect(map.isSeen(1, 1, 0, 0)).toBe(false); // another level
    expect(map.isSeen(2, 0, 0, 0)).toBe(false); // another dungeon
  });

  it('round-trips through its store and clears for a new game', () => {
    const store = new MemoryStore();
    const map = new AutoMap(store);
    map.mark(3, 2, 8, 8);
    expect(store.text).toContain('"3:2"');
    const again = new AutoMap(store);
    expect(again.isSeen(3, 2, 9, 7)).toBe(true);
    again.clear();
    expect(new AutoMap(store).seenCount(3, 2)).toBe(0);
  });

  it('cycles the mode off, small, full', () => {
    expect(nextMapMode('off')).toBe('small');
    expect(nextMapMode('small')).toBe('full');
    expect(nextMapMode('full')).toBe('off');
  });
});

describe('the auto-map in play', () => {
  function dungeonWorld() {
    const world = newWorld(7);
    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.x = 1;
    world.y = 1;
    world.dungeon.heading = 1;
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    world.putXYDng(DungeonCell.Open, 2, 1);
    world.putXYDng(DungeonCell.Open, 3, 1);
    return { world, io: new FakeIO(world.resources) };
  }

  it('records nothing in the dark but still shows the 3x3 around the party', async () => {
    const { world, io } = dungeonWorld();
    io.keys = [Key.Up, Key.Down, 'K'];
    await runDungeon(world, io);
    expect(world.autoMap.seenCount(world.current.id, 0)).toBe(0);
    world.x = 2;
    world.y = 1;
    expect(cellVisible(world, 3, 2)).toBe(true);
    expect(cellVisible(world, 4, 1)).toBe(false);
  });

  it('records the 3x3 around each step taken with a torch lit', async () => {
    const { world, io } = dungeonWorld();
    world.party.torches = 1;
    io.keys = ['I', Key.Up, Key.Up, Key.Down, Key.Down, 'K'];
    await runDungeon(world, io);
    const id = world.current.id;
    // Stood at x=1, 2 and 3 on row 1: columns 0..4 of rows 0..2.
    expect(world.autoMap.seenCount(id, 0)).toBe(15);
    expect(world.autoMap.isSeen(id, 0, 4, 2)).toBe(true);
    expect(world.autoMap.isSeen(id, 0, 5, 1)).toBe(false);
    world.dungeon.torch = 0;
    world.x = 12;
    expect(cellVisible(world, 4, 2)).toBe(true); // remembered
    expect(cellVisible(world, 8, 8)).toBe(false);
  });

  it('L cycles the map mode and tells the page', () => {
    const { world, io } = dungeonWorld();
    let told = 0;
    world.onMapModeChange = () => told++;
    toggleMap(world, io);
    expect(world.mapMode).toBe('small');
    toggleMap(world, io);
    expect(world.mapMode).toBe('full');
    expect(io.output).toContain('Map: full');
    expect(told).toBe(2);
  });
});

describe('full-map movement', () => {
  it('moves by compass, turning to face each move, and refuses walls', async () => {
    const world = newWorld(7);
    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.Open, 5, 5);
    world.putXYDng(DungeonCell.Open, 5, 4);
    world.putXYDng(DungeonCell.Open, 6, 4);
    world.x = 5;
    world.y = 5;
    world.dungeon.heading = 1;
    world.mapMode = 'full';
    const io = new FakeIO(world.resources);
    stepCompass(world, io, 0); // north
    expect([world.x, world.y, world.dungeon.heading]).toEqual([5, 4, 0]);
    stepCompass(world, io, 1); // east
    expect([world.x, world.y, world.dungeon.heading]).toEqual([6, 4, 1]);
    stepCompass(world, io, 3); // west, back
    stepCompass(world, io, 3); // west again: a wall; the party still turns to face it
    expect([world.x, world.y, world.dungeon.heading]).toEqual([5, 4, 3]);
    expect(io.output).toContain('North');
    expect(io.output).toContain('West');
  });
});

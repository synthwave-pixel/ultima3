import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { forward, retreat, turn, klimb, descend, buildDungeonView, cellAtLocation, runDungeon } from '../src/game/dungeon.ts';
import { igniteTorch } from '../src/game/actions.ts';
import { DungeonCell } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';
import { Key } from '../src/game/io.ts';
import { LIGHT_KEY } from '../src/game/context.ts';
import { World } from '../src/game/world.ts';

function dungeonWorld(): { world: World; io: FakeIO } {
  const world = newWorld(7);
  world.enterDungeon(MapId.FirstDungeon);
  world.party.location = Location.Dungeon;
  world.x = 1;
  world.y = 1;
  world.dungeon.heading = 1;
  return { world, io: new FakeIO(world.resources) };
}

describe('dungeon movement', () => {
  it('loads eight levels and starts at the entrance', () => {
    const { world } = dungeonWorld();
    expect(world.dungeon.tiles).toHaveLength(2048);
    expect(world.getXYDng(1, 1) & DungeonCell.LadderUp).toBe(DungeonCell.LadderUp); // the way out
  });

  it('advances, retreats and turns, and cannot walk through walls', () => {
    const { world, io } = dungeonWorld();
    // Build a tiny level: open row at y=1, walls elsewhere.
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    for (let x = 1; x < 6; x++) world.putXYDng(DungeonCell.Open, x, 1);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    world.dungeon.heading = 1; // east
    forward(world, io);
    expect(world.x).toBe(2);
    retreat(world, io);
    expect(world.x).toBe(1);
    turn(world, io, true); // south
    expect(world.dungeon.heading).toBe(2);
    forward(world, io);
    expect(world.y).toBe(1);
    expect(io.output).toContain('INVALID MOVE!');
    turn(world, io, false);
    turn(world, io, false); // north
    expect(world.dungeon.heading).toBe(0);
  });

  it('climbs out from the top level and descends ladders', () => {
    const { world, io } = dungeonWorld();
    world.putXYDng(DungeonCell.LadderDown, 1, 1);
    descend(world, io);
    expect(world.dungeon.level).toBe(1);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    klimb(world, io);
    expect(world.dungeon.level).toBe(0);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    klimb(world, io);
    expect(world.dungeon.exit).toBe(true);
  });
});

describe('dungeon view', () => {
  it('rotates view locations with the heading', () => {
    const { world } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Open, 0, 256);
    world.x = 8;
    world.y = 8;
    world.putXYDng(DungeonCell.Wall, 8, 7); // north of the party
    world.dungeon.heading = 0;
    expect(cellAtLocation(world, 4)).toBe(DungeonCell.Wall); // one step ahead
    world.dungeon.heading = 1; // facing east: the wall is now on the left
    expect(cellAtLocation(world, 4)).toBe(DungeonCell.Open);
    expect(cellAtLocation(world, 1)).toBe(DungeonCell.Wall);
  });

  it('draws a wall ahead and nothing behind it', () => {
    const { world } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Open, 0, 256);
    world.x = 8;
    world.y = 8;
    world.dungeon.heading = 0;
    world.putXYDng(DungeonCell.Wall, 8, 6); // two steps ahead
    world.putXYDng(DungeonCell.Chest, 8, 5); // hidden behind it
    const ops = buildDungeonView(world);
    expect(ops.some((o) => o.kind === 'wall' && o.location === 12)).toBe(true);
    expect(ops.some((o) => o.kind === 'chest')).toBe(false);
    world.putXYDng(DungeonCell.Chest, 8, 7); // one step ahead, visible
    expect(buildDungeonView(world).some((o) => o.kind === 'chest' && o.location === 4)).toBe(true);
  });

  it('shows a door as a wall with a doorway', () => {
    const { world } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Open, 0, 256);
    world.x = 8;
    world.y = 8;
    world.dungeon.heading = 0;
    world.putXYDng(DungeonCell.Door, 8, 7);
    const ops = buildDungeonView(world);
    expect(ops.filter((o) => o.location === 4).map((o) => o.kind)).toEqual(['wall', 'door']);
  });
});

describe('the dungeon loop', () => {
  it('runs until the party climbs out', async () => {
    const { world, io } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    world.putXYDng(DungeonCell.Open, 2, 1);
    io.keys = [Key.Up, Key.Down, 'K'];
    await runDungeon(world, io);
    expect(world.dungeon.exit).toBe(true);
    expect(io.output).toContain("It's dark!");
    expect(io.output).toContain('Advance');
    expect(io.output).toContain('Klimb');
  });

  it('lights a torch and drinks from a fountain', async () => {
    const { world, io } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    world.putXYDng(DungeonCell.Fountain, 2, 1); // x=2: 2 & 3 = damage fountain
    world.party.torches = 1;
    const hp = world.member(0).hitPoints;
    // Ignite (no "whose" prompt: torches are the party's), advance to the fountain, drink, retreat, climb.
    io.keys = ['I', Key.Up, '1', '0', Key.Down, 'K'];
    await runDungeon(world, io);
    expect(world.dungeon.torch).toBeGreaterThan(0);
    expect(io.images).toContain('Fountain');
    expect(io.output).toContain('ARGH! BLAH! YUK!');
    expect(world.member(0).hitPoints).toBe(hp - 25);
    expect(world.dungeon.exit).toBe(true);
  });
});

describe('fountain prompts', () => {
  it('asks who drinks on arrival only, not while turning or waiting on the cell', async () => {
    const { world, io } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    world.putXYDng(DungeonCell.Fountain, 2, 1);
    world.party.torches = 1;
    // Ignite, step onto the fountain (asked: cancel with 0), turn twice and pass (not asked), retreat, climb.
    io.keys = ['I', Key.Up, '0', Key.Left, Key.Right, ' ', Key.Down, 'K'];
    await runDungeon(world, io);
    const asks = io.output.split('who\nwill drink?').length - 1;
    expect(asks).toBe(1);
    expect(world.dungeon.exit).toBe(true);
  });
});

describe('party torches', () => {
  it("ignites one of the party's torches without asking whose", async () => {
    const { world, io } = dungeonWorld();
    world.party.torches = 3;
    io.keys = [];
    await igniteTorch(world, io);
    expect(io.output).not.toContain('Whose torch');
    expect(world.party.torches).toBe(2);
    expect(world.dungeon.torch).toBe(255);
  });
});

describe('the light shortcut in the dungeon loop', () => {
  it('lights the dungeon, and shrugs when nobody can', async () => {
    const { world, io } = dungeonWorld();
    world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
    world.putXYDng(DungeonCell.LadderUp, 1, 1);
    for (let m = 0; m < 4; m++) world.member(m).mana = 0;
    io.keys = [LIGHT_KEY, 'K'];
    await runDungeon(world, io);
    expect(world.dungeon.torch).toBe(0);
    expect(io.output).toContain('WHAT?');
    world.dungeon.exit = false;
    world.member(3).mana = 40;
    io.keys = [LIGHT_KEY, 'K'];
    await runDungeon(world, io);
    expect(world.dungeon.torch).toBeGreaterThan(200);
    expect(io.output).toContain('Long light');
  });
});

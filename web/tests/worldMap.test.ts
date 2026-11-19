import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { AutoMap, recordView, MAP_SIDE, type AutoMapStore } from '../src/game/automap.ts';
import { coastSegments, levelPage, mapPages, marksOn, pageTitle, stepMark, type MapMark, type MapPage } from '../src/game/worldMap.ts';
import { buildViewport } from '../src/game/viewport.ts';
import { peerGem } from '../src/game/actions.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';
import type { World } from '../src/game/world.ts';

class MemoryStore implements AutoMapStore {
  text: string | null = null;
  read() {
    return this.text;
  }
  write(text: string) {
    this.text = text;
  }
}

const YEW = 404;
const DAWN = 408;
const at = (world: World, id: number): [number, number] => [
  world.resources.misc.locationX[id - 400],
  world.resources.misc.locationY[id - 400],
];

describe("the map's record of what has been seen", () => {
  it('keeps the squares of each map, and keeps them through its store', () => {
    const store = new MemoryStore();
    const map = new AutoMap(store);
    map.markSquares(MapId.Sosaria, [
      [0, 0],
      [63, 63],
      [10, 20],
    ]);
    map.markSquares(YEW, [
      [1, 32],
      [2, 32],
    ]);
    map.visit('shrine:6,6');
    const again = new AutoMap(store);
    expect(again.squareSeen(MapId.Sosaria, 10, 20)).toBe(true);
    expect(again.squareSeen(MapId.Sosaria, 63, 63)).toBe(true);
    expect(again.squareSeen(MapId.Sosaria, 11, 20)).toBe(false);
    expect(again.mapSeenCount(MapId.Sosaria)).toBe(3);
    expect(again.mapSeenCount(YEW)).toBe(2);
    expect(again.visited('shrine:6,6')).toBe(true);
    again.clear();
    expect(new AutoMap(store).hasMap(YEW)).toBe(false);
  });

  it('reads a store from before the maps, with dungeon levels only', () => {
    const store = new MemoryStore();
    store.text = JSON.stringify({ '412:0': '1'.repeat(256) });
    const map = new AutoMap(store);
    expect(map.seenCount(412, 0)).toBe(256);
    expect(map.hasMap(MapId.Sosaria)).toBe(false);
    expect(map.hasDungeon(412)).toBe(true);
  });

  it('records what the view shows, and nothing the line of sight hides', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    const view = buildViewport(world);
    recordView(world, view);
    const open = view.cells.filter((c) => c.base !== Shape.Void).length;
    expect(world.autoMap.mapSeenCount(MapId.Sosaria)).toBe(open);
    expect(world.autoMap.squareSeen(MapId.Sosaria, world.x, world.y)).toBe(true);
  });

  it('records nothing in a dungeon or a fight', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.party.location = Location.Dungeon;
    recordView(world, buildViewport(world));
    expect(world.autoMap.hasMap(MapId.Sosaria)).toBe(false);
  });

  it('records only what is in sight: nothing behind forest or mountains', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    // A square on Sosaria from which some of the view is hidden.
    let view = buildViewport(world);
    for (let y = 0; y < MAP_SIDE && view.cells.filter((c) => c.base === Shape.Void).length < 20; y++)
      for (let x = 0; x < MAP_SIDE; x++) {
        [world.x, world.y] = [x, y];
        view = buildViewport(world);
        if (view.cells.filter((c) => c.base === Shape.Void).length >= 20) break;
      }
    const hidden = view.cells.filter((c) => c.base === Shape.Void).length;
    expect(hidden).toBeGreaterThanOrEqual(20);
    recordView(world, view);
    view.cells.forEach((cell, i) => {
      const [x, y] = [world.constrain(view.originX + (i % 11)), world.constrain(view.originY + Math.floor(i / 11))];
      expect(world.autoMap.squareSeen(MapId.Sosaria, x, y)).toBe(cell.base !== Shape.Void);
    });
    expect(world.autoMap.mapSeenCount(MapId.Sosaria)).toBe(121 - hidden);
  });

  it("records nothing past a town's edge, though the view there shows its far side", () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.party.location = Location.Town;
    world.enterMap(YEW);
    [world.x, world.y] = [1, 32];
    recordView(world, buildViewport(world));
    for (let y = 0; y < MAP_SIDE; y++) for (let x = 7; x < MAP_SIDE; x++) expect(world.autoMap.squareSeen(YEW, x, y)).toBe(false);
    expect(world.autoMap.hasMap(YEW)).toBe(true);
  });

  it('is not added to by peering at a gem', async () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.party.gems = 1;
    const io = new FakeIO(world.resources);
    io.keys = [' '];
    await peerGem(world, io);
    expect(world.autoMap.hasMap(MapId.Sosaria)).toBe(false);
  });
});

describe("the map's marks", () => {
  it("marks every town but Dawn, and Lord British's castle, from the start: Undiscovered till seen", () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    const page = { kind: 'map' as const, id: MapId.Sosaria };
    const [party, ...places] = marksOn(world, page);
    expect(party.kind).toBe('party');
    // Not Exodus' castle (401), Dawn (408) or a dungeon.
    const charted = [400, 402, 403, 404, 405, 406, 407, 409, 410, 411];
    expect(places.map((m) => [m.x, m.y])).toEqual(charted.map((id) => at(world, id)));
    expect(places.map((m) => m.label)).toEqual(['Castle?', ...charted.slice(1).map(() => 'Towne?')]);
    for (const m of places) expect(m).toMatchObject({ detail: 'Undiscovered', unseen: true, opens: undefined });
    // Seen, it is a place not yet entered; a dungeon shows only once seen.
    world.autoMap.markSquares(MapId.Sosaria, [at(world, YEW), at(world, 412)]);
    const now = marksOn(world, page);
    const yew = now.find((m) => m.x === at(world, YEW)[0] && m.y === at(world, YEW)[1]);
    expect(yew).toMatchObject({ label: 'Towne?', detail: 'Not yet entered', unseen: undefined });
    expect(now.find((m) => m.kind === 'dungeon')).toMatchObject({ label: 'Dungeon?', detail: 'Not yet entered' });
  });

  it('names a place once the party has been in it, and A opens its map', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.autoMap.markSquares(MapId.Sosaria, [at(world, YEW), at(world, 412)]);
    world.autoMap.markSquares(YEW, [[1, 32]]);
    world.autoMap.mark(412, 0, 1, 1);
    const marks = marksOn(world, { kind: 'map', id: MapId.Sosaria });
    expect(marks.find((m) => m.opens === YEW)).toMatchObject({ label: 'Yew', detail: 'A: its map' });
    expect(marks.find((m) => m.kind === 'dungeon')).toMatchObject({ label: 'Dungeon Doom', opens: undefined, detail: 'Been in' });
  });

  it('names the town by Lord British\'s castle Britain, not "LCB Towne" as the game\'s files do', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.autoMap.markSquares(MapId.Sosaria, [at(world, MapId.FirstTown)]);
    world.autoMap.markSquares(MapId.FirstTown, [[1, 32]]);
    const marks = marksOn(world, { kind: 'map', id: MapId.Sosaria });
    expect(marks.find((m) => m.opens === MapId.FirstTown)).toMatchObject({ label: 'Britain' });
    expect(pageTitle(world, { kind: 'map', id: MapId.FirstTown })).toBe('Britain');
  });

  it('shows Dawn only while it stands, or once the party has been in it', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    const [x, y] = at(world, DAWN);
    const dawn = () => marksOn(world, { kind: 'map', id: MapId.Sosaria }).some((m) => m.x === x && m.y === y);
    expect(dawn()).toBe(false); // not marked from the start, as the other towns are
    world.autoMap.markSquares(MapId.Sosaria, [[x, y]]);
    world.surface.tiles[y * MAP_SIDE + x] = MapValue.Grass;
    expect(dawn()).toBe(false);
    world.surface.tiles[y * MAP_SIDE + x] = MapValue.Town;
    expect(dawn()).toBe(true);
  });

  it('makes the place the party is in its mark on Sosaria, first, seen or not', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.party.location = Location.Town;
    world.enterMap(YEW);
    const marks = marksOn(world, { kind: 'map', id: MapId.Sosaria });
    expect(marks[0]).toMatchObject({ kind: 'towne', label: 'Yew', party: true, opens: YEW, detail: 'Party inside' });
    expect(marks.some((m) => m.kind === 'party')).toBe(false);
    // On the town's own page the party stands where it is.
    expect(marksOn(world, { kind: 'map', id: YEW })[0]).toMatchObject({ kind: 'party', x: world.x, y: world.y });
    expect(mapPages(world)).toEqual([
      { kind: 'map', id: YEW },
      { kind: 'map', id: MapId.Sosaria },
    ]);
  });

  it('marks the moongates the party has come out of, with the moon that opens each', () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.gatesKnown = [0, 5];
    const gates = marksOn(world, { kind: 'map', id: MapId.Sosaria }).filter((m) => m.kind === 'moongate');
    expect(gates.map((g) => [g.x, g.y, g.phase])).toEqual([
      [world.resources.misc.moonX[0], world.resources.misc.moonY[0], 0],
      [world.resources.misc.moonX[5], world.resources.misc.moonY[5], 5],
    ]);
  });

  it("marks Ambrosia's shrines once seen, and names one once the party has been in it", () => {
    const world = newWorld();
    world.autoMap = new AutoMap();
    world.autoMap.markSquares(MapId.Ambrosia, [
      [6, 6],
      [55, 27],
    ]);
    world.autoMap.visit('shrine:6,6');
    const shrines = marksOn(world, { kind: 'map', id: MapId.Ambrosia }).filter((m) => m.kind === 'shrine');
    expect(shrines).toHaveLength(2);
    expect(shrines[0].label).toMatch(/^Shrine of [A-Z][a-z]+$/);
    expect(shrines[1].label).toBe('Shrine?');
    expect(mapPages(world).some((p) => p.id === MapId.Ambrosia)).toBe(true);
  });
});

describe("the map's cursor and coasts", () => {
  const mark = (x: number, y: number): MapMark => ({ kind: 'towne', x, y, label: '', detail: '' });

  it('steps to the nearest mark the way the d-pad points, across the edge where the map wraps', () => {
    const marks = [mark(10, 10), mark(14, 10), mark(10, 30), mark(60, 11)];
    expect(stepMark(marks, 0, 'right')).toBe(1);
    expect(stepMark(marks, 0, 'down')).toBe(2);
    expect(stepMark(marks, 0, 'left')).toBe(3); // 60 is 14 to the left, round the edge
    expect(stepMark(marks, 0, 'left', MAP_SIDE, false)).toBe(0); // a town does not wrap: nothing that way
    expect(stepMark(marks, 0, 'up')).toBe(0);
  });

  it("draws an island's coast round it, between its centre and the water's", () => {
    const land = (x: number, y: number) => x === 1 && y === 1;
    const coast = coastSegments(land, 3, false);
    expect(coast).toHaveLength(4);
    // Every end is half a square from the island's centre (1.5, 1.5), on a diagonal.
    for (const [x1, y1, x2, y2] of coast) {
      expect(Math.abs(x1 - 1.5) + Math.abs(y1 - 1.5)).toBe(0.5);
      expect(Math.abs(x2 - 1.5) + Math.abs(y2 - 1.5)).toBe(0.5);
    }
    expect(coastSegments(() => true, 4, true)).toEqual([]);
  });
});

describe("the map's dungeon levels", () => {
  it('turns up and down to the levels the party has been on, past those it fell through', () => {
    const world = newWorld();
    const id = 410;
    world.autoMap.visitLevel(id, 0);
    world.autoMap.visitLevel(id, 3); // fell from the first to the fourth
    world.autoMap.visitLevel(id, 4);
    world.dungeon.level = 3;
    const page: MapPage = { kind: 'dungeon', id, level: 3 };
    expect(levelPage(world, page, -1)).toEqual({ kind: 'dungeon', id, level: 0 });
    expect(levelPage(world, page, 1)).toEqual({ kind: 'dungeon', id, level: 4 });
    expect(levelPage(world, { ...page, level: 4 }, 1)).toBeNull();
    expect(levelPage(world, { kind: 'map', id: MapId.Sosaria }, 1)).toBeNull();
  });

  it('marks the party on its own level only', () => {
    const world = newWorld();
    world.party.location = Location.Dungeon;
    world.dungeon.level = 3;
    expect(marksOn(world, { kind: 'dungeon', id: 410, level: 3 }).map((m) => m.kind)).toEqual(['party']);
    expect(marksOn(world, { kind: 'dungeon', id: 410, level: 0 })).toEqual([]);
  });
});

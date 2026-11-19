import { describe, it, expect } from 'vitest';
import { newWorld } from './helpers.ts';
import { AutoMap } from '../src/game/automap.ts';
import { aroundParty, levelShape, wholeLevel } from '../src/game/dungeonLayout.ts';
import { DungeonCell } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';

const MINES = 417;
const DARDIN = 418;
const cellAt = (x: number, y: number): number => ((y & 15) << 4) | (x & 15);

/** The party on a level of a dungeon, lit, with its map blank or as if every passage had been walked with a torch. */
function onLevel(id: number, level: number, seen: 'all' | 'none' = 'all') {
  const world = newWorld();
  world.enterDungeon(id);
  world.party.location = Location.Dungeon;
  world.dungeon.level = level;
  world.dungeon.torch = 50;
  world.autoMap = new AutoMap();
  const open = (c: number) => world.getXYDng(c & 15, c >> 4) !== DungeonCell.Wall;
  if (seen === 'all') for (let c = 0; c < 256; c++) if (open(c)) world.autoMap.mark(id, level, c & 15, c >> 4);
  const standOn = (c: number) => ([world.x, world.y] = [c & 15, c >> 4]);
  return { world, open, standOn };
}

describe("a dungeon level's shape", () => {
  it('finds the seam fifty levels were laid out in, the passage across Mines of Morinia 4, and the five that loop', () => {
    const world = newWorld();
    const shapes: string[] = [];
    for (let id: number = MapId.FirstDungeon; id <= MapId.LastDungeon; id++) {
      const raw = world.resources.maps.get(id)!;
      for (let l = 0; l < 8; l++) {
        const { seamX, seamY, loops } = levelShape(raw.subarray(l * 256, l * 256 + 256));
        if (seamX === 0 && seamY === 0 && !loops) continue;
        shapes.push(`${id}.${l + 1}: ${seamX} ${seamY}${loops ? ' loops' : ''}`);
      }
    }
    expect(shapes).toEqual([
      `${MINES}.2: null null loops`,
      `${MINES}.3: null null loops`,
      `${MINES}.4: 0 null`,
      `${MINES}.7: null null loops`,
      `${DARDIN}.1: null null loops`,
      `${DARDIN}.4: null null loops`,
    ]);
  });
});

describe('the map round the party', () => {
  it('draws the wall at the east edge beside the party, and not on the far side of the level', () => {
    const { world, standOn } = onLevel(MapId.FirstDungeon, 0, 'none');
    // Down the east edge, column 15, the seam (column 0) east of it: walked with a torch.
    const row = [...Array(16).keys()].find((y) => world.getXYDng(15, y) !== DungeonCell.Wall)!;
    standOn(cellAt(15, row));
    world.autoMap.mark(world.current.id, 0, 15, row);
    const at = aroundParty(world);
    expect(at(1, 0)).toBe(cellAt(0, row)); // the seam's wall, beside the party
    expect(at(-15, 0)).toBe(-1); // not again 15 west, where it bounds column 1, which has not been seen
    expect(at(2, 0)).toBe(-1); // nor column 1 past it
    expect(at(0, 0)).toBe(cellAt(15, row));
  });

  it('feels the wall beside it in the dark, on the side it is on', () => {
    const { world, standOn } = onLevel(MapId.FirstDungeon, 0, 'none');
    world.dungeon.torch = 0;
    const row = [...Array(16).keys()].find((y) => world.getXYDng(15, y) !== DungeonCell.Wall)!;
    standOn(cellAt(15, row));
    const at = aroundParty(world);
    expect(at(1, 0)).toBe(cellAt(0, row));
    expect(at(-15, 0)).toBe(-1);
  });

  it('is the whole level moved round the party, on every walled level, wherever it stands', () => {
    const differ: string[] = [];
    for (let id: number = MapId.FirstDungeon; id <= MapId.LastDungeon; id++) {
      for (let level = 0; level < 8; level++) {
        const { world, open, standOn } = onLevel(id, level);
        const shape = levelShape(world.dungeon.tiles.subarray(level * 256, level * 256 + 256));
        if (shape.seamX === null || shape.seamY === null) continue;
        for (let c = 0; c < 256; c += 3) {
          if (!open(c)) continue;
          standOn(c);
          const [at, whole] = [aroundParty(world), wholeLevel(world)];
          const [px, py] = whole.party!;
          for (let j = -12; j <= 12; j++) {
            for (let i = -12; i <= 12; i++) {
              const [col, row] = [px + i, py + j];
              const inside = col >= 0 && col < whole.cols && row >= 0 && row < whole.rows;
              if (at(i, j) !== (inside ? whole.at(col, row) : -1)) differ.push(`${id}.${level + 1} from ${c} at ${i},${j}`);
            }
          }
        }
      }
    }
    expect(differ).toEqual([]);
  }, 30_000);

  it("draws the level's other parts where they lie", () => {
    // Doom 3 has two parts, reached by different ladders.
    const { world, open, standOn } = onLevel(MapId.FirstDungeon, 2);
    const walk = (from: number) => {
      const part = new Set([from]);
      for (const c of part) {
        for (const n of [
          cellAt((c & 15) + 1, c >> 4),
          cellAt((c & 15) - 1, c >> 4),
          cellAt(c & 15, (c >> 4) + 1),
          cellAt(c & 15, (c >> 4) - 1),
        ]) {
          if (open(n)) part.add(n);
        }
      }
      return part;
    };
    const first = [...Array(256).keys()].find(open)!;
    const one = walk(first);
    const other = [...Array(256).keys()].find((c) => open(c) && !one.has(c))!;
    standOn(first);
    const at = aroundParty(world);
    expect(at((other & 15) - (first & 15), (other >> 4) - (first >> 4))).toBe(other);
  });

  it('runs a passage on across an edge it crosses, and draws it only where it runs', () => {
    // Mines of Morinia 4: a passage across its top and bottom edges.
    const { world, open, standOn } = onLevel(MINES, 3);
    const x = [...Array(16).keys()].find((x) => open(cellAt(x, 15)) && open(cellAt(x, 0)))!;
    standOn(cellAt(x, 15));
    const at = aroundParty(world);
    expect(at(0, 1)).toBe(cellAt(x, 0)); // over the edge, south of the party, where the passage goes
    expect(at(0, -15)).toBe(-1); // not again where the grid keeps it
  });

  it('goes on past its edges as it begins, where the level loops', () => {
    const { world, open, standOn } = onLevel(DARDIN, 0);
    standOn([...Array(256).keys()].find(open)!);
    const at = aroundParty(world);
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) expect(at(i + 16, j)).toBe(at(i, j));
  });
});

describe('the whole level, for the View map', () => {
  it("is cut at the level's seams, its wall at both ends where a passage beside it is seen", () => {
    const { world, standOn } = onLevel(MapId.FirstDungeon, 0, 'none');
    const row = [...Array(16).keys()].find((y) => world.getXYDng(15, y) !== DungeonCell.Wall)!;
    standOn(cellAt(15, row));
    world.autoMap.mark(world.current.id, 0, 15, row);
    const whole = wholeLevel(world);
    expect([whole.cols, whole.rows]).toEqual([17, 17]);
    expect(whole.party).toEqual([15, row]);
    expect(whole.at(16, row)).toBe(cellAt(0, row)); // the seam east of the party
    expect(whole.at(0, row)).toBe(-1); // and not at the west end, column 1 there unseen
    expect(whole.at(15, row)).toBe(cellAt(15, row));
  });

  it('is the level as it is kept where it loops', () => {
    const { world, open, standOn } = onLevel(DARDIN, 0);
    standOn([...Array(256).keys()].find(open)!);
    const whole = wholeLevel(world);
    expect([whole.cols, whole.rows]).toEqual([16, 16]);
    expect(whole.party).toEqual([world.x, world.y]);
    for (let c = 0; c < 256; c++) expect(whole.at(c & 15, c >> 4)).toBe(c);
  });
});

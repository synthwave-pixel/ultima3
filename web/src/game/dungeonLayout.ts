/**
 * dungeonLayout.ts
 *
 * Where the dungeon's maps draw each cell of a level (this port's, after the Ultima V port's dungeonMap.ts). A level
 * is sixteen cells a side and wraps: a step off one edge comes in at the other, and the first-person view at an edge
 * looks across it. Fifty of the game's 56 levels were laid out inside a wall along their first column and row, which
 * bounds them on both sides through the wrap; Mines of Morinia's fourth has a passage across its top and bottom
 * edges, and five levels (Morinia's second, third and seventh, Dardin's Pit's first and fourth) have passages right
 * round. A map drawing the grid as it is kept puts the wall beside a party at the east edge on the far west.
 *
 * So each level is looked at for its seams - a column or row of wall all the way across, which no passage crosses -
 * and whether its passages loop (`levelShape`), and drawn by them:
 *
 * - round the party (`aroundParty`: Top down, and the 5x5 map beside the first-person view), the party in the middle
 *   and the level moving round it: its passages walked out from where the party stands, each cell drawn where it lies
 *   from the party and never again where the grid wraps it round, and the rock beside them; the level's other parts
 *   (reached by other ladders) where they lie by its seams, or the nearer way round across an edge with none. Where
 *   the passages loop round the level it goes on past its edges as it begins.
 * - the whole level (`wholeLevel`: View map), still: cut at its seams, a seam's wall drawn at both ends, beside the
 *   passages it bounds at each; along an edge its passages cross, as it is kept.
 *
 * Only what the auto-map shows (automap.ts cellVisible) is drawn; a seam's wall at one end only where a passage beside
 * it there is shown too, so walking one edge does not draw the other.
 */

import type { World } from './world.ts';
import { DungeonCell } from './world.ts';
import { cellVisible, dungeonTiles, partyOn } from './automap.ts';

const SIDE = 16;

/** A cell's place in the level's grid (y * 16 + x), wrapped. */
const at16 = (x: number, y: number): number => ((y & 15) << 4) | (x & 15);

/** Whether the party can go through a cell: anything but a plain wall (doors, secret ones too, it walks through). */
const passable = (value: number): boolean => value !== DungeonCell.Wall;

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface LevelShape {
  /** The column of wall all the way down the level, which no passage crosses; null where they run across its sides. */
  seamX: number | null;
  /** The row of wall all the way across it; null where passages run across its top and bottom. */
  seamY: number | null;
  /** Whether a passage runs right round the level into itself, so that the level goes on for ever. */
  loops: boolean;
}

/** A level's 256 cells: the current one's, or `level`'s of dungeon `id`. */
function levelCells(world: World, level = world.dungeon.level, id = world.current.id): Uint8Array {
  const from = level * SIDE * SIDE;
  return dungeonTiles(world, id).subarray(from, from + SIDE * SIDE);
}

/** Whether a piece of the passages, walked out from `start`, comes back to a cell at another place: round the level. */
function walksRound(cells: ArrayLike<number>, start: number, walked: Set<number>): boolean {
  const placed = new Map<number, [number, number]>([[start, [0, 0]]]);
  const queue: [number, number][] = [[0, 0]];
  const [sx, sy] = [start & 15, start >> 4];
  for (let q = queue.shift(); q; q = queue.shift()) {
    for (const [a, b] of STEPS) {
      const [dx, dy] = [q[0] + a, q[1] + b];
      const c = at16(sx + dx, sy + dy);
      if (!passable(cells[c])) continue;
      const was = placed.get(c);
      if (was && (was[0] !== dx || was[1] !== dy)) return true;
      if (was) continue;
      placed.set(c, [dx, dy]);
      queue.push([dx, dy]);
    }
  }
  for (const c of placed.keys()) walked.add(c);
  return false;
}

/** A level's seams and whether its passages loop: how its maps draw it. */
export function levelShape(cells: ArrayLike<number>): LevelShape {
  const solid = (cell: (k: number) => number): boolean => {
    for (let k = 0; k < SIDE; k++) if (cells[cell(k)] !== DungeonCell.Wall) return false;
    return true;
  };
  let seamX: number | null = null;
  let seamY: number | null = null;
  for (let n = SIDE - 1; n >= 0; n--) {
    if (solid((k) => at16(n, k))) seamX = n;
    if (solid((k) => at16(k, n))) seamY = n;
  }
  // With both seams no passage crosses an edge, so none can come round.
  let loops = false;
  if (seamX === null || seamY === null) {
    const walked = new Set<number>();
    for (let c = 0; c < SIDE * SIDE && !loops; c++) {
      if (passable(cells[c]) && !walked.has(c)) loops = walksRound(cells, c, walked);
    }
  }
  return { seamX, seamY, loops };
}

/** A place (i, j) cells from the party, as one number for a map's key. */
const placeKey = (i: number, j: number): number => (i + 256) * 1024 + (j + 256);

/**
 * The level round the party: the cell (y * 16 + x) to draw `i` cells east and `j` south of it, or -1 for none. Its
 * passages each where they lie from the party, the rock beside a passage shown, and nothing past a seam; where the
 * level loops, the grid round the party as the first-person view has it.
 */
export function aroundParty(world: World): (i: number, j: number) => number {
  const cells = levelCells(world);
  const shape = levelShape(cells);
  const [px, py] = [world.x & 15, world.y & 15];
  const shown = (c: number): boolean => cellVisible(world, c & 15, c >> 4);
  if (shape.loops) {
    return (i, j) => {
      const c = at16(px + i, py + j);
      return shown(c) ? c : -1;
    };
  }
  // Each passage's cell at its place from the party: its own piece walked out from it, and every other piece from
  // where it lies (its seams' way, or the nearer way round).
  const placed = new Map<number, number>();
  const walked = new Set<number>();
  const walk = (i0: number, j0: number): void => {
    const queue: [number, number][] = [[i0, j0]];
    walked.add(at16(px + i0, py + j0));
    if (!placed.has(placeKey(i0, j0))) placed.set(placeKey(i0, j0), at16(px + i0, py + j0));
    for (let q = queue.shift(); q; q = queue.shift()) {
      for (const [a, b] of STEPS) {
        const [i, j] = [q[0] + a, q[1] + b];
        const c = at16(px + i, py + j);
        if (!passable(cells[c]) || walked.has(c)) continue;
        walked.add(c);
        if (!placed.has(placeKey(i, j))) placed.set(placeKey(i, j), c);
        queue.push([i, j]);
      }
    }
  };
  walk(0, 0);
  const along = (g: number, p: number, seam: number | null): number =>
    seam === null ? ((g - p + 8) & 15) - 8 : ((g - seam) & 15) - ((p - seam) & 15);
  for (let c = 0; c < SIDE * SIDE; c++) {
    if (passable(cells[c]) && !walked.has(c)) walk(along(c & 15, px, shape.seamX), along(c >> 4, py, shape.seamY));
  }
  return (i, j) => {
    const here = placed.get(placeKey(i, j));
    if (here !== undefined) return shown(here) ? here : -1;
    // Rock, where it bounds a passage shown beside it (a corner's too).
    const c = at16(px + i, py + j);
    if (passable(cells[c]) || !shown(c)) return -1;
    for (let b = -1; b <= 1; b++) {
      for (let a = -1; a <= 1; a++) {
        const next = placed.get(placeKey(i + a, j + b));
        if (next !== undefined && shown(next)) return c;
      }
    }
    return -1;
  };
}

export interface WholeLevel {
  /** Cells across and down: 17 along a seam's way (its wall at both ends), else the level's 16. */
  cols: number;
  rows: number;
  /** Where the party is on it; null on a level it is not on. */
  party: [number, number] | null;
  /** The cell (y * 16 + x) to draw at (col, row), or -1 for none. */
  at(col: number, row: number): number;
}

/**
 * The whole level, still, for the View map: cut at its seams, each seam's wall drawn at both ends where it bounds a
 * passage shown beside it there; as it is kept along an edge its passages cross (a looping level's all round). The
 * party's level, or another level it has been on (`level` of dungeon `id`: from the dungeon, or from Sosaria's map).
 */
export function wholeLevel(world: World, level = world.dungeon.level, id = world.current.id): WholeLevel {
  const cells = levelCells(world, level, id);
  const shape = levelShape(cells);
  const shown = (c: number): boolean => cellVisible(world, c & 15, c >> 4, level, id);
  const axis = (seam: number | null) => {
    const cut = seam !== null && !shape.loops;
    return {
      cut,
      size: cut ? SIDE + 1 : SIDE,
      grid: (p: number): number => (cut ? p + seam : p) & 15,
      place: (g: number): number => (cut ? (g - seam) & 15 : g & 15),
      end: (p: number): boolean => cut && (p === 0 || p === SIDE),
      off: (p: number): boolean => cut && (p < 0 || p > SIDE),
    };
  };
  const [x, y] = [axis(shape.seamX), axis(shape.seamY)];
  return {
    cols: x.size,
    rows: y.size,
    party: partyOn(world, id, level) ? [x.place(world.x), y.place(world.y)] : null,
    at(col, row) {
      const c = at16(x.grid(col), y.grid(row));
      if (!shown(c)) return -1;
      if (!x.end(col) && !y.end(row)) return c;
      // A seam's wall at this end: where a passage beside it here is shown.
      for (let b = -1; b <= 1; b++) {
        for (let a = -1; a <= 1; a++) {
          if (x.off(col + a) || y.off(row + b)) continue;
          const next = at16(x.grid(col + a), y.grid(row + b));
          if (passable(cells[next]) && shown(next)) return c;
        }
      }
      return -1;
    },
  };
}

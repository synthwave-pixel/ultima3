/**
 * automap.ts
 *
 * What the party has seen, for the maps (this port; none of this existed in
 * the original, where players kept graph paper):
 *
 * - the dungeon auto-map: which cells of each dungeon level the party has
 *   stood next to with a lit torch;
 * - the maps of Sosaria, Ambrosia and each town and castle (worldMap.ts):
 *   every square in the party's line of sight, as the viewport shows it
 *   (`recordView`);
 * - the shrines the party has been in, so the map can name them.
 *
 * What is "seen" is only a mask. The map itself is drawn from the live
 * level data under that mask, so an opened chest or a new one shows as it
 * is now. The mask is saved with the game (save.ts, as `toText`), so a
 * save's map is what that party had seen when it was saved; a new game, or
 * Clear notes in the Organize menu, starts it blank.
 *
 * In the dark nothing is recorded, but the 3x3 around the party is still
 * shown (`cellVisible`) so a party without torches can feel its way back.
 */

import type { World } from './world.ts';
import type { Viewport } from './viewport.ts';
import { Location } from './party.ts';
import { Shape } from './tiles.ts';

/** A pluggable store: the browser's localStorage in the game, memory in tests. */
export interface AutoMapStore {
  read(): string | null;
  write(text: string): void;
}

/**
 * The dungeon's view (L): first person alone, first person with a 5x5 piece of the auto-map beside it, or the level
 * top down round the party in place of the first-person view (kept by these names in the settings; dungeonLayout.ts
 * places the cells).
 */
export type MapMode = 'off' | 'small' | 'full';
export const MAP_MODES: MapMode[] = ['off', 'small', 'full'];
/** Each view as the player is told it: on its own line in the message area, so no longer than its 16 columns. */
export const VIEW_NAMES: Record<MapMode, string> = { off: 'First person', small: '1st person + map', full: 'Top down' };

const LEVEL_CELLS = 256;
/** Sosaria, Ambrosia, the towns and the castles are all 64 squares a side. */
export const MAP_SIDE = 64;
const MAP_CELLS = MAP_SIDE * MAP_SIDE;
const MAP_PREFIX = 'map:';
const VISITS_KEY = 'visits';

/** A map's flags packed eight to a byte, as base64; and back. */
function packFlags(flags: Uint8Array): string {
  const bytes = new Uint8Array(flags.length / 8);
  flags.forEach((v, i) => {
    if (v) bytes[i >> 3] |= 1 << (i & 7);
  });
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}
function unpackFlags(text: string, cells: number): Uint8Array | null {
  let raw: string;
  try {
    raw = atob(text);
  } catch {
    return null;
  }
  if (raw.length * 8 !== cells) return null;
  const flags = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) flags[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return flags;
}

export class AutoMap {
  /** "dungeonId:level" -> 256 flags, one per cell, row-major. */
  private seen = new Map<string, Uint8Array>();
  /** A surface map's, town's or castle's id -> 4096 flags, one per square, row-major. */
  private squares = new Map<number, Uint8Array>();
  /** What else the party has been in (a shrine: "shrine:x,y"). */
  private visits = new Set<string>();

  constructor(private readonly store: AutoMapStore | null = null) {
    this.load();
  }

  /** The mask as text, for the save (save.ts): see `load` for its form. */
  toText(): string {
    const data: Record<string, string> = {};
    for (const [key, mask] of this.seen) data[key] = Array.from(mask, (v) => (v ? '1' : '0')).join('');
    for (const [id, flags] of this.squares) data[`${MAP_PREFIX}${id}`] = packFlags(flags);
    if (this.visits.size) data[VISITS_KEY] = [...this.visits].join('|');
    return JSON.stringify(data);
  }

  /** Replace the mask with one from text (`toText`'s); none, or text that is not one, is a blank map. */
  fromText(text: string | null): void {
    this.seen.clear();
    this.squares.clear();
    this.visits.clear();
    this.parse(text);
    this.save();
  }

  private levelKey(dungeon: number, level: number): string {
    return `${dungeon}:${level}`;
  }

  private levelMask(dungeon: number, level: number, create: boolean): Uint8Array | undefined {
    const key = this.levelKey(dungeon, level);
    let mask = this.seen.get(key);
    if (!mask && create) {
      mask = new Uint8Array(LEVEL_CELLS);
      this.seen.set(key, mask);
    }
    return mask;
  }

  /** Record the 3x3 around (x, y) on the level, wrapping at the edges as the dungeon does. */
  mark(dungeon: number, level: number, x: number, y: number): void {
    const mask = this.levelMask(dungeon, level, true)!;
    let changed = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((y + dy) & 0x0f) * 16 + ((x + dx) & 0x0f);
        if (!mask[i]) changed = true;
        mask[i] = 1;
      }
    }
    if (changed) this.save();
  }

  isSeen(dungeon: number, level: number, x: number, y: number): boolean {
    const mask = this.levelMask(dungeon, level, false);
    return !!mask && mask[(y & 0x0f) * 16 + (x & 0x0f)] === 1;
  }

  /** How many cells of the level have been seen (for tests and curiosity). */
  seenCount(dungeon: number, level: number): number {
    const mask = this.levelMask(dungeon, level, false);
    return mask ? mask.reduce((n, v) => n + v, 0) : 0;
  }

  /** Record that the party has stood on a level, lit or not (`levelVisited`). */
  visitLevel(dungeon: number, level: number): void {
    this.visit(`level:${dungeon}:${level}`);
  }

  /**
   * Whether the party has been on a level, if only for a moment (fallen through it in the dark, say): one the View
   * map can turn to. A save from before levels were recorded counts those it saw any of.
   */
  levelVisited(dungeon: number, level: number): boolean {
    return this.visited(`level:${dungeon}:${level}`) || this.seenCount(dungeon, level) > 0;
  }

  /** Whether any level of a dungeon has been seen: the party has been in it. */
  hasDungeon(dungeon: number): boolean {
    for (const [key, mask] of this.seen) if (key.startsWith(`${dungeon}:`) && mask.some((v) => v === 1)) return true;
    return false;
  }

  private mapFlags(mapId: number, create: boolean): Uint8Array | undefined {
    let flags = this.squares.get(mapId);
    if (!flags && create) {
      flags = new Uint8Array(MAP_CELLS);
      this.squares.set(mapId, flags);
    }
    return flags;
  }

  /** Record squares of a surface map, town or castle as seen. */
  markSquares(mapId: number, squares: Iterable<[number, number]>): void {
    const flags = this.mapFlags(mapId, true)!;
    let changed = false;
    for (const [x, y] of squares) {
      const i = (y & (MAP_SIDE - 1)) * MAP_SIDE + (x & (MAP_SIDE - 1));
      if (!flags[i]) changed = true;
      flags[i] = 1;
    }
    if (changed) this.save();
  }

  squareSeen(mapId: number, x: number, y: number): boolean {
    const flags = this.mapFlags(mapId, false);
    return !!flags && flags[(y & (MAP_SIDE - 1)) * MAP_SIDE + (x & (MAP_SIDE - 1))] === 1;
  }

  /** How many squares of a map have been seen. */
  mapSeenCount(mapId: number): number {
    const flags = this.mapFlags(mapId, false);
    return flags ? flags.reduce((n, v) => n + v, 0) : 0;
  }

  /** Whether any square of a map has been seen: for a town or castle, the party has been inside. */
  hasMap(mapId: number): boolean {
    return this.mapSeenCount(mapId) > 0;
  }

  visit(key: string): void {
    if (this.visits.has(key)) return;
    this.visits.add(key);
    this.save();
  }

  visited(key: string): boolean {
    return this.visits.has(key);
  }

  /** Forget everything: a new game starts with blank maps. */
  clear(): void {
    this.seen.clear();
    this.squares.clear();
    this.visits.clear();
    this.save();
  }

  /**
   * The store holds JSON: each dungeon level's flags as a string of 256 '0'/'1' characters ("id:level"), each map's
   * as its packed flags ("map:id"), and the visits joined by "|" ("visits"). A store from before the maps holds
   * only the levels.
   */
  private load(): void {
    if (!this.store) return;
    try {
      this.parse(this.store.read());
    } catch {
      /* an unreadable store is an empty map */
    }
  }

  private parse(raw: string | null): void {
    try {
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [key, flags] of Object.entries(data)) {
        if (typeof flags !== 'string') continue;
        if (key === VISITS_KEY) {
          for (const v of flags.split('|')) if (v) this.visits.add(v);
          continue;
        }
        if (key.startsWith(MAP_PREFIX)) {
          const id = Number(key.slice(MAP_PREFIX.length));
          const unpacked = unpackFlags(flags, MAP_CELLS);
          if (Number.isInteger(id) && unpacked) this.squares.set(id, unpacked);
          continue;
        }
        if (flags.length !== LEVEL_CELLS) continue;
        this.seen.set(
          key,
          Uint8Array.from(flags, (ch) => (ch === '1' ? 1 : 0)),
        );
      }
    } catch {
      /* a bad store is an empty map */
    }
  }

  private save(): void {
    if (!this.store) return;
    try {
      this.store.write(this.toText());
    } catch {
      /* storage unavailable */
    }
  }
}

/**
 * Whether the auto-map may show cell (x, y) of the current level (or
 * `level` of dungeon `id`): seen before, or, on the party's own level,
 * within the 3x3 around it while it is dark (shown but never recorded, so
 * torches keep their worth).
 */
export function cellVisible(world: World, x: number, y: number, level = world.dungeon.level, id = world.current.id): boolean {
  if (world.autoMap.isSeen(id, level, x, y)) return true;
  if (world.dungeon.torch > 0 || !partyOn(world, id, level)) return false;
  const dx = Math.abs(((x - world.x) & 0x0f) === 15 ? -1 : (x - world.x) & 0x0f);
  const dy = Math.abs(((y - world.y) & 0x0f) === 15 ? -1 : (y - world.y) & 0x0f);
  return dx <= 1 && dy <= 1;
}

/** Whether the party stands on `level` of dungeon `id`. */
export function partyOn(world: World, id: number, level: number): boolean {
  return world.party.location === Location.Dungeon && world.current.id === id && world.dungeon.level === level;
}

/**
 * A dungeon's eight levels: as they are now, where the party is in it, else as the game keeps them (a dungeon is
 * entered afresh each time, its chests and traps back as they were).
 */
export function dungeonTiles(world: World, id: number): Uint8Array {
  if (world.party.location === Location.Dungeon && world.current.id === id) return world.dungeon.tiles;
  return world.resources.maps.get(id)?.subarray(0, 2048) ?? new Uint8Array(2048);
}

/** The next map mode after `mode`, cycling off -> small -> full -> off. */
export function nextMapMode(mode: MapMode): MapMode {
  return MAP_MODES[(MAP_MODES.indexOf(mode) + 1) % MAP_MODES.length];
}

/**
 * Record what the party can see of the map it is on (Sosaria, Ambrosia, a town or a castle): every square of the view
 * its line of sight leaves open - viewport.ts blanks to Void whatever forest, mountains or walls hide, as the original
 * did. Nothing is recorded in a dungeon (the auto-map's cells are) or in a fight.
 */
export function recordView(world: World, view: Viewport): void {
  const where = world.party.location;
  if (where === Location.Dungeon || where === Location.Combat || world.current.size !== MAP_SIDE) return;
  // Sosaria and Ambrosia join at their edges; a town or castle does not, though the view near its edge shows the far
  // side of it (the original's wrap), which is not in sight from here and so not recorded.
  const wraps = where === Location.Sosaria || where === Location.Ambrosia;
  const side = Math.round(Math.sqrt(view.cells.length));
  const squares: [number, number][] = [];
  view.cells.forEach((cell, i) => {
    if (cell.base === Shape.Void) return;
    const [x, y] = [view.originX + (i % side), view.originY + Math.floor(i / side)];
    if (!wraps && (x < 0 || y < 0 || x >= MAP_SIDE || y >= MAP_SIDE)) return;
    squares.push([world.constrain(x), world.constrain(y)]);
  });
  world.autoMap.markSquares(world.current.id, squares);
}

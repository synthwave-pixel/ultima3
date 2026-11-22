/**
 * worldMap.ts
 *
 * The map (this port's, after the Ultima V port's), in place of the cloth map from the box: what the party has seen
 * of Sosaria, Ambrosia and each town and castle (automap.ts), each whole on the screen at once in the tile set's own
 * tiles, and in a dungeon its level's auto-map. Sosaria's unseen land and sea are a chart of its coasts in ink on
 * paper (screen.ts draws it from `coastSegments`); elsewhere what is unseen is dark.
 *
 * This module decides what is on a page - which pages there are, the marks on each, their names, and where the d-pad
 * takes the cursor among them; screen.ts draws them. A place's mark shows once its square has been seen, named once
 * the party has been inside (till then by what it looks like: "Towne?"); a moongate once the party has come out of
 * it; a shrine once seen, named once the party has been in it. The towns and Lord British's castle are marked from
 * the start, as the box's cloth map showed them, "Undiscovered" till their squares are seen (`charted`).
 */

import type { World } from './world.ts';
import { MapId } from '../data/resources.ts';
import { Location } from './party.ts';
import { MapValue } from './tiles.ts';
import { MAP_SIDE, partyOn } from './automap.ts';

export type MarkKind = 'party' | 'castle' | 'towne' | 'dungeon' | 'moongate' | 'shrine';

export interface MapMark {
  kind: MarkKind;
  x: number;
  y: number;
  /** Its name, or what it looks like where the party has not learnt it. */
  label: string;
  /** A line on it: where the party is, or what A does. */
  detail: string;
  /** The map A opens from it: a town, castle or dungeon the party has been in. */
  opens?: number;
  /** A dungeon's: the level A opens it at, the first the party has been on (up and down turn to the others). */
  opensLevel?: number;
  /** A moongate's moon phase (the Trammel phase it opens at), for its mark. */
  phase?: number;
  /** The party is here: in this place, where it is inside one (its mark blinks, as the party's own does). */
  party?: boolean;
  /** Marked from the start but its square not yet seen: the map inks a sign there (`charted`). */
  unseen?: boolean;
}

/** A page of the map: a 64-square map (Sosaria, Ambrosia, a town or castle), or a dungeon's level. */
export type MapPage = { kind: 'map'; id: number } | { kind: 'dungeon'; id: number; level: number };

const CASTLES = [MapId.LordBritishCastle, MapId.ExodusCastle] as number[];
const DAWN = 408;

/** The pages the map turns through: where the party is first, then Sosaria, then Ambrosia once the party has seen it. */
export function mapPages(world: World): MapPage[] {
  const pages: MapPage[] = [];
  if (world.party.location === Location.Dungeon) pages.push({ kind: 'dungeon', id: world.current.id, level: world.dungeon.level });
  else if (world.current.size === MAP_SIDE) pages.push({ kind: 'map', id: world.current.id });
  for (const id of [MapId.Sosaria, MapId.Ambrosia] as number[]) {
    if (pages.some((p) => p.kind === 'map' && p.id === id)) continue;
    if (id === MapId.Sosaria || world.autoMap.hasMap(id)) pages.push({ kind: 'map', id });
  }
  return pages;
}

/** A dungeon's eight levels. */
const LEVELS = 8;

/** The first level of dungeon `id` the party has been on, if any. */
export function firstLevel(world: World, id: number): number | undefined {
  for (let level = 0; level < LEVELS; level++) if (world.autoMap.levelVisited(id, level)) return level;
  return undefined;
}

/** The page A opens from a mark, if any: a town's or castle's map, or a dungeon's first level the party has been on. */
export function openedPage(mark: MapMark | undefined): MapPage | null {
  if (mark?.opens === undefined) return null;
  return mark.opensLevel !== undefined ? { kind: 'dungeon', id: mark.opens, level: mark.opensLevel } : { kind: 'map', id: mark.opens };
}

/**
 * The dungeon page a level up (`step` -1) or down (+1) from `page`: the nearest the party has been on that way, if only
 * for a moment, passing over any it has not (a fall through two); null where there is none, or on any other page.
 */
export function levelPage(world: World, page: MapPage, step: -1 | 1): MapPage | null {
  if (page.kind !== 'dungeon') return null;
  for (let level = page.level + step; level >= 0 && level < LEVELS; level += step) {
    if (world.autoMap.levelVisited(page.id, level)) return { kind: 'dungeon', id: page.id, level };
  }
  return null;
}

/** The town beside Lord British's castle, "LCB Towne" in the game's files: Britain, as the Tips and journal call it. */
const BRITAIN = 402;

/** A place's name from the game's files, its Macintosh apostrophe made plain (Britain's the port's). */
export function placeName(world: World, id: number): string {
  if (id === BRITAIN) return 'Britain';
  return (world.resources.mapNames.get(id) ?? '?').replace(/[Õ’]/g, "'");
}

/**
 * Whether a place is marked on Sosaria before its square is seen, as the box's cloth map had it: every town and Lord
 * British's castle - not Dawn, which stands only while both moons are new, nor Exodus' castle, nor a dungeon.
 */
export function charted(id: number): boolean {
  return id >= MapId.LordBritishCastle && id < MapId.FirstDungeon && id !== MapId.ExodusCastle && id !== DAWN;
}

/** What sort of place a location is. */
function placeKind(id: number): MarkKind {
  if (CASTLES.includes(id)) return 'castle';
  return id >= MapId.FirstDungeon ? 'dungeon' : 'towne';
}

/** Whether the party has been in a place: a level of a dungeon, or a square of a town or castle, seen from inside. */
export function beenIn(world: World, id: number): boolean {
  return id >= MapId.FirstDungeon && id <= MapId.LastDungeon ? world.autoMap.hasDungeon(id) : world.autoMap.hasMap(id);
}

/** What a page is called: its map's name, and in a dungeon the level. */
export function pageTitle(world: World, page: MapPage): string {
  const name = placeName(world, page.id).replace(/^Dungeon /, '');
  return page.kind === 'dungeon' ? `${name}, level ${page.level + 1}` : name;
}

/** "Strength" from "STRENGTH": a shrine's stat, as the game names it, in plain case. */
function plain(word: string): string {
  const w = word.trim().toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The squares of Ambrosia's shrines, from its map. */
export function shrines(world: World): [number, number][] {
  const raw = world.resources.maps.get(MapId.Ambrosia);
  const out: [number, number][] = [];
  if (!raw) return out;
  for (let y = 0; y < MAP_SIDE; y++) for (let x = 0; x < MAP_SIDE; x++) if (raw[1 + y * MAP_SIDE + x] === MapValue.Shrine) out.push([x, y]);
  return out;
}

/** The marks on a page: the party first, where it is on this page, then the places it shows. */
export function marksOn(world: World, page: MapPage): MapMark[] {
  const marks: MapMark[] = [];
  const seen = (x: number, y: number) => world.autoMap.squareSeen(page.id, x, y);
  const inDungeon = world.party.location === Location.Dungeon;
  if ((page.kind === 'dungeon' && partyOn(world, page.id, page.level)) || (!inDungeon && world.current.id === page.id)) {
    marks.push({ kind: 'party', x: world.x, y: world.y, label: 'The party', detail: 'You are here' });
  }
  // Inside a town, castle or dungeon, on Sosaria the party is that place's mark (below), shown seen or not.
  const inside = world.current.id >= MapId.LordBritishCastle && world.current.id <= MapId.LastDungeon ? world.current.id : -1;
  if (page.kind !== 'map') return marks;
  if (page.id === MapId.Sosaria) {
    const { locationX, locationY, moonX, moonY } = world.resources.misc;
    for (let id: number = MapId.LordBritishCastle; id <= MapId.LastDungeon; id++) {
      const [x, y] = [locationX[id - 400], locationY[id - 400]];
      const here = id === inside;
      const unseen = !here && !seen(x, y);
      if (x === 0xff || (unseen && !charted(id))) continue;
      const known = here || beenIn(world, id);
      // Dawn stands only while both moons are new: its mark is there while it stands, or once the party has been in.
      if (id === DAWN && !known && world.surface.tiles[y * MAP_SIDE + x] !== MapValue.Town) continue;
      const kind = placeKind(id);
      const opensLevel = kind === 'dungeon' ? firstLevel(world, id) : undefined;
      const opens = known && (kind !== 'dungeon' || opensLevel !== undefined) ? id : undefined;
      const looks = kind === 'castle' ? 'Castle?' : kind === 'dungeon' ? 'Dungeon?' : 'Towne?';
      const detail = here
        ? 'Party inside'
        : opens !== undefined
          ? 'A: its map'
          : known
            ? 'Been in'
            : unseen
              ? 'Undiscovered'
              : 'Not yet entered';
      const mark: MapMark = {
        kind,
        x,
        y,
        label: known ? placeName(world, id) : looks,
        detail,
        opens,
        opensLevel: opens !== undefined ? opensLevel : undefined,
        party: here || undefined,
        unseen: unseen || undefined,
      };
      if (here) marks.unshift(mark);
      else marks.push(mark);
    }
    for (const phase of world.gatesKnown) {
      marks.push({ kind: 'moongate', x: moonX[phase], y: moonY[phase], label: 'Moongate', detail: 'At this moon:', phase });
    }
  } else if (page.id === MapId.Ambrosia) {
    for (const [x, y] of shrines(world)) {
      if (!seen(x, y)) continue;
      const stat = world.resources.strings.Messages[173 + (x & 3)] ?? '';
      const known = world.autoMap.visited(`shrine:${x},${y}`);
      marks.push({
        kind: 'shrine',
        x,
        y,
        label: known ? `Shrine of ${plain(stat)}` : 'Shrine?',
        detail: known ? 'Been in' : 'Not yet entered',
      });
    }
  }
  return marks;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * The mark the d-pad takes the cursor to from `from`: the nearest the way it points, within a wide cone of it (across
 * at most twice as far as along), else the nearest that way at all; the same mark where there is none. On a map that
 * wraps (`side`: Sosaria and Ambrosia join at their edges) the way round that is shorter counts.
 */
export function stepMark(marks: MapMark[], from: number, dir: Direction, side = MAP_SIDE, wraps = true): number {
  const o = marks[from];
  if (!o) return from;
  const half = side / 2;
  const near = (d: number) => (wraps ? ((((d + half) % side) + side) % side) - half : d);
  let [best, bestCone, bestAny] = [from, Infinity, Infinity];
  let anyIndex = from;
  marks.forEach((m, i) => {
    if (i === from) return;
    const [dx, dy] = [near(m.x - o.x), near(m.y - o.y)];
    const [along, across] = dir === 'left' ? [-dx, dy] : dir === 'right' ? [dx, dy] : dir === 'up' ? [-dy, dx] : [dy, dx];
    if (along <= 0) return;
    const score = along + Math.abs(across) * 2;
    if (Math.abs(across) <= along * 2 && score < bestCone) [best, bestCone] = [i, score];
    if (score < bestAny) [anyIndex, bestAny] = [i, score];
  });
  return bestCone < Infinity ? best : anyIndex;
}

/** A segment of coast, in squares: from (x1, y1) to (x2, y2), between the centres of land and water squares. */
export type Segment = [number, number, number, number];

/**
 * The coasts of a map, for the chart: marching squares over its land and water, sampled at the squares' centres, so
 * a coast runs between the centres of a land square and the water beside it, on the diagonal where it turns. On a
 * map that wraps the cells over its edges are taken too, so a coast joins across them.
 */
export function coastSegments(isLand: (x: number, y: number) => boolean, side: number, wraps: boolean): Segment[] {
  const at = (x: number, y: number) => isLand(((x % side) + side) % side, ((y % side) + side) % side);
  const out: Segment[] = [];
  const start = wraps ? -1 : 0;
  for (let y = start; y < side - (wraps ? 0 : 1); y++) {
    for (let x = start; x < side - (wraps ? 0 : 1); x++) {
      const tl = at(x, y) ? 8 : 0;
      const tr = at(x + 1, y) ? 4 : 0;
      const br = at(x + 1, y + 1) ? 2 : 0;
      const bl = at(x, y + 1) ? 1 : 0;
      const c = tl | tr | br | bl;
      if (c === 0 || c === 15) continue;
      // The midpoints of the cell's sides, the cell's corners being the four squares' centres.
      const top: [number, number] = [x + 1, y + 0.5];
      const right: [number, number] = [x + 1.5, y + 1];
      const bottom: [number, number] = [x + 1, y + 1.5];
      const left: [number, number] = [x + 0.5, y + 1];
      const seg = (a: [number, number], b: [number, number]) => out.push([a[0], a[1], b[0], b[1]]);
      switch (c) {
        case 1:
        case 14:
          seg(left, bottom);
          break;
        case 2:
        case 13:
          seg(bottom, right);
          break;
        case 3:
        case 12:
          seg(left, right);
          break;
        case 4:
        case 11:
          seg(top, right);
          break;
        case 5:
          seg(left, top);
          seg(bottom, right);
          break;
        case 6:
        case 9:
          seg(top, bottom);
          break;
        case 7:
        case 8:
          seg(left, top);
          break;
        case 10:
          seg(top, right);
          seg(left, bottom);
          break;
      }
    }
  }
  return out;
}

/** Whether a map value is land, for the chart: everything but open water (a whirlpool and a ship are on water). */
export function isLandValue(v: number): boolean {
  return v !== MapValue.Water && v !== MapValue.Whirlpool && v !== MapValue.Frigate;
}

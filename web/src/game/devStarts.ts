/**
 * devStarts.ts
 *
 * Development starts, for `npm run dev` only (main.ts imports this only
 * there): the address bar puts the game in a place or a look, so checking a
 * fix or taking a screenshot is a page load instead of a play-through. The
 * /debug page lists them.
 *
 *   ?play                skip the title: the saved game, or with ?new a new
 *                        one (the rules asked first if they are still owed)
 *   ?at=world:X,Y        on Sosaria at (X, Y)
 *   ?at=ambrosia[:X,Y]   on Ambrosia, where the whirlpool leaves a party or
 *                        at (X, Y)
 *   ?at=place:NAME       a town, castle or dungeon, entered from its square
 *                        on Sosaria as Enter enters it (NAME as the map list
 *                        has it, any case, spaces left out; a start of it
 *                        does: yew, lcb, perinian)
 *   ?at=fight:NAME       a monster of that kind just east of the party on
 *                        Sosaria, and a step into it: the fight begins (the
 *                        party on foot on the nearest grass with the
 *                        monster's own terrain east of it, water for a sea
 *                        monster; a Pirate's crew are Thieves, as always)
 *   ?peek                nothing this page does is saved: not the game, the
 *                        auto-map, nor the settings
 *   ?tiles=NAME          this page's tile set, not saved
 *   ?walls=NAME          those walls in every dungeon (dungeonArt.ts WALLS)
 *   ?lit                 a dungeon is entered with a torch burning
 *   ?awake               the game plays on when the page loses the focus
 *                        (looks.html's pairs, side by side)
 *
 * Any ?at= skips the title as ?play does.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue } from './tiles.ts';
import { Key } from './io.ts';
import { placeMoongates } from './turn.ts';
import { MapId } from '../data/resources.ts';
import { SPAWN_TERRAIN, SPAWN_TYPES } from './monsters.ts';
import { MONSTER_SLOTS } from './monsterTable.ts';

/** A name as the starts match it: lower case, letters and digits only. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The entry of `names` that `asked` names: the same slug, else the one whose slug starts with it (or with "dungeon" and it). */
export function pickName(names: string[], asked: string): string | null {
  const q = slug(asked);
  if (!q) return null;
  const exact = names.find((n) => slug(n) === q || slug(n) === `dungeon${q}`);
  if (exact) return exact;
  const starts = names.filter((n) => slug(n).startsWith(q) || slug(n).startsWith(`dungeon${q}`));
  return starts.length === 1 ? starts[0] : null;
}

/** The tile set ?tiles= asks for, or null. */
export function tileSetAsked(asked: string | null, sets: string[]): string | null {
  return asked === null ? null : pickName(sets, asked);
}

/** A parsed ?at=. */
export type AtStart =
  | { kind: 'world' | 'ambrosia'; x: number; y: number }
  | { kind: 'place'; name: string }
  | { kind: 'fight'; name: string };

/** Read an ?at= value, or null when it is not one of the starts. */
export function parseAt(value: string | null): AtStart | null {
  if (!value) return null;
  const xy = /^(world|ambrosia):(\d+),(\d+)$/.exec(value);
  if (xy) return { kind: xy[1] as 'world' | 'ambrosia', x: Number(xy[2]) & 63, y: Number(xy[3]) & 63 };
  if (value === 'ambrosia') return { kind: 'ambrosia', x: 32, y: 54 }; // where the whirlpool leaves a party (Game.goWhirlpool)
  const named = /^(place|fight):(.+)$/.exec(value);
  if (named) return { kind: named[1] as 'place' | 'fight', name: decodeURIComponent(named[2]) };
  return null;
}

/** The monsters that roam Sosaria, by name: their map value, and the terrain they stand on. */
function roamers(world: World): Map<string, { value: number; terrain: number }> {
  const names = world.resources.strings.Tiles;
  const out = new Map<string, { value: number; terrain: number }>();
  SPAWN_TYPES.forEach((shape, i) => out.set(names[shape], { value: shape * 4, terrain: SPAWN_TERRAIN[i] ?? MapValue.Grass }));
  return out;
}

/**
 * The square nearest (x, y) for a fight start: grass for the party, with the
 * monster's own terrain (grass, or water for a sea monster) just east, and no
 * monster on either. So the monster stands where it could have spawned, and
 * nothing else on the map is written over.
 */
function fightSpot(world: World, x: number, y: number, terrain: number): { x: number; y: number } | null {
  const free = (xs: number, ys: number, value: number) => world.getXYVal(xs, ys) === value && world.monsters.at(xs, ys) < 0;
  const size = world.current.size;
  for (let d = 0; d < size / 2; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const xs = world.constrain(x + dx);
        const ys = world.constrain(y + dy);
        if (free(xs, ys, MapValue.Grass) && free(world.constrain(xs + 1), ys, terrain)) return { x: xs, y: ys };
      }
    }
  }
  return null;
}

/** The occupied slot farthest from (x, y). */
function farthestMonster(world: World, x: number, y: number): number {
  const m = world.monsters;
  let best = 0;
  let bestDistance = -1;
  for (let i = 0; i < MONSTER_SLOTS; i++) {
    const distance = Math.abs(m.x(i) - x) + Math.abs(m.y(i) - y);
    if (m.type(i) !== 0 && distance > bestDistance) [best, bestDistance] = [i, distance];
  }
  return best;
}

/** The names ?at=place: and ?at=fight: take, for the /debug page and the console. */
export function startNames(world: World): { places: string[]; fights: string[] } {
  const places = [...world.resources.mapNames.entries()].filter(([id]) => id >= 400 && id <= 418).map(([, name]) => name);
  return { places, fights: [...roamers(world).keys()] };
}

/**
 * Put the party where `at` asks (on Sosaria, or Ambrosia). Returns the key to
 * play first, if the start is to be taken by the game as a player would (the
 * Enter that goes in, the step that starts the fight), or null; a string
 * when the start is not understood, saying why.
 */
export function startAt(world: World, at: AtStart): { key: string | null } | string {
  const toSosaria = () => {
    if (world.party.location !== Location.Sosaria) {
      world.current = world.surface;
      world.party.location = Location.Sosaria;
    }
  };
  switch (at.kind) {
    case 'world':
      toSosaria();
      world.x = world.party.surfaceX = at.x;
      world.y = world.party.surfaceY = at.y;
      return { key: null };
    case 'ambrosia':
      world.enterMap(MapId.Ambrosia);
      world.party.location = Location.Ambrosia;
      world.party.shape = 0x7e; // on foot, as the whirlpool leaves a party
      world.x = at.x;
      world.y = at.y;
      return { key: null };
    case 'place': {
      const { places } = startNames(world);
      const name = pickName(places, at.name);
      if (!name) return `no place "${at.name}": ${places.join(', ')}`;
      const id = [...world.resources.mapNames.entries()].find(([, n]) => n === name)![0];
      const index = Array.from({ length: 32 }, (_, i) => i).find((i) => World.mapIdForLocation(i) === id);
      if (index === undefined) return `no square for ${name}`;
      toSosaria();
      const { locationX, locationY } = world.resources.misc;
      world.x = world.party.surfaceX = locationX[index];
      world.y = world.party.surfaceY = locationY[index];
      world.party.shape = 0x7e;
      // Dawn stands only while both moons are new.
      if (index === 8) {
        world.moonPhase = [0, 0];
        placeMoongates(world);
      }
      return { key: 'E' };
    }
    case 'fight': {
      const all = roamers(world);
      const name = pickName([...all.keys()], at.name);
      if (!name) return `no monster "${at.name}": ${[...all.keys()].join(', ')}`;
      const onSosaria = world.party.location === Location.Sosaria;
      toSosaria();
      const { value, terrain } = all.get(name)!;
      const spot = fightSpot(world, onSosaria ? world.x : world.party.surfaceX, onSosaria ? world.y : world.party.surfaceY, terrain);
      if (!spot) return `no grass beside ${terrain === MapValue.Water ? 'water' : 'grass'} for a ${name}`;
      const m = world.monsters;
      // A long-played Sosaria has every slot taken; the farthest roamer makes room.
      const slot = m.freeSlot() >= 0 ? m.freeSlot() : farthestMonster(world, spot.x, spot.y);
      if (m.type(slot) !== 0) {
        world.putXYVal(m.tileUnder(slot), m.x(slot), m.y(slot));
        m.clear(slot);
      }
      world.x = world.party.surfaceX = spot.x;
      world.y = world.party.surfaceY = spot.y;
      world.party.shape = 0x7e; // on foot: a ship's wind could refuse the step
      const x = world.constrain(spot.x + 1);
      m.setType(slot, value);
      m.setTileUnder(slot, terrain);
      m.setPosition(slot, x, spot.y);
      m.setHp(slot, 0xc0);
      m.setVariant(slot, 0);
      world.putXYVal(value, x, spot.y);
      return { key: Key.Right };
    }
  }
}

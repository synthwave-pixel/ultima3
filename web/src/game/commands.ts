/**
 * commands.ts
 *
 * The player's keyboard commands. Each function is a port of the matching
 * routine in UltimaMain.c (`North()`, `Board()`, `Enter()` ...). They print
 * their own feedback and mutate the world; the game loop runs the end-of-turn
 * processing afterwards. Commands that deal with other creatures live in
 * interact.ts, those that deal with the party's own records in actions.ts.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue, Shape, MapValue as MV } from './tiles.ts';
import { type GameIO, Key, Sound } from './io.ts';

/** 1-based indices into the Messages string table. Names match the text. */
export const Msg = {
  Dismount: 17,
  Pass: 23,
  North: 24,
  South: 25,
  East: 26,
  West: 27,
  Board: 29,
  MountHorse: 30,
  BoardFrigate: 31,
  Descend: 32,
  Enter: 33,
  EnterDungeon: 34,
  EnterTown: 35,
  EnterCastle: 36,
  Klimb: 68,
  Look: 69,
  Exit: 102,
  ExitCraft: 103,
  What: 106,
  ArrowWhat: 107,
  NotHere: 108,
  InvalidMove: 116,
  Southwest: 250,
  Southeast: 251,
  Northwest: 252,
  Northeast: 253,
} as const;

/** Party shapes (`Party[1]`). */
export const PartyShape = {
  OnFoot: 0x7e,
  Horse: 0x14,
  Frigate: 0x16,
  Whirlpool: 0x18,
} as const;

// ---------------------------------------------------------------------------
// Small shared responses
// ---------------------------------------------------------------------------

/** "WHAT?" - the command made no sense. (`What`) */
export function what(io: GameIO): void {
  io.printMessage(Msg.What);
  io.sound(Sound.Error2);
}

/** "<-WHAT?" - the command made no sense here. (`What2`) */
export function what2(io: GameIO): void {
  io.printMessage(Msg.ArrowWhat);
  io.sound(Sound.Error1);
}

/** "Not here!" (`NotHere`) */
export function notHere(io: GameIO): void {
  io.printMessage(Msg.NotHere);
  io.sound(Sound.Error1);
}

/** "INVALID MOVE!" with a bump. (`NoGo`) */
export function noGo(io: GameIO): void {
  io.printMessage(Msg.InvalidMove);
  io.sound(Sound.Bump);
  io.flushKeys();
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Compass directions as the wind code numbers them: 1 north, 2 east, 3 south, 4 west. */
type Compass = 1 | 2 | 3 | 4;

/**
 * Mirrors `ValidTrans()`: a frigate cannot sail directly into the wind.
 * (Once Exodus is destroyed the wind no longer matters.)
 */
export function validTrans(world: World, dir: Compass): boolean {
  if (world.party.exodusDestroyed) return true;
  if (world.party.shape === PartyShape.Frigate && world.windEnabled) {
    return world.windDirection === 0 || dir !== world.windDirection;
  }
  return true;
}

/**
 * Mirrors `ValidDir()`: may the party step onto a square with this map
 * value? Also applies the side effects of trying: forcefields and lava
 * damage anyone without the protecting Mark, and footsteps make a sound.
 */
export async function validDir(world: World, io: GameIO, value: number): Promise<boolean> {
  if (world.party.shape === PartyShape.Frigate) {
    return value === MapValue.Water || value === MapValue.Whirlpool;
  }

  let goodPlace = false;
  if (value === MapValue.ForceField) {
    await io.flashTiles();
    io.sound(Sound.ForceField);
    for (let m = 0; m < 4; m++) {
      if (world.party.memberSlot(m) < 0) continue;
      const p = world.member(m);
      if (!(p.marks & 0x10)) {
        // No Mark of Force: the first unprotected member takes 99 damage and the party is stopped.
        if (p.subtractHitPoints(99)) io.sound(p.sex === 'F' ? Sound.DeathFemale : Sound.DeathMale);
        await io.flashMember(m);
        io.sound(Sound.Hit);
        await io.flashTiles();
        goodPlace = false;
        break;
      }
      goodPlace = true;
    }
  }
  if (value === MapValue.Lava) {
    goodPlace = true;
    io.sound(Sound.Attack);
    for (let m = 0; m < 4; m++) {
      if (world.party.memberSlot(m) < 0) continue;
      const p = world.member(m);
      if (!(p.marks & 0x20) && p.alive) {
        if (p.subtractHitPoints(50)) io.sound(p.sex === 'F' ? Sound.DeathFemale : Sound.DeathMale);
        await io.flashMember(m);
        io.sound(Sound.Hit);
      }
    }
  }
  if (value === MapValue.MoonGate || value === MapValue.Shrine) value = MapValue.Grass;
  if (value < MapValue.Whirlpool && value !== MapValue.Water && value !== MapValue.Mountains) {
    goodPlace = true;
    io.sound(world.party.shape === PartyShape.Horse ? Sound.HorseWalk : Sound.Step);
  }
  return goodPlace;
}

interface MoveSpec {
  dx: number;
  dy: number;
  message: number;
  /** Compass directions that must not be against the wind. */
  compass: Compass[];
}

const MOVES: Record<string, MoveSpec> = {
  north: { dx: 0, dy: -1, message: Msg.North, compass: [1] },
  south: { dx: 0, dy: 1, message: Msg.South, compass: [3] },
  east: { dx: 1, dy: 0, message: Msg.East, compass: [2] },
  west: { dx: -1, dy: 0, message: Msg.West, compass: [4] },
  northeast: { dx: 1, dy: -1, message: Msg.Northeast, compass: [1, 2] },
  southeast: { dx: 1, dy: 1, message: Msg.Southeast, compass: [2, 3] },
  southwest: { dx: -1, dy: 1, message: Msg.Southwest, compass: [3, 4] },
  northwest: { dx: -1, dy: -1, message: Msg.Northwest, compass: [1, 4] },
};

export type MoveName = keyof typeof MOVES;

/** The step and message for a movement name (used by combat, which moves on the arena instead of the map). */
export function moveDelta(name: MoveName): { dx: number; dy: number; message: number } {
  const spec = MOVES[name];
  return { dx: spec.dx, dy: spec.dy, message: spec.message };
}

/**
 * What a move ran into instead of moving. A convenience this port adds:
 * the game turns each into the command a player would have typed.
 */
export type Bump =
  /** A townsperson (monster slot `index`): talk to them. */
  | { kind: 'person'; index: number }
  /** A monster (or pirate ship) on the surface: attack it. */
  | { kind: 'monster'; dx: number; dy: number }
  /** A shop counter with the merchant behind it: transact. */
  | { kind: 'counter'; dx: number; dy: number }
  /** A locked door beside the party: unlock it. */
  | { kind: 'door'; dx: number; dy: number }
  | null;

/** Is this map value a counter (a wall or letter tile) with a merchant behind it? (`Transact`) */
export function counterWithMerchant(world: World, xs: number, ys: number, dx: number, dy: number): boolean {
  const tile = world.getXYVal(xs, ys);
  if (tile < MapValue.Wall2 || tile >= MapValue.SnakeBottom) return false;
  return world.getXYVal(xs + dx, ys + dy) === MapValue.Merchant;
}

/**
 * Mirrors `North()`, `South()` ... `NorthWest()`. Returns what stood in
 * the way (see `Bump`) or null when the party moved or was simply blocked.
 */
export async function move(world: World, io: GameIO, name: MoveName): Promise<Bump> {
  const spec = MOVES[name];
  if (spec.dx !== 0) world.horseFacingEast = spec.dx > 0;
  io.printMessage(spec.message);
  if (!spec.compass.every((c) => validTrans(world, c))) {
    noGo(io);
    return null;
  }
  const xs = world.constrain(world.x + spec.dx);
  const ys = world.constrain(world.y + spec.dy);
  // Walking into a creature does what a player would have typed next. The table also holds things that are not
  // creatures (a horse, a chest, and the four Floor entries in front of Exodus, which the original walked over
  // since it only looked at the tile); those are walked onto like any other square.
  const who = world.monsters.at(xs, ys);
  if (who >= 0 && world.monsters.type(who) >= MapValue.Serpent)
    return world.inTownOrCastle ? { kind: 'person', index: who } : { kind: 'monster', dx: spec.dx, dy: spec.dy };
  if (world.inTownOrCastle) {
    if (counterWithMerchant(world, xs, ys, spec.dx, spec.dy)) return { kind: 'counter', dx: spec.dx, dy: spec.dy };
    // Doors only open sideways, as the Unlock command requires.
    if (world.getXYVal(xs, ys) === MapValue.LetterI && spec.dx !== 0 && spec.dy === 0) return { kind: 'door', dx: spec.dx, dy: spec.dy };
  }
  if (!(await validDir(world, io, world.getXYVal(world.x + spec.dx, world.y + spec.dy)))) {
    noGo(io);
    return null;
  }
  // The squares the leader came through, for the follower line (towns, castles and the overworld alike).
  world.trail = [{ x: world.x, y: world.y }, ...world.trail].slice(0, 3);
  world.x = xs;
  world.y = ys;
  return null;
}

/** Map a key press to a movement, or undefined. Arrow keys and the numeric keypad both work. */
/** The keypad digits for diagonal steps. */
export const DIAGONAL_KEYS = ['1', '3', '7', '9'];

export function moveForKey(key: string, allowDiagonal = true): MoveName | undefined {
  switch (key) {
    case Key.Up:
    case '8':
      return 'north';
    case Key.Down:
    case '2':
      return 'south';
    case Key.Right:
    case '6':
      return 'east';
    case Key.Left:
    case '4':
      return 'west';
    case '7':
      return allowDiagonal ? 'northwest' : undefined;
    case '9':
      return allowDiagonal ? 'northeast' : undefined;
    case '1':
      return allowDiagonal ? 'southwest' : undefined;
    case '3':
      return allowDiagonal ? 'southeast' : undefined;
    default:
      return undefined;
  }
}

/** An adjacent square chosen at a "Direction-" prompt. */
export interface Direction {
  xs: number;
  ys: number;
  dx: number;
  dy: number;
}

/**
 * Mirrors `GetDirection()`: after a command such as Look, ask for a
 * direction and echo its name. Returns null if the player cancels (only
 * possible with a controller; the keyboard original could not cancel). In
 * combat `allowSpace` lets the space bar mean "no direction" (dx = dy = 0).
 */
export async function getDirection(world: World, io: GameIO, allowSpace = false, allowDiagonal?: boolean): Promise<Direction | null> {
  // Diagonals follow the diagonal-moves setting unless the command says otherwise.
  allowDiagonal ??= world.diagonalMoves;
  const key = await io.chooseDirection(allowSpace, allowDiagonal);
  if (key === null || world.done) return null;
  if (key === Key.Space) {
    io.printMessage(173); // "None"
    return { xs: world.x, ys: world.y, dx: 0, dy: 0 };
  }
  const name = moveForKey(key, allowDiagonal);
  if (!name) return null;
  const spec = MOVES[name];
  io.printMessage(spec.message);
  return { xs: world.x + spec.dx, ys: world.y + spec.dy, dx: spec.dx, dy: spec.dy };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Space bar. (`Pass`) */
export function pass(io: GameIO): void {
  io.printMessage(Msg.Pass);
}

/** B: mount a horse or board a ship the party is standing on. (`Board`) */
export function board(world: World, io: GameIO): void {
  if (world.party.shape !== PartyShape.OnFoot) {
    io.printMessage(Msg.Board);
    what2(io);
    return;
  }
  const here = world.getXYVal(world.x, world.y);
  if (here === MapValue.Horse) {
    world.putXYVal(MapValue.Grass, world.x, world.y);
    world.party.shape = PartyShape.Horse;
    io.printMessage(Msg.MountHorse);
    io.sound(Sound.MountHorse);
  } else if (here === MapValue.Frigate) {
    world.putXYVal(MapValue.Water, world.x, world.y);
    world.party.shape = PartyShape.Frigate;
    io.printMessage(Msg.BoardFrigate);
  } else {
    io.printMessage(Msg.Board);
    what2(io);
  }
}

/** X: leave the horse or ship, which stays behind on the map. (`Exit`) */
export function exit(world: World, io: GameIO): void {
  if (world.party.shape === PartyShape.OnFoot) {
    io.printMessage(Msg.Exit);
    io.printMessage(Msg.What);
    io.sound(Sound.Error1);
    return;
  }
  const here = world.getXYVal(world.x, world.y);
  if (here > MapValue.Grass) {
    // Only water (for a ship) or grass (for a horse) can hold the mount.
    io.printMessage(Msg.Exit);
    io.print('\n');
    notHere(io);
    return;
  }
  world.putXYVal(world.party.shape * 2, world.x, world.y);
  io.printMessage(world.party.shape === PartyShape.Horse ? Msg.Dismount : Msg.ExitCraft);
  world.party.shape = PartyShape.OnFoot;
}

/** L: name what is on an adjacent square. (`Look`) */
export async function look(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Look);
  const dir = await getDirection(world, io);
  if (!dir) return;
  const { xs, ys } = dir;
  io.print('->');
  const value = world.getXYVal(xs, ys);
  const mon = world.monsters.at(world.constrain(xs), world.constrain(ys));
  const tiles = world.resources.strings.Tiles;
  const plurals = world.resources.strings.TilesPlural;
  if (mon < 0) {
    io.print(tiles[value >> 2] ?? '?');
  } else {
    // Monsters are named in the plural on the surface, singular in towns and castles.
    const plural = !world.inTownOrCastle;
    const type = world.monsters.type(mon) >> 1;
    const variant = world.monsters.variant(mon);
    const names = plural ? plurals : tiles;
    io.print(type > 44 && variant > 0 ? names[type - 46 + 63 + variant] : names[type >> 1]);
  }
  io.print('\n');
}

export type Entered = 'none' | 'town' | 'castle' | 'dungeon' | 'shrine';

/**
 * E: enter the town, castle or dungeon the party is standing on. (`Enter`)
 * Returns what was entered; dungeons and Ambrosia's shrines are started by
 * the caller, which owns those loops.
 */
export function enter(world: World, io: GameIO): Entered {
  const loc = world.party.location;
  if (loc !== Location.Sosaria && loc !== Location.Ambrosia) {
    io.printMessage(Msg.Enter);
    what(io);
    return 'none';
  }
  if (loc === Location.Ambrosia) {
    if (world.getXYVal(world.x, world.y) !== MV.Shrine) {
      io.printMessage(Msg.Enter);
      what2(io);
      return 'none';
    }
    return 'shrine';
  }

  const { locationX, locationY } = world.resources.misc;
  let place = -1;
  for (let i = 0; i < 32; i++) if (locationX[i] === world.x && locationY[i] === world.y) place = i;
  if (place < 0) {
    io.printMessage(Msg.Enter);
    what2(io);
    return 'none';
  }

  world.party.surfaceX = world.x;
  world.party.surfaceY = world.y;
  world.returnX = world.x;
  world.returnY = world.y;

  const tile = world.getXYVal(world.x, world.y) >> 1;
  const id = World.mapIdForLocation(place);
  if (tile === Shape.Dungeon) {
    io.printMessage(Msg.Enter);
    io.printMessage(Msg.EnterDungeon);
    world.enterDungeon(id);
    world.party.location = Location.Dungeon;
    world.x = 1;
    world.y = 1;
    world.dungeon.heading = 1;
    return 'dungeon';
  }
  if (tile === Shape.Town) {
    io.printMessage(Msg.Enter);
    io.printMessage(Msg.EnterTown);
    world.enterMap(id);
    world.party.location = Location.Town;
    world.x = 1;
    world.y = 32;
    return 'town';
  }
  if (tile === Shape.Castle) {
    io.printMessage(Msg.Enter);
    io.printMessage(Msg.EnterCastle);
    world.enterMap(id);
    world.party.location = Location.Castle;
    world.x = 32;
    world.y = 62;
    return 'castle';
  }
  what2(io);
  return 'none';
}

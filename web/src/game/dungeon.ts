/**
 * dungeon.ts
 *
 * Dungeons: a port of UltimaDngn.c. The party explores eight 16x16 levels
 * in first person. Each level's cells use the DungeonCell values: the top
 * bits mark walls and doors, the low bits mark ladders, chests and special
 * encounters (fountains, the Time Lord, marks, traps, gremlins, writing).
 *
 * `runDungeon()` is the dungeon's own command loop (`DungeonStart()`); it
 * returns when the party climbs out, casts Sequitu, or dies.
 * `buildDungeonView()` decides which walls, doors, ladders and chests are
 * visible from the party's position (`DrawDungeon()`); the renderer in
 * ui/dungeonView.ts turns that into pixels.
 */

import { World, DungeonCell } from './world.ts';
import { nextMapMode } from './automap.ts';
import { type GameIO, Key, Sound, Music, deathSound } from './io.ts';
import { what2, noGo } from './commands.ts';
import { combat } from './combat.ts';
import { cast, quickHeal, quickSafeChest, quickLight } from './spells.ts';
import { QUICK_CAST_KEY, SAFE_CHEST_KEY, LIGHT_KEY } from './context.ts';
import { ageChars } from './turn.ts';
import { checkAllDead } from './death.ts';
import { speech, otherCommand, yell } from './interact.ts';
import { hearClue, journalCheck } from './journal.ts';
import {
  getChest,
  igniteTorch,
  modifyOrder,
  negateTime,
  readyWeapon,
  wearArmour,
  volume,
  stats,
  stealDisarmFails,
  bombTrap,
} from './actions.ts';

const Msg = {
  Pass: 23,
  NoneLeft: 67,
  Dark: 150,
  TimeLord: 151,
  Fountain: 152,
  Cant: 153,
  Yuck: 154,
  Wonderful: 155,
  Argh: 156,
  Nice: 157,
  StrangeWind: 158,
  Trap: 159,
  Evaded: 160,
  RedHotRod: 161,
  LeftAMark: 162,
  Gremlins: 163,
  MistyWriting: 164,
  Advance: 165,
  Retreat: 166,
  TurnRight: 167,
  TurnLeft: 168,
  Descend: 169,
  Klimb: 170,
  InvalidCmd: 171,
  NotDngCmd: 172,
} as const;

/** Idle time before the turn passes on its own (the original: six seconds), under the Fast timer. */
const IDLE_PASS_MS = 6000;

/** Unit vectors for the four headings: north, east, south, west. (`HeadX`, `HeadY`) */
export const HEAD_X = [0, 1, 0, -1];
export const HEAD_Y = [-1, 0, 1, 0];

function invalidCommand(io: GameIO): void {
  io.printMessage(Msg.InvalidCmd);
  io.sound(Sound.Error1);
}

function notDungeonCommand(io: GameIO): void {
  io.printMessage(Msg.NotDngCmd);
  io.sound(Sound.Error1);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function stepTo(world: World, io: GameIO, heading: number, message: number): void {
  io.printMessage(message);
  const xs = (world.x + HEAD_X[heading]) & 0x0f;
  const ys = (world.y + HEAD_Y[heading]) & 0x0f;
  if (world.getXYDng(xs, ys) === DungeonCell.Wall) return noGo(io);
  world.x = xs;
  world.y = ys;
  io.redrawMap();
}

/** Messages for the compass directions, indexed by heading (north, east, south, west). */
const COMPASS_MSG = [24, 26, 25, 27];

/**
 * A move in full-map mode (this port): the arrows work as on the overworld.
 * The party turns to face the direction pressed, then steps that way, so
 * the small first-person view looks where the player is going. Inside a
 * doorway, where the original forbids turning, only along the door works.
 */
export function stepCompass(world: World, io: GameIO, heading: number): void {
  const inDoorway = world.getXYDng(world.x, world.y) >= 0xa0;
  if (inDoorway && heading !== world.dungeon.heading && heading !== ((world.dungeon.heading + 2) & 3)) {
    io.printMessage(COMPASS_MSG[heading]);
    return noGo(io);
  }
  if (!inDoorway) world.dungeon.heading = heading;
  stepTo(world, io, heading, COMPASS_MSG[heading]);
}

/** Mirrors `Forward()`. */
export function forward(world: World, io: GameIO): void {
  stepTo(world, io, world.dungeon.heading, Msg.Advance);
}

/** Mirrors `Retreat()`. */
export function retreat(world: World, io: GameIO): void {
  stepTo(world, io, (world.dungeon.heading + 2) & 3, Msg.Retreat);
}

/** Mirrors `Right()` / `Left()`. Turning is not possible inside a doorway. */
export function turn(world: World, io: GameIO, right: boolean): void {
  io.printMessage(right ? Msg.TurnRight : Msg.TurnLeft);
  if (world.getXYDng(world.x, world.y) >= 0xa0) return noGo(io);
  world.dungeon.heading = (world.dungeon.heading + (right ? 1 : 3)) & 3;
  io.redrawMap();
}

/** Mirrors `dDescend()`: down a ladder. */
export function descend(world: World, io: GameIO): void {
  io.printMessage(Msg.Descend);
  const cell = world.getXYDng(world.x, world.y);
  if (cell > 127 || !(cell & DungeonCell.LadderDown)) return invalidCommand(io);
  world.dungeon.level++;
  io.redrawMap();
}

/** Mirrors `dKlimb()`: up a ladder; from the top level this leaves the dungeon. */
export function klimb(world: World, io: GameIO): void {
  io.printMessage(Msg.Klimb);
  if (!(world.getXYDng(world.x, world.y) & DungeonCell.LadderUp)) return invalidCommand(io);
  world.dungeon.level--;
  if (world.dungeon.level >= 0 && world.dungeon.level < 8) {
    io.redrawMap();
    return;
  }
  world.dungeon.level = 0;
  world.dungeon.exit = true;
}

/** Mirrors `dPeer()`: a gem shows the level map. */
async function peer(world: World, io: GameIO): Promise<void> {
  io.print('Peer at gem!\n'); // the party's gems (this port): no "whose gem" prompt
  if (world.party.gems < 1) return io.printMessage(Msg.NoneLeft);
  world.party.gems--;
  await io.showMiniDungeon();
  io.clearTiles();
}

// ---------------------------------------------------------------------------
// The dungeon loop
// ---------------------------------------------------------------------------

/**
 * Mirrors `DungeonStart(0)`: play in the dungeon until the party leaves.
 * The caller returns the party to Sosaria afterwards.
 */
export async function runDungeon(world: World, io: GameIO): Promise<void> {
  const d = world.dungeon;
  d.torch = 0;
  d.exit = false;
  world.music = Music.Dungeon;
  io.music(Music.Dungeon);

  while (!d.exit && !world.done) {
    await checkAllDead(world, io);
    if (world.resurrecting) return;
    io.showMoons();
    io.showWind();
    if (d.torch === 0) {
      io.printMessage(Msg.Dark);
      io.clearTiles();
    } else {
      // With light, the auto-map learns the 3x3 around the party.
      world.autoMap.mark(world.current.id, d.level, world.x, world.y);
    }
    io.redrawMap();
    io.print(' ');
    io.prompt();

    const key = (await io.waitCommand('dungeon', world.timeLimit(IDLE_PASS_MS))) ?? Key.Space;
    if (world.done) return;
    if (key === Key.Escape) {
      await io.showSettings(); // no turn passes
      continue;
    }
    if (key === 'J' || key === 'j') {
      await io.showJournal(); // no turn passes
      continue;
    }
    const before = `${d.level}:${world.x}:${world.y}`;
    await dispatch(world, io, key);
    const arrived = `${d.level}:${world.x}:${world.y}` !== before;
    if (world.resurrecting || d.exit) return;

    // End of turn. (`dungeonmech`)
    if (d.level < 0) {
      d.exit = true;
      return;
    }
    await ageChars(world, io);
    io.updateStats();
    if (d.torch > 0) d.torch--;

    const cell = world.getXYDng(world.x, world.y);
    if (cell === DungeonCell.Open) {
      // Random encounters get likelier on deeper levels.
      if (world.rng.range(0, 0x82 + d.level) < 128) continue;
      const type = Math.min(6, world.rng.range(0, d.level + 2)) + 0x18;
      world.putXYDng(DungeonCell.Chest, world.x, world.y);
      await combat(world, io, type * 2, 0);
      io.clearTiles();
      continue;
    }
    await encounter(world, io, cell, arrived);
  }
}

/**
 * L: cycle the auto-map between off, a 5x5 overlay beside the text and the
 * whole level in place of the first-person view. A display change, not a
 * turn: the loop passes a turn anyway, as any dungeon command does.
 */
export function toggleMap(world: World, io: GameIO): void {
  world.mapMode = nextMapMode(world.mapMode);
  io.print(`Map: ${world.mapMode}\n`);
  world.onMapModeChange?.();
  io.redrawMap();
}

/** The dungeon key switch. Letters not usable underground say so. */
async function dispatch(world: World, io: GameIO, key: string): Promise<void> {
  switch (key.toUpperCase()) {
    case Key.Space:
      return io.printMessage(Msg.Pass);
    // With the whole level on screen the arrows are compass moves; otherwise the original's turn and advance.
    case Key.Left:
    case '4':
      return world.mapMode === 'full' ? stepCompass(world, io, 3) : turn(world, io, false);
    case Key.Right:
    case '6':
      return world.mapMode === 'full' ? stepCompass(world, io, 1) : turn(world, io, true);
    case Key.Up:
    case '8':
      return world.mapMode === 'full' ? stepCompass(world, io, 0) : forward(world, io);
    case Key.Down:
    case '2':
      return world.mapMode === 'full' ? stepCompass(world, io, 2) : retreat(world, io);
    case 'C':
      await cast(world, io);
      return;
    case QUICK_CAST_KEY:
      if (!(await quickHeal(world, io))) what2(io);
      return;
    case SAFE_CHEST_KEY:
      if (!(await quickSafeChest(world, io))) what2(io);
      return;
    case LIGHT_KEY:
      if (!(await quickLight(world, io))) what2(io);
      return;
    case 'D':
      return descend(world, io);
    case 'G':
      return getChest(world, io, 0, 'command');
    case 'I':
      return igniteTorch(world, io);
    case 'K':
      return klimb(world, io);
    case 'L':
      return toggleMap(world, io);
    case 'M':
      return modifyOrder(world, io);
    case 'N':
      return negateTime(world, io);
    case 'O':
      return otherCommand(world, io);
    case 'P':
      return peer(world, io);
    case 'R':
      return readyWeapon(world, io);
    case 'V':
      return volume(world, io);
    case 'W':
      return wearArmour(world, io);
    case 'Y':
      return yell(world, io);
    case 'Z':
      return stats(world, io);
    default:
      if (/^[A-Za-z]$/.test(key)) return notDungeonCommand(io);
      return what2(io);
  }
}

/** Special cells: the Time Lord, fountains, wind, traps, marks, gremlins, writing. (`dngnotcombat`) */
/**
 * What the party's cell does at the end of a turn. The Apple II ran this
 * every turn spent on the cell; here the Time Lord and the fountain speak
 * only when the party has just `arrived` (stepped or climbed onto the
 * cell), so turning on the spot or waiting does not bring the prompt
 * back. Step off and on again to drink more. The rest (wind, traps,
 * marks, gremlins, writing) keep the original's every-turn behaviour.
 */
async function encounter(world: World, io: GameIO, cell: number, arrived = true): Promise<void> {
  const d = world.dungeon;
  switch (cell) {
    case DungeonCell.TimeLord:
      if (!arrived) return;
      io.showImage('TimeLord');
      io.music(Music.Shrine);
      io.printMessage(Msg.TimeLord);
      await io.waitKey();
      io.print('\n');
      io.redrawMap();
      io.music(Music.Dungeon);
      world.journal.timeLord = true;
      hearClue(world, 'TimeLord');
      journalCheck(world, io);
      return;

    case DungeonCell.Fountain: {
      if (!arrived) return;
      io.showImage('Fountain');
      io.music(Music.Shrine);
      for (;;) {
        io.printMessage(Msg.Fountain);
        const n = await io.chooseMember();
        if (n < 1 || n > 4) break;
        if (!world.memberAlive(n - 1)) {
          io.printMessage(Msg.Cant);
          io.sound(Sound.Error1);
          continue;
        }
        const p = world.member(n - 1);
        switch (world.x & 0x03) {
          case 0: // poison
            p.status = 'P';
            io.printMessage(Msg.Yuck);
            await io.flashMember(n - 1);
            io.sound(Sound.Hit);
            break;
          case 1: // heal
            p.hitPoints = p.maxHitPoints;
            io.printMessage(Msg.Wonderful);
            break;
          case 2: // damage
            io.printMessage(Msg.Argh);
            if (p.subtractHitPoints(25)) io.sound(deathSound(p.sex));
            await io.flashTiles();
            await io.flashMember(n - 1);
            io.sound(Sound.Hit);
            break;
          default: // cure
            io.printMessage(Msg.Nice);
            if (p.status === 'P') p.status = 'G';
            break;
        }
        io.updateStats();
      }
      io.music(Music.Dungeon);
      io.redrawMap();
      return;
    }

    case DungeonCell.Wind:
      io.printMessage(Msg.StrangeWind);
      d.torch = 0;
      return;

    case DungeonCell.Trap:
      world.putXYDng(0, world.x, world.y);
      io.printMessage(Msg.Trap);
      io.sound(Sound.Step);
      if (stealDisarmFails(world, world.member(0))) return io.printMessage(Msg.Evaded);
      await bombTrap(world, io);
      return;

    case DungeonCell.Mark: {
      io.showImage('Rod');
      io.music(Music.Shrine);
      io.printMessage(Msg.RedHotRod);
      const n = await io.chooseMember();
      if (n >= 1 && n <= 4) {
        const p = world.member(n - 1);
        p.bytes[14] |= 1 << ((world.x & 3) + 4);
        await io.flashMember(n - 1);
        io.sound(Sound.Hit);
        if (p.subtractHitPoints(50)) io.sound(deathSound(p.sex));
        io.printMessage(Msg.LeftAMark);
      }
      io.updateStats();
      io.music(Music.Dungeon);
      io.redrawMap();
      journalCheck(world, io);
      return;
    }

    case DungeonCell.Gremlins: {
      world.putXYDng(0, world.x, world.y);
      // Gremlins steal 100 food (from the party's pool in this port).
      world.party.foodHundredths = Math.max(0, world.party.foodHundredths - 10000);
      io.sound(Sound.Ouch);
      io.printMessage(Msg.Gremlins);
      io.updateStats();
      return;
    }

    case DungeonCell.Writing:
      io.printMessage(Msg.MistyWriting);
      io.print(speech(world.current.talk, d.level + 1));
      io.print('\n');
      return;

    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// What can be seen
// ---------------------------------------------------------------------------

/** One thing to draw in the first-person view, in drawing order. */
export type DungeonDrawOp =
  | { kind: 'wall'; location: number }
  | { kind: 'door'; location: number }
  | { kind: 'ladder'; location: number; down: boolean }
  | { kind: 'chest'; location: number };

/**
 * Relative positions of the 32 view "locations", before rotating for the
 * heading. Location 0 is the party's own cell; 1 and 2 are left and right;
 * 3..5 one step ahead; 6..9 two steps; and so on up to three steps ahead.
 * (`offsetX`, `offsetY` in `DungeonBlock()`)
 */
const OFFSET_X = [0, -1, 1, -1, 0, 1, -2, -1, 1, 2, -2, -1, 0, 1, 2, -3, -2, -1, 1, 2, 3, -3, -2, -1, 0, 1, 2, 3, -2, -1, 1, 2];
const OFFSET_Y = [
  0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -3, -3, -3, -3, -3, -3, -3, -3, -3, -3, -3,
];

/** The dungeon cell at a view location, turned to face the party's heading. */
export function cellAtLocation(world: World, location: number): number {
  let dx = OFFSET_X[location];
  let dy = OFFSET_Y[location];
  for (let h = world.dungeon.heading; h > 0; h--) {
    const swap = dx;
    dx = -dy;
    dy = swap;
  }
  return world.getXYDng(world.x + dx, world.y + dy);
}

/**
 * Mirrors `DrawDungeon()`: decide what is visible. The original walked the
 * view from the party outward, stopping each line of sight at the first
 * wall. `block()` reports 0 for open floor, 255 for a wall and 1 for a door
 * directly ahead, exactly like `DungeonBlock()`, and appends the draw ops.
 */
export function buildDungeonView(world: World): DungeonDrawOp[] {
  const ops: DungeonDrawOp[] = [];
  const block = (location: number): number => {
    const cell = cellAtLocation(world, location);
    if (cell < 128) {
      if (cell & DungeonCell.LadderUp) ops.push({ kind: 'ladder', location, down: false });
      if (cell & DungeonCell.LadderDown) ops.push({ kind: 'ladder', location, down: true });
      if (cell & DungeonCell.Chest) ops.push({ kind: 'chest', location });
      return 0;
    }
    ops.push({ kind: 'wall', location });
    if (cell < 0xc0) return 255;
    ops.push({ kind: 'door', location });
    return location === 0 ? 1 : 255;
  };

  const here = block(0);
  if (here === 0) {
    // Left side, then right side, one step at a time.
    if (!(block(1) > 127 || block(3) > 127 || block(6) > 127 || block(10) > 127 || block(15) > 127)) block(21);
    if (!(block(2) > 127 || block(5) > 127 || block(9) > 127 || block(14) > 127 || block(20) > 127)) block(27);
  }
  if (here === 0 || here === 1) {
    if (block(4) === 0) {
      if (!(block(7) > 127 || block(11) > 127 || block(16) > 127)) block(22);
      if (!(block(8) > 127 || block(13) > 127 || block(19) > 127)) block(26);
      if (block(12) === 0) {
        if (!(block(17) > 127 || block(23) > 127)) block(28);
        if (!(block(18) > 127)) block(25);
        if (!(block(24) > 127)) {
          block(29);
          block(30);
        }
      }
    }
  }
  return ops;
}

/** The "misty writing" for the secret messages carved on the deepest levels. (`DrawSecretMessage`) */
export function secretMessage(world: World): string | null {
  const d = world.dungeon;
  const index = world.current.id - 412;
  let which = 0;
  if (d.level === 6 && world.x === 1 && world.y === 1 && d.heading === 3) which = index * 3 + 1;
  if (d.level === 6 && world.x === 1 && world.y === 15 && d.heading === 2) which = index * 3 + 2;
  if (d.level === 7 && world.x === 15 && world.y === 15 && d.heading === 1) which = index * 3 + 3;
  if (!which) return null;
  const text = world.resources.strings.Messages[which - 1];
  return text && text.length ? text : null;
}

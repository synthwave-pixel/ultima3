/**
 * cheats.ts
 *
 * The cheat menu behind Y on the help screen. Each cheat is a small change
 * to the world; the screen shows the list and applies the chosen one.
 * None of this existed in the original; it is a convenience for testing
 * and for players who want one.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { exitToSurface } from './turn.ts';
import type { GameIO } from './io.ts';

export interface Cheat {
  key: string;
  label: string;
  /** Whether the cheat makes sense right now (e.g. Exit dungeon only in a dungeon). */
  available(world: World): boolean;
  /** Apply it; returns a one-line confirmation. */
  apply(world: World, io: GameIO): string;
}

/** Lord British's doorstep, where a new party starts. */
const HOME_X = 42;
const HOME_Y = 20;

/**
 * Leave a dungeon by asking the dungeon loop to end; the game then returns
 * the party to the surface at `returnX/Y`, which is the dungeon's square
 * unless a cheat moved it.
 */
function leaveDungeon(world: World): void {
  world.dungeon.exit = true;
}

export const CHEATS: Cheat[] = [
  {
    key: 'R',
    label: 'Full restore',
    available: () => true,
    apply(world) {
      for (let m = 0; m < 4; m++) {
        if (world.party.memberSlot(m) < 0) continue;
        const p = world.member(m);
        p.status = 'G';
        p.hitPoints = p.maxHitPoints;
      }
      return 'Everyone is whole again.';
    },
  },
  {
    key: 'L',
    label: 'Raise every level',
    available: () => true,
    apply(world, io) {
      // What an audience with Lord British gives, to everyone at once: a level's experience and a hundred more hit points.
      for (let m = 0; m < 4; m++) {
        if (world.party.memberSlot(m) < 0) continue;
        const p = world.member(m);
        const exp = Math.min(9899, p.bytes[30] * 100 + p.bytes[31] + 100);
        p.bytes[30] = Math.floor(exp / 100);
        p.bytes[31] = exp % 100;
        const newMax = Math.min(9950, p.maxHitPoints + 100);
        p.bytes[28] = Math.floor(newMax / 256);
        p.bytes[29] = newMax % 256;
        p.hitPoints = newMax;
      }
      io.updateStats();
      return 'Everyone is a level greater.';
    },
  },
  {
    key: 'H',
    label: 'Go home (Lord British)',
    available: (world) => world.party.location !== Location.Combat,
    apply(world, io) {
      if (world.party.location === Location.Dungeon) {
        world.returnX = HOME_X;
        world.returnY = HOME_Y;
        leaveDungeon(world);
      } else if (world.inTownOrCastle) {
        world.returnX = HOME_X;
        world.returnY = HOME_Y;
        exitToSurface(world, io);
      } else {
        world.x = world.party.surfaceX = HOME_X;
        world.y = world.party.surfaceY = HOME_Y;
        world.party.shape = 0x7e; // on foot: a horse or ship stays behind
      }
      return 'Back at the castle gate.';
    },
  },
  {
    key: 'X',
    label: 'Exit dungeon',
    available: (world) => world.party.location === Location.Dungeon,
    apply(world) {
      leaveDungeon(world);
      return 'Up and out.';
    },
  },
  {
    key: 'G',
    label: 'Get 100 gold',
    available: () => true,
    apply(world) {
      world.party.gold += 100;
      return `Gold: ${world.party.gold}.`;
    },
  },
  {
    key: 'F',
    label: 'Get 100 food',
    available: () => true,
    apply(world) {
      world.addFood(100);
      return `Food: ${world.party.food}.`;
    },
  },
  {
    key: 'M',
    label: 'Get 10 gems',
    available: () => true,
    apply(world) {
      world.party.gems += 10;
      return `Gems: ${world.party.gems}.`;
    },
  },
  {
    key: 'K',
    label: 'Get 5 keys',
    available: () => true,
    apply(world) {
      world.party.keys += 5;
      return `Keys: ${world.party.keys}.`;
    },
  },
  {
    key: 'T',
    label: 'Get 5 torches',
    available: () => true,
    apply(world) {
      world.party.torches += 5;
      return `Torches: ${world.party.torches}.`;
    },
  },
];

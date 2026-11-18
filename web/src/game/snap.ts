/**
 * snap.ts
 *
 * Snap targets (Gameplay), after the Ultima V port's (issue #29): at a member's turn in a fight, the foe their attack
 * would strike without being aimed is marked - the snap target - and one button strikes it: Y on a controller, Enter
 * on a keyboard. LB and RB (or [ and ]) mark the next foe or the one before, nearest first and round, spending no turn.
 *
 * The foes a member can strike where they stand are those an attack in one of the directions they may attack in
 * (diagonals as the Diagonal moves setting allows) would reach: the one next to them, or with a sling or a bow the
 * first foe along the line, as the shot flies (combat.ts shoot); a dagger, with a spare in the party's bag to throw,
 * reaches the first along the line too. The snap target is the foe the member last struck or chose, while it can still
 * be struck from here; otherwise the nearest, the weaker of two as near, then the first in reading order.
 */

import { Key } from './io.ts';
import type { World } from './world.ts';

/** The key a snap attack is pressed as (Y in a fight, Enter on a keyboard): an attack on the snap target. */
export const SNAP_KEY = '&';
/** The controller's shoulder buttons, and [ and ] on a keyboard: the snap target before, and the next. */
export const SNAP_KEYS: Record<string, -1 | 1> = { [Key.LB]: -1, [Key.RB]: 1, '[': -1, ']': 1 };

/** Ranged weapons: sling, bow, +2 bow, +4 bow (combat.ts combatAttack). */
const RANGED = [3, 5, 9, 13];
const DAGGER = 1;

/** A foe a member can strike: the monster's index, the way to attack it, and how far it is. */
export interface SnapCandidate {
  monster: number;
  dx: number;
  dy: number;
  distance: number;
}

/** The directions `world`'s members may attack in. */
function directions(world: World): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (world.diagonalMoves || dx === 0 || dy === 0)) out.push([dx, dy]);
  return out;
}

/** The monster at (x, y) in the fight, or -1 (combat.ts monsterAt, without importing the fight). */
function monsterOn(world: World, x: number, y: number): number {
  const c = world.combat!;
  for (let i = c.monsters.length - 1; i >= 0; i--) if (c.monsters[i].hp > 0 && c.monsters[i].x === x && c.monsters[i].y === y) return i;
  return -1;
}

/** The foes `member` can strike from where they stand, nearest first, the weaker of two as near, then reading order. */
export function snapCandidates(world: World, member: number): SnapCandidate[] {
  const c = world.combat;
  if (!c) return [];
  const me = c.members[member];
  if (!me || me.x > 10 || me.y > 10) return [];
  const weapon = world.member(member).bytes[48];
  const reaches = RANGED.includes(weapon) || (weapon === DAGGER && world.party.weapons(DAGGER) > 0);
  const out: SnapCandidate[] = [];
  for (const [dx, dy] of directions(world)) {
    for (let step = 1, x = me.x + dx, y = me.y + dy; x >= 0 && x <= 10 && y >= 0 && y <= 10; step++, x += dx, y += dy) {
      const monster = monsterOn(world, x, y);
      if (monster >= 0) {
        out.push({ monster, dx, dy, distance: step });
        break;
      }
      if (!reaches) break;
    }
  }
  const at = (s: SnapCandidate) => c.monsters[s.monster];
  return out.sort((a, b) => a.distance - b.distance || at(a).hp - at(b).hp || at(a).y - at(b).y || at(a).x - at(b).x);
}

/** The snap target of `member`'s turn: the foe last struck or chosen if it can still be struck, else the first. */
export function snapTarget(world: World, member: number): SnapCandidate | null {
  const candidates = snapCandidates(world, member);
  const chosen = world.combat?.snapChosen?.[member] ?? -1;
  return candidates.find((s) => s.monster === chosen) ?? candidates[0] ?? null;
}

/** Mark the foe `step` (1 the next, -1 the one before) from `member`'s snap target, round; it is theirs from now on. */
export function stepSnapTarget(world: World, member: number, step: -1 | 1): SnapCandidate | null {
  const candidates = snapCandidates(world, member);
  if (candidates.length === 0) return null;
  const now = snapTarget(world, member);
  const at = now ? candidates.findIndex((s) => s.monster === now.monster) : -1;
  const next = candidates[(at + step + candidates.length) % candidates.length];
  noteSnapTarget(world, member, next.monster);
  return next;
}

/** `member` struck or chose `monster`: their snap target while it can be struck. */
export function noteSnapTarget(world: World, member: number, monster: number): void {
  const c = world.combat;
  if (!c) return;
  c.snapChosen ??= [-1, -1, -1, -1];
  c.snapChosen[member] = monster;
}

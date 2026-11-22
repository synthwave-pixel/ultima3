/**
 * whom.ts
 *
 * Where a "Who?" prompt starts (this port): on the member the command most likely wants - the likeliest to pass a
 * thief's check, the most hurt for a heal, the poisoned for a cure, the fallen for a resurrection - the arrows still
 * free to go to anyone (screen.ts chooseMember's `preferred`). Ties go to the member with the most hit points, then
 * to the first in marching order. Where nobody fits, the prompt starts on the first member, as it always did.
 */

import type { World } from './world.ts';
import type { PlayerRecord } from './player.ts';

/** A member's class, by its place in the career table. */
function classIndex(world: World, p: PlayerRecord): number {
  return String.fromCharCode(...world.resources.misc.careerTable).indexOf(p.classLetter);
}

/** Fighters, thieves and barbarians have no magic. */
export function hasMagic(world: World, p: PlayerRecord): boolean {
  return ![0, 3, 5].includes(classIndex(world, p));
}

/**
 * A member's knack for stealing and disarming (`StealDisarmFail`): their dexterity, a thief's big bonus, and a
 * smaller one for barbarians, illusionists, rangers and alchemists. A roll of 0 to 255 at or under it passes.
 */
export function knack(world: World, p: PlayerRecord): number {
  const c = classIndex(world, p);
  let factor = p.dexterity;
  if (c === 3) factor += 0x80;
  if (c === 5 || c === 7 || c === 10 || c === 9) factor += 0x40;
  return factor;
}

/**
 * The member who fits best: of those `fits` lets through, the highest `score`, then the most hit points, then the
 * first in marching order. Undefined where none fits.
 */
function best(world: World, fits: (m: number) => boolean, score: (m: number) => number = () => 0): number | undefined {
  let pick: number | undefined;
  let [topScore, topHp] = [-Infinity, -Infinity];
  for (let m = 0; m < 4; m++) {
    if (world.party.memberSlot(m) < 0 || !fits(m)) continue;
    const [s, hp] = [score(m), world.member(m).hitPoints];
    if (pick === undefined || s > topScore || (s === topScore && hp > topHp)) [pick, topScore, topHp] = [m, s, hp];
  }
  return pick;
}

/**
 * The living member likeliest to pass a steal-and-disarm check (`knack`): for Get chest and Steal, and a dungeon's
 * trap, which nobody chooses to meet (the original asked the first in marching order, dead or alive). Between equals,
 * the first in marching order, so the same member is offered chest after chest (by hit points, it moved with every
 * wound). The first member where none is living.
 */
export function nimblestMember(world: World): number {
  let pick: number | undefined;
  let top = -Infinity;
  for (let m = 0; m < 4; m++) {
    if (world.party.memberSlot(m) < 0 || !world.memberAlive(m)) continue;
    const k = knack(world, world.member(m));
    if (k > top) [pick, top] = [m, k];
  }
  return pick ?? 0;
}

/** The living member missing the most hit points, for a heal (as spells.ts healPlan picks its patient). */
export function mostHurt(world: World): number | undefined {
  const gap = (m: number) => world.member(m).maxHitPoints - world.member(m).hitPoints;
  return best(world, (m) => world.memberAlive(m) && gap(m) > 0, gap);
}

/** A poisoned member, for a cure. */
export function poisoned(world: World): number | undefined {
  return best(world, (m) => world.member(m).status === 'P');
}

/** A dead member, for a resurrection. */
export function fallen(world: World): number | undefined {
  return best(world, (m) => world.member(m).status === 'D');
}

/** A member turned to ashes, for a recall. */
export function ashes(world: World): number | undefined {
  return best(world, (m) => world.member(m).status === 'A');
}

/** What touching a rod costs in hit points (dungeon.ts). */
export const ROD_BURN = 50;

/**
 * A living member without the mark a rod gives (its bit of the marks) who can bear its burn, the most hit points
 * first: every member needs the Marks of Fire and Force, so the rod is passed round the party. One it would kill is
 * never the default, though any member may still be chosen.
 */
export function unmarked(world: World, bit: number): number | undefined {
  return best(world, (m) => world.memberAlive(m) && (world.member(m).marks & bit) === 0 && world.member(m).hitPoints > ROD_BURN);
}

/** The living caster with the most mana, for Cast outside a fight. */
export function bestCaster(world: World): number | undefined {
  return best(
    world,
    (m) => world.memberAlive(m) && hasMagic(world, world.member(m)),
    (m) => world.member(m).mana,
  );
}

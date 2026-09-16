/**
 * autocombat.ts
 *
 * Auto-combat: a port of LairWare's UltimaAutocombat.c. This is one of the
 * Macintosh additions rather than part of the Apple II game.
 *
 * The idea is the same as the original's: the AI never touches the fight
 * directly. Each turn it decides what the active member should do and
 * returns the keys a player would press to do it. Combat feeds those keys
 * to the normal prompts, so an automatic turn goes through exactly the same
 * code as a manual one. (The C version pushed the keys into its `Macro[]`
 * queue, which `GetKeyMouse` drained before reading the real keyboard.)
 *
 * The decision list, in priority order, per `AutoCombat()`:
 *  1. Nearly dead and in reach of a monster: step somewhere safe.
 *  2. Orcs and a wizard type: cast Repond once. Skeletons and a cleric
 *     type: cast Pontori once.
 *  3. A big threat and enough magic: the nameless wizard spell, or the
 *     cleric's ZXKUQYB against a bigger one.
 *  4. A cleric type with someone under 75 hit points: Sanctu on the weakest.
 *  5. A ranged weapon (or a wizard's Mittar): fire at a monster in line,
 *     else step to a square that lines one up next turn.
 *  6. A hand weapon: attack an adjacent monster, else step toward the nearest.
 *
 * The original's "no diagonals" preference is the diagonal-moves setting
 * here: with it off, the member neither steps, attacks nor fires diagonally,
 * though it still expects monsters to.
 */

import { World } from './world.ts';
import { Shape } from './tiles.ts';
import { Key } from './io.ts';
import { monsterAt } from './combat.ts';

/**
 * "Nearly dead": under a quarter of maximum hit points, at most 50. The
 * Mac used a flat 50, written for parties with hundreds of hit points; a
 * new character has 100, and would have spent half the fight running.
 */
function nearlyDeadAt(maxHitPoints: number): number {
  return Math.min(50, Math.max(15, Math.floor(maxHitPoints / 4)));
}
/** Sanctu is worth a turn when someone is under this share of their maximum and down by at least 20. */
const SANCTU_SHARE = 0.6;
const SANCTU_MIN_LOSS = 20;

/** Monster shapes that poison, and so count double as a threat. */
const POISONOUS = [0x1c, 0x3c, 0x38];
const ORCS = 0x30;
const SKELETONS = 0x32;
const DRAGONS = 0x3a;

/** Ranged weapons: sling, bow, +2 bow, +4 bow. */
const RANGED_WEAPONS = [3, 5, 9, 13];
const MAGIC_BOWS = [9, 13];

/** The keypad digit for a step of (dx, dy), or null for no movement. */
function directionKey(dx: number, dy: number): string | null {
  if (dx === -1 && dy === 1) return '1';
  if (dx === 0 && dy === 1) return '2';
  if (dx === 1 && dy === 1) return '3';
  if (dx === -1 && dy === 0) return '4';
  if (dx === 1 && dy === 0) return '6';
  if (dx === -1 && dy === -1) return '7';
  if (dx === 0 && dy === -1) return '8';
  if (dx === 1 && dy === -1) return '9';
  return null;
}

/** The eight neighbouring steps, orthogonal first as the original checked them. */
const NEIGHBOURS: [number, number][] = [
  [0, 1],
  [-1, 1],
  [1, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
];

/**
 * The planner for one member's turn. It is a class only so the helpers can
 * share the fight state and the predicted monster positions.
 */
class Planner {
  private readonly c;
  /** Where each monster is expected to be next turn (`futureMonX/Y`). */
  private readonly futureX: number[] = [];
  private readonly futureY: number[] = [];
  /** May this member move, attack and fire diagonally? */
  private readonly diagonals: boolean;

  constructor(
    private readonly world: World,
    private readonly member: number,
  ) {
    this.c = world.combat!;
    this.diagonals = world.diagonalMoves;
    this.setupNow();
  }

  /** Is (dx, dy) a step this member may take? */
  private allowed(dx: number, dy: number): boolean {
    return this.diagonals || dx === 0 || dy === 0;
  }

  /** Mirrors `AutoCombat()`: the keys to press, in the order to press them. */
  plan(): string[] {
    const { world, member, c } = this;
    const p = world.member(member);
    const careers = String.fromCharCode(...world.resources.misc.careerTable);
    const classIndex = careers.indexOf(p.classLetter);
    const isMulti = classIndex === 8 || classIndex === 10; // Druid, Ranger
    const isWizard = classIndex === 2 || classIndex === 6 || classIndex === 9 || isMulti; // Wizard, Lark, Alchemist
    const isCleric = classIndex === 1 || classIndex === 4 || classIndex === 7 || isMulti; // Cleric, Paladin, Illusionist
    const magic = p.mana;
    const me = c.members[member];
    const x = me.x;
    const y = me.y;

    // Multi-class members are asked "Cleric or Wizard?" after C.
    const wizardCast = (spellLetter: string) => (isMulti ? ['C', 'W', spellLetter] : ['C', spellLetter]);
    const clericCast = (spellLetter: string) => (isMulti ? ['C', 'C', spellLetter] : ['C', spellLetter]);

    // Nearly dead: run to a square no monster can reach.
    if (this.nearlyDead(member) && this.monsterCanAttack(x, y)) {
      for (const [dx, dy] of NEIGHBOURS) {
        if (!this.allowed(dx, dy)) continue;
        if (!this.monsterCanAttack(x + dx, y + dy) && !this.occupied(x + dx, y + dy)) return [directionKey(dx, dy)!];
      }
      // Nowhere to run: fight on.
    }

    // Repond against orcs, Pontori against skeletons, once per fight.
    if (c.monsterShape === ORCS && !world.spellFlags.repond && isWizard) return wizardCast('A');
    if (c.monsterShape === SKELETONS && !world.spellFlags.pontori && isCleric) return clericCast('A');

    // The big spells when the threat is big.
    if (magic >= 75 && isWizard && this.threatValue() > 60) return wizardCast('P');
    if (magic >= 70 && isCleric && this.threatValue() > 80) return clericCast('O');

    // Sanctu for whoever needs it most, if anyone really does.
    if (magic >= 10 && isCleric) {
      let worst = 1;
      let lowest = -1;
      for (let m = 0; m < 4; m++) {
        if (!world.memberAlive(m)) continue;
        const q = world.member(m);
        const share = q.hitPoints / Math.max(1, q.maxHitPoints);
        if (share < worst && q.maxHitPoints - q.hitPoints >= SANCTU_MIN_LOSS) {
          worst = share;
          lowest = m;
        }
      }
      if (lowest >= 0 && worst < SANCTU_SHARE) return [...clericCast('C'), String(lowest + 1)];
    }

    // Ranged attacks: a missile weapon, or Mittar for a wizard without a magic bow.
    const weapon = p.bytes[48];
    const castMittar = magic >= 5 && isWizard && !MAGIC_BOWS.includes(weapon);
    if (RANGED_WEAPONS.includes(weapon) || castMittar) {
      const dir = this.monsterLinedUp(x, y);
      if (dir !== null) return castMittar ? [...wizardCast('B'), dir] : ['A', dir];
      if (this.nearlyDead(member)) return [Key.Space];
      return [this.lineUpToMonster()];
    }

    // Hand to hand: strike whatever is adjacent; a wounded member who could
    // not get away fights back rather than standing there (the Mac passed).
    const adjacent = this.monsterNearby(x, y);
    if (adjacent !== null) return ['A', adjacent];
    // A wounded member does not go looking for trouble.
    if (this.nearlyDead(member)) return [Key.Space];
    return [this.dirToNearestMonster()];
  }

  /** Mirrors `ThreatValue()`: the experience value of the monsters left, doubled if they poison. */
  threatValue(): number {
    const { c, world } = this;
    const each = world.resources.misc.experience[(c.monsterShape >> 1) & 0x0f];
    let total = 0;
    for (const m of c.monsters) if (m.hp > 0) total += each;
    if (POISONOUS.includes(c.monsterShape)) total *= 2;
    return total;
  }

  /** Mirrors `MonsterNearby()`: the direction of an adjacent monster, or null. */
  monsterNearby(x: number, y: number): string | null {
    const order: [number, number][] = [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dx, dy] of order) {
      if (!this.allowed(dx, dy)) continue;
      if (monsterAt(this.c, x + dx, y + dy) >= 0) return directionKey(dx, dy)!;
    }
    return null;
  }

  /** Mirrors `MonsterCanAttack()`: is (x, y) next to a monster, or in a dragon's line of fire? */
  monsterCanAttack(x: number, y: number): boolean {
    const { c } = this;
    for (const [dx, dy] of NEIGHBOURS) if (monsterAt(c, x + dx, y + dy) >= 0) return true;
    if (c.monsterShape === DRAGONS) {
      for (const m of c.monsters) {
        if (m.hp > 0 && Math.abs(m.x - x) === Math.abs(m.y - y)) return true;
      }
    }
    return false;
  }

  /** Mirrors `NearlyDead(who)` for one member, scaled to their maximum (see `nearlyDeadAt`). */
  nearlyDead(member: number): boolean {
    const p = this.world.member(member);
    return p.hitPoints < nearlyDeadAt(p.maxHitPoints);
  }

  /** Mirrors `SetupNow()`: predict no movement. */
  setupNow(): void {
    for (let i = 0; i < 8; i++) {
      this.futureX[i] = this.c.monsters[i].x;
      this.futureY[i] = this.c.monsters[i].y;
    }
  }

  /**
   * `SetupFuture()` on the Mac guessed where each monster would step next
   * and steered members at the guess. The guess assumed each monster went
   * for its nearest member, so members chased squares that kept moving and
   * wandered round the pack. This port steers at where monsters are.
   */
  setupFuture(): void {
    this.setupNow();
  }

  /** Mirrors `FutureMonsterHere()`: a predicted monster, or a living member, at (x, y). */
  futureOccupied(x: number, y: number): boolean {
    const { c, world } = this;
    for (let i = 0; i < 8; i++) if (c.monsters[i].hp > 0 && this.futureX[i] === x && this.futureY[i] === y) return true;
    for (let m = 0; m < 4; m++) if (world.memberAlive(m) && c.members[m].x === x && c.members[m].y === y) return true;
    return false;
  }

  /**
   * Mirrors `CombatCharHere()`: a member, or a square a member cannot stand
   * on. This port also counts a monster's square, which the original did
   * not; stepping into one only wasted the turn on "INVALID MOVE!".
   */
  occupied(x: number, y: number): boolean {
    const { c } = this;
    if (x < 0 || x > 10 || y < 0 || y > 10) return true;
    const tile = c.tiles[y * 11 + x];
    if (tile !== Shape.Grass && tile !== Shape.Brush && tile !== Shape.Forest && tile !== Shape.Floor) return true;
    for (const m of c.members) if (m.x === x && m.y === y) return true;
    return monsterAt(c, x, y) >= 0;
  }

  /**
   * Mirrors `DirToNearestMonster()`, done properly: a breadth-first search
   * over the arena to the nearest square from which this member could
   * strike a monster (orthogonally adjacent, or diagonally too when
   * diagonals are allowed), stepping round comrades and walls. The Mac
   * headed straight at a guess of the monster's next square and sidestepped
   * blindly when blocked, which left members milling behind each other.
   * Returns a pass when no such square can be reached.
   */
  dirToNearestMonster(): string {
    const { c } = this;
    const me = c.members[this.member];
    const steps = NEIGHBOURS.filter(([dx, dy]) => this.allowed(dx, dy));
    const isGoal = (x: number, y: number) => steps.some(([dx, dy]) => monsterAt(c, x + dx, y + dy) >= 0);
    // Breadth-first search; `first` remembers the first step of the path to each square.
    const first = new Map<number, string>();
    const queue: [number, number][] = [];
    first.set(me.y * 11 + me.x, '');
    queue.push([me.x, me.y]);
    while (queue.length) {
      const [x, y] = queue.shift()!;
      const via = first.get(y * 11 + x)!;
      if (via && isGoal(x, y)) return via;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 10 || ny < 0 || ny > 10 || this.occupied(nx, ny) || first.has(ny * 11 + nx)) continue;
        first.set(ny * 11 + nx, via || directionKey(dx, dy)!);
        queue.push([nx, ny]);
      }
    }
    return Key.Space;
  }

  /**
   * Mirrors `LineUpToMonster()`: step to a neighbouring square from which a
   * monster will be in line next turn, trying the square nearer the middle
   * of the arena first. (The original returned a step toward the monster
   * for the diagonal squares instead of a step onto them; this port steps
   * onto them, which is what the function's comment says it does.)
   */
  lineUpToMonster(): string {
    const me = this.c.members[this.member];
    const inward = me.x < 6 ? 1 : -1;
    const candidates: [number, number][] = [
      [inward, 0],
      [-inward, 0],
      [0, -1],
      [0, 1],
      [inward, -1],
      [inward, 1],
      [-inward, -1],
      [-inward, 1],
    ];
    for (const [dx, dy] of candidates) {
      if (!this.allowed(dx, dy) || this.occupied(me.x + dx, me.y + dy)) continue;
      if (this.monsterLinedUp(me.x + dx, me.y + dy) !== null) return directionKey(dx, dy)!;
    }
    return this.dirToNearestMonster();
  }

  /**
   * Mirrors `MonsterLinedUp()` for a target square: the direction from
   * (x, y) to the nearest predicted monster on the same row, column or
   * diagonal, or null when none is lined up.
   */
  monsterLinedUp(x: number, y: number): string | null {
    const { c } = this;
    let closest = -1;
    let closestDistance = 128;
    for (let i = 0; i < 8; i++) {
      if (c.monsters[i].hp === 0) continue;
      const fx = this.futureX[i];
      const fy = this.futureY[i];
      const inLine = fx === x || fy === y || (this.diagonals && Math.abs(x - fx) === Math.abs(y - fy));
      if (!inLine) continue;
      const d = Math.abs(fx - x) + Math.abs(fy - y);
      if (d < closestDistance) {
        closestDistance = d;
        closest = i;
      }
    }
    if (closest < 0) return null;
    return directionKey(Math.sign(this.futureX[closest] - x), Math.sign(this.futureY[closest] - y));
  }
}

/**
 * Decide the active member's turn. Returns the keys to press, in order, or
 * an empty list when there is no fight.
 */
export function autoCombatKeys(world: World, member: number): string[] {
  if (!world.combat) return [];
  return new Planner(world, member).plan();
}

/**
 * monsters.ts
 *
 * Wandering monsters on the surface and NPCs in towns: spawning and
 * movement. Ports `SpawnMonster()`, `MoveMonsters()`, `GetMonsterDir()`,
 * `ValidMonsterDir()` and `GetHeading()` from UltimaMisc.c.
 *
 * Monsters are stored in two places at once, as on the Apple II: the map
 * holds the monster's value where it stands, and the monster table remembers
 * the terrain underneath so it can be restored when the monster moves.
 */

import { World } from './world.ts';
import { Behaviour } from './monsterTable.ts';
import { MapValue, Shape } from './tiles.ts';
import { VIEW_CENTRE, VIEW_SIZE } from './viewport.ts';
import { type GameIO, Sound } from './io.ts';

/**
 * Monster tiles (map value / 4) that can spawn on the surface, indexed by the
 * random draw in `spawnMonster`. `MonBegin` is the terrain each starts on:
 * sea monsters (Serpent, Man-O-War, Pirate) spawn on water, the rest on grass.
 */
const SPAWN_TYPES = [24, 23, 25, 20, 26, 27, 13, 28, 22, 14, 15, 29, 30, 24];
const SPAWN_TERRAIN = [4, 4, 4, 4, 4, 4, 0, 4, 4, 0, 0, 4, 4];

/** Callbacks the movement code needs from the game loop. */
export interface MonsterHooks {
  /** A monster has reached the party: start combat. (`AttackCode`) */
  attack(monsterIndex: number): Promise<void>;
  /** A fireball hit the party. (`BombTrap`) */
  bombTrap(): Promise<void>;
  /** Draw a fireball at viewport cell (vx, vy) for one frame. Used by shooting monsters. */
  showBall(vx: number, vy: number, background: number): Promise<void>;
}

/**
 * Sign of a distance as the 6502 saw it: the value is reduced to a byte and
 * bit 7 decides. Mirrors `GetHeading()`, but with true 8-bit wrap-around.
 * (The C port tested `value < 0` before the byte check, which sent monsters
 * the long way round when the party was more than 31 squares to their west.)
 */
export function heading(value: number): number {
  const byte = value & 0xff;
  if (byte === 0) return 0;
  return byte > 127 ? -1 : 1;
}

/**
 * Mirrors `ValidMonsterDir()`: can a monster of this type stand on this
 * terrain? Sea monsters need water; land monsters may use grass, brush,
 * forest and floor. Returns true when the move is allowed.
 */
export function monsterCanEnter(terrain: number, monsterType: number): boolean {
  const isSeaMonster = monsterType > 0x28 && monsterType < 0x40;
  if (isSeaMonster) return terrain === MapValue.Water;
  return terrain === MapValue.Grass || terrain === MapValue.Brush || terrain === MapValue.Forest || terrain === MapValue.Floor;
}

/** Result of `getMonsterDirection()`: the step a monster would take toward the party. */
export interface MonsterStep {
  /** Target square after the step. */
  xs: number;
  ys: number;
  /** Direction of the step, each -1..1. */
  dx: number;
  dy: number;
  /** Signed distance to the party (used for shooting range). */
  distX: number;
  distY: number;
}

/**
 * Mirrors `GetMonsterDir()`. On the surface the map wraps, so the distance is
 * multiplied by four before taking the sign: the 8-bit overflow then makes
 * monsters more than 32 squares away approach the short way round.
 */
export function getMonsterDirection(world: World, i: number): MonsterStep {
  const m = world.monsters;
  const distX = world.x - m.x(i);
  const distY = world.y - m.y(i);
  // `heading()` looks at bit 7 of (distance * 4), so on the 64-wide surface
  // a distance beyond 31 squares flips sign and the monster takes the short
  // way round the wrapped map.
  const scale = world.onSurface ? 4 : 1;
  const dx = heading(distX * scale);
  const dy = heading(distY * scale);
  return {
    xs: world.constrain(m.x(i) + dx),
    ys: world.constrain(m.y(i) + dy),
    dx,
    dy,
    distX,
    distY,
  };
}

/**
 * Mirrors `SpawnMonster()`: on the surface, with probability 7/135 per turn,
 * put a new monster in the highest free slot at a random spot of the right
 * terrain. While the whole party is still at 150 max HP only the three
 * weakest types appear.
 */
export function spawnMonster(world: World): void {
  if (!world.onSurface) return;
  if (world.rng.range(0, 134) < 128) return;

  const m = world.monsters;
  const slot = m.freeSlot();
  if (slot < 0) return;

  const allBeginners = world.members().every((p) => p.maxHitPoints <= 150);
  let type = world.rng.range(0, 12) & world.rng.range(0, 12);
  if (allBeginners) type = world.rng.range(0, 2);

  const x = world.rng.range(0, world.mapSize - 1);
  const y = world.rng.range(0, world.mapSize - 1);
  if (x === world.x || y === world.y) return;
  if (world.getXYVal(x, y) !== SPAWN_TERRAIN[type]) return;

  m.setType(slot, SPAWN_TYPES[type] * 4);
  m.setTileUnder(slot, SPAWN_TERRAIN[type]);
  m.setPosition(slot, x, y);
  m.setHp(slot, 0xc0);
  m.setVariant(slot, world.rng.range(0, 1) ? world.rng.range(1, 2) : 0);
  // After Exodus is destroyed monsters (other than pirates) merely wander.
  if (world.party.exodusDestroyed && m.type(slot) !== MapValue.Pirate) m.setHp(slot, 0x40);
  world.putXYVal(m.type(slot), x, y);
}

/**
 * Try to move monster `i` to the square in `step`. If that square is blocked
 * the monster tries a vertical-only step, then a horizontal-only step, and
 * otherwise stays put. Shooters fire after moving (or after failing to).
 * Mirrors the `move7AAA` block of `MoveMonsters()`.
 */
async function stepMonster(world: World, i: number, step: MonsterStep, hooks: MonsterHooks, io: GameIO): Promise<void> {
  const m = world.monsters;
  const type = m.type(i);
  const blocked = (x: number, y: number) => !monsterCanEnter(world.getXYVal(x, y), type) || m.at(x, y) >= 0;

  let { xs, ys } = step;
  if (blocked(xs, ys)) {
    // First fallback: keep x, move only in y.
    xs = m.x(i);
    if (blocked(xs, ys)) {
      // Second fallback: move only in x.
      xs = world.constrain(m.x(i) + step.dx);
      ys = m.y(i);
      if (blocked(xs, ys)) {
        if (isShooter(type)) await shoot(world, i, hooks, io);
        return;
      }
    }
  }
  if (xs === world.x && ys === world.y) return;

  // Restore the terrain, move, remember the new terrain, place the monster.
  world.putXYVal(m.tileUnder(i), m.x(i), m.y(i));
  m.setPosition(i, xs, ys);
  m.setTileUnder(i, world.getXYVal(xs, ys));
  world.putXYVal(m.displayValue(i), xs, ys);

  if (isShooter(type)) await shoot(world, i, hooks, io);
}

/** Pirates and dragons fire at the party. */
function isShooter(type: number): boolean {
  return type === MapValue.Pirate || type === MapValue.Dragon;
}

/**
 * Mirrors the `moveshoot` block: half the time, a shooter within the
 * viewport fires a ball three squares toward the party. Walls, forcefields
 * and void stop it; reaching the party triggers `bombTrap`.
 */
async function shoot(world: World, i: number, hooks: MonsterHooks, io: GameIO): Promise<void> {
  if (world.rng.range(0, 255) > 127) return;
  const step = getMonsterDirection(world, i);
  let vx = VIEW_CENTRE - step.distX;
  let vy = VIEW_CENTRE - step.distY;
  if (vx < 0 || vx >= VIEW_SIZE || vy < 0 || vy >= VIEW_SIZE) return;

  io.redrawMap();
  io.sound(Sound.Shoot);
  for (let range = 3; range > 0; range--) {
    vx += step.dx;
    vy += step.dy;
    if (vx < 0 || vx >= VIEW_SIZE || vy < 0 || vy >= VIEW_SIZE) return;
    const under = world.getXYVal(world.x - VIEW_CENTRE + vx, world.y - VIEW_CENTRE + vy) >> 1;
    if (under === Shape.Mountains || under === Shape.Wall || under === Shape.Void) return;
    await hooks.showBall(vx, vy, under);
    if (vx === VIEW_CENTRE && vy === VIEW_CENTRE) {
      await hooks.bombTrap();
      return;
    }
  }
}

/**
 * Mirrors `MoveMonsters()`. Every occupied slot gets one action per turn,
 * highest slot first. On the surface (before Exodus is destroyed) every
 * monster closes in on the party and attacks on contact. In towns and
 * castles, and on the surface afterwards, each NPC's behaviour bits decide:
 * stationary, wander randomly, follow the party, or attack.
 */
export async function moveMonsters(world: World, io: GameIO, hooks: MonsterHooks): Promise<void> {
  const m = world.monsters;
  for (let i = 31; i >= 0; i--) {
    if (m.type(i) === 0) continue;

    const hostileSurface = world.onSurface && !world.party.exodusDestroyed;
    const behaviour = hostileSurface ? Behaviour.Attack : m.behaviour(i);

    if (behaviour === Behaviour.Stationary) continue;

    if (behaviour === Behaviour.Wander) {
      if (world.rng.range(0, 255) < 128) continue;
      const xs = world.constrain(m.x(i) + heading(world.rng.range(0, 255)));
      if (xs === 0) continue; // never wander onto the exit row/column of a town
      const ys = world.constrain(m.y(i) + heading(world.rng.range(0, 255)));
      if (ys === 0) continue;
      const step: MonsterStep = { xs, ys, dx: xs - m.x(i), dy: ys - m.y(i), distX: 0, distY: 0 };
      await stepMonster(world, i, step, hooks, io);
      continue;
    }

    // Follow and Attack both head toward the party.
    const step = getMonsterDirection(world, i);
    if (behaviour === Behaviour.Attack && step.xs === world.x && step.ys === world.y) {
      await hooks.attack(i);
      return; // combat ends the monsters' turn
    }
    await stepMonster(world, i, step, hooks, io);
  }
}

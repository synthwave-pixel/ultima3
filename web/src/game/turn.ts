/**
 * turn.ts
 *
 * Everything that happens after the player's command each turn. Ports
 * `Routine6E35()` (the unnamed end-of-turn routine at Apple II address
 * $6E35), `AgeChars()`, `MoonGateUpdate()`, `HandleMoonStep()`,
 * `FinishAll()`, `DoWind()` and `WhirlPool()`.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue, Shape } from './tiles.ts';
import { type GameIO, Sound } from './io.ts';
import { spawnMonster, moveMonsters, type MonsterHooks } from './monsters.ts';
import { VIEW_CENTRE, VIEW_SIZE } from './viewport.ts';

/** Message numbers (1-based Messages table entries) used here. */
const Msg = {
  ExitToSosaria: 182,
  Poison: 183,
  Starving: 184,
  WhirlpoolSinks: 110,
};

// ---------------------------------------------------------------------------
// Moons and moongates
// ---------------------------------------------------------------------------

/**
 * Mirrors the map-mutating half of `DrawMoonGateStuff()`: put the town of
 * Dawn on the map when both moons are new, clear all eight moongate
 * squares to grass, then open the gate selected by Trammel's phase.
 */
export function placeMoongates(world: World): void {
  if (!world.onSurface) return;
  const { moonX, moonY, locationX, locationY } = world.resources.misc;
  const dawnX = locationX[8];
  const dawnY = locationY[8];
  if (world.moonPhase[0] === 0 && world.moonPhase[1] === 0) {
    world.putXYVal(MapValue.Town, dawnX, dawnY);
  } else if (world.getXYVal(dawnX, dawnY) === MapValue.Town) {
    world.putXYVal(MapValue.Forest, dawnX, dawnY);
  }
  for (let i = 0; i < 8; i++) world.putXYVal(MapValue.Grass, moonX[i], moonY[i]);
  world.putXYVal(MapValue.MoonGate, moonX[world.moonPhase[0]], moonY[world.moonPhase[0]]);
}

/** Mirrors `MoonGateUpdate()`: advance the two moon timers once per surface turn. */
export function moonGateUpdate(world: World, io: GameIO): void {
  if (!world.onSurface) return;
  const periods = [12, 4];
  for (let i = 0; i < 2; i++) {
    world.moonTimer[i]--;
    if (world.moonTimer[i] < 1) {
      world.moonTimer[i] = periods[i];
      world.moonPhase[i] = (world.moonPhase[i] + 1) % 8;
    }
  }
  io.showMoons();
  placeMoongates(world);
}

/**
 * Mirrors `HandleMoonStep()`: the party stepped onto a moongate. On the
 * surface Felucca's phase picks the destination gate; elsewhere (Ambrosia)
 * the party lands on a random grass square.
 */
export async function handleMoonStep(world: World, io: GameIO): Promise<void> {
  const { moonX, moonY } = world.resources.misc;
  if (world.onSurface) {
    const phase = world.moonPhase[1];
    world.x = moonX[phase];
    world.y = moonY[phase];
    if (!world.gatesKnown.includes(phase)) world.gatesKnown.push(phase); // View map marks the gates come out of
  } else {
    let value = 0;
    while (value !== MapValue.Grass) {
      world.x = world.rng.range(0, world.mapSize - 1);
      world.y = world.rng.range(0, world.mapSize - 1);
      value = world.getXYVal(world.x, world.y);
    }
  }
  await io.flashTiles();
  io.sound(Sound.Moongate);
  io.redrawMap();
  await io.flashTiles();
  io.sound(Sound.Moongate);
}

// ---------------------------------------------------------------------------
// Wind
// ---------------------------------------------------------------------------

/** Mirrors `DoWind()`: every 32 turns pick a new wind direction. */
export function doWind(world: World, io: GameIO): void {
  if (world.party.location === Location.Dungeon) return;
  world.windTimer--;
  const old = world.windDirection;
  if (world.windTimer < 0) {
    world.windTimer = 32;
    let next = world.windDirection;
    while (next === world.windDirection) {
      next = world.rng.range(0, 8);
      if (next > 4) next -= 4;
    }
    world.windDirection = next;
  }
  if (old !== world.windDirection) io.showWind();
}

// ---------------------------------------------------------------------------
// Ageing: food, poison, natural healing, mana regeneration
// ---------------------------------------------------------------------------

/**
 * Mirrors `AgeChars()`. Runs every turn on the surface and every fourth turn
 * elsewhere. Each living member regains mana according to class, eats a
 * little food, takes poison damage, and every tenth call heals one point.
 */
export async function ageChars(world: World, io: GameIO): Promise<void> {
  if (!world.onSurface) {
    world.ageTimer[0]--;
    if (world.ageTimer[0] > 0) return;
    world.ageTimer[0] = 4;
  }
  world.ageTimer[1]--;
  if (world.ageTimer[1] < 0) world.ageTimer[1] = 9;

  const careers = world.resources.misc.careerTable;
  const classAt = (i: number) => String.fromCharCode(careers[i]);
  const [, cleric, wizard, , paladin, , lark, illusionist, druid, alchemist, ranger] = Array.from({ length: 11 }, (_, i) => classAt(i));

  let starving = false;
  for (let m = 3; m >= 0; m--) {
    if (world.party.memberSlot(m) < 0) continue;
    const p = world.member(m);
    const c = p.classLetter;

    // Mana regenerates toward a class-dependent cap.
    if (c === wizard && p.mana < p.intelligence) p.mana++;
    if (c === cleric && p.mana < p.wisdom) p.mana++;
    if ((c === lark || c === druid || c === alchemist) && p.mana < p.intelligence >> 1) p.mana++;
    if ((c === paladin || c === illusionist || c === druid) && p.mana < p.wisdom >> 1) p.mana++;
    if (c === ranger && p.mana < p.intelligence >> 1 && p.mana < p.wisdom >> 1) p.mana++;

    if (!p.alive) continue;

    if (world.eatFromPool()) {
      // Food is the party's (this port): one warning a tick, below, and damage by the Starvation setting.
      starving = true;
      const floor = world.starvation === 'classic' ? 0 : world.starvation === 'mild' ? Math.ceil(p.maxHitPoints / 2) : p.hitPoints;
      const loss = Math.min(5, Math.max(0, p.hitPoints - floor));
      if (loss > 0 && p.subtractHitPoints(loss)) io.sound(p.sex === 'F' ? Sound.DeathFemale : Sound.DeathMale);
    }
    if (p.status === 'P' && (world.poisonKills || p.hitPoints > 1)) {
      if (p.subtractHitPoints(1)) io.sound(p.sex === 'F' ? Sound.DeathFemale : Sound.DeathMale);
      await io.flashMember(m);
      io.printMessage(Msg.Poison);
    }
    if (world.ageTimer[1] === 0) p.addHitPoints(1);
  }
  if (starving) {
    io.printMessage(Msg.Starving);
    io.sound(Sound.Hit);
  }
  io.updateStats();
}

// ---------------------------------------------------------------------------
// The whirlpool
// ---------------------------------------------------------------------------

/**
 * Mirrors `WhirlPool()`: called every idle tick, acts every fourth. The
 * whirlpool drifts across Sosaria's oceans, occasionally changing course,
 * sinks any frigate it touches, and drags the party under if it reaches them.
 */
export async function whirlpoolTick(world: World, io: GameIO, hooks: TurnHooks): Promise<void> {
  world.whirlpoolTimer--;
  if (world.whirlpoolTimer > 0) return;
  world.whirlpoolTimer = 4;
  if (!world.onSurface) return;

  const w = world.whirlpool;
  const newCourse = () => {
    const dir = world.rng.range(0, 7);
    w.dx = [0, 1, 1, 1, 0, -1, -1, -1][dir];
    w.dy = [1, 1, 0, -1, -1, -1, 0, 1][dir];
  };

  if (world.rng.range(0, 7) === 0) {
    newCourse();
  } else {
    const nx = world.constrain(w.x + w.dx);
    const ny = world.constrain(w.y + w.dy);
    const ahead = world.getXYVal(nx, ny);
    if (ahead === MapValue.Water) {
      world.putXYVal(MapValue.Whirlpool, nx, ny);
      world.putXYVal(MapValue.Water, w.x, w.y);
      w.x = nx;
      w.y = ny;
      io.redrawMap();
    } else if (ahead === MapValue.Frigate) {
      // Sink the ship: the whirlpool takes its square, water takes the old one.
      world.putXYVal(MapValue.Whirlpool, nx, ny);
      world.putXYVal(MapValue.Water, w.x, w.y);
      w.x = nx;
      w.y = ny;
      io.redrawMap();
      io.sound(Sound.Sink);
      io.printMessage(Msg.WhirlpoolSinks);
      io.print('\n');
      io.prompt();
      return;
    } else {
      newCourse();
    }
  }
  if (w.x === world.x && w.y === world.y) await hooks.goWhirlpool();
}

// ---------------------------------------------------------------------------
// End of turn
// ---------------------------------------------------------------------------

/** Callbacks into parts of the game that live outside this module. */
export interface TurnHooks extends MonsterHooks {
  /** The party has been swallowed by the whirlpool. (`GoWhirlPool`) */
  goWhirlpool(): Promise<void>;
  /** Dungeon turn processing; not yet ported. */
  dungeonTurn(): Promise<void>;
  /** Save the game at a door (this port's autosave). Return true if saved. */
  save?(): boolean;
}

/**
 * Mirrors `Routine6E6B()`: the party walked off the edge of a town or
 * castle. Return to Sosaria at the square they entered from.
 */
export function exitToSurface(world: World, io: GameIO, hooks?: TurnHooks): void {
  world.x = world.returnX;
  world.y = world.returnY;
  world.party.location = Location.Sosaria;
  world.party.surfaceX = world.x;
  world.party.surfaceY = world.y;
  world.trail = [];
  world.returnToSurface();
  // After Exodus' defeat the land creatures merely wander. (`PullSosaria`)
  if (world.party.exodusDestroyed) {
    const m = world.monsters;
    for (let i = 0; i < 32; i++) if (m.type(i) >= 0x40) m.setHp(i, 0x40);
  }
  io.printMessage(Msg.ExitToSosaria);
  // The door is a save point in this port; the 16-column message area has no room on the same line.
  if (hooks?.save?.()) io.print('(saved)\n');
  io.showWind();
}

/**
 * Mirrors `Routine6E35()`, the routine that runs after every command:
 * count the move, advance the moons, leave a town if on its edge, age the
 * party, handle moongates and the whirlpool, Exodus' castle traps, and
 * finally let the monsters act.
 */
export async function endTurn(world: World, io: GameIO, hooks: TurnHooks): Promise<void> {
  world.party.incrementMoves();
  moonGateUpdate(world, io);

  if (world.party.location === Location.Dungeon) {
    await hooks.dungeonTurn();
    return;
  }
  if (world.inTownOrCastle && (world.x === 0 || world.y === 0)) {
    exitToSurface(world, io, hooks);
  }

  await ageChars(world, io);

  const here = world.getXYVal(world.x, world.y);
  if (here === MapValue.MoonGate) await handleMoonStep(world, io);
  if (here === MapValue.Whirlpool) await hooks.goWhirlpool();

  if (world.inExodusCastle()) {
    // Random fireballs rain down inside Exodus' castle.
    world.timeNegate = 0;
    const vx = world.rng.range(0, VIEW_SIZE);
    const vy = world.rng.range(0, VIEW_SIZE);
    if (vx < VIEW_SIZE && vy < VIEW_SIZE) {
      const under = world.getXYVal(world.x - VIEW_CENTRE + vx, world.y - VIEW_CENTRE + vy) >> 1;
      if (vx === VIEW_CENTRE && vy === VIEW_CENTRE) {
        await hooks.showBall(vx, vy, under);
        await hooks.bombTrap();
      } else if (under === Shape.Floor) {
        await hooks.showBall(vx, vy, under);
        io.sound(Sound.Hit);
      }
    }
  }

  await finishAll(world, io, hooks);
}

/** Mirrors `FinishAll()`: spawn and move monsters unless time is negated or the mount skips this turn. */
export async function finishAll(world: World, io: GameIO, hooks: TurnHooks): Promise<void> {
  if (world.skipMonstersThisTurn()) return;
  if (world.timeNegate > 0) {
    world.timeNegate--;
    return;
  }
  spawnMonster(world);
  await moveMonsters(world, io, hooks);
}

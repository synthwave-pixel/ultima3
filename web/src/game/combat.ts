/**
 * combat.ts
 *
 * Tactical combat: a port of `Combat()`, `CombatAttack()`, `DamageMonster()`,
 * `FigureNewMonPosition()`, `Shoot()` and their helpers from
 * UltimaSpellCombat.c, plus `AttackCode()` from UltimaMain.c.
 *
 * A fight happens on an 11x11 arena chosen by the terrain (CONS resources).
 * Up to four party members and eight monsters take turns: each living
 * member gets a command, then every monster moves, shoots, casts or attacks.
 * The fight ends when all monsters are dead (victory) or the whole party is.
 *
 * While `world.combat` is set the viewport draws the arena instead of the map.
 */

import { World, type CombatState, type Combatant } from './world.ts';
import { Location } from './party.ts';
import { MapValue, Shape, classTile } from './tiles.ts';
import { type GameIO, Key, Sound, Music, deathSound } from './io.ts';
import { getDirection, moveForKey, moveDelta, what2, DIAGONAL_KEYS, Msg as CmdMsg } from './commands.ts';
import { ageChars } from './turn.ts';
import { cast, quickCast } from './spells.ts';
import { QUICK_CAST_KEY } from './context.ts';
import { negateTime, readyWeapon, stats, volume, addExperience } from './actions.ts';
import { BASERES } from '../data/resources.ts';
import { checkAllDead } from './death.ts';
import { VIEW_SIZE } from './viewport.ts';
import { autoCombatKeys } from './autocombat.ts';

/** Messages used by combat (1-based Messages table entries). */
const Msg = {
  Killed: 131, // "KILLED! Exp.+"
  Victory: 132,
  Conflict: 133,
  PlayerTurnPrefix: 134, // "----PLAYER-"
  PlayerTurnSuffix: 135, // "----\n "
  CastSpell: 136,
  ReadyWeapon: 138,
  Ztats: 139,
  NotUsable: 140,
  Plr: 141,
  MonsterMissed: 142,
  MonsterHit: 143,
  PlayerKilled: 144,
  AttackDir: 145, // " attack\nDir-"
  Hit: 146,
  Missed: 147,
  Pilfered: 148,
  Poisoned: 149,
} as const;

/** Monster starting hit points by tile index & 0x0F. (`monhpstart`) */
const MONSTER_HP = [0x20, 0x20, 0xf0, 0xf0, 0xc0, 0x60, 0xa0, 0x80, 0x30, 0x50, 0x70, 0xa0, 0xc0, 0xe0, 0xf0, 0xf0];

const MISSING = 255;

/** How long a member has to act before the turn passes by itself. */
const TURN_TIMEOUT_MS = 4000;
const BALL_MS = 80;
/** A hit shows three frames of impact. */
const HIT_FRAMES = 3;
const HIT_FRAME_MS = 60;
/** Pause before each automatic turn, so the player can follow the fight and interrupt it. */
const AUTO_PAUSE_MS = 250;

// ---------------------------------------------------------------------------
// Arena selection
// ---------------------------------------------------------------------------

/**
 * Mirrors `BackGround()`: pick the CONS resource for the fight from the
 * monster type and the terrain. Combat resources are 400 + n where n is:
 * 0 A (water), 1 B (brush), 2 C (floor), 3 F (forest), 4 G (grass),
 * 5 M (mountains/shore), 6 Q (ship vs land), 7 R (ship vs ship), 8 S (frigate boarding).
 * May change the monster type: boarding a frigate means fighting Thieves.
 */
export function chooseArena(world: World, monsterShape: number): { id: number; monsterShape: number } {
  const onShip = world.party.shape === 0x16;
  if (world.party.location === Location.Dungeon) return { id: BASERES + 2, monsterShape };
  if (monsterShape === Shape.Floor) return { id: BASERES + 2, monsterShape };
  if (monsterShape === Shape.Grass) return { id: BASERES + 4, monsterShape };
  if (monsterShape === 0x1e) {
    // A pirate frigate: the crew are thieves.
    return { id: onShip ? BASERES + 8 : BASERES, monsterShape: 0x2e };
  }
  if (onShip) return { id: monsterShape < 0x20 ? BASERES + 6 : BASERES + 7, monsterShape };
  if (monsterShape < 0x20 && monsterShape > 0x14) return { id: BASERES + 5, monsterShape };
  const tile = world.getXYVal(world.x, world.y) >> 1;
  switch (tile) {
    case Shape.Grass:
      return { id: BASERES + 4, monsterShape };
    case Shape.Brush:
      return { id: BASERES + 1, monsterShape };
    case Shape.Forest:
      return { id: BASERES + 3, monsterShape };
    case Shape.Floor:
    case Shape.ForceField:
    case Shape.Lava:
      return { id: BASERES + 2, monsterShape };
    default:
      return { id: BASERES + 4, monsterShape };
  }
}

/**
 * Mirrors `GetScreen()`: a CONS resource is 121 arena shapes, then at 0x80
 * eight monster X, at 0x88 eight Y, at 0x90 eight tiles, at 0x98 eight HP,
 * then at 0xA0 four member X, 0xA4 Y, 0xA8 tiles, 0xAC shapes.
 */
export function loadArena(world: World, id: number): CombatState {
  const raw = world.resources.combat.get(id);
  if (!raw) throw new Error(`no combat arena ${id}`);
  const tiles = raw.slice(0, 121);
  const monsters: Combatant[] = [];
  for (let i = 0; i < 8; i++) {
    monsters.push({ x: raw[0x80 + i], y: raw[0x88 + i], tileUnder: raw[0x90 + i], hp: 0, shape: 0 });
  }
  const members: Combatant[] = [];
  for (let i = 0; i < 4; i++) {
    const x = raw[0xa0 + i];
    const y = raw[0xa4 + i];
    members.push({ x, y, tileUnder: raw[0xa8 + i], shape: raw[0xac + i], hp: 0, start: { x, y } });
  }
  return {
    tiles,
    monsters,
    members,
    monsterShape: 0,
    monsterVariant: 0,
    previousLocation: world.party.location,
    activeMember: 0,
    markedMember: -1,
    markedAt: 0,
    markedFor: 0,
    markedFrozenAt: 0,
  };
}

/** Mirrors `HowMany()`: number of monsters beyond the first. */
function extraMonsters(world: World, monsterShape: number): number {
  if (monsterShape === 0x26) return 0; // Lord British fights alone
  if (monsterShape === 0x24) return 7; // guards come in force
  if (world.inExodusCastle()) return 7;
  const loc = world.party.location;
  if (loc < Location.Town || loc > Location.Castle) return world.rng.range(0, 7);
  return 0;
}

/**
 * The figure for a class letter: its own tile (68-78) as a shape. A sheet
 * without class figures falls back to the original `DetermineShape()`
 * grouping in `GraphicsSet.tileRect` (see `CLASS_FALLBACK_TILE`).
 */
export function memberShape(world: World, classLetter: string): number {
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  return classTile(careers.indexOf(classLetter)) * 2;
}

/** The shape drawn for the monsters, including variant rows. */
function monsterDisplayShape(c: CombatState): number {
  const s = c.monsterShape;
  if (c.monsterVariant && s >= 46 && s <= 63) return (((s >> 1) - 23) * 2 + 79 + c.monsterVariant) * 2;
  return s;
}

/** Name of the monster type being fought, singular or plural. (`PrintMonster`) */
export function monsterName(world: World, shape: number, variant: number, plural: boolean): string {
  const names = plural ? world.resources.strings.TilesPlural : world.resources.strings.Tiles;
  if (shape > 44 && variant > 0) return names[shape - 46 + 63 + variant] ?? '?';
  return names[shape >> 1] ?? '?';
}

// ---------------------------------------------------------------------------
// Small helpers shared with spells.ts
// ---------------------------------------------------------------------------

export function arenaTile(c: CombatState, x: number, y: number): number {
  if (x < 0 || x > 10 || y < 0 || y > 10) return 0;
  return c.tiles[y * VIEW_SIZE + x];
}

/** Mirrors `CombatMonsterHere()`: index of the living monster at (x, y), or -1. */
export function monsterAt(c: CombatState, x: number, y: number): number {
  for (let i = 7; i >= 0; i--) if (c.monsters[i].hp > 0 && c.monsters[i].x === x && c.monsters[i].y === y) return i;
  return -1;
}

/** Mirrors `CombatCharacterHere()`. */
export function memberAt(c: CombatState, x: number, y: number): number {
  for (let i = 3; i >= 0; i--) if (c.members[i].x === x && c.members[i].y === y) return i;
  return -1;
}

/**
 * Draw a ball at an arena cell for one frame, or, for a hit, the three
 * frames of the impact (the "HIT" tile on the Apple II; the Standard tiles
 * get an expanding burst instead, drawn by the screen).
 */
export async function showBall(world: World, io: GameIO, x: number, y: number, shape: number, hit = false): Promise<void> {
  if (!hit) {
    world.ball = { x, y, shape };
    io.redrawMap();
    await io.pause(BALL_MS);
  } else {
    for (let frame = 1; frame <= HIT_FRAMES; frame++) {
      world.ball = { x, y, shape, hit: frame };
      io.redrawMap();
      await io.pause(HIT_FRAME_MS);
    }
  }
  world.ball = null;
  io.redrawMap();
}

/**
 * Mirrors `Shoot()`: fly a ball from (x, y) in the direction (dx, dy) until
 * it leaves the arena or reaches a monster. Returns the monster's index or -1.
 */
export async function shoot(world: World, io: GameIO, x: number, y: number, dx: number, dy: number, shape: number): Promise<number> {
  const c = world.combat!;
  for (;;) {
    x += dx;
    y += dy;
    if (x < 0 || x > 10 || y < 0 || y > 10) {
      io.redrawMap();
      return -1;
    }
    await showBall(world, io, x, y, shape);
    const mon = monsterAt(c, x, y);
    if (mon >= 0) return mon;
  }
}

/**
 * Who gets a kill's experience: with Balanced XP the living members share it
 * equally, the killer then the others in marching order taking the odd
 * points; otherwise the killer alone, as on the Apple II.
 */
export function shareExperience(world: World, killer: number, exp: number): [number, number][] {
  if (!world.balancedXp) return [[killer, exp]];
  const living = [killer, ...[0, 1, 2, 3].filter((m) => m !== killer)].filter((m) => world.memberAlive(m));
  if (living.length === 0) return [[killer, exp]];
  const each = Math.floor(exp / living.length);
  const odd = exp % living.length;
  return living.map((m, i) => [m, each + (i < odd ? 1 : 0)] as [number, number]).filter(([, share]) => share > 0);
}

/**
 * Mirrors `DamageMonster()`. Lord British cannot be hurt. A kill awards the
 * experience for the monster's tier (see `shareExperience`).
 */
export function damageMonster(world: World, io: GameIO, which: number, damage: number, member: number): void {
  const c = world.combat!;
  if (c.monsterShape === 0x26) return;
  const m = c.monsters[which];
  if (m.hp - damage < 1) {
    const exp = world.resources.misc.experience[(c.monsterShape >> 1) & 0x0f];
    io.printMessage(Msg.Killed);
    io.print(`${exp}\n`);
    for (const [m, share] of shareExperience(world, member, exp)) addExperience(world, io, m, share);
    m.hp = 0;
    io.redrawMap();
  } else {
    m.hp -= damage;
  }
}

/** Mirrors `ShowHit()` + the hit sound: flash the "HIT" ball over a creature. */
async function showHit(world: World, io: GameIO, x: number, y: number, shape: number): Promise<void> {
  io.sound(Sound.Hit);
  await showBall(world, io, x, y, shape, true);
}

/** Mirrors `CombatValidMove()`: may this monster type step onto this arena shape? */
function monsterCanStand(monsterShape: number, tile: number): boolean {
  const isSeaMonster = monsterShape >= 0x16 && monsterShape < 0x20;
  if (isSeaMonster) return tile === Shape.Water;
  return tile === Shape.Grass || tile === Shape.Brush || tile === Shape.Forest || tile === Shape.Floor;
}

/** Mirrors `ValidMove()`: may a member step onto this arena shape? */
function memberCanStand(tile: number): boolean {
  return tile === Shape.Grass || tile === Shape.Brush || tile === Shape.Forest || tile === Shape.Floor;
}

// ---------------------------------------------------------------------------
// Entering combat
// ---------------------------------------------------------------------------

/**
 * Mirrors `AttackCode()`: a monster on the map is engaged. It is removed
 * from the map, leaving a chest on the terrain it stood on (pirates leave
 * their frigate), and the fight begins.
 */
export async function attackMonster(world: World, io: GameIO, index: number): Promise<void> {
  const m = world.monsters;
  const x = m.x(index);
  const y = m.y(index);
  let under = m.tileUnder(index);
  if (under !== 0) under = ((under >> 2) & 0x03) + MapValue.Chest;
  world.putXYVal(under, x, y);
  const shape = m.type(index) >> 1;
  const variant = m.variant(index);
  m.clear(index);
  if (shape === 0x1e && world.party.shape !== 0x16) world.putXYVal(MapValue.Frigate, x, y);
  io.redrawMap();
  await combat(world, io, shape, variant);
}

/**
 * Mirrors `Combat()`: set up the arena, then alternate member and monster
 * turns until one side is gone.
 */
export async function combat(world: World, io: GameIO, monsterShape: number, variant: number): Promise<void> {
  const previousMusic = world.music;
  world.spellFlags.repond = false;
  world.spellFlags.pontori = false;
  io.music(Music.None);

  // Fighting in a town turns Lord British's guards hostile.
  const map = world.monsters;
  for (let i = 31; i >= 0; i--) {
    if (map.type(i) === MapValue.LordBritish || map.type(i) === MapValue.Guard) map.setHp(i, 0xc0);
  }

  io.printMessage(Msg.Conflict);
  const count = extraMonsters(world, monsterShape);
  io.print(monsterName(world, monsterShape, variant, count > 0));
  io.print('\n\n');

  const arena = chooseArena(world, monsterShape);
  const c = loadArena(world, arena.id);
  c.monsterShape = arena.monsterShape;
  c.monsterVariant = variant;
  c.previousLocation = world.party.location;
  world.combat = c;
  world.party.location = Location.Combat;
  io.showWind();

  // Place the living members; dead ones sit out.
  for (let i = world.party.size - 1; i >= 0; i--) {
    const p = c.members[i];
    if (world.memberAlive(i)) {
      p.shape = memberShape(world, world.member(i).classLetter);
      p.tileUnder = arenaTile(c, p.x, p.y);
    } else {
      p.x = p.y = MISSING;
    }
  }
  for (let i = world.party.size; i < 4; i++) c.members[i].x = c.members[i].y = MISSING;

  // Place the monsters in random arena slots.
  const shape = monsterDisplayShape(c);
  let remaining = count;
  while (remaining >= 0) {
    const slot = world.rng.range(0, 7);
    const m = c.monsters[slot];
    if (m.hp === 0) {
      m.hp = world.rng.range(0, MONSTER_HP[(c.monsterShape >> 1) & 0x0f]) | 0x0f;
      m.tileUnder = arenaTile(c, m.x, m.y);
      m.shape = shape;
      remaining--;
    }
  }
  io.redrawMap();
  io.sound(Sound.CombatStart);
  io.flushKeys();
  io.music(Music.Combat);

  try {
    for (;;) {
      // A new round: everyone ages, then each member acts.
      await ageChars(world, io);
      io.updateStats();
      for (let member = 0; member < world.party.size; member++) {
        c.activeMember = member;
        if (world.resurrecting) return;
        placeRevived(world, io);
        io.highlightMember(member, true);
        if (world.memberAlive(member)) await memberTurn(world, io, member);
        // Inside Exodus' castle, time cannot be negated.
        if (world.inExodusCastle()) world.timeNegate = 0;
        c.markedMember = -1;
        io.redrawMap();
        io.highlightMember(member, false);
        io.updateStats();
        if (c.monsters.every((m) => m.hp === 0)) {
          await victory(world, io, previousMusic);
          return;
        }
      }

      // Time stopped: monsters lose their turn.
      if (world.timeNegate > 0) {
        world.timeNegate--;
        continue;
      }
      for (let i = 0; i < 8; i++) {
        if (world.resurrecting) break;
        if (c.monsters[i].hp === 0) continue;
        await monsterTurn(world, io, i);
      }
    }
  } finally {
    io.queueKeys([]);
    if (world.combat === c) {
      world.combat = null;
      c.markedMember = -1;
    }
  }
}

/** Mirrors `Victory()`. */
async function victory(world: World, io: GameIO, previousMusic: number): Promise<void> {
  const c = world.combat!;
  world.timeNegate = 0;
  io.printMessage(Msg.Victory);
  io.sound(Sound.CombatVictory);
  world.party.location = c.previousLocation;
  world.combat = null;
  io.music(previousMusic);
  io.showWind();
  io.redrawMap();
}

// ---------------------------------------------------------------------------
// A member's turn
// ---------------------------------------------------------------------------

/**
 * Wait for the member's command while the UI marks their figure. After
 * the turn timer (TURN_TIMEOUT_MS under Fast) the turn is passed, as on
 * the Apple II; with the timer off the wait has no end.
 */
async function waitForCombatKey(world: World, io: GameIO, member: number): Promise<string> {
  const c = world.combat!;
  c.markedMember = member;
  c.markedAt = performance.now();
  const limit = world.timeLimit(TURN_TIMEOUT_MS);
  c.markedFor = limit ?? 0; // 0: no countdown, the outline stays white
  c.markedFrozenAt = 0;
  io.redrawMap();
  try {
    const key = await io.waitCommand('combat', limit);
    return key ?? Key.Space;
  } finally {
    c.markedFor = 0; // the outline stays, steady, while the command's prompts run (a direction, a target)
    io.redrawMap();
  }
}

/**
 * Auto-combat: give the player a moment to interrupt (Escape, or B on a
 * controller, turns it off as Cmd-. did on the Mac), then script the
 * member's turn. The scripted keys are read by the same prompts a player
 * answers, so nothing else in combat knows the difference.
 */
async function scriptTurn(world: World, io: GameIO, member: number): Promise<void> {
  const pressed = await io.waitKeyOrTimeout(AUTO_PAUSE_MS);
  if (pressed === Key.Escape || pressed === Key.B) {
    world.autoCombat = false;
    world.onAutoCombatChange?.();
    io.print('Manual combat\n');
    return;
  }
  io.queueKeys(autoCombatKeys(world, member));
}

async function memberTurn(world: World, io: GameIO, member: number): Promise<void> {
  const c = world.combat!;
  for (;;) {
    io.printMessage(Msg.PlayerTurnPrefix);
    io.print(String(member + 1));
    io.printMessage(Msg.PlayerTurnSuffix);
    io.prompt();

    if (world.autoCombat) await scriptTurn(world, io, member);
    const key = await waitForCombatKey(world, io, member);
    if (key === Key.Escape) {
      await io.showSettings(); // the member's turn is not spent
      continue;
    }
    if (!world.diagonalMoves && DIAGONAL_KEYS.includes(key)) return; // refused, and the turn is spent
    const move = moveForKey(key, world.diagonalMoves);
    if (move) {
      const delta = moveDelta(move);
      // Walking into a monster attacks it (a convenience this port adds).
      const me = c.members[member];
      if (monsterAt(c, me.x + delta.dx, me.y + delta.dy) >= 0) {
        await combatAttack(world, io, member, delta);
        return;
      }
      io.printMessage(delta.message);
      handleMove(world, io, member, delta.dx, delta.dy);
      return;
    }
    switch (key.toUpperCase()) {
      case ' ':
        io.printMessage(CmdMsg.Pass);
        return;
      case 'A':
        await combatAttack(world, io, member);
        return;
      case 'C':
        io.printMessage(Msg.CastSpell);
        if (await cast(world, io, member)) return;
        io.print(' ');
        continue; // cancelled: ask again
      case QUICK_CAST_KEY:
        io.printMessage(Msg.CastSpell);
        if (await quickCast(world, io, member)) return;
        io.printMessage(Msg.NotUsable);
        io.sound(Sound.Error2);
        continue;
      case 'N':
        await negateTime(world, io);
        return;
      case 'R':
        io.printMessage(Msg.ReadyWeapon);
        await readyWeapon(world, io, member);
        return;
      case 'V':
        volume(world, io);
        return;
      case 'Z':
        io.printMessage(Msg.Ztats);
        await stats(world, io, member);
        return;
      default:
        if (/^[A-Za-z]$/.test(key)) {
          io.printMessage(Msg.NotUsable);
          io.sound(Sound.Error2);
        } else {
          what2(io);
          return;
        }
        continue;
    }
  }
}

/**
 * A member brought back to life during a fight (the cheat menu, for one)
 * has no square: put them on the nearest open square to where they fell,
 * or to their starting square if they never stood in this arena.
 */
export function placeRevived(world: World, io: GameIO): void {
  const c = world.combat!;
  let placed = false;
  for (let member = 0; member < world.party.size; member++) {
    const me = c.members[member];
    if (!world.memberAlive(member) || me.x !== MISSING) continue;
    const from = me.diedAt ?? me.start ?? { x: 5, y: 9 };
    const spot = nearestOpenSquare(c, from.x, from.y);
    if (!spot) continue;
    me.x = spot.x;
    me.y = spot.y;
    me.tileUnder = arenaTile(c, spot.x, spot.y);
    me.shape = memberShape(world, world.member(member).classLetter);
    placed = true;
  }
  if (placed) io.redrawMap();
}

/** The open arena square nearest (x, y), by distance then by reading order; null if the arena is full. */
function nearestOpenSquare(c: CombatState, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (let sy = 0; sy < 11; sy++) {
    for (let sx = 0; sx < 11; sx++) {
      if (!memberCanStand(arenaTile(c, sx, sy)) || monsterAt(c, sx, sy) >= 0 || memberAt(c, sx, sy) >= 0) continue;
      const d = Math.max(Math.abs(sx - x), Math.abs(sy - y));
      if (d < bestDistance) {
        bestDistance = d;
        best = { x: sx, y: sy };
      }
    }
  }
  return best;
}

/** Mirrors `HandleMove()`: step a member one cell if the arena allows. */
export function handleMove(world: World, io: GameIO, member: number, dx: number, dy: number): void {
  const c = world.combat!;
  const p = c.members[member];
  const xs = p.x + dx;
  const ys = p.y + dy;
  if (
    xs < 0 ||
    xs > 10 ||
    ys < 0 ||
    ys > 10 ||
    !memberCanStand(arenaTile(c, xs, ys)) ||
    monsterAt(c, xs, ys) >= 0 ||
    memberAt(c, xs, ys) >= 0
  ) {
    io.printMessage(CmdMsg.InvalidMove);
    io.sound(Sound.Bump);
    return;
  }
  io.sound(Sound.Step);
  p.x = xs;
  p.y = ys;
  p.tileUnder = arenaTile(c, xs, ys);
}

/** The attack routine, for tests. */
export const combatAttackForTest = (world: World, io: GameIO, member: number) => combatAttack(world, io, member);

/**
 * Mirrors `CombatAttack()`. With `preset` the direction is already known
 * (the member walked into a monster) and is echoed instead of asked for.
 */
async function combatAttack(world: World, io: GameIO, member: number, preset?: { dx: number; dy: number; message: number }): Promise<void> {
  const c = world.combat!;
  const p = world.member(member);
  const me = c.members[member];
  const weapon = p.bytes[48];
  io.print(world.resources.strings.WeaponsArmour[weapon]);
  io.printMessage(Msg.AttackDir);
  let dir: { dx: number; dy: number } | null;
  if (preset) {
    io.printMessage(preset.message);
    dir = preset;
  } else {
    dir = await getDirection(world, io, true);
  }
  if (!dir || (dir.dx === 0 && dir.dy === 0)) return;
  io.sound(Sound.Swish[member]);

  const missed = () => {
    io.printMessage(Msg.Missed);
    io.redrawMap();
  };

  let target: number;
  const ranged = weapon === 3 || weapon === 5 || weapon === 9 || weapon === 13; // sling, bow, +2 bow, +4 bow
  if (ranged) {
    target = await shoot(world, io, me.x, me.y, dir.dx, dir.dy, Shape.FireBall);
    if (target < 0) return missed();
  } else {
    target = monsterAt(c, me.x + dir.dx, me.y + dir.dy);
    // A dagger can be thrown at a distant foe, and is used up. This port
    // only throws a spare from the party's bag, keeping the one in hand:
    // the Apple II let a new character throw their only dagger and fight
    // bare-handed after.
    if (target < 0 && (weapon !== 1 || world.party.weapons(1) < 1)) return missed();
    if (target < 0) {
      world.party.setWeapons(1, world.party.weapons(1) - 1);
      target = await shoot(world, io, me.x, me.y, dir.dx, dir.dy, Shape.FireBall);
      if (target < 0) return missed();
    }
  }
  // Only exotic weapons work in Exodus' castle.
  if (world.inExodusCastle() && weapon !== 15) return missed();
  if (world.rng.range(0, 255) < 128 && p.dexterity < world.rng.range(0, 99)) return missed();

  io.print(monsterName(world, c.monsterShape, c.monsterVariant, false));
  io.printMessage(Msg.Hit);
  const m = c.monsters[target];
  await showHit(world, io, m.x, m.y, Shape.FireBall);
  let damage = world.rng.range(0, p.strength | 1);
  damage += p.strength >> 1;
  damage += weapon * 3;
  damage += 4;
  damageMonster(world, io, target, damage, member);
}

// ---------------------------------------------------------------------------
// A monster's turn
// ---------------------------------------------------------------------------

export interface MonsterPlan {
  /** Chosen member, or -1. */
  target: number;
  /** Manhattan distance to the target; 0 = adjacent; 255 = no target. */
  distance: number;
  newX: number;
  newY: number;
  dx: number;
  dy: number;
}

/**
 * Mirrors `FigureNewMonPosition()`: pick the nearest reachable member and
 * the step toward them (diagonal first, then vertical, then horizontal).
 */
export function planMonster(world: World, i: number): MonsterPlan {
  const c = world.combat!;
  const m = c.monsters[i];
  const plan: MonsterPlan = { target: -1, distance: 255, newX: m.x, newY: m.y, dx: 0, dy: 0 };
  for (let member = 0; member < world.party.size; member++) {
    if (!world.memberAlive(member)) continue;
    const p = c.members[member];
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < 2 && ay < 2) {
      plan.distance = 0;
      plan.target = member;
      if (ax + ay < 2) break;
      continue;
    }
    if (ax + ay >= plan.distance) continue;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const free = (x: number, y: number) => monsterCanStand(c.monsterShape, arenaTile(c, x, y));
    let nx = m.x + sx;
    let ny = m.y + sy;
    if (!free(nx, ny)) {
      nx = m.x;
      ny = m.y + sy;
      if (!free(nx, ny)) {
        nx = m.x + sx;
        ny = m.y;
        if (!free(nx, ny)) continue;
      }
    }
    plan.target = member;
    plan.distance = ax + ay;
    plan.newX = nx;
    plan.newY = ny;
    plan.dx = sx;
    plan.dy = sy;
  }
  return plan;
}

async function monsterTurn(world: World, io: GameIO, i: number): Promise<void> {
  const c = world.combat!;
  const type = c.monsterShape;
  const plan = planMonster(world, i);
  let ballShape: number = Shape.FireBall;
  let target = plan.target;

  if (plan.distance !== 0) {
    // Dragons breathe fire from range half the time.
    if (target >= 0 && world.rng.range(0, 255) < 128 && type === 0x3a) {
      await monsterShoot(world, io, i, plan);
      return;
    }
    // Spell casters may cast at a random member instead of moving.
    if (world.rng.range(0, 0xc0) > 127) {
      if ([0x1a, 0x1c, 0x2c, 0x36, 0x3a, 0x3c].includes(type)) {
        const victim = world.rng.range(0, 255) & 3;
        if (world.member(victim).status === 'G' && world.party.memberSlot(victim) >= 0) {
          await io.flashTiles();
          io.sound(Sound.MonsterSpell);
          ballShape = Shape.MagicBall;
          target = victim;
          await monsterAttack(world, io, i, target, ballShape, true);
          return;
        }
        // Otherwise fall through to moving.
      } else if (type === 0x26) {
        moveMonster(world, io, i, plan);
        return;
      }
    }
    if (plan.distance < 0x80) moveMonster(world, io, i, plan);
    return;
  }

  await monsterAttack(world, io, i, target, ballShape, false);
}

/** Step a monster to its planned cell. (`monlb`) */
function moveMonster(world: World, io: GameIO, i: number, plan: MonsterPlan): void {
  const c = world.combat!;
  const m = c.monsters[i];
  if (monsterAt(c, plan.newX, plan.newY) >= 0 || memberAt(c, plan.newX, plan.newY) >= 0) return;
  m.x = plan.newX;
  m.y = plan.newY;
  m.tileUnder = arenaTile(c, m.x, m.y);
  io.redrawMap();
}

/** A dragon breathes fire along its line to the target. (`monshoot`) */
async function monsterShoot(world: World, io: GameIO, i: number, plan: MonsterPlan): Promise<void> {
  const c = world.combat!;
  const m = c.monsters[i];
  io.sound(Sound.Shoot);
  let x = m.x;
  let y = m.y;
  for (;;) {
    x += plan.dx;
    y += plan.dy;
    if (x < 0 || x > 10 || y < 0 || y > 10) {
      io.redrawMap();
      return;
    }
    const hit = memberAt(c, x, y);
    if (hit >= 0 && hit < world.party.size) {
      await damageMember(world, io, hit, Shape.FireBall);
      return;
    }
    await showBall(world, io, x, y, Shape.FireBall);
  }
}

/**
 * A monster attacks an adjacent member (or a caster's spell strikes).
 * Mirrors the `afternext` .. `plrhit` block. Thieves pilfer, snakes and
 * some others poison, and inside Exodus' castle only exotic armour helps.
 */
async function monsterAttack(world: World, io: GameIO, i: number, target: number, ballShape: number, magic: boolean): Promise<void> {
  const c = world.combat!;
  const type = c.monsterShape;
  if (target < 0) return;
  void i;

  if (type === 0x1c || type === 0x3c || type === 0x38) await poison(world, io, target);
  else if (type === 0x2e) pilfer(world, io, target);

  io.printMessage(Msg.Plr);
  io.print(String(target + 1));
  io.sound(Sound.Attack);

  const p = world.member(target);
  const autoHit = world.inExodusCastle() && p.bytes[40] !== 7;
  if (!autoHit && !magic) {
    const roll = world.rng.range(0, p.bytes[40] + 0x10);
    if (roll >= 8) {
      io.printMessage(Msg.MonsterMissed);
      return;
    }
  }
  io.printMessage(Msg.MonsterHit);
  await damageMember(world, io, target, ballShape);
}

/** The damage roll and its consequences. (`c8777`) */
async function damageMember(world: World, io: GameIO, target: number, ballShape: number): Promise<void> {
  const c = world.combat!;
  const p = world.member(target);
  const me = c.members[target];
  let max = Math.floor(p.maxHitPoints / 100);
  max = ((MONSTER_HP[(c.monsterShape >> 1) & 0x0f] >> 3) + max) | 1;
  const damage = world.rng.range(0, max) + 1;
  let died = p.subtractHitPoints(damage);
  // Fights in towns and castles hurt more (a quirk of the original: location & 3, times 16).
  died = p.subtractHitPoints((c.previousLocation & 3) * 16) || died;
  if (died) io.sound(deathSound(p.sex));
  await io.flashMember(target);
  await showHit(world, io, me.x, me.y, ballShape);
  io.updateStats();
  if (p.status === 'D') {
    io.printMessage(Msg.PlayerKilled);
    me.diedAt = { x: me.x, y: me.y };
    me.x = me.y = MISSING;
    io.redrawMap();
    io.updateStats();
    await checkAllDead(world, io);
  }
}

/** Mirrors `Pilfer()`: a thief steals a whole stack of one kind of weapon or armour nobody is using, from the party's bag. */
function pilfer(world: World, io: GameIO, member: number): void {
  if (world.rng.range(0, 255) < 128) {
    const item = world.rng.range(0, 15);
    if (item === 0 || world.party.weapons(item) === 0) return;
    world.party.setWeapons(item, 0);
  } else {
    const item = world.rng.range(0, 7);
    if (item === 0 || world.party.armour(item) === 0) return;
    world.party.setArmour(item, 0);
  }
  io.printMessage(Msg.Plr);
  io.print(String(member + 1));
  io.printMessage(Msg.Pilfered);
  io.sound(Sound.Ouch);
}

/** Mirrors `Poison()`: one chance in four to poison a healthy member. */
async function poison(world: World, io: GameIO, member: number): Promise<void> {
  const p = world.member(member);
  if ((world.rng.range(0, 255) & 0x03) !== 0) return;
  if (p.status !== 'G') return;
  p.status = 'P';
  io.printMessage(Msg.Plr);
  io.print(String(member + 1));
  io.printMessage(Msg.Poisoned);
  io.sound(Sound.Ouch);
}

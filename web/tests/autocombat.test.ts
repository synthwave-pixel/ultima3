import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { combat, loadArena } from '../src/game/combat.ts';
import { autoCombatKeys } from '../src/game/autocombat.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';
import { Key } from '../src/game/io.ts';
import { BASERES } from '../src/data/resources.ts';
import { World, type CombatState } from '../src/game/world.ts';

const MISSING = 255;

/** A flat grass arena with one member at (5, 9) and no monsters yet. Diagonals allowed unless `classic`. */
function arena(monsterShape = MapValue.Orc >> 1, classic = false): { world: World; c: CombatState } {
  const world = newWorld(7);
  world.setDiagonalMoves(!classic);
  world.current.tiles.fill(MapValue.Grass);
  world.monsters.bytes.fill(0);
  const c = loadArena(world, BASERES + 4);
  c.tiles.fill(Shape.Grass);
  c.monsterShape = monsterShape;
  for (const m of c.monsters) m.hp = 0;
  for (let i = 0; i < 4; i++) c.members[i].x = c.members[i].y = MISSING;
  c.members[0].x = 5;
  c.members[0].y = 9;
  world.combat = c;
  return { world, c };
}

function monster(c: CombatState, slot: number, x: number, y: number): void {
  c.monsters[slot].x = x;
  c.monsters[slot].y = y;
  c.monsters[slot].hp = 20;
}

/** Make member 0 a plain fighter with no magic and the given weapon. */
function fighter(world: World, weapon: number): void {
  const p = world.member(0);
  p.bytes[23] = 'F'.charCodeAt(0);
  p.bytes[48] = weapon;
  p.mana = 0;
  p.hitPoints = 150;
}

describe('auto-combat planning', () => {
  it('attacks an adjacent monster with a hand weapon', () => {
    const { world, c } = arena();
    fighter(world, 2);
    monster(c, 0, 5, 8);
    expect(autoCombatKeys(world, 0)).toEqual(['A', '8']);
  });

  it('walks toward the nearest monster when none is adjacent', () => {
    const { world, c } = arena();
    fighter(world, 2);
    monster(c, 0, 5, 2);
    // The orc is expected to step south, so the fighter heads north.
    expect(autoCombatKeys(world, 0)).toEqual(['8']);
  });

  it('runs from a monster when nearly dead', () => {
    const { world, c } = arena();
    fighter(world, 2);
    world.member(0).hitPoints = 20;
    monster(c, 0, 5, 8);
    const [key] = autoCombatKeys(world, 0);
    // South is the first safe square tried.
    expect(key).toBe('2');
  });

  it('fires a bow at a monster in line', () => {
    const { world, c } = arena();
    fighter(world, 5);
    monster(c, 0, 9, 5); // on the diagonal, up and to the right
    expect(autoCombatKeys(world, 0)).toEqual(['A', '9']);
  });

  it('casts Repond against orcs as a wizard, and Mittar otherwise', () => {
    const { world, c } = arena();
    const p = world.member(0);
    p.bytes[23] = 'W'.charCodeAt(0);
    p.bytes[48] = 0;
    p.mana = 30;
    p.hitPoints = 150;
    monster(c, 0, 5, 2);
    expect(autoCombatKeys(world, 0)).toEqual(['C', 'A']);
    world.spellFlags.repond = true;
    expect(autoCombatKeys(world, 0)).toEqual(['C', 'B', '8']);
  });

  it('asks a multi-class member which spell list to use', () => {
    const { world, c } = arena();
    const p = world.member(0);
    p.bytes[23] = 'D'.charCodeAt(0); // Druid
    p.mana = 30;
    p.hitPoints = 150;
    monster(c, 0, 5, 2);
    expect(autoCombatKeys(world, 0)).toEqual(['C', 'W', 'A']);
  });

  it('heals the weakest member with Sanctu as a cleric', () => {
    const { world, c } = arena(MapValue.Skeleton >> 1);
    const p = world.member(0);
    p.bytes[23] = 'C'.charCodeAt(0);
    p.mana = 30;
    p.hitPoints = 150;
    world.spellFlags.pontori = true;
    world.member(1).hitPoints = 40;
    monster(c, 0, 5, 2);
    expect(autoCombatKeys(world, 0)).toEqual(['C', 'C', '2']);
  });

  it('neither attacks nor fires diagonally in classic mode', () => {
    const { world, c } = arena(MapValue.Orc >> 1, true);
    fighter(world, 2);
    monster(c, 0, 6, 8); // diagonally adjacent: a step, not an attack
    expect(autoCombatKeys(world, 0)).not.toContain('A');
    fighter(world, 5);
    // The bow needs a row or column: a step east puts the orc straight north.
    expect(autoCombatKeys(world, 0)).toEqual(['6']);
    c.monsters[0].x = 5;
    c.monsters[0].y = 3;
    expect(autoCombatKeys(world, 0)).toEqual(['A', '8']);
  });

  it('retreats diagonally only when diagonals are allowed', () => {
    const { world, c } = arena();
    fighter(world, 2);
    world.member(0).hitPoints = 20;
    monster(c, 0, 5, 8);
    monster(c, 1, 6, 10);
    // South, west and east are all within reach; southwest is not.
    expect(autoCombatKeys(world, 0)).toEqual(['1']);
    // Without diagonals there is nowhere safe to go, so the member fights back
    // (the Mac passed the turn and took the hit).
    world.setDiagonalMoves(false);
    expect(autoCombatKeys(world, 0)).toEqual(['A', '8']);
  });

  it('passes when boxed in', () => {
    const { world, c } = arena();
    fighter(world, 2);
    world.member(0).hitPoints = 150;
    c.members[0].x = 0;
    c.members[0].y = 0;
    for (let x = 0; x < 11; x++) c.tiles[1 * 11 + x] = Shape.Water;
    c.tiles[1] = Shape.Water;
    monster(c, 0, 10, 10);
    expect(autoCombatKeys(world, 0)).toEqual([Key.Space]);
  });
});

describe('auto-combat in a fight', () => {
  it('fights a whole battle without any player input', async () => {
    const world = newWorld(42);
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    for (let m = 0; m < world.party.size; m++) {
      const p = world.member(m);
      p.hitPoints = 400;
      p.bytes[48] = 2; // maces for everyone
    }
    world.autoCombat = true;
    const io = new FakeIO(world.resources);
    await combat(world, io, MapValue.Orc >> 1, 0);
    expect(world.combat).toBeNull();
    expect(io.output).toContain('VICTORY');
    expect(io.macro).toEqual([]);
  });

  it('turns itself off when the player presses Escape', async () => {
    const world = newWorld(42);
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    for (let m = 0; m < world.party.size; m++) world.member(m).hitPoints = 400;
    world.autoCombat = true;
    let changes = 0;
    world.onAutoCombatChange = () => changes++;
    const io = new FakeIO(world.resources);
    io.keys = [Key.Escape];
    // After the interruption every turn passes until the fight is over.
    io.keyProvider = () => ' ';
    await expect(combat(world, io, MapValue.Orc >> 1, 0)).resolves.toBeUndefined();
    expect(world.autoCombat).toBe(false);
    expect(changes).toBe(1);
    expect(io.output).toContain('Manual combat');
  });
});

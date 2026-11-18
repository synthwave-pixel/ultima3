import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { loadArena, memberTurnForTest } from '../src/game/combat.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';
import { Key } from '../src/game/io.ts';
import { BASERES } from '../src/data/resources.ts';
import { World, type CombatState } from '../src/game/world.ts';
import { combatTip, SNAP_KEY, snapCandidates, snapTarget, stepSnapTarget } from '../src/game/snap.ts';
import { BUTTON_SHORTCUTS, GamepadReader } from '../src/ui/menus.ts';
import { cast } from '../src/game/spells.ts';
import { PlayerOffset } from '../src/game/player.ts';

/** A flat grass arena with member 0 at (5, 5), no monsters yet, diagonals as `diagonals`. */
function arena(diagonals = true): { world: World; c: CombatState } {
  const world = newWorld(7);
  world.setDiagonalMoves(diagonals);
  world.current.tiles.fill(MapValue.Grass);
  world.monsters.bytes.fill(0);
  const c = loadArena(world, BASERES + 4);
  c.tiles.fill(Shape.Grass);
  c.monsterShape = MapValue.Orc >> 1;
  for (const m of c.monsters) m.hp = 0;
  for (let i = 0; i < 4; i++) c.members[i].x = c.members[i].y = 255;
  c.members[0].x = c.members[0].y = 5;
  world.combat = c;
  return { world, c };
}

function monster(c: CombatState, slot: number, x: number, y: number, hp = 20): void {
  Object.assign(c.monsters[slot], { x, y, hp });
}

const weapon = (world: World, w: number) => (world.member(0).bytes[48] = w);

describe('snap targets (#29)', () => {
  it('are the foes next to a member with a weapon in hand, diagonals as the setting allows', () => {
    const { world, c } = arena(false);
    weapon(world, 4); // a sword
    monster(c, 0, 6, 6); // diagonal
    monster(c, 1, 5, 3); // two away
    expect(snapCandidates(world, 0)).toEqual([]);
    world.setDiagonalMoves(true);
    expect(snapCandidates(world, 0).map((s) => s.monster)).toEqual([0]);
  });

  it('reach the first foe along each line with a bow, or a spare dagger to throw', () => {
    const { world, c } = arena();
    monster(c, 0, 5, 1); // north, far
    monster(c, 1, 5, 0); // behind it
    monster(c, 2, 8, 8); // southeast
    weapon(world, 5); // a bow
    expect(snapCandidates(world, 0).map((s) => s.monster)).toEqual([2, 0]);
    weapon(world, 1); // a dagger, none spare
    world.party.setWeapons(1, 0);
    expect(snapCandidates(world, 0)).toEqual([]);
    world.party.setWeapons(1, 2);
    expect(snapCandidates(world, 0).map((s) => s.monster)).toEqual([2, 0]);
  });

  it('take the nearest, the weaker of two as near, and keep the one chosen while it is in reach', () => {
    const { world, c } = arena();
    weapon(world, 4);
    monster(c, 0, 5, 4, 30);
    monster(c, 1, 6, 5, 10);
    expect(snapTarget(world, 0)?.monster).toBe(1);
    expect(stepSnapTarget(world, 0, 1)?.monster).toBe(0);
    expect(snapTarget(world, 0)?.monster).toBe(0); // chosen: it stays
    expect(stepSnapTarget(world, 0, 1)?.monster).toBe(1); // round again
    expect(stepSnapTarget(world, 0, -1)?.monster).toBe(0);
    c.monsters[0].hp = 0; // gone: the next nearest
    expect(snapTarget(world, 0)?.monster).toBe(1);
  });

  it('are struck with X (or Enter) without a direction asked, and the shoulders are read', async () => {
    const { world, c } = arena();
    weapon(world, 4);
    monster(c, 0, 4, 5, 200);
    monster(c, 1, 5, 6, 200);
    expect(stepSnapTarget(world, 0, 1)?.monster).toBe(1); // the one south, marked in place of the one west
    const io = new FakeIO(world.resources);
    io.keys = [SNAP_KEY];
    await memberTurnForTest(world, io, 0);
    expect(io.output).toMatch(/Dir-South/);
    expect(io.keys).toEqual([]);
    world.snapTargets = false; // off: X is an attack that asks the way, as ever
    io.output = '';
    io.keys = [SNAP_KEY, Key.Left];
    await memberTurnForTest(world, io, 0);
    expect(io.output).toMatch(/Dir-West/);

    const pushed: string[] = [];
    const pad = {
      index: 0,
      id: 'pad',
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 4 || i === 5 })),
    };
    new GamepadReader(
      { push: (k: string) => pushed.push(k), waiting: true },
      () => {},
      () => 0,
      () => [pad as unknown as Gamepad],
    ).poll();
    expect(pushed).toEqual([Key.LB, Key.RB]);
  });

  it("use the Ultima V port's buttons in a fight: X a snap attack, Y a spell", () => {
    expect(BUTTON_SHORTCUTS.combat.X).toBe(SNAP_KEY);
    expect(BUTTON_SHORTCUTS.combat.Y).toBe('C');
  });

  it("give the Ultima V port's tips, one a fight, each once, worded for what was pressed", () => {
    const { world } = arena();
    expect(combatTip(world, false)).toBeNull(); // a keyboard read as letters: none
    expect(combatTip(world, true, 'keyboard')).toBe('Tip: Press C for a snap attack!');
    expect(combatTip(world, true, 'gamepad')).toBe('Tip: Press Y to cast a spell!');
    expect(combatTip(world, true, 'touch')).toBeNull(); // the touch pad has no shoulders: that tip waits
    expect(combatTip(world, true, 'gamepad')).toBe('Tip: Press LB/RB to cycle snap targets!');
    expect(combatTip(world, true, 'gamepad')).toBeNull();
    expect([...world.tipsShown]).toEqual(['snap-attack', 'cast', 'snap-cycle']);
    world.tipsShown.clear();
    world.snapTargets = false;
    expect(combatTip(world, true, 'gamepad')).toBeNull();
  });

  it("aim a bolt spell at the foe it would hit, in a spell's mark: A/X casts, LB/RB step, B backs out", async () => {
    const { world, c } = arena(false);
    weapon(world, 4); // a sword: no foe in its reach, so the melee snap target is none
    world.member(0).bytes[PlayerOffset.Class] = 'W'.charCodeAt(0);
    monster(c, 0, 5, 2, 200); // north, three away, weaker
    monster(c, 1, 9, 5, 250); // east, four away
    expect(snapTarget(world, 0)).toBeNull();
    expect(snapTarget(world, 0, true)?.monster).toBe(0);
    const io = new FakeIO(world.resources);
    const seen: (number | undefined)[] = [];
    const aim = io.aimSnap.bind(io);
    io.aimSnap = async () => {
      seen.push(c.snapKind === 'spell' ? c.snapShown : -9);
      return aim();
    };

    // Enter (A or X on a pad) casts at the marked foe, which stays the member's target.
    world.member(0).mana = 50;
    io.keys = ['B', Key.Enter]; // Magic bolt
    expect(await cast(world, io, 0)).toBe(true);
    expect(c.monsters[0].hp).toBeLessThan(200);
    expect(c.monsters[1].hp).toBe(250);
    expect(c.snapChosen?.[0]).toBe(0);
    expect(c.snapShown).toBe(-1);
    expect(c.snapKind).toBeUndefined();

    // ] (RB) marks the next foe on a line, and the bolt goes there.
    io.keys = ['B', ']', Key.Enter];
    seen.length = 0;
    expect(await cast(world, io, 0)).toBe(true);
    expect(seen).toEqual([0, 1]);
    expect(c.monsters[1].hp).toBeLessThan(250);

    // Escape (B) backs out: the mana given back, the foe marked before marked again, the turn not spent.
    const mana = world.member(0).mana;
    io.keys = ['B', '[', Key.Escape];
    expect(await cast(world, io, 0)).toBe(false);
    expect(world.member(0).mana).toBe(mana);
    expect(c.snapChosen?.[0]).toBe(1);
    expect(world.takeCancelled()).toBe(true);

    // Snap targets off: the direction is asked, as ever.
    world.snapTargets = false;
    io.keys = ['B', Key.Up];
    seen.length = 0;
    expect(await cast(world, io, 0)).toBe(true);
    expect(seen).toEqual([]);
  });

  it("flash the turn's outline dim a moment as a blow misses (the Ultima V port's)", async () => {
    const { world, c } = arena();
    weapon(world, 4);
    const io = new FakeIO(world.resources);
    const during: (boolean | undefined)[] = [];
    io.pause = async () => {
      during.push(c.missFlash);
    };
    io.keys = ['A', Key.Up]; // nobody to the north
    await memberTurnForTest(world, io, 0);
    expect(io.output).toMatch(/Missed/i);
    expect(during).toContain(true);
    expect(c.missFlash).toBe(false);
  });
});

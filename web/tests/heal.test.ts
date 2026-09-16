import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import {
  healPlan,
  quickHeal,
  HEAL,
  GREAT_HEAL,
  safeChestCaster,
  quickSafeChest,
  SAFE_CHEST,
  lightPlan,
  quickLight,
} from '../src/game/spells.ts';
import { commandMenu, QUICK_CAST_KEY } from '../src/game/context.ts';
import { COMMAND_MENUS } from '../src/ui/menus.ts';
import { MapValue } from '../src/game/tiles.ts';
import { World, DungeonCell } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';

/**
 * The default party: 0 Tatiana (thief), 1 Roderic (ranger: cleric and
 * wizard spells), 2 Norric (cleric), 3 Ghiselle (wizard). Everyone starts
 * at 100 of 100 hit points.
 */
function party(): { world: World; io: FakeIO } {
  const world = newWorld();
  world.current.tiles.fill(MapValue.Grass);
  world.monsters.bytes.fill(0);
  for (let m = 0; m < 4; m++) world.member(m).mana = 0;
  return { world, io: new FakeIO(world.resources) };
}
const hurt = (world: World, m: number, gap: number) => (world.member(m).hitPoints = world.member(m).maxHitPoints - gap);

describe('the heal plan', () => {
  it('is nothing when nobody is hurt', () => {
    const { world } = party();
    world.member(2).mana = 60;
    expect(healPlan(world)).toBeNull();
  });

  it('is nothing when nobody with cleric spells can pay for a Heal', () => {
    const { world } = party();
    hurt(world, 0, 50);
    world.member(3).mana = 99; // the wizard has mana, but no cleric spells
    world.member(2).mana = 9; // the cleric is one short
    expect(healPlan(world)).toBeNull();
  });

  it('picks the member missing the most hit points, Great heal for a large wound, Heal for a small one', () => {
    const { world } = party();
    world.member(2).mana = 60;
    hurt(world, 0, 80);
    hurt(world, 1, 15);
    hurt(world, 3, 5);
    expect(healPlan(world)).toEqual({ caster: 2, spell: GREAT_HEAL, target: 0 });
    hurt(world, 0, 0);
    expect(healPlan(world)).toEqual({ caster: 2, spell: HEAL, target: 1 });
  });

  it('falls back to the other spell when only it can be afforded', () => {
    const { world } = party();
    hurt(world, 0, 80);
    world.member(2).mana = 12; // Great heal costs 50, Heal 10
    expect(healPlan(world)).toEqual({ caster: 2, spell: HEAL, target: 0 });
    hurt(world, 0, 5);
    world.member(2).mana = 55;
    world.member(2).hitPoints = 100;
    // A small wound with Heal affordable is a Heal, never a Great heal.
    expect(healPlan(world)?.spell).toBe(HEAL);
  });

  it('never targets the dead, and counts a poisoned member at full health as unhurt', () => {
    const { world } = party();
    world.member(2).mana = 60;
    world.member(0).status = 'D';
    world.member(0).hitPoints = 0;
    world.member(1).status = 'P';
    expect(healPlan(world)).toBeNull();
    hurt(world, 3, 30);
    expect(healPlan(world)?.target).toBe(3);
  });

  it('lets a ranger or druid cast the cleric spells, and prefers the caster with the most mana', () => {
    const { world } = party();
    hurt(world, 0, 10);
    world.member(1).mana = 30; // the ranger
    expect(healPlan(world)).toEqual({ caster: 1, spell: HEAL, target: 0 });
    world.member(2).mana = 40; // the cleric, now richer
    expect(healPlan(world)?.caster).toBe(2);
    world.member(2).status = 'D'; // a dead cleric cannot cast
    expect(healPlan(world)?.caster).toBe(1);
  });

  it('walks the example: Great heal on the fighter, then Heal on the next, then nothing', () => {
    const { world } = party();
    world.member(2).mana = 60;
    hurt(world, 0, 90); // the "fighter", worst off
    hurt(world, 1, 15);
    hurt(world, 3, 12);
    expect(healPlan(world)?.spell).toBe(GREAT_HEAL);
    world.member(2).mana -= 50; // cast it: 10 left
    hurt(world, 0, 0);
    expect(healPlan(world)).toEqual({ caster: 2, spell: HEAL, target: 1 });
    world.member(2).mana -= 10; // cast it: 0 left
    hurt(world, 1, 0);
    expect(healPlan(world)).toBeNull(); // Ghiselle is still hurt, but nobody can pay
  });
});

describe('the quick heal', () => {
  it('casts the plan at once: pays the caster, heals the target, asks nothing', async () => {
    const { world, io } = party();
    world.member(2).mana = 60;
    hurt(world, 0, 80);
    io.keys = []; // nothing to answer
    expect(await quickHeal(world, io)).toBe(true);
    expect(world.member(2).mana).toBe(10);
    expect(world.member(0).hitPoints).toBeGreaterThanOrEqual(40); // Great heal gives 20..100
    expect(io.output).toContain('Great heal\non Tatiana');
    expect(io.output).toContain('SANCTU MANI');
    expect(world.lastSpell[2]).toBe(GREAT_HEAL);
  });

  it('does nothing, and says so, when there is no plan', async () => {
    const { world, io } = party();
    expect(await quickHeal(world, io)).toBe(false);
  });
});

describe('the field and dungeon menus', () => {
  it('lead with Cast (Heal) or Cast (Great heal) only while someone is hurt and someone can pay', () => {
    const { world } = party();
    const first = () => commandMenu(world, 'field', COMMAND_MENUS.field)[0];
    expect(first().key).not.toBe(QUICK_CAST_KEY);
    hurt(world, 0, 30);
    expect(first().key).not.toBe(QUICK_CAST_KEY); // hurt, but no mana anywhere
    world.member(2).mana = 60;
    expect(first().label).toBe('Cast (Great heal)');
    hurt(world, 0, 10);
    expect(first().label).toBe('Cast (Heal)');
    // Ahead of the surroundings' own suggestion too: stand on a real town square from the location table.
    world.x = world.resources.misc.locationX[1];
    world.y = world.resources.misc.locationY[1];
    world.putXYVal(MapValue.Town, world.x, world.y);
    const keys = commandMenu(world, 'field', COMMAND_MENUS.field).map((o) => o.key);
    expect(keys.slice(0, 2)).toEqual([QUICK_CAST_KEY, 'E']);
    // Dungeons the same.
    expect(commandMenu(world, 'dungeon', COMMAND_MENUS.dungeon)[0].label).toBe('Cast (Heal)');
  });
});

describe('the Safe chest shortcut', () => {
  const labels = (world: World, scope: 'field' | 'dungeon') => commandMenu(world, scope, COMMAND_MENUS[scope]).map((o) => o.label);

  it('appears under Get chest only on a chest, and only while a cleric-spell caster can pay', () => {
    const { world } = party();
    expect(labels(world, 'field')).not.toContain('Cast (Safe chest)');
    world.putXYVal(MapValue.Chest + 1, world.x, world.y); // a chest left on grass
    expect(labels(world, 'field')).not.toContain('Cast (Safe chest)'); // nobody has the mana
    world.member(2).mana = 4;
    expect(safeChestCaster(world)).toBeNull();
    world.member(2).mana = 5;
    expect(safeChestCaster(world)).toBe(2);
    const menu = labels(world, 'field');
    expect(menu.indexOf('Cast (Safe chest)')).toBe(menu.indexOf('Get chest') + 1);
    // The ranger casts cleric spells too; the caster with the most mana is chosen.
    world.member(1).mana = 9;
    expect(safeChestCaster(world)).toBe(1);
    // A hurt member keeps Cast (Heal) first; Safe chest stays under Get chest.
    hurt(world, 0, 10);
    world.member(2).mana = 20;
    const both = labels(world, 'field');
    expect(both[0]).toBe('Cast (Heal)');
    expect(both.indexOf('Cast (Safe chest)')).toBe(both.indexOf('Get chest') + 1);
    // The wizard alone cannot.
    world.member(1).mana = world.member(2).mana = 0;
    world.member(3).mana = 50;
    expect(safeChestCaster(world)).toBeNull();
  });

  it('appears in a dungeon on a chest cell', () => {
    const { world } = party();
    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.dungeon.tiles.fill(DungeonCell.Open);
    world.x = 3;
    world.y = 3;
    world.dungeon.torch = 5;
    world.member(2).mana = 30;
    expect(labels(world, 'dungeon')).not.toContain('Cast (Safe chest)');
    world.putXYDng(DungeonCell.Chest, 3, 3);
    const menu = labels(world, 'dungeon');
    expect(menu.indexOf('Cast (Safe chest)')).toBe(menu.indexOf('Get chest') + 1);
  });

  it('casts at once: pays the caster, disarms the trap, opens the chest, asks nothing', async () => {
    const { world, io } = party();
    world.putXYVal(MapValue.Chest + 1, world.x, world.y);
    world.member(2).mana = 30;
    world.rng.range = () => 1; // the spell never fails, and the chest holds gold
    const gold = world.party.gold;
    expect(await quickSafeChest(world, io)).toBe(true);
    expect(io.output).toContain('Safe chest\nby Norric');
    expect(io.output).toContain('APPAR UNEM');
    expect(world.member(2).mana).toBe(25);
    expect(world.getXYVal(world.x, world.y)).toBe(MapValue.Grass);
    expect(world.party.gold).toBeGreaterThan(gold);
    expect(world.lastSpell[2]).toBe(SAFE_CHEST);
  });

  it('does nothing off a chest or without a caster', async () => {
    const { world, io } = party();
    world.member(2).mana = 30;
    expect(await quickSafeChest(world, io)).toBe(false);
    world.putXYVal(MapValue.Chest, world.x, world.y);
    world.member(2).mana = 0;
    expect(await quickSafeChest(world, io)).toBe(false);
  });
});

describe('the light shortcut', () => {
  const labels = (world: World, scope: 'field' | 'dungeon') => commandMenu(world, scope, COMMAND_MENUS[scope]).map((o) => o.label);
  const dark = () => {
    const { world, io } = party();
    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.dungeon.tiles.fill(DungeonCell.Open);
    world.x = 3;
    world.y = 3;
    world.dungeon.torch = 0;
    return { world, io };
  };

  it('is nothing on the surface, in a lit dungeon, or when nobody can pay', () => {
    const { world } = party();
    world.member(3).mana = 99;
    expect(lightPlan(world)).toBeNull();
    const lit = dark().world;
    lit.member(3).mana = 99;
    lit.dungeon.torch = 5;
    expect(lightPlan(lit)).toBeNull();
    const poor = dark().world;
    poor.member(3).mana = 9; // the wizard is one short of Lorum
    poor.member(2).mana = 14; // the cleric one short of Luminae
    poor.member(0).mana = 99; // the fighter has no book
    expect(lightPlan(poor)).toBeNull();
  });

  it('prefers Long light, then the most mana, then party order, and the cheaper book', () => {
    const { world } = dark();
    world.member(3).mana = 10; // the wizard can only manage Lorum
    expect(lightPlan(world)).toEqual({ caster: 3, spell: 2 });
    world.member(2).mana = 15; // the cleric can manage Luminae; more mana wins the tie of tiers
    expect(lightPlan(world)).toEqual({ caster: 2, spell: 19 });
    world.member(3).mana = 40; // Dag Lorum beats any Light
    expect(lightPlan(world)).toEqual({ caster: 3, spell: 8 });
    world.member(2).mana = 45; // Sominae: same tier, more mana
    expect(lightPlan(world)).toEqual({ caster: 2, spell: 25 });
    world.member(3).mana = 45; // a tie goes to party order
    expect(lightPlan(world)).toEqual({ caster: 2, spell: 25 });
    world.member(1).mana = 45; // the ranger has both books and takes the cheaper Dag Lorum
    expect(lightPlan(world)).toEqual({ caster: 1, spell: 8 });
  });

  it('sits under Ignite torch in the dungeon menu, and only in the dark', () => {
    const { world } = dark();
    world.member(3).mana = 40;
    const menu = labels(world, 'dungeon');
    expect(menu.indexOf('Cast (Long light)')).toBe(menu.indexOf('Ignite torch') + 1);
    world.party.torches = 0; // Ignite torch greyed, the shortcut still under it
    const none = labels(world, 'dungeon');
    expect(none.indexOf('Cast (Long light)')).toBe(none.indexOf('Ignite torch') + 1);
    world.dungeon.torch = 3;
    expect(labels(world, 'dungeon')).not.toContain('Cast (Long light)');
  });

  it('casts at once and lights the dungeon', async () => {
    const { world, io } = dark();
    expect(await quickLight(world, io)).toBe(false);
    world.member(3).mana = 50;
    expect(await quickLight(world, io)).toBe(true);
    expect(world.dungeon.torch).toBe(250);
    expect(world.member(3).mana).toBe(10);
    expect(world.lastSpell[3]).toBe(8);
  });
});

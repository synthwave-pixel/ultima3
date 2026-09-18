import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { Key } from '../src/game/io.ts';
import { look } from '../src/game/commands.ts';
import { readyWeapon, modifyOrder } from '../src/game/actions.ts';
import { cast } from '../src/game/spells.ts';
import { combat } from '../src/game/combat.ts';
import { Game } from '../src/game/game.ts';
import { runDungeon } from '../src/game/dungeon.ts';
import { DungeonCell } from '../src/game/world.ts';
import { MapValue } from '../src/game/tiles.ts';
import { Location } from '../src/game/party.ts';
import { MapId } from '../src/data/resources.ts';

const CLERIC = 2; // Norric, in the default party
const HEAL = 'C'; // the third cleric spell

describe('backing out of a command', () => {
  it('at a direction says Cancelled. and marks the turn unspent; answering does not', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.keys.push(Key.Escape);
    await look(world, io);
    expect(io.output).toContain('Cancelled.');
    expect(world.takeCancelled()).toBe(true);
    expect(world.takeCancelled()).toBe(false); // taken
    io.keys.push(Key.Up);
    await look(world, io);
    expect(world.takeCancelled()).toBe(false);
  });

  it('at Who? or a list changes nothing and makes no error', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const weapon = world.member(0).bytes[48];
    io.keys.push('1', Key.Escape); // Tatiana, then no weapon
    await readyWeapon(world, io);
    expect(world.member(0).bytes[48]).toBe(weapon);
    expect(io.output).not.toContain('Not owned');
    expect(io.sounds).toEqual([]);
    expect(world.takeCancelled()).toBe(true);

    const order = [0, 1, 2, 3].map((m) => world.party.memberRosterNumber(m));
    io.keys.push('1', Key.Escape); // first member, then no second
    await modifyOrder(world, io);
    expect([0, 1, 2, 3].map((m) => world.party.memberRosterNumber(m))).toEqual(order);
    expect(io.output).not.toContain('Aborted');
    expect(world.takeCancelled()).toBe(true);
  });

  it("at a spell's own prompt gives back the mana it had cost", async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.member(CLERIC).mana = 50;
    io.keys.push(HEAL, Key.Escape); // Heal, then nobody
    expect(await cast(world, io, CLERIC)).toBe(false);
    expect(world.member(CLERIC).mana).toBe(50);
    expect(io.output).toContain('Cancelled.');
    expect(io.output).not.toContain('Failed');
    expect(world.takeCancelled()).toBe(true);
  });

  it('in the field costs no move, where a command carried out costs one', async () => {
    const movesAfter = async (keys: string[]) => {
      const world = newWorld();
      const io = new FakeIO(world.resources);
      io.keys.push(...keys, 'Q'); // Q ends the game loop
      const before = world.party.moves;
      await new Game(world, io).run();
      return world.party.moves - before;
    };
    expect(await movesAfter(['L', Key.Escape])).toBe(0);
    expect(await movesAfter(['L', Key.Up])).toBeGreaterThan(0);
  });

  it('in a dungeon passes no turn: the torch burns no lower', async () => {
    const torchAfter = async (keys: string[]) => {
      const world = newWorld(7);
      world.enterDungeon(MapId.FirstDungeon);
      world.party.location = Location.Dungeon;
      world.dungeon.tiles.fill(DungeonCell.Wall, 0, 256);
      world.putXYDng(DungeonCell.LadderUp, 1, 1);
      world.x = 1;
      world.y = 1;
      world.party.torches = 1;
      const io = new FakeIO(world.resources);
      io.keys = ['I', ...keys, 'K']; // light the torch, then climb out
      await runDungeon(world, io);
      return world.dungeon.torch;
    };
    const lit = await torchAfter([]);
    expect(await torchAfter(['Z', Key.Escape])).toBe(lit);
    expect(await torchAfter([' '])).toBe(lit - 1);
  });

  it('in combat asks the same member again, and Ztats does not spend the turn', async () => {
    const world = newWorld(42);
    world.current.tiles.fill(MapValue.Floor);
    world.monsters.bytes.fill(0);
    world.party.location = Location.Town; // one monster only
    const io = new FakeIO(world.resources);
    // Player 1: Attack then no direction, Ztats closed at once, Ready then no weapon, then Pass.
    io.keys.push('A', Key.Escape, 'Z', Key.Escape, 'R', Key.Escape, ' ');
    // Everyone after passes, and the monster drops so the fight ends with the round.
    io.keyProvider = () => {
      world.combat?.monsters.forEach((m) => (m.hp = 0));
      return ' ';
    };
    await combat(world, io, MapValue.Orc >> 1, 0);
    const firstTurn = io.output.slice(0, io.output.indexOf('PLAYER-2'));
    expect(firstTurn.split('PLAYER-1').length - 1).toBe(4); // asked again after each of the three
    expect(firstTurn.split('Cancelled.').length - 1).toBe(2); // Attack and Ready; Ztats is just closed
    expect(firstTurn).toContain('Pass');
  });
});

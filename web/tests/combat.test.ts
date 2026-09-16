import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import {
  combat,
  chooseArena,
  loadArena,
  planMonster,
  handleMove,
  memberShape,
  monsterName,
  attackMonster,
  placeRevived,
  combatAttackForTest,
} from '../src/game/combat.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';
import { Location } from '../src/game/party.ts';
import { Key } from '../src/game/io.ts';
import { BASERES } from '../src/data/resources.ts';
import { World } from '../src/game/world.ts';
import { checkAllDead } from '../src/game/death.ts';

function flatWorld(): { world: World; io: FakeIO } {
  const world = newWorld(42);
  world.current.tiles.fill(MapValue.Grass);
  world.monsters.bytes.fill(0);
  world.x = 32;
  world.y = 32;
  return { world, io: new FakeIO(world.resources) };
}

describe('arenas', () => {
  it('picks the arena from the terrain and the monster type', () => {
    const { world } = flatWorld();
    expect(chooseArena(world, MapValue.Orc >> 1).id).toBe(BASERES + 4); // grass
    world.putXYVal(MapValue.Forest, 32, 32);
    expect(chooseArena(world, MapValue.Orc >> 1).id).toBe(BASERES + 3);
    // Boarding a pirate frigate means fighting thieves.
    expect(chooseArena(world, 0x1e)).toEqual({ id: BASERES, monsterShape: 0x2e });
  });

  it('loads an arena with eight monster slots and four member slots', () => {
    const { world } = flatWorld();
    const c = loadArena(world, BASERES + 4);
    expect(c.tiles).toHaveLength(121);
    expect(c.monsters).toHaveLength(8);
    expect(c.members).toHaveLength(4);
    for (const m of c.members) expect(c.tiles[m.y * 11 + m.x]).toBe(Shape.Grass);
  });

  it('gives each class its own figure tile, in career-table order', () => {
    const { world } = flatWorld();
    expect(memberShape(world, 'F')).toBe(68 * 2);
    expect(memberShape(world, 'C')).toBe(69 * 2);
    expect(memberShape(world, 'W')).toBe(70 * 2);
    expect(memberShape(world, 'T')).toBe(71 * 2);
    expect(memberShape(world, 'P')).toBe(72 * 2);
    expect(memberShape(world, 'B')).toBe(73 * 2);
    expect(memberShape(world, 'L')).toBe(74 * 2);
    expect(memberShape(world, 'I')).toBe(75 * 2);
    expect(memberShape(world, 'D')).toBe(76 * 2);
    expect(memberShape(world, 'A')).toBe(77 * 2);
    expect(memberShape(world, 'R')).toBe(78 * 2);
    expect(memberShape(world, '?')).toBe(0x7e);
  });

  it('names monsters and their variants', () => {
    const { world } = flatWorld();
    expect(monsterName(world, MapValue.Orc >> 1, 0, false)).toBe('Orc');
    expect(monsterName(world, MapValue.Orc >> 1, 1, true)).toBe('Goblins');
    expect(monsterName(world, MapValue.Orc >> 1, 2, false)).toBe('Troll');
  });
});

describe('monster planning', () => {
  it('steps toward the nearest member and reports adjacency', () => {
    const { world } = flatWorld();
    const c = loadArena(world, BASERES + 4);
    c.tiles.fill(Shape.Grass);
    world.combat = c;
    world.party.location = Location.Combat;
    c.members.forEach((m) => (m.x = m.y = 255));
    c.members[0].x = 5;
    c.members[0].y = 8;
    c.monsters[0].hp = 10;
    c.monsters[0].x = 5;
    c.monsters[0].y = 2;
    c.monsterShape = MapValue.Orc >> 1;
    const plan = planMonster(world, 0);
    expect(plan.target).toBe(0);
    expect(plan.newX).toBe(5);
    expect(plan.newY).toBe(3);
    expect(plan.distance).toBe(6);

    c.monsters[0].y = 7;
    expect(planMonster(world, 0).distance).toBe(0);
  });

  it('a member cannot walk into walls or other creatures', () => {
    const { world, io } = flatWorld();
    const c = loadArena(world, BASERES + 4);
    c.tiles.fill(Shape.Grass);
    world.combat = c;
    c.members[0].x = 5;
    c.members[0].y = 5;
    c.tiles[4 * 11 + 5] = Shape.Wall;
    handleMove(world, io, 0, 0, -1);
    expect(c.members[0].y).toBe(5);
    expect(io.output).toContain('INVALID MOVE!');
    handleMove(world, io, 0, 1, 0);
    expect(c.members[0].x).toBe(6);
    expect(io.sounds).toContain('Step');
  });
});

describe('a whole fight', () => {
  it('is won by attacking until the monsters die, and awards experience', async () => {
    const { world, io } = flatWorld();
    // Make the party strong so the fight is short.
    for (let m = 0; m < 4; m++) {
      const p = world.member(m);
      p.bytes[18] = 99; // strength
      p.bytes[19] = 99; // dexterity
      p.bytes[48] = 6; // sword
      p.bytes[54] = 1;
    }
    world.party.location = Location.Town; // one monster only
    world.current.tiles.fill(MapValue.Floor);
    const expBefore = world.member(0).bytes[31];

    // Each member's turn: attack toward the nearest living monster if adjacent, otherwise step toward it.
    io.keyProvider = () => {
      const c = world.combat;
      if (!c) return ' ';
      const me = c.members[c.activeMember];
      const alive = c.monsters.filter((m) => m.hp > 0);
      if (alive.length === 0) return ' ';
      const target = alive[0];
      const dx = Math.sign(target.x - me.x);
      const dy = Math.sign(target.y - me.y);
      const dirKey = dx === 0 ? (dy < 0 ? Key.Up : Key.Down) : dx < 0 ? Key.Left : Key.Right;
      if (Math.abs(target.x - me.x) <= 1 && Math.abs(target.y - me.y) <= 1 && (dx === 0 || dy === 0)) {
        io.keys.push(dirKey);
        return 'A';
      }
      return dirKey;
    };

    await combat(world, io, MapValue.Orc >> 1, 0);
    expect(world.combat).toBeNull();
    expect(world.party.location).toBe(Location.Town);
    expect(io.output).toContain('CONFLICT');
    expect(io.output).toContain('VICTORY');
    expect(io.output).toContain('KILLED! Exp.+');
    const totalExp = [0, 1, 2, 3].reduce((sum, m) => sum + world.member(m).bytes[31], 0);
    expect(totalExp).toBeGreaterThan(expBefore);
  });

  it('walking into a monster attacks it instead of bumping', async () => {
    const { world, io } = flatWorld();
    for (let m = 0; m < 4; m++) {
      const p = world.member(m);
      p.hitPoints = 400;
      p.bytes[18] = 99;
      p.bytes[19] = 99;
      p.bytes[48] = 6; // sword
      p.bytes[54] = 1;
    }
    world.party.location = Location.Town; // one monster only

    // Only ever step toward the monster; never press A.
    io.keyProvider = () => {
      const c = world.combat;
      if (!c) return ' ';
      const me = c.members[c.activeMember];
      const target = c.monsters.find((m) => m.hp > 0);
      if (!target) return ' ';
      const dx = Math.sign(target.x - me.x);
      const dy = Math.sign(target.y - me.y);
      return dx === 0 ? (dy < 0 ? Key.Up : Key.Down) : dx < 0 ? Key.Left : Key.Right;
    };

    await combat(world, io, MapValue.Orc >> 1, 0);
    expect(io.output).toContain('VICTORY');
    expect(io.output).toContain('Sword attack');
    expect(io.output).toContain('KILLED! Exp.+');
  });

  it('a monster on the map becomes a chest on the terrain it stood on', async () => {
    const { world, io } = flatWorld();
    const m = world.monsters;
    m.setType(0, MapValue.Orc);
    m.setTileUnder(0, MapValue.Brush);
    m.setPosition(0, 33, 32);
    m.setHp(0, 0xc0);
    world.putXYVal(MapValue.Orc, 33, 32);
    io.keyProvider = () => ' '; // everyone passes; the fight ends when the party dies or... we stop early
    // Kill the monsters as soon as the arena exists so the fight ends at once.
    const origRedraw = io.redrawMap.bind(io);
    io.redrawMap = () => {
      if (world.combat) world.combat.monsters.forEach((mon) => (mon.hp = 0));
      origRedraw();
    };
    await attackMonster(world, io, 0);
    expect(m.type(0)).toBe(0);
    expect(world.getXYVal(33, 32)).toBe(MapValue.Chest + 2); // chest on brush
    expect(io.output).toContain('VICTORY');
  });
});

describe('party wipe', () => {
  it('offers the last save, and Lord British otherwise', async () => {
    const { world, io } = flatWorld();
    for (let m = 0; m < world.party.size; m++) world.member(m).status = 'D';
    world.party.gold = 4321;
    let loaded = 0;
    world.loadLastSave = () => {
      loaded++;
      world.party.gold = 999; // stands in for the restored save
      for (let m = 0; m < world.party.size; m++) world.member(m).status = 'G';
      return true;
    };
    io.keys = [' ', 'T'];
    await checkAllDead(world, io);
    expect(loaded).toBe(1);
    expect(world.party.gold).toBe(999);
    expect(world.resurrecting).toBe(true);

    // Fleeing keeps the world but strips the gear.
    for (let m = 0; m < world.party.size; m++) world.member(m).status = 'D';
    world.resurrecting = false;
    io.keys = [' ', 'F'];
    await checkAllDead(world, io);
    expect(loaded).toBe(1);
    expect(world.party.gold).toBe(150 * world.party.size);
    expect(world.member(0).status).toBe('G');
    expect(world.x).toBe(42);
  });
});

describe('revival during a fight', () => {
  it('puts a member brought back to life on the nearest open square to where they fell', () => {
    const { world, io } = flatWorld();
    const c = loadArena(world, BASERES + 4);
    c.tiles.fill(Shape.Grass);
    world.combat = c;
    for (const m of c.monsters) m.hp = 0;
    const me = c.members[0];
    me.diedAt = { x: 5, y: 5 };
    me.x = me.y = 255;
    world.member(0).status = 'G';
    c.monsters[0].x = 5;
    c.monsters[0].y = 5;
    c.monsters[0].hp = 10; // the death square itself is taken
    placeRevived(world, io);
    expect(Math.max(Math.abs(me.x - 5), Math.abs(me.y - 5))).toBe(1);
    expect(io.redraws).toBeGreaterThan(0);
  });
});

describe('throwing daggers', () => {
  it('keeps a lone dagger, but throws a spare', async () => {
    const { world, io } = flatWorld();
    const c = loadArena(world, BASERES + 4);
    c.tiles.fill(Shape.Grass);
    world.combat = c;
    for (const m of c.monsters) m.hp = 0;
    c.members[0].x = 5;
    c.members[0].y = 9;
    c.monsters[0].x = 5;
    c.monsters[0].y = 5;
    c.monsters[0].hp = 10;
    const p = world.member(0);
    p.bytes[48] = 1; // dagger readied, none spare in the bag
    world.party.setWeapons(1, 0);
    io.keys = [Key.Up];
    await combatAttackForTest(world, io, 0);
    expect(io.output).toContain('Missed');
    world.party.setWeapons(1, 1); // a spare: it is thrown, the one in hand stays
    io.keys = [Key.Up];
    await combatAttackForTest(world, io, 0);
    expect(world.party.weapons(1)).toBe(0);
    expect(p.bytes[48]).toBe(1);
  });
});

describe('balanced experience', () => {
  it('shares a kill among the living, killer first for the odd points, or gives it all to the killer when off', async () => {
    const { newWorld } = await import('./helpers.ts');
    const { shareExperience } = await import('../src/game/combat.ts');
    const world = newWorld();
    expect(shareExperience(world, 2, 3)).toEqual([
      [2, 1],
      [0, 1],
      [1, 1],
    ]); // the fourth gets nothing this time
    expect(shareExperience(world, 0, 20)).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    world.member(3).status = 'D';
    expect(shareExperience(world, 0, 10)).toEqual([
      [0, 4],
      [1, 3],
      [2, 3],
    ]);
    world.balancedXp = false;
    expect(shareExperience(world, 1, 15)).toEqual([[1, 15]]);
  });
});

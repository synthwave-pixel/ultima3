import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { move, board, exit, look, enter, getDirection, PartyShape } from '../src/game/commands.ts';
import { peerGem } from '../src/game/actions.ts';
import { endTurn, placeMoongates, type TurnHooks } from '../src/game/turn.ts';
import { spawnMonster, moveMonsters, monsterCanEnter } from '../src/game/monsters.ts';
import { MapValue } from '../src/game/tiles.ts';
import { Location } from '../src/game/party.ts';
import { Key } from '../src/game/io.ts';
import { MapId } from '../src/data/resources.ts';
import { World } from '../src/game/world.ts';

/** A flat grass Sosaria with the party at (32, 32) and no monsters. */
function flatWorld(): { world: World; io: FakeIO } {
  const world = newWorld();
  world.current.tiles.fill(MapValue.Grass);
  world.monsters.bytes.fill(0);
  world.x = 32;
  world.y = 32;
  return { world, io: new FakeIO(world.resources) };
}

const noHooks: TurnHooks = {
  attack: async () => {},
  bombTrap: async () => {},
  showBall: async () => {},
  goWhirlpool: async () => {},
  dungeonTurn: async () => {},
};

describe('movement', () => {
  it('walks onto grass and plays a footstep', async () => {
    const { world, io } = flatWorld();
    await move(world, io, 'north');
    expect(world.y).toBe(31);
    expect(io.output).toContain('North');
    expect(io.sounds).toContain('Step');
  });

  it('refuses to walk into water or mountains', async () => {
    const { world, io } = flatWorld();
    world.putXYVal(MapValue.Water, 33, 32);
    world.putXYVal(MapValue.Mountains, 31, 32);
    await move(world, io, 'east');
    await move(world, io, 'west');
    expect(world.x).toBe(32);
    expect(io.output).toContain('INVALID MOVE!');
    expect(io.sounds.filter((s) => s === 'Bump')).toHaveLength(2);
  });

  it('wraps around the surface map', async () => {
    const { world, io } = flatWorld();
    world.x = 0;
    await move(world, io, 'west');
    expect(world.x).toBe(63);
  });

  it('a frigate sails on water only, and not into the wind', async () => {
    const { world, io } = flatWorld();
    world.party.shape = PartyShape.Frigate;
    world.current.tiles.fill(MapValue.Water);
    world.windDirection = 0;
    await move(world, io, 'north');
    expect(world.y).toBe(31);
    world.windDirection = 1; // north wind
    await move(world, io, 'north');
    expect(world.y).toBe(31);
    expect(io.output).toContain('INVALID MOVE!');
    world.putXYVal(MapValue.Grass, 32, 30);
    world.windDirection = 0;
    await move(world, io, 'north');
    expect(world.y).toBe(31);
  });

  it('lava burns members without the Mark of Fire', async () => {
    const { world, io } = flatWorld();
    world.putXYVal(MapValue.Lava, 32, 31);
    const before = world.member(0).hitPoints;
    await move(world, io, 'north');
    expect(world.y).toBe(31);
    expect(world.member(0).hitPoints).toBe(before - 50);
  });
});

describe('board and exit', () => {
  it('mounts a horse, leaving grass behind, and dismounts onto grass', async () => {
    const { world, io } = flatWorld();
    world.putXYVal(MapValue.Horse, 32, 32);
    board(world, io);
    expect(world.party.shape).toBe(PartyShape.Horse);
    expect(world.getXYVal(32, 32)).toBe(MapValue.Grass);
    exit(world, io);
    expect(world.party.shape).toBe(PartyShape.OnFoot);
    expect(world.getXYVal(32, 32)).toBe(MapValue.Horse);
    expect(io.output).toContain('Mount horse!');
    expect(io.output).toContain('Dismount');
  });

  it('cannot leave a ship on land', async () => {
    const { world, io } = flatWorld();
    world.party.shape = PartyShape.Frigate;
    world.putXYVal(MapValue.Brush, 32, 32);
    exit(world, io);
    expect(world.party.shape).toBe(PartyShape.Frigate);
    expect(io.output).toContain('Not here!');
  });
});

describe('look', () => {
  it('names terrain and monsters', async () => {
    const { world, io } = flatWorld();
    world.putXYVal(MapValue.Forest, 32, 31);
    io.keys = [Key.Up, Key.Left];
    await look(world, io);
    expect(io.output).toContain('Look-North\n->Forest');

    const m = world.monsters;
    m.setType(0, MapValue.Orc);
    m.setVariant(0, 2);
    m.setPosition(0, 31, 32);
    world.putXYVal(MapValue.Orc + 2, 31, 32);
    await look(world, io);
    expect(io.output).toContain('->Trolls');
  });
});

describe('enter and leave a town', () => {
  it('enters Lord British’s town and walks back out to the same square', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const { locationX, locationY } = world.resources.misc;
    world.x = locationX[2];
    world.y = locationY[2];
    enter(world, io);
    expect(world.party.location).toBe(Location.Town);
    expect(world.current.id).toBe(MapId.FirstTown);
    expect(world.x).toBe(1);
    expect(world.y).toBe(32);
    expect(io.output).toContain('Enter town!');

    // Walking west onto column 0 leaves the town at the end of the turn.
    world.putXYVal(MapValue.Grass, 0, 32);
    await move(world, io, 'west');
    await endTurn(world, io, noHooks);
    expect(world.party.location).toBe(Location.Sosaria);
    expect(world.x).toBe(locationX[2]);
    expect(world.y).toBe(locationY[2]);
    expect(io.output).toContain('Exit to Sosaria!');
  });

  it('does nothing on plain grass', () => {
    const { world, io } = flatWorld();
    enter(world, io);
    expect(io.output).toContain('<-WHAT?');
    expect(world.party.location).toBe(Location.Sosaria);
  });
});

describe('turn processing', () => {
  it('counts moves by party size and ages food', async () => {
    const { world, io } = flatWorld();
    const food = world.party.food;
    for (let i = 0; i < 10; i++) await endTurn(world, io, noHooks);
    expect(world.party.moves).toBe(40);
    // Four members each eat a tenth of a ration per turn from the party's pool.
    expect(world.party.food).toBe(food - 4);
  });

  it('keeps exactly one moongate open, at the Trammel phase position', () => {
    const { world } = flatWorld();
    world.moonPhase = [3, 5];
    placeMoongates(world);
    const { moonX, moonY } = world.resources.misc;
    for (let i = 0; i < 8; i++) {
      const v = world.getXYVal(moonX[i], moonY[i]);
      expect(v).toBe(i === 3 ? MapValue.MoonGate : MapValue.Grass);
    }
  });
});

describe('monsters', () => {
  it('knows where each kind may walk', () => {
    expect(monsterCanEnter(MapValue.Grass, MapValue.Orc)).toBe(true);
    expect(monsterCanEnter(MapValue.Water, MapValue.Orc)).toBe(false);
    expect(monsterCanEnter(MapValue.Water, MapValue.Pirate)).toBe(true);
    expect(monsterCanEnter(MapValue.Grass, MapValue.Pirate)).toBe(false);
    expect(monsterCanEnter(MapValue.Mountains, MapValue.Dragon)).toBe(false);
  });

  it('spawns on the right terrain and records it', () => {
    const { world } = flatWorld();
    let spawned = 0;
    for (let i = 0; i < 2000 && spawned === 0; i++) {
      spawnMonster(world);
      for (let s = 0; s < 32; s++) if (world.monsters.type(s)) spawned++;
    }
    expect(spawned).toBeGreaterThan(0);
    const s = world.monsters.freeSlot() === 31 ? 30 : 31;
    expect(world.monsters.tileUnder(s)).toBe(MapValue.Grass);
    expect(world.getXYVal(world.monsters.x(s), world.monsters.y(s))).toBe(world.monsters.type(s));
  });

  it('closes in on the party and attacks on contact', async () => {
    const { world, io } = flatWorld();
    const m = world.monsters;
    m.setType(0, MapValue.Orc);
    m.setTileUnder(0, MapValue.Grass);
    m.setPosition(0, 35, 32);
    m.setHp(0, 0xc0);
    world.putXYVal(MapValue.Orc, 35, 32);

    let attacked = -1;
    const hooks: TurnHooks = { ...noHooks, attack: async (i) => void (attacked = i) };
    await moveMonsters(world, io, hooks);
    expect(m.x(0)).toBe(34);
    expect(world.getXYVal(35, 32)).toBe(MapValue.Grass);
    expect(world.getXYVal(34, 32)).toBe(MapValue.Orc);
    await moveMonsters(world, io, hooks);
    expect(m.x(0)).toBe(33);
    await moveMonsters(world, io, hooks);
    expect(attacked).toBe(0);
  });

  it('approaches the short way round a wrapped map', async () => {
    const { world, io } = flatWorld();
    world.x = 2;
    const m = world.monsters;
    m.setType(0, MapValue.Orc);
    m.setTileUnder(0, MapValue.Grass);
    m.setPosition(0, 60, 32);
    m.setHp(0, 0xc0);
    world.putXYVal(MapValue.Orc, 60, 32);
    await moveMonsters(world, io, noHooks);
    expect(m.x(0)).toBe(61); // east, across the seam, not 58 squares west
  });
});

describe('walking into townspeople', () => {
  it('reports the NPC in the way instead of moving', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.enterMap(MapId.FirstTown);
    world.party.location = Location.Town;
    world.current.tiles.fill(MapValue.Floor);
    world.monsters.bytes.fill(0);
    world.x = 20;
    world.y = 20;
    const m = world.monsters;
    m.setType(3, MapValue.Jester);
    m.setTileUnder(3, MapValue.Floor);
    m.setPosition(3, 21, 20);
    world.putXYVal(MapValue.Jester, 21, 20);
    expect(await move(world, io, 'east')).toEqual({ kind: 'person', index: 3 });
    expect(world.x).toBe(20);
    expect(await move(world, io, 'west')).toBeNull();
    expect(world.x).toBe(19);
  });
});

describe('diagonal moves', () => {
  it('keeps the lava beside Exodus castle, and walls it off when diagonals are allowed', () => {
    const world = newWorld();
    expect(world.diagonalMoves).toBe(false);
    expect(world.surface.tiles[0x35 * 64 + 0x0a]).toBe(MapValue.Castle);
    expect(world.surface.tiles[0x35 * 64 + 0x09]).toBe(MapValue.Lava);
    world.setDiagonalMoves(true);
    expect(world.surface.tiles[0x35 * 64 + 0x09]).toBe(MapValue.Mountains);
    expect(world.surface.tiles[0x35 * 64 + 0x0b]).toBe(MapValue.Mountains);
    world.setDiagonalMoves(false);
    expect(world.surface.tiles[0x35 * 64 + 0x0b]).toBe(MapValue.Lava);
  });

  it('refuses a diagonal answer to a direction prompt, unless diagonals are allowed', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.keys = ['9'];
    expect(await getDirection(world, io)).toBeNull();
    world.setDiagonalMoves(true);
    io.keys = ['9'];
    expect(await getDirection(world, io)).toMatchObject({ dx: 1, dy: -1 });
  });
});

describe('walking into counters and doors', () => {
  function town(): { world: World; io: FakeIO } {
    const world = newWorld();
    world.enterMap(MapId.FirstTown);
    world.party.location = Location.Town;
    world.current.tiles.fill(MapValue.Floor);
    world.monsters.bytes.fill(0);
    world.x = 20;
    world.y = 20;
    return { world, io: new FakeIO(world.resources) };
  }

  it('reports a shop counter with a merchant behind it', async () => {
    const { world, io } = town();
    world.putXYVal(MapValue.LetterA, 21, 20);
    world.putXYVal(MapValue.Merchant, 22, 20);
    expect(await move(world, io, 'east')).toEqual({ kind: 'counter', dx: 1, dy: 0 });
    // A bare counter with nothing behind it is just a wall.
    world.putXYVal(MapValue.Floor, 22, 20);
    expect(await move(world, io, 'east')).toBeNull();
    expect(world.x).toBe(20);
  });

  it('reports a locked door, but only from the side', async () => {
    const { world, io } = town();
    world.putXYVal(MapValue.LetterI, 21, 20);
    expect(await move(world, io, 'east')).toEqual({ kind: 'door', dx: 1, dy: 0 });
    world.putXYVal(MapValue.LetterI, 20, 19);
    expect(await move(world, io, 'north')).toBeNull();
    expect(world.y).toBe(20);
  });
});

describe('walking into a monster on the surface', () => {
  it('reports the monster instead of stepping onto its square', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    const m = world.monsters;
    m.setType(0, MapValue.Orc);
    m.setPosition(0, world.x + 1, world.y);
    m.setHp(0, 0x80);
    const x = world.x;
    expect(await move(world, io, 'east')).toEqual({ kind: 'monster', dx: 1, dy: 0 });
    expect(world.x).toBe(x);
  });
});

describe('peer at gem', () => {
  it("spends one of the party's gems without asking whose", async () => {
    const { world, io } = flatWorld();
    world.party.gems = 2;
    io.keys = [];
    await peerGem(world, io);
    expect(io.output).not.toContain('Whose gem');
    expect(world.party.gems).toBe(1);
  });

  it('says none left when the party has no gem', async () => {
    const { world, io } = flatWorld();
    world.party.gems = 0;
    await peerGem(world, io);
    expect(io.output).toContain('None left');
  });
});

describe('poison', () => {
  it('stops at one hit point unless Poison kills is on', async () => {
    const { world, io } = flatWorld();
    const p = world.member(0);
    p.status = 'P';
    p.hitPoints = 2;
    world.party.food = 500;
    await endTurn(world, io, noHooks); // ageing runs every surface turn
    expect(p.hitPoints).toBe(1);
    await endTurn(world, io, noHooks);
    expect(p.hitPoints).toBe(1);
    expect(p.status).toBe('P'); // still poisoned, just not dying
    world.poisonKills = true;
    await endTurn(world, io, noHooks);
    expect(p.hitPoints).toBe(0);
    expect(p.status).toBe('D');
  });
});

describe('starvation', () => {
  it('bites by setting: none, mild to half, classic to death, one warning a tick', async () => {
    const { world, io } = flatWorld();
    world.party.food = 0;
    const hp = [0, 1, 2, 3].map((m) => world.member(m).hitPoints); // 100 each
    world.starvation = 'none';
    await endTurn(world, io, noHooks);
    expect(world.member(0).hitPoints).toBe(hp[0]);
    expect(io.output.split('STARVING!').length - 1).toBe(1);
    world.starvation = 'mild';
    for (let i = 0; i < 20; i++) await endTurn(world, io, noHooks);
    expect(world.member(0).hitPoints).toBe(50);
    world.starvation = 'classic';
    for (let i = 0; i < 20; i++) await endTurn(world, io, noHooks);
    expect(world.member(0).status).toBe('D');
  });
});

describe('the turn timer', () => {
  it('keeps the original waits under Fast, more than doubles them under Slow, and has no limit when Off', () => {
    const world = newWorld();
    expect(world.timer).toBe('fast');
    expect([4000, 5000, 6000].map((ms) => world.timeLimit(ms))).toEqual([4000, 5000, 6000]);
    world.timer = 'slow';
    expect([4000, 5000, 6000].map((ms) => world.timeLimit(ms))).toEqual([10000, 12000, 14000]);
    world.timer = 'off';
    expect(world.timeLimit(4000)).toBeUndefined();
  });
});

describe('moongates come out of', () => {
  it('are remembered, once each, saved with the game, and forgotten by a new game', async () => {
    const { handleMoonStep } = await import('../src/game/turn.ts');
    const { serialize, restore } = await import('../src/game/save.ts');
    const { World } = await import('../src/game/world.ts');
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.moonPhase = [2, 5];
    await handleMoonStep(world, io);
    expect([world.x, world.y]).toEqual([world.resources.misc.moonX[5], world.resources.misc.moonY[5]]);
    expect(world.gatesKnown).toEqual([5]);
    await handleMoonStep(world, io);
    expect(world.gatesKnown).toEqual([5]);
    world.moonPhase = [2, 0];
    await handleMoonStep(world, io);
    expect(world.gatesKnown).toEqual([5, 0]);
    const data = JSON.parse(JSON.stringify(serialize(world))) as ReturnType<typeof serialize>;
    const b = new World(world.resources);
    expect(restore(b, data)).toBe(true);
    expect(b.gatesKnown).toEqual([5, 0]);
    expect(restore(b, { ...data, version: 5, moongates: undefined })).toBe(true);
    expect(b.gatesKnown).toEqual([]);
    world.newGame();
    expect(world.gatesKnown).toEqual([]);
  });
});

describe('walking into table entries that are not creatures', () => {
  it('steps onto the Floor entries in front of Exodus, as the original did, instead of talking to them', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    world.enterMap(401);
    world.party.location = Location.Castle;
    world.x = 31;
    world.y = 15;
    world.putXYVal(MapValue.Floor, 31, 15);
    expect(world.monsters.at(31, 14)).toBeGreaterThanOrEqual(0);
    expect(world.monsters.type(world.monsters.at(31, 14))).toBe(MapValue.Floor);
    const bump = await move(world, io, 'north');
    expect(bump).toBeNull();
    expect([world.x, world.y]).toEqual([31, 14]);
  });
});

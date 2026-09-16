import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { speech, transact, unlock, steal, otherCommand, fire, unlockToward, transactToward } from '../src/game/interact.ts';
import { shop } from '../src/game/shops.ts';
import { cast } from '../src/game/spells.ts';
import { getChest, readyWeapon, wearArmour, stats } from '../src/game/actions.ts';
import { mainMenu, createCharacter, formParty, terminateCharacter } from '../src/game/menu.ts';
import { MapValue } from '../src/game/tiles.ts';
import { Location } from '../src/game/party.ts';
import { Key } from '../src/game/io.ts';
import { MapId } from '../src/data/resources.ts';
import { World } from '../src/game/world.ts';

function townWorld(): { world: World; io: FakeIO } {
  const world = newWorld(99);
  world.returnX = 46;
  world.returnY = 19;
  world.party.surfaceX = 46;
  world.party.surfaceY = 19;
  world.enterMap(MapId.FirstTown);
  world.party.location = Location.Town;
  world.current.tiles.fill(MapValue.Floor);
  world.monsters.bytes.fill(0);
  world.x = 20;
  world.y = 20;
  return { world, io: new FakeIO(world.resources) };
}

describe('talking', () => {
  it('decodes NPC dialogue from the talk table', () => {
    const world = newWorld();
    const talk = world.resources.talk.get(MapId.LordBritishCastle)!;
    expect(speech(talk, 1)).toContain('WEST');
    expect(speech(talk, 2)).toContain('COOKIE');
  });

  it('talks to a townsperson and to a merchant across a counter', async () => {
    const { world, io } = townWorld();
    const m = world.monsters;
    m.setType(0, MapValue.Jester);
    m.setTileUnder(0, MapValue.Floor);
    m.setPosition(0, 21, 20);
    m.setHp(0, 0x02); // stationary, says line 2
    world.putXYVal(MapValue.Jester, 21, 20);
    io.keys = [Key.Right];
    await transact(world, io);
    expect(io.output).toContain(speech(world.current.talk, 2).slice(0, 8));

    // A counter (letter tile) with a merchant behind it, at a Y that selects the grocer.
    world.y = 17; // 17 & 7 = 1: grocer
    world.putXYVal(MapValue.LetterA, 21, 17);
    world.putXYVal(MapValue.Merchant, 22, 17);
    io.keys = [Key.Right, 'N'];
    io.inputs = ['20'];
    const gold = world.party.gold;
    const food = world.party.food;
    await transact(world, io);
    expect(io.output).toContain('GROCER');
    expect(world.party.gold).toBe(gold - 20);
    expect(world.party.food).toBe(food + 20);
  });
});

describe('shops', () => {
  it('sells a weapon into the party bag, offers to ready it, and buys it back', async () => {
    const { world, io } = townWorld();
    const p = world.member(1); // Roderic, a ranger, dagger in hand
    world.party.gold = 500;
    world.party.surfaceX = 0; // a basic shop
    // No list; buy a mace; decline to ready it; Escape leaves the shop (buying stays in buy mode, as in the original).
    io.keys = ['N', 'B', 'C', 'N', Key.Escape];
    await shop(world, io, 3, 1);
    expect(io.output).toContain('WEAPONS SHOP');
    expect(io.output).toContain('Readied: Dagger');
    expect(io.output).toContain('Here you are');
    expect(io.output).toContain('Ready it? (Y/N)-N');
    expect(world.party.weapons(2)).toBe(1);
    expect(p.bytes[48]).toBe(1);
    expect(world.party.gold).toBe(470);
    // Sell it back.
    io.keys = ['N', 'S', 'C', Key.Escape];
    await shop(world, io, 3, 1);
    expect(io.output).toContain('Thank you');
    expect(world.party.weapons(2)).toBe(0);
    expect(world.party.gold).toBe(500);
  });

  it('readies a purchase on the spot when asked, returning the old weapon to the bag', async () => {
    const { world, io } = townWorld();
    const p = world.member(1);
    world.party.gold = 500;
    world.party.surfaceX = 0;
    io.keys = ['N', 'B', 'G', 'Y', Key.Escape]; // a sword, readied
    await shop(world, io, 3, 1);
    expect(io.output).toContain('Sword Ready');
    expect(p.bytes[48]).toBe(6);
    expect(world.party.weapons(6)).toBe(0);
    expect(world.party.weapons(1)).toBe(1); // the dagger went back in the bag
  });

  it('does not offer to ready what the member cannot use, and greys it in the list', async () => {
    const { world, io } = townWorld();
    world.party.gold = 500;
    world.party.surfaceX = 0;
    io.keys = ['N', 'B', 'H', Key.Escape]; // a 2-H sword for the thief (member 0): no offer
    await shop(world, io, 3, 0);
    expect(io.output).not.toContain('Ready it?');
    expect(world.party.weapons(7)).toBe(1);
  });

  it('the healer cures poison for 100 gold', async () => {
    const { world, io } = townWorld();
    world.party.gold = 300;
    world.member(2).status = 'P';
    io.keys = ['1', 'Y', '3'];
    await shop(world, io, 2, 0);
    expect(world.member(2).status).toBe('G');
    expect(world.party.gold).toBe(200);
  });
});

describe('doors, chests and stealing', () => {
  it('unlocks a door the party walked into', async () => {
    const { world, io } = townWorld();
    world.putXYVal(MapValue.LetterI, 21, 20);
    world.party.keys = 1;
    io.keys = [];
    await unlockToward(world, io, 1, 0);
    expect(world.getXYVal(21, 20)).toBe(MapValue.Floor);
    expect(world.party.keys).toBe(0);
  });

  it('shops at a counter the party walked into', async () => {
    const { world, io } = townWorld();
    world.y = 17; // 17 & 7 = 1: grocer
    world.putXYVal(MapValue.LetterA, 21, 17);
    world.putXYVal(MapValue.Merchant, 22, 17);
    // The grocer asks nobody's name: food is the party's.
    io.keys = ['N'];
    io.inputs = ['10'];
    const food = world.party.food;
    const gold = world.party.gold;
    await transactToward(world, io, 1, 0);
    expect(io.output).toContain('GROCER');
    expect(world.party.food).toBe(food + 10);
    expect(world.party.gold).toBe(gold - 10);
  });

  it('unlocks a door with a key', async () => {
    const { world, io } = townWorld();
    world.putXYVal(MapValue.LetterI, 21, 20);
    world.party.keys = 1;
    io.keys = [Key.Right];
    await unlock(world, io);
    expect(world.getXYVal(21, 20)).toBe(MapValue.Floor);
    expect(world.party.keys).toBe(0);
    expect(io.sounds).toContain('Creak');
  });

  it('opens a chest for gold and removes it', async () => {
    const { world, io } = townWorld();
    world.putXYVal(MapValue.Chest, world.x, world.y);
    world.member(0).bytes[19] = 99; // a dexterous thief always disarms the trap
    const gold = world.party.gold;
    io.keys = ['1'];
    await getChest(world, io, 0, 'command');
    expect(world.getXYVal(world.x, world.y)).toBe(MapValue.Floor);
    expect(world.party.gold).toBeGreaterThan(gold);
    expect(io.output).toContain('GOLD+');
  });

  it('a thief can steal the chest behind a counter', async () => {
    const { world, io } = townWorld();
    world.member(0).bytes[19] = 99; // a dexterous thief never fails
    world.putXYVal(MapValue.LetterA, 21, 20);
    world.putXYVal(MapValue.Chest, 22, 20);
    io.keys = ['1', Key.Right];
    await steal(world, io);
    expect(world.getXYVal(22, 20)).toBe(MapValue.Floor);
    expect(io.output).toContain('GOLD+');
  });
});

describe('equipment and stats', () => {
  it('readies a weapon only if the bag holds one and the class allows it', async () => {
    const { world, io } = townWorld();
    const p = world.member(0); // a thief may use a sword but not a two-handed sword
    world.party.setWeapons(7, 1); // the bag holds a 2-H-Swd
    io.keys = ['1', 'H'];
    await readyWeapon(world, io);
    expect(io.output).toContain('Not allowed');
    io.keys = ['1', 'B'];
    await readyWeapon(world, io);
    expect(io.output).toContain('Dagger Ready'); // already in hand: nothing moves
    expect(p.bytes[48]).toBe(1);
    io.keys = ['1', 'C'];
    await wearArmour(world, io);
    expect(io.output).toContain('Not owned');
  });

  it('swaps through the bag: readying a mace returns the dagger for another member', async () => {
    const { world, io } = townWorld();
    world.party.setWeapons(2, 1);
    io.keys = ['1', 'C'];
    await readyWeapon(world, io);
    expect(world.member(0).bytes[48]).toBe(2);
    expect(world.party.weapons(2)).toBe(0);
    expect(world.party.weapons(1)).toBe(1);
    world.member(1).bytes[48] = 0; // bare-handed, takes the spare dagger
    io.keys = ['2', 'B'];
    await readyWeapon(world, io);
    expect(world.member(1).bytes[48]).toBe(1);
    expect(world.party.weapons(1)).toBe(0);
  });

  it('prints the stats screen and stops on escape', async () => {
    const { world, io } = townWorld();
    io.keys = ['1', Key.Enter, Key.Escape];
    await stats(world, io);
    expect(io.output).toContain('STR...');
    expect(io.output).toContain('H.P...');
    // Race and class under the name.
    const races = world.resources.strings.Races;
    const race = races.find((r) => r[0] === world.member(0).race)!;
    expect(io.output).toContain(race);
    expect(io.output).toContain('Thief');
  });
});

describe('spells', () => {
  it('a thief is not a mage; a cleric heals', async () => {
    const { world, io } = townWorld();
    io.keys = ['1'];
    await cast(world, io);
    expect(io.output).toContain('Not a mage');

    const cleric = world.member(2); // Norric, a cleric
    cleric.mana = 20;
    cleric.hitPoints = 10;
    io.keys = ['3', 'C', '3']; // Sanctu (cleric C), heal member 3
    await cast(world, io);
    expect(io.output).toContain('SANCTU');
    expect(cleric.hitPoints).toBeGreaterThan(10);
    expect(cleric.mana).toBe(10);
  });
});

describe('other commands', () => {
  it('bribes a guard away', async () => {
    const { world, io } = townWorld();
    const m = world.monsters;
    m.setType(0, MapValue.Guard);
    m.setTileUnder(0, MapValue.Floor);
    m.setPosition(0, 21, 20);
    world.putXYVal(MapValue.Guard, 21, 20);
    io.keys = ['1', Key.Right];
    io.inputs = ['BRIBE'];
    world.party.gold = 150;
    await otherCommand(world, io);
    expect(m.type(0)).toBe(0);
    expect(world.party.gold).toBe(50);
  });

  it('cannons sink a pirate ship', async () => {
    const world = newWorld(5);
    const io = new FakeIO(world.resources);
    world.current.tiles.fill(MapValue.Water);
    world.monsters.bytes.fill(0);
    world.party.shape = 0x16;
    world.x = 32;
    world.y = 32;
    const m = world.monsters;
    m.setType(0, MapValue.Pirate);
    m.setTileUnder(0, MapValue.Water);
    m.setPosition(0, 34, 32);
    world.putXYVal(MapValue.Pirate, 34, 32);
    let destroyed = false;
    for (let i = 0; i < 20 && !destroyed; i++) {
      io.keys = [Key.Right];
      await fire(world, io);
      destroyed = m.type(0) === 0;
    }
    expect(destroyed).toBe(true);
    expect(io.output).toContain('destroyed!');
    expect(world.getXYVal(34, 32)).toBe(MapValue.Water);
  });
});

describe('menus', () => {
  it('creates a character and forms a party', async () => {
    const world = new World(newWorld().resources, 3);
    const io = new FakeIO(world.resources);
    // Entry 5; type the name Mira; sex F, race Elf, class Wizard; 15/10/15/10 points; OK.
    io.keys = ['5', 'T', 'F', 'E', 'W', 'Y', ' '];
    io.inputs = ['Mira', '15,10,15,10'];
    await createCharacter(world, io);
    const p = world.roster.get(4);
    expect(p.name).toBe('Mira');
    expect(p.classLetter).toBe('W');
    expect(p.race).toBe('E');
    expect(p.intelligence).toBe(15);
    expect(p.hitPoints).toBe(100);

    // Pick entry 5, then Done, then Modern at "Choose Thine Adventure!".
    io.keys = ['5', 'D', ' ', 'M'];
    await formParty(world, io);
    expect(world.party.formed).toBe(true);
    expect(world.party.rulesPending).toBe(false);
    expect(world.starvation).toBe('mild');
    expect(world.party.size).toBe(1);
    expect(world.party.memberSlot(0)).toBe(4);
    expect(p.inParty).toBe(true);
    expect(world.x).toBe(42);
  });

  it('refuses to journey without a party', async () => {
    const world = new World(newWorld().resources, 3);
    const io = new FakeIO(world.resources);
    let played = false;
    io.keys = ['J', ' '];
    await expect(
      mainMenu(world, io, async () => {
        played = true;
      }),
    ).rejects.toThrow('no more keys');
    expect(played).toBe(false);
    expect(io.output).toContain('(Not formed)');
  });
});

describe('party screens', () => {
  it('offers a random name and refuses to create without spending all points', async () => {
    const world = new World(newWorld().resources, 3);
    const io = new FakeIO(world.resources);
    // Entry 6, use the suggested name, Female Human Fighter, then cancel at the points screen.
    io.keys = ['6', 'U', 'F', 'H', 'F'];
    io.inputs = [''];
    await createCharacter(world, io);
    expect(world.roster.get(5).exists).toBe(false);
  });

  it('re-forms the party after dispersing, and terminates only with confirmation', async () => {
    const world = newWorld(3); // the default party is formed
    const io = new FakeIO(world.resources);
    expect(world.party.formed).toBe(true);
    // Form: a party exists -> disperse and form a new one; choose entry 2 then entry 1, Done, then Classic.
    io.keys = ['Y', '2', '1', 'D', ' ', 'C'];
    await formParty(world, io);
    expect(world.party.size).toBe(2);
    expect(world.poisonKills).toBe(true);
    expect(world.party.memberSlot(0)).toBe(1);
    expect(world.party.memberSlot(1)).toBe(0);
    expect(world.roster.get(2).inParty).toBe(false);

    // Terminate entry 3 (free now): first decline, then confirm.
    io.keys = ['3', 'N'];
    await terminateCharacter(world, io);
    expect(world.roster.get(2).exists).toBe(true);
    io.keys = ['3', 'Y', ' '];
    await terminateCharacter(world, io);
    expect(world.roster.get(2).exists).toBe(false);
  });
});

describe('party keys', () => {
  it('says none left when the party has no key, without asking whose', async () => {
    const { world, io } = townWorld();
    world.putXYVal(MapValue.LetterI, 21, 20);
    world.party.keys = 0;
    io.keys = [];
    await unlockToward(world, io, 1, 0);
    expect(io.output).not.toContain('Whose key');
    expect(io.output).toContain('None left');
    expect(world.getXYVal(21, 20)).toBe(MapValue.LetterI);
  });
});

describe('the weapons and armour shops', () => {
  function shopWorld(counter: number, y: number): { world: World; io: FakeIO } {
    const { world, io } = townWorld();
    world.y = y;
    world.putXYVal(counter, 21, y);
    world.putXYVal(MapValue.Merchant, 22, y);
    world.party.gold = 20000;
    return { world, io };
  }

  it('an ordinary weapons shop sells the dagger through the 2-H sword and nothing dearer', async () => {
    const { world, io } = shopWorld(MapValue.LetterA, 19); // 19 & 7 = 3: weapons
    io.keys = ['1', 'N', 'B', 'H', 'I', ' ']; // I is not offered; space is Nothing
    await transactToward(world, io, 1, 0);
    expect(world.party.weapons(7)).toBe(1); // a 2-H sword, in the party bag
    expect(world.party.weapons(8)).toBe(0); // no +2 axe
    expect(io.output).toContain('maybe\nnext time');
  });

  it('an ordinary armour shop sells cloth through plate and nothing dearer', async () => {
    const { world, io } = shopWorld(MapValue.LetterA, 20); // 20 & 7 = 4: armour
    io.keys = ['1', 'N', 'B', 'E', 'F', ' '];
    await transactToward(world, io, 1, 0);
    expect(world.party.armour(4)).toBe(1); // plate
    expect(world.party.armour(5)).toBe(0); // no +2 chain
  });

  it('Dawn sells up to the +4 sword and +2 plate, never exotics', async () => {
    const { world, io } = shopWorld(MapValue.LetterA, 19);
    world.party.surfaceX = 37;
    io.keys = ['1', 'N', 'B', 'O', 'P', ' '];
    await transactToward(world, io, 1, 0);
    expect(world.party.weapons(14)).toBe(1); // +4 sword
    expect(world.party.weapons(15)).toBe(0); // exotic refused
    const armour = shopWorld(MapValue.LetterA, 20);
    armour.world.party.surfaceX = 37;
    armour.io.keys = ['1', 'N', 'B', 'G', 'H', ' '];
    await transactToward(armour.world, armour.io, 1, 0);
    expect(armour.world.party.armour(6)).toBe(1); // +2 plate
    expect(armour.world.party.armour(7)).toBe(0);
  });
});

describe('Lord British', () => {
  it('raises the member who is due, asking who as always', async () => {
    const { world, io } = townWorld();
    const m = world.monsters;
    m.setType(0, MapValue.LordBritish);
    m.setTileUnder(0, MapValue.Floor);
    m.setPosition(0, 21, 20);
    world.putXYVal(MapValue.LordBritish, 21, 20);
    const p = world.member(2); // the third member has earned a level: level index 1 with 100 max hit points
    p.bytes[30] = 1;
    io.keys = ['3']; // the prompt lists only the due member on a controller; a keyboard still types the number
    await transactToward(world, io, 1, 0);
    expect(io.output).toContain('Transact-3');
    expect(io.output.toUpperCase()).toContain('GREATER');
    expect(p.maxHitPoints).toBe(200);
    expect(p.hitPoints).toBe(200); // the raise comes with the hit points, not just the room
    expect(world.member(0).maxHitPoints).toBe(100);
  });
});

describe("a new game's first question", () => {
  it('sets Classic or Modern rules at the first Journey onward, and can be backed out of', async () => {
    const { chooseRules } = await import('../src/game/menu.ts');
    const { world, io } = townWorld();
    world.party.rulesPending = true;
    io.keys = ['C'];
    expect(await chooseRules(world, io)).toBe(true);
    expect(world.poisonKills).toBe(true);
    expect(world.starvation).toBe('classic');
    expect(world.balancedXp).toBe(false);
    expect(world.timer).toBe('fast');
    expect(world.party.rulesPending).toBe(false);
    world.party.rulesPending = true;
    io.keys = ['M'];
    await chooseRules(world, io);
    expect(world.poisonKills).toBe(false);
    expect(world.starvation).toBe('mild');
    expect(world.balancedXp).toBe(true);
    expect(world.timer).toBe('slow');
    io.keys = ['S']; // Story: Modern without starvation or a timer
    await chooseRules(world, io);
    expect(world.poisonKills).toBe(false);
    expect(world.starvation).toBe('none');
    expect(world.balancedXp).toBe(true);
    expect(world.timer).toBe('off');
    world.party.rulesPending = true;
    io.keys = [Key.Escape];
    expect(await chooseRules(world, io)).toBe(false);
    expect(world.party.rulesPending).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { World } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';
import { MapId, BASERES } from '../src/data/resources.ts';
import { loadArena } from '../src/game/combat.ts';
import { processMagic, spellCost, spellName } from '../src/game/spells.ts';
import { Key, type MenuOption } from '../src/game/io.ts';
import { foldedLabel } from '../src/ui/menus.ts';

/**
 * Every spell, in every place it may be cast, answered at each of its prompts and backed out of at each: what it asks,
 * what it costs, and what it does, held to the rules every spell keeps.
 */

type Mode = 'answer' | 'cancel';
type Context = 'surface' | 'town' | 'dungeon' | 'fight' | 'fight-dungeon' | 'fight-undead';
const CONTEXTS: Context[] = ['surface', 'town', 'dungeon', 'fight', 'fight-dungeon', 'fight-undead'];
const SPELLS = [...Array(35).keys()];
const FAL_DIVI = 9;

/** Answers every prompt (the first spell offered, member 2, north, the aim's foe, the number 4), or backs out of it. */
class ScriptIO extends FakeIO {
  asked: string[] = [];
  constructor(
    world: World,
    private readonly mode: Mode,
  ) {
    super(world.resources);
  }
  override async chooseMember(): Promise<number> {
    this.asked.push('who');
    return this.mode === 'answer' ? 2 : 0;
  }
  override async chooseDirection(): Promise<string | null> {
    this.asked.push('dir');
    return this.mode === 'answer' ? Key.Up : null;
  }
  override async aimSnap(): Promise<string> {
    this.asked.push('aim');
    return this.mode === 'answer' ? 'cast' : 'cancel';
  }
  override async chooseOption(options: MenuOption[]): Promise<string> {
    this.asked.push('option');
    return this.mode === 'answer' ? (options.find((o) => !o.disabled)?.key ?? '') : '';
  }
  override async inputText(): Promise<string> {
    this.asked.push('text');
    return this.mode === 'answer' ? '4' : '';
  }
  override async showMiniMap(): Promise<void> {
    this.asked.push('worldMap');
  }
  override async showMiniDungeon(): Promise<void> {
    this.asked.push('dungeonMap');
  }
}

function setUp(context: Context): World {
  const world = newWorld(42);
  for (let m = 0; m < 4; m++) world.member(m).mana = 99;
  world.member(1).hitPoints = 10;
  if (context === 'town') {
    world.enterMap(404); // Yew
    world.party.location = Location.Town;
    world.x = world.y = 20;
  }
  if (context === 'dungeon' || context === 'fight-dungeon') {
    world.enterDungeon(MapId.FirstDungeon);
    world.party.location = Location.Dungeon;
    world.x = world.y = 1;
    world.dungeon.level = 2;
  }
  if (context.startsWith('fight')) {
    const c = loadArena(world, BASERES + 4);
    c.tiles.fill(Shape.Grass);
    c.monsterShape = context === 'fight-undead' ? 0x32 : MapValue.Orc >> 1;
    for (const m of c.monsters) m.hp = 0;
    c.members.forEach((m, i) => Object.assign(m, { x: 3 + i, y: 8, hp: 1 }));
    Object.assign(c.monsters[0], { x: 3, y: 2, hp: 100, shape: c.monsterShape });
    Object.assign(c.monsters[1], { x: 7, y: 4, hp: 100, shape: c.monsterShape });
    world.combat = c;
    world.party.location = Location.Combat;
  }
  return world;
}

async function cast(context: Context, spell: number, mode: Mode) {
  const world = setUp(context);
  if (spell >= 32) world.party.bytes[15] = 1; // Terraform, Armageddon and Flotellum: Exodus destroyed
  const io = new ScriptIO(world, mode);
  const dungeon = world.dungeon.tiles.slice();
  await processMagic(world, io, 0, spell);
  return { world, io, paid: 99 - world.member(0).mana, dungeonChanged: world.dungeon.tiles.some((v, i) => v !== dungeon[i]) };
}

describe('every spell, everywhere', () => {
  for (const context of CONTEXTS)
    it(`in ${context}: costs its price when answered, nothing when backed out of at a prompt, and never fails to finish`, async () => {
      for (const spell of SPELLS) {
        const answered = await cast(context, spell, 'answer');
        const what = `${spellName(spell)} (${spell}) in ${context}`;
        // Fal Divi pays for itself and then for the cleric's spell it casts (the first the list offers).
        if (spell === FAL_DIVI) expect(answered.paid, what).toBeGreaterThanOrEqual(spellCost(spell));
        else expect(answered.paid, what).toBe(spellCost(spell));
        expect(answered.world.commandCancelled, what).toBe(false);

        const backed = await cast(context, spell, 'cancel');
        const prompted = backed.io.asked.some((a) => a !== 'worldMap' && a !== 'dungeonMap');
        // Backed out at any prompt of its own: the mana given back and the turn not spent.
        if (prompted) {
          expect(backed.paid, `${what}, backed out of`).toBe(0);
          expect(backed.world.commandCancelled, `${what}, backed out of`).toBe(true);
        }
      }
    });

  it('casts Terraform, Armageddon and Flotellum nowhere in a dungeon, whose cells they wrote surface tiles into', async () => {
    for (const spell of [32, 33, 34]) {
      const { io, dungeonChanged } = await cast('dungeon', spell, 'answer');
      expect(io.output, spellName(spell)).toContain('Failed');
      expect(dungeonChanged, spellName(spell)).toBe(false);
    }
  });

  it("shows the dungeon's map for Show the map in a fight in a dungeon, Sosaria's in a fight outside", async () => {
    expect((await cast('fight-dungeon', 27, 'answer')).io.asked).toEqual(['dungeonMap']);
    expect((await cast('fight', 27, 'answer')).io.asked).toEqual(['worldMap']);
    expect((await cast('dungeon', 27, 'answer')).io.asked).toEqual(['dungeonMap']);
  });

  it("gives back Fal Divi's mana with the cleric spell's when that spell is backed out of", async () => {
    const world = setUp('fight');
    const io = new ScriptIO(world, 'answer');
    // The cleric's Heal, its whom backed out of.
    io.chooseOption = async (options) => options.find((o) => o.key === 'C')!.key;
    io.chooseMember = async () => 0;
    await processMagic(world, io, 0, FAL_DIVI);
    expect(world.member(0).mana).toBe(99);
    expect(world.commandCancelled).toBe(true);
  });

  it('aims a bolt at the foe the snap rules choose, and sends it the way a direction says', async () => {
    const aimed = await cast('fight', 1, 'answer');
    expect(aimed.io.asked).toEqual(['aim']);
    expect(aimed.world.combat!.monsters[0].hp).toBeLessThan(100); // north of the caster, the nearer
    // No foe on a line from the caster: the direction is asked, as ever.
    const world = setUp('fight');
    world.combat!.monsters[0].x = 4;
    world.combat!.monsters[1].x = 9;
    world.setDiagonalMoves(false);
    const io = new ScriptIO(world, 'answer');
    await processMagic(world, io, 0, 1);
    expect(io.asked).toEqual(['dir']);
  });
});

describe('the message area folding a repeated line', () => {
  it('keeps the count within its sixteen columns', () => {
    expect(foldedLabel('Pass', 2, 16)).toBe('Pass (x2)');
    expect(foldedLabel(' Cast Spell!', 2, 16)).toBe(' Cast Spell! x2');
    expect(foldedLabel('Invalid move!', 12, 16)).toBe('Invalid move!x12');
    expect(foldedLabel('Exit to Sosaria!', 3, 16)).toBe('Exit to Sosar x3');
    expect(foldedLabel('Pass', 1, 16)).toBe('Pass');
  });
});

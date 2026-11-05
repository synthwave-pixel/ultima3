import { describe, it, expect } from 'vitest';
import { newWorld, FakeIO } from './helpers.ts';
import { shop } from '../src/game/shops.ts';
import { gearCard, hitChance } from '../src/game/cards.ts';
import { ownedItems } from '../src/game/actions.ts';
import { spellOption } from '../src/game/spells.ts';
import { CARD_ROWS, CARD_WIDTH, Key, type Card, type MenuOption } from '../src/game/io.ts';
import { World } from '../src/game/world.ts';

/** Member 0 as a named member of `career` (its letter) with weapon `weapon` readied and armour `armour` worn. */
function member(world: World, career: string, weapon: number, armour: number) {
  const p = world.member(0);
  p.name = 'Kaix';
  p.bytes[23] = career.charCodeAt(0);
  p.bytes[48] = weapon;
  p.bytes[40] = armour;
  return p;
}

/** A card's lines as text and tone, for comparing. */
const rows = (card: Card) => card.lines.map((l) => (l.tone ? `${l.text} [${l.tone}]` : l.text));

describe('weighing an armament for a member, on a card over the party panel', () => {
  it('gives the chance a blow lands for each armour, as combat rolls it', () => {
    // A roll of 0 to armour + 16, under 8: 8 chances in armour + 17.
    expect([0, 1, 2, 3, 4, 5, 6].map(hitChance)).toEqual([47, 44, 42, 40, 38, 36, 35]);
  });

  it('weighs a weapon by its damage a hit and its reach against the one readied', () => {
    const world = newWorld();
    world.party.gold = 100;
    const p = member(world, 'F', 1, 1); // a fighter with a dagger
    const mace = gearCard(world, p, true, 2, { price: 30 });
    expect(mace.title).toBe('Mace');
    expect(rows(mace)).toEqual(['Kaix [dim]', 'vs Dagger [dim]', '', 'Damage       +3 [better]', 'Reach     close', '', 'Price      30gp']);
    p.bytes[48] = 6; // a sword
    expect(rows(gearCard(world, p, true, 4, { price: 125 }))).toEqual([
      'Kaix [dim]',
      'vs Sword [dim]',
      '',
      'Damage       -6 [worse]',
      'Reach     close',
      '',
      'Price     125gp [worse]', // more than the party has
    ]);
    expect(rows(gearCard(world, p, true, 6, { price: 200 })).slice(0, 4)).toEqual([
      'Kaix [dim]',
      'In hand now [dim]',
      '',
      'Damage     same',
    ]);
    p.bytes[48] = 0;
    expect(rows(gearCard(world, p, true, 1, { price: 5 }))[1]).toBe('vs Hands [dim]');
  });

  it('marks reach gained green and reach lost red, the damage beside it as it is', () => {
    const world = newWorld();
    const p = member(world, 'F', 6, 1); // a sword
    expect(rows(gearCard(world, p, true, 3, { held: 1 })).slice(3, 5)).toEqual(['Damage       -9 [worse]', 'Reach      afar [better]']);
    p.bytes[48] = 5; // a bow
    expect(rows(gearCard(world, p, true, 6, { held: 1 })).slice(3, 5)).toEqual(['Damage       +3 [better]', 'Reach     close [worse]']);
  });

  it('weighs armour by how often foes would hit, against what is worn', () => {
    const world = newWorld();
    const p = member(world, 'F', 1, 1); // cloth
    const chain = gearCard(world, p, false, 3, { price: 0 });
    expect(chain.title).toBe('Chain');
    expect(rows(chain).slice(1, 5)).toEqual(['vs Cloth [dim]', '', 'Foes hit    40% [better]', 'Now         44% [dim]']);
    p.bytes[40] = 4; // plate
    expect(rows(gearCard(world, p, false, 2, { price: 0 }))[3]).toBe('Foes hit    42% [worse]');
    expect(rows(gearCard(world, p, false, 4, { price: 0 })).slice(1, 5)).toEqual(['Worn now [dim]', '', 'Foes hit    38%', '']);
  });

  it('says in red what a class cannot use, in place of the numbers', () => {
    const world = newWorld();
    const p = member(world, 'W', 1, 1);
    expect(rows(gearCard(world, p, true, 2, { held: 1 })).slice(3, 5)).toEqual(['A Wizard cannot [worse]', 'ready it [worse]']);
    p.bytes[23] = 'I'.charCodeAt(0);
    expect(rows(gearCard(world, p, false, 4, { held: 1 })).slice(3, 5)).toEqual(['An Illusionist [worse]', 'cannot wear it [worse]']);
  });

  it('fits every card on the panel, for the longest name, every class and everything readied or worn', () => {
    const world = newWorld();
    world.party.gold = 0;
    const careers = String.fromCharCode(...world.resources.misc.careerTable);
    const over: string[] = [];
    const check = (card: Card) => {
      if (card.lines.length > CARD_ROWS || card.title.length > CARD_WIDTH) over.push(card.title);
      for (const line of card.lines) if (line.text.length > CARD_WIDTH) over.push(line.text);
    };
    for (const career of careers) {
      const p = member(world, career, 0, 0);
      p.name = 'Abcdefghijklm'; // 13 letters, the most a name holds
      for (let held = 0; held < 16; held++)
        for (let ware = 0; ware < 16; ware++) {
          p.bytes[48] = held;
          check(gearCard(world, p, true, ware, { price: 1250 }));
          check(gearCard(world, p, true, ware, { held: 99 }));
        }
      for (let worn = 0; worn < 8; worn++)
        for (let ware = 0; ware < 8; ware++) {
          p.bytes[40] = worn;
          check(gearCard(world, p, false, ware, { price: 2500 }));
        }
    }
    expect(over).toEqual([]);
  });

  it('gives Ready and Wear the same cards, with the pack in place of a price', () => {
    const world = newWorld();
    const p = member(world, 'F', 1, 1);
    world.party.setWeapons(6, 2);
    const sword = ownedItems(world, p, true, 'P').find((o) => o.key === 'G')!;
    expect(sword.card!.title).toBe('Sword');
    expect(rows(sword.card!).slice(3)).toEqual(['Damage      +15 [better]', 'Reach     close', '', 'In pack       2 [dim]']);
    expect(rows(ownedItems(world, p, true, 'P')[0].card!)).not.toContain('In pack       0 [dim]'); // hands are no stock
  });

  it("puts a spell's book name, its cost against the caster's mana and what it does on its card", () => {
    const world = newWorld();
    const p = world.member(0);
    p.mana = 10;
    const fireball = spellOption(world, 5, 'F', 0);
    expect(fireball.card!.title).toBe('Fireball');
    expect(rows(fireball.card!)).toEqual([
      'FULGAR [dim]',
      '',
      'Cost         25',
      'Mana         10 [worse]',
      '',
      'A strong bolt',
      'at one foe.',
    ]);
    expect(fireball.disabled).toBe(true);
    for (let spell = 0; spell < 35; spell++) {
      const card = spellOption(world, spell, 'A', 0).card!;
      expect(card.lines.length, card.title).toBeLessThanOrEqual(CARD_ROWS);
      for (const line of card.lines) expect(line.text.length, line.text).toBeLessThanOrEqual(CARD_WIDTH);
      expect(card.title.length).toBeLessThanOrEqual(CARD_WIDTH);
    }
  });

  it('weighs the Buy list afresh after a ware is readied on the spot, and leaves the Sell list unweighed', async () => {
    const world = newWorld();
    member(world, 'F', 1, 1); // a dagger
    world.party.gold = 500;
    world.party.surfaceX = 0;
    const menus: MenuOption[][] = [];
    const io = new FakeIO(world.resources);
    const choose = io.chooseOption.bind(io);
    io.chooseOption = (options, echo) => {
      menus.push(options);
      return choose(options, echo);
    };
    io.keys = ['N', 'B', 'C', 'Y', Key.Escape]; // buy a mace, ready it, and leave
    await shop(world, io, 3, 0);
    const buys = menus.filter((m) => m.some((o) => o.key === 'C' && o.label.includes('Mace')));
    expect(buys).toHaveLength(2);
    const after = buys[1];
    expect(rows(after.find((o) => o.key === 'C')!.card!)[1]).toBe('In hand now [dim]');
    expect(rows(after.find((o) => o.key === 'B')!.card!).slice(1, 4)).toEqual(['vs Mace [dim]', '', 'Damage       -3 [worse]']);
    // Selling the dagger it put back in the bag: no weighing for buying on the Sell list.
    menus.length = 0;
    io.keys = ['N', 'S', Key.Escape];
    await shop(world, io, 3, 0);
    const sell = menus.find((m) => m.some((o) => o.key === 'B' && o.label.includes('Dagger')))!;
    expect(sell.map((o) => o.card ?? null)).toEqual(sell.map(() => null));
  });

  it("gives each ware in the shop's Buy list its card", async () => {
    const world = newWorld();
    member(world, 'F', 1, 1);
    world.party.gold = 500;
    world.party.surfaceX = 0; // a basic shop
    const menus: MenuOption[][] = [];
    const io = new FakeIO(world.resources);
    const choose = io.chooseOption.bind(io);
    io.chooseOption = (options, echo) => {
      menus.push(options);
      return choose(options, echo);
    };
    io.keys = ['N', 'B', Key.Escape]; // no list, Buy, and leave
    await shop(world, io, 3, 0);
    const buy = menus.find((m) => m.some((o) => o.key === 'C' && o.label.includes('Mace')))!;
    const mace = buy.find((o) => o.key === 'C')!;
    expect(rows(mace.card!)).toContain('Damage       +3 [better]');
    expect(rows(buy.find((o) => o.key === 'B')!.card!)[1]).toBe('In hand now [dim]');
  });

  // Issue #21: the price list lettered the Dagger A and the Buy menu B, so every letter read off the list bought the
  // ware before it. The original (`PrintWeaponList`, `PrintArmourList`) letters both from B, A being hands and skin.
  it.each([
    ['weapons', 3, 0],
    ['weapons at Dawn', 3, 37],
    ['armour', 4, 0],
    ['armour at Dawn', 4, 37],
  ])("letters the %s price list as the Buy menu takes each ware's key", async (_name, type, surfaceX) => {
    const world = newWorld();
    member(world, 'F', 1, 1);
    world.party.gold = 500;
    world.party.surfaceX = surfaceX;
    const menus: MenuOption[][] = [];
    const io = new FakeIO(world.resources);
    const choose = io.chooseOption.bind(io);
    io.chooseOption = (options, echo) => {
      menus.push(options);
      return choose(options, echo);
    };
    // The list, its pages turned (spare keys are passed over at Buy or sell?), then Buy, and leave.
    io.keys = ['Y', ...Array<string>(6).fill('Z'), 'B', Key.Escape];
    await shop(world, io, type, 0);
    const listed = [...io.output.matchAll(/^([A-Z]):(.+?) *(\d+)gp$/gm)].map(([, letter, name, price]) => ({ letter, name, price }));
    const buy = menus.find((m) => m.some((o) => o.label.endsWith('gp')))!;
    const wares = buy.filter((o) => o.label.endsWith('gp'));
    expect(listed.length).toBe(wares.length);
    expect(listed[0].letter).toBe('B');
    for (const { letter, name, price } of listed) {
      const ware = buy.find((o) => o.key === letter);
      expect(ware, `${letter}:${name}`).toBeDefined();
      const [, wareName, warePrice] = /^[A-Z] (.+) (\d+)gp$/.exec(ware!.label)!;
      expect(name.startsWith(wareName), `${letter}:${name} vs ${ware!.label}`).toBe(true); // the list adds a plural s
      expect(warePrice).toBe(price);
    }
  });

  it("fits the guild's wares and prices whole in a menu window", async () => {
    const world = newWorld();
    const menus: MenuOption[][] = [];
    const io = new FakeIO(world.resources);
    const choose = io.chooseOption.bind(io);
    io.chooseOption = (options, echo) => {
      menus.push(options);
      return choose(options, echo);
    };
    io.keys = ['N'];
    await shop(world, io, 5, 0);
    const guild = menus.find((m) => m.some((o) => o.key === 'T'))!;
    expect(guild.find((o) => o.key === 'T')!.label).toBe('Torches x5 (30 gp)');
    // A window over the game frame is at most 22 wide, its frame and margin taking 4.
    for (const o of guild) expect(o.label.length, o.label).toBeLessThanOrEqual(18);
  });
});

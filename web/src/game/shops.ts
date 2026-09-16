/**
 * shops.ts
 *
 * The eight kinds of shop, entered by Transacting with a merchant across a
 * counter. A port of `Shop()`, `Clerical()`, `GuildPay()`, `GuildGive()`,
 * `WeaponList()` and `ArmourList()` from UltimaMisc.c.
 *
 * Which shop a merchant runs is decided by the party's Y position & 7:
 *   0 pub, 1 grocer, 2 healer, 3 weapons, 4 armour, 5 guild, 6 oracle, 7 horses
 */

import { World } from './world.ts';
import { type GameIO, Sound, inputNumber, yesNo, letterOptions, type MenuOption } from './io.ts';
import { PlayerRecord } from './player.ts';
import { addGold } from './actions.ts';
import { FOOD_MAX } from './party.ts';

const Msg = {
  WelcomePub: 185,
  HaveADrink: 186,
  LeaveMyShop: 187,
  CantPay: 188,
  AnotherDrink: 189,
  Pleasure: 190,
  Grocer: 191,
  Rations: 192,
  CantPayGrocer: 193,
  AnythingElse: 194,
  ComeAgain: 195,
  Clerical: 196,
  ClericalMenu: 197,
  Curing: 198,
  CureWhom: 199,
  Healing: 200,
  HealWhom: 201,
  Resurrection: 202,
  ResurrectWhom: 203,
  Recalling: 204,
  RecallWhom: 205,
  WeaponsShop: 206,
  BuyOrSell: 207,
  YourInterest: 208,
  NoGold: 209,
  HereYouAre: 210,
  ForSale: 211,
  DontOwn: 212,
  /** " Ready" (shared with actions.ts). */
  Ready: 83,
  ThankYou: 213,
  TooMuchGold: 214,
  MaybeNextTime: 215,
  ArmourShop: 216,
  Guild: 217,
  YourNeed: 218,
  GuildThanks: 219,
  GuildAnythingElse: 220,
  Radrion: 221,
  Offering: 222,
  MoreOffering: 223,
  FareWell: 224,
  Emporium: 225,
  HorsesCost: 226,
  WillYouBuy: 227,
  TooBad: 228,
  NoGoldHorse: 229,
  RideFast: 230,
  NoFunds: 231,
  NoOfferings: 232,
  NotGoldEnough: 233,
  FareThee: 234,
  Available: 237,
  NotEnoughRoom: 260,
  GuildPrices: 261,
} as const;

function error(io: GameIO): void {
  io.sound(Sound.Error1);
}

function priceOf(world: World, index: number): number {
  return parseInt(world.resources.strings.WeaponsArmour[index], 10) || 0;
}

/** Mirrors `Shop()`. `shop` is the Y coordinate & 7; `member` is 0..3. */
export async function shop(world: World, io: GameIO, shopNumber: number, member: number): Promise<void> {
  const p = world.member(member);
  switch (shopNumber) {
    case 0:
      return pub(world, io);
    case 1:
      return grocer(world, io);
    case 2:
      return healer(world, io, p);
    case 3:
      return weaponsShop(world, io, p);
    case 4:
      return armourShop(world, io, p);
    case 5:
      return guild(world, io);
    case 6:
      return oracle(world, io);
    default:
      return horses(world, io);
  }
}

/** The pub: pay at least 7 gold for a drink and a rumour. More gold, better rumours. */
async function pub(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.WelcomePub);
  for (;;) {
    io.printMessage(Msg.HaveADrink);
    const paid = await inputNumber(io);
    io.print('\n\n');
    if (paid < 7) {
      io.printMessage(Msg.LeaveMyShop);
      return error(io);
    }
    if (world.party.gold < paid) {
      io.printMessage(Msg.CantPay);
      return error(io);
    }
    world.party.gold -= paid;
    io.print(world.resources.strings.Pub[Math.min(9, Math.floor(paid / 10))]);
    io.printMessage(Msg.AnotherDrink);
    if (!(await yesNo(io))) {
      io.print('N');
      io.printMessage(Msg.Pleasure);
      return;
    }
    io.print('Y');
  }
}

/** The grocer: rations at one gold each, into the party's food. Nobody needs to be named. */
export async function grocer(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Grocer);
  for (;;) {
    io.printMessage(Msg.Rations);
    const amount = await inputNumber(io, 5);
    if (amount === 0) return io.print('\n\n');
    if (amount > FOOD_MAX - world.party.food) {
      io.printMessage(Msg.NotEnoughRoom);
      io.print('\n\n');
      error(io);
      continue;
    }
    if (world.party.gold < amount) {
      io.printMessage(Msg.CantPayGrocer);
      return error(io);
    }
    world.party.gold -= amount;
    world.addFood(amount);
    io.updateStats();
    io.printMessage(Msg.AnythingElse);
    if (!(await yesNo(io))) {
      io.print('N\n\n');
      io.printMessage(Msg.ComeAgain);
      return;
    }
    io.print('Y\n\n');
  }
}

/** Mirrors `Clerical()`: confirm and pay. Returns true if paid. */
async function clericalPay(world: World, io: GameIO, p: PlayerRecord, cost: number): Promise<boolean> {
  if (!(await yesNo(io))) {
    io.print('N\n\n');
    io.printMessage(Msg.NoOfferings);
    return false;
  }
  if (cost > world.party.gold) {
    io.print('Y\n\n');
    io.printMessage(Msg.NotGoldEnough);
    error(io);
    return false;
  }
  world.party.gold -= cost;
  io.print('Y\n');
  void p;
  return true;
}

/** Mirrors `SpellNoize()`: the healer's flourish. */
async function spellNoise(io: GameIO, member: number): Promise<void> {
  await io.flashTiles();
  await io.flashMember(member);
  io.sound(Sound.Heal);
  io.printMessage(Msg.FareThee);
}

/** The healer: cure, heal, resurrect, recall. */
async function healer(world: World, io: GameIO, p: PlayerRecord): Promise<void> {
  io.printMessage(Msg.Clerical);
  io.printMessage(Msg.ClericalMenu);
  const choice = await io.chooseOption(
    [
      { key: '1', label: 'Curing (100 gp)' },
      { key: '2', label: 'Healing (200 gp)' },
      { key: '3', label: 'Resurrection (500 gp)' },
      { key: '4', label: 'Recalling (900 gp)' },
      { key: '0', label: 'Nothing' },
    ],
    'none',
  );
  if (!choice || choice === '0') return io.print('0\n');

  const services: Record<string, [number, number, number, (t: PlayerRecord) => void]> = {
    '1': [Msg.Curing, Msg.CureWhom, 100, (t) => void (t.status === 'P' && (t.status = 'G'))],
    '2': [Msg.Healing, Msg.HealWhom, 200, (t) => void (t.hitPoints = t.maxHitPoints)],
    '3': [Msg.Resurrection, Msg.ResurrectWhom, 500, (t) => void (t.status === 'D' && (t.status = 'G'))],
    '4': [Msg.Recalling, Msg.RecallWhom, 900, (t) => void (t.status === 'A' && (t.status = 'G'))],
  };
  const [askMsg, whomMsg, cost, apply] = services[choice];
  io.printMessage(askMsg);
  if (!(await clericalPay(world, io, p, cost))) return;
  io.printMessage(whomMsg);
  const n = await io.chooseMember();
  io.print('\n');
  if (n < 1 || n > 4) return io.sound(Sound.Bump);
  await spellNoise(io, n - 1);
  apply(world.member(n - 1));
  io.updateStats();
}

/** Grey for stock the member at the counter cannot use (still for sale, for someone else). */
const UNUSABLE = '#808080';

/** Print the weapons or armour price list a few lines at a time. (`WeaponList`, `ArmourList`) */
async function priceList(world: World, io: GameIO, isWeapon: boolean, last: number): Promise<void> {
  const names = world.resources.strings.WeaponsArmour;
  io.printMessage(Msg.Available);
  const nameBase = isWeapon ? 0 : 16;
  const priceBase = isWeapon ? 24 : 40;
  const pageBreaks = isWeapon ? [5, 7, 11, 14] : [4, 6];
  for (let i = 1; i < last; i++) {
    let name = names[nameBase + i];
    if (!name.endsWith('s') && name.length < 7) name += 's';
    const price = `${names[priceBase + i]}gp`;
    const label = `${String.fromCharCode(64 + i)}:${name}`;
    io.print(label + price.padStart(16 - label.length) + '\n');
    if (pageBreaks.includes(i)) await io.waitKey();
  }
  await io.waitKey();
}

/**
 * Buy or sell weapons or armour. (`Shop` cases 3 and 4)
 *
 * Gear belongs to the party (this port), so purchases go into the bag and
 * sales come out of it; the member at the counter matters for what their
 * class can use: those items are greyed in the list, the item they have
 * readied or worn is announced first, and after buying something better
 * suited the shop offers to ready or wear it on the spot.
 */
async function equipmentShop(world: World, io: GameIO, p: PlayerRecord, isWeapon: boolean): Promise<void> {
  const names = world.resources.strings.WeaponsArmour;
  const nameBase = isWeapon ? 0 : 16;
  const priceBase = isWeapon ? 24 : 40;
  const inUseBase = isWeapon ? 48 : 40;
  // Ordinary shops stop at the 2-H sword and plate; Dawn (surface X = 37) sells
  // up to the +4 weapons and +2 plate. Exotics are never for sale. (`opnum`)
  const fullStock = world.party.surfaceX === 37;
  const last = isWeapon ? (fullStock ? 15 : 8) : fullStock ? 7 : 5; // exclusive letter index

  // Menu of what the shop stocks (letters B..), with prices; what this member cannot use is greyed but still for sale.
  const stock: MenuOption[] = [];
  for (let i = 1; i < last; i++) {
    const letter = String.fromCharCode(65 + i);
    stock.push({
      key: letter,
      label: `${letter} ${names[nameBase + i]} ${names[priceBase + i]}gp`,
      colour: world.canUse(p, isWeapon, i) ? undefined : UNUSABLE,
    });
  }
  const owned = (): MenuOption[] => stock.filter((o) => world.party.gear(isWeapon, o.key.charCodeAt(0) - 65) > 0);
  const nothing: MenuOption = { key: ' ', label: 'Nothing' };

  io.printMessage(isWeapon ? Msg.WeaponsShop : Msg.ArmourShop);
  let key = await io.chooseOption(
    [
      { key: 'Y', label: 'Yes, list' },
      { key: 'N', label: 'No' },
    ],
    'none',
  );
  io.print(key || 'N');
  if (key === 'Y') await priceList(world, io, isWeapon, last);
  io.print(`\n${isWeapon ? 'Readied' : 'Worn'}: ${names[nameBase + p.bytes[inUseBase]]}`);
  io.printMessage(Msg.BuyOrSell);
  key = await io.chooseOption(
    [
      { key: 'B', label: 'Buy' },
      { key: 'S', label: 'Sell' },
    ],
    'none',
  );
  io.print(key || 'S');

  let mode = key;
  for (;;) {
    if (mode === 'B') {
      io.printMessage(Msg.YourInterest);
      const k = await io.chooseOption([...stock, nothing], 'none');
      const index = k.charCodeAt(0) - 'A'.charCodeAt(0);
      if (!k || k < 'B' || index >= last) break;
      io.print(k);
      const price = priceOf(world, priceBase + index);
      if (price > world.party.gold) {
        io.printMessage(Msg.NoGold);
        return;
      }
      if (world.party.gear(isWeapon, index) > 98) {
        io.printMessage(Msg.NotEnoughRoom);
        io.print('\n\n');
        error(io);
        continue;
      }
      world.party.gold -= price;
      world.addGear(isWeapon, index);
      io.printMessage(Msg.HereYouAre);
      // Something new this member can use: offer to put it to use now.
      if (index !== p.bytes[inUseBase] && world.canUse(p, isWeapon, index)) {
        io.print(`\n${isWeapon ? 'Ready' : 'Wear'} it? (Y/N)-`);
        const yes = await io.chooseOption(
          [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
          ],
          'none',
        );
        io.print(`${yes || 'N'}\n`);
        if (yes === 'Y') {
          world.equip(p, isWeapon, index);
          io.print(`${names[nameBase + index]}`);
          io.printMessage(Msg.Ready);
        }
      }
    } else {
      io.printMessage(Msg.ForSale);
      const k = await io.chooseOption([...owned(), nothing], 'none');
      const index = k.charCodeAt(0) - 'A'.charCodeAt(0);
      if (!k || k < 'B' || index >= last) break;
      io.print(k);
      if (world.party.gear(isWeapon, index) < 1) {
        io.printMessage(Msg.DontOwn); // only what is in the bag sells; an item in hand must be unreadied first
        return;
      }
      if (!addGold(world, priceOf(world, priceBase + index), false)) {
        io.printMessage(Msg.TooMuchGold);
        return error(io);
      }
      world.party.setGear(isWeapon, index, world.party.gear(isWeapon, index) - 1);
      io.printMessage(Msg.ThankYou);
      mode = 'S';
    }
  }
  io.printMessage(Msg.MaybeNextTime);
}

async function weaponsShop(world: World, io: GameIO, p: PlayerRecord): Promise<void> {
  return equipmentShop(world, io, p, true);
}

async function armourShop(world: World, io: GameIO, p: PlayerRecord): Promise<void> {
  return equipmentShop(world, io, p, false);
}

/** The guild: keys, torches (five at a time), powders and gems, into the party's supply (this port). */
async function guild(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Guild);
  for (;;) {
    io.printMessage(Msg.GuildPrices);
    io.printMessage(Msg.YourNeed);
    const key = await io.chooseOption(
      [
        { key: 'K', label: 'Keys (50 gp)' },
        { key: 'T', label: 'Torches, five (30 gp)' },
        { key: 'P', label: 'Powders (90 gp)' },
        { key: 'G', label: 'Gems (75 gp)' },
        { key: 'N', label: 'Nothing' },
      ],
      'none',
    );
    const item = { T: [30, 'torches', 5], K: [50, 'keys', 1], P: [90, 'powders', 1], G: [75, 'gems', 1] }[key] as
      | [number, 'torches' | 'keys' | 'powders' | 'gems', number]
      | undefined;
    if (!item) {
      io.print('N\n\n');
      io.printMessage(Msg.GuildThanks);
      return;
    }
    const [cost, what, quantity] = item;
    io.print(`${key}\n`);
    if (world.party[what] + quantity > 99) {
      io.printMessage(Msg.NotEnoughRoom);
      error(io);
      continue;
    }
    if (world.party.gold < cost) {
      io.printMessage(Msg.NoFunds);
      return;
    }
    world.party.gold -= cost;
    world.party[what] += quantity;
    io.printMessage(Msg.GuildAnythingElse);
    if (!(await yesNo(io))) {
      io.print('N\n\n');
      io.printMessage(Msg.GuildThanks);
      return;
    }
  }
}

/** Radrion the prophet: offerings of hundreds of gold buy verses of his rhyme. */
async function oracle(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Radrion);
  for (;;) {
    io.printMessage(Msg.Offering);
    const key = await io.chooseOption(
      letterOptions('0123456789', (d) => (d === '0' ? '0 (nothing)' : `${d} = ${d}00 gold`)),
      'none',
    );
    const digit = key ? key.charCodeAt(0) - '0'.charCodeAt(0) : 0;
    io.print(`${digit}\n\n`);
    const cost = digit * 100;
    if (cost > world.party.gold) {
      io.printMessage(Msg.CantPay);
      return error(io);
    }
    world.party.gold -= cost;
    io.print(world.resources.strings.Radrion[digit]);
    io.printMessage(Msg.MoreOffering);
    if (!(await yesNo(io))) {
      io.print('N\n');
      io.printMessage(Msg.FareWell);
      return;
    }
    io.print('Y\n');
  }
}

/** The equine emporium: a horse for 200 gold per member. */
async function horses(world: World, io: GameIO): Promise<void> {
  const cost = world.party.size * 200;
  io.printMessage(Msg.Emporium);
  io.print(String(world.party.size));
  io.printMessage(Msg.HorsesCost);
  io.print(String(cost));
  io.printMessage(Msg.WillYouBuy);
  if (!(await yesNo(io))) {
    io.print('N\n\n');
    io.printMessage(Msg.TooBad);
    return;
  }
  if (world.party.gold < cost) {
    io.print('Y\n\n');
    io.printMessage(Msg.NoGoldHorse);
    return error(io);
  }
  world.party.gold -= cost;
  io.print('Y\n\n');
  io.printMessage(Msg.RideFast);
  world.party.shape = 0x14;
  io.redrawMap();
}

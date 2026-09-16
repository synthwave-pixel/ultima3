/**
 * actions.ts
 *
 * Commands that act on the party's own records rather than the world:
 * chests, handing equipment, joining gold, marching order, negate time,
 * peering at gems, readying weapons, wearing armour, torches, stats.
 * Ports of the matching routines in UltimaMain.c, plus `AddExp()`,
 * `AddGold()`, `AddItem()` and `StealDisarmFail()` from UltimaMisc.c.
 */

import { World, DungeonCell } from './world.ts';
import { Location, GOLD_MAX } from './party.ts';
import { MapValue } from './tiles.ts';
import { type GameIO, Key, Sound, deathSound, type MenuOption } from './io.ts';
import { PlayerRecord } from './player.ts';

const Msg = {
  GetChest: 40,
  NoSuchPlayer: 41,
  AcidTrap: 42,
  PoisonTrap: 43,
  BombTrap: 44,
  GasTrap: 45,
  TrapEvaded: 46,
  Gold: 47,
  Overflowing: 48,
  AndA: 49,
  And: 50,
  HandFrom: 51,
  HandTo: 52,
  HandWhat: 53,
  Amount: 54,
  NotEnough: 55,
  TooMuch: 56,
  Done: 57,
  HandEquipmentWhat: 58,
  None: 59,
  HowMany: 60,
  WhichWeapon: 61,
  WhichArmour: 62,
  InUse: 63,
  IgniteTorch: 64,
  JoinGoldTo: 66,
  NoneLeft: 67,
  ModifyOrder: 70,
  Aborted: 71,
  Plr: 72,
  Exchanged: 73,
  ReadyFor: 79,
  Weapon: 80,
  NotOwned: 81,
  NotAllowed: 82,
  Ready: 83,
  Volume: 97,
  VolumeOn: 98,
  VolumeOff: 99,
  WearFor: 100,
  Armour: 101,
  Ztats: 105,
  NotHere: 108,
  Incapacitated: 126,
} as const;

/** "Incapacitated!" - the chosen member is dead or otherwise unable. (`Incap`) */
export function incapacitated(io: GameIO): void {
  io.printMessage(Msg.Incapacitated);
  io.sound(Sound.Error1);
}

function notHere(io: GameIO): void {
  io.printMessage(Msg.NotHere);
  io.sound(Sound.Error1);
}

// ---------------------------------------------------------------------------
// Bookkeeping helpers
// ---------------------------------------------------------------------------

/** Mirrors `AddExp()`: experience is capped at 9899 and levels up every 100. */
export function addExperience(world: World, io: GameIO, member: number, amount: number): void {
  const p = world.member(member);
  let exp = p.bytes[30] * 100 + p.bytes[31];
  const oldLevel = Math.floor(exp / 100);
  exp = Math.min(9899, exp + amount);
  if (Math.floor(exp / 100) > oldLevel) io.sound(Sound.ExpLevelUp);
  p.bytes[30] = Math.floor(exp / 100);
  p.bytes[31] = exp % 100;
  io.updateStats();
}

/**
 * Mirrors `AddGold()`, on the party's pool. Returns false if the cap cut
 * the amount short; with `overflow` the surplus is simply lost, without it
 * nothing is added at all.
 */
export function addGold(world: World, gold: number, overflow: boolean): boolean {
  if (!overflow && world.party.gold + gold > GOLD_MAX) return false;
  return world.addGold(gold);
}

/** Mirrors `AddItem()`: item counts are capped at 99. */
export function addItem(p: PlayerRecord, offset: number, amount: number): void {
  p.bytes[offset] = Math.min(99, p.bytes[offset] + amount);
}

/**
 * Mirrors `StealDisarmFail()`: true if the attempt fails. Dexterity is the
 * base; thieves get a big bonus, barbarians, illusionists, rangers and
 * alchemists a smaller one.
 */
export function stealDisarmFails(world: World, p: PlayerRecord): boolean {
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const classIndex = careers.indexOf(p.classLetter);
  let factor = p.dexterity;
  if (classIndex === 3) factor += 0x80;
  if (classIndex === 5 || classIndex === 7 || classIndex === 10 || classIndex === 9) factor += 0x40;
  return world.rng.range(0, 255) > factor;
}

/** Mirrors `BombTrap()`: every living member takes damage. */
export async function bombTrap(world: World, io: GameIO): Promise<void> {
  for (let m = 0; m < world.party.size; m++) {
    if (!world.memberAlive(m)) continue;
    const p = world.member(m);
    await io.flashMember(m);
    io.sound(Sound.Hit);
    let died = p.subtractHitPoints(world.rng.range(0, 255) & 0x77);
    died = p.subtractHitPoints((world.dungeon.level + 1) * 8) || died;
    if (died) io.sound(deathSound(p.sex));
  }
  io.updateStats();
}

// ---------------------------------------------------------------------------
// G: Get chest
// ---------------------------------------------------------------------------

/** Whether the party stands on a chest: a chest tile on the surface or in a town, a chest cell in a dungeon. */
export function chestHere(world: World): boolean {
  if (world.party.location === Location.Dungeon) {
    const cell = world.getXYDng(world.x, world.y);
    return cell < DungeonCell.Wall && (cell & DungeonCell.Chest) !== 0;
  }
  if (world.party.location === Location.Combat) return false;
  const tile = world.getXYVal(world.x, world.y);
  return tile >= MapValue.Chest && tile <= MapValue.Chest + 3;
}

/**
 * Mirrors `GetChest()`. `how` is "command" (ask who opens it and check for
 * traps), "spell" (Appar Unem: member chosen, traps disarmed) or "steal"
 * (Steal: skip straight to the loot).
 */
export async function getChest(world: World, io: GameIO, member: number, how: 'command' | 'spell' | 'steal'): Promise<void> {
  if (how === 'command') {
    world.chestTrapsArmed = true;
    io.printMessage(Msg.GetChest);
    const n = await io.chooseMember();
    if (n < 1 || n > 4) {
      io.printMessage(Msg.NoSuchPlayer);
      io.sound(Sound.Error1);
      return;
    }
    member = n - 1;
    if (!world.memberAlive(member)) return incapacitated(io);
  }
  const p = world.member(member);

  if (how !== 'steal') {
    if (world.party.location !== Location.Dungeon) {
      const tile = world.getXYVal(world.x, world.y);
      if (tile < MapValue.Chest || tile > MapValue.Chest + 3) return notHere(io);
      // The chest's low bits say what it sat on.
      let under = (tile & 0x3) * 4;
      if (under === 0) under = MapValue.Floor;
      world.putXYVal(under, world.x, world.y);
    } else {
      if (world.getXYDng(world.x, world.y) !== 0x40) return notHere(io);
      world.putXYDng(0, world.x, world.y);
    }

    if (world.chestTrapsArmed && world.rng.range(0, 255) <= 127) {
      const trap = world.rng.range(0, 255) & world.rng.range(0, 255) & 0x03;
      const evaded = () => {
        io.printMessage(Msg.TrapEvaded);
        io.sound(Sound.Ouch);
      };
      switch (trap) {
        case 0:
          io.printMessage(Msg.AcidTrap);
          if (!stealDisarmFails(world, p)) evaded();
          else {
            await io.flashMember(member);
            io.sound(Sound.Hit);
            if (p.subtractHitPoints(world.rng.range(0, 255) & 0x37)) io.sound(deathSound(p.sex));
          }
          break;
        case 1:
          io.printMessage(Msg.PoisonTrap);
          if (!stealDisarmFails(world, p)) evaded();
          else {
            await io.flashMember(member);
            io.sound(Sound.Hit);
            p.status = 'P';
          }
          break;
        case 2:
          io.printMessage(Msg.BombTrap);
          if (!stealDisarmFails(world, p)) evaded();
          else {
            await bombTrap(world, io);
            return;
          }
          break;
        default:
          io.printMessage(Msg.GasTrap);
          if (!stealDisarmFails(world, p)) evaded();
          else {
            for (let m = 0; m < 4; m++) {
              if (!world.memberAlive(m)) continue;
              await io.flashMember(m);
              io.sound(Sound.Hit);
              world.member(m).status = 'P';
            }
          }
          break;
      }
    }
  }

  // The loot.
  io.sound(Sound.Creak);
  let gold = world.rng.range(0, 100);
  if (gold < 30) gold += 30;
  io.printMessage(Msg.Gold);
  io.print(`${gold}\n`);
  if (!addGold(world, gold, true)) {
    io.printMessage(Msg.Overflowing);
    io.sound(Sound.Error1);
  }
  io.updateStats();
  if (world.rng.range(0, 255) > 63) return;

  const names = world.resources.strings.WeaponsArmour;
  let weapon = world.rng.range(0, 255);
  if (weapon < 128) {
    weapon = world.rng.range(0, 255) & weapon & 0x07;
    if (weapon !== 0) {
      io.printMessage(Msg.AndA);
      io.print(`${names[weapon]}\n`);
      world.addGear(true, weapon);
      return;
    }
  }
  let armour = world.rng.range(0, 255);
  if (armour < 128) {
    armour = world.rng.range(0, 255) & armour & 0x03;
    if (armour !== 0) {
      io.printMessage(Msg.AndA);
      io.print(`${names[armour + 16]}\n`);
      world.addGear(false, armour);
    }
  }
}

// ---------------------------------------------------------------------------
// I: Ignite torch, M: Modify order, N: Negate time, P: Peer (Join gold is gone: gold is pooled)
// ---------------------------------------------------------------------------

/** Mirrors `Ignite()`. */
export async function igniteTorch(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.IgniteTorch);
  if (world.party.location !== Location.Dungeon) return notHere(io);
  // Torches are the party's (this port): no "whose torch" prompt.
  if (world.party.torches < 1) return io.printMessage(Msg.NoneLeft);
  world.party.torches--;
  io.sound(Sound.TorchIgnite);
  world.dungeon.torch = 255;
}

/** Mirrors `ModifyOrder()`: swap two members' positions. */
export async function modifyOrder(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.ModifyOrder);
  const a = await io.chooseMember();
  if (a < 1 || a > 4) return io.printMessage(Msg.Aborted);
  io.printMessage(Msg.Plr);
  const b = await io.chooseMember();
  if (b < 1 || b > 4 || a === b) return io.printMessage(Msg.Aborted);
  const ra = world.party.memberRosterNumber(a - 1);
  world.party.setMemberRosterNumber(a - 1, world.party.memberRosterNumber(b - 1));
  world.party.setMemberRosterNumber(b - 1, ra);
  io.updateStats(true);
  io.printMessage(Msg.Exchanged);
}

/** Mirrors `NegateTime()`: a powder from the party's supply stops time for ten turns. */
export async function negateTime(world: World, io: GameIO): Promise<void> {
  io.print('Negate time!\n'); // the original's message went on to ask whose powder
  if (world.party.powders < 1) return io.printMessage(Msg.NoneLeft);
  world.party.powders--;
  world.timeNegate = 10;
}

/** Mirrors `PeerGem()`, with a gem from the party's supply. */
export async function peerGem(world: World, io: GameIO): Promise<void> {
  io.print('Peer at gem!\n'); // the original's message went on to ask whose gem
  if (world.party.gems < 1) return io.printMessage(Msg.NoneLeft);
  world.party.gems--;
  if (world.party.location === Location.Dungeon) await io.showMiniDungeon();
  else await io.showMiniMap();
}

// ---------------------------------------------------------------------------
// R: Ready weapon, W: Wear armour, V: Volume
// ---------------------------------------------------------------------------

/**
 * Menu options for the weapons (letters A..P) or armour (A..H) a member may
 * ready or wear: the letter, the name and how many the party's bag holds,
 * with the item now in use marked. Hands/skin (A) are always there. Kinds
 * the bag lacks are hidden (a keyboard may still type them and get "Not
 * owned!", as in the original); kinds the member's class may not use are
 * greyed.
 */
export function ownedItems(world: World, p: PlayerRecord, isWeapon: boolean, last: string): MenuOption[] {
  const names = world.resources.strings.WeaponsArmour;
  const base = isWeapon ? 48 : 40;
  const nameBase = isWeapon ? 0 : 16;
  const letters = isWeapon ? 'ABCDEFGHIJKLMNOP' : 'ABCDEFGH';
  const options: MenuOption[] = [];
  for (const letter of letters) {
    if (letter > last) break;
    const index = letter.charCodeAt(0) - 65;
    const count = world.party.gear(isWeapon, index);
    const inUse = p.bytes[base] === index;
    const tail = index === 0 ? '' : inUse ? ` (${isWeapon ? 'in hand' : 'worn'}${count ? `, +${count}` : ''})` : ` x${count}`;
    options.push({
      key: letter,
      label: `${letter} ${names[nameBase + index]}${tail}`,
      hidden: index > 0 && count < 1 && !inUse,
      disabled: !world.canUse(p, isWeapon, index),
    });
  }
  return options;
}

/**
 * Mirrors `ReadyWeapon()`. Each class may only use weapons up to a letter
 * in the weapon-use table; exotic weapons (P) are allowed to everyone.
 */
export async function readyWeapon(world: World, io: GameIO, member?: number): Promise<void> {
  const error = (msg: number) => {
    io.printMessage(msg);
    io.sound(Sound.Error1);
  };
  if (member === undefined) {
    io.printMessage(Msg.ReadyFor);
    const n = await io.chooseMember();
    if (n < 1 || n > 4) return error(Msg.NoSuchPlayer);
    member = n - 1;
  }
  const p = world.member(member);
  io.printMessage(Msg.Weapon);
  const key = await io.chooseOption(ownedItems(world, p, true, 'P'), 'key');
  if (!key || key < 'A' || key > 'P') return error(Msg.NotOwned);
  const index = key.charCodeAt(0) - 'A'.charCodeAt(0);
  if (!world.canUse(p, true, index)) return error(Msg.NotAllowed);
  if (!world.equip(p, true, index)) return error(Msg.NotOwned);
  io.print('\n');
  io.print(world.resources.strings.WeaponsArmour[index]);
  io.printMessage(Msg.Ready);
}

/** Mirrors `WearArmour()`. Exotic armour (H) is allowed to everyone. */
export async function wearArmour(world: World, io: GameIO): Promise<void> {
  const error = (msg: number) => {
    io.printMessage(msg);
    io.sound(Sound.Error1);
  };
  io.printMessage(Msg.WearFor);
  const n = await io.chooseMember();
  if (n < 1 || n > 4) return error(Msg.NoSuchPlayer);
  const p = world.member(n - 1);
  io.printMessage(Msg.Armour);
  const key = await io.chooseOption(ownedItems(world, p, false, 'H'), 'key');
  if (!key || key < 'A' || key > 'H') return error(Msg.NotOwned);
  const index = key.charCodeAt(0) - 'A'.charCodeAt(0);
  if (!world.canUse(p, false, index)) return error(Msg.NotAllowed);
  if (!world.equip(p, false, index)) return error(Msg.NotOwned);
  io.print('\n');
  io.print(world.resources.strings.WeaponsArmour[index + 16]);
  io.printMessage(Msg.Ready);
}

/** Mirrors `Volume()`: toggle sound effects. */
export function volume(world: World, io: GameIO): void {
  io.printMessage(Msg.Volume);
  world.soundEnabled = !world.soundEnabled;
  io.printMessage(world.soundEnabled ? Msg.VolumeOn : Msg.VolumeOff);
}

// ---------------------------------------------------------------------------
// Z: Ztats
// ---------------------------------------------------------------------------

/**
 * Mirrors the classic `Stats()`: print a member's record a few lines at a
 * time, waiting for a key between sections. Escape stops early.
 */
export async function stats(world: World, io: GameIO, member?: number): Promise<void> {
  if (member === undefined) {
    io.printMessage(Msg.Ztats);
    const n = await io.chooseMember();
    if (n < 1 || n > 4) return io.print('\n');
    member = n - 1;
  }
  const p = world.member(member);
  const pad = (v: number, w: number) => String(v).padStart(w, '0');
  const wait = async (): Promise<boolean> => {
    const key = await io.waitKey();
    if (key === Key.Escape || key === Key.B || world.done) {
      io.print('\n');
      return true;
    }
    return false;
  };
  const names = world.resources.strings.WeaponsArmour;

  io.print(p.name);
  // Race and class (this port shows neither in the character boxes).
  const races = world.resources.strings.Races;
  const race = races.find((r) => r[0] === p.race) ?? '';
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const career = world.resources.strings.Classes[Math.max(0, careers.indexOf(p.classLetter))] ?? '';
  const who = `${race} ${career}`;
  io.print(who.length <= 16 ? `\n${who}` : `\n${race}\n${career}`);
  io.print(`\nSTR...${pad(p.strength, 2)}\nDEX...${pad(p.dexterity, 2)}\nINT...${pad(p.intelligence, 2)}\nWIS...${pad(p.wisdom, 2)}`);
  if (await wait()) return;
  const lines = [
    `\nH.P...${pad(p.hitPoints, 4)}`,
    `\nH.M...${pad(p.maxHitPoints, 4)}`,
    `\nEXP...${pad(p.bytes[30] * 100 + p.bytes[31], 4)}`,
    // The party's supplies (this port pools them): the same on every page.
    `\nGEMS..${pad(world.party.gems, 2)}`,
    `\nKEYS..${pad(world.party.keys, 2)}`,
    `\nPOWD..${pad(world.party.powders, 2)}`,
    `\nTRCH..${pad(world.party.torches, 2)}`,
  ];
  for (const line of lines) {
    io.print(line);
    if (await wait()) return;
  }
  const marks = p.marks;
  const cards: [number, string][] = [
    [0x08, 'CARD OF DEATH'],
    [0x02, 'CARD OF SOL'],
    [0x01, 'CARD OF LOVE'],
    [0x04, 'CARD OF MOONS'],
    [0x10, 'MARK OF FORCE'],
    [0x20, 'MARK OF FIRE'],
    [0x40, 'MARK OF SNAKE'],
    [0x80, 'MARK OF KINGS'],
  ];
  for (const [bit, label] of cards) {
    if (!(marks & bit)) continue;
    io.print(`\n${label}`);
    if (await wait()) return;
  }
  io.print(`\nWEAPON:${names[p.bytes[48]]}`);
  if (await wait()) return;
  io.print(`\nARMOUR:${names[p.bytes[40] + 16]}`);
  if (await wait()) return;
  // The party's bag (this port pools gear): the same list on every member's page.
  io.print('\n*PARTY WEAPONS*\n');
  for (let x = 15; x >= 0; x--) {
    if (x === 0) {
      io.print('02-Hands-(A)\n*PARTY ARMOUR*\n');
      continue;
    }
    if (!world.party.weapons(x)) continue;
    io.print(`${pad(world.party.weapons(x), 2)}-${names[x]}-(${String.fromCharCode(65 + x)})`);
    if (await wait()) return;
    io.print('\n');
  }
  for (let x = 7; x >= 0; x--) {
    if (x === 0) {
      io.print('01-Skin-(A)\n');
      continue;
    }
    if (!world.party.armour(x)) continue;
    io.print(`${pad(world.party.armour(x), 2)}-${names[x + 16]}-(${String.fromCharCode(65 + x)})`);
    if (await wait()) return;
    io.print('\n');
  }
}

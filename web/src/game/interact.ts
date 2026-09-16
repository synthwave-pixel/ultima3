/**
 * interact.ts
 *
 * Commands that involve other creatures and objects on the map: talking,
 * shopping, attacking, firing a ship's cannons, stealing, unlocking doors,
 * yelling, and the "Other command" catch-all. Ports of `Transact()`,
 * `Attack()`, `Fire()`, `Steal()`, `Unlock()`, `Yell()` from UltimaMain.c,
 * `Speak()` from UltimaText.c and `OtherCommand()`, `Shrine()`,
 * `SafeExodus()` from UltimaMisc.c.
 */

import { levelUpDue } from './player.ts';
import { World } from './world.ts';
import type { PlayerRecord } from './player.ts';
import { Location } from './party.ts';
import { MapValue, Shape } from './tiles.ts';
import { type GameIO, Sound, Music, deathSound, letterOptions } from './io.ts';
import { getDirection, notHere, what2, counterWithMerchant, Msg as CmdMsg, PartyShape } from './commands.ts';
import { getChest, incapacitated, stealDisarmFails } from './actions.ts';
import { shop } from './shops.ts';
import { attackMonster, monsterName } from './combat.ts';
import { showBall } from './combat.ts';

const Msg = {
  Attack: 28,
  Fire: 38,
  FireDirect: 39,
  Steal: 84,
  Direction: 85,
  Failed: 86,
  WatchOut: 87,
  WhoTransacts: 88,
  GoodDay: 89,
  WelcomeMyChild: 90,
  ExperienceMore: 91,
  NoMore: 92,
  SeekMarkOfKings: 93,
  ThouArtGreater: 94,
  Unlock: 95,
  NoSuchPlayer: 41,
  NoneLeft: 67,
  Destroyed: 117,
  Yell: 104,
  ShrineWelcome: 235,
  ShrineOffering: 178,
  ThenBeOff: 179,
  CantCheat: 180,
  Shazam: 181,
  OtherCommand: 236,
  Cmd: 238,
  Dir: 239,
  Cards: 240,
  Congratulations: 241,
  Moves: 242,
  Exotics: 243,
  StrangeCard: 244,
  NotEnoughGold: 245,
  YellEvocare: 246,
  EveryoneHates: 247,
  NoEffect: 248,
  AllIsCalm: 254,
  ExodusNoMore: 262,
  SosariaThanks: 263,
  EnterShrine: 37,
  ShrineOf: 259,
} as const;

// ---------------------------------------------------------------------------
// Talking
// ---------------------------------------------------------------------------

import { speech } from './talk.ts';
import { hearTownLine, hearClue, journalCheck } from './journal.ts';
export { speech };

/**
 * Talk to whoever or whatever is in a chosen direction: NPCs, Lord British,
 * or a shop counter. (`Transact`) The direction comes first here, so that
 * "who" is only asked when it matters: Lord British and the shops that hand
 * something to a member. Townspeople and the grocer (food is pooled) need
 * no name.
 */
export async function transact(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Direction);
  const dir = await getDirection(world, io);
  if (!dir) return;
  await transactToward(world, io, dir.dx, dir.dy);
}

/**
 * Who stands before Lord British: he only raises levels, so the prompt
 * lists just the members who are due (the blue names). With nobody due
 * the ordinary prompt runs, so a member can still hear "seek ye the Mark
 * of Kings" or "no more". The prompt is always asked, even for a single
 * member: an audience with the king is a moment, not a formality.
 */
export async function whoSeesLordBritish(world: World, io: GameIO): Promise<number> {
  const due = [0, 1, 2, 3].filter((m) => world.memberAlive(m) && levelUpDue(world.member(m)));
  io.printMessage(Msg.WhoTransacts);
  const n = await io.chooseMember(due.length ? due : undefined);
  if (n < 1 || n > 4) return -1;
  if (!world.memberAlive(n - 1)) {
    incapacitated(io);
    return -1;
  }
  return n - 1;
}

/** The "Who will Transact-" prompt: a living member's index, or -1. */
export async function whoTransacts(world: World, io: GameIO): Promise<number> {
  io.printMessage(Msg.WhoTransacts);
  const n = await io.chooseMember();
  if (n < 1 || n > 4) return -1;
  const member = n - 1;
  if (!world.memberAlive(member)) {
    incapacitated(io);
    return -1;
  }
  return member;
}

/** Transact with whatever is one step (dx, dy) from the party, asking who only when it matters. */
export async function transactToward(world: World, io: GameIO, dx: number, dy: number): Promise<void> {
  const xs = world.constrain(world.x + dx);
  const ys = world.constrain(world.y + dy);
  const mon = world.monsters.at(xs, ys);
  const firstLiving = [0, 1, 2, 3].find((m) => world.memberAlive(m)) ?? 0;

  if (mon < 0) {
    // No one there: perhaps a counter with a merchant behind it.
    if (!counterWithMerchant(world, xs, ys, dx, dy)) return notHere(io);
    const shopNumber = world.y & 0x07;
    let member = firstLiving;
    const partyGoods = shopNumber === 1 || shopNumber === 5; // grocer and guild sell to the party
    if (!partyGoods) {
      // The goods or the cure go to a named member.
      member = await whoTransacts(world, io);
      if (member < 0) return;
    }
    const previousMusic = world.music;
    world.music = Music.Shop;
    io.music(Music.Shop);
    if (!partyGoods) io.highlightMember(member, true);
    await shop(world, io, shopNumber, member);
    io.highlightMember(member, false);
    world.music = previousMusic;
    io.music(previousMusic);
    return;
  }

  // Lord British judges one member; townspeople talk to whoever is in front.
  let member = firstLiving;
  if (world.monsters.type(mon) === MapValue.LordBritish) {
    member = await whoSeesLordBritish(world, io);
    if (member < 0) return;
  }
  await talkTo(world, io, mon, member);
}

/**
 * Talk to the creature in monster slot `mon`: a townsperson's line, or
 * Lord British's audience. Also used when the party walks into someone.
 */
export async function talkTo(world: World, io: GameIO, mon: number, member: number): Promise<void> {
  const p = world.member(member);
  const m = world.monsters;
  if (m.type(mon) !== MapValue.LordBritish) {
    const person = m.talkIndex(mon);
    if (person === 0) {
      io.printMessage(world.party.exodusDestroyed ? Msg.ExodusNoMore : Msg.GoodDay);
      return;
    }
    io.print(speech(world.current.talk, person));
    const town = world.resources.mapNames.get(world.current.id);
    if (town && hearTownLine(world, town, person)) journalCheck(world, io);
    return;
  }

  // Lord British raises levels once the character has the experience.
  io.music(Music.LordBritish);
  io.printMessage(Msg.WelcomeMyChild);
  world.journal.lordBritish = true;
  await lordBritishSpeaks(world, io, p);
  journalCheck(world, io);
}

/** The rest of the audience: level up, or one of the king's excuses. */
async function lordBritishSpeaks(world: World, io: GameIO, p: PlayerRecord): Promise<void> {
  const level = p.bytes[30];
  let hpmax = p.maxHitPoints;
  if (hpmax % 100 === 50) hpmax -= 50; // old 150/250 style values
  hpmax = Math.floor(hpmax / 100);
  if (level < hpmax) {
    io.printMessage(world.party.exodusDestroyed ? Msg.SosariaThanks : Msg.ExperienceMore);
    return;
  }
  if (hpmax >= 25 && !world.party.exodusDestroyed) return io.printMessage(Msg.NoMore);
  if (hpmax > 4 && !(p.marks & 0x80)) {
    hearClue(world, 'LB:mark');
    return io.printMessage(Msg.SeekMarkOfKings);
  }
  const newMax = Math.min(9950, p.maxHitPoints + 100);
  const gained = newMax - p.maxHitPoints;
  p.bytes[28] = Math.floor(newMax / 256);
  p.bytes[29] = newMax % 256;
  p.addHitPoints(gained); // this port: the new hit points are also given, not just room for them
  io.printMessage(Msg.ThouArtGreater);
  await io.flashTiles();
  io.sound(Sound.LBLevelRise);
  await io.flashTiles();
  io.updateStats();
}

// ---------------------------------------------------------------------------
// Attack, Fire
// ---------------------------------------------------------------------------

/** A: attack a monster on an adjacent square. (`Attack`) */
export async function attack(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Attack);
  const dir = await getDirection(world, io);
  if (!dir) return;
  await attackToward(world, io, dir.dx, dir.dy);
}

/** Attack whatever is one step (dx, dy) from the party. */
export async function attackToward(world: World, io: GameIO, dx: number, dy: number): Promise<void> {
  const mon = world.monsters.at(world.constrain(world.x + dx), world.constrain(world.y + dy));
  if (mon < 0) return notHere(io);
  await attackMonster(world, io, mon);
}

/** F: fire the frigate's cannons three squares in a direction. (`Fire`) */
export async function fire(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Fire);
  if (world.party.shape !== PartyShape.Frigate) return what2(io);
  io.printMessage(Msg.FireDirect);
  const dir = await getDirection(world, io);
  if (!dir) return;
  io.sound(Sound.Shoot);
  let xs = world.x;
  let ys = world.y;
  for (let range = 3; range > 0; range--) {
    xs = world.constrain(xs + dir.dx);
    ys = world.constrain(ys + dir.dy);
    const mon = world.monsters.at(xs, ys);
    if (mon < 0) {
      await showBall(world, io, xs, ys, Shape.FireBall);
      continue;
    }
    // A hit. Pirates dodge half the time; everything else dodges half the time too.
    io.sound(Sound.Hit);
    await showBall(world, io, xs, ys, Shape.FireBall);
    const m = world.monsters;
    if (world.rng.range(0, 255) < 128) return io.redrawMap();
    if (m.type(mon) === MapValue.Pirate && world.rng.range(0, 255) < 128) return io.redrawMap();
    await showBall(world, io, xs, ys, Shape.FireBall, true);
    io.print(monsterName(world, m.type(mon) >> 1, m.variant(mon), true));
    io.printMessage(Msg.Destroyed);
    world.putXYVal(m.tileUnder(mon), xs, ys);
    m.clear(mon);
    return;
  }
  io.redrawMap();
}

// ---------------------------------------------------------------------------
// Steal, Unlock, Yell
// ---------------------------------------------------------------------------

/** S: steal from a shop's chest across the counter. (`Steal`) */
export async function steal(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Steal);
  const n = await io.chooseMember();
  if (n < 1 || n > 4) return;
  const member = n - 1;
  if (!world.memberAlive(member)) return incapacitated(io);
  io.printMessage(Msg.Direction);
  const dir = await getDirection(world, io);
  if (!dir) return;

  const fail = () => {
    if ((world.rng.range(0, 255) & 0x03) !== 0) return io.printMessage(Msg.Failed);
    // Caught: every guard turns hostile.
    const m = world.monsters;
    for (let i = 31; i >= 0; i--) if (m.type(i) === MapValue.Guard) m.setHp(i, 0xc0);
    io.printMessage(Msg.WatchOut);
    io.sound(Sound.Ouch);
    io.sound(Sound.Alarm);
  };

  if (stealDisarmFails(world, world.member(member))) return fail();
  const counter = world.getXYVal(dir.xs, dir.ys);
  if (counter < 0x94 || counter > 0xe4) return fail();
  const xs = world.constrain(dir.xs + dir.dx);
  const ys = world.constrain(dir.ys + dir.dy);
  if (world.getXYVal(xs, ys) !== MapValue.Chest) return fail();
  world.putXYVal(MapValue.Floor, xs, ys);
  await getChest(world, io, member, 'steal');
}

/** U: unlock a door with a key. Doors are only unlocked sideways. (`Unlock`) */
export async function unlock(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Unlock);
  const dir = await getDirection(world, io, false, false);
  if (!dir) return;
  await unlockToward(world, io, dir.dx, dir.dy);
}

/** Unlock the door one step (dx, dy) from the party, asking whose key to use. */
export async function unlockToward(world: World, io: GameIO, dx: number, dy: number): Promise<void> {
  const dir = { xs: world.x + dx, ys: world.y + dy, dx, dy };
  if (dir.dx === 0 && dir.dy !== 0) return notHere(io);
  if (world.getXYVal(dir.xs, dir.ys) !== MapValue.LetterI) return notHere(io);
  // Keys are the party's (this port): no "whose key" prompt.
  if (world.party.keys < 1) return io.printMessage(Msg.NoneLeft);
  world.party.keys--;
  io.sound(Sound.Creak);
  // The doorway becomes whatever is to its left (or grass if that is not terrain).
  const mon = world.monsters.at(dir.xs - 1, dir.ys);
  let value = mon >= 0 ? world.monsters.tileUnder(mon) : world.getXYVal(dir.xs - 1, dir.ys);
  if (value > MapValue.Floor) value = MapValue.Grass;
  world.putXYVal(value, dir.xs, dir.ys);
  io.redrawMap();
}

/**
 * Y: yell. The Apple II's Yell was Other under another name: the same
 * member prompt, the same words, except that EVOCARE parted the great
 * serpent only when yelled. Here EVOCARE works from Other as well, so
 * the controller menus offer Other alone; Y stays for keyboard habit. (`Yell`)
 */
export async function yell(world: World, io: GameIO): Promise<void> {
  io.printMessage(Msg.Yell);
  await otherCommand(world, io, true);
}

/** EVOCARE with the Mark of the Snake, beside the serpent: the party crosses it. */
async function evocare(world: World, io: GameIO, member: number): Promise<void> {
  const p = world.member(member);
  if (!(p.marks & 0x40)) return io.printMessage(Msg.NoEffect);
  let oy = world.y;
  if (world.getXYVal(world.x, world.y - 1) === MapValue.SnakeTop) oy -= 3;
  if (world.getXYVal(world.x, world.y + 1) === MapValue.SnakeBottom) oy += 3;
  if (oy === world.y) return io.printMessage(Msg.NoEffect);
  world.y = oy;
  io.clearTiles();
  io.sound(Sound.Invocation);
  await io.pause(1000);
  io.redrawMap();
  world.journal.serpentParted = true;
  journalCheck(world, io);
}

// ---------------------------------------------------------------------------
// O: Other command
// ---------------------------------------------------------------------------

/** Words the Other command understands, offered as a menu to controller users. */
export const OTHER_WORDS = ['SEARCH', 'BRIBE', 'PRAY', 'EVOCARE', 'INSERT', 'DIG', 'PAXUM', 'SCREAM'];

/**
 * Mirrors `OtherCommand()`: a typed word. PAXUM calms nearby monsters,
 * SCREAM screams, INSERT places a card in Exodus, DIG digs up exotics,
 * SEARCH finds marks at shrines, BRIBE pays off a guard, PRAY at the right
 * spot reveals a word, EVOCARE parts the serpent, and PISSOFF angers everyone.
 */
export async function otherCommand(world: World, io: GameIO, fromYell = false): Promise<void> {
  if (!fromYell) io.printMessage(Msg.OtherCommand);
  const n = await io.chooseMember();
  if (n < 1 || n > 4) return;
  const member = n - 1;
  if (!world.memberAlive(member)) return incapacitated(io);
  const p = world.member(member);
  io.printMessage(Msg.Cmd);
  const word = (await io.inputText(8, false, OTHER_WORDS)).toUpperCase();
  io.print('\n');

  switch (word) {
    case 'PAXUM': {
      if (world.onSurface) return io.printMessage(Msg.NoEffect);
      io.printMessage(Msg.AllIsCalm);
      const m = world.monsters;
      for (let i = 0; i < 32; i++) {
        if (m.type(i) === 0 || m.hp(i) !== 0xc0) continue;
        if (Math.abs(m.x(i) - world.x) < 6 && Math.abs(m.y(i) - world.y) < 6) m.setHp(i, 0x40);
      }
      return;
    }
    case 'SCREAM':
      io.print('\nAIEEEEE!\n\n');
      io.sound(deathSound(p.sex));
      return;
    case 'INSERT':
      return insertCard(world, io, member);
    case 'DIG': {
      if (!world.onSurface) return notHere(io);
      if (world.x === 0x21 && world.y === 0x03)
        world.addGear(true, 15); // exotic weapon
      else if (world.x === 0x13 && world.y === 0x2c)
        world.addGear(false, 7); // exotic armour
      else return notHere(io);
      io.printMessage(Msg.Exotics);
      journalCheck(world, io);
      return;
    }
    case 'SEARCH': {
      if (world.getXYVal(world.x, world.y) !== MapValue.Shrine) return notHere(io);
      p.bytes[14] |= 1 << (world.x & 0x03);
      io.printMessage(Msg.StrangeCard);
      journalCheck(world, io);
      return;
    }
    case 'BRIBE': {
      io.printMessage(Msg.Dir);
      const dir = await getDirection(world, io);
      if (!dir) return;
      const mon = world.monsters.at(world.constrain(dir.xs), world.constrain(dir.ys));
      if (mon < 0) return notHere(io);
      if (world.party.gold < 100) {
        io.printMessage(Msg.NotEnoughGold);
        io.sound(Sound.Error1);
        return;
      }
      world.party.gold -= 100;
      const m = world.monsters;
      if (m.type(mon) !== MapValue.Guard) return io.printMessage(Msg.NoEffect);
      world.putXYVal(m.tileUnder(mon), m.x(mon), m.y(mon));
      m.clear(mon);
      return;
    }
    case 'PRAY': {
      if (world.party.location !== Location.Town) return io.printMessage(Msg.NoEffect);
      if (world.party.surfaceX !== world.resources.misc.locationX[4]) return io.printMessage(Msg.NoEffect);
      if (world.x !== 0x30 || world.y !== 0x30) return io.printMessage(Msg.NoEffect);
      io.printMessage(Msg.YellEvocare);
      world.journal.wordKnown = true;
      hearClue(world, 'Yew:pray');
      journalCheck(world, io);
      return;
    }
    case 'EVOCARE':
      return evocare(world, io, member);
    case 'PISSOFF': {
      io.printMessage(Msg.EveryoneHates);
      for (let i = 0; i < 32; i++) world.monsters.setHp(i, 0xc0);
      return;
    }
    default:
      return io.printMessage(Msg.NoEffect);
  }
}

/**
 * INSERT: place a card into Exodus. The four cards must go in order (Love,
 * Sol, Moons, Death) into the four slots; a wrong card is fatal. After the
 * fourth, Exodus is destroyed and the game is won.
 */
async function insertCard(world: World, io: GameIO, member: number): Promise<void> {
  const p = world.member(member);
  io.printMessage(Msg.Dir);
  const dir = await getDirection(world, io);
  if (!dir) return;
  if (world.getXYVal(dir.xs, dir.ys) !== MapValue.Exodus) return notHere(io);
  io.printMessage(Msg.Cards);
  const key = await io.chooseOption(
    letterOptions('DSLM', (l) => ({ D: 'Card of Death', S: 'Card of Sol', L: 'Card of Love', M: 'Card of Moons' })[l]!),
    'line',
  );
  const slot = { L: 0x1e, S: 0x1f, M: 0x20, D: 0x21 }[key];
  if (!slot) return what2(io);
  if (!(p.marks & (1 << (slot - 0x1e)))) return io.printMessage(Msg.NoneLeft);

  if (dir.xs !== slot || slot !== world.lastCard) {
    // Wrong card or wrong slot: the character is struck down.
    await io.flashMember(member);
    io.sound(Sound.Hit);
    await io.pause(250);
    p.hitPoints = 1;
    p.subtractHitPoints(255);
    io.sound(deathSound(p.sex));
    io.updateStats();
    return;
  }
  world.lastCard++;
  for (let i = 0; i < 5; i++) {
    world.ball = { x: dir.xs, y: dir.ys, shape: Shape.MagicBall };
    io.redrawMap();
    io.sound(Sound.Hit);
    await io.pause(250);
    world.ball = null;
    io.redrawMap();
    io.sound(Sound.Hit);
    await io.pause(250);
  }
  world.putXYVal(MapValue.Floor, dir.xs, dir.ys);
  io.redrawMap();
  if (world.lastCard !== 0x22) return;

  // Exodus is destroyed.
  world.party.bytes[15] = 1;
  world.music = Music.Shrine;
  io.music(Music.Shrine);
  io.printMessage(Msg.Congratulations);
  io.print(String(world.party.moves));
  io.printMessage(Msg.Moves);
  await io.playEnding();
  safeExodus(world);
  io.redrawMap();
  io.print('\n');
  journalCheck(world, io);
}

/** Mirrors `SafeExodus()`: after the victory the castle is emptied and its traps removed. */
export function safeExodus(world: World): void {
  const m = world.monsters;
  for (let i = 0; i < 32; i++) {
    if (m.hp(i) > 0) {
      world.putXYVal(m.tileUnder(i), m.x(i), m.y(i));
      m.setHp(i, 0);
      m.clear(i);
    }
  }
  for (let y = 1; y < 12; y++) for (let x = 0x1e; x < 0x22; x++) world.putXYVal(MapValue.Floor, x, y);
}

// ---------------------------------------------------------------------------
// Shrines of Ambrosia
// ---------------------------------------------------------------------------

/** Race-dependent caps on each attribute at the shrines. (`shMax`) */
const SHRINE_MAX = [75, 75, 99, 75, 25, 75, 99, 75, 50, 99, 75, 50, 75, 99, 75, 75, 75, 50, 75, 99];

/**
 * Mirrors `Shrine()`: pay hundreds of gold to raise strength, dexterity,
 * intelligence or wisdom (chosen by the shrine's X position & 3), up to
 * the race's cap. After Exodus is destroyed the cap no longer applies.
 */
export async function enterShrine(world: World, io: GameIO): Promise<void> {
  io.printMessage(CmdMsg.Enter);
  io.printMessage(Msg.EnterShrine);
  const n = await io.chooseMember();
  if (n < 1 || n > 4) return io.sound(Sound.Error1);
  const member = n - 1;
  if (!world.memberAlive(member)) return incapacitated(io);
  const p = world.member(member);

  const previousMusic = world.music;
  io.music(Music.Shrine);
  io.showImage('Shrine');
  const which = world.x & 0x03;
  const attribute = world.resources.strings.Messages[173 + which];
  io.printMessage(Msg.ShrineWelcome);
  io.print(' '.repeat(Math.floor((16 - attribute.length) / 2)) + attribute + '\n\n');

  const races = world.resources.strings.Races.map((r) => r[0]);
  const race = Math.max(0, races.indexOf(p.race));
  const table = [0, 5, 15, 10][which];
  const max = SHRINE_MAX[race + table];
  const offset = [18, 19, 20, 21][which];

  io.printMessage(Msg.ShrineOffering);
  const key = await io.chooseOption(
    letterOptions('0123456789', (d) => (d === '0' ? '0 (nothing)' : `${d} = ${d}00 gold`)),
    'key',
  );
  const amount = key ? key.charCodeAt(0) - '0'.charCodeAt(0) : 0;
  const leave = () => {
    io.redrawMap();
    world.music = previousMusic;
    io.music(Music.Ambrosia);
  };
  if (amount === 0) {
    io.printMessage(Msg.ThenBeOff);
    return leave();
  }
  if (world.party.gold < amount * 100) {
    io.printMessage(Msg.CantCheat);
    io.sound(Sound.Error1);
    return leave();
  }
  world.party.gold -= amount * 100;
  io.printMessage(Msg.Shazam);
  await io.flashMember(member);
  await io.flashTiles();
  io.sound(Sound.Shrine);
  p.bytes[offset] = Math.min(99, p.bytes[offset] + amount);
  if (p.bytes[offset] > max && !world.party.exodusDestroyed) p.bytes[offset] = max;
  io.updateStats(true);
  leave();
}

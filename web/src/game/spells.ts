/**
 * spells.ts
 *
 * Casting: a port of `Cast()`, `ProcessMagic()`, `Spell()` and the spell
 * effects from UltimaSpellCombat.c.
 *
 * Spell numbers follow the original: wizard spells are 0-15 (keys A-P),
 * cleric spells 16-31 (keys A-P), and three post-Exodus wizard extras 32-34
 * (keys Q, R, S: Terraform, Armageddon, Flotellum). A spell's cost is its
 * letter index times five magic points.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue, Shape } from './tiles.ts';
import { type GameIO, Sound, inputNumber, type MenuOption, type SpellFlash } from './io.ts';
import { getDirection, cancelled } from './commands.ts';
import { shoot, showBall, damageMonster } from './combat.ts';
import { getChest, incapacitated, chestHere } from './actions.ts';

const Msg = {
  CastByWhom: 119,
  NotAMage: 121,
  MpTooLow: 122,
  SpellType: 123,
  ClericSpell: 124,
  WizardSpell: 125,
  CureWhom: 127,
  ResurrectWhom: 128,
  RecallWhom: 129,
  HealWhom: 130,
  Direction: 85,
  Failed: 86,
} as const;

/** Sound played by `Flashriek()` for each spell number. */
const SPELL_SOUNDS = [0, 1, 2, 3, 4, 1, 5, 1, 2, 7, 0, 1, 7, 0, 0, 0, 0, 7, 6, 2, 4, 3, 5, 6, 5, 2, 6, 7, 1, 6, 0, 6, 7, 0, 0];
const SOUND_NAMES = [
  Sound.BigDeath,
  Sound.Immolate,
  Sound.TorchIgnite,
  Sound.Downwards,
  Sound.Upwards,
  Sound.Invocation,
  Sound.Heal,
  Sound.MiscSpell,
];

const CANCELLED = -2;
const NOT_A_MAGE = -1;

/**
 * Mirrors `Cast()`. Outside combat `member` is undefined and the player is
 * asked who casts. Returns false if nothing was cast (so combat can ask
 * for another command).
 */
export async function cast(world: World, io: GameIO, member?: number): Promise<boolean> {
  if (member === undefined) {
    io.printMessage(Msg.CastByWhom);
    const n = await io.chooseMember();
    if (n === 0) cancelled(world, io);
    if (n < 1 || n > 4) return false;
    member = n - 1;
    if (!world.memberAlive(member)) {
      incapacitated(io);
      return false;
    }
  }
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const classIndex = careers.indexOf(world.member(member).classLetter);
  let spell = NOT_A_MAGE;
  switch (classIndex) {
    case 1: // Cleric
    case 4: // Paladin
    case 7: // Illusionist
      spell = await chooseCleric(world, io, member);
      break;
    case 2: // Wizard
    case 6: // Lark
    case 9: // Alchemist
      spell = await chooseWizard(world, io, member);
      break;
    case 8: // Druid
    case 10: // Ranger
      spell = await chooseEither(world, io, member);
      break;
    default:
      break;
  }
  if (spell === CANCELLED) {
    cancelled(world, io);
    return false;
  }
  if (spell === NOT_A_MAGE) {
    io.printMessage(Msg.NotAMage);
    return false;
  }
  await processMagic(world, io, member, spell);
  if (world.commandCancelled) return false; // backed out at the spell's own prompt, the mana given back
  world.lastSpell[member] = spell; // for the combat menu's "Cast (spell)" shortcut
  return true;
}

/** The plain name of a spell, as the menus show it. */
export function spellName(spell: number): string {
  return SPELL_INFO[spell]?.name ?? '?';
}

/** What a spell costs in mana. Terraform, Armageddon and Flotellum have their own prices. */
export function spellCost(spell: number): number {
  return spell === 32 ? 10 : spell === 33 ? 85 : spell === 34 ? 90 : (spell & 0x0f) * 5;
}

/**
 * The spell the combat menu offers as "Cast (spell)": the member's last
 * spell, else Magic bolt for anyone with wizard spells and Heal for the
 * cleric-only classes. Null for a member with no magic.
 */
export function quickSpell(world: World, member: number): number | null {
  const last = world.lastSpell[member];
  if (last !== undefined) return last;
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  switch (careers.indexOf(world.member(member).classLetter)) {
    case 2: // Wizard
    case 6: // Lark
    case 8: // Druid
    case 9: // Alchemist
    case 10: // Ranger
      return 1; // Mittar, magic bolt
    case 1: // Cleric
    case 4: // Paladin
    case 7: // Illusionist
      return 18; // Sanctu, heal
    default:
      return null;
  }
}

/** Cast the quick spell straight away, without the spell menu. Returns false when the member has none. */
export async function quickCast(world: World, io: GameIO, member: number): Promise<boolean> {
  const spell = quickSpell(world, member);
  if (spell === null) return false;
  io.print(`${spellName(spell)}\n`);
  await processMagic(world, io, member, spell);
  world.lastSpell[member] = spell;
  return true;
}

/**
 * What each spell is called in plain words, for the menus, and what it
 * does, for the hint line. The Apple II showed only the spell-book names
 * (Mittar, Sanctu ...), which the manual explained; the hint keeps those
 * names alongside. Indexed by spell number; labels stay under 16
 * characters so they fit a menu over the map.
 */
const SPELL_INFO: { name: string; does: string }[] = [
  { name: 'Repel orcs', does: 'may destroy an orc pack, once a fight' },
  { name: 'Magic bolt', does: 'a bolt at one foe' },
  { name: 'Light', does: 'lights a dungeon for a while' },
  { name: 'Down a level', does: 'sink to the level below' },
  { name: 'Up a level', does: 'rise to the level above' },
  { name: 'Fireball', does: 'a strong bolt at one foe' },
  { name: 'Far teleport', does: 'a random spot on Sosaria' },
  { name: 'Mind bolt', does: 'a bolt as strong as your mind' },
  { name: 'Long light', does: 'lights a dungeon for a long time' },
  { name: 'Cleric spell', does: 'cast any cleric spell' },
  { name: 'Blast all foes', does: 'hurts every foe on the field' },
  { name: 'Death bolt', does: 'slays one foe' },
  { name: 'Stop time', does: 'foes stand still for twenty turns' },
  { name: 'Mind storm', does: 'hurts every foe, twice your mind' },
  { name: 'Weaken all', does: 'every foe drops to 5 hit points' },
  { name: 'Slay all foes', does: 'may slay every foe on the field' },
  { name: 'Repel undead', does: 'may destroy the undead, once a fight' },
  { name: 'Safe chest', does: 'opens a chest without its trap' },
  { name: 'Heal', does: 'heals one member a little' },
  { name: 'Light', does: 'lights a dungeon for a while' },
  { name: 'Up a level', does: 'rise to the level above' },
  { name: 'Down a level', does: 'sink to the level below' },
  { name: 'Near teleport', does: 'a random spot on this level' },
  { name: 'Cure poison', does: 'cures one member' },
  { name: 'Leave dungeon', does: 'straight out to the surface' },
  { name: 'Long light', does: 'lights a dungeon for a long time' },
  { name: 'Great heal', does: 'heals one member a lot' },
  { name: 'Show the map', does: 'a map, as a gem would show' },
  { name: 'Death bolt', does: 'slays one foe' },
  { name: 'Resurrect', does: 'raises the dead; may leave ashes' },
  { name: 'Slay all foes', does: 'may slay every foe on the field' },
  { name: 'Recall ashes', does: 'restores ashes, for 5 wisdom' },
  { name: 'Terraform', does: 'sets the square ahead to any tile' },
  { name: 'Armageddon', does: 'every creature becomes a chest' },
  { name: 'Conjure frigate', does: 'a frigate on the nearest water' },
];

/** Menu option for a spell: its letter and plain name, with the book name, cost and effect as the hint. */
function spellOption(world: World, spell: number, letter: string, member: number): MenuOption {
  const book = spell < 32 ? world.resources.strings.Spells[spell] : ['TERRAFORM', 'ARMAGEDDON', 'FLOTELLUM'][spell - 32];
  const cost = spellCost(spell);
  const info = SPELL_INFO[spell] ?? { name: book.trim() || '?', does: '' };
  // Greyed when the caster cannot afford it, like other menu entries with nothing on hand.
  const disabled = cost > world.member(member).mana;
  return { key: letter, label: `${letter} ${info.name}`, hint: `${book.trim() || 'Nameless'} (${cost} mana): ${info.does}`, disabled };
}

async function chooseEither(world: World, io: GameIO, member: number): Promise<number> {
  io.printMessage(Msg.SpellType);
  const key = await io.chooseOption(
    [
      { key: 'W', label: 'Wizard spell' },
      { key: 'C', label: 'Cleric spell' },
    ],
    'line',
  );
  if (world.done) return CANCELLED;
  if (key === 'W') return chooseWizard(world, io, member);
  if (key === 'C') return chooseCleric(world, io, member);
  return CANCELLED;
}

async function chooseCleric(world: World, io: GameIO, member: number): Promise<number> {
  io.printMessage(Msg.ClericSpell);
  const key = await io.chooseOption(
    Array.from('ABCDEFGHIJKLMNOP', (l) => spellOption(world, l.charCodeAt(0) - 65 + 16, l, member)),
    'line',
  );
  if (!key || world.done) return CANCELLED;
  return key.charCodeAt(0) - 'A'.charCodeAt(0) + 16;
}

async function chooseWizard(world: World, io: GameIO, member: number): Promise<number> {
  io.printMessage(Msg.WizardSpell);
  const letters = world.party.exodusDestroyed ? 'ABCDEFGHIJKLMNOPQRS' : 'ABCDEFGHIJKLMNOP';
  const number = (l: string) => ({ Q: 32, R: 33, S: 34 })[l] ?? l.charCodeAt(0) - 65;
  const key = await io.chooseOption(
    Array.from(letters, (l) => spellOption(world, number(l), l, member)),
    'line',
  );
  if (!key || world.done) return CANCELLED;
  return number(key);
}

/** The first half of `ProcessMagic()`: pay for the spell and announce it. False (with "MP too low") when the caster cannot. */
function payForSpell(world: World, io: GameIO, member: number, spell: number): boolean {
  const p = world.member(member);
  const cost = spellCost(spell);
  if (cost > p.mana) {
    io.printMessage(Msg.MpTooLow);
    return false;
  }
  p.mana -= cost;
  io.updateStats();
  io.print('\n');
  if (spell < 32) io.print(world.resources.strings.Spells[spell]);
  else io.print(['TERRAFORM', 'ARMAGEDDON', 'FLOTELLUM'][spell - 32]);
  io.print('\n\n');
  return true;
}

/** Mirrors `ProcessMagic()`: pay for the spell, announce it, cast it. */
export async function processMagic(world: World, io: GameIO, member: number, spell: number): Promise<void> {
  if (!payForSpell(world, io, member, spell)) return;
  await spellEffect(world, io, member, spell);
}

export const HEAL = 18; // Sanctu: 10..30 hit points
export const GREAT_HEAL = 26; // Sanctu Mani: 20..100 hit points
/** A Heal's typical yield; a wound larger than this calls for Great heal. */
const HEAL_TYPICAL = 20;
/** Classes with cleric spells: Cleric, Paladin, Illusionist, Druid, Ranger. */
const CLERIC_CASTERS = [1, 4, 7, 8, 10];

export interface HealPlan {
  caster: number;
  spell: number;
  target: number;
}

/**
 * The healing the party most needs right now, for the menu's "Cast (Heal)"
 * shortcut outside combat (this port): the living member missing the most
 * hit points is the target; Heal serves a wound up to a Heal's typical
 * yield and Great heal a larger one, the other standing in when only it
 * can be afforded; the caster is the living member with cleric spells and
 * the most mana who can pay. Null when nobody is hurt or nobody can help.
 */
export function healPlan(world: World): HealPlan | null {
  const living = [0, 1, 2, 3].filter((m) => world.memberAlive(m));
  const gap = (m: number) => world.member(m).maxHitPoints - world.member(m).hitPoints;
  const wounded = living.filter((m) => gap(m) > 0).sort((a, b) => gap(b) - gap(a));
  if (wounded.length === 0) return null;
  const target = wounded[0];
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const casters = living
    .filter((m) => CLERIC_CASTERS.includes(careers.indexOf(world.member(m).classLetter)))
    .sort((a, b) => world.member(b).mana - world.member(a).mana);
  const order = gap(target) > HEAL_TYPICAL ? [GREAT_HEAL, HEAL] : [HEAL, GREAT_HEAL];
  for (const spell of order) {
    const caster = casters.find((m) => world.member(m).mana >= spellCost(spell));
    if (caster !== undefined) return { caster, spell, target };
  }
  return null;
}

/** Cast the planned heal straight away: no "who casts", no spell menu, no "heal whom". False when there is no plan. */
export async function quickHeal(world: World, io: GameIO): Promise<boolean> {
  const plan = healPlan(world);
  if (!plan) return false;
  io.print(`${spellName(plan.spell)}\non ${world.member(plan.target).name}\n`); // two lines: the message area is 16 wide
  if (!payForSpell(world, io, plan.caster, plan.spell)) return true;
  const amount = plan.spell === GREAT_HEAL ? world.rng.range(0, 80) + 20 : world.rng.range(0, 20) + 10;
  await healMember(world, io, plan.spell, amount, plan.target);
  world.lastSpell[plan.caster] = plan.spell;
  return true;
}

export const SAFE_CHEST = 17; // Appar Unem: opens a chest without its trap

/**
 * Who would cast Safe chest for the menu's "Cast (Safe chest)" shortcut
 * (this port): the living member with cleric spells and the most mana who
 * can pay for it. Null when nobody can, or the party is not on a chest.
 */
export function safeChestCaster(world: World): number | null {
  if (!chestHere(world)) return null;
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const casters = [0, 1, 2, 3]
    .filter((m) => world.memberAlive(m) && CLERIC_CASTERS.includes(careers.indexOf(world.member(m).classLetter)))
    .filter((m) => world.member(m).mana >= spellCost(SAFE_CHEST))
    .sort((a, b) => world.member(b).mana - world.member(a).mana);
  return casters.length ? casters[0] : null;
}

/** The light spells, strongest first: Long light (250 turns) in either book, then Light (10 turns), cheaper book first. */
export const LIGHT_SPELLS = [8, 25, 2, 19]; // Dag Lorum, Sominae, Lorum, Luminae
/** Classes with wizard spells: Wizard, Lark, Druid, Alchemist, Ranger. */
const WIZARD_CASTERS = [2, 6, 8, 9, 10];

export interface LightPlan {
  caster: number;
  spell: number;
}

/** Whether a class (career-table index) has the book a spell is in. */
function hasBookFor(career: number, spell: number): boolean {
  return spell < 16 ? WIZARD_CASTERS.includes(career) : CLERIC_CASTERS.includes(career);
}

/**
 * Who lights the dungeon for the menu's "Cast (Long light)" or "Cast
 * (Light)" shortcut (this port), and with what: the strongest light spell
 * anyone living can cast (has the book and the mana for), Long light over
 * Light; among members able to cast that spell, the most mana wins and a
 * tie goes to party order. Null unless the dungeon is dark and someone can.
 */
export function lightPlan(world: World): LightPlan | null {
  if (world.party.location !== Location.Dungeon || world.dungeon.torch > 0) return null;
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const living = [0, 1, 2, 3].filter((m) => world.memberAlive(m));
  const canCast = (m: number, spell: number) =>
    hasBookFor(careers.indexOf(world.member(m).classLetter), spell) && world.member(m).mana >= spellCost(spell);
  for (const tier of [LIGHT_SPELLS.slice(0, 2), LIGHT_SPELLS.slice(2)]) {
    // Each member casts the tier's cheaper spell they have the book for.
    const able = living.map((m) => ({ m, spell: tier.find((spell) => canCast(m, spell)) })).filter((c) => c.spell !== undefined);
    if (able.length === 0) continue;
    able.sort((a, b) => world.member(b.m).mana - world.member(a.m).mana); // stable: ties keep party order
    return { caster: able[0].m, spell: able[0].spell! };
  }
  return null;
}

/** Cast the planned light straight away: no "who casts", no spell menu. False when there is no plan. */
export async function quickLight(world: World, io: GameIO): Promise<boolean> {
  const plan = lightPlan(world);
  if (!plan) return false;
  io.print(`${spellName(plan.spell)}\nby ${world.member(plan.caster).name}\n`);
  await processMagic(world, io, plan.caster, plan.spell);
  world.lastSpell[plan.caster] = plan.spell;
  return true;
}

/** Cast Safe chest on the chest underfoot straight away: no "who casts", no spell menu. False when there is no caster or no chest. */
export async function quickSafeChest(world: World, io: GameIO): Promise<boolean> {
  const caster = safeChestCaster(world);
  if (caster === null) return false;
  io.print(`${spellName(SAFE_CHEST)}\nby ${world.member(caster).name}\n`);
  await processMagic(world, io, caster, SAFE_CHEST);
  world.lastSpell[caster] = SAFE_CHEST;
  return true;
}

/** Mirrors `Failed()`. */
export function failed(io: GameIO): void {
  io.printMessage(Msg.Failed);
  io.sound(Sound.FailedSpell);
}

/**
 * Backed out at a spell's own prompt (whom, or which way), after it was
 * paid for: the mana comes back and the turn is not spent. This port; the
 * original said "Failed" and kept the mana.
 */
function refund(world: World, io: GameIO, caster: number, spell: number): void {
  world.member(caster).mana += spellCost(spell);
  io.updateStats();
  cancelled(world, io);
}

/**
 * Where each spell's flash lands with the Standard tiles: bolts and
 * self-directed spells flash the caster's square, heals the recipient's,
 * and spells that change the whole arena or the whole view flash all of
 * it, the light spells among them, to sell the ignition. Other tile sets
 * flash the view for every spell, as the original did.
 */
export const SPELL_FLASH: Record<number, SpellFlash> = {
  1: 'caster', // Mittar
  5: 'caster', // Fulgar
  7: 'caster', // Mentar
  9: 'caster', // Fal Divi
  11: 'caster', // Decorp
  17: 'caster', // Appar Unem
  27: 'caster', // Vieda
  28: 'caster', // Excuun
  18: 'target', // Sanctu
  23: 'target', // Alcort
  26: 'target', // Sanctu Mani
  29: 'target', // Surmandum
  31: 'target', // Anju Sermani
};

/** Mirrors `Flashriek()`: flash for the spell and play its sound. `member` is the caster, or the recipient of a heal. */
function flashriek(io: GameIO, spell: number, member: number): Promise<void> {
  return io.flashSpell(SPELL_FLASH[spell] ?? 'window', member, SOUND_NAMES[SPELL_SOUNDS[spell] ?? 7]);
}

/** Mirrors `Spell()`: the effect of each spell. */
async function spellEffect(world: World, io: GameIO, member: number, spell: number): Promise<void> {
  if (world.done) return;
  const p = world.member(member);
  const inCombat = world.party.location === Location.Combat;
  const c = world.combat;

  switch (spell) {
    case 0: // Repond: destroys orcs (once per fight)
      if (!inCombat || !c || c.monsterShape !== 0x30 || world.spellFlags.repond) return failed(io);
      world.spellFlags.repond = true;
      if (world.rng.range(0, 255) < 128) return failed(io);
      return bigDeath(world, io, member, spell, 255);
    case 1: // Mittar
      return projectile(world, io, member, spell, world.rng.range(0, 40) | 0x10);
    case 2: // Lorum
    case 19: // Luminae
      world.dungeon.torch = 10;
      return flashriek(io, spell, member);
    case 3: // Dor Acron
    case 21: // Rec Du
      return downLevel(world, io, spell);
    case 4: // Sur Acron
    case 20: // Rec Su
      return upLevel(world, io, spell);
    case 5: // Fulgar
      return projectile(world, io, member, spell, 75);
    case 6: {
      // Dag Acron: teleport to a random spot on Sosaria
      await flashriek(io, spell, member);
      if (!world.onSurface || (world.party.shape === 0x16 && !world.party.exodusDestroyed)) return failed(io);
      const wanted = world.party.shape === 0x16 ? MapValue.Water : MapValue.Grass;
      let value = -1;
      while (value !== wanted) {
        world.x = world.rng.range(0, world.mapSize - 1);
        world.y = world.rng.range(0, world.mapSize - 1);
        value = world.getXYVal(world.x, world.y);
      }
      return;
    }
    case 7: // Mentar
      return projectile(world, io, member, spell, p.intelligence);
    case 8: // Dag Lorum
    case 25: // Sominae
      world.dungeon.torch = 250;
      return flashriek(io, spell, member);
    case 9: {
      // Fal Divi: cast any cleric spell
      await flashriek(io, spell, member);
      const chosen = await chooseCleric(world, io, member);
      if (chosen < 0) return;
      return processMagic(world, io, member, chosen);
    }
    case 10: // Noxum
      return bigDeath(world, io, member, spell, 75);
    case 11: // Decorp
    case 28: // Excuun
      return projectile(world, io, member, spell, 255);
    case 12: // Altair
      world.timeNegate = 20;
      return;
    case 13: // Dag Mentar
      return bigDeath(world, io, member, spell, p.intelligence * 2);
    case 14: // Necorp: every monster drops to 5 hit points
      return necorp(world, io, spell);
    case 15: // (nameless)
    case 30: // ZXKUQYB
      return bigDeath(world, io, member, spell, 255);
    case 16: // Pontori: destroys undead (once per fight)
      if (!inCombat || !c || c.monsterShape !== 0x32 || world.spellFlags.pontori) return failed(io);
      world.spellFlags.pontori = true;
      if (world.rng.range(0, 255) < 128) return failed(io);
      return bigDeath(world, io, member, spell, 255);
    case 17: // Appar Unem: open a chest safely
      await flashriek(io, spell, member);
      if ((world.rng.range(0, 255) & 0x03) === 0) return failed(io);
      world.chestTrapsArmed = false;
      return getChest(world, io, member, 'spell');
    case 18: // Sanctu
      return heal(world, io, member, spell, world.rng.range(0, 20) + 10);
    case 22: // Lib Rec: random spot on this dungeon level
      await flashriek(io, spell, member);
      if (world.party.location !== Location.Dungeon) return failed(io);
      return relocateInDungeon(world);
    case 23: {
      // Alcort: cure poison
      io.printMessage(Msg.CureWhom);
      const n = await io.chooseMember();
      if (n === 0) return refund(world, io, member, spell);
      if (n < 1 || n > 4) return failed(io);
      await io.flashMember(n - 1);
      await flashriek(io, spell, n - 1);
      const target = world.member(n - 1);
      if (target.status !== 'P') return failed(io);
      target.status = 'G';
      return;
    }
    case 24: // Sequitu: leave the dungeon
      if (world.party.location !== Location.Dungeon) return failed(io);
      await flashriek(io, spell, member);
      world.dungeon.level = 0;
      world.dungeon.exit = true;
      return;
    case 26: // Sanctu Mani
      return heal(world, io, member, spell, world.rng.range(0, 80) + 20);
    case 27: // Vieda: show the map
      await flashriek(io, spell, member);
      if (world.party.location === Location.Dungeon) await io.showMiniDungeon();
      else await io.showMiniMap();
      return;
    case 29: {
      // Surmandum: resurrect
      if (inCombat) return failed(io);
      io.printMessage(Msg.ResurrectWhom);
      const n = await io.chooseMember();
      if (n === 0) return refund(world, io, member, spell);
      if (n < 1 || n > 4) return failed(io);
      await io.flashMember(n - 1);
      await flashriek(io, spell, n - 1);
      const target = world.member(n - 1);
      if (target.status !== 'D') return failed(io);
      if ((world.rng.range(0, 255) & 0x03) === 0) {
        target.status = 'A';
        return failed(io);
      }
      target.status = 'G';
      return;
    }
    case 31: {
      // Anju Sermani: recall from ashes, at the cost of 5 wisdom
      if (inCombat) return failed(io);
      io.printMessage(Msg.RecallWhom);
      const n = await io.chooseMember();
      if (n === 0) return refund(world, io, member, spell);
      if (n < 1 || n > 4) return failed(io);
      await io.flashMember(n - 1);
      await flashriek(io, spell, n - 1);
      const target = world.member(n - 1);
      if (target.status !== 'A') return failed(io);
      target.status = 'G';
      p.bytes[21] -= 5;
      return;
    }
    case 32: {
      // Terraform: place any tile (or creature) on an adjacent square
      if (inCombat) return failed(io);
      io.printMessage(Msg.Direction);
      const dir = await getDirection(world, io);
      if (!dir) return refund(world, io, member, spell);
      io.print('TypeNum-');
      const value = await inputNumber(io);
      await flashriek(io, spell, member);
      const x = world.constrain(world.x + dir.dx);
      const y = world.constrain(world.y + dir.dy);
      if (value > 12 && value < 31) {
        const slot = world.monsters.freeSlot();
        if (slot >= 0) {
          world.monsters.setType(slot, value * 4);
          world.monsters.setTileUnder(slot, world.getXYVal(x, y));
          world.monsters.setPosition(slot, x, y);
          world.monsters.setHp(slot, 0x40);
          world.monsters.setVariant(slot, 0);
        }
      }
      world.putXYVal(value * 4, x, y);
      io.print('\n');
      return;
    }
    case 33: {
      // Armageddon: every creature on the map becomes a chest
      if (inCombat) return failed(io);
      await flashriek(io, spell, member);
      const m = world.monsters;
      for (let i = 0; i < 32; i++) {
        if (m.type(i) === 0) continue;
        let under = m.tileUnder(i);
        if (under !== 0) under = ((under >> 2) & 0x03) + MapValue.Chest;
        world.putXYVal(under, m.x(i), m.y(i));
        m.clear(i);
      }
      return;
    }
    case 34: {
      // Flotellum: conjure a frigate on the nearest water
      if (inCombat) return failed(io);
      let best = 99;
      let destX = -1;
      let destY = -1;
      for (let ty = -5; ty <= 5; ty++) {
        for (let tx = -5; tx <= 5; tx++) {
          if (tx === 0 && ty === 0) continue;
          if (world.getXYVal(world.x + tx, world.y + ty) !== MapValue.Water) continue;
          const d = Math.abs(tx) + Math.abs(ty);
          if (d < best) {
            best = d;
            destX = world.constrain(world.x + tx);
            destY = world.constrain(world.y + ty);
          }
        }
      }
      if (destX < 0) return failed(io);
      await flashriek(io, spell, member);
      world.putXYVal(MapValue.Frigate, destX, destY);
      return;
    }
    default:
      return;
  }
}

/** Mirrors `Projectile()`: a bolt in a chosen direction that damages the first monster hit. */
async function projectile(world: World, io: GameIO, member: number, spell: number, damage: number): Promise<void> {
  const c = world.combat;
  if (!c) return failed(io);
  io.printMessage(Msg.Direction);
  const dir = await getDirection(world, io);
  if (!dir) return refund(world, io, member, spell);
  await flashriek(io, spell, member);
  const me = c.members[member];
  const hit = await shoot(world, io, me.x, me.y, dir.dx, dir.dy, Shape.MagicBall);
  if (hit < 0) return failed(io);
  io.sound(Sound.Hit);
  await showBall(world, io, c.monsters[hit].x, c.monsters[hit].y, Shape.MagicBall, true);
  damageMonster(world, io, hit, damage, member);
}

/** Mirrors `BigDeath()`: damage every monster, each with a 3 in 4 chance of being struck. */
async function bigDeath(world: World, io: GameIO, member: number, spell: number, damage: number): Promise<void> {
  const c = world.combat;
  if (!c) return failed(io);
  await flashriek(io, spell, member);
  for (let i = 7; i >= 0; i--) {
    if ((world.rng.range(0, 255) & 0x03) === 0) continue;
    const m = c.monsters[i];
    if (m.hp === 0) continue;
    io.sound(Sound.Hit);
    await showBall(world, io, m.x, m.y, Shape.MagicBall, true);
    damageMonster(world, io, i, damage, member);
  }
}

/** Mirrors `Necorp()`. */
async function necorp(world: World, io: GameIO, spell: number): Promise<void> {
  const c = world.combat;
  if (!c) return failed(io);
  await flashriek(io, spell, 0);
  for (let i = 7; i >= 0; i--) {
    const m = c.monsters[i];
    if (m.hp === 0) continue;
    m.hp = 5;
    io.sound(Sound.Hit);
    await showBall(world, io, m.x, m.y, Shape.MagicBall, true);
  }
}

/** Mirrors `Heal()`: ask whom, then heal them. */
async function heal(world: World, io: GameIO, caster: number, spell: number, amount: number): Promise<void> {
  io.printMessage(Msg.HealWhom);
  const n = await io.chooseMember();
  if (n === 0) return refund(world, io, caster, spell);
  if (n < 1 || n > 4) return failed(io);
  await healMember(world, io, spell, amount, n - 1);
}

async function healMember(world: World, io: GameIO, spell: number, amount: number, target: number): Promise<void> {
  world.member(target).addHitPoints(amount);
  await io.flashMember(target);
  await flashriek(io, spell, target);
  io.updateStats();
}

/** Mirrors `RelocateDungeon()`: a random open cell on the current level. */
export function relocateInDungeon(world: World): void {
  let value = -1;
  let xs = 0;
  let ys = 0;
  while (value !== 0) {
    xs = world.rng.range(0, 15);
    ys = world.rng.range(0, 15);
    value = world.getXYDng(xs, ys);
  }
  world.x = xs;
  world.y = ys;
}

/** Mirrors `DownLevel()`. */
async function downLevel(world: World, io: GameIO, spell: number): Promise<void> {
  if (world.party.location !== Location.Dungeon) return failed(io);
  await flashriek(io, spell, 0);
  if (world.dungeon.level > 6) return failed(io);
  world.dungeon.level++;
  relocateInDungeon(world);
}

/** Mirrors `UpLevel()`: from the top level this leaves the dungeon. */
async function upLevel(world: World, io: GameIO, spell: number): Promise<void> {
  if (world.party.location !== Location.Dungeon) return failed(io);
  await flashriek(io, spell, 0);
  world.dungeon.level--;
  if (world.dungeon.level < 0) {
    world.dungeon.level = 0;
    world.dungeon.exit = true;
    return;
  }
  relocateInDungeon(world);
}

/**
 * context.ts
 *
 * What the party is standing on or next to, turned into the commands most
 * likely wanted right now. Controller mode puts these at the top of the
 * command menu so the common case is one button press away: Enter on a
 * town, Board on a horse, Klimb on a ladder, and so on.
 *
 * Pure game logic; nothing here knows how menus are drawn.
 */

import { World, DungeonCell } from './world.ts';
import { Location } from './party.ts';
import { MapValue } from './tiles.ts';
import type { CommandScope, MenuOption } from './io.ts';
import { PartyShape, counterWithMerchant } from './commands.ts';
import { monsterAt } from './combat.ts';
import { quickSpell, spellName, spellCost, healPlan, safeChestCaster, lightPlan, SAFE_CHEST } from './spells.ts';
import type { PlayerRecord } from './player.ts';

/** Fighters, thieves and barbarians have no magic. */
export function hasMagic(world: World, p: PlayerRecord): boolean {
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  return ![0, 3, 5].includes(careers.indexOf(p.classLetter));
}

/** Living members, in marching order. */
function living(world: World): PlayerRecord[] {
  return [0, 1, 2, 3].filter((m) => world.party.memberSlot(m) >= 0 && world.memberAlive(m)).map((m) => world.member(m));
}

/** Is anyone (or the given member) a caster? The first spell of each book costs nothing, so mana is no bar. */
function canCast(world: World, member?: number): boolean {
  const members = member === undefined ? living(world) : [world.member(member)];
  return members.some((p) => hasMagic(world, p));
}

/**
 * How each command stands right now: 'hidden' when it makes no sense here
 * (no chest to get, no craft to board), 'disabled' when it is possible in
 * principle but nothing is on hand for it (no gem to peer through, no
 * torch to light), or 'ok'. Commands not listed are always 'ok'.
 */
export type Availability = 'ok' | 'disabled' | 'hidden';

export function commandAvailability(world: World, scope: CommandScope): Map<string, Availability> {
  const out = new Map<string, Availability>();
  const set = (key: string, ok: boolean, disabledNotHidden = false) => {
    if (!ok) out.set(key, disabledNotHidden ? 'disabled' : 'hidden');
  };

  if (scope === 'combat') {
    const c = world.combat;
    const me = c ? c.activeMember : 0;
    set('C', canCast(world, me), true);
    set('N', world.party.powders > 0, true);
    return out;
  }

  if (scope === 'dungeon') {
    const cell = world.getXYDng(world.x, world.y);
    const open = cell < DungeonCell.Wall;
    set('K', open && (cell & DungeonCell.LadderUp) !== 0);
    set('D', open && (cell & DungeonCell.LadderDown) !== 0);
    set('G', open && (cell & DungeonCell.Chest) !== 0);
    set('I', world.party.torches > 0, true);
    set('P', world.party.gems > 0, true);
    set('N', world.party.powders > 0, true);
    set('C', canCast(world), true);
    set('M', world.party.size > 1);
    return out;
  }

  // The field: surface, Ambrosia, towns and castles.
  const here = world.getXYVal(world.x, world.y);
  const shape = world.party.shape;
  const loc = world.party.location;
  const inTown = world.inTownOrCastle;

  let creature = false;
  let door = false;
  let counter = false;
  const steps: [number, number][] = world.diagonalMoves
    ? [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]
    : [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
  for (const [dx, dy] of steps) {
    const xs = world.constrain(world.x + dx);
    const ys = world.constrain(world.y + dy);
    if (world.monsters.at(xs, ys) >= 0) creature = true;
    if (inTown && dx !== 0 && dy === 0 && world.getXYVal(xs, ys) === MapValue.LetterI) door = true;
    if (inTown) {
      const tile = world.getXYVal(xs, ys);
      const isCounter = tile >= MapValue.Wall2 && tile < MapValue.SnakeBottom;
      if (isCounter && world.getXYVal(xs + dx, ys + dy) === MapValue.Chest) counter = true;
    }
  }

  let entrance = false;
  if (loc === Location.Sosaria) {
    const { locationX, locationY } = world.resources.misc;
    for (let i = 0; i < 32; i++) if (locationX[i] === world.x && locationY[i] === world.y) entrance = true;
  } else if (loc === Location.Ambrosia) {
    entrance = here === MapValue.Shrine;
  }

  set('A', creature);
  set('T', inTown);
  set('E', entrance);
  set('B', shape === PartyShape.OnFoot && (here === MapValue.Horse || here === MapValue.Frigate));
  set('X', shape === PartyShape.Horse || shape === PartyShape.Frigate);
  set('F', shape === PartyShape.Frigate);
  set('G', here >= MapValue.Chest && here <= MapValue.Chest + 3);
  set('U', door);
  if (door) set('U', world.party.keys > 0, true);
  set('S', counter);
  set('Q', loc === Location.Sosaria);
  set(VIEW_MAP_KEY, loc !== Location.Ambrosia); // the map is of Sosaria
  set('M', world.party.size > 1);
  set('C', canCast(world), true);
  set('N', world.party.powders > 0, true);
  set('P', world.party.gems > 0, true);
  return out;
}

/**
 * The controller command menu for a scope: the commands the surroundings
 * call for first, impossible ones left out, and ones with nothing on hand
 * greyed. `template` is the full list with its labels.
 */
export function commandMenu(world: World, scope: CommandScope, template: MenuOption[]): MenuOption[] {
  const availability = commandAvailability(world, scope);
  const shown = template
    .filter((o) => availability.get(o.key) !== 'hidden')
    .map((o) => ({ ...o, disabled: availability.get(o.key) === 'disabled' }));
  if (scope === 'combat' && world.combat) return combatMenu(world, shown);
  // Outside combat, a wounded member a caster can help puts "Cast (Heal)" first (see healPlan).
  const plan = healPlan(world);
  const heal: MenuOption[] = plan ? [{ key: QUICK_CAST_KEY, label: `Cast (${spellName(plan.spell)})` }] : [];
  const menu = prioritise([...heal, ...shown], [...heal.map((o) => o.key), ...suggestedCommands(world, scope)]);
  // On a chest, a caster who can pay for Safe chest puts "Cast (Safe chest)" under Get chest (see safeChestCaster).
  const get = menu.findIndex((o) => o.key === 'G');
  if (get >= 0 && safeChestCaster(world) !== null)
    menu.splice(get + 1, 0, { key: SAFE_CHEST_KEY, label: `Cast (${spellName(SAFE_CHEST)})` });
  // In a dark dungeon, a caster who can light it puts "Cast (Long light)" or "Cast (Light)" under Ignite torch (see lightPlan).
  const light = lightPlan(world);
  if (light) {
    const ignite = menu.findIndex((o) => o.key === 'I');
    menu.splice(ignite + 1, 0, { key: LIGHT_KEY, label: `Cast (${spellName(light.spell)})` });
  }
  return menu;
}

/** Key of the "Cast (Light)" shortcut in the dungeon menu (this port); lights a dark dungeon with the strongest light spell on hand at once. */
export const LIGHT_KEY = '$';

/** Key of "View map" in the field menu (this port): the cloth map of Sosaria over the whole screen. No turn passes. */
export const VIEW_MAP_KEY = '#';

/** Key of the "Cast (Safe chest)" shortcut in the field and dungeon menus (this port); casts it on the chest underfoot at once. */
export const SAFE_CHEST_KEY = '@';

/** The ranged weapons: sling and the bows. A dagger counts only with a spare in the bag, so the last one is never thrown. */
const RANGED = [3, 5, 9, 13];

/** The name of the active member's ranged weapon, or null if what they hold is for melee. */
export function rangedWeaponName(world: World, member: number): string | null {
  const weapon = world.member(member).bytes[48];
  const ranged = RANGED.includes(weapon) || (weapon === 1 && world.party.weapons(1) >= 1);
  return ranged ? world.resources.strings.WeaponsArmour[weapon] : null;
}

/** Key of the "Cast (spell)" shortcut in the combat menu (this port); cast the member's quick spell at once. */
export const QUICK_CAST_KEY = '!';

/**
 * The combat menu for the member whose turn it is (this port). A ranged
 * weapon in hand puts "Attack (Bow)" first, since melee is done by walking
 * into the foe; a caster gets "Cast (spell)", their last spell or a
 * sensible first one, ahead of the plain Cast, first of all when there is
 * no ranged weapon. Attack is suggested for melee only beside a foe.
 */
function combatMenu(world: World, shown: MenuOption[]): MenuOption[] {
  const me = world.combat!.activeMember;
  const ranged = rangedWeaponName(world, me);
  const spell = hasMagic(world, world.member(me)) ? quickSpell(world, me) : null;
  let options = shown.map((o) => (o.key === 'A' && ranged ? { ...o, label: `Attack (${ranged})` } : o));
  if (spell !== null) {
    const quick: MenuOption = {
      key: QUICK_CAST_KEY,
      label: `Cast (${spellName(spell)})`,
      disabled: spellCost(spell) > world.member(me).mana,
    };
    options = [quick, ...options];
  }
  const casting = spell !== null ? [QUICK_CAST_KEY, 'C'] : [];
  const first = ranged ? ['A', ...casting] : [...casting, ...combatSuggestions(world)];
  return prioritise(options, first);
}

/** The four orthogonal steps. */
const STEPS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Command letters that fit the party's surroundings, most useful first. */
export function suggestedCommands(world: World, scope: CommandScope): string[] {
  switch (scope) {
    case 'combat':
      return combatSuggestions(world);
    case 'dungeon':
      return dungeonSuggestions(world);
    default:
      return fieldSuggestions(world);
  }
}

function fieldSuggestions(world: World): string[] {
  const out: string[] = [];
  const here = world.getXYVal(world.x, world.y);
  const shape = world.party.shape;
  const loc = world.party.location;

  if (loc === Location.Sosaria || loc === Location.Ambrosia) {
    if (here === MapValue.Town || here === MapValue.Castle || here === MapValue.Dungeon || here === MapValue.Shrine) out.push('E');
  }
  if (shape === PartyShape.OnFoot && (here === MapValue.Horse || here === MapValue.Frigate)) out.push('B');
  if (shape === PartyShape.Horse || shape === PartyShape.Frigate) out.push('X');
  // A chest left by a monster carries the terrain it stood on in its low bits.
  if (here >= MapValue.Chest && here <= MapValue.Chest + 3) out.unshift('G');

  // Things one step away.
  let person = false;
  let door = false;
  let monster = false;
  for (const [dx, dy] of STEPS) {
    const xs = world.constrain(world.x + dx);
    const ys = world.constrain(world.y + dy);
    const mon = world.monsters.at(xs, ys);
    if (world.inTownOrCastle) {
      if (mon >= 0 || counterWithMerchant(world, xs, ys, dx, dy)) person = true;
      if (dx !== 0 && world.getXYVal(xs, ys) === MapValue.LetterI) door = true;
    } else if (mon >= 0) {
      monster = true;
    }
  }
  if (monster) out.push('A');
  if (monster && shape === PartyShape.Frigate) out.push('F');
  if (person) out.push('T');
  if (door) out.push('U');
  return out;
}

function dungeonSuggestions(world: World): string[] {
  const out: string[] = [];
  const cell = world.getXYDng(world.x, world.y);
  if (cell < DungeonCell.Wall) {
    if (cell & DungeonCell.LadderUp) out.push('K');
    if (cell & DungeonCell.LadderDown) out.push('D');
    if (cell & DungeonCell.Chest) out.push('G');
  }
  if (world.dungeon.torch === 0 && world.party.torches > 0) out.push('I');
  return out;
}

function combatSuggestions(world: World): string[] {
  const c = world.combat;
  if (!c) return [];
  const me = c.members[c.activeMember];
  const diagonals = world.diagonalMoves;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (!diagonals && dx !== 0 && dy !== 0) continue;
      if (monsterAt(c, me.x + dx, me.y + dy) >= 0) return ['A'];
    }
  }
  return [];
}

/** Reorder menu options so the suggested keys come first, in suggestion order. */
export function prioritise<T extends { key: string }>(options: T[], suggested: string[]): T[] {
  const first = suggested.map((k) => options.find((o) => o.key === k)).filter((o): o is T => o !== undefined);
  return [...first, ...options.filter((o) => !first.includes(o))];
}

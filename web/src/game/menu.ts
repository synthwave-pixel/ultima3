/**
 * menu.ts
 *
 * The title screen and party organisation: a port of `MainMenu()`,
 * `Organize()`, `CreateChar()`, `FormParty()`, `DisperseParty()` and
 * `KillChar()` from UltimaMain.c.
 *
 * The Apple II typed everything at prompts (entry numbers 1-20, attribute
 * values) and the Macintosh used dialogs. This port uses menus drawn on the
 * title screen in both input modes: the roster is a list to pick from, the
 * party is a multi-select list, and attributes are shared out on a screen
 * where left and right adjust each value. The records written are exactly
 * what the Apple II wrote.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { PlayerOffset, PlayerRecord, ROSTER_SIZE } from './player.ts';
import { Music, type GameIO, type MenuOption } from './io.ts';
import { randomName } from './names.ts';
import { emptyJournal } from './journal.ts';
import { statLimit } from './interact.ts';
import { type Appearance, defaultLook, FIGURES, HAIR, HUE_NAMES, randomAppearance, SKIN_NAMES } from './appearance.ts';
import { gearName } from './cards.ts';

/** 1-based indices into the MoreMessages table. */
const MM = {
  NotFormed: 2,
  FormTheParty: 4,
  Formed: 12,
  DisperseTheParty: 13,
  NoOneThere: 14,
  Dispersed: 15,
  Create: 16,
  Created: 21,
  Terminate: 22,
  Terminated: 25,
  Copyright: 26,
  FromTheDepths: 27,
  HeComes: 28,
  OrganizeAParty: 30,
  JourneyOnwardOption: 31,
  Options: 32,
  PartyOrganization: 33,
  CreateACharacter: 35,
  FormThePartyOption: 36,
  DisperseThePartyOption: 37,
  TerminateACharacter: 38,
  MainMenu: 39,
} as const;

/** Where the menus sit on the title screen (rows below the picture). */
const MENU_ROW = 13;

function mm(world: World, n: number): string {
  // The bitmap font only has ASCII; the copyright sign becomes "(C)".
  return (world.resources.strings.MoreMessages[n - 1] ?? '').replace(/©/g, '(C)');
}

/** Wait for any key. */
async function anyKey(io: GameIO): Promise<void> {
  await io.waitKey();
}

/** Show a line near the bottom of the title screen and wait for a key. */
async function notice(io: GameIO, text: string): Promise<void> {
  io.centreText(21, text);
  await anyKey(io);
}

/**
 * Mirrors `MainMenu()`. `play` runs the game; it returns when the player
 * quits. The menu then shows again until the page is closed.
 */
/** Export and import of the game as text through the clipboard (this port). */
export interface Transfer {
  /** The game as text, or null when there is nothing to export. */
  export(): string | null;
  /** Replace the saved game with the text; null when it worked, else a short reason. */
  import(text: string): string | null;
  clipboard: { write(text: string): Promise<void>; read(): Promise<string> };
  /** A file downloaded, and a file picked; load resolves to '' when the picker is cancelled. */
  file: { save(text: string): Promise<void>; load(): Promise<string> };
}

/** A new version of the app, downloaded and waiting (the installed app). */
export interface Update {
  ready(): boolean;
  /** The web version's switches to it (the page reloads); an app's opens the new release's page. */
  apply(): void;
  /** The title menu's line for it: "Update: restart" unless said otherwise (an app's "Update (1.0.45)"). */
  label?(): string;
  /** An app's newer release, said once a version in a box of its own before the title's menu (updateBox). */
  news?: UpdateNews;
}

/** A newer release to be told of once: its version, whether it is still to be told of, and that it now has been. */
export interface UpdateNews {
  version: string;
  due(): boolean;
  told(): void;
}

/** The attract sequence (ui/attract.ts): the opening and demo before the title, and the demo again from its menu. */
export interface Attract {
  run(): Promise<void>;
  demo(): Promise<void>;
}

export interface MenuOptions {
  /** Called after the roster or party changes in the Organize menu, so it can be saved. */
  save?: (world: World) => void;
  transfer?: Transfer;
  update?: Update;
  attract?: Attract;
  /**
   * Leave the game, where it runs as an app that can (the desktop app, where
   * Steam's Game Mode gives a window no close button). A browser tab has
   * none: the browser closes tabs.
   */
  quit?: () => void;
}

/** The last row the title menu's window may use: the copyright is on the row below. */
export const TITLE_MENU_LAST_ROW = 21;
/** The first row the title menu's window may use: the tagline is on the two above. */
export const TITLE_MENU_FIRST_ROW = 13;

export async function mainMenu(world: World, io: GameIO, play: () => Promise<void>, options: MenuOptions = {}): Promise<void> {
  await options.attract?.run();
  for (;;) {
    io.fadeMusic(Music.Sosaria); // the title's, whatever it comes back from: the demo, or the game
    const news = options.update?.news;
    if (options.update && news?.due()) {
      await updateBox(world, io, options.update, news);
      continue;
    }
    io.showTitle();
    io.clearBottom();
    io.centreText(11, mm(world, MM.FromTheDepths));
    io.centreText(12, mm(world, MM.HeComes));

    const entries = [
      { key: 'J', label: mm(world, MM.JourneyOnwardOption) },
      { key: 'O', label: mm(world, MM.OrganizeAParty) },
    ];
    if (options.transfer) {
      if (world.party.formed) entries.push({ key: 'E', label: 'Export game' });
      entries.push({ key: 'I', label: 'Import game' });
    }
    if (options.update?.ready()) entries.push({ key: 'U', label: options.update.label?.() ?? 'Update: restart' });
    if (options.attract) entries.push({ key: 'R', label: 'Return to the view' });
    entries.push({ key: 'S', label: 'Settings' });
    if (options.quit) entries.push({ key: 'Q', label: 'Quit' });
    // The window starts on row 15, or higher for a longer list (Quit in the app, an update waiting), so that its
    // bottom border stays above the copyright on row 22. The rows under the tagline are free to take. The longest list,
    // eight lines (the app with an update waiting), has no room for both: the window takes the copyright's row.
    const row = Math.max(TITLE_MENU_FIRST_ROW, Math.min(15, TITLE_MENU_LAST_ROW - entries.length - 1));
    if (row + entries.length + 1 <= TITLE_MENU_LAST_ROW) io.centreText(22, mm(world, MM.Copyright));
    const key = await io.chooseFromList(entries, { row, title: mm(world, MM.Options) });
    if (key === 'Q' && options.quit) {
      options.quit(); // the app goes; should it not, the menu is still here
    } else if (key === 'S') {
      await io.showSettings();
    } else if (key === 'E' && options.transfer) {
      await exportGameTo(io, options.transfer);
    } else if (key === 'I' && options.transfer) {
      await importGameFrom(io, options.transfer);
    } else if (key === 'U') {
      options.update?.apply();
    } else if (key === 'R') {
      await options.attract?.demo();
    } else if (key === 'J') {
      if (!world.party.formed) {
        await notice(io, mm(world, MM.NotFormed));
        continue;
      }
      if (world.party.rulesPending && !(await chooseRules(world, io))) continue;
      await play();
    } else if (key === 'O') {
      await organize(world, io);
      options.save?.(world);
    }
  }
}

/**
 * An app's newer release, told of once a version before the title's menu (as the Ultima V port does): what it is, and
 * its page, to read what changed and download it there, or Later, which leaves it on the menu's Update line.
 */
async function updateBox(world: World, io: GameIO, update: Update, news: UpdateNews): Promise<void> {
  news.told();
  // A key pressed before the box came (the boot screen skipped with it) is let go: none may answer it unseen.
  io.flushKeys();
  io.showTitle();
  io.clearBottom();
  io.centreText(11, `Ultima III ${news.version} is out`);
  io.centreText(12, 'Your saved game carries over');
  io.centreText(22, mm(world, MM.Copyright));
  const key = await io.chooseFromList(
    [
      { key: 'O', label: 'Open release page', hint: 'What is new, and the download' },
      { key: 'L', label: 'Later', hint: 'Update stays in the title menu' },
    ],
    { row: 15, title: 'Update available' },
  );
  if (key === 'O') update.apply();
}

/** Export: the game as text, to the clipboard or a file. */
async function exportGameTo(io: GameIO, t: Transfer): Promise<void> {
  const text = t.export();
  if (!text) return notice(io, 'Nothing to export');
  const where = await io.chooseFromList(
    [
      { key: 'C', label: 'To the clipboard' },
      { key: 'F', label: 'To a file' },
    ],
    { row: 15, title: 'Export' },
  );
  if (where === 'C') {
    try {
      await t.clipboard.write(text);
      await notice(io, 'Game copied to the clipboard');
    } catch {
      await notice(io, 'The clipboard is not available here');
    }
  } else if (where === 'F') {
    try {
      await t.file.save(text);
      await notice(io, 'Game saved as a file');
    } catch {
      await notice(io, 'Could not save a file here');
    }
  }
}

/** Import: text from the clipboard or a file replaces the saved game, after a word of warning. */
async function importGameFrom(io: GameIO, t: Transfer): Promise<void> {
  const from = await io.chooseFromList(
    [
      { key: 'C', label: 'From the clipboard' },
      { key: 'F', label: 'From a file' },
    ],
    { row: 15, title: 'Import' },
  );
  let text: string;
  if (from === 'C') {
    try {
      text = (await t.clipboard.read()).trim();
    } catch {
      return notice(io, 'The clipboard cannot be read here');
    }
    if (!text) return notice(io, 'The clipboard is empty');
  } else if (from === 'F') {
    try {
      text = (await t.file.load()).trim();
    } catch {
      return notice(io, 'Could not read the file');
    }
    if (!text) return; // cancelled
  } else return;
  const answer = await io.chooseFromList(
    [
      { key: 'Y', label: 'Replace the saved game' },
      { key: 'N', label: 'Keep the saved game' },
    ],
    { row: 15, title: 'Import?' },
  );
  if (answer !== 'Y') return;
  const reason = t.import(text);
  await notice(io, reason ? `Not imported: ${reason}` : 'Game imported');
}

/**
 * A new game's first question (this port), asked when a party is formed
 * and again at Journey onward while unanswered. Modern sets the gentler
 * rules: poison stopping at one hit point, starvation at half, experience
 * shared, the turn timer slow. Classic sets the Apple II's: poison and
 * starvation to the death, the killer taking all the experience, the
 * timer fast. Story is Modern with no starvation and no timer. All can be
 * changed later in Settings. Returns false if the player backs out.
 */
export async function chooseRules(world: World, io: GameIO): Promise<boolean> {
  const key = await io.chooseFromList(
    [
      { key: 'M', label: 'Modern (Recommended)' },
      { key: 'C', label: 'Classic (Hardcore)' },
      { key: 'S', label: 'Story (Relaxed)' },
    ],
    { row: 15, title: 'Choose Thine Adventure!' }, // where the Options box sits, clear of the verse
  );
  if (key !== 'M' && key !== 'C' && key !== 'S') return false;
  world.poisonKills = key === 'C';
  world.starvation = key === 'C' ? 'classic' : key === 'M' ? 'mild' : 'none';
  world.balancedXp = key !== 'C';
  world.timer = key === 'C' ? 'fast' : key === 'M' ? 'slow' : 'off';
  world.onRulesChange?.();
  world.party.rulesPending = false;
  return true;
}

/** Mirrors `Organize()`. */
export async function organize(world: World, io: GameIO): Promise<void> {
  let cursor = 0;
  for (;;) {
    io.showTitle();
    io.clearBottom();
    io.centreText(11, mm(world, MM.PartyOrganization));
    const options: MenuOption[] = [
      { key: 'C', label: mm(world, MM.CreateACharacter) },
      { key: 'I', label: 'Inspect party' },
      { key: 'F', label: mm(world, MM.FormThePartyOption) },
      { key: 'D', label: mm(world, MM.DisperseThePartyOption) },
      { key: 'N', label: 'Clear notes' },
      { key: 'T', label: mm(world, MM.TerminateACharacter) },
      { key: 'M', label: mm(world, MM.MainMenu) },
    ];
    const key = await io.chooseFromList(options, { row: MENU_ROW, title: mm(world, MM.Options), cursor });
    cursor = Math.max(
      0,
      options.findIndex((o) => o.key === key),
    );
    switch (key || 'M') {
      case 'C':
        await createCharacter(world, io);
        break;
      case 'I':
        await inspectParty(world, io);
        break;
      case 'F':
        await formParty(world, io);
        break;
      case 'D':
        await disperseParty(world, io);
        break;
      case 'N':
        await clearNotes(world, io);
        break;
      case 'T':
        await terminateCharacter(world, io);
        break;
      default:
        return;
    }
  }
}

// ---------------------------------------------------------------------------
// The roster as a list
// ---------------------------------------------------------------------------

/** One roster entry as a menu line: "12. Tatiana       Fighter    #1" (the mark is optional). Fits a 32-column window. */
function rosterLabel(world: World, slot: number, mark = ''): string {
  const p = world.roster.get(slot);
  const number = `${slot + 1}.`.padStart(3);
  if (!p.exists) return `${number} (empty)`;
  const classes = world.resources.strings.Classes;
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const className = classes[careers.indexOf(p.classLetter)] ?? '?';
  return `${number} ${p.name.padEnd(13)} ${className.padEnd(11)}${mark}`;
}

/** The roster entries matching `include`, as menu options keyed by entry number. */
function rosterOptions(world: World, include: (p: PlayerRecord) => boolean, mark?: (slot: number) => string): MenuOption[] {
  const out: MenuOption[] = [];
  for (let slot = 0; slot < ROSTER_SIZE; slot++) {
    if (!include(world.roster.get(slot))) continue;
    out.push({ key: String(slot + 1), label: rosterLabel(world, slot, mark?.(slot)) });
  }
  return out;
}

/** Ask the player to pick a roster entry. Returns the 0-based slot or -1. */
async function pickEntry(world: World, io: GameIO, title: string, include: (p: PlayerRecord) => boolean, none: string): Promise<number> {
  const options = rosterOptions(world, include);
  if (options.length === 0) {
    await notice(io, none);
    return -1;
  }
  const key = await io.chooseFromList(options, { row: MENU_ROW, title });
  return key ? Number(key) - 1 : -1;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** A race's limits on strength, dexterity, intelligence and wisdom, for its line in the Race list: the shrines' own. */
export function raceHint(race: number): string {
  const [str, dex, int, wis] = [0, 1, 2, 3].map((stat) => statLimit(race, stat));
  return `Max STR ${str} DEX ${dex} INT ${int} WIS ${wis}`;
}

/** A one-line description of what a class can do, from the game's own tables. */
function classHint(world: World, classIndex: number): string {
  const wa = world.resources.strings.WeaponsArmour;
  const weaponMax = world.resources.misc.weaponUseTable[classIndex] - 'A'.charCodeAt(0) - 1; // highest weapon number
  const armourMax = world.resources.misc.armourUseTable[classIndex] - 'A'.charCodeAt(0) - 1; // highest armour number
  const weapons = weaponMax >= 15 ? 'any weapon' : `to ${wa[weaponMax].toLowerCase()}`;
  const armour = armourMax >= 7 ? 'any armour' : `to ${wa[16 + armourMax].toLowerCase()}`;
  const cleric = [1, 4, 7, 8, 10].includes(classIndex);
  const wizard = [2, 6, 9, 8, 10].includes(classIndex);
  const magic = cleric && wizard ? 'both magics, ' : cleric ? 'cleric magic, ' : wizard ? 'wizard magic, ' : '';
  const thief = classIndex === 3 ? 'steals, ' : '';
  return `${magic}${thief}${weapons}, ${armour}`;
}

/** The character creation screen. Writes the same record the Apple II `CreateChar()` wrote. */
export async function createCharacter(world: World, io: GameIO): Promise<void> {
  io.clearBottom();
  io.centreText(11, mm(world, MM.Create));
  const slot = await pickEntry(world, io, 'Which entry?', (p) => !p.exists, 'The roster is full.');
  if (slot < 0) return;
  const p = world.roster.get(slot);

  const races = world.resources.strings.Races;
  const classes = world.resources.strings.Classes;
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const taken: string[] = [];
  for (let i = 0; i < ROSTER_SIZE; i++) if (world.roster.get(i).exists) taken.push(world.roster.get(i).name);

  // The line at the top of the screen grows as choices are made.
  const summary: string[] = [];
  const header = () => {
    io.clearBottom();
    io.centreText(11, `Entry ${slot + 1}: ${summary.join('  ')}`.trim());
  };

  // Name: typed, or one from the stock list.
  let name: string;
  let suggestion = randomName(() => world.rng.range(0, 255) / 256, taken);
  let cursor = 0;
  for (;;) {
    header();
    const key = await io.chooseFromList(
      [
        { key: 'T', label: 'Type a name' },
        { key: 'U', label: `Use "${suggestion}"` },
        { key: 'A', label: 'Another random name' },
      ],
      { row: MENU_ROW, title: 'Name', cursor },
    );
    cursor = 2; // after "Another", stay on it
    if (!key) return;
    if (key === 'A') {
      suggestion = randomName(() => world.rng.range(0, 255) / 256, [...taken, suggestion]);
      continue;
    }
    if (key === 'U') {
      name = suggestion;
      break;
    }
    io.textAt(13, MENU_ROW + 1, 'Name:');
    name = (await io.inputTextAt(19, MENU_ROW + 1, 13, false)).trim();
    if (name) break;
  }
  summary.push(name);

  header();
  const sex = await io.chooseFromList(
    [
      { key: 'M', label: 'Male' },
      { key: 'F', label: 'Female' },
      { key: 'O', label: 'Other' },
    ],
    { row: MENU_ROW, title: 'Sex' },
  );
  if (!sex) return;
  summary.push({ M: 'Male', F: 'Female', O: 'Other' }[sex]!);

  header();
  const raceKey = await io.chooseFromList(
    races.map((r, i) => ({ key: r[0], label: r, hint: raceHint(i) })),
    { row: MENU_ROW, title: 'Race' },
  );
  if (!raceKey) return;
  const race = races.findIndex((r) => r[0] === raceKey);
  summary.push(races[race]);

  header();
  const classKey = await io.chooseFromList(
    classes.map((c, i) => ({ key: careers[i], label: c, hint: classHint(world, i) })),
    { row: MENU_ROW, title: 'Type' },
  );
  if (!classKey) return;
  const career = careers.indexOf(classKey);
  summary.push(classes[career]);

  // Four attributes, 5..25 each, all 50 points spent.
  header();
  const values = await io.allocatePoints(['Strength', 'Dexterity', 'Intelligence', 'Wisdom'], 50, 5, 25, {
    row: MENU_ROW,
    title: '50 points',
  });
  if (!values) return;

  // Their look, with the Remastered tiles (appearance.ts): from their class's, on a sheet of its own.
  let look: Appearance | null = null;
  if (io.customisable()) {
    const sheet: Sheet = {
      name,
      classLetter: careers[career],
      sex,
      lines: [
        `${races[race]} ${classes[career]}`,
        SEX_NAMES[sex] ?? '',
        `STR ${pad2(values[0])}  DEX ${pad2(values[1])}`,
        `INT ${pad2(values[2])}  WIS ${pad2(values[3])}`,
      ],
    };
    look = await chooseLook(world, io, sheet, defaultLook(careers[career]), 'Appearance');
    io.showTitle();
    if (!look) return;
  }

  header();
  io.centreText(MENU_ROW - 1, `STR ${values[0]}  DEX ${values[1]}  INT ${values[2]}  WIS ${values[3]}`);
  const ok = await io.chooseFromList(
    [
      { key: 'Y', label: 'Create this character' },
      { key: 'N', label: 'Cancel' },
    ],
    { row: MENU_ROW + 1, title: 'O.K.?' },
  );
  if (ok !== 'Y') return;

  p.bytes.fill(0);
  p.name = name;
  p.bytes[24] = sex.charCodeAt(0);
  p.bytes[22] = races[race].charCodeAt(0);
  p.bytes[23] = careers.charCodeAt(career);
  p.bytes[18] = values[0];
  p.bytes[19] = values[1];
  p.bytes[20] = values[2];
  p.bytes[21] = values[3];
  p.status = 'G';
  p.bytes[27] = 100; // hit points
  p.bytes[29] = 100; // max hit points
  p.bytes[32] = 1; // food 150
  p.bytes[33] = 50;
  p.bytes[36] = 150; // gold
  p.bytes[41] = 1; // cloth
  p.bytes[40] = 1; //   worn
  p.bytes[49] = 1; // dagger
  p.bytes[48] = 1; //   readied
  world.looks[slot] = look;
  await notice(io, mm(world, MM.Created));
}

// ---------------------------------------------------------------------------
// Inspect: a character's sheet, and their look
// ---------------------------------------------------------------------------

const SEX_NAMES: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** What a character's sheet shows: who, and the lines beside their figure (at most SHEET_WIDTH letters each). */
interface Sheet {
  name: string;
  classLetter: string;
  sex: string;
  lines: string[];
}

/** The sheet's figure: its top left cell and its size in cells; the lines to the right of it. */
const FIGURE_AT = { x: 3, y: 3, cells: 8 };
const LINES_AT = { x: 13, y: 3 };
const SHEET_WIDTH = 25;
/** Where the look's rows go, under the figure and the lines (at most ten of them). */
const LOOK_ROW = 13;

/** Draw `sheet`: the plain border, the name across the top, the figure in `look`, the lines beside it. */
function drawSheet(io: GameIO, sheet: Sheet, look: Appearance | null): void {
  io.showSheet();
  io.centreText(1, sheet.name);
  io.drawCharacter(sheet.classLetter, sheet.sex, look, FIGURE_AT.x, FIGURE_AT.y, FIGURE_AT.cells);
  sheet.lines.forEach((line, i) => io.textAt(LINES_AT.x, LINES_AT.y + i, line.slice(0, SHEET_WIDTH)));
}

/**
 * Choose a look for the character on `sheet`, from `start` (appearance.ts): a row each for the figure, the skin, the
 * hair, the clothes and the trim, left and right stepping through them, the figure drawn afresh at each step, and
 * Surprise me. The look chosen, or null if cancelled.
 */
async function chooseLook(
  world: World,
  io: GameIO,
  sheet: Sheet,
  start: Appearance,
  title: string,
  rename?: (look: Appearance) => Promise<void>,
): Promise<Appearance | null> {
  drawSheet(io, sheet, start);
  const asLook = (v: number[]): Appearance => ({ figure: v[0], skin: v[1], hair: v[2], main: v[3], trim: v[4] });
  const values = await io.adjustRows(
    [
      { label: 'Figure', values: FIGURES.map((f) => f.name) },
      { label: 'Skin', values: [...SKIN_NAMES] },
      { label: 'Hair', values: HAIR.map((h) => h.name) },
      { label: 'Clothes', values: [...HUE_NAMES] },
      { label: 'Trim', values: [...HUE_NAMES] },
    ],
    [start.figure, start.skin, start.hair, start.main, start.trim],
    { row: LOOK_ROW, title },
    (v) => io.drawCharacter(sheet.classLetter, sheet.sex, asLook(v), FIGURE_AT.x, FIGURE_AT.y, FIGURE_AT.cells),
    () => {
      const a = randomAppearance((lo, hi) => world.rng.range(lo, hi));
      return [a.figure, a.skin, a.hair, a.main, a.trim];
    },
    rename ? [{ label: 'Rename', act: (v) => rename(asLook(v)) }] : [],
  );
  return values ? asLook(values) : null;
}

/** The marks and cards a character bears, as their sheet names them. */
const MARKS: [number, string][] = [
  [0x10, 'Force'],
  [0x20, 'Fire'],
  [0x40, 'Snake'],
  [0x80, 'Kings'],
];
const CARDS: [number, string][] = [
  [0x08, 'Death'],
  [0x02, 'Sol'],
  [0x01, 'Love'],
  [0x04, 'Moons'],
];

/** Roster entry `slot`'s sheet: who they are, what they can do, what they carry and bear. */
function sheetOf(world: World, slot: number): Sheet {
  const p = world.roster.get(slot);
  const careers = String.fromCharCode(...world.resources.misc.careerTable);
  const career = world.resources.strings.Classes[Math.max(0, careers.indexOf(p.classLetter))] ?? '';
  const race = world.resources.strings.Races.find((r) => r[0] === p.race) ?? '';
  const borne = (table: [number, string][]) => table.filter(([bit]) => p.marks & bit).map(([, name]) => name);
  const lines = [
    `${race} ${career}`,
    `${SEX_NAMES[p.sex] ?? ''}, level ${p.level}`,
    `STR ${pad2(p.strength)}  DEX ${pad2(p.dexterity)}`,
    `INT ${pad2(p.intelligence)}  WIS ${pad2(p.wisdom)}`,
    `HP ${p.hitPoints}/${p.maxHitPoints}`,
    `MP ${p.mana}  EXP ${p.experience}`,
    `Weapon: ${gearName(world, true, p.bytes[PlayerOffset.WeaponReadied])}`,
    `Armour: ${gearName(world, false, p.bytes[PlayerOffset.ArmourWorn])}`,
  ];
  const marks = borne(MARKS);
  const cards = borne(CARDS);
  if (marks.length) lines.push(`Marks: ${marks.join(' ')}`);
  if (cards.length) lines.push(`Cards: ${cards.join(' ')}`);
  return { name: p.name, classLetter: p.classLetter, sex: p.sex, lines };
}

/**
 * Inspect party (this port's): the party, in marching order - or with no party formed, the whole roster - and for
 * the one picked their sheet; with the Remastered tiles, their look to change there too.
 */
export async function inspectParty(world: World, io: GameIO): Promise<void> {
  let cursor = 0;
  for (;;) {
    io.showTitle();
    io.clearBottom();
    io.centreText(11, 'Inspect party');
    const slots = world.party.formed
      ? [0, 1, 2, 3].map((m) => world.party.memberSlot(m)).filter((slot) => slot >= 0)
      : [...Array(ROSTER_SIZE).keys()].filter((slot) => world.roster.get(slot).exists);
    if (slots.length === 0) {
      await notice(io, 'The roster is empty.');
      return;
    }
    const options = slots.map((slot) => ({ key: String(slot + 1), label: rosterLabel(world, slot) }));
    const key = await io.chooseFromList(options, { row: MENU_ROW, title: world.party.formed ? 'Whom?' : 'Whom? (no party)', cursor });
    if (!key) return;
    const slot = Number(key) - 1;
    cursor = Math.max(0, slots.indexOf(slot));
    await characterSheet(world, io, slot);
  }
}

/**
 * Roster entry `slot`'s sheet, and what can be done there: with the Remastered tiles their look changed, and their
 * name - for one the player would write otherwise (in capitals, say, which the modern sets keep as typed) - from the
 * look's rows; in any other set the name alone, from a menu of its own.
 */
async function characterSheet(world: World, io: GameIO, slot: number): Promise<void> {
  const p = world.roster.get(slot);
  /** Ask for a new name under the sheet, drawn in `look`; the sheet drawn again with it. */
  const rename = async (look: Appearance | null, sheet: Sheet): Promise<void> => {
    drawSheet(io, sheet, look);
    io.textAt(LINES_AT.x - 6, LOOK_ROW + 1, 'New name:');
    const name = (await io.inputTextAt(LINES_AT.x + 4, LOOK_ROW + 1, 13, false)).trim();
    if (name) p.name = name;
    Object.assign(sheet, sheetOf(world, slot));
    drawSheet(io, sheet, look);
  };
  if (io.customisable()) {
    const sheet = sheetOf(world, slot);
    const look = await chooseLook(world, io, sheet, world.looks[slot] ?? defaultLook(p.classLetter), 'Appearance', (l) => rename(l, sheet));
    if (look) world.looks[slot] = look;
    return;
  }
  for (;;) {
    const sheet = sheetOf(world, slot);
    drawSheet(io, sheet, null);
    const key = await io.chooseFromList(
      [
        { key: 'R', label: 'Rename' },
        { key: 'B', label: 'Back' },
      ],
      { row: LOOK_ROW, title: sheet.name },
    );
    if (key !== 'R') return;
    await rename(null, sheet);
  }
}

// ---------------------------------------------------------------------------
// Form, disperse, terminate
// ---------------------------------------------------------------------------

/**
 * Mirrors the Apple II `FormParty()`: choose up to four roster entries, in
 * marching order, from a list. Picking a chosen entry again removes it.
 */
export async function formParty(world: World, io: GameIO): Promise<void> {
  io.clearBottom();
  io.centreText(11, mm(world, MM.FormTheParty));
  if (world.party.formed) {
    const answer = await io.chooseFromList(
      [
        { key: 'Y', label: 'Disperse it and form a new one' },
        { key: 'N', label: 'Keep the current party' },
      ],
      { row: MENU_ROW, title: 'A party is already formed' },
    );
    if (answer !== 'Y') return;
    disperse(world);
  }

  const chosen: number[] = [];
  let cursor = 0;
  for (;;) {
    io.clearBottom();
    io.centreText(11, mm(world, MM.FormTheParty));
    const order = (slot: number) => {
      const i = chosen.indexOf(slot);
      return i < 0 ? '' : ` #${i + 1}`;
    };
    const options = rosterOptions(world, (p) => p.exists && !p.inParty, order);
    if (options.length === 0) {
      await notice(io, 'No characters to choose from.');
      return;
    }
    options.push({ key: 'D', label: chosen.length ? `Done (${chosen.length} chosen)` : 'Cancel' });
    const key = await io.chooseFromList(options, { row: MENU_ROW, title: 'Choose up to four', cursor });
    if (!key) return;
    if (key === 'D') {
      if (chosen.length === 0) return;
      break;
    }
    const slot = Number(key) - 1;
    cursor = options.findIndex((o) => o.key === key);
    const at = chosen.indexOf(slot);
    if (at >= 0) chosen.splice(at, 1);
    else if (chosen.length < 4) chosen.push(slot);
  }

  world.party.bytes.fill(0);
  world.party.size = chosen.length;
  chosen.forEach((slot, i) => {
    world.party.setMemberRosterNumber(i, slot + 1);
    world.roster.get(slot).inParty = true;
  });
  world.poolPurses();
  world.poolGear();
  world.poolSupplies();
  world.party.rulesPending = true; // asked now, and again at Journey onward if backed out of here
  world.party.location = Location.Sosaria;
  world.party.shape = 0x7e;
  world.party.bytes[5] = 0xff;
  world.party.surfaceX = 42;
  world.party.surfaceY = 20;
  world.x = world.returnX = 42;
  world.y = world.returnY = 20;
  world.resetSosaria();
  world.moonPhase = [4, 4];
  world.moonTimer = [12, 4];
  await notice(io, mm(world, MM.Formed));
  await chooseRules(world, io);
}

/** Give the members their share of the pool, free every roster entry and clear the party record. */
function disperse(world: World): void {
  world.splitPool();
  world.splitGear();
  world.splitSupplies();
  for (let i = 0; i < ROSTER_SIZE; i++) world.roster.get(i).inParty = false;
  world.party.bytes.fill(0);
}

/** Mirrors `DisperseParty()`. */
export async function disperseParty(world: World, io: GameIO): Promise<void> {
  io.clearBottom();
  io.centreText(11, mm(world, MM.DisperseTheParty));
  if (!world.party.formed) {
    for (let i = 0; i < ROSTER_SIZE; i++) world.roster.get(i).inParty = false;
    await notice(io, mm(world, MM.NoOneThere));
    return;
  }
  const answer = await io.chooseFromList(
    [
      { key: 'Y', label: 'Yes, disperse the party' },
      { key: 'N', label: 'No' },
    ],
    { row: MENU_ROW, title: 'Disperse the party?' },
  );
  if (answer !== 'Y') return;
  disperse(world);
  await notice(io, mm(world, MM.Dispersed));
}

/**
 * Clear notes (this port): forget what the party has seen and learnt - the maps, the journal, the moongates come
 * out of - after asking, No first (it cannot be undone) and the Yes saying what goes. Forming a party keeps them, so members may come and go in one adventure; this
 * starts a new one's. The Organize menu's caller saves the game after.
 */
export async function clearNotes(world: World, io: GameIO): Promise<void> {
  io.clearBottom();
  io.centreText(11, 'CLEAR NOTES');
  const answer = await io.chooseFromList(
    [
      { key: 'N', label: 'No, keep them' },
      { key: 'Y', label: 'Yes, clear map, journal, moongates' },
    ],
    { row: MENU_ROW, title: 'Clear notes?' },
  );
  if (answer !== 'Y') return;
  world.autoMap.clear();
  world.journal = emptyJournal();
  world.gatesKnown = [];
  await notice(io, '(Notes cleared!)');
}

/** Mirrors `KillChar()`: erase a roster entry that is not in a party, after confirming. */
export async function terminateCharacter(world: World, io: GameIO): Promise<void> {
  io.clearBottom();
  io.centreText(11, mm(world, MM.Terminate));
  const slot = await pickEntry(
    world,
    io,
    'Terminate whom?',
    (p) => p.exists && !p.inParty,
    'No one can be terminated (a party member must be dispersed first).',
  );
  if (slot < 0) return;
  const p = world.roster.get(slot);
  io.clearBottom();
  io.centreText(11, mm(world, MM.Terminate));
  const answer = await io.chooseFromList(
    [
      { key: 'N', label: 'No, keep them' },
      { key: 'Y', label: `Yes, terminate ${p.name}` },
    ],
    { row: MENU_ROW, title: `Terminate ${p.name}?` },
  );
  if (answer !== 'Y') return;
  p.bytes.fill(0);
  world.looks[slot] = null;
  await notice(io, mm(world, MM.Terminated));
}

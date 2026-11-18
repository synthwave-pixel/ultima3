/**
 * journal.ts
 *
 * The quest journal (this port; the Apple II had none), after the Ultima V port's: a list of what the quest asks
 * for, and of the places it asks the party to go, each with how far it has got there. It records what the world has
 * told the party and what the party has done, so a newcomer can play without a walkthrough, and stays out of the way
 * of anyone who never opens it.
 *
 * The top of the journal is seven lines, each opening to more:
 *
 * - Main quest: the nine steps to Exodus. After the first, an audience with Lord British, they may be taken in any
 *   order, so all are listed - each a mystery until a line names it (CLUES' `names`) or a start is made on it, and
 *   then opening to every clue that bears on it (`quest`).
 * - Towns: Lord British's castle and the ten towns - undiscovered, seen, or entered with so many of their clues
 *   heard (CLUES: the townsfolk's lines that bear on the quest). Dawn and the three towns on isles are mysteries
 *   till seen, entered or told of.
 * - Rumours: the pubs' nine rumours, and Radrion's rhyme once the party has met him, each in order as heard.
 * - Dungeons: the seven - a mystery till seen or told of, then seen, or entered with so many of their goals found
 *   (a mark's rod stood on, the Time Lord met).
 * - Ambrosia: its four shrines, and the cards found in them.
 * - Equipment: what the party can go and get - a guild's supplies, Dawn's magic weapons and armour, a ship - each
 *   done once found, and the moongates come out of. (The exotic arms are a main-quest step.)
 * - Words: the words Other answers to, each learnt by being heard said (CLUES' `word`). A controller's Other offers
 *   only these (interact.ts); a keyboard may type anything, as on the Apple II.
 *
 * Every line has a card (what the party knows of it, shown over the party panel while it is highlighted) and a
 * hint, a plain line written for this port that the game itself never speaks: printed to the message area only when
 * asked for, and nothing remembers the asking. Hints are kept short enough for that area: sixteen columns, nine
 * lines.
 *
 * What can be read from the party, the auto-map and the flags is; the rest (clues heard, words learnt, dungeon goals
 * found) is recorded as it happens. The whole state lives in the save file.
 */

import type { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue } from './tiles.ts';
import { MapId } from '../data/resources.ts';
import type { Card, GameIO } from './io.ts';
import { cardWrap } from './cards.ts';
import { beenIn, shrines } from './worldMap.ts';
import { speech } from './talk.ts';

export interface JournalState {
  lordBritish: boolean;
  ambrosia: boolean;
  timeLord: boolean;
  serpentParted: boolean;
  /** Radrion met: the party has been to an oracle's counter (rumours). */
  radrion: boolean;
  /** Equipment found (equipment): a guild visited, Dawn's weapon and armour shops visited, a ship boarded. */
  guild: boolean;
  magicWeapons: boolean;
  magicArmour: boolean;
  ship: boolean;
  /** Clue ids heard (CLUES), e.g. "Moon#6" or "Yew:pray". */
  clues: string[];
  /** The words Other answers to that have been heard said (WORDS), e.g. "DIG". */
  words: string[];
  /** Dungeon goals found: a mark's rod stood on, as "<dungeon's map id>:<mark>" ("416:kings"). */
  goals: string[];
  /** What the journal showed when last noted (journalSnapshot), to notice a change ("Journal updated"). */
  seen: string[];
}

export function emptyJournal(): JournalState {
  return {
    lordBritish: false,
    ambrosia: false,
    timeLord: false,
    serpentParted: false,
    radrion: false,
    guild: false,
    magicWeapons: false,
    magicArmour: false,
    ship: false,
    clues: [],
    words: [],
    goals: [],
    seen: [],
  };
}

/** The journal's flags, each set once as it happens: saved, restored and compared (journalCheck) alike. */
export const JOURNAL_FLAGS = [
  'lordBritish',
  'ambrosia',
  'timeLord',
  'serpentParted',
  'radrion',
  'guild',
  'magicWeapons',
  'magicArmour',
  'ship',
] as const;

/** The steps of the main quest, in the journal's order. */
type Step = 'king' | 'kings' | 'cards' | 'exotics' | 'fire' | 'force' | 'snake' | 'order' | 'exodus';

/** Towns the journal keeps a mystery till seen, entered or told of: Dawn, and the three on isles. */
const DAWN = 408;
const DEVIL_GUARD = 409;
const FAWN = 410;
const DEATH_GULCH = 411;
const HIDDEN_TOWNS = [DAWN, DEVIL_GUARD, FAWN, DEATH_GULCH];

/**
 * A clue: a line the party may hear that bears on the quest, and what hearing it does - the Other word it teaches,
 * the steps of the main quest it tells of, what it makes known. A townsperson's is "<the town's name in the
 * game's files>#<their number in its talk>", its words read from the talk at the time; a pub's rumour "Pub:<n>" and
 * Radrion's verse "Radrion:<n>" from theirs (the same in every pub and at every oracle, so counted for no town); the
 * others carry theirs.
 */
interface Clue {
  word?: string;
  /** The main-quest steps it bears on: listed under each once the step is known. */
  quest?: Step[];
  /** The steps it names, which it makes known: a line that only bears on a step leaves it a mystery. */
  names?: Step[];
  /** What it makes known: Ambrosia, the moongates, or a hidden town (HIDDEN_TOWNS) or dungeon by its map id. */
  reveals?: ('ambrosia' | 'moongates' | number)[];
  /** Who says it, and what, where it is not a townsperson's line. */
  from?: string;
  text?: string;
  /** A word after the line, where it reads as something it is not. */
  note?: string;
}

export const CLUES: Record<string, Clue> = {
  'LB:mark': { quest: ['kings'], names: ['kings'], from: 'Lord British', text: 'SEEK YE, THE MARK OF KINGS!' },
  'Lord British Castle#1': { reveals: [DAWN] },
  'Lord British Castle#6': { quest: ['cards', 'order'], names: ['cards'] },
  'LCB Towne#2': { reveals: ['ambrosia'] },
  'LCB Towne#3': { quest: ['exotics'], names: ['exotics'] },
  'LCB Towne#4': { quest: ['snake'], names: ['snake'] },
  'LCB Towne#5': { reveals: [DAWN] },
  'Moon#2': { quest: ['cards'] },
  'Moon#3': { word: 'BRIBE' },
  // "Peace be with you": pax, peace - the word that calms, though the line never says it. Not one of Moon's clues.
  'Moon#5': { word: 'PAXUM' },
  'Moon#6': { reveals: ['ambrosia'] },
  'Moon#7': { reveals: [DAWN] },
  'Yew#1': { word: 'SEARCH', quest: ['cards'] },
  'Yew#2': {},
  'Yew:pray': { word: 'EVOCARE', quest: ['snake'], from: 'The circle of light', text: "YELL 'EVOCARE'" },
  'East Montor#1': { word: 'INSERT', quest: ['cards', 'order'], names: ['cards'] },
  'East Montor#2': { quest: ['cards', 'order'], names: ['cards'] },
  'East Montor#5': { quest: ['cards'], names: ['cards'] },
  'East Montor#6': { quest: ['kings'] },
  'East Montor#7': { quest: ['exotics'], names: ['exotics'] },
  'West Montor#5': { word: 'SEARCH', quest: ['cards'] },
  'West Montor#6': { word: 'SEARCH', quest: ['cards'], names: ['cards'] },
  'Grey#3': { quest: ['exotics'], names: ['exotics'] },
  'Grey#4': { quest: ['exotics'], names: ['exotics'], reveals: [DAWN] },
  'Grey#5': { quest: ['exotics'], names: ['exotics'] },
  'Dawn#2': { word: 'DIG', quest: ['exotics'] },
  'Dawn#3': { word: 'DIG', quest: ['exotics'], names: ['exotics'] },
  'Dawn#4': { word: 'DIG' },
  'Dawn#6': {},
  'Dawn#7': { reveals: ['ambrosia'] },
  'Devil Guard#1': { quest: ['kings'] },
  'Devil Guard#2': { quest: ['kings'] },
  'Devil Guard#3': { quest: ['kings'], names: ['kings'] },
  'Devil Guard#4': { quest: ['snake'], names: ['snake'] },
  'Devil Guard#5': { quest: ['kings', 'fire', 'force', 'snake'] },
  'Devil Guard#6': { quest: ['fire'], reveals: [413] }, // the Fires of Hell, the only dungeon a line names
  'Devil Guard#7': { quest: ['kings'] },
  'Fawn#1': { word: 'PRAY', quest: ['snake'] },
  'Fawn#2': { word: 'PRAY', quest: ['snake'] },
  // 'INVOKE' reads as a word to say, and is none: the invocation is the word a prayer in Yew is answered with.
  'Fawn#3': { quest: ['snake'], names: ['snake'], note: 'The invocation: the word a prayer is answered with.' },
  'Fawn#4': { quest: ['snake'] },
  'Death Gulch#2': { word: 'BRIBE' },
  'Death Gulch#3': { quest: ['order', 'exodus'] },
  // Death Gulch's people say only its first three lines: the rest of its talk, Fawn's lines with Fawn misspelt and a
  // scrap of Devil Guard's, is never heard.
  TimeLord: { quest: ['order', 'exodus'], from: 'The Time Lord', text: 'THE ONE WAY IS LOVE, SOL, MOONS & DEATH, ALL ELSE FAILS.' },
  // The pubs' rumours, the more paid the further down the list (shops.ts pub), all kept for the journal's Rumours;
  // "Thank you, kindly!" (#0) is no rumour. Those of dungeons, fountains and the next Ultima tell of nothing.
  'Pub:1': { reveals: ['ambrosia'] },
  'Pub:2': { reveals: [DAWN] },
  'Pub:3': { reveals: ['moongates', DAWN] },
  'Pub:4': {},
  'Pub:5': { reveals: ['ambrosia'] },
  'Pub:6': { reveals: ['ambrosia'], quest: ['cards'] },
  'Pub:7': {},
  'Pub:8': {},
  'Pub:9': { quest: ['order'], names: ['order'] },
  // Radrion's rhyme, a verse for each hundred gold offered (shops.ts oracle); its opening, offered nothing, tells of
  // nothing itself.
  'Radrion:0': {},
  'Radrion:1': { quest: ['kings', 'cards'], names: ['cards'] },
  'Radrion:2': { quest: ['kings', 'fire', 'force', 'snake'], names: ['kings', 'fire', 'force', 'snake'] },
  'Radrion:3': { quest: ['kings', 'fire', 'force', 'snake'], reveals: [DEVIL_GUARD] },
  'Radrion:4': { quest: ['cards'] },
  'Radrion:5': { quest: ['cards'] },
  'Radrion:6': { quest: ['cards'], names: ['cards'] },
  'Radrion:7': { quest: ['cards', 'order'] },
  'Radrion:8': { quest: ['order'] },
  'Radrion:9': { quest: ['order'], names: ['order'] },
  // The misty writing on a dungeon's level: "<the dungeon's map id>:<level>", its words read from the dungeon's talk.
  '415:2': { word: 'INSERT', quest: ['cards', 'order'], names: ['cards'] },
  '415:3': { word: 'SEARCH', quest: ['cards'] },
};

/** Lord British's audience, counted among his castle's clues: heard once the party has spoken with him. */
const AUDIENCE = 'LB:audience';

/** A main-quest step: its name on its line (fifteen letters at most, for its status beside it) and its hint. */
const STEPS: { id: Step; name: string; hint: string }[] = [
  { id: 'king', name: 'Lord British', hint: "Lord British sits in his castle north of Britain's town. Walk into him." },
  {
    id: 'kings',
    name: 'Mark of Kings',
    hint: 'Level 1 of the Perinian Depths, north-east of Britain: step on the rod. Light: Lorum, Luminae, or torches from a guild.',
  },
  {
    id: 'cards',
    name: 'The four cards',
    hint: "In Ambrosia's four shrines, Other and say SEARCH. Two lie past locked doors: bring keys and take a pirate's ship.",
  },
  {
    id: 'exotics',
    name: 'Exotic arms',
    hint: 'Other, DIG once per member. Weapons: the islet east of Fawn, its east square. Armour: the islet east of Grey, its west square.',
  },
  {
    id: 'fire',
    name: 'Mark of Fire',
    hint: 'Level 8 of the Perinian Depths, the Fires of Hell or Morinia. Each member needs it to cross lava.',
  },
  {
    id: 'force',
    name: 'Mark of Force',
    hint: "Level 8 of Doom or the Fires of Hell. Each member, for the force fields in Exodus' castle.",
  },
  {
    id: 'snake',
    name: 'Silver Snake',
    hint: "Mark of Snake: level 8 of the Snake's dungeon. PRAY in Yew's circle of light for the word. Yell it from a ship just south of the serpent.",
  },
  {
    id: 'order',
    name: "Cards' order",
    hint: 'The Time Lord waits on level 8 of Time Awaits, beside Death Gulch. He names the order of the cards.',
  },
  {
    id: 'exodus',
    name: 'Exodus',
    hint: "Exodus' castle: the south-west isle, past the serpent. Only exotics bite. INSERT the cards left to right in the Time Lord's order.",
  },
];

/** A town or castle: its map id, its name in the journal, its clues (CLUES ids, AUDIENCE) and its hint. */
const TOWNS: { id: number; name: string; clues: string[]; hint: string }[] = [
  {
    id: MapId.LordBritishCastle,
    name: 'Lord British',
    clues: [AUDIENCE, 'Lord British Castle#1', 'Lord British Castle#6'],
    hint: "Lord British's castle, where the party starts. Walk into the king to speak with him.",
  },
  {
    id: 402,
    name: 'Britain',
    clues: ['LCB Towne#2', 'LCB Towne#3', 'LCB Towne#4', 'LCB Towne#5'],
    hint: "Beside Lord British's castle, where the party starts.",
  },
  { id: 403, name: 'Moon', clues: ['Moon#2', 'Moon#3', 'Moon#6', 'Moon#7'], hint: 'In the far north-west. On foot.' },
  {
    id: 404,
    name: 'Yew',
    clues: ['Yew#1', 'Yew#2', 'Yew:pray'],
    hint: 'West of Britain, on foot. Its circle of light: the ring of fire in the woods south-east of the town. PRAY at its centre.',
  },
  {
    id: 405,
    name: 'East Montor',
    clues: ['East Montor#1', 'East Montor#2', 'East Montor#5', 'East Montor#6', 'East Montor#7'],
    hint: 'In the far south, beside West Montor. On foot.',
  },
  {
    id: 406,
    name: 'West Montor',
    clues: ['West Montor#5', 'West Montor#6'],
    hint: 'In the far south, beside East Montor. On foot.',
  },
  { id: 407, name: 'Grey', clues: ['Grey#3', 'Grey#4', 'Grey#5'], hint: 'In the south-west. On foot.' },
  {
    id: DAWN,
    name: 'Dawn',
    clues: ['Dawn#2', 'Dawn#3', 'Dawn#4', 'Dawn#6', 'Dawn#7'],
    hint: "In the forest west of the Montors, 8 west and 35 south of Lord British's castle. It stands only while both moons are new.",
  },
  {
    id: DEVIL_GUARD,
    name: 'Devil Guard',
    clues: ['Devil Guard#1', 'Devil Guard#2', 'Devil Guard#3', 'Devil Guard#4', 'Devil Guard#5', 'Devil Guard#6', 'Devil Guard#7'],
    hint: 'An isle in the west: a ship is needed. Take one from pirates.',
  },
  {
    id: FAWN,
    name: 'Fawn',
    clues: ['Fawn#1', 'Fawn#2', 'Fawn#3', 'Fawn#4'],
    hint: 'A small isle in the far north: a ship is needed. Take one from pirates.',
  },
  {
    id: DEATH_GULCH,
    name: 'Death Gulch',
    clues: ['Death Gulch#2', 'Death Gulch#3'],
    hint: 'An isle in the east: a ship is needed. Take one from pirates.',
  },
];

/** A mark's rod in a dungeon level's cells (world.ts DungeonCell.Mark: world.ts imports this module). */
const ROD = 0x05;

/** A dungeon's goal: a mark (its rod's, by the rod's column: dungeon.ts), or the Time Lord. */
type Goal = 'force' | 'fire' | 'snake' | 'kings' | 'timeLord';

/** The mark a rod gives, by its column (x & 3), as dungeon.ts sets it (bit 4 + x & 3 of the marks). */
export const ROD_MARKS: Goal[] = ['force', 'fire', 'snake', 'kings'];

const GOAL_NAMES: Record<Goal, string> = {
  force: 'the Mark of Force',
  fire: 'the Mark of Fire',
  snake: 'the Mark of Snake',
  kings: 'the Mark of Kings',
  timeLord: 'the Time Lord',
};

/**
 * The dungeons, in the order the quest tends to want them: each one's goals - what it is there for, not every rod
 * in it (the Mark of Kings is in six of the seven) - and its hint.
 */
const DUNGEONS: { id: number; name: string; goals: Goal[]; hint: string }[] = [
  {
    id: 416,
    name: 'Perinian Depths',
    goals: ['kings', 'fire'],
    hint: 'North-east of Britain, on foot. Level 1: the Mark of Kings. Level 8: the Mark of Fire.',
  },
  { id: 418, name: "Dardin's Pit", goals: ['kings'], hint: 'North of Britain, on foot. Level 2: the Mark of Kings.' },
  { id: 417, name: 'Morinia', goals: ['fire'], hint: 'The Mines of Morinia, in the west. On foot. Level 8: the Mark of Fire.' },
  {
    id: 413,
    name: 'Fires of Hell',
    goals: ['fire', 'force'],
    hint: 'South of Britain, on foot. Level 8: the Marks of Fire and Force.',
  },
  { id: 412, name: 'Doom', goals: ['force'], hint: 'In the far south-west. On foot. Level 8: the Mark of Force.' },
  // The game's files call it Clues; players and the guides know it as the Dungeon of the Snake.
  { id: 415, name: 'Snake', goals: ['snake'], hint: 'An isle in the east: a ship is needed. Level 8: the Mark of Snake.' },
  {
    id: 414,
    name: 'Time Awaits',
    goals: ['timeLord'],
    hint: 'Ringed by mountains beside Death Gulch: the moongate at its door is the only way in. Level 8: the Time Lord.',
  },
];

/** The cards, by the shrine's column (x & 3) and the bit SEARCH sets (interact.ts). */
const CARDS = ['Love', 'Sol', 'Moons', 'Death'];

/**
 * The words Other answers to that someone says, in the order Other offers them: what each does, and where it is
 * learnt. SCREAM and PISSOFF nobody says, so they are never offered (a keyboard may still type them).
 */
export const WORDS: { word: string; about: string; hint: string }[] = [
  {
    word: 'SEARCH',
    about: "Standing in one of Ambrosia's shrines, finds its card.",
    hint: 'Taught in Yew and West Montor.',
  },
  { word: 'BRIBE', about: 'Pays a guard 100 gold to leave his post.', hint: 'Taught in Moon and Death Gulch.' },
  {
    word: 'PRAY',
    about: 'In the right place, a prayer is answered with a word.',
    hint: "Taught in Fawn. The place: Yew's circle of light.",
  },
  {
    word: 'EVOCARE',
    about: 'Yelled beside the Silver Snake by one with the Mark of Snake: the serpent parts.',
    hint: "Other, PRAY at the centre of Yew's circle of light.",
  },
  { word: 'INSERT', about: "In Exodus' castle, sets a card in its slot.", hint: 'Taught in East Montor.' },
  { word: 'DIG', about: 'Digs where something lies buried.', hint: 'Taught in Dawn, which stands only while both moons are new.' },
  {
    word: 'PAXUM',
    about: 'In a town or castle, calms those within five squares who have turned on the party. Pax: peace.',
    hint: 'Learnt in Moon, from one who wishes the party peace.',
  },
];

/** A line of the journal. */
export interface JournalLine {
  /** The row: its name at the left and, at the right, where it stands (row). */
  label: string;
  /** Its name alone, for its card's title. */
  name: string;
  /** What the party knows of it, for its card. */
  about: string;
  /** The hint, printed to the message area when asked for. */
  hint: string;
  /** What it opens to: more lines, or text to read. */
  open?: JournalSection;
}

export interface JournalSection {
  title: string;
  lines?: JournalLine[];
  /** Paragraphs, each wrapped to the page. */
  text?: string[];
}

/** The journal's page width (help.ts PAGE_WIDTH). */
const WIDTH = 20;
const MYSTERY = 'Mystery...';

/** `name` at the left, `right` at the right, in the page's width; the name cut short should both not fit. */
function row(name: string, right = ''): string {
  if (!right) return name.slice(0, WIDTH);
  return name.slice(0, WIDTH - right.length - 1).padEnd(WIDTH - right.length) + right;
}

/** A line not yet known of: its hint is still there for the asking. */
function mystery(hint: string, about = 'Not yet heard of.'): JournalLine {
  return { label: MYSTERY, name: MYSTERY, about, hint };
}

/** The members in the party. */
function inParty(world: World): number[] {
  return [0, 1, 2, 3].filter((m) => world.party.memberSlot(m) >= 0);
}

/** The party's members with marks bit `bit`, by name. */
function holders(world: World, bit: number): string[] {
  return inParty(world)
    .filter((m) => (world.member(m).marks & bit) !== 0)
    .map((m) => world.member(m).name);
}

function heldBy(world: World, bit: number): string {
  const who = holders(world, bit);
  if (!who.length) return 'Held by no one.';
  return who.length === inParty(world).length && who.length > 1 ? 'Held by all.' : `Held by ${who.join(', ')}.`;
}

const MARK_BITS: Record<string, number> = { force: 0x10, fire: 0x20, snake: 0x40, kings: 0x80 };

function heard(world: World, id: string): boolean {
  return id === AUDIENCE ? world.journal.lordBritish : world.journal.clues.includes(id);
}

/** A clue's words, as spoken: a townsperson's from their town's talk, a dungeon's writing from its own. */
function clueText(world: World, id: string): string {
  const clue = CLUES[id];
  if (clue?.text) return clue.text;
  const told = /^(Pub|Radrion):(\d)$/.exec(id);
  if (told) return (world.resources.strings[told[1] as 'Pub' | 'Radrion'][Number(told[2])] ?? '').replace(/\s+/g, ' ').trim();
  const writing = /^(\d+):(\d+)$/.exec(id);
  if (writing) {
    const talk = world.resources.talk.get(Number(writing[1]));
    return talk ? speech(talk, Number(writing[2])).replace(/\n/g, ' ').trim() : '';
  }
  const [town, n] = id.split('#');
  return world.townLine(town, Number(n));
}

/** A clue as the journal shows it: its words, and its note where it has one. */
function clueLine(world: World, id: string): string {
  const note = CLUES[id]?.note;
  return note ? `${clueText(world, id)} (${note})` : clueText(world, id);
}

/** Who said a clue, for a step's list of them. */
function clueFrom(world: World, id: string): string {
  const clue = CLUES[id];
  if (clue?.from) return clue.from;
  if (id.startsWith('Pub:')) return 'A pub';
  if (id.startsWith('Radrion:')) return 'Radrion';
  const writing = /^(\d+):(\d+)$/.exec(id);
  if (writing) return `${DUNGEONS.find((d) => d.id === Number(writing[1]))?.name ?? 'A dungeon'}, level ${writing[2]}`;
  const town = id.split('#')[0];
  return TOWNS.find((t) => world.resources.mapNames.get(t.id) === town)?.name ?? town;
}

function heardOf(world: World, test: (clue: Clue) => boolean): boolean {
  return world.journal.clues.some((id) => CLUES[id] && test(CLUES[id]));
}

/** How a main-quest step stands: done, its status at the right of its line, its card, and whether it is known of. */
function stepState(world: World, id: Step): { done: boolean; right: string; about: string; started: boolean } {
  const j = world.journal;
  const members = inParty(world).length;
  const marks = (bit: number, why: string) => {
    const n = holders(world, bit).length;
    return {
      done: members > 0 && n === members,
      right: members ? `${n}/${members}` : '',
      about: `${heldBy(world, bit)} ${why}`,
      started: n > 0,
    };
  };
  switch (id) {
    case 'king':
      return j.lordBritish
        ? { done: true, right: 'done', about: 'Audience had. He raises a level for any with the experience.', started: true }
        : { done: false, right: '', about: "He awaits in his castle, beside Britain's town.", started: false };
    case 'kings':
      return marks(0x80, 'Lord British raises no one past level 5 without it.');
    case 'cards': {
      const union = inParty(world).reduce((bits, m) => bits | (world.member(m).marks & 0x0f), 0);
      const held = CARDS.filter((_, i) => union & (1 << i));
      const about = held.length ? `Held: ${held.join(', ')}.` : 'None held yet.';
      return {
        done: held.length === 4,
        right: `${held.length}/4`,
        about: `${about} All four are set in Exodus' castle.`,
        started: held.length > 0,
      };
    }
    case 'exotics': {
      const weapons = world.party.weapons(15) + inParty(world).filter((m) => world.member(m).bytes[48] === 15).length;
      const armour = world.party.armour(7) + inParty(world).filter((m) => world.member(m).bytes[40] === 7).length;
      const kinds = (weapons > 0 ? 1 : 0) + (armour > 0 ? 1 : 0);
      return {
        done: kinds === 2,
        right: `${kinds}/2`,
        about: `Exotic weapons ${weapons}, armour ${armour}, in the pack or in use.`,
        started: kinds > 0,
      };
    }
    case 'fire':
      return marks(0x20, 'Each member needs it to cross lava.');
    case 'force':
      return marks(0x10, "Each member needs it for the force fields in Exodus' castle.");
    case 'snake': {
      const who = holders(world, 0x40);
      const word = j.words.includes('EVOCARE');
      if (j.serpentParted) return { done: true, right: 'done', about: 'Passed: the serpent parted at the word.', started: true };
      const about = `The mark: ${who.length ? who.join(', ') : 'not held'}. The word: ${word ? 'EVOCARE' : 'not known'}.`;
      const parts = (who.length ? 1 : 0) + (word ? 1 : 0);
      // The third part is the passing itself: with the mark and the word it is ready, not a clue short.
      if (parts === 2)
        return { done: false, right: 'ready', about: `${about} Next: yell the word from a ship just south of the serpent.`, started: true };
      return { done: false, right: `${parts}/3`, about, started: parts > 0 };
    }
    case 'order':
      return j.timeLord
        ? { done: true, right: 'done', about: 'The Time Lord: LOVE, SOL, MOONS & DEATH, all else fails.', started: true }
        : { done: false, right: '', about: 'Four cards, four slots, and one order. Not yet known.', started: false };
    case 'exodus':
      return world.party.exodusDestroyed
        ? { done: true, right: 'done', about: 'Destroyed. Sosaria is saved.', started: true }
        : { done: false, right: '', about: 'Exodus waits in its castle, on an isle in the south-west.', started: false };
  }
}

/** The main quest's lines. */
function mainQuest(world: World): JournalLine[] {
  return STEPS.map((step) => {
    const state = stepState(world, step.id);
    const told = world.journal.clues.filter((id) => CLUES[id]?.quest?.includes(step.id));
    // Known once a line names it, or the party has made a start on it; a line that only bears on it waits for that.
    const named = world.journal.clues.some((id) => CLUES[id]?.names?.includes(step.id));
    const known = step.id === 'king' || step.id === 'exodus' || state.started || state.done || named;
    if (!known) return mystery(step.hint);
    const line: JournalLine = { label: row(step.name, state.right), name: step.name, about: state.about, hint: step.hint };
    if (told.length) line.open = { title: step.name, text: told.map((id) => `${clueFrom(world, id)}: ${clueLine(world, id)}`) };
    return line;
  });
}

/** Whether a place's square on Sosaria has been seen. */
function seenOnSosaria(world: World, id: number): boolean {
  const { locationX, locationY } = world.resources.misc;
  return world.autoMap.squareSeen(MapId.Sosaria, locationX[id - 400], locationY[id - 400]);
}

/** A town's clues heard, of all. */
function townCount(world: World, town: (typeof TOWNS)[number]): { heard: number; all: number } {
  return { heard: town.clues.filter((id) => heard(world, id)).length, all: town.clues.length };
}

function townLine(world: World, town: (typeof TOWNS)[number]): JournalLine {
  const { heard: n, all } = townCount(world, town);
  const entered = beenIn(world, town.id) || n > 0;
  let seen = seenOnSosaria(world, town.id);
  // Dawn stands only while both moons are new: seen is seen standing, now.
  if (town.id === DAWN) {
    const { locationX, locationY } = world.resources.misc;
    seen = seen && world.surface.tiles[locationY[DAWN - 400] * 64 + locationX[DAWN - 400]] === MapValue.Town;
  }
  // Dawn and the isles' towns are mysteries till seen, entered or told of; the rest are named from the start.
  if (HIDDEN_TOWNS.includes(town.id) && !entered && !seen && !heardOf(world, (c) => !!c.reveals?.includes(town.id))) {
    return mystery(town.hint);
  }
  if (!entered) {
    return {
      label: row(town.name, seen ? 'seen' : ''),
      name: town.name,
      about: seen
        ? 'Found, not yet entered.'
        : town.id === DAWN
          ? 'Heard of. It stands only while both moons are new.'
          : HIDDEN_TOWNS.includes(town.id)
            ? 'Heard of, not yet found.'
            : 'Undiscovered.',
      hint: town.hint,
    };
  }
  const text = town.clues.map((id) => {
    if (!heard(world, id)) return MYSTERY;
    if (id === AUDIENCE) return 'An audience with Lord British.';
    if (id === 'Yew:pray') return `In the circle of light: ${clueText(world, id)}`;
    return clueLine(world, id);
  });
  return {
    label: row(town.name, `${n}/${all}`),
    name: town.name,
    about: n === all ? 'Entered. All its clues found.' : `Entered. ${n} of its ${all} clues found.`,
    hint: town.hint,
    open: { title: town.name, text },
  };
}

/** Whether a dungeon's goal has been found. */
function goalFound(world: World, dungeon: number, goal: Goal): boolean {
  return goal === 'timeLord' ? world.journal.timeLord : world.journal.goals.includes(`${dungeon}:${goal}`);
}

function dungeonLine(world: World, dungeon: (typeof DUNGEONS)[number]): JournalLine {
  const found = dungeon.goals.filter((g) => goalFound(world, dungeon.id, g));
  const entered = beenIn(world, dungeon.id) || found.length > 0;
  const seen = seenOnSosaria(world, dungeon.id);
  // A mystery till its entrance is seen, the party has been in, or a line names it, as the towns on isles are.
  if (!entered && !seen && !heardOf(world, (c) => !!c.reveals?.includes(dungeon.id))) return mystery(dungeon.hint);
  const base = { name: dungeon.name, hint: dungeon.hint };
  if (!entered)
    return { ...base, label: row(dungeon.name, seen ? 'seen' : ''), about: seen ? 'Found, not yet entered.' : 'Heard of, not yet found.' };
  const all = found.length === dungeon.goals.length;
  const what = found.map((g) => GOAL_NAMES[g]).join(' and ');
  const about = !found.length
    ? 'Entered. What it holds for the quest is yet to be found.'
    : `Entered. Found here: ${what}.${all ? '' : ' More lies within.'}`;
  return { ...base, label: row(dungeon.name, `${found.length}/${dungeon.goals.length}`), about };
}

/** Ambrosia's shrines, one to a card (x & 3), each with its squares. */
function shrineSquares(world: World): [number, number][][] {
  const out: [number, number][][] = [[], [], [], []];
  for (const [x, y] of shrines(world)) out[x & 3].push([x, y]);
  return out;
}

function ambrosiaLines(world: World): JournalLine[] {
  const stats = world.resources.strings.Messages;
  return shrineSquares(world).map((squares, i) => {
    const stat = (stats[173 + i] ?? '').trim();
    const name = stat.charAt(0).toUpperCase() + stat.slice(1).toLowerCase();
    const seen = squares.some(([x, y]) => world.autoMap.squareSeen(MapId.Ambrosia, x, y));
    const entered = squares.some(([x, y]) => world.autoMap.visited(`shrine:${x},${y}`));
    const who = holders(world, 1 << i);
    const hint = `Stand in the shrine: Other, SEARCH for the Card of ${CARDS[i]}. Offer gold there to raise ${name}.`;
    let about = 'Undiscovered.';
    if (entered) {
      const card = who.length ? `The Card of ${CARDS[i]}: held by ${who.join(', ')}.` : 'Its card is not yet found.';
      about = `Entered. Gold offered here raises ${name}. ${card}`;
    } else if (seen) about = 'Found, not yet entered.';
    return { label: row(name, who.length ? CARDS[i] : seen || entered ? 'seen' : ''), name, about, hint };
  });
}

/** The pubs' rumours, #1 to #9, and Radrion's verses, the opening (#0) to #9. */
const RUMOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const VERSES = [0, ...RUMOURS];
const PUBS = 'Pubs: Britain, Moon, both Montors, Grey, Dawn, Devil Guard and Fawn. Pay 10 gold more for each rumour further on, up to 90.';
const ORACLES =
  "Radrion's counter: Lord British's castle, Britain and Dawn. Offer nothing for the opening verse, then a hundred gold for each.";

/** What the pubs and Radrion tell, for gold: the pubs' nine rumours, and Radrion's rhyme once the party has met him. */
function rumours(world: World): { lines: JournalLine[]; heard: number; all: number } {
  const told = (id: string) => world.journal.clues.includes(id);
  const said = (ids: string[]) => ids.map((id) => (told(id) ? clueText(world, id) : MYSTERY));
  const pubs = RUMOURS.filter((n) => told(`Pub:${n}`)).length;
  const verses = RUMOURS.filter((n) => told(`Radrion:${n}`)).length;
  const lines: JournalLine[] = [
    {
      label: row('Pub rumours', `${pubs}/9`),
      name: 'Pub rumours',
      about: `Every pub tells the same nine, picked by what the drink costs. ${pubs} of 9 heard.`,
      hint: PUBS,
      open: { title: 'Pub rumours', text: said(RUMOURS.map((n) => `Pub:${n}`)) },
    },
    world.journal.radrion
      ? {
          label: row('Radrion', `${verses}/9`),
          name: 'Radrion',
          about: `The Prophet of Life sells his rhyme a verse at a time, by the hundred gold offered. ${verses} of 9 heard.`,
          hint: ORACLES,
          open: { title: 'Radrion', text: said(VERSES.map((n) => `Radrion:${n}`)) },
        }
      : mystery(ORACLES),
  ];
  return { lines, heard: pubs + (world.journal.radrion ? verses : 0), all: world.journal.radrion ? 18 : 9 };
}

/** Where the guilds are, for Supplies' hint. */
const GUILDS = 'Guilds sell keys, torches, powders and gems: in Grey, a walk south-west; Devil Guard and Fawn, on isles; and Dawn.';
/** Dawn, for the magic arms' hints. */
const DAWN_SHOPS = "One town's shops sell them: Dawn, in the forest west of the Montors, standing only while both moons are new.";

/** The moongates' rule, for their hint. */
const MOONGATES =
  'Left moon: which gate stands. Right moon: where it leads. For Time Awaits, step in with the right moon one phase short of new.';

/**
 * The equipment the party can go and get, beyond what it starts with, each line done once found - and the
 * moongates, a mystery till told of or come out of, done once all eight have been.
 */
function equipment(world: World): { lines: JournalLine[]; done: number } {
  const j = world.journal;
  let done = 0;
  const line = (name: string, found: boolean, before: string, after: string, hint: string): JournalLine => {
    if (found) done++;
    return { label: row(name, found ? 'done' : ''), name, about: found ? after : before, hint };
  };
  const gates = world.gatesKnown.length;
  if (gates === 8) done++;
  const moongates =
    gates > 0 || heardOf(world, (c) => !!c.reveals?.includes('moongates'))
      ? {
          label: row('Moongates', `${gates}/8`),
          name: 'Moongates',
          about: `Come out of ${gates} of 8. One gate stands at a time, by the left moon; step in, and the right moon picks where you come out.`,
          hint: MOONGATES,
        }
      : mystery(MOONGATES);
  const lines = [
    line('Supplies', j.guild, 'Find a guild to get adventuring supplies.', 'Found a guild: keys, torches, powders and gems.', GUILDS),
    line(
      'Magic Weapons',
      j.magicWeapons,
      'Find the shop that sells magic weapons.',
      'Found, in Dawn: the +2 and +4 weapons. Ordinary shops stop at the 2-H sword.',
      DAWN_SHOPS,
    ),
    line(
      'Magic Armour',
      j.magicArmour,
      'Find the shop that sells magic armour.',
      'Found, in Dawn: +2 chain and +2 plate. Ordinary shops stop at plate.',
      DAWN_SHOPS,
    ),
    line(
      'Ships',
      j.ship,
      'Acquire a ship...',
      'Boarded. A ship reaches the isles, and through the whirlpool, Ambrosia.',
      'No one sells ships. Attack a pirate ship from the shore, then board (B) the frigate it leaves.',
    ),
    moongates,
  ];
  return { lines, done };
}

/**
 * The top of the journal: the main quest, the towns, the dungeons, Ambrosia, the equipment and the words, each with its count
 * and opening to its lines.
 */
export function journalTop(world: World): JournalLine[] {
  const j = world.journal;
  const steps = mainQuest(world);
  const stepsDone = STEPS.filter((s) => stepState(world, s.id).done).length;
  const towns = TOWNS.map((t) => townLine(world, t));
  const townsDone = TOWNS.filter((t) => {
    const { heard: n, all } = townCount(world, t);
    return n === all;
  }).length;
  const dungeons = DUNGEONS.map((d) => dungeonLine(world, d));
  const told = rumours(world);
  const dungeonsDone = DUNGEONS.filter((d) => d.goals.every((g) => goalFound(world, d.id, g))).length;
  const ambrosiaHint =
    "Sail a frigate into the whirlpool; the ship is lost. Home from Ambrosia is a pirate's ship into the lake's whirlpool.";
  const ambrosiaKnown =
    j.ambrosia ||
    world.party.location === Location.Ambrosia ||
    world.autoMap.hasMap(MapId.Ambrosia) ||
    heardOf(world, (c) => !!c.reveals?.includes('ambrosia'));
  const shrineLines = ambrosiaLines(world);
  const cards = shrineLines.filter((_, i) => holders(world, 1 << i).length > 0).length;
  const words = WORDS.map((w) =>
    j.words.includes(w.word) ? { label: w.word, name: w.word, about: w.about, hint: w.hint } : mystery(w.hint, 'Not yet heard said.'),
  );
  const reached = j.ambrosia || world.autoMap.hasMap(MapId.Ambrosia);
  const gear = equipment(world);
  return [
    {
      label: row('Main quest', `${stepsDone}/${STEPS.length}`),
      name: 'Main quest',
      about: 'All that stands between you and Exodus. After the king, in any order.',
      hint: 'Talk to everyone: the townsfolk tell what the quest needs. Each step has its own hint.',
      open: { title: 'Main quest', lines: steps },
    },
    {
      label: row('Towns', `${townsDone}/${TOWNS.length}`),
      name: 'Towns',
      about: "Lord British's castle and the ten towns, and the clues to be heard in each.",
      hint: 'Walk into townsfolk to talk. The isles need a ship: take one from pirates.',
      open: { title: 'Towns', lines: towns },
    },
    {
      label: row('Rumours', `${told.heard}/${told.all}`),
      name: 'Rumours',
      about: 'What the pubs, and an oracle, will tell for gold.',
      hint: 'Buy a drink in a pub, or make an offering at an oracle: the more gold, the further the tale goes.',
      open: { title: 'Rumours', lines: told.lines },
    },
    {
      label: row('Dungeons', `${dungeonsDone}/${DUNGEONS.length}`),
      name: 'Dungeons',
      about: 'Seven dungeons, each holding something the quest needs.',
      hint: 'Bring light: torches, or the spells Lorum and Luminae. What the quest needs is mostly on level 8.',
      open: { title: 'Dungeons', lines: dungeons },
    },
    ambrosiaKnown
      ? {
          label: row('Ambrosia', `${cards}/4`),
          name: 'Ambrosia',
          about: reached ? `The lost land. ${cards} of its four shrines' cards held.` : 'The lost land. Heard of, not yet reached.',
          hint: ambrosiaHint,
          open: { title: 'Ambrosia', lines: shrineLines },
        }
      : mystery(ambrosiaHint),
    {
      label: row('Equipment', `${gear.done}/${gear.lines.length}`),
      name: 'Equipment',
      about: 'What the party can go and get, beyond what it sets out with.',
      hint: 'Each line has its own hint.',
      open: { title: 'Equipment', lines: gear.lines },
    },
    {
      label: row('Words', `${words.filter((w) => w.label !== MYSTERY).length}/${words.length}`),
      name: 'Words',
      about: 'Words to say with Other (O), learnt from those who say them.',
      hint: 'Other: choose who speaks, then the word. On a controller, the words learnt are offered.',
      open: { title: 'Words', lines: words },
    },
  ];
}

/** A line's card: its name, and what the party knows of it. */
export function journalCard(line: JournalLine): Card {
  return { title: line.name, lines: cardWrap(line.about).map((text) => ({ text })) };
}

/** A word's card, for Other's list on a controller: what it does. */
export function wordCard(word: string): Card | undefined {
  const w = WORDS.find((x) => x.word === word);
  return w && { title: w.word, lines: cardWrap(w.about).map((text) => ({ text })) };
}

/** The words learnt, in Other's order: what a controller's Other offers. */
export function knownWords(world: World): string[] {
  return WORDS.map((w) => w.word).filter((w) => world.journal.words.includes(w));
}

/**
 * A word learnt without being heard (Cheats' Add word): one of WORDS, made known as if heard said, so a controller's
 * Other offers it and the journal's Words shows it. Says whether it was added, known already, or no word Other offers.
 */
export function learnWord(world: World, typed: string): 'added' | 'known' | 'unknown' {
  const word = typed.trim().toUpperCase();
  if (!WORDS.some((w) => w.word === word)) return 'unknown';
  if (world.journal.words.includes(word)) return 'known';
  world.journal.words.push(word);
  return 'added';
}

/** Record a clue heard, and the word it teaches. Returns true if it was new. */
export function hearClue(world: World, id: string): boolean {
  const clue = CLUES[id];
  if (!clue || world.journal.clues.includes(id)) return false;
  world.journal.clues.push(id);
  if (clue.word && !world.journal.words.includes(clue.word)) world.journal.words.push(clue.word);
  return true;
}

/** Record a townsperson's line. Returns true if it was a new clue. */
export function hearTownLine(world: World, town: string, speaker: number): boolean {
  return hearClue(world, `${town}#${speaker}`);
}

/** Record the misty writing on a dungeon's level (0-based). Returns true if it was a new clue. */
export function readWriting(world: World, dungeon: number, level: number): boolean {
  return hearClue(world, `${dungeon}:${level + 1}`);
}

/** Record a mark's rod stood on in a dungeon (dungeon.ts): its column (x & 3) says which mark. */
export function rodFound(world: World, dungeon: number, x: number): void {
  const id = `${dungeon}:${ROD_MARKS[x & 3]}`;
  if (!world.journal.goals.includes(id)) world.journal.goals.push(id);
}

/**
 * After anything that may move the journal on: compare what it records with what was last noted and, on a change,
 * note it and print "Journal updated". Only what is recorded as it happens counts, and how each main-quest step
 * stands - not a place newly seen on the way.
 */
export function journalCheck(world: World, io: GameIO): boolean {
  if (!journalSnapshot(world)) return false;
  io.print('Journal updated\n');
  return true;
}

/**
 * What the journal shows that comes of what happens, as a list to compare: the flags, clues, words and goals
 * recorded, each member's marks and cards, the exotic arms held, and which main-quest steps are known and done.
 */
function snapshot(world: World): string[] {
  const j = world.journal;
  const flags = JOURNAL_FLAGS.filter((f) => j[f]);
  const marks = `marks:${inParty(world)
    .map((m) => world.member(m).marks)
    .join(',')}`;
  const steps = mainQuest(world).map((l, i) => `${STEPS[i].id}:${l.label === MYSTERY ? '?' : stepState(world, STEPS[i].id).right}`);
  return [...flags, ...[...j.clues].sort(), ...[...j.words].sort(), ...[...j.goals].sort(), marks, ...steps];
}

/** Note what the journal shows as seen; true if it differed from the last note. */
export function journalSnapshot(world: World): boolean {
  const now = snapshot(world);
  const before = world.journal.seen;
  if (now.length === before.length && now.every((s, i) => s === before[i])) return false;
  world.journal.seen = now;
  return true;
}

/**
 * A journal saved before words and goals were recorded: the words from the clues heard, and each dungeon's goals
 * from the marks held - a mark counted found in a dungeon whose rod for it the auto-map has seen. Then what it shows
 * is noted, so loading it announces nothing.
 */
export function upgradeJournal(world: World): void {
  const j = world.journal;
  for (const id of j.clues) {
    const word = CLUES[id]?.word;
    if (word && !j.words.includes(word)) j.words.push(word);
  }
  const held = inParty(world).reduce((bits, m) => bits | world.member(m).marks, 0);
  for (const dungeon of DUNGEONS) {
    const raw = world.resources.maps.get(dungeon.id);
    if (!raw) continue;
    for (let level = 0; level < 8; level++) {
      for (let i = 0; i < 256; i++) {
        if (raw[level * 256 + i] !== ROD) continue;
        const [x, y] = [i & 15, i >> 4];
        const mark = ROD_MARKS[x & 3];
        if (held & MARK_BITS[mark] && world.autoMap.isSeen(dungeon.id, level, x, y)) rodFound(world, dungeon.id, x);
      }
    }
  }
  journalSnapshot(world);
}

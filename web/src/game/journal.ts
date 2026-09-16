/**
 * journal.ts
 *
 * The quest journal (this port; the Apple II had none). It records what
 * the world has told the party and what the party has done along the
 * main line, so a newcomer can play without a walkthrough, and stays out
 * of the way of anyone who never opens it.
 *
 * Entries are revealed one at a time: the first, "Speak to the King",
 * is there from the start, and each later one appears once all before it
 * are done. An entry is open or done; the clues heard about it, kept as
 * spoken, are shown beneath it while it is the one in hand. Every entry
 * also has a hint, a plain line written for this port that the game
 * itself never speaks; it is printed to the message area only when asked
 * for, and nothing remembers the asking. Hints are kept short enough for
 * that area: sixteen columns, nine lines.
 *
 * Done is computed from the party where it can be (marks, cards, exotics,
 * the ending); the rest are events flagged as they happen. The whole
 * state lives in the save file.
 */

import type { World } from './world.ts';
import { Location } from './party.ts';
import type { GameIO } from './io.ts';

export type EntryState = 'open' | 'done';

export interface JournalState {
  lordBritish: boolean;
  ambrosia: boolean;
  timeLord: boolean;
  wordKnown: boolean;
  serpentParted: boolean;
  /** Clue ids heard, e.g. "Moon#6" or "LB:mark". */
  clues: string[];
  /** The revealed entries as last shown to the player (id, state, clues heard), to notice a change ("Journal updated"). */
  seen: string[];
}

export function emptyJournal(): JournalState {
  // `seen` starts as the opening page, so the first clue heard does not announce an update of nothing.
  return {
    lordBritish: false,
    ambrosia: false,
    timeLord: false,
    wordKnown: false,
    serpentParted: false,
    clues: [],
    seen: ['king:open:0'],
  };
}

export interface Entry {
  id: string;
  title: string;
  hint: string;
}

/** The main line, in the order the journal reveals it. */
export const ENTRIES: Entry[] = [
  { id: 'king', title: 'Speak to the King', hint: "Lord British sits in his castle north of Britain's town. Walk into him." },
  {
    id: 'kings',
    title: 'The Mark of Kings',
    hint: 'Level 1 of the Perinian Depths, north of Britain: step on the rod. Light: Lorum, Luminae, or torches from a guild.',
  },
  {
    id: 'ambrosia',
    title: 'Lost Ambrosia',
    hint: "Sail a frigate into the whirlpool; the ship is lost. Home from Ambrosia is a pirate's ship into the lake's whirlpool.",
  },
  {
    id: 'cards',
    title: 'The Four Cards',
    hint: "At the four shrines, Other and say SEARCH. Two lie past locked doors: bring keys and take a pirate's ship.",
  },
  {
    id: 'exotics',
    title: 'Exotic Arms',
    hint: 'Both moons new, Dawn shows west of the Montors and tells of them. Other, DIG on the far north isle and the western isle, once per member.',
  },
  {
    id: 'fire',
    title: 'The Mark of Fire',
    hint: 'Level 8 of the Perinian Depths, the Fires of Hell or Morinia. Each member needs it to cross lava.',
  },
  {
    id: 'force',
    title: 'The Mark of Force',
    hint: "Level 8 of Doom or the Fires of Hell. Each member, for the force fields in Exodus' castle.",
  },
  {
    id: 'snake',
    title: 'The Silver Snake',
    hint: 'Mark of Snake: level 8 of Clues. PRAY in the circle of light in Yew for the word. Yell it beside the serpent.',
  },
  {
    id: 'order',
    title: 'Order of the Cards',
    hint: 'The Time Lord waits on level 8 of Time Awaits, near Death Gulch. He names the order of the cards.',
  },
  {
    id: 'exodus',
    title: 'Exodus',
    hint: "Exodus' castle: the south-west isle, past the serpent. Only exotics bite. INSERT the cards left to right in the Time Lord's order.",
  },
];

/**
 * Townsfolk lines that bear on the main line: town name and speaker
 * number in the talk table, and the entries each speaks to. The words
 * themselves come from the talk table at the time, so they are shown as
 * spoken.
 */
const TOWN_CLUES: Record<string, string[]> = {
  'LCB Towne#2': ['ambrosia'],
  'LCB Towne#3': ['exotics'],
  'LCB Towne#4': ['snake'],
  'LCB Towne#5': ['exotics'],
  'Moon#2': ['cards'],
  'Moon#3': ['order'],
  'Moon#6': ['ambrosia'],
  'Moon#7': ['exotics'],
  'Yew#1': ['cards'],
  'East Montor#1': ['order'],
  'East Montor#2': ['order'],
  'East Montor#5': ['cards'],
  'East Montor#6': ['kings'],
  'East Montor#7': ['exotics'],
  'West Montor#5': ['cards'],
  'West Montor#6': ['cards'],
  'Grey#3': ['exotics'],
  'Grey#4': ['exotics'],
  'Grey#5': ['exotics'],
  'Dawn#2': ['exotics'],
  'Dawn#3': ['exotics'],
  'Dawn#4': ['exotics'],
  'Dawn#6': ['exotics'],
  'Dawn#7': ['ambrosia'],
  'Devil Guard#1': ['kings'],
  'Devil Guard#2': ['kings'],
  'Devil Guard#3': ['kings'],
  'Devil Guard#4': ['snake'],
  'Devil Guard#5': ['kings', 'fire', 'force', 'snake'],
  'Devil Guard#7': ['kings'],
  'Fawn#1': ['snake'],
  'Fawn#2': ['snake'],
  'Fawn#3': ['snake'],
  'Fawn#4': ['snake'],
  'Death Gulch#2': ['order'],
  'Death Gulch#3': ['order', 'exodus'],
  'Death Gulch#4': ['snake'],
  'Death Gulch#5': ['snake'],
};

/** Clues that are not townsfolk lines: the id, who said it, the words, and the entries. */
const OTHER_CLUES: Record<string, { from: string; text: string; entries: string[] }> = {
  'LB:mark': { from: 'Lord British', text: 'SEEK YE, THE MARK OF KINGS!', entries: ['kings'] },
  'Yew:pray': { from: 'Yew, the circle of light', text: "YELL 'EVOCARE'", entries: ['snake'] },
  TimeLord: { from: 'The Time Lord', text: 'THE ONE WAY IS LOVE, SOL, MOONS & DEATH, ALL ELSE FAILS.', entries: ['order', 'exodus'] },
};

export interface JournalLine {
  id: string;
  title: string;
  state: EntryState;
  /** A short progress note ("2 of 4"). */
  note: string;
  /** Clues heard about it, as spoken, with the speaker's town. */
  clues: { from: string; text: string }[];
  hint: string;
}

/** The living members' names, for a holder list. */
function holders(world: World, has: (m: number) => boolean): string {
  return [0, 1, 2, 3]
    .filter((m) => world.party.memberSlot(m) >= 0 && has(m))
    .map((m) => world.member(m).name)
    .join(', ');
}

function markHolders(world: World, bit: number): string {
  return holders(world, (m) => (world.member(m).marks & bit) !== 0);
}

/** Whether an entry is done, and its progress note, from the party and the flags. */
function progress(world: World, id: string): { done: boolean; note: string } {
  const j = world.journal;
  const inParty = [0, 1, 2, 3].filter((m) => world.party.memberSlot(m) >= 0);
  switch (id) {
    case 'king':
      return { done: j.lordBritish, note: '' };
    case 'kings': {
      const who = markHolders(world, 0x80);
      return { done: who !== '', note: who };
    }
    case 'ambrosia':
      return { done: j.ambrosia || world.party.location === Location.Ambrosia, note: '' };
    case 'cards': {
      const union = inParty.reduce((bits, m) => bits | (world.member(m).marks & 0x0f), 0);
      const n = [1, 2, 4, 8].filter((b) => union & b).length;
      return { done: n === 4, note: n ? `${n} of 4` : '' };
    }
    case 'exotics': {
      const weapons = world.party.weapons(15) + inParty.filter((m) => world.member(m).bytes[48] === 15).length;
      const armour = world.party.armour(7) + inParty.filter((m) => world.member(m).bytes[40] === 7).length;
      const note = weapons || armour ? `weapons ${weapons}, armour ${armour}` : '';
      return { done: weapons > 0 && armour > 0, note };
    }
    case 'fire': {
      const who = markHolders(world, 0x20);
      return { done: who !== '', note: who };
    }
    case 'force': {
      const who = markHolders(world, 0x10);
      return { done: who !== '', note: who };
    }
    case 'snake': {
      const who = markHolders(world, 0x40);
      const note = [who && `mark: ${who}`, j.wordKnown && 'the word is known'].filter(Boolean).join('; ');
      return { done: j.serpentParted, note };
    }
    case 'order':
      return { done: j.timeLord, note: '' };
    case 'exodus':
      return { done: world.party.exodusDestroyed, note: '' };
    default:
      return { done: false, note: '' };
  }
}

/** The clues heard for an entry, as spoken. */
function cluesFor(world: World, id: string): { from: string; text: string }[] {
  const out: { from: string; text: string }[] = [];
  for (const clue of world.journal.clues) {
    const other = OTHER_CLUES[clue];
    if (other) {
      if (other.entries.includes(id)) out.push({ from: other.from, text: other.text });
      continue;
    }
    const entries = TOWN_CLUES[clue];
    if (!entries || !entries.includes(id)) continue;
    const [town, n] = clue.split('#');
    out.push({ from: town, text: world.townLine(town, Number(n)) });
  }
  return out;
}

/** The journal as the player sees it: revealed entries only, in order. */
export function journalLines(world: World): JournalLine[] {
  const out: JournalLine[] = [];
  for (const entry of ENTRIES) {
    const { done, note } = progress(world, entry.id);
    const clues = cluesFor(world, entry.id);
    out.push({ id: entry.id, title: entry.title, state: done ? 'done' : 'open', note, clues, hint: entry.hint });
    if (!done) break; // the next entry stays hidden until this one is done
  }
  return out;
}

/** The journal page: every entry's title, the selected one expanded with its note and clues. */
export interface JournalPage {
  lines: string[];
  /** The line of the selected entry's title. */
  cursorLine: number;
}

/**
 * Lay out the journal page for `entries`, expanding the entry at `selected`
 * (clamped to the list) with its progress note and every clue heard.
 * `width` is the page's width in characters; `wrap` wraps a paragraph to it.
 */
export function journalPage(
  entries: JournalLine[],
  selected: number,
  width: number,
  wrap: (text: string, width: number, max: number) => string[],
): JournalPage {
  const lines: string[] = [];
  let cursorLine = 0;
  const pick = Math.max(0, Math.min(entries.length - 1, selected));
  entries.forEach((e, i) => {
    if (lines.length) lines.push('');
    if (i === pick) cursorLine = lines.length;
    lines.push(`${e.state === 'done' ? '*' : '-'} ${e.title}`);
    if (i !== pick) return;
    if (e.note) lines.push(...wrap(e.note, width, 4));
    for (const clue of e.clues) {
      lines.push('');
      lines.push(...wrap(`${clue.from}: ${clue.text}`, width, 12));
    }
  });
  return { lines, cursorLine };
}

/** Record a townsperson's line. Returns true if it was a new clue. */
export function hearTownLine(world: World, town: string, speaker: number): boolean {
  const id = `${town}#${speaker}`;
  if (!TOWN_CLUES[id] || world.journal.clues.includes(id)) return false;
  world.journal.clues.push(id);
  return true;
}

/** Record one of the other clues (Lord British, the prayer, the Time Lord). */
export function hearClue(world: World, id: string): void {
  if (OTHER_CLUES[id] && !world.journal.clues.includes(id)) world.journal.clues.push(id);
}

/**
 * After anything that may move the journal on: compare the revealed
 * entries (their states and the clues heard about them) with those last
 * noted and, on a change, note the new ones and print "Journal updated".
 * A clue for an entry not yet revealed changes nothing visible.
 */
export function journalCheck(world: World, io: GameIO): boolean {
  if (!journalSnapshot(world)) return false;
  io.print('Journal updated\n');
  return true;
}

/** Note the revealed entries' states as seen; true if they differed from the last note. */
export function journalSnapshot(world: World): boolean {
  const now = journalLines(world).map((l) => `${l.id}:${l.state}:${l.clues.length}`);
  const before = world.journal.seen;
  if (now.length === before.length && now.every((s, i) => s === before[i])) return false;
  world.journal.seen = now;
  return true;
}

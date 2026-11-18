/**
 * textCase.ts
 *
 * The game's capitals toned down, for the modern sets (help.ts isModern): what the 1983 game wrote all in capitals -
 * the townspeople, the shops, the traps, the winds, the title - in sentence case as it is drawn, the names kept as
 * names (Lord British, Sosaria, the Mark of Kings, the spells' words) and the shouts kept as shouts (ARGH! BLAH! YUK!,
 * ****VICTORY!****). Only words wholly in capitals change, so text already in mixed case (this port's own, and what it
 * changed before) is left as it is, and changing it twice changes nothing. The strings themselves are untouched; the
 * other sets draw them as the original did.
 */

/** Words drawn as names, wherever they fall. */
const NAMES = [
  'Sosaria',
  'Ambrosia',
  'Exodus',
  'Britannia',
  'Ultima',
  'Dupre',
  'Iolo',
  'Shamino',
  'Gwino',
  'Sentri',
  'Shawn',
  'Cookie',
  'Chuckles',
  'Radrion',
  'Dawn',
  'Fawn',
  'Faun',
  'Yew',
  'Montor',
  'Morinia',
  'Perinian',
  "Dardin's",
  'Hell',
  'Heaven',
  'Trammel',
  'Felucca',
  'Evocare',
  'Pub',
  'King',
];

/** Runs of words drawn as names: the people, places and things with names of more than a word. */
const PHRASES = [
  'Lord British',
  'Time Lord',
  'Death Gulch',
  'Devil Guard',
  'Castle Fire',
  'Castle Death',
  'Silver Snake',
  'Circle of Light',
  'Shrines of Truth',
  'Fires of Hell',
  'Dungeon of Fire',
  'Dungeon of Doom',
  'Mines of Morinia',
  'Perinian Depths',
  "Dardin's Pit",
  'Jolly Joe',
  'Baby Bob',
  'Guild Shop',
  'Weapons Shop',
  'Armour Shop',
  'Equine Emporium',
  'City of the Sea',
  'Gremlin City',
  'Devils Den',
  'Chamber of Fire',
  'Stair to Heaven',
  'Terror Tunnels',
  'Misty Mines',
  'Mines of Madness',
  'Collasal Cavern',
  'Golden Center',
  'Mark of Kings',
  'Mark of Fire',
  'Mark of Force',
  'Mark of Snake',
  'Mark of the Snake',
  'Marks of Kings',
  'Card of Death',
  'Card of Sol',
  'Card of Love',
  'Card of Moons',
];

/** Words kept in capitals: abbreviations and numerals. */
const KEEP = new Set([
  ...['STR', 'DEX', 'INT', 'WIS', 'EXP', 'HP', 'MP', 'XP', 'CMD', 'DNG', 'POWD', 'TRCH', 'OK'],
  // Numerals, the machines and their screens, the port's own abbreviations (the tile sets' names, its settings).
  ...['II', 'III', 'IV', 'PC', 'VGA', 'MCGA', 'EGA', 'CGA', 'CRT', 'TV', 'NES', 'LB', 'LCB', 'FX', 'UI', 'WASD', 'JSON'],
]);

/** A text with any of these in it is a shout or a banner, kept in capitals whole. */
const SHOUTS = new Set(['ARGH', 'BLAH', 'YUK', 'YUCK', 'SHAZAM', 'VICTORY', 'CONFLICT', 'AIEEEEE', 'KILLED', 'HIT']);

/** Texts that read better put by hand than by the rules: a heading over a list, a name split across lines. */
const BY_HAND: [string, string][] = [
  ['THE GUILD SHOP\nWE HAVE:', 'The Guild Shop\nWe have:'],
  ['CLERICAL HEALING\nSACRAMENTS:', 'Clerical Healing\nSacraments:'],
  ['    YE LOCAL\n     GROCER', '    Ye Local\n     Grocer'],
  ['PRESS  <SPACE>', 'Press  <Space>'],
  [' MOVES\nREPORT THY FEAT!', ' moves\nReport thy feat!'],
];

const WORD = /[A-Za-z][A-Za-z']*/y;
const isCaps = (w: string): boolean => /[A-Z]/.test(w) && !/[a-z]/.test(w);

export class TextCaser {
  private readonly names = new Map<string, string>();
  /** Phrases by their first word: the words in capitals, and how each is drawn. */
  private readonly phrases = new Map<string, { words: string[]; drawn: string[] }[]>();
  private readonly cache = new Map<string, string>();
  /** Words kept as they are written: the characters' names, as their players typed them. */
  private kept = new Set<string>();
  /** Whether the text being cased keeps the names (run). */
  private keeping = false;

  /** With `more` names besides the game's own: the spells' words, say ("DOR ACRON"), drawn as written there. */
  constructor(more: string[] = []) {
    for (const name of NAMES) this.names.set(name.toUpperCase(), name);
    for (const phrase of [...PHRASES, ...more]) {
      const drawn = phrase.split(' ');
      const words = drawn.map((w) => w.toUpperCase());
      if (words.length === 1) {
        this.names.set(words[0], drawn[0]);
        continue;
      }
      const list = this.phrases.get(words[0]) ?? [];
      list.push({ words, drawn });
      list.sort((a, b) => b.words.length - a.words.length); // the longest first
      this.phrases.set(words[0], list);
    }
  }

  /** Keep `words` as written wherever they fall (the roster's names); true if that changed what is kept. */
  keep(words: string[]): boolean {
    const next = new Set(words.filter((w) => isCaps(w)));
    if (next.size === this.kept.size && [...next].every((w) => this.kept.has(w))) return false;
    this.kept = next;
    this.cache.clear();
    return true;
  }

  /** A name in capitals ("DOR ACRON") as a name is written ("Dor Acron"). */
  static titled(text: string): string {
    return text.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  }

  /** `text` drawn on its own: a line, a label, a heading - its first word a sentence's. */
  line(text: string): string {
    if (text.length < 2 || !/[A-Z]{2}/.test(text)) return text;
    let out = this.cache.get(text);
    if (out === undefined) {
      out = this.run(text, true).text;
      if (this.cache.size > 2000) this.cache.clear();
      this.cache.set(text, out);
    }
    return out;
  }

  /**
   * `text` as the next of a stream of it (the message area), `start` whether a sentence begins where it does: the
   * text, and whether a sentence begins after it.
   */
  run(text: string, start: boolean): { text: string; start: boolean } {
    for (const [from, to] of BY_HAND) text = text.split(from).join(to);
    const words = text.match(/[A-Za-z']+/g) ?? [];
    const shout = words.some((w) => SHOUTS.has(w));
    // A character's name is kept as typed where it stands among nothing else in capitals (a label, the party's boxes,
    // a fight's lines), not in the game's own lines: a "WILL" there is the word, not the character.
    const capitals = words.map((w) => w.replace(/'+$/, '')).filter((w) => w.length > 1 && isCaps(w) && !KEEP.has(w));
    this.keeping = capitals.length > 0 && capitals.every((w) => this.kept.has(w));
    let out = '';
    let lettersYet = false;
    let lastMark = ''; // the last character not a space
    let lastWord = ''; // the last word, for an abbreviation's full stop (g.p.)
    let bracket = false; // inside <...>: a command's name, kept
    for (let i = 0; i < text.length; ) {
      const ch = text[i];
      WORD.lastIndex = i;
      const m = WORD.exec(text);
      if (!m) {
        if (ch === '<' && /[A-Za-z]/.test(text[i + 1] ?? '')) bracket = true;
        else if (ch === '>') bracket = false;
        if (ch === '\n') {
          // A line that ended a sentence, or the text's first, begins one; a line run on does not.
          if ('.!?:'.includes(lastMark) || !lettersYet) start = true;
        } else if ('!?'.includes(ch) || (ch === '.' && lastWord.length > 1)) start = true;
        else if (/[0-9]/.test(ch)) {
          // A number begins the sentence it starts ("4 cards, 4 slots").
          start = false;
          lettersYet = true;
        }
        if (ch !== ' ' && ch !== '\n') lastMark = ch;
        out += ch;
        i++;
        continue;
      }
      // A run of words that is a name.
      const phrase = !shout && !bracket ? this.phraseAt(text, i, m[0]) : null;
      if (phrase) {
        out += phrase.drawn;
        i = phrase.end;
      } else {
        out += shout || bracket ? m[0] : this.word(m[0], start, text.slice(i + m[0].length));
        i += m[0].length;
      }
      lastWord = m[0];
      start = false;
      lettersYet = true;
      lastMark = 'a';
    }
    return { text: out, start };
  }

  /** The phrase starting with the word `first` at `at` in `text`, if one does: as drawn, and where it ends. */
  private phraseAt(text: string, at: number, first: string): { drawn: string; end: number } | null {
    const candidates = this.phrases.get(first);
    if (!candidates) return null;
    for (const { words, drawn } of candidates) {
      let i = at;
      let ok = true;
      const parts: string[] = [];
      for (let k = 0; k < words.length && ok; k++) {
        if (k > 0) {
          const gap = /^ +/.exec(text.slice(i));
          if (!gap) ok = false;
          else {
            parts.push(gap[0]);
            i += gap[0].length;
          }
        }
        WORD.lastIndex = i;
        const m = WORD.exec(text);
        if (!ok || !m || m[0] !== words[k]) ok = false;
        else {
          parts.push(drawn[k]);
          i += m[0].length;
        }
      }
      if (ok) return { drawn: parts.join(''), end: i };
    }
    return null;
  }

  /** One word: left as it is unless all in capitals, then a name, an abbreviation, or lower case (a sentence's first capitalised). */
  private word(word: string, start: boolean, rest: string): string {
    if (!isCaps(word)) return word;
    // A quote's closing mark ('CARDS') is the word's own; the word is read without it.
    const quote = /'+$/.exec(word)?.[0] ?? '';
    const w = word.slice(0, word.length - quote.length);
    return this.bare(w, start, rest) + quote;
  }

  private bare(w: string, start: boolean, rest: string): string {
    if (this.keeping && this.kept.has(w)) return w;
    const name = this.names.get(w);
    if (name) return name;
    if (KEEP.has(w)) return w;
    if (w === 'I' || w.startsWith("I'")) return 'I' + w.slice(1).toLowerCase();
    if (w.length === 1) {
      // A letter on its own is a key or a label (F,G,E,W,A:), but for the article "A" before a word.
      if (w !== 'A' || !/^[ \n]+['"]?[A-Za-z]/.test(rest)) return w;
      return start ? 'A' : 'a';
    }
    const lower = w.toLowerCase();
    return start ? lower[0].toUpperCase() + lower.slice(1) : lower;
  }
}

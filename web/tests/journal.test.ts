import { describe, it, expect } from 'vitest';
import { FakeIO, newWorld, savedCopy } from './helpers.ts';
import { World } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapValue } from '../src/game/tiles.ts';
import { MapId } from '../src/data/resources.ts';
import {
  CLUES,
  WORDS,
  emptyJournal,
  hearClue,
  journalCard,
  journalCheck,
  journalTop,
  knownWords,
  readWriting,
  rodFound,
  type JournalLine,
} from '../src/game/journal.ts';
import { wrapText } from '../src/ui/menus.ts';
import { talkTo, transactToward, otherCommand } from '../src/game/interact.ts';
import { shop } from '../src/game/shops.ts';
import { board } from '../src/game/commands.ts';
import { restore, SAVE_VERSION, type SaveData } from '../src/game/save.ts';
import { CARD_ROWS, Key } from '../src/game/io.ts';

/** A world standing in a town map (id) on an empty floor with no townsfolk. */
function inTown(id: number): { world: World; io: FakeIO } {
  const world = newWorld(99);
  const locX = world.resources.misc.locationX[id - 400];
  world.returnX = world.party.surfaceX = locX;
  world.returnY = world.party.surfaceY = 19;
  world.enterMap(id);
  world.party.location = id === MapId.LordBritishCastle ? Location.Castle : Location.Town;
  world.current.tiles.fill(MapValue.Floor);
  world.monsters.bytes.fill(0);
  world.x = 20;
  world.y = 20;
  return { world, io: new FakeIO(world.resources) };
}

/** Put a townsperson with talk index `n` east of the party. */
function personEast(world: World, n: number): void {
  const m = world.monsters;
  m.setType(0, MapValue.Merchant);
  m.setTileUnder(0, MapValue.Floor);
  m.setPosition(0, 21, 20);
  m.setHp(0, n); // the low nibble of the hp byte is the talk index
}

/** A section of the journal's top, by name. */
function section(world: World, name: string): JournalLine {
  const line = journalTop(world).find((l) => l.name === name);
  if (!line) throw new Error(`no ${name}`);
  return line;
}

/** A line of a section, by name. */
function lineOf(world: World, sectionName: string, name: string): JournalLine {
  const line = section(world, sectionName).open?.lines?.find((l) => l.name === name);
  if (!line) throw new Error(`no ${name} in ${sectionName}`);
  return line;
}

const labels = (world: World, name: string) => section(world, name).open!.lines!.map((l) => l.label.trim());

/** Every line in the journal, opened all the way down. */
function everyLine(world: World): JournalLine[] {
  const out: JournalLine[] = [];
  const walk = (lines: JournalLine[]) => {
    for (const l of lines) {
      out.push(l);
      if (l.open?.lines) walk(l.open.lines);
    }
  };
  walk(journalTop(world));
  return out;
}

describe('the journal', () => {
  it('opens on the main quest, the towns, the dungeons, Ambrosia (a mystery) and the words', () => {
    const world = newWorld();
    expect(journalTop(world).map((l) => l.label)).toEqual([
      'Main quest       0/9',
      'Towns           0/11',
      'Rumours          0/9',
      'Dungeons         0/7',
      'Mystery...',
      'Equipment        0/5',
      'Words            0/7',
    ]);
    // Lord British and Exodus are known from the start; the rest wait to be heard of.
    expect(labels(world, 'Main quest')).toEqual([
      'Lord British',
      'Mystery...',
      'Mystery...',
      'Mystery...',
      'Mystery...',
      'Mystery...',
      'Mystery...',
      'Mystery...',
      'Exodus',
    ]);
    expect(labels(world, 'Words')).toEqual(Array(7).fill('Mystery...'));
  });

  it('a clue makes its main-quest steps known, and the step opens to it as spoken', async () => {
    const { world, io } = inTown(MapId.FirstTown);
    personEast(world, 3); // "only with exotic arms can you win"
    await talkTo(world, io, 0, 0);
    expect(world.journal.clues).toEqual(['LCB Towne#3']);
    expect(io.output).toContain('Journal updated');
    const exotics = lineOf(world, 'Main quest', 'Exotic arms');
    expect(exotics.label).toBe('Exotic arms      0/2');
    expect(exotics.open?.text).toEqual([`Britain: ${world.townLine('LCB Towne', 3)}`]);
    // A line that is no clue is not recorded, and one heard twice is recorded once, announced once.
    io.output = '';
    personEast(world, 1);
    await talkTo(world, io, 0, 0);
    personEast(world, 3);
    await talkTo(world, io, 0, 0);
    expect(world.journal.clues).toEqual(['LCB Towne#3']);
    expect(io.output).not.toContain('Journal updated');
  });

  it('a town counts its clues heard, and opens to them as spoken, the rest mysteries', async () => {
    const { world, io } = inTown(MapId.FirstTown);
    expect(lineOf(world, 'Towns', 'Britain').about).toBe('Undiscovered.');
    const { locationX, locationY } = world.resources.misc;
    world.autoMap.markSquares(MapId.Sosaria, [[locationX[2], locationY[2]]]);
    expect(lineOf(world, 'Towns', 'Britain').label).toBe('Britain         seen');
    world.autoMap.markSquares(MapId.FirstTown, [[20, 20]]);
    expect(lineOf(world, 'Towns', 'Britain').label).toBe('Britain          0/4');
    personEast(world, 2);
    await talkTo(world, io, 0, 0);
    const britain = lineOf(world, 'Towns', 'Britain');
    expect(britain.label).toBe('Britain          1/4');
    expect(britain.about).toBe('Entered. 1 of its 4 clues found.');
    expect(britain.open?.text).toEqual([world.townLine('LCB Towne', 2), 'Mystery...', 'Mystery...', 'Mystery...']);
    // "Quest ye unto lost Ambrosia" makes Ambrosia known.
    expect(section(world, 'Ambrosia').label).toBe('Ambrosia         0/4');
  });

  it("an audience with Lord British is a step done and one of his castle's clues, announced once", async () => {
    const { world, io } = inTown(MapId.LordBritishCastle);
    const m = world.monsters;
    m.setType(0, MapValue.LordBritish);
    m.setTileUnder(0, MapValue.Floor);
    m.setPosition(0, 21, 20);
    world.putXYVal(MapValue.LordBritish, 21, 20);
    io.keys = ['1'];
    await transactToward(world, io, 1, 0);
    expect(world.journal.lordBritish).toBe(true);
    expect(io.output).toContain('Journal updated');
    expect(lineOf(world, 'Main quest', 'Lord British').label).toBe('Lord British    done');
    expect(lineOf(world, 'Towns', 'Lord British').label).toBe('Lord British     1/3');
    io.output = '';
    io.keys = ['1'];
    await transactToward(world, io, 1, 0);
    expect(io.output).not.toContain('Journal updated'); // nothing changed the second time
  });

  it('"seek ye the Mark of Kings" is a clue from Lord British, kept under the step', async () => {
    const { world, io } = inTown(MapId.LordBritishCastle);
    const m = world.monsters;
    m.setType(0, MapValue.LordBritish);
    m.setTileUnder(0, MapValue.Floor);
    m.setPosition(0, 21, 20);
    const p = world.member(0);
    p.bytes[30] = 6; // level 7 with 600 max hit points, past level 5: the raise needs the mark
    p.bytes[28] = 2;
    p.bytes[29] = 0x58; // 600
    io.keys = ['1'];
    await transactToward(world, io, 1, 0);
    expect(io.output).toContain('SEEK YE');
    const kings = lineOf(world, 'Main quest', 'Mark of Kings');
    expect(kings.label).toBe('Mark of Kings    0/4');
    expect(kings.open?.text).toEqual(['Lord British: SEEK YE, THE MARK OF KINGS!']);
  });

  it('a step is known once a line names it; a line that only bears on it is listed under it then', () => {
    const world = newWorld();
    hearClue(world, 'Moon#2'); // "SEEK YE, THE SHRINES OF TRUTH"
    hearClue(world, 'Yew#1'); // "SEARCH, AND YE SHALL FIND!"
    expect(labels(world, 'Main quest')[2]).toBe('Mystery...');
    hearClue(world, 'East Montor#5'); // "'CARDS' ARE USEFUL!"
    expect(lineOf(world, 'Main quest', 'The four cards').open?.text).toEqual([
      `Moon: ${world.townLine('Moon', 2)}`,
      `Yew: ${world.townLine('Yew', 1)}`,
      `East Montor: ${world.townLine('East Montor', 5)}`,
    ]);
    // Every line that names a step bears on it too, and is listed under it.
    for (const [id, clue] of Object.entries(CLUES)) for (const step of clue.names ?? []) expect(clue.quest, id).toContain(step);
  });

  it('marks, cards and exotics are read from the party', () => {
    const world = newWorld();
    world.member(1).bytes[14] |= 0x80;
    let kings = lineOf(world, 'Main quest', 'Mark of Kings');
    expect(kings.label).toBe('Mark of Kings    1/4');
    expect(kings.about).toContain(`Held by ${world.member(1).name}.`);
    for (const m of [0, 2, 3]) world.member(m).bytes[14] |= 0x80;
    kings = lineOf(world, 'Main quest', 'Mark of Kings');
    expect(kings.label).toBe('Mark of Kings    4/4');
    expect(kings.about).toContain('Held by all.');
    world.member(0).bytes[14] |= 0x01;
    world.member(2).bytes[14] |= 0x04;
    const cards = lineOf(world, 'Main quest', 'The four cards');
    expect(cards.label).toBe('The four cards   2/4');
    expect(cards.about).toContain('Held: Love, Moons.');
    world.addGear(true, 15); // an exotic weapon
    expect(lineOf(world, 'Main quest', 'Exotic arms').about).toBe('Exotic weapons 1, armour 0, in the pack or in use.');
    world.addGear(false, 7);
    expect(lineOf(world, 'Main quest', 'Exotic arms').label).toBe('Exotic arms      2/2');
    expect(section(world, 'Main quest').label).toBe('Main quest       2/9'); // the Mark of Kings and the exotics
  });

  it("calls map 415 the Dungeon of the Snake, and the snake's step ready with the mark and the word (#35)", () => {
    const world = newWorld();
    expect(world.resources.mapNames.get(415)).toBe('Dungeon Snake');
    rodFound(world, 415, 2); // the Mark of Snake's rod (x & 3 = 2)
    expect(lineOf(world, 'Dungeons', 'Snake').label).toMatch(/^Snake +1\/1$/);
    // Fawn's 'INVOKE' line says what the invocation is.
    hearClue(world, 'Fawn#3');
    const fawn = lineOf(world, 'Main quest', 'Silver Snake').open;
    expect(fawn?.text?.join(' ') ?? '').toContain('The invocation: the word a prayer is answered with.');
    // The mark and the word: ready, the passing itself all that is left.
    world.member(0).bytes[14] |= 0x40;
    world.journal.words.push('EVOCARE');
    const snake = lineOf(world, 'Main quest', 'Silver Snake');
    expect(snake.label).toMatch(/ready$/);
    expect(snake.about).toContain('Next: yell the word');
  });

  it('praying in the circle of light in Yew teaches EVOCARE, a clue of Yew and of the snake', async () => {
    const { world, io } = inTown(404); // Yew
    world.x = 0x30;
    world.y = 0x30;
    io.keys = ['1'];
    io.inputs = ['PRAY'];
    await otherCommand(world, io);
    expect(io.output).toContain('EVOCARE');
    expect(world.journal.words).toEqual(['EVOCARE']);
    expect(lineOf(world, 'Towns', 'Yew').label).toBe('Yew              1/3');
    expect(lineOf(world, 'Main quest', 'Silver Snake').about).toBe('The mark: not held. The word: EVOCARE.');
    expect(lineOf(world, 'Words', 'EVOCARE').about).toContain('Silver Snake');
    // Elsewhere in Yew it does nothing.
    world.journal = emptyJournal();
    world.x = 20;
    io.keys = ['1'];
    io.inputs = ['PRAY'];
    await otherCommand(world, io);
    expect(world.journal.words).toEqual([]);
  });

  it('a word is learnt from those who say it, and Other offers a controller only those learnt', async () => {
    const { world, io } = inTown(408); // Dawn
    personEast(world, 2); // "<DIG> ON ISLES"
    await talkTo(world, io, 0, 0);
    expect(knownWords(world)).toEqual(['DIG']);
    hearClue(world, 'Moon#3'); // "<BRIBE> GUARDS! THEY WILL LEAVE!"
    expect(knownWords(world)).toEqual(['BRIBE', 'DIG']); // in Other's order
    expect(labels(world, 'Words')).toEqual(['Mystery...', 'BRIBE', 'Mystery...', 'Mystery...', 'Mystery...', 'DIG', 'Mystery...']);
    io.keys = ['1'];
    io.inputs = ['SCREAM']; // a keyboard may still type any word
    await otherCommand(world, io);
    expect(io.wordsOffered).toEqual(['BRIBE', 'DIG']);
    expect(io.output).toContain('AIEEEEE');
  });

  it('"Peace be with you" in Moon teaches PAXUM, a word under Words but not one of Moon\'s clues', async () => {
    const { world, io } = inTown(403); // Moon
    world.autoMap.markSquares(403, [[20, 20]]);
    journalCheck(world, io);
    io.output = '';
    personEast(world, 5);
    await talkTo(world, io, 0, 0);
    expect(io.output.replace(/\s+/g, ' ')).toContain('PEACE BE WITH YOU');
    expect(knownWords(world)).toEqual(['PAXUM']);
    expect(lineOf(world, 'Towns', 'Moon').label).toBe('Moon             0/4');
    expect(lineOf(world, 'Words', 'PAXUM').about).toContain('Pax: peace.');
    expect(io.output).toContain('Journal updated');
  });

  it("the writing on the walls of the Snake's dungeon teaches INSERT and SEARCH", () => {
    const world = newWorld();
    expect(readWriting(world, 415, 1)).toBe(true);
    expect(readWriting(world, 415, 1)).toBe(false);
    expect(readWriting(world, 415, 0)).toBe(false); // "CLUES TO FOLLOW!" teaches nothing
    readWriting(world, 415, 2);
    expect(knownWords(world)).toEqual(['SEARCH', 'INSERT']);
    // "INSERT CARDS" names the cards; the order of them it only bears on.
    expect(lineOf(world, 'Main quest', 'The four cards').open?.text).toEqual([
      'Snake, level 2: <INSERT> CARDS INTO EXODUS!',
      'Snake, level 3: <SEARCH> THE SHRINES!',
    ]);
    expect(labels(world, 'Main quest')[7]).toBe('Mystery...');
  });

  it('a dungeon is a mystery till seen or told of, then seen, then entered with its goals found counted', () => {
    const world = newWorld();
    const { locationX, locationY } = world.resources.misc;
    expect(labels(world, 'Dungeons')).toEqual(Array(7).fill('Mystery...'));
    hearClue(world, 'Devil Guard#6'); // "SEEK YE THE DUNGEON OF FIRE!"
    expect(lineOf(world, 'Dungeons', 'Fires of Hell').about).toBe('Heard of, not yet found.');
    world.autoMap.markSquares(MapId.Sosaria, [[locationX[16], locationY[16]]]);
    expect(lineOf(world, 'Dungeons', 'Perinian Depths').label).toBe('Perinian Depths seen');
    world.autoMap.mark(416, 0, 1, 1);
    let depths = lineOf(world, 'Dungeons', 'Perinian Depths');
    expect(depths.label).toBe('Perinian Depths  0/2');
    expect(depths.about).toBe('Entered. What it holds for the quest is yet to be found.');
    rodFound(world, 416, 15); // a Mark of Kings' rod (column 15: 15 & 3 is 3)
    depths = lineOf(world, 'Dungeons', 'Perinian Depths');
    expect(depths.label).toBe('Perinian Depths  1/2');
    expect(depths.about).toBe('Entered. Found here: the Mark of Kings. More lies within.');
    rodFound(world, 416, 5); // the Mark of Fire
    expect(lineOf(world, 'Dungeons', 'Perinian Depths').label).toBe('Perinian Depths  2/2');
    expect(section(world, 'Dungeons').label).toBe('Dungeons         1/7');
    world.journal.timeLord = true;
    expect(lineOf(world, 'Dungeons', 'Time Awaits').label).toBe('Time Awaits      1/1');
  });

  it('Dawn is a mystery till it is told of or seen standing', () => {
    const world = newWorld();
    expect(labels(world, 'Towns')).toContain('Mystery...');
    hearClue(world, 'Lord British Castle#1'); // "WEST-8, SOUTH-35, AND AWAIT DAWN!"
    expect(lineOf(world, 'Towns', 'Dawn').about).toBe('Heard of. It stands only while both moons are new.');
  });

  it('Devil Guard, Fawn and Death Gulch, on their isles, are mysteries till seen, entered or told of', () => {
    const world = newWorld();
    expect(labels(world, 'Towns').slice(-3)).toEqual(['Mystery...', 'Mystery...', 'Mystery...']);
    const { locationX, locationY } = world.resources.misc;
    world.autoMap.markSquares(MapId.Sosaria, [[locationX[10], locationY[10]]]);
    expect(lineOf(world, 'Towns', 'Fawn').label).toBe('Fawn            seen');
    hearClue(world, 'Radrion:3'); // "Learn their use in Devil Guard"
    expect(lineOf(world, 'Towns', 'Devil Guard').about).toBe('Heard of, not yet found.');
    expect(labels(world, 'Towns').at(-1)).toBe('Mystery...'); // Death Gulch: nothing names it
    world.autoMap.markSquares(411, [[20, 20]]);
    expect(lineOf(world, 'Towns', 'Death Gulch').label).toBe('Death Gulch      0/2');
  });

  it("every townsperson's clue is a line someone in that town says", () => {
    const world = newWorld();
    for (const id of Object.keys(CLUES)) {
      const [town, n] = id.split('#');
      if (n === undefined) continue;
      const map = [...world.resources.mapNames].find(([, name]) => name === town)?.[0];
      expect(map, id).toBeDefined();
      world.enterMap(map!);
      const m = world.monsters;
      const speakers = [...Array(32).keys()].filter(
        (i) => m.type(i) !== 0 && m.type(i) !== MapValue.LordBritish && m.talkIndex(i) === Number(n),
      );
      expect(speakers.length, id).toBeGreaterThan(0);
    }
  });

  it("Equipment: a guild, Dawn's magic weapons and armour, and a ship, each done once found", async () => {
    const { world, io } = inTown(407); // Grey
    expect(labels(world, 'Equipment')).toEqual(['Supplies', 'Magic Weapons', 'Magic Armour', 'Ships', 'Mystery...']);
    expect(lineOf(world, 'Equipment', 'Supplies').about).toBe('Find a guild to get adventuring supplies.');
    io.keys = ['N'];
    await shop(world, io, 5, 0); // the guild: nothing bought
    expect(lineOf(world, 'Equipment', 'Supplies').label).toBe('Supplies        done');
    // Grey's weapon shop is an ordinary one; Dawn's sells the magic arms.
    io.keys = ['N', 'B', Key.Escape];
    await shop(world, io, 3, 0);
    expect(world.journal.magicWeapons).toBe(false);
    world.party.surfaceX = 37; // Dawn
    io.keys = ['N', 'B', Key.Escape];
    await shop(world, io, 3, 0);
    io.keys = ['N', 'B', Key.Escape];
    await shop(world, io, 4, 0);
    expect(labels(world, 'Equipment')).toEqual([
      'Supplies        done',
      'Magic Weapons   done',
      'Magic Armour    done',
      'Ships',
      'Mystery...',
    ]);
    expect(section(world, 'Equipment').label).toBe('Equipment        3/5');
  });

  it('boarding a ship marks Ships done and updates the journal', () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    journalCheck(world, io);
    world.putXYVal(MapValue.Frigate, world.x, world.y);
    board(world, io);
    expect(lineOf(world, 'Equipment', 'Ships').label).toBe('Ships           done');
    expect(io.output).toContain('Journal updated');
  });

  it('the moongates are a mystery till told of or come out of, then counted', () => {
    const world = newWorld();
    expect(labels(world, 'Equipment').at(-1)).toBe('Mystery...');
    hearClue(world, 'Pub:3'); // "The conjunction of the moons finds link!"
    expect(lineOf(world, 'Equipment', 'Moongates').label).toBe('Moongates        0/8');
    world.gatesKnown.push(7);
    const gates = lineOf(world, 'Equipment', 'Moongates');
    expect(gates.label).toBe('Moongates        1/8');
    expect(gates.about).toContain('Come out of 1 of 8.');
    expect(gates.hint).toContain('Time Awaits');
  });

  it("a pub's rumour and Radrion's verse are clues: the Lord of Time, and Devil Guard", async () => {
    const { world, io } = inTown(MapId.FirstTown);
    world.party.gold = 1000;
    io.inputs = ['90']; // a drink for 90 gold: the best rumour
    io.keys = ['N'];
    await shop(world, io, 0, 0);
    const order = lineOf(world, 'Main quest', "Cards' order");
    expect(order.open?.text).toEqual(['A pub: Seek ye out the Lord of Time, and the one way is a sure find!']);
    io.keys = ['3', 'N']; // 300 gold to Radrion: his third verse
    await shop(world, io, 6, 0);
    expect(world.journal.clues).toContain('Radrion:3');
    expect(lineOf(world, 'Towns', 'Devil Guard').about).toBe('Heard of, not yet found.');
    expect(labels(world, 'Main quest')[4]).toBe('Mystery...'); // the third verse names no mark
    io.keys = ['2', 'N']; // the second does: "fire, force, snake & king"
    await shop(world, io, 6, 0);
    expect(lineOf(world, 'Main quest', 'Mark of Fire').open?.text).toEqual([
      "Radrion: Learn their use in Devil Guard, or death you'll surely bring.",
      'Radrion: Of marks I say there are but 4 of fire, force, snake & king.',
    ]); // in the order heard
  });

  it("Rumours: the pubs' nine from the start, and Radrion's rhyme once he is met, each in order", async () => {
    const { world, io } = inTown(MapId.FirstTown);
    world.party.gold = 1000;
    expect(labels(world, 'Rumours')).toEqual(['Pub rumours      0/9', 'Mystery...']);
    io.inputs = ['20']; // a drink for 20 gold: the second rumour
    io.keys = ['N'];
    await shop(world, io, 0, 0);
    const pubs = lineOf(world, 'Rumours', 'Pub rumours');
    expect(pubs.label).toBe('Pub rumours      1/9');
    expect(pubs.open?.text?.slice(0, 3)).toEqual(['Mystery...', 'Dawn, the city of myths & magic!', 'Mystery...']);
    io.keys = ['0', 'N']; // an offering of nothing: Radrion's opening verse
    await shop(world, io, 6, 0);
    const radrion = lineOf(world, 'Rumours', 'Radrion');
    expect(radrion.label).toBe('Radrion          0/9');
    expect(radrion.open?.text?.[0]).toBe("And so the sage said unto thee 'If thou can solve my rhyme,");
    expect(section(world, 'Rumours').label).toBe('Rumours         1/18');
  });

  it("Ambrosia's shrines are named by the stat each raises, with the card found there", () => {
    const world = newWorld();
    world.journal.ambrosia = true;
    expect(labels(world, 'Ambrosia')).toEqual(['Strength', 'Dexterity', 'Intelligence', 'Wisdom']);
    world.member(3).bytes[14] |= 0x08;
    expect(lineOf(world, 'Ambrosia', 'Wisdom').label).toBe('Wisdom         Death');
    expect(section(world, 'Ambrosia').label).toBe('Ambrosia         1/4');
  });

  it('journalCheck prints only when what happens changes it, not a place newly seen', () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    journalCheck(world, io);
    io.output = '';
    expect(journalCheck(world, io)).toBe(false);
    world.autoMap.markSquares(MapId.Sosaria, [[46, 19]]);
    expect(journalCheck(world, io)).toBe(false);
    hearClue(world, 'TimeLord');
    expect(journalCheck(world, io)).toBe(true);
    world.member(0).bytes[14] |= 0x20; // a mark taken
    expect(journalCheck(world, io)).toBe(true);
    expect(io.output.match(/Journal updated/g)).toHaveLength(2);
  });

  it('every clue is a line the game has, and every line fits: the page, the card, the message area', () => {
    const world = newWorld();
    for (const id of Object.keys(CLUES)) {
      const [town, n] = id.split('#');
      if (n !== undefined) expect(world.townLine(town, Number(n)), id).not.toBe('');
    }
    // Everything known, so every line is drawn as itself, not a mystery.
    for (const id of Object.keys(CLUES)) hearClue(world, id);
    world.journal.lordBritish = world.journal.ambrosia = world.journal.timeLord = true;
    world.journal.guild = world.journal.magicWeapons = world.journal.magicArmour = world.journal.ship = true;
    world.journal.radrion = true;
    for (let id = 412; id <= 418; id++) world.autoMap.mark(id, 0, 1, 1); // every dungeon entered
    for (const m of [0, 1, 2, 3]) world.member(m).bytes[14] = 0xff;
    const lines = everyLine(world);
    expect(lines.some((l) => l.label === 'Mystery...')).toBe(false);
    expect(knownWords(world)).toEqual(WORDS.map((w) => w.word));
    for (const l of lines) {
      expect(l.label.length, l.label).toBeLessThanOrEqual(20);
      expect(journalCard(l).lines.length, l.name).toBeLessThanOrEqual(CARD_ROWS);
      const hint = wrapText(l.hint, 16, 20);
      expect(hint.length, l.name).toBeLessThanOrEqual(9);
      expect(hint.join(' ').length, l.name).toBe(l.hint.length); // nothing cut off
    }
  });

  it('is saved with the game, and an older save starts it empty', () => {
    const a = newWorld();
    a.journal.lordBritish = true;
    hearClue(a, 'Moon#3');
    rodFound(a, 416, 15);
    journalCheck(a, new FakeIO(a.resources));
    const data = savedCopy(a);
    expect(data.version).toBe(SAVE_VERSION);
    const b = new World(a.resources);
    expect(restore(b, data)).toBe(true);
    expect(b.journal).toEqual(a.journal);
    expect(b.journal).not.toBe(a.journal);

    const old: SaveData = { ...data, version: 4 };
    delete old.journal;
    const c = new World(a.resources);
    expect(restore(c, old)).toBe(true);
    expect(c.journal).toEqual(emptyJournal());

    const odd = { ...data, journal: { lordBritish: 'yes', clues: [1, 'Moon#6'], words: [], seen: null } } as unknown as SaveData;
    const d = new World(a.resources);
    expect(restore(d, odd)).toBe(true);
    expect(d.journal).toEqual({ ...emptyJournal(), clues: ['Moon#6'] });
  });

  it('a journal saved before words and goals has them worked out, and announces nothing', () => {
    const a = newWorld();
    a.member(0).bytes[14] |= 0x80; // the Mark of Kings
    const data = savedCopy(a);
    data.journal = {
      lordBritish: true,
      ambrosia: false,
      timeLord: false,
      wordKnown: true,
      serpentParted: false,
      clues: ['Yew:pray', 'Dawn#2'],
      seen: ['king:done:0', 'kings:open:0'],
    } as unknown as SaveData['journal'];
    const b = new World(a.resources);
    b.autoMap.mark(416, 0, 15, 11); // its rod on the Perinian Depths' first level seen
    b.autoMap.mark(413, 7, 5, 14); // and the Fires of Hell's Mark of Fire, which no one holds
    expect(restore(b, data)).toBe(true);
    expect(b.journal.words.sort()).toEqual(['DIG', 'EVOCARE']);
    expect(b.journal.goals).toEqual(['416:kings']);
    expect(journalCheck(b, new FakeIO(b.resources))).toBe(false);
  });

  it('a new game starts the journal afresh', () => {
    const world = newWorld();
    world.journal.lordBritish = true;
    world.newGame();
    expect(world.journal).toEqual(emptyJournal());
  });
});

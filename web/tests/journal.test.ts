import { describe, it, expect } from 'vitest';
import { FakeIO, newWorld, savedCopy } from './helpers.ts';
import { World } from '../src/game/world.ts';
import { Location } from '../src/game/party.ts';
import { MapValue } from '../src/game/tiles.ts';
import { MapId } from '../src/data/resources.ts';
import { journalLines, journalPage, journalCheck, hearClue, emptyJournal, ENTRIES } from '../src/game/journal.ts';
import { wrapText } from '../src/ui/menus.ts';
import { talkTo, transactToward, otherCommand } from '../src/game/interact.ts';
import { restore, SAVE_VERSION, type SaveData } from '../src/game/save.ts';

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

describe('the journal', () => {
  it('starts with "Speak to the King" alone and reveals the next entry only when the last is done', () => {
    const world = newWorld();
    expect(journalLines(world).map((l) => `${l.id}:${l.state}`)).toEqual(['king:open']);
    world.journal.lordBritish = true;
    expect(journalLines(world).map((l) => `${l.id}:${l.state}`)).toEqual(['king:done', 'kings:open']);
    world.member(0).bytes[14] |= 0x80; // the Mark of Kings
    expect(journalLines(world).map((l) => l.id)).toEqual(['king', 'kings', 'ambrosia']);
    expect(ENTRIES.map((e) => e.title.length).every((n) => n <= 18)).toBe(true); // "- " and the title fit 20 columns
  });

  it('an audience with Lord British completes the first entry and prints "Journal updated" once', async () => {
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
    io.output = '';
    io.keys = ['1'];
    await transactToward(world, io, 1, 0);
    expect(io.output).not.toContain('Journal updated'); // nothing changed the second time
  });

  it('"seek ye the Mark of Kings" is a clue from Lord British, kept under the entry', async () => {
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
    const kings = journalLines(world)[1];
    expect(kings.state).toBe('open');
    expect(kings.clues).toEqual([{ from: 'Lord British', text: 'SEEK YE, THE MARK OF KINGS!' }]);
  });

  it("records a townsperson's clue as spoken, shown only once its entry is revealed", async () => {
    const { world, io } = inTown(MapId.FirstTown);
    personEast(world, 3); // "only with exotic arms can you win"
    await talkTo(world, io, 0, 0);
    expect(world.journal.clues).toEqual(['LCB Towne#3']);
    expect(io.output).not.toContain('Journal updated'); // the entry is still hidden
    expect(journalLines(world).some((l) => l.id === 'exotics')).toBe(false);
    // A line that is no clue is not recorded, and one heard twice is recorded once.
    personEast(world, 1);
    await talkTo(world, io, 0, 0);
    personEast(world, 3);
    await talkTo(world, io, 0, 0);
    expect(world.journal.clues).toEqual(['LCB Towne#3']);
    // Reveal it: the earlier entries done.
    world.journal.lordBritish = world.journal.ambrosia = true;
    world.member(0).bytes[14] |= 0x8f;
    const exotics = journalLines(world).find((l) => l.id === 'exotics')!;
    expect(exotics.state).toBe('open');
    expect(exotics.clues).toEqual([{ from: 'LCB Towne', text: world.townLine('LCB Towne', 3) }]);
    expect(exotics.clues[0].text.toUpperCase()).toContain('EXOTIC');
    expect(exotics.clues[0].text).not.toContain('\n');
  });

  it('marks, cards and exotics are read from the party, with a progress note', () => {
    const world = newWorld();
    world.journal.lordBritish = true;
    world.member(1).bytes[14] |= 0x80;
    let lines = journalLines(world);
    expect(lines[1].state).toBe('done');
    expect(lines[1].note).toBe(world.member(1).name);
    world.journal.ambrosia = true;
    world.member(0).bytes[14] |= 0x01;
    world.member(2).bytes[14] |= 0x04;
    lines = journalLines(world);
    expect(lines[3].id).toBe('cards');
    expect(lines[3].state).toBe('open');
    expect(lines[3].note).toBe('2 of 4');
    world.member(0).bytes[14] |= 0x0f;
    world.addGear(true, 15); // an exotic weapon
    lines = journalLines(world);
    expect(lines[4].id).toBe('exotics');
    expect(lines[4].state).toBe('open');
    expect(lines[4].note).toBe('weapons 1, armour 0');
    world.addGear(false, 7);
    expect(journalLines(world)[4].state).toBe('done');
  });

  it('praying in the circle of light in Yew teaches the word and notes it', async () => {
    const { world, io } = inTown(404); // Yew
    world.x = 0x30;
    world.y = 0x30;
    io.keys = ['1'];
    io.inputs = ['PRAY'];
    await otherCommand(world, io);
    expect(io.output).toContain('EVOCARE');
    expect(world.journal.wordKnown).toBe(true);
    expect(world.journal.clues).toContain('Yew:pray');
    // Elsewhere in Yew it does nothing.
    world.journal = emptyJournal();
    world.x = 20;
    io.keys = ['1'];
    io.inputs = ['PRAY'];
    await otherCommand(world, io);
    expect(world.journal.wordKnown).toBe(false);
  });

  it('journalCheck prints only when a revealed entry changes state', () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    expect(journalCheck(world, io)).toBe(false); // the opening state is already noted
    hearClue(world, 'TimeLord'); // a clue for a hidden entry changes nothing visible
    expect(journalCheck(world, io)).toBe(false);
    world.journal.lordBritish = true;
    expect(journalCheck(world, io)).toBe(true);
    expect(io.output.match(/Journal updated/g)).toHaveLength(1);
  });

  it('keeps every hint short enough for the message area: sixteen columns, nine lines', () => {
    for (const entry of ENTRIES) {
      const lines = wrapText(entry.hint, 16, 20);
      expect(lines.length, entry.id).toBeLessThanOrEqual(9);
      expect(lines.join(' ').length, entry.id).toBe(entry.hint.length); // nothing cut off
    }
    expect(journalLines(newWorld())[0].hint).toContain('Lord British');
  });

  it('is saved with the game, and an older save starts it empty', () => {
    const a = newWorld();
    a.journal.lordBritish = true;
    a.journal.clues.push('LB:mark', 'Moon#6');
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

    const odd = { ...data, journal: { lordBritish: 'yes', clues: [1, 'Moon#6'], seen: null } } as unknown as SaveData;
    const d = new World(a.resources);
    expect(restore(d, odd)).toBe(true);
    expect(d.journal).toEqual({ ...emptyJournal(), clues: ['Moon#6'] });
  });

  it('a new game starts the journal afresh', () => {
    const world = newWorld();
    world.journal.lordBritish = true;
    world.newGame();
    expect(world.journal).toEqual(emptyJournal());
  });
});

describe('journalPage', () => {
  const wrap = (text: string, width: number) => [text.slice(0, width)];
  const entries = [
    { id: 'king', title: 'Speak to the King', state: 'done' as const, note: '', clues: [], hint: 'h1' },
    {
      id: 'kings',
      title: 'The Mark of Kings',
      state: 'open' as const,
      note: 'Not yet',
      clues: [{ from: 'Yew', text: 'Dig deep' }],
      hint: 'h2',
    },
  ];

  it('expands the selected entry and reports its title line', () => {
    const page = journalPage(entries, 1, 20, wrap);
    expect(page.lines).toEqual(['* Speak to the King', '', '- The Mark of Kings', 'Not yet', '', 'Yew: Dig deep']);
    expect(page.cursorLine).toBe(2);
    const first = journalPage(entries, 0, 20, wrap);
    expect(first.lines).toEqual(['* Speak to the King', '', '- The Mark of Kings']);
    expect(first.cursorLine).toBe(0);
  });

  it('clamps the selection to the list', () => {
    expect(journalPage(entries, 7, 20, wrap).cursorLine).toBe(2);
    expect(journalPage(entries, -3, 20, wrap).cursorLine).toBe(0);
  });
});

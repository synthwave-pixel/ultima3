import { describe, it, expect } from 'vitest';
import { TextCaser } from '../src/ui/textCase.ts';

const caser = new TextCaser(['Dor Acron']);
const cased = (s: string, start = true) => caser.run(s, start).text;

describe('sentence case', () => {
  it('lowers the capitals, a sentence begun with one', () => {
    expect(cased('WELCOME MY CHILD\n')).toBe('Welcome my child\n');
    expect(cased('TO ARMS! AND\nTO BATTLE!!')).toBe('To arms! And\nto battle!!');
    expect(cased('COOKIE CRIES:\nLIKE THE FOOD?')).toBe('Cookie cries:\nLike the food?');
    expect(cased('4 CARDS, 4 SLOTS')).toBe('4 cards, 4 slots');
    expect(cased("I'VE BEEN BEYOND\nTHE WHIRLPOOL!")).toBe("I've been beyond\nthe whirlpool!");
  });

  it('keeps names as names', () => {
    expect(cased('SEEK YE, THE\nMARK OF KINGS!')).toBe('Seek ye, the\nMark of Kings!');
    expect(cased('QUEST YE UNTO\nLOST AMBROSIA!')).toBe('Quest ye unto\nlost Ambrosia!');
    expect(cased('DOR ACRON')).toBe('Dor Acron');
    expect(cased("'DAWN' COMES")).toBe("'Dawn' comes");
  });

  it('keeps shouts, banners, keys, commands and abbreviations', () => {
    expect(cased('ARGH! BLAH! YUK!\n')).toBe('ARGH! BLAH! YUK!\n');
    expect(cased('\n****VICTORY!****\n\n')).toBe('\n****VICTORY!****\n\n');
    expect(cased('F,G,E,W,A:')).toBe('F,G,E,W,A:');
    expect(cased('<BRIBE> GUARDS!')).toBe('<BRIBE> guards!');
    expect(cased('NOT A DNG CMD!\n')).toBe('Not a DNG CMD!\n');
    expect(cased('RATIONS:\n1 g.p. EACH,')).toBe('Rations:\n1 g.p. each,');
    for (const set of ['PC VGA', 'PC MCGA', 'Apple II Color', 'PC EGA', 'PC CGA', 'PC Ultima V', 'Macintosh B&W', 'U3 2026'])
      expect(caser.line(set)).toBe(set);
  });

  it('leaves mixed case alone, and casing twice changes nothing', () => {
    expect(cased('Enter castle!')).toBe('Enter castle!');
    const once = cased('EXODUS LIES\nBEYOND THE\nSILVER SNAKE!');
    expect(once).toBe('Exodus lies\nbeyond the\nSilver Snake!');
    expect(cased(once)).toBe(once);
  });

  it("keeps the characters' names as typed, and the shops' names as names", () => {
    const c = new TextCaser();
    c.keep(['MIRA', 'Tatiana']);
    expect(c.line('MIRA')).toBe('MIRA');
    expect(c.line('1. MIRA          Fighter')).toBe('1. MIRA          Fighter');
    c.keep(['MIRA', 'WILL']);
    expect(c.line('WILL')).toBe('WILL');
    expect(c.line('THEY WILL LEAVE!')).toBe('They will leave!');
    expect(c.run('\nWelcome to the\nWEAPONS SHOP!\n', true).text).toBe('\nWelcome to the\nWeapons Shop!\n');
    expect(c.run('\nWELCOME TO\nTHE PUB!\n', true).text).toBe('\nWelcome to\nthe Pub!\n');
    expect(c.run('WELCOME TO FAWN,\nCITY OF THE SEA!', true).text).toBe('Welcome to Fawn,\nCity of the Sea!');
    expect(c.run('THE KING FAVORS\nA MARK!', true).text).toBe('The King favors\na mark!');
    expect(c.line('GREMLIN CITY!')).toBe('Gremlin City!');
  });

  it('carries a sentence on from one text to the next', () => {
    const first = caser.run('CONGRATULATIONS!\nTHOU HAST COMPLEATED\nEXODUS IN\n', true);
    expect(caser.run('1234', first.start).start).toBe(false);
    expect(caser.run(' MOVES\nREPORT THY FEAT!', false).text).toBe(' moves\nReport thy feat!');
  });
});

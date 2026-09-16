import { describe, expect, it } from 'vitest';
import { SPELL_FLASH } from '../src/game/spells.ts';

describe('where a spell flashes with the Standard tiles', () => {
  it('flashes the caster for bolts and self-directed spells', () => {
    for (const spell of [1, 5, 7, 11, 28, 9, 17, 27]) expect(SPELL_FLASH[spell]).toBe('caster');
  });

  it('flashes the recipient for heals, cures and resurrections', () => {
    for (const spell of [18, 26, 23, 29, 31]) expect(SPELL_FLASH[spell]).toBe('target');
  });

  it('flashes the whole view for the rest: arena spells, teleports and the light spells', () => {
    for (const spell of [0, 10, 13, 14, 16, 3, 4, 6, 22, 24, 2, 8, 19, 25, 32, 33, 34]) expect(SPELL_FLASH[spell]).toBeUndefined();
    expect(Object.keys(SPELL_FLASH)).toHaveLength(13);
  });
});

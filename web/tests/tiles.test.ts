import { describe, expect, it } from 'vitest';
import { CLASS_COUNT, CLASS_FALLBACK_TILE, FIRST_CLASS_TILE, Shape, classFallbackTile, classTile, isClassTile } from '../src/game/tiles.ts';

describe('class figure tiles', () => {
  it('number the eleven classes from cell 68', () => {
    expect(classTile(0)).toBe(68);
    expect(classTile(10)).toBe(78);
    expect(classTile(-1)).toBe(Shape.Ranger >> 1);
    expect(classTile(11)).toBe(Shape.Ranger >> 1);
    expect(isClassTile(67)).toBe(false);
    expect(isClassTile(68)).toBe(true);
    expect(isClassTile(78)).toBe(true);
    expect(isClassTile(79)).toBe(false);
  });

  it('fall back to the shared figures the original grouped them into', () => {
    expect(CLASS_FALLBACK_TILE).toHaveLength(CLASS_COUNT);
    // Fighter, Paladin, Barbarian share the fighter; Cleric and Druid the cleric; Wizard, Illusionist, Alchemist the wizard.
    expect([0, 4, 5].map((c) => classFallbackTile(FIRST_CLASS_TILE + c))).toEqual([64, 64, 64]);
    expect([1, 8].map((c) => classFallbackTile(FIRST_CLASS_TILE + c))).toEqual([65, 65]);
    expect([2, 7, 9].map((c) => classFallbackTile(FIRST_CLASS_TILE + c))).toEqual([66, 66, 66]);
    expect(classFallbackTile(FIRST_CLASS_TILE + 3)).toBe(67);
    expect(classFallbackTile(FIRST_CLASS_TILE + 6)).toBe(17); // Lark as the jester
    expect(classFallbackTile(FIRST_CLASS_TILE + 10)).toBe(63); // Ranger as the party marker
    expect(classFallbackTile(24)).toBe(24); // other tiles untouched
  });
});

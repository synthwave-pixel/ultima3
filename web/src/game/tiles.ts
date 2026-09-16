/**
 * tiles.ts
 *
 * Constants describing the three numbering schemes the original code used
 * for terrain and creatures. Keeping them in one place avoids the magic
 * numbers scattered through the C source.
 *
 * 1. MAP VALUE  (0-255) - a byte stored in a map. Bits 7..2 select the tile,
 *    bits 1..0 are a monster *variant* (0 = base type, 1 and 2 = the two
 *    variants, e.g. Orc / Goblin / Troll). Terrain always has variant 0, so
 *    terrain values are multiples of 4.
 *
 * 2. SHAPE      (0-254, even) - a map value with the variant bits cleared and
 *    shifted right by one. This is what the 11x11 viewport buffer holds.
 *    Shape = tile index * 2. One odd shape exists: 0x5D is a door, drawn from
 *    the second animation frame of the letter "I".
 *
 * 3. TILE INDEX (0-95) - the position in the tile sheet. Row = index % 16,
 *    column pair = index / 16. Indices 0-63 are the classic Apple II tiles;
 *    64-67 are the shared party figures (fighter, cleric, wizard, thief);
 *    68-78 are one figure per class in career-table order, in sets that have
 *    them (see `classTile`, `memberShape`); 79 is empty; 80-95 are the
 *    monster variants (see `monsterVariantShape`).
 *    The Exodus tile (31) is blank in every sheet: its four light panels sit
 *    in the second-frame cells of 32-35 and `GraphicsSet` shows them in turn.
 *
 * Conversions:  shape = mapValue & 0xFC >> 1     tileIndex = shape >> 1
 */

/** Map values for terrain (variant bits are zero, so these are multiples of 4). */
export const MapValue = {
  Water: 0x00,
  Grass: 0x04,
  Brush: 0x08,
  Forest: 0x0c,
  Mountains: 0x10,
  Dungeon: 0x14,
  Town: 0x18,
  Castle: 0x1c,
  Floor: 0x20,
  Chest: 0x24,
  Horse: 0x28,
  Frigate: 0x2c,
  Whirlpool: 0x30,
  Serpent: 0x34,
  ManOWar: 0x38,
  Pirate: 0x3c,
  Merchant: 0x40,
  Jester: 0x44,
  Guard: 0x48,
  LordBritish: 0x4c,
  Fighter: 0x50,
  Cleric: 0x54,
  Wizard: 0x58,
  Thief: 0x5c,
  Orc: 0x60,
  Skeleton: 0x64,
  Giant: 0x68,
  Daemon: 0x6c,
  Pincher: 0x70,
  Dragon: 0x74,
  Balron: 0x78,
  Exodus: 0x7c,
  ForceField: 0x80,
  Lava: 0x84,
  MoonGate: 0x88,
  Wall: 0x8c,
  Void: 0x90,
  Wall2: 0x94,
  /** Letters A..T occupy 0x98..0xE4 in steps of 4; "I" (0xB8) doubles as a door. */
  LetterA: 0x98,
  LetterI: 0xb8,
  LetterT: 0xe4,
  SnakeBottom: 0xe8,
  SnakeTop: 0xec,
  MagicBall: 0xf0,
  FireBall: 0xf4,
  Shrine: 0xf8,
  Ranger: 0xfc,
} as const;

/** Shapes (map value / 2) that the code compares against most often. */
export const Shape = {
  Water: 0x00,
  Grass: 0x02,
  Brush: 0x04,
  Forest: 0x06,
  Mountains: 0x08,
  Dungeon: 0x0a,
  Town: 0x0c,
  Castle: 0x0e,
  Floor: 0x10,
  Chest: 0x12,
  Horse: 0x14,
  Frigate: 0x16,
  Serpent: 0x1a,
  ManOWar: 0x1c,
  Pirate: 0x1e,
  Whirlpool: 0x18,
  Jester: 0x22,
  ForceField: 0x40,
  Lava: 0x42,
  MoonGate: 0x44,
  Wall: 0x46,
  Void: 0x48,
  /** Odd on purpose: drawn from the alternate frame of the letter "I". */
  Door: 0x5d,
  SnakeBottom: 0x74,
  SnakeTop: 0x76,
  MagicBall: 0x78,
  FireBall: 0x7a,
  Shrine: 0x7c,
  /** The party marker on the surface. */
  Ranger: 0x7e,
} as const;

export function mapValueToShape(value: number): number {
  return (value & 0xfc) >> 1;
}

export function shapeToTileIndex(shape: number): number {
  return shape >> 1;
}

/**
 * Monster variants (e.g. Goblin and Troll for Orc) live in their own rows of
 * the tile sheet. Mirrors the arithmetic in DrawMap() in UltimaGraphics.c.
 * Only map values 92..126 (Thief .. Exodus) have variants.
 */
export function monsterVariantShape(value: number): number {
  const variant = value & 0x03;
  if (variant && value >= 92 && value <= 126) {
    return (((value >> 2) - 23) * 2 + 79 + variant) * 2;
  }
  return mapValueToShape(value);
}

/** True for the 13 letter tiles A..T (used for town signs; "I" may be a door). */
export function isLetter(value: number): boolean {
  return value >= MapValue.LetterA && value <= MapValue.LetterT;
}

/**
 * Cells 68-78 hold one figure per class, in career-table order: Fighter,
 * Cleric, Wizard, Thief, Paladin, Barbarian, Lark, Illusionist, Druid,
 * Alchemist, Ranger. A sheet without them (every set but Standard so far)
 * shows the shared figure from `CLASS_FALLBACK_TILE` instead: the original's
 * `DetermineShape()` grouping, with Lark as the jester and Ranger as the
 * party marker.
 */
export const FIRST_CLASS_TILE = 68;
export const CLASS_COUNT = 11;
export const CLASS_FALLBACK_TILE: readonly number[] = [64, 65, 66, 67, 64, 64, 17, 66, 65, 66, 63];

/** The tile of a class by its index in the career table; the party marker for an unknown class. */
export function classTile(career: number): number {
  return career >= 0 && career < CLASS_COUNT ? FIRST_CLASS_TILE + career : Shape.Ranger >> 1;
}

export function isClassTile(index: number): boolean {
  return index >= FIRST_CLASS_TILE && index < FIRST_CLASS_TILE + CLASS_COUNT;
}

/** The shared figure drawn for a class tile when the sheet has no class figures. */
export function classFallbackTile(index: number): number {
  return isClassTile(index) ? CLASS_FALLBACK_TILE[index - FIRST_CLASS_TILE] : index;
}

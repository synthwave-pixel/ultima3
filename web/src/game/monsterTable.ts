/**
 * monsterTable.ts
 *
 * A typed view over the 256-byte monster table (MONS resource, and the
 * `Monsters[256]` array in the C source). It is a struct-of-arrays: 32
 * monsters, six fields, each field a 32-byte column.
 *
 *   column  offset  meaning
 *   ------  ------  -------------------------------------------------------
 *   type       0    map value of the monster (0 = slot unused)
 *   tileUnder 32    the terrain the monster is standing on (restored when it moves)
 *   x         64
 *   y         96
 *   hp       128    top two bits are the *behaviour* in towns (see Behaviour);
 *                   low nibble is the NPC's dialogue index in towns
 *   variant  160    0, 1 or 2 - selects Orc / Goblin / Troll style variants
 *
 * On the surface the whole 256 bytes are saved with the map so that wandering
 * monsters persist between sessions.
 */

export const MONSTER_SLOTS = 32;

const TYPE = 0;
const TILE_UNDER = 32;
const X = 64;
const Y = 96;
const HP = 128;
const VARIANT = 160;

/** Movement behaviour of town/castle NPCs, from the top two bits of the hp column. */
export const Behaviour = {
  Stationary: 0x00,
  Wander: 0x40,
  Follow: 0x80,
  Attack: 0xc0,
} as const;

export class MonsterTable {
  constructor(public readonly bytes: Uint8Array) {
    if (bytes.length !== 256) throw new Error('monster table must be 256 bytes');
  }

  type(i: number): number {
    return this.bytes[TYPE + i];
  }
  setType(i: number, v: number): void {
    this.bytes[TYPE + i] = v;
  }

  tileUnder(i: number): number {
    return this.bytes[TILE_UNDER + i];
  }
  setTileUnder(i: number, v: number): void {
    this.bytes[TILE_UNDER + i] = v;
  }

  x(i: number): number {
    return this.bytes[X + i];
  }
  y(i: number): number {
    return this.bytes[Y + i];
  }
  setPosition(i: number, x: number, y: number): void {
    this.bytes[X + i] = x;
    this.bytes[Y + i] = y;
  }

  hp(i: number): number {
    return this.bytes[HP + i];
  }
  setHp(i: number, v: number): void {
    this.bytes[HP + i] = v;
  }

  /** Behaviour bits for town NPCs (`Monsters[i + 128] & 0xC0`). */
  behaviour(i: number): number {
    return this.bytes[HP + i] & 0xc0;
  }

  /** Dialogue index for town NPCs (`Monsters[i + 128] & 0x0F`). */
  talkIndex(i: number): number {
    return this.bytes[HP + i] & 0x0f;
  }

  variant(i: number): number {
    return this.bytes[VARIANT + i];
  }
  setVariant(i: number, v: number): void {
    this.bytes[VARIANT + i] = v;
  }

  /** The map value to draw: base type plus variant bits. */
  displayValue(i: number): number {
    return this.type(i) + this.variant(i);
  }

  /** Mirrors `MonsterHere()`: index of the monster at (x, y), or -1. Searches from the top slot down. */
  at(x: number, y: number): number {
    for (let i = MONSTER_SLOTS - 1; i >= 0; i--) {
      if (this.type(i) !== 0 && this.x(i) === x && this.y(i) === y) return i;
    }
    return -1;
  }

  /** Highest-numbered free slot, or -1. (`SpawnMonster` searches downward from 31.) */
  freeSlot(): number {
    for (let i = MONSTER_SLOTS - 1; i >= 0; i--) if (this.type(i) === 0) return i;
    return -1;
  }

  clear(i: number): void {
    this.setType(i, 0);
  }

  copyFrom(other: Uint8Array): void {
    this.bytes.set(other);
  }
}

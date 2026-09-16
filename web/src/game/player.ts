/**
 * player.ts
 *
 * A typed view over one 64-byte character record. The roster holds 20 of
 * these back to back (ROST resource, 1280 bytes). The layout is the Apple II
 * original's; offsets are documented here once so the rest of the code can
 * use named accessors instead of `Player[ros][27]`.
 *
 *   offset  meaning
 *   ------  ------------------------------------------------------------
 *    0-15   name, NUL padded, high bit sometimes set (Apple II text)
 *    14     bit flags: marks and cards (0x10 Mark of Fire, 0x20 Mark of Force ...)
 *    15     torches
 *    16     0xFF while the character is in the party, 0 otherwise
 *    17     status letter: 'G' good, 'P' poisoned, 'D' dead, 'A' ashes
 *    18-21  strength, dexterity, intelligence, wisdom
 *    22     race letter (H)uman (E)lf (D)warf (B)obbit (F)uzzy
 *    23     class letter (F)ighter (C)leric (W)izard (T)hief (P)aladin (B)arbarian
 *           (L)ark (I)llusionist (D)ruid (A)lchemist (R)anger
 *    24     sex letter 'M' 'F' 'O'
 *    25     magic points
 *    26-27  hit points, big endian
 *    28-29  maximum hit points, big endian
 *    30     level - 1 (also the "hundreds" of experience)
 *    31     experience within the level, 0..99
 *    32-34  food as three base-100 digits: hundreds, units, fraction
 *    35-36  gold, big endian
 *    37     gems
 *    38     keys
 *    39     powders
 *    40     armour currently worn (index into 41..47)
 *    41-47  armour counts: cloth, leather, chain, plate, +2 chain, +2 plate, exotic
 *    48     weapon currently readied (index into 49..63)
 *    49-63  weapon counts: dagger, mace, sling, axe, bow, sword, +2 mace ... exotic
 *
 * The original `Player[21][65]` array was 1-based (roster slot 1..20). This
 * port uses 0-based slots; `Party.memberSlot()` performs the conversion.
 */

export const PLAYER_RECORD_SIZE = 64;
export const ROSTER_SIZE = 20;

/** Byte offsets into a player record. Exported for the few places that need raw access. */
export const PlayerOffset = {
  Name: 0,
  Marks: 14,
  Torches: 15,
  InParty: 16,
  Status: 17,
  Strength: 18,
  Dexterity: 19,
  Intelligence: 20,
  Wisdom: 21,
  Race: 22,
  Class: 23,
  Sex: 24,
  Mana: 25,
  HitPointsHi: 26,
  HitPointsLo: 27,
  MaxHitPointsHi: 28,
  MaxHitPointsLo: 29,
  Level: 30,
  Experience: 31,
  FoodHundreds: 32,
  FoodUnits: 33,
  FoodFraction: 34,
  GoldHi: 35,
  GoldLo: 36,
  Gems: 37,
  Keys: 38,
  Powders: 39,
  ArmourWorn: 40,
  ArmourCounts: 41,
  WeaponReadied: 48,
  WeaponCounts: 49,
} as const;

export type StatusLetter = 'G' | 'P' | 'D' | 'A';

export class PlayerRecord {
  constructor(public readonly bytes: Uint8Array) {
    if (bytes.length !== PLAYER_RECORD_SIZE) throw new Error(`player record must be ${PLAYER_RECORD_SIZE} bytes`);
  }

  /** An empty roster slot has a zero first name byte. */
  get exists(): boolean {
    return this.bytes[PlayerOffset.Name] !== 0;
  }

  get name(): string {
    let s = '';
    for (let i = 0; i < 13 && this.bytes[i] !== 0; i++) s += String.fromCharCode(this.bytes[i] & 0x7f);
    return s;
  }

  set name(value: string) {
    this.bytes.fill(0, 0, 14);
    for (let i = 0; i < Math.min(13, value.length); i++) this.bytes[i] = value.charCodeAt(i) & 0x7f;
  }

  get status(): StatusLetter {
    return String.fromCharCode(this.bytes[PlayerOffset.Status]) as StatusLetter;
  }
  set status(s: StatusLetter) {
    this.bytes[PlayerOffset.Status] = s.charCodeAt(0);
  }

  /** Alive means Good or Poisoned. Mirrors `CheckAlive()`. */
  get alive(): boolean {
    const s = this.status;
    return s === 'G' || s === 'P';
  }

  get inParty(): boolean {
    return this.bytes[PlayerOffset.InParty] !== 0;
  }
  set inParty(v: boolean) {
    this.bytes[PlayerOffset.InParty] = v ? 0xff : 0;
  }

  get sex(): string {
    return String.fromCharCode(this.bytes[PlayerOffset.Sex]);
  }
  get race(): string {
    return String.fromCharCode(this.bytes[PlayerOffset.Race]);
  }
  get classLetter(): string {
    return String.fromCharCode(this.bytes[PlayerOffset.Class]);
  }

  get strength(): number {
    return this.bytes[PlayerOffset.Strength];
  }
  get dexterity(): number {
    return this.bytes[PlayerOffset.Dexterity];
  }
  get intelligence(): number {
    return this.bytes[PlayerOffset.Intelligence];
  }
  get wisdom(): number {
    return this.bytes[PlayerOffset.Wisdom];
  }

  get mana(): number {
    return this.bytes[PlayerOffset.Mana];
  }
  set mana(v: number) {
    this.bytes[PlayerOffset.Mana] = v;
  }

  get torches(): number {
    return this.bytes[PlayerOffset.Torches];
  }
  set torches(v: number) {
    this.bytes[PlayerOffset.Torches] = v;
  }

  get marks(): number {
    return this.bytes[PlayerOffset.Marks];
  }

  get hitPoints(): number {
    return this.bytes[PlayerOffset.HitPointsHi] * 256 + this.bytes[PlayerOffset.HitPointsLo];
  }
  set hitPoints(v: number) {
    this.bytes[PlayerOffset.HitPointsHi] = Math.floor(v / 256);
    this.bytes[PlayerOffset.HitPointsLo] = v % 256;
  }

  get maxHitPoints(): number {
    return this.bytes[PlayerOffset.MaxHitPointsHi] * 256 + this.bytes[PlayerOffset.MaxHitPointsLo];
  }

  /** Level is stored as level - 1. */
  get level(): number {
    return this.bytes[PlayerOffset.Level] + 1;
  }

  /** Experience within the current level (0-99). */
  get experience(): number {
    return this.bytes[PlayerOffset.Experience];
  }

  /** Food is three base-100 digits; the fraction byte is not shown to the player. */
  get food(): number {
    return this.bytes[PlayerOffset.FoodHundreds] * 100 + this.bytes[PlayerOffset.FoodUnits];
  }

  get gold(): number {
    return this.bytes[PlayerOffset.GoldHi] * 256 + this.bytes[PlayerOffset.GoldLo];
  }
  set gold(v: number) {
    this.bytes[PlayerOffset.GoldHi] = Math.floor(v / 256);
    this.bytes[PlayerOffset.GoldLo] = v % 256;
  }

  get gems(): number {
    return this.bytes[PlayerOffset.Gems];
  }
  get keys(): number {
    return this.bytes[PlayerOffset.Keys];
  }
  get powders(): number {
    return this.bytes[PlayerOffset.Powders];
  }

  /** Mirrors `HPAdd()`: heal, capped at the maximum. */
  addHitPoints(amount: number): void {
    this.hitPoints = Math.min(this.maxHitPoints, this.hitPoints + amount);
  }

  /**
   * Mirrors `HPSubtract()`. Returns true if the character died. The caller is
   * responsible for the death sound and any autosave.
   */
  subtractHitPoints(amount: number): boolean {
    const hp = this.hitPoints - amount;
    if (hp < 1) {
      this.hitPoints = 0;
      this.status = 'D';
      return true;
    }
    this.hitPoints = hp;
    return false;
  }
}

/** The whole roster: 20 records in one buffer, so saving is a single copy. */
export class Roster {
  readonly players: PlayerRecord[] = [];

  constructor(public readonly bytes: Uint8Array) {
    if (bytes.length !== PLAYER_RECORD_SIZE * ROSTER_SIZE) throw new Error('roster must be 1280 bytes');
    for (let i = 0; i < ROSTER_SIZE; i++) {
      this.players.push(new PlayerRecord(bytes.subarray(i * PLAYER_RECORD_SIZE, (i + 1) * PLAYER_RECORD_SIZE)));
    }
  }

  /** 0-based slot. */
  get(slot: number): PlayerRecord {
    return this.players[slot];
  }
}

/**
 * Lord British's own test for raising a member: level at or above maximum
 * hit points / 100, not yet 2500 maximum, and past level 5 only with the
 * Mark of Kings. The character box turns the name blue when this holds.
 */
export function levelUpDue(p: PlayerRecord): boolean {
  const level = p.level - 1;
  let hpmax = p.maxHitPoints;
  if (hpmax % 100 === 50) hpmax -= 50;
  hpmax = Math.floor(hpmax / 100);
  if (level < hpmax) return false;
  if (hpmax >= 25) return false;
  if (hpmax > 4 && !(p.marks & 0x80)) return false;
  return true;
}

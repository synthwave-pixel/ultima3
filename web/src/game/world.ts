/**
 * world.ts
 *
 * All mutable game state that is not part of the party or roster records:
 * the current map, its monster table, the party's position, the whirlpool,
 * the moons, the wind, and the timers used by the per-turn logic.
 *
 * The original kept the "current Sosaria" on disk (resource 419) and made an
 * in-memory backup (`PushSosaria`) before entering a town. This port keeps
 * the surface state in `World.surface` at all times. Entering a town loads
 * that town into `World.current`; leaving simply points `current` back at
 * `surface`. The effect is the same and there is nothing to push or pull.
 */

import type { PlayerRecord } from './player.ts';
import { AutoMap, type MapMode } from './automap.ts';
import { type GameResources, MapId, BASERES } from '../data/resources.ts';
import { MonsterTable } from './monsterTable.ts';
import { Party, Location, PARTY_RECORD_SIZE } from './party.ts';
import { Roster, PLAYER_RECORD_SIZE, ROSTER_SIZE } from './player.ts';
import { Random } from './random.ts';
import { MapValue } from './tiles.ts';
import { type JournalState, emptyJournal } from './journal.ts';
import { speech } from './talk.ts';

/** A loaded map plus the creatures living on it. */
export interface MapState {
  /** Resource ID (400..421). */
  id: number;
  /** Map edge length: 64 for every surface, town and castle map. */
  size: number;
  /** size * size map values, row major. */
  tiles: Uint8Array;
  monsters: MonsterTable;
  /** NPC dialogue for towns and castles; empty for Sosaria. */
  talk: Uint8Array;
}

/** The whirlpool that roams Sosaria. Saved with the surface map. */
export interface Whirlpool {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * One creature in a combat arena. Up to eight monsters and four party
 * members. Positions are arena cells 0..10; a member who is not present
 * (dead, or an empty party slot) has x = y = 255.
 */
export interface Combatant {
  x: number;
  y: number;
  /** The arena shape under the creature, restored when it moves or dies. */
  tileUnder: number;
  /** Shape drawn for the creature. */
  shape: number;
  /** Monsters only: hit points, 0 = slot unused. */
  hp: number;
  /** Members only: where they fell, so a revival mid-fight can put them back nearby. */
  diedAt?: { x: number; y: number };
  /** Members only: the arena's starting square, the fallback for a revival. */
  start?: { x: number; y: number };
}

/**
 * Mirrors `BlockExodus()`. The Apple II map has lava either side of Exodus'
 * castle, unreachable on foot without diagonal moves. Without diagonals it
 * stays; with diagonals allowed it becomes mountains, as on the Mac, so the
 * castle can only be reached by sea, past the Great Earth Serpent.
 */
export function blockExodusApproach(map: MapState, diagonalMoves: boolean): void {
  const at = (x: number, y: number) => map.tiles[y * map.size + x];
  if (at(0x0a, 0x35) !== MapValue.Castle || at(0x0b, 0x36) !== MapValue.Water || at(0x0c, 0x35) !== MapValue.Mountains) return;
  const flank = diagonalMoves ? MapValue.Mountains : MapValue.Lava;
  map.tiles[0x35 * map.size + 0x09] = flank;
  map.tiles[0x35 * map.size + 0x0b] = flank;
}

/** The state of a fight. See combat.ts. */
export interface CombatState {
  /** 11x11 arena shapes (same numbering as the viewport). */
  tiles: Uint8Array;
  monsters: Combatant[];
  members: Combatant[];
  /** Shape of the monster type being fought (map value / 2). */
  monsterShape: number;
  /** Variant 0..2 of that type. */
  monsterVariant: number;
  /** Where the party was before combat (`Party[3]`), restored on victory. */
  previousLocation: number;
  /** Member whose turn it is, 0..3. */
  activeMember: number;
  /**
   * Member whose turn it is, or -1. The UI outlines them; the Apple II
   * blinked the figure instead (`cHide`).
   */
  markedMember: number;
  /** When the mark was set (performance.now()) and how long the member has to act, ms; 0 once they have chosen. */
  markedAt: number;
  markedFor: number;
  /** When the outline's fade was frozen (a menu opened, so the turn can no longer expire), or 0. */
  markedFrozenAt: number;
}

/** State while inside a dungeon. */
export interface DungeonState {
  /** 8 levels x 16 x 16 cells. */
  tiles: Uint8Array;
  /** 0..7 */
  level: number;
  /** 0 north, 1 east, 2 south, 3 west. */
  heading: number;
  /** Turns of light remaining; 0 means darkness. (`gTorch`) */
  torch: number;
  /** Set when the party is leaving the dungeon. (`gExitDungeon`) */
  exit: boolean;
}

/** Dungeon cell values. The high bits mark walls; low bits are features. */
export const DungeonCell = {
  Open: 0x00,
  TimeLord: 0x01,
  Fountain: 0x02,
  Wind: 0x03,
  Trap: 0x04,
  Mark: 0x05,
  Gremlins: 0x06,
  Writing: 0x08,
  LadderUp: 0x10,
  LadderDown: 0x20,
  Chest: 0x40,
  Wall: 0x80,
  SecretDoor: 0xa0,
  Door: 0xc0,
} as const;

/** How starvation bites: see World.starvation. */
export type Starvation = 'none' | 'mild' | 'classic';
export const STARVATION_MODES: Starvation[] = ['none', 'mild', 'classic'];

/** The turn timer: see World.timer. */
export type Timer = 'slow' | 'fast' | 'off';
export const TIMER_MODES: Timer[] = ['slow', 'fast', 'off'];

export class World {
  readonly rng: Random;
  readonly party: Party;
  readonly roster: Roster;

  /** Persistent overworld state. */
  surface: MapState;
  /** The map the party is on right now: `surface`, or a town/castle/dungeon. */
  current: MapState;
  whirlpool: Whirlpool = { x: 2, y: 0x3e, dx: 1, dy: 1 };
  /** Idle ticks until the whirlpool next moves. (`gWhirlCtr`) */
  whirlpoolTimer = 4;

  /** Party position on `current`. (`xpos`, `ypos` in the C source.) */
  x = 0;
  y = 0;

  /**
   * Where to reappear on Sosaria after leaving a town or castle.
   * (`zp[0xE3]`, `zp[0xE4]` in the C source.)
   */
  returnX = 0;
  returnY = 0;

  /**
   * Moon phases. `moonTimer` counts turns until the next phase change;
   * `moonPhase` is 0..7. Index 0 is Trammel (changes every 12 turns), index 1
   * is Felucca (every 4 turns). Felucca selects which moongate is open.
   */
  moonTimer: [number, number] = [12, 4];
  moonPhase: [number, number] = [4, 4];

  /**
   * Moongates the party has come out of (gate numbers 0..7), this port:
   * View map marks each with the moon that opens it. Saved with the game.
   */
  gatesKnown: number[] = [];

  /** Wind: 0 calm, 1 north, 2 east, 3 south, 4 west. Blocks ships sailing into it. */
  windDirection = 0;
  windTimer = 0;
  /** Whether wind is simulated at all (a LairWare preference; the Apple II original had it). */
  windEnabled = true;

  /** Turn counters used by `ageChars()`. `gTime[0]` and `gTime[1]` in the C source. */
  ageTimer: [number, number] = [10, 9];

  /** Turns remaining during which monsters do not move (Negate Time). */
  timeNegate = 0;

  /** Alternates each turn while riding or sailing, halving monster movement. (`zp[0xCD]`) */
  private mountToggle = 0;

  /** Whether the party marker on horseback faces east. Cosmetic only. */
  horseFacingEast = false;

  /** Set when the game should stop (quit to menu). `gDone` in the C source. */
  done = false;

  /** Set while the party is being resurrected, so nested loops unwind. (`gResurrect`) */
  resurrecting = false;

  /**
   * Combat in progress, or null. Set by combat.ts; the viewport draws the
   * arena instead of the map while it is set.
   */
  combat: CombatState | null = null;

  /** Dungeon state while `party.location === Location.Dungeon`. */
  dungeon: DungeonState = {
    tiles: new Uint8Array(2048),
    level: 0,
    heading: 0,
    torch: 0,
    exit: false,
  };

  /**
   * A spell ball or cannon shot being drawn over the map or arena, or null.
   * The original wrote the ball shape into the tile buffer and remembered
   * the terrain under it; keeping it separate is simpler. Coordinates are
   * map coordinates outside combat and arena cells during combat.
   */
  ball: {
    x: number;
    y: number;
    shape: number;
    /** 0 or absent while the ball flies; 1..3 for the frames of a hit (the "HIT" tile, or the burst). */
    hit?: number;
  } | null = null;

  /** Which card slot Exodus expects next (0x1E..0x21). (`lastCard`) */
  lastCard = 0x1e;
  /** The dungeon auto-map: cells seen so far. Replaced by `main.ts` with one that persists. */
  autoMap: AutoMap = new AutoMap();
  /** How the auto-map shows in dungeons (a display setting, remembered with the others). */
  mapMode: MapMode = 'off';
  /** Called when the map mode changes, so the page can remember it. */
  onMapModeChange: (() => void) | null = null;
  /** Set by Appar Unem / Steal so chests do not trigger traps. (`m5BDC`, inverted) */
  chestTrapsArmed = true;

  constructor(
    public readonly resources: GameResources,
    seed?: number,
  ) {
    this.rng = new Random(seed);
    this.party = new Party(new Uint8Array(PARTY_RECORD_SIZE));
    this.roster = new Roster(new Uint8Array(PLAYER_RECORD_SIZE * ROSTER_SIZE));
    this.surface = this.loadMapState(MapId.Sosaria);
    this.current = this.surface;
  }

  // -------------------------------------------------------------------------
  // Map access. These mirror GetXYVal / PutXYVal / MapConstrain.
  // -------------------------------------------------------------------------

  get mapSize(): number {
    return this.current.size;
  }

  /** Wrap a coordinate onto the map. Sosaria wraps like a torus. */
  constrain(v: number): number {
    const n = this.current.size;
    return ((v % n) + n) % n;
  }

  /**
   * Read the map value at (x, y), wrapping around the edges. Off the edge of
   * a town, castle or dungeon the original reported grass so the party could
   * walk out. That case is handled by the caller checking `x === 0` etc.,
   * because the wrapped read still returns the far edge here as it did in C.
   */
  getXYVal(x: number, y: number): number {
    const { size, tiles } = this.current;
    const value = tiles[this.constrain(y) * size + this.constrain(x)];
    if (this.party.location !== Location.Sosaria && (x < 0 || x >= size || y < 0 || y >= size)) {
      return MapValue.Grass;
    }
    return value;
  }

  putXYVal(value: number, x: number, y: number): void {
    const { size, tiles } = this.current;
    tiles[this.constrain(y) * size + this.constrain(x)] = value;
  }

  get monsters(): MonsterTable {
    return this.current.monsters;
  }

  get onSurface(): boolean {
    return this.party.location === Location.Sosaria;
  }

  /** True inside a town or castle (the maps you leave by walking off the edge). */
  get inTownOrCastle(): boolean {
    const l = this.party.location;
    return l === Location.Town || l === Location.Castle;
  }

  // -------------------------------------------------------------------------
  // Loading maps
  // -------------------------------------------------------------------------

  /**
   * Build a fresh MapState from the pristine resources. Mirrors the parts of
   * `LoadUltimaMap()` that apply to surface, town and castle maps.
   *
   * A MAPS resource is: 1 byte edge length (0 means 256), then size*size
   * values. Sosaria carries four extra bytes: whirlpool x, y, dx, dy.
   */
  loadMapState(id: number): MapState {
    const raw = this.resources.maps.get(id);
    if (!raw) throw new Error(`no map resource ${id}`);
    const size = raw[0] === 0 ? 256 : raw[0];
    const tiles = raw.slice(1, 1 + size * size);

    const monsterBytes = this.resources.monsters.get(id) ?? new Uint8Array(256);
    const monsters = new MonsterTable(monsterBytes.slice());

    const talk = this.resources.talk.get(id) ?? new Uint8Array(256);

    if (id === MapId.Sosaria && raw.length >= 1 + size * size + 4) {
      const t = 1 + size * size;
      // dx/dy are signed bytes.
      this.whirlpool = { x: raw[t], y: raw[t + 1], dx: (raw[t + 2] << 24) >> 24, dy: (raw[t + 3] << 24) >> 24 };
    }
    const state = { id, size, tiles, monsters, talk: talk.slice() };
    if (id === MapId.Sosaria) blockExodusApproach(state, this.diagonalMoves);
    return state;
  }

  /** Enter a town or castle: the current map becomes a fresh copy of it. */
  enterMap(id: number): void {
    this.current = this.loadMapState(id);
    this.trail = []; // everyone stands on the door square until they walk
  }

  /**
   * Enter a dungeon. A dungeon MAPS resource is 2048 bytes: eight 16x16
   * levels. Dungeons also have a TLKS resource holding the "misty writing"
   * for each level, which is exposed through `current.talk`.
   */
  enterDungeon(id: number): void {
    const raw = this.resources.maps.get(id);
    if (!raw || raw.length < 2048) throw new Error(`no dungeon resource ${id}`);
    this.dungeon.tiles.set(raw.subarray(0, 2048));
    this.dungeon.level = 0;
    this.dungeon.heading = 1;
    this.dungeon.torch = 0;
    this.dungeon.exit = false;
    const talk = this.resources.talk.get(id) ?? new Uint8Array(256);
    this.current = { id, size: 16, tiles: this.dungeon.tiles, monsters: new MonsterTable(new Uint8Array(256)), talk: talk.slice() };
  }

  /** Dungeon cell at (x, y) on the current level, wrapping at 16. (`GetXYDng`) */
  getXYDng(x: number, y: number): number {
    return this.dungeon.tiles[this.dungeon.level * 256 + ((y + 16) & 0x0f) * 16 + ((x + 16) & 0x0f)];
  }

  putXYDng(value: number, x: number, y: number): void {
    this.dungeon.tiles[this.dungeon.level * 256 + (y & 0x0f) * 16 + (x & 0x0f)] = value;
  }

  /** Return to the overworld. */
  returnToSurface(): void {
    this.current = this.surface;
  }

  /** Restore Sosaria to its pristine state (new game, or after resurrection). Mirrors `ResetSosaria()`. */
  resetSosaria(): void {
    this.surface = this.loadMapState(MapId.Sosaria);
    if (this.party.location === Location.Sosaria) this.current = this.surface;
  }

  /** Resource ID for the location table entry, mirroring `Enter()`: entries above 18 are Ambrosia's. */
  static mapIdForLocation(placeIndex: number): number {
    return placeIndex > 18 ? BASERES + placeIndex + 3 : BASERES + placeIndex;
  }

  // -------------------------------------------------------------------------
  // Party helpers
  // -------------------------------------------------------------------------

  /** Roster records of the up-to-four party members, in marching order. */
  members() {
    const out = [];
    for (let m = 0; m < 4; m++) {
      const slot = this.party.memberSlot(m);
      if (slot >= 0) out.push(this.roster.get(slot));
    }
    return out;
  }

  /** Roster record of member 0..3, even when that position is empty (slot 0 is then returned, as in C). */
  member(m: number) {
    return this.roster.get(Math.max(0, this.party.memberSlot(m)));
  }

  /**
   * Gold and food are pooled for the whole party in this port. Members'
   * own purses (the Apple II fields) are emptied into the pool when a party
   * is formed, and shared out again when it is dispersed, so roster
   * characters outside the party keep what they had.
   */
  poolPurses(): void {
    for (let m = 0; m < 4; m++) {
      if (this.party.memberSlot(m) < 0) continue;
      const p = this.member(m);
      this.party.gold += p.gold;
      this.party.foodHundredths += p.bytes[32] * 10000 + p.bytes[33] * 100 + p.bytes[34];
      p.gold = 0;
      p.bytes[32] = p.bytes[33] = p.bytes[34] = 0;
    }
  }

  /** The reverse of `poolPurses()`: split the pool evenly among the members (each holds at most 9999). */
  splitPool(): void {
    const members = [0, 1, 2, 3].filter((m) => this.party.memberSlot(m) >= 0);
    if (members.length === 0) return;
    const goldEach = Math.min(9999, Math.floor(this.party.gold / members.length));
    const foodEach = Math.min(9999, Math.floor(this.party.food / members.length));
    for (const m of members) {
      const p = this.member(m);
      p.gold = goldEach;
      p.bytes[32] = Math.floor(foodEach / 100);
      p.bytes[33] = foodEach % 100;
      p.bytes[34] = 0;
    }
    this.party.gold = 0;
    this.party.foodHundredths = 0;
  }

  /**
   * Weapons and armour belong to the party (this port): move each member's
   * bag into the party's, leaving them only what they have readied and
   * worn. The Apple II counted the item in hand among the member's stock;
   * here it is out of the bag.
   */
  poolGear(): void {
    for (let m = 0; m < 4; m++) {
      if (this.party.memberSlot(m) < 0) continue;
      const p = this.member(m);
      for (const isWeapon of [true, false]) {
        const base = isWeapon ? 48 : 40;
        const last = isWeapon ? 15 : 7;
        for (let i = 1; i <= last; i++) {
          let n = p.bytes[base + i];
          if (p.bytes[base] === i && n > 0) n--; // the one in use stays with the member
          this.party.setGear(isWeapon, i, this.party.gear(isWeapon, i) + n);
          p.bytes[base + i] = 0;
        }
      }
    }
  }

  /**
   * The reverse of `poolGear()`, for dispersing: each member keeps what they
   * have readied and worn, and the bag is dealt out one item at a time,
   * first to members whose class can use the item, else to anyone.
   */
  splitGear(): void {
    const members = [0, 1, 2, 3].filter((m) => this.party.memberSlot(m) >= 0);
    if (members.length === 0) return;
    for (const isWeapon of [true, false]) {
      const base = isWeapon ? 48 : 40;
      const last = isWeapon ? 15 : 7;
      for (const m of members) {
        const p = this.member(m);
        if (p.bytes[base] > 0) p.bytes[base + p.bytes[base]] = 1;
      }
      for (let i = 1; i <= last; i++) {
        const able = members.filter((m) => this.canUse(this.member(m), isWeapon, i));
        const takers = able.length ? able : members;
        let next = 0;
        for (let n = this.party.gear(isWeapon, i); n > 0; n--) {
          const p = this.member(takers[next++ % takers.length]);
          p.bytes[base + i] = Math.min(99, p.bytes[base + i] + 1);
        }
      }
    }
    this.party.clearGear();
  }

  /** Gems, keys, powders and torches belong to the party (this port): gather the members' into the party record. */
  poolSupplies(): void {
    for (let m = 0; m < 4; m++) {
      if (this.party.memberSlot(m) < 0) continue;
      const p = this.member(m);
      this.party.gems += p.gems;
      this.party.keys += p.keys;
      this.party.powders += p.powders;
      this.party.torches += p.torches;
      p.bytes[37] = p.bytes[38] = p.bytes[39] = 0;
      p.torches = 0;
    }
  }

  /** The reverse of `poolSupplies()`, for dispersing: dealt out one at a time round the members. */
  splitSupplies(): void {
    const members = [0, 1, 2, 3].filter((m) => this.party.memberSlot(m) >= 0);
    if (members.length === 0) return;
    const deal = (total: number, offset: number) => {
      for (let i = 0; i < total; i++) {
        const p = this.member(members[i % members.length]);
        p.bytes[offset] = Math.min(99, p.bytes[offset] + 1);
      }
    };
    deal(this.party.gems, 37);
    deal(this.party.keys, 38);
    deal(this.party.powders, 39);
    deal(this.party.torches, 15);
    this.party.clearSupplies();
  }

  /** Whether a member's class may ready the weapon / wear the armour. Exotics suit everyone. (`weaponUseTable`) */
  canUse(p: PlayerRecord, isWeapon: boolean, index: number): boolean {
    if (index === 0) return true;
    if (index === (isWeapon ? 15 : 7)) return true;
    const careers = String.fromCharCode(...this.resources.misc.careerTable);
    const classIndex = Math.max(0, careers.indexOf(p.classLetter));
    const table = isWeapon ? this.resources.misc.weaponUseTable : this.resources.misc.armourUseTable;
    return 65 + index < table[classIndex];
  }

  /**
   * Ready a weapon or wear armour from the bag: the old item goes back in,
   * the new one comes out. Returns false when the bag has none (0, hands or
   * skin, is always available).
   */
  equip(p: PlayerRecord, isWeapon: boolean, index: number): boolean {
    const base = isWeapon ? 48 : 40;
    const old = p.bytes[base];
    if (index === old) return true;
    if (index > 0 && this.party.gear(isWeapon, index) < 1) return false;
    if (old > 0) this.party.setGear(isWeapon, old, this.party.gear(isWeapon, old) + 1);
    if (index > 0) this.party.setGear(isWeapon, index, this.party.gear(isWeapon, index) - 1);
    p.bytes[base] = index;
    return true;
  }

  /** Put found or bought gear in the bag (capped at 99 of a kind, as `AddItem()` capped a member's). */
  addGear(isWeapon: boolean, index: number, amount = 1): void {
    this.party.setGear(isWeapon, index, this.party.gear(isWeapon, index) + amount);
  }

  /** Add gold to the pool. Returns false if any was lost to the cap. */
  addGold(amount: number): boolean {
    const before = this.party.gold;
    this.party.gold = before + amount;
    return this.party.gold === before + amount;
  }

  /** Add whole rations to the pool. Returns false if any were lost to the cap. */
  addFood(rations: number): boolean {
    const before = this.party.foodHundredths;
    this.party.foodHundredths = before + rations * 100;
    return this.party.foodHundredths === before + rations * 100;
  }

  /**
   * One member's meal: a tenth of a ration from the pool. Returns true when
   * the pool is empty and the member goes hungry. (`eatFood` on the Apple II
   * did this per member.)
   */
  eatFromPool(): boolean {
    if (this.party.foodHundredths < 10) {
      this.party.foodHundredths = 0;
      return true;
    }
    this.party.foodHundredths -= 10;
    return false;
  }

  /** Mirrors `CheckAlive(member)`. */
  memberAlive(m: number): boolean {
    return this.party.memberSlot(m) >= 0 && this.member(m).alive;
  }

  /**
   * Start from the shipped default roster and party, as if the player had
   * just chosen "Form party" with the first four characters.
   */
  newGame(): void {
    this.party.bytes.set(this.resources.defaultParty);
    this.roster.bytes.set(this.resources.defaultRoster);
    for (let m = 0; m < this.party.size; m++) this.member(m).inParty = true;
    this.poolPurses();
    this.poolGear();
    this.poolSupplies();
    this.party.rulesPending = true; // "Choose Thine Adventure!" at the first Journey onward
    this.journal = emptyJournal();
    this.gatesKnown = [];
    this.party.location = Location.Sosaria;
    this.party.shape = 0x7e;
    this.x = this.party.surfaceX;
    this.y = this.party.surfaceY;
    this.returnX = this.x;
    this.returnY = this.y;
    this.resetSosaria();
  }

  /**
   * Mirrors the `zp[0xCD]` toggle in `FinishAll()`: while on a horse or ship
   * monsters only get to act every other turn. Returns true on the skipped turns.
   */
  skipMonstersThisTurn(): boolean {
    const shape = this.party.shape;
    if (shape !== 0x14 && shape !== 0x16) return false;
    this.mountToggle = 255 - this.mountToggle;
    return this.mountToggle < 128;
  }

  /**
   * Mirrors `ExodusCastle()`: true while the party is inside Exodus' castle
   * and Exodus still lives. During combat the location before the fight counts.
   */
  inExodusCastle(): boolean {
    if (this.party.exodusDestroyed) return false;
    let location = this.party.location;
    if (location === Location.Combat && this.combat) location = this.combat.previousLocation;
    if (location !== Location.Castle) return false;
    return this.party.surfaceX === this.resources.misc.locationX[1];
  }

  /** The music track that should be playing (`gSongNext`). The UI may ignore it. */
  music = 0;

  /** Sound effects on or off (the V command). The UI reads this. */
  soundEnabled = true;

  /**
   * Set by the game: restores the last save into this world and returns
   * true, or returns false when there is none. Used after a party wipe.
   */
  loadLastSave: (() => boolean) | null = null;

  /**
   * The squares the party leader last walked through inside a town or
   * castle, most recent first, at most three: the other members are drawn
   * on them in a line (a look borrowed from the NES version; the Standard
   * tiles only). Purely visual; the party's position is still one square.
   */
  trail: { x: number; y: number }[] = [];

  /** Called when the game changes a rule setting itself (the Modern/Classic choice), so the page can remember it. */
  onRulesChange: (() => void) | null = null;

  /**
   * Balanced XP (on by default, this port): a kill's experience is shared
   * among the living members, the killer taking any remainder first. Off,
   * the killer takes it all, as on the Apple II.
   */
  balancedXp = true;

  /** Each member's last spell this session, for the combat menu's "Cast (spell)" shortcut (this port). */
  lastSpell: (number | undefined)[] = [];

  /** The quest journal (this port; see journal.ts). Saved with the game. */
  journal: JournalState = emptyJournal();

  /**
   * A townsperson's line as the talk table has it: `town` is a map name
   * ("Moon") and `n` the speaker number. Line breaks become spaces, for
   * the journal, which wraps the words itself.
   */
  townLine(town: string, n: number): string {
    for (const [id, name] of this.resources.mapNames) {
      if (name !== town) continue;
      const talk = this.resources.talk.get(id);
      return talk ? speech(talk, n).replace(/\n/g, ' ').trim() : '';
    }
    return '';
  }

  /** Auto-combat on or off (a LairWare addition; see autocombat.ts). */
  autoCombat = false;

  /**
   * Poison kills (off by default): as on the Apple II, poison takes a hit
   * point every ageing tick until it kills. Off, it stops at one hit point,
   * so a long walk home poisoned is a nuisance, not a death.
   */
  poisonKills = false;

  /**
   * Starvation (this port): what an empty larder does each ageing tick.
   * 'classic' is the Apple II's 5 hit points a member, to the death;
   * 'mild' (the default) stops at half of maximum; 'none' does nothing
   * but say so.
   */
  starvation: Starvation = 'mild';

  /**
   * The turn timer (this port): how long the game waits for a key before
   * a combat turn, or an idle turn in the field or a dungeon, passes by
   * itself. 'fast' is the Apple II's (4, 5 and 6 seconds); 'slow' gives
   * 10, 12 and 14; 'off' waits for ever, so a turn passes only when the
   * player says so. Fast by default, for games from before the setting;
   * "Choose Thine Adventure!" sets Slow for Modern and Off for Story.
   */
  timer: Timer = 'fast';

  /** The wait for a key under the timer setting, from the Apple II's wait in ms; undefined for no limit. */
  timeLimit(originalMs: number): number | undefined {
    if (this.timer === 'off') return undefined;
    return this.timer === 'slow' ? originalMs * 2 + 2000 : originalMs;
  }

  /**
   * Diagonal moves: may the party move, attack and fire diagonally? Off by
   * default, as on the Apple II, where only monsters could (a small edge
   * for them). On gives the party diagonals too, as the Mac version allowed.
   */
  diagonalMoves = false;

  /** Change the diagonal-moves setting and fix the land around Exodus' castle to match. */
  setDiagonalMoves(on: boolean): void {
    this.diagonalMoves = on;
    blockExodusApproach(this.surface, on);
  }
  /** Called when the game itself turns auto-combat off, so the page can show it. */
  onAutoCombatChange: (() => void) | null = null;

  /** Once-per-fight flags for the Repond and Pontori spells. (`g5521`, `g56E7`) */
  spellFlags = { repond: false, pontori: false };
}

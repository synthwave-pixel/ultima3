/**
 * resources.ts
 *
 * Loads `public/data/resources.json` (produced by tools/extract-resources.ts)
 * and exposes the original game data as typed byte arrays and string tables.
 *
 * Resource IDs follow the original Macintosh numbering, where BASERES = 400:
 *
 *   MAPS 400-411   Lord British Castle, Exodus Castle, then ten towns   (64x64)
 *   MAPS 412-418   the seven dungeons                                  (16x16x8)
 *   MAPS 420       Sosaria, the overworld                              (64x64)
 *   MAPS 421       Ambrosia, the lost continent                        (64x64)
 *   MONS <same>    32 monsters/NPCs for each map (256 bytes, see monsters.ts)
 *   TLKS <same>    NPC dialogue for each map (256 bytes, see talk.ts)
 *   CONS 400-413   combat arenas
 *   MISC 400-405   lookup tables (see MiscTables below)
 *   PRTY 500       the default (empty) party record
 *   ROST 500       the default roster of 20 characters
 */

export const BASERES = 400;

/** Resource IDs of maps, mirroring `LoadUltimaMap()` in UltimaMisc.c. */
export const MapId = {
  LordBritishCastle: 400,
  ExodusCastle: 401,
  FirstTown: 402,
  FirstDungeon: 412,
  LastDungeon: 418,
  /** The original stored the *current* (mutated) Sosaria under 419 and the pristine copy under 420. */
  Sosaria: 420,
  Ambrosia: 421,
} as const;

export interface MiscTables {
  /** X/Y of the eight moongate positions on Sosaria, indexed by Trammel phase. */
  moonX: Uint8Array;
  moonY: Uint8Array;
  /** The class letter for each of the 11 classes (F C W T P B L I D A R). */
  careerTable: Uint8Array;
  /** Highest weapon letter each class may ready, same order as careerTable. */
  weaponUseTable: Uint8Array;
  /** Highest armour letter each class may wear, same order as careerTable. */
  armourUseTable: Uint8Array;
  /** X/Y of the 19 enterable locations (index = map id - 400). 0xFF = unused. */
  locationX: Uint8Array;
  locationY: Uint8Array;
  /** Experience awarded per monster tier (indexed by tile / 4 & 0x0F). */
  experience: Uint8Array;
}

export interface GameResources {
  /** Raw resource bytes by resource ID. */
  maps: Map<number, Uint8Array>;
  monsters: Map<number, Uint8Array>;
  talk: Map<number, Uint8Array>;
  combat: Map<number, Uint8Array>;
  /** Names of the map resources (e.g. "Yew"), by resource ID. */
  mapNames: Map<number, string>;
  misc: MiscTables;
  defaultParty: Uint8Array;
  defaultRoster: Uint8Array;
  strings: Record<string, string[]>;
}

export interface Bundle {
  [type: string]: Record<string, { name: string; data: string }> | Record<string, string[]>;
}

function decodeBase64(s: string): Uint8Array {
  // `atob` exists in browsers and in Node 16+.
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toByteMap(section: Record<string, { name: string; data: string }>): Map<number, Uint8Array> {
  const m = new Map<number, Uint8Array>();
  for (const [id, entry] of Object.entries(section)) m.set(Number(id), decodeBase64(entry.data));
  return m;
}

/** Build a GameResources from the parsed JSON bundle. Exported so tests can load the file from disk. */
export function resourcesFromBundle(bundle: Bundle): GameResources {
  const maps = bundle.maps as Record<string, { name: string; data: string }>;
  const mapNames = new Map<number, string>();
  for (const [id, entry] of Object.entries(maps)) mapNames.set(Number(id), entry.name);

  const misc = toByteMap(bundle.misc as Record<string, { name: string; data: string }>);
  const table = (id: number): Uint8Array => {
    const t = misc.get(BASERES + id);
    if (!t) throw new Error(`MISC resource ${BASERES + id} missing`);
    return t;
  };

  return {
    maps: toByteMap(maps),
    monsters: toByteMap(bundle.monsters as Record<string, { name: string; data: string }>),
    talk: toByteMap(bundle.talk as Record<string, { name: string; data: string }>),
    combat: toByteMap(bundle.combat as Record<string, { name: string; data: string }>),
    mapNames,
    misc: {
      // Layouts mirror GetMiscStuff() in UltimaMisc.c.
      moonX: table(0).subarray(0, 8),
      moonY: table(0).subarray(8, 16),
      careerTable: table(1).subarray(0, 11),
      weaponUseTable: table(2).subarray(0, 11),
      armourUseTable: table(3).subarray(0, 11),
      locationX: table(4).subarray(0, 32),
      locationY: table(4).subarray(32, 64),
      experience: table(5).subarray(0, 16),
    },
    defaultParty: toByteMap(bundle.party as Record<string, { name: string; data: string }>).get(500)!,
    defaultRoster: toByteMap(bundle.roster as Record<string, { name: string; data: string }>).get(500)!,
    strings: bundle.strings as Record<string, string[]>,
  };
}

/** Fetch and decode the resource bundle in the browser. */
export async function loadResources(url = 'data/resources.json'): Promise<GameResources> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return resourcesFromBundle((await res.json()) as Bundle);
}

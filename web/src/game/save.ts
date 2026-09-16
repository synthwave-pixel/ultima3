/**
 * save.ts
 *
 * Saving and restoring a game. The original wrote the party, roster and
 * "current Sosaria" back into its resource file. Here the same data becomes
 * a JSON object (binary fields base64-encoded) that the browser keeps in
 * localStorage.
 *
 * As in the original, a game saved inside a town or castle resumes on
 * Sosaria at the square the party entered from: towns are never persisted.
 */

import { World, blockExodusApproach } from './world.ts';
import { Location } from './party.ts';
import { MapId } from '../data/resources.ts';
import { type JournalState, emptyJournal } from './journal.ts';

/**
 * Version 2 pools gold and food in the party record, version 3 weapons and
 * armour, version 4 gems, keys, powders and torches, version 5 adds the
 * quest journal, version 6 the moongates the party has come out of;
 * older saves are
 * migrated on load.
 */
export const SAVE_VERSION = 6;
export const SAVE_KEY = 'ultima3.save';

export interface SaveData {
  version: number;
  party: string;
  roster: string;
  surfaceTiles: string;
  surfaceMonsters: string;
  whirlpool: { x: number; y: number; dx: number; dy: number };
  x: number;
  y: number;
  moonPhase: [number, number];
  moonTimer: [number, number];
  windDirection: number;
  /** The quest journal (version 5 on; older saves start it empty). */
  journal?: JournalState;
  /** Moongates come out of, 0..7 (version 6 on). */
  moongates?: number[];
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A journal from a save, checked field by field; anything missing or odd starts empty. */
function restoreJournal(j: unknown): JournalState {
  const out = emptyJournal();
  if (!j || typeof j !== 'object') return out;
  const r = j as Record<string, unknown>;
  for (const flag of ['lordBritish', 'ambrosia', 'timeLord', 'wordKnown', 'serpentParted'] as const) out[flag] = r[flag] === true;
  for (const list of ['clues', 'seen'] as const) {
    if (Array.isArray(r[list])) out[list] = (r[list] as unknown[]).filter((s): s is string => typeof s === 'string');
  }
  return out;
}

/** Capture the world. Position is the surface position even when in a town. */
export function serialize(world: World): SaveData {
  const onSurface = world.party.location === Location.Sosaria;
  return {
    version: SAVE_VERSION,
    party: toBase64(world.party.bytes),
    roster: toBase64(world.roster.bytes),
    surfaceTiles: toBase64(world.surface.tiles),
    surfaceMonsters: toBase64(world.surface.monsters.bytes),
    whirlpool: { ...world.whirlpool },
    x: onSurface ? world.x : world.returnX,
    y: onSurface ? world.y : world.returnY,
    moonPhase: [...world.moonPhase],
    moonTimer: [...world.moonTimer],
    windDirection: world.windDirection,
    journal: { ...world.journal, clues: [...world.journal.clues], seen: [...world.journal.seen] },
    moongates: [...world.gatesKnown],
  };
}

/** Restore a world from `data`. Returns false (leaving the world untouched) if the data is unusable. */
export function restore(world: World, data: SaveData): boolean {
  if (!Number.isInteger(data.version) || data.version < 1 || data.version > SAVE_VERSION) return false;
  try {
    const party = fromBase64(data.party);
    const roster = fromBase64(data.roster);
    const tiles = fromBase64(data.surfaceTiles);
    const monsters = fromBase64(data.surfaceMonsters);
    if (party.length !== 64 || roster.length !== 1280 || monsters.length !== 256) return false;
    const surface = world.loadMapState(MapId.Sosaria);
    if (tiles.length !== surface.tiles.length) return false;

    world.party.bytes.set(party);
    world.roster.bytes.set(roster);
    surface.tiles.set(tiles);
    blockExodusApproach(surface, world.diagonalMoves); // the save may have been made with the other setting
    surface.monsters.bytes.set(monsters);
    world.surface = surface;
    world.current = surface;
    world.whirlpool = { ...data.whirlpool };
    world.party.location = Location.Sosaria;
    world.x = world.returnX = world.party.surfaceX = data.x;
    world.y = world.returnY = world.party.surfaceY = data.y;
    world.moonPhase = [data.moonPhase[0], data.moonPhase[1]];
    world.moonTimer = [data.moonTimer[0], data.moonTimer[1]];
    world.windDirection = data.windDirection;
    if (data.version < 2) world.poolPurses(); // members' purses become the party's
    if (data.version < 3) world.poolGear(); // members' bags become the party's
    if (data.version < 4) world.poolSupplies(); // and their gems, keys, powders and torches
    world.journal = restoreJournal(data.journal);
    world.gatesKnown = Array.isArray(data.moongates)
      ? data.moongates.filter((g): g is number => Number.isInteger(g) && g >= 0 && g < 8)
      : [];
    return true;
  } catch {
    return false;
  }
}

/** localStorage wrapper. Every call is guarded: storage may be unavailable or full. */
export const localSave = {
  write(world: World): boolean {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(world)));
      return true;
    } catch {
      return false;
    }
  },
  read(world: World): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      return restore(world, JSON.parse(raw) as SaveData);
    } catch {
      return false;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
};

// ---------------------------------------------------------------------------
// Export and import (this port): the save and the dungeon auto-map as one
// piece of JSON text, carried through the clipboard between browsers.
// ---------------------------------------------------------------------------

export const EXPORT_FORMAT = 1;

export interface ExportedGame {
  game: 'ultima3';
  format: number;
  /** When it was exported, ISO 8601. */
  exported: string;
  save: SaveData;
  /** The dungeon auto-map store as text, or null when there is none. */
  automap: string | null;
}

/** The current game as text for the clipboard. */
export function exportGame(world: World, automap: string | null): string {
  const out: ExportedGame = { game: 'ultima3', format: EXPORT_FORMAT, exported: new Date().toISOString(), save: serialize(world), automap };
  return JSON.stringify(out);
}

/**
 * Read exported text back. Throws an Error whose message says, in a few
 * words fit for the screen, why the text is not an exported game. The save
 * inside is checked for shape only; `restore` checks its content.
 */
export function parseExport(text: string): { save: SaveData; automap: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not JSON');
  }
  if (!raw || typeof raw !== 'object') throw new Error('not a game');
  const o = raw as Record<string, unknown>;
  if (o.game !== 'ultima3' || typeof o.format !== 'number') throw new Error('not an Ultima III game');
  if (o.format > EXPORT_FORMAT) throw new Error('from a newer version');
  const save = o.save;
  if (!save || typeof save !== 'object') throw new Error('no save inside');
  const sv = save as Partial<SaveData>;
  if (typeof sv.version !== 'number' || sv.version < 1 || sv.version > SAVE_VERSION) throw new Error('save version unknown');
  for (const k of ['party', 'roster', 'surfaceTiles', 'surfaceMonsters'] as const)
    if (typeof sv[k] !== 'string') throw new Error('save incomplete');
  return { save: sv as SaveData, automap: typeof o.automap === 'string' ? o.automap : null };
}

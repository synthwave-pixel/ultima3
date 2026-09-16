/**
 * automap.ts
 *
 * The dungeon auto-map: which cells of each dungeon level the party has
 * stood next to with a lit torch. None of this existed in the original,
 * where players kept graph paper; here the map fills in as they explore.
 *
 * What is "seen" is only a mask. The map itself is drawn from the live
 * level data under that mask, so an opened chest or a new one shows as it
 * is now. The mask lives in its own browser store (see `main.ts`), not in
 * the save file: reloading the last save keeps what the player learned,
 * and a new game starts blank.
 *
 * In the dark nothing is recorded, but the 3x3 around the party is still
 * shown (`cellVisible`) so a party without torches can feel its way back.
 */

import type { World } from './world.ts';

/** A pluggable store: the browser's localStorage in the game, memory in tests. */
export interface AutoMapStore {
  read(): string | null;
  write(text: string): void;
}

/** How the map shows in a dungeon: not at all, a 5x5 overlay, or the whole level. */
export type MapMode = 'off' | 'small' | 'full';
export const MAP_MODES: MapMode[] = ['off', 'small', 'full'];

const LEVEL_CELLS = 256;

export class AutoMap {
  /** "dungeonId:level" -> 256 flags, one per cell, row-major. */
  private seen = new Map<string, Uint8Array>();

  constructor(private readonly store: AutoMapStore | null = null) {
    this.load();
  }

  private levelKey(dungeon: number, level: number): string {
    return `${dungeon}:${level}`;
  }

  private levelMask(dungeon: number, level: number, create: boolean): Uint8Array | undefined {
    const key = this.levelKey(dungeon, level);
    let mask = this.seen.get(key);
    if (!mask && create) {
      mask = new Uint8Array(LEVEL_CELLS);
      this.seen.set(key, mask);
    }
    return mask;
  }

  /** Record the 3x3 around (x, y) on the level, wrapping at the edges as the dungeon does. */
  mark(dungeon: number, level: number, x: number, y: number): void {
    const mask = this.levelMask(dungeon, level, true)!;
    let changed = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((y + dy) & 0x0f) * 16 + ((x + dx) & 0x0f);
        if (!mask[i]) changed = true;
        mask[i] = 1;
      }
    }
    if (changed) this.save();
  }

  isSeen(dungeon: number, level: number, x: number, y: number): boolean {
    const mask = this.levelMask(dungeon, level, false);
    return !!mask && mask[(y & 0x0f) * 16 + (x & 0x0f)] === 1;
  }

  /** How many cells of the level have been seen (for tests and curiosity). */
  seenCount(dungeon: number, level: number): number {
    const mask = this.levelMask(dungeon, level, false);
    return mask ? mask.reduce((n, v) => n + v, 0) : 0;
  }

  /** Forget everything: a new game starts with blank maps. */
  clear(): void {
    this.seen.clear();
    this.save();
  }

  /** The store holds JSON: each level's flags as a string of 256 '0'/'1' characters. */
  private load(): void {
    if (!this.store) return;
    try {
      const raw = this.store.read();
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [key, flags] of Object.entries(data)) {
        if (typeof flags !== 'string' || flags.length !== LEVEL_CELLS) continue;
        this.seen.set(
          key,
          Uint8Array.from(flags, (ch) => (ch === '1' ? 1 : 0)),
        );
      }
    } catch {
      /* a bad store is an empty map */
    }
  }

  private save(): void {
    if (!this.store) return;
    const data: Record<string, string> = {};
    for (const [key, mask] of this.seen) data[key] = Array.from(mask, (v) => (v ? '1' : '0')).join('');
    try {
      this.store.write(JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
  }
}

/**
 * Whether the auto-map may show cell (x, y) of the current level: seen
 * before, or within the 3x3 around the party while it is dark (shown but
 * never recorded, so torches keep their worth).
 */
export function cellVisible(world: World, x: number, y: number): boolean {
  if (world.autoMap.isSeen(world.current.id, world.dungeon.level, x, y)) return true;
  if (world.dungeon.torch > 0) return false;
  const dx = Math.abs(((x - world.x) & 0x0f) === 15 ? -1 : (x - world.x) & 0x0f);
  const dy = Math.abs(((y - world.y) & 0x0f) === 15 ? -1 : (y - world.y) & 0x0f);
  return dx <= 1 && dy <= 1;
}

/** The next map mode after `mode`, cycling off -> small -> full -> off. */
export function nextMapMode(mode: MapMode): MapMode {
  return MAP_MODES[(MAP_MODES.indexOf(mode) + 1) % MAP_MODES.length];
}

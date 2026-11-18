/**
 * borderTone.ts
 *
 * The Remastered frame takes the colour of where the party is, as the Ultima V port's does (its chromeTone.ts): the
 * copper as it is in a town or a castle, where the party is safe; blue out on Sosaria and at sea; a soft gold on
 * Ambrosia, the isle of the shrines; grey in the dungeons, darker on each level down; and in Exodus' castle the purple
 * that port gives a towne a Shadowlord is in. A fight takes the colour of where it is fought. Each is a tone of the
 * copper: its hue changed, or its colour taken away, its light and shade as the copper has them.
 */

import { Location } from '../game/party.ts';

/** A tone of the frame: a hue in degrees (none: the colour's own), and its saturation and value scaled. */
export interface BorderTone {
  hue?: number;
  sat: number;
  value: number;
}

/** The sets whose frame is toned so (the rest keep their sheet's frame as it is drawn). */
export const TONED_BORDER_SETS = new Set(['Remastered']);

const SOSARIA: BorderTone = { hue: 215, sat: 1, value: 1.1 };
const AMBROSIA: BorderTone = { hue: 42, sat: 0.8, value: 1.12 };
const EXODUS: BorderTone = { hue: 285, sat: 1, value: 1.05 };
/** The dungeons' grey on their first level and their eighth. */
const DUNGEON_TOP = 0.62;
const DUNGEON_FOOT = 0.46;

/** Where the party is, as the frame's tone needs it. */
export interface Whereabouts {
  /** Where it is, or where it fought from in a fight. */
  location: number;
  /** The dungeon level, 0 to 7, in a dungeon. */
  level: number;
  /** Inside Exodus' castle, Exodus still standing. */
  exodusCastle: boolean;
}

/** The frame's tone at `where`; null for the copper as it is. */
export function borderToneAt(where: Whereabouts): BorderTone | null {
  if (where.exodusCastle) return EXODUS;
  switch (where.location) {
    case Location.Sosaria:
      return SOSARIA;
    case Location.Ambrosia:
      return AMBROSIA;
    case Location.Dungeon: {
      const level = Math.max(0, Math.min(7, where.level));
      return { sat: 0, value: DUNGEON_TOP + ((DUNGEON_FOOT - DUNGEON_TOP) * level) / 7 };
    }
    default:
      return null;
  }
}

export const toneKey = (t: BorderTone | null): string => (t ? `${t.hue ?? '-'}|${t.sat.toFixed(3)}|${t.value.toFixed(3)}` : '');

/** `rgba` (canvas image data, in place) in tone `t`: each pixel's hue, saturation and value changed as it says. */
export function toneImage(rgba: Uint8ClampedArray, t: BorderTone): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const [r, g, b] = [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = t.hue !== undefined ? t.hue / 60 : (h + 6) % 6;
    const s = Math.min(1, (max === 0 ? 0 : d / max) * t.sat);
    const v = Math.min(1, max * t.value);
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const m = v - c;
    rgba[i] = Math.round((r1 + m) * 255);
    rgba[i + 1] = Math.round((g1 + m) * 255);
    rgba[i + 2] = Math.round((b1 + m) * 255);
  }
}

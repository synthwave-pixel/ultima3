/**
 * avatarRegions.ts
 *
 * From the Ultima V port (its web/src/ui/avatarRegions.ts, as it dresses its Avatar and companions), for the
 * Remastered figures here (game/appearance.ts FIGURES, ui/figures.ts): which of a figure's pixels are its skin, its hair, its main clothes and its trim (appearance.ts), by rules
 * over the EGA colours and where they lie - a colour is one thing above the belt and another below - and the figure's
 * Modern PC cell painted through them: skin and hair from their ramps, by the step of the colour each replaces; the
 * clothes turned to the hue chosen, each pixel keeping its own saturation and value; everything else as drawn.
 *
 * What is on the head follows the hair: left as drawn (the fighter's helm, the bard's hat) or in the clothes' colour
 * (the jester's hood) while the hair is the default, and hair of the colour chosen otherwise - the hood braided. The
 * mage's beard is his hair; a mage addressed as Lady has none, her chin skin and the beard's length her robe.
 */

import { type Appearance, HAIR, HAIR_STEP, type Hue, HUES, SKIN, SKIN_STEP } from '../game/appearance.ts';

/**
 * s skin, h hair, m main clothes, t trim, . as drawn; g headgear (as drawn, or hair once a colour is chosen), j the
 * jester's hood (the main clothes, or braided hair once a colour is chosen), b a beard (hair, or for a Lady the chin's
 * skin and the robe below it).
 */
export type Region = 's' | 'h' | 'm' | 't' | '.' | 'g' | 'j' | 'b';

type Box = [number, number, number, number];

/**
 * A rule: `colours` within the box (x0, x1, y0, y1, inclusive) are `region`, but not within any of the `unless` boxes;
 * and only in the `frames` (0 to 3) listed, where there are some.
 */
interface Rule {
  region: Exclude<Region, '.'>;
  colours: number[];
  frames?: number[];
  box?: Box;
  unless?: Box[];
}

const N = 16;
const HI = 4;
const CELL = N * HI;

/** Per figure (its first frame), in order: the first rule a pixel meets is its region. */
export const RULES: ReadonlyMap<number, Rule[]> = new Map([
  // The fighter: the helm on his head (hair, once a colour is chosen), the face and the hands brown above the belt, the
  // tunic green, the trousers and belt red - but not the shield's red cross, on the left above the knee. The boots as
  // drawn.
  [
    0x14c,
    [
      { region: 'g', colours: [7, 8, 15], box: [4, 10, 0, 3] },
      { region: 's', colours: [6], box: [0, 15, 0, 8] },
      { region: 'm', colours: [2, 10] },
      { region: 't', colours: [4, 12], unless: [[0, 6, 0, 10]] },
    ],
  ],
  // The mage: the white hair round the face and the beard below it down the chest, the face and hands brown, the robe
  // blue, and the belt red and the staff's light purple the trim (its yellow head as drawn). In the first frame the
  // spell's sparkle top left (which has a brown and a red pixel in it) and the staff's glow top right (blue in it too)
  // are kept out of the frame's rules, but for the staff's purple in the glow, which is the trim's with it.
  [
    0x140,
    [
      { region: 'h', colours: [7, 15], box: [5, 9, 2, 4] },
      { region: 'b', colours: [7, 15], box: [5, 9, 5, 9] },
      { region: 's', colours: [6], frames: [0], box: [0, 15, 2, 11], unless: [[0, 4, 0, 4]] },
      { region: 's', colours: [6], frames: [1, 2, 3], box: [0, 15, 2, 11] },
      {
        region: 'm',
        colours: [1, 9],
        frames: [0],
        unless: [
          [0, 4, 0, 4],
          [12, 15, 0, 3],
        ],
      },
      { region: 'm', colours: [1, 9], frames: [1, 2, 3] },
      { region: 't', colours: [4], box: [0, 15, 8, 11] },
      { region: 't', colours: [13] },
    ],
  ],
  // The bard: the hat (hair, once a colour is chosen), the face brown under it and the hand at the right, the tunic
  // green, the hose's top red. Lute and legs as drawn - the lute's brown body, which moves from his left to his chest,
  // and the brown at his belt too.
  [
    0x144,
    [
      { region: 'g', colours: [7, 8, 15], box: [5, 10, 0, 2] },
      { region: 's', colours: [6], box: [5, 10, 0, 4] },
      { region: 's', colours: [6], box: [11, 15, 5, 9] },
      { region: 'm', colours: [2, 10] },
      { region: 't', colours: [4, 12] },
    ],
  ],
  // The jester, as PC Ultima V drew him (not quite Ultima V's): the hood round the face light red (the suit's colour,
  // or braided hair once a colour is chosen - its points and bells as drawn), the face and the hands that juggle
  // brown, the suit dark red and its light red the trim. The figure stands a row lower in its second and fourth
  // frames, the hood with it.
  [
    0x158,
    [
      { region: 'j', colours: [12], frames: [0, 2], box: [3, 12, 0, 2] },
      { region: 'j', colours: [12], frames: [1, 3], box: [3, 12, 0, 3] },
      { region: 's', colours: [6], box: [0, 15, 2, 6] },
      { region: 'm', colours: [4] },
      { region: 't', colours: [12] },
    ],
  ],
  // The shepherd (the townsman): the hair yellow on top, the face and hands brown above the knee, the tunic green,
  // the belt and trousers red - not the mouth.
  [
    0x150,
    [
      { region: 'h', colours: [14], box: [0, 15, 0, 3] },
      { region: 's', colours: [6], box: [0, 15, 0, 11] },
      { region: 'm', colours: [2, 10] },
      { region: 't', colours: [4, 12], unless: [[0, 15, 0, 4]] },
    ],
  ],
]);

/**
 * Figures whose regions are painted pixel by pixel rather than found by rules, per frame (0 to 3), a row of sixteen
 * to a line: s skin, m main clothes, t trim, g headgear, . as drawn; a space where the figure is see-through.
 *
 * The fighter companions walk as (the class's figure, not the Avatar's): a knight in grey plate, painted by hand -
 * the helm on his head (hair, once a colour is chosen), the face, neck and sword hand; the round shield on his left
 * the trim, the plate the main clothes, tinted, being grey (hued); the sword out to his right, and the yellow of its
 * hilt and his belt, as drawn.
 */
export const MASKS: ReadonlyMap<number, readonly (readonly string[])[]> = new Map([
  [
    0x148,
    [
      [
        '       ggg   .  ',
        '      ggggg  .  ',
        '      g s g  .  ',
        '      gs sg  .  ',
        '  tttt  s  mm.  ',
        ' tttttm   mmm.  ',
        'ttttttmmmmm .s. ',
        'ttttttmmmmm m.. ',
        'ttttttm .   m . ',
        ' tttttmmmmm  .  ',
        '  ttt mmmmm     ',
        '      m   m     ',
        '     mm  mm     ',
        '     mm  mm     ',
        '     mm  mm     ',
        '    mmm  mmm    ',
      ],
      [
        '       ggg      ',
        '      ggggg     ',
        '      g s g     ',
        '      gs sg     ',
        '   ttt  s  mm.  ',
        '  ttttt   mmm   ',
        ' ttttttmmmm m.  ',
        ' ttttttmmmmmm.  ',
        ' ttttttmmmmm... ',
        '  ttttm    m    ',
        '   ttt mmm      ',
        '      m   m     ',
        '     mm  mm     ',
        '     mm  mm     ',
        '     mm  mm     ',
        '    mmm  mmm    ',
      ],
      [
        '       ggg      ',
        '      ggggg     ',
        '      g s g     ',
        '      gs sg     ',
        '  tttt  s  mmm  ',
        ' ttt tm   m m   ',
        'ttttttmmmmm  m  ',
        'ttttttmmmmm m.  ',
        'ttttt   .    m. ',
        ' ttt mmmmmm  .. ',
        '  t  mmmmmm .s. ',
        '      m mmm  .  ',
        '     mm  mmm .  ',
        '     mm   mm .  ',
        '     mm   mm .  ',
        '    mmm   mmm.  ',
      ],
      [
        '      ggg      .',
        '     ggggg     .',
        '     g s g    . ',
        '  tttgs sg    . ',
        ' ttttt s  mm .  ',
        'ttttttm  mmm .  ',
        'ttttttmmmm .s   ',
        'ttttttmmmm mm.  ',
        ' ttttt  .  m .  ',
        '  ttt mmmm  .   ',
        '    mmmmmm      ',
        '     mm  m      ',
        '     mm mm      ',
        '     mm mm      ',
        '     mm mmm     ',
        '     mm         ',
      ],
    ],
  ],
]);

/** Whether figure `base` (its first frame) has regions to dress, by rules or by a mask. */
export const hasRegions = (base: number): boolean => RULES.has(base) || MASKS.has(base);

const inside = (b: Box | undefined, x: number, y: number): boolean => !!b && x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3];

/** The regions of figure `base`'s frame `frame` (0 to 3), `px` its EGA colours: one per EGA pixel. */
export function labels(px: Uint8Array, base: number, frame: number): Region[] {
  const mask = MASKS.get(base)?.[frame];
  if (mask) return [...px].map((c, i) => (c === 0 ? '.' : ((mask[i >> 4]?.[i & 15] ?? '.').replace(' ', '.') as Region)));
  const rules = RULES.get(base) ?? [];
  return [...px].map((c, i) => {
    if (c === 0) return '.';
    const [x, y] = [i % N, Math.floor(i / N)];
    for (const r of rules) {
      if (!r.colours.includes(c)) continue;
      if (r.frames && !r.frames.includes(frame)) continue;
      if (r.box && !inside(r.box, x, y)) continue;
      if (r.unless?.some((b) => inside(b, x, y))) continue;
      return r.region;
    }
    return '.';
  });
}

/** RGBA (memory order) `v` in the colour `c` (HUES): a hue turned or tinted, white, grey or black - its light and shade kept. */
function recolour(v: number, c: Exclude<Hue, null>): number {
  if (typeof c === 'number') return hued(v, c);
  const [r, g, b] = [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
  const value = Math.max(r, g, b) / 255;
  const grey = Math.round(255 * (c === 'white' ? 0.62 + 0.38 * value : c === 'black' ? 0.1 + 0.3 * value : 0.25 + 0.6 * value));
  return (0xff000000 | (grey << 16) | (grey << 8) | grey) >>> 0;
}

const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/**
 * RGBA (memory order) `v` turned to hue `h` (degrees), its saturation and value kept - but where it has next to no
 * colour to turn (a fighter's grey plate), tinted with the hue, its light and shade kept, as enamel is.
 */
function hued(v: number, h: number): number {
  const [r, g, b] = [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff].map((k) => k / 255);
  const max = Math.max(r, g, b);
  const drawn = max ? (max - Math.min(r, g, b)) / max : 0;
  const sat = drawn < 0.15 ? 0.5 : drawn;
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return Math.round((max - max * sat * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return (0xff000000 | (f(1) << 16) | (f(3) << 8) | f(5)) >>> 0;
}

/**
 * Cell `cell` (CELL x CELL, RGBA in memory order, as original() draws it) painted as `look` through `regions`,
 * `egaIdx` the figure's EGA colours (for the ramps' steps); `lady`, whether the character is drawn without a beard
 * (appearance.ts `beardless`). A new cell; `cell` is left as it is.
 */
export function dress(cell: Uint32Array, egaIdx: Uint8Array, regions: Region[], look: Appearance, lady = false): Uint32Array {
  const out = cell.slice();
  const main = HUES[look.main];
  const trim = HUES[look.trim];
  const hair = HAIR[look.hair].ramp;
  const skin = (i: number): number => rgba(SKIN[look.skin][SKIN_STEP[egaIdx[i]] ?? 1]);
  const dyed = (i: number): number => rgba(hair![HAIR_STEP[egaIdx[i]] ?? 1]);
  // The robe's own colour as drawn (its lighter blue), for a beard's length on a Lady: the first such pixel of the
  // main clothes, or of any.
  const at = (i: number): number => (Math.floor(i / N) * HI + 1) * CELL + (i % N) * HI + 1;
  const robeAt = regions.findIndex((r, i) => r === 'm' && egaIdx[i] === 9);
  const robe = robeAt >= 0 ? cell[at(robeAt)] : cell[at(Math.max(0, regions.indexOf('m')))];
  for (let i = 0; i < N * N; i++) {
    const r = regions[i];
    if (r === '.') continue;
    const [x, y] = [i % N, Math.floor(i / N)];
    const [x0, y0] = [x * HI, y * HI];
    for (let dy = 0; dy < HI; dy++)
      for (let dx = 0; dx < HI; dx++) {
        const j = (y0 + dy) * CELL + x0 + dx;
        if (out[j] >>> 24 === 0) continue;
        if (r === 's') out[j] = skin(i);
        else if (r === 'h') out[j] = hair ? dyed(i) : out[j];
        else if (r === 'g') out[j] = hair ? dyed(i) : out[j];
        else if (r === 'j') {
          // Braided: light, mid and shade across the hood in diagonal bands, as plaits lie.
          if (hair) out[j] = rgba(hair[(x + y) % 3]);
          else if (main !== null) out[j] = recolour(out[j], main);
        } else if (r === 'b') {
          if (!lady) out[j] = hair ? dyed(i) : out[j];
          // A Lady's chin, the beard's top row, is skin; below it, the robe.
          else if (y === 0 || regions[i - N] !== 'b') out[j] = skin(i);
          else out[j] = main !== null ? recolour(robe, main) : robe;
        } else if (r === 'm' && main !== null) out[j] = recolour(out[j], main);
        else if (r === 't' && trim !== null) out[j] = recolour(out[j], trim);
      }
  }
  return out;
}

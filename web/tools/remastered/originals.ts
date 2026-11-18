/**
 * originals.ts
 *
 * The Standard look's actors and furniture: the original EGA tiles themselves (docs/standard-originals.md), taken
 * from the player's own TILES.16 as the game runs - the port ships none of them. Each is lifted off the ground it was
 * drawn on (plain black, or the brick floor, the grass, the mountains the EGA drew beneath it), so the Standard
 * floor or land shows through; its sixteen colours are toned to the Standard palette; a few are recoloured (the
 * wood of a ladder, a chair, a skiff brown where the EGA had it gold or white); and it is enlarged in whole pixels,
 * four to one, with no outline added.
 */

import { EGA_PALETTE, HI, PEOPLE_SKIN, SKIN, SKIN_STEP } from './ega.ts';

const N = 16;
const CELL = N * HI;

/** The EGA's colours by name, for the recolourings below. */
const BLACK = 0;
const RED = 4;
const BROWN = 6;
const LGRAY = 7;
const DGRAY = 8;
const CYAN = 3;
const LRED = 12;
const LBLUE = 9;
const LCYAN = 11;
const YELLOW = 14;
const WHITE = 15;

/**
 * The EGA's sixteen colours toned to the Standard palette (0xRRGGBB): a little less saturated and warmer, the
 * brightest brought down a touch - so an original stands in the same light as the Standard land it is on.
 */
export const TONED = [
  0x16141a, 0x2e3c86, 0x3c7a32, 0x2c8480, 0x962e26, 0x843e88, 0x8a5628, 0xa8a69e, 0x56565c, 0x5e74d0, 0x7cc064, 0x76cccc, 0xd87060,
  0xcc7ccc, 0xe0cc64, 0xf0ece0,
];

/** Wood, light and dark: what the EGA drew gold and brown on a ladder or a chair. */
const WOOD = { [YELLOW]: 0x9c6c3a, [BROWN]: 0x5e3c1e };
/** A roast, not a gold one. */
const ROAST = { [YELLOW]: 0xa8683a, [BROWN]: 0x6a3e1c };
/** A skiff all in browns: its white planks, its gold oars and its teal fittings. */
const SKIFF = { [WHITE]: 0xc09264, [YELLOW]: 0x946434, [BROWN]: 0x5e3a1c, [LCYAN]: 0x7a5634, [CYAN]: 0x5a3c20 };
/** A skiff with its rower: the hull brown where the EGA had it red. */
const ROWED = { [RED]: 0x6a4424, [LRED]: 0x9c6c3a };
/** Silver where the EGA had gold. */
const SILVER = { [YELLOW]: 0xc4c8d0, [BROWN]: 0x6a6e78 };
/** A nail: a neutral grey as light as the toned brown of the wood it is in (luma 96). */
const NAILS = { [LGRAY]: 0x606060 };
/** The top of a battlement: the toned white a fifth darker. */
const BATTLEMENT = { [WHITE]: 0xc0bdb3 };
/** The dark of a wall's joints and of the crenellations' structure: a dark grey, not the EGA's black. */
const STONE_DARK = 0x2e2e32;
/** The wine cask's hoops: a light brown shading where the EGA had yellow. */
const CASK = { [YELLOW]: 0xa8784a };
/** Leather: the gold's bag brown where the EGA had it gold, its light a paler brown. */
const LEATHER = { [YELLOW]: 0x9a6a3c, [BROWN]: 0x5a3a1e, [WHITE]: 0xc49a6a };
/** The barrel's light: a paler shade of its own brown, not gold. */
const BARREL = { [YELLOW]: 0xae7a4a };
/** The corpse: its light red inside nearer the red round it. */
const CORPSE = { [LRED]: 0xa8392e };
/** The Avatar's hilt silver, not gold. */
const HILT = { [YELLOW]: 0xc4c8d0 };
/** The pirate ship's sails near black. */
const PIRATE = { [DGRAY]: 0x1c1c22, [LGRAY]: 0x34343c };
/** A ship's rail (redrawn, REDRAWN): its lit edge, its wood, its shaded edge, the shadow it casts, its bolts. */
const RAIL = { [YELLOW]: 0xa87444, [BROWN]: 0x7a5028, [RED]: 0x4e3018, [DGRAY]: 0x2a1c10, [LGRAY]: 0x8a8a90 };
/** Rubble (redrawn): stones lit on top, their faces, their shade, and the dark between them. */
const RUBBLE = { [WHITE]: 0xb4b2aa, [LGRAY]: 0x8a8880, [DGRAY]: 0x5a5a5e, [RED]: 0x2e2e32 };
/** Bones (redrawn): old bone, lit, in shade, and the skull's hollows. */
const BONES = { [WHITE]: 0xd8d0b8, [LGRAY]: 0xa8a08e, [DGRAY]: 0x5e584e, [RED]: 0x2a2620 };

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Colours changed tile by tile: EGA colour index to 0xRRGGBB. */
const RECOLOUR = new Map<number, Record<number, number>>([
  [0x43, RAIL],
  ...[0xc0, 0xc1, 0xc2].map((t) => [t, RUBBLE] as [number, Record<number, number>]),
  [0xcf, BONES],
  [0x10f, ROAST],
  ...[0x117, 0x118, 0xc8, 0xc9].map((t) => [t, WOOD] as [number, Record<number, number>]),
  // The chairs, empty and taken, alike.
  ...[...range(0x90, 0x93), ...range(0x130, 0x13b)].map((t) => [t, WOOD] as [number, Record<number, number>]),
  ...range(0x128, 0x12b).map((t) => [t, SKIFF] as [number, Record<number, number>]),
  ...[0x114, 0x115].map((t) => [t, ROWED] as [number, Record<number, number>]),
  ...range(0x13c, 0x13f).map((t) => [t, SILVER] as [number, Record<number, number>]),
  ...range(0x9d, 0x9f).map((t) => [t, SILVER] as [number, Record<number, number>]),
  ...range(0x12c, 0x12f).map((t) => [t, PIRATE] as [number, Record<number, number>]),
  // The nails in the wooden floor and the planks a grey no lighter than the wood round them.
  ...[0x40, 0x48, 0x49].map((t) => [t, NAILS] as [number, Record<number, number>]),
  // The crenellations' tops a light grey, the EGA's white brought down; the black of their structure, and of the wall's
  // and the hidden door's joints, a dark grey.
  ...range(0x50, 0x57).map((t) => [t, { ...BATTLEMENT, [BLACK]: STONE_DARK }] as [number, Record<number, number>]),
  ...[0x4e, 0x4f].map((t) => [t, { [BLACK]: STONE_DARK }] as [number, Record<number, number>]),
  [0xa7, CASK],
  [0xa6, BARREL],
  [0x11f, CORPSE],
  // The chests (closed, open and the mimics that pass for them) wood, the gold's bag leather: brown, not gold.
  ...[0x101, 0x10e, ...range(0x1a8, 0x1ab)].map((t) => [t, WOOD] as [number, Record<number, number>]),
  [0x102, LEATHER],
  // The Avatar's hilt silver, standing and walking.
  ...[0x11c, ...range(0x14c, 0x14f)].map((t) => [t, HILT] as [number, Record<number, number>]),
]);

type Box = [number, number, number, number];

/**
 * A rule for the skin of a person: `colours` within the box (x0, x1, y0, y1, inclusive) are skin, but not within any of
 * the `unless` boxes; and only in the `frames` (0 to 3) listed, where there are some.
 */
interface PeopleRule {
  colours: number[];
  box: Box;
  frames?: number[];
  unless?: Box[];
}

/** The face and hands of a figure in brown, above its shoes. */
const FACE: PeopleRule[] = [{ colours: [6], box: [0, 15, 0, 11] }];
/** The same, for a figure with a sword held up at the right: not its grip, brown between the yellow of its hilt. */
const ARMED: PeopleRule[] = [{ colours: [6], box: [0, 15, 0, 11], unless: [[12, 15, 5, 8]] }];

/**
 * The people of Sosaria's skin, by figure (its first tile): the neutral light brown (appearance.ts's PEOPLE_SKIN),
 * painted by the step of the EGA colour it replaces, where the figure's face and hands are; the shoes, the chairs and
 * the rest of the brown are left as they are drawn. Not the Avatar's own four (avatarRegions.ts has theirs, for the
 * skins he can choose), nor the monsters'.
 */
export const PEOPLE_RULES: ReadonlyMap<number, PeopleRule[]> = new Map([
  // The Avatar standing: the tile after it is the invisible, then the falling and the corpse.
  [0x11c, ARMED],
  // Seated (n e s w): the chair is brown too, so each facing has the box its face is in. From the north, the back of
  // the head, no face.
  [
    0x130,
    [
      { colours: [6], frames: [1], box: [5, 8, 0, 2] },
      { colours: [6], frames: [2, 3], box: [7, 10, 0, 2] },
    ],
  ],
  // Eating, facing south. (Facing north, at 0x138, the back of the head again.)
  [0x134, [{ colours: [6], box: [7, 10, 1, 2] }]],
  // The mage: not the sparkle of his spell, top left.
  [0x140, [{ colours: [6], box: [0, 15, 2, 11], unless: [[0, 4, 0, 4]] }]],
  // The bard: the face under the hat and the hand at the right; the brown that moves about the left and the chest is
  // his lute's body (with the brown at his belt), as avatarRegions.ts has it.
  [
    0x144,
    [
      { colours: [6], box: [5, 10, 0, 4] },
      { colours: [6], box: [11, 15, 5, 9] },
    ],
  ],
  [0x148, ARMED],
  [0x150, FACE],
  [0x154, FACE],
  // The jester: the face only; the brown at the ends of his limbs is his shoes.
  [0x158, [{ colours: [6], box: [5, 10, 2, 6] }]],
  // The minstrel: the face; the lute in his hands is brown too.
  [0x15c, [{ colours: [6], box: [6, 10, 0, 3] }]],
  // The prisoner at the harpsichord: yellow in the face, brown shading it; the harpsichord's wood is brown too.
  [
    0x160,
    [
      { colours: [14], box: [3, 12, 3, 9] },
      { colours: [6], box: [6, 10, 5, 7] },
    ],
  ],
  // At the loom: the hands and the face brown (the hair dark red above it).
  [0x164, [{ colours: [6], box: [0, 15, 4, 10] }]],
  // The child, all in skin: the yellow of the light on it and the brown of its shade, head to foot.
  [0x168, [{ colours: [14, 6], box: [0, 15, 0, 15] }]],
  [0x16c, FACE],
  // The guard: the face; the spear is brown, and in the first frame held at the left.
  [0x170, [{ colours: [6], box: [6, 10, 1, 4] }]],
  [0x178, FACE],
  // Lord British: not the jewels in the glow round him in the first frame (top left and top right), which the raised hand
  // of the last frame is at.
  [
    0x17c,
    [
      {
        colours: [6],
        frames: [0],
        box: [0, 15, 0, 11],
        unless: [
          [0, 3, 2, 3],
          [12, 15, 2, 3],
        ],
      },
      { colours: [6], frames: [1, 2, 3], box: [0, 15, 0, 11] },
    ],
  ],
]);

const insideBox = (b: Box | undefined, x: number, y: number): boolean => !!b && x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3];

/** The rules of the person that tile `t` is a frame of, if it is one; for the tile's frame, its number (0 to 3) too. */
function peopleRules(t: number): { rules: PeopleRule[]; frame: number } | null {
  const base = t & ~3;
  const rules = t >= 0x100 ? PEOPLE_RULES.get(base) : undefined;
  // The Avatar standing has no frames: the three tiles after it are others.
  if (!rules || (base === 0x11c && t !== 0x11c)) return null;
  return { rules, frame: t - base };
}

/**
 * Tiles in the EGA's own colours, not toned: those whose colour is what they are - the lava, the invisible, the
 * ghost, the sea horse, the regalia (the Shard, the crown, the sceptre, the amulet), the fields, the Shadowlords.
 */
const RAW = new Set([
  0x8f,
  0x11d,
  ...range(0x174, 0x177),
  ...range(0x180, 0x183),
  ...range(0x1b4, 0x1b7),
  ...range(0x1e8, 0x1eb),
  ...range(0x1fc, 0x1ff),
]);

/** The Shadowlords: what lies between their outline's sides, row by row, is their black body, never ground. */
const BODIES = new Set(range(0x1fc, 0x1ff));

/** The flowers: the grass, with single flowers in red, yellow and blue. */
const FLOWERS = new Set([0x1e, 0x1f]);
/** The flowers' hues, in turn (degrees). */
const FLOWER_HUES = [0, 52, 220];

/** The plowed field and the crops: their black, the earth's, a brown a little darker than a road's. */
const EARTH = new Set([0x2c, 0x2d]);

/**
 * The paths (0x20 to 0x26) and the dirt edges (0x30 to 0x33), their specks as the original has them, pixel for pixel:
 * each speck a road brown of its own, here and there a dark grey stone; the blades the grass's blades. What lies
 * between is the grass's ground, but within a path's band, where the original has no blades, a dark bare earth - so
 * a path is a track through the grass and an edge a scatter of dirt on it, and nothing is filled in.
 */
const ROADS = new Set([...range(0x20, 0x26), ...range(0x30, 0x33)]);
const PATHS = new Set(range(0x20, 0x26));
const ROAD_SPECKS = [0x5e3e1f, 0x644324, 0x6a4727];
const ROAD_STONES = [0x4a4a50, 0x5c5c62];
const ROAD_EARTH = 0x241b10;

/**
 * The dirt edges beside water, which the map lays along the shores: plain grass, their specks the grass's ground, as
 * the sand fringe the shores are drawn with (SHORE_SAND) runs along the water in their place. Each edge's specks lie
 * along one side of it, and it is by the water where the square on that side is water - the square's `around` (5 by
 * 5, the square in the middle) as a Place has it.
 */
const WATER_SIDE = new Map([
  [0x30, 7],
  [0x31, 13],
  [0x32, 17],
  [0x33, 11],
]);
export const WET_EDGES: readonly number[] = [...WATER_SIDE.keys()];
/** The water beside an edge: the seas and lakes, their shores, the rivers. */
const BESIDE = new Set([...range(0x01, 0x03), ...range(0x34, 0x37), ...range(0x60, 0x6f)]);
export const byWater = (t: number, around: ArrayLike<number>): boolean => {
  const side = WATER_SIDE.get(t);
  return side !== undefined && BESIDE.has(around[side]);
};
/** The specks of the sand fringe along the grass by the water (shore.ts ShoreStyle). */
export const SHORE_SAND: readonly number[] = [0x7a6640, 0x8a7448, 0x9c8452];

/** A value from 0 to 1 for place (x, y) and `seed`, the same each time. */
const hashAt = (x: number, y: number, seed: number): number =>
  (((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(seed, 83492791)) >>> 0) % 1000) / 1000;

/** A path's band, where it is track (bare earth between its specks): its dirt spread a pixel, the gaps closed, the stragglers dropped. */
function bandOf(px: Uint8Array): Uint8Array {
  const at = (m: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? 0 : m[y * N + x]);
  const around = (m: Uint8Array, x: number, y: number): number => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(m, x + dx, y + dy);
    return n;
  };
  let band = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const [x, y] = [i % N, Math.floor(i / N)];
    let dirt = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(px, x + dx, y + dy) === BROWN) dirt = true;
    // A blade of grass is never track.
    band[i] = dirt && px[i] !== 2 && px[i] !== 10 ? 1 : 0;
  }
  band = band.map((v, i) => (v || around(band, i % N, Math.floor(i / N)) >= 5 ? 1 : 0));
  return band.map((v, i) => (v && around(band, i % N, Math.floor(i / N)) >= 3 ? 1 : 0));
}
const EARTH_DARK = 0x6e4520;

/**
 * The rivers and their bridges (0x60 to 0x6f), drawn on their own (out in the world the map draws its rivers,
 * shore.ts, and these are never seen): the river where the EGA drew its lines of light blue (riverOf), those lines
 * the light blue, toned, behind them not the black and the grass's dark green the EGA drew through it but two blues of
 * the light blue's hue and saturation, darker - the deep where it was black, the other where it was grass; its banks
 * the grass, their specks of dirt the sand the map's shores are fringed with (SHORE_SAND).
 */
const RIVERS = new Set(range(0x60, 0x6f));
export const RIVER_BLUES = { deep: 0, shallow: 0 };

/** Where river tile `px` is river: round its lines of light blue, a pixel out, the gaps between them closed. */
function riverOf(px: Uint8Array): Uint8Array {
  const at = (m: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? 0 : m[y * N + x]);
  let river = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const [x, y] = [i % N, Math.floor(i / N)];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(px, x + dx, y + dy) === LBLUE) river[i] = 1;
  }
  // A pixel with most of those round it river is river, until none is left to close.
  for (let k = 0; k < 4; k++)
    river = river.map((v, i) => {
      if (v) return 1;
      const [x, y] = [i % N, Math.floor(i / N)];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(river, x + dx, y + dy);
      return n >= 5 ? 1 : 0;
    });
  return river;
}

/**
 * The waters: deep, water and shallow (0x01 to 0x03), their lines the light blue, behind them blues of its hue and
 * saturation, darker the deeper - under some of the deep's lines a darker blue still, under some of the shallows' a
 * lighter. The water's is the rivers' deep (RIVER_BLUES), so a river and the water it runs into are one.
 */
const WATERS = new Map<number, { ground: number; under: number }>();

/** The pier: lifted onto the water (StandardArt.useOriginals lays water under it). */
export const PIER = 0x47;

/**
 * The bridges and the pier (0x47): over the water, their own water lifted with their ground, the water beneath showing
 * as it rolls - between the pier's planks and round its posts too.
 */
const BRIDGES = new Set([0x1d, 0x6a, 0x6b, PIER]);
/** The EGA's water: blue, light blue, cyan and light cyan. */
const WATERY = new Set([1, 9, 3, 11]);

/** The desert, whose black is sand; the mountains and the peak, whose black is grey. */
const DESERT = 0x07;
const HIGH = new Set([0x0c, 0x0d]);

/** The corner pieces of a dungeon room: the wall's stone where they are white, the dark where they are black. */
export const CORNERS: readonly number[] = [0xd0, 0xd1, 0xd2, 0xd3];
/** The archway: the wall's stone, an arch through it. */
export const ARCHWAY = 0x87;

/** Pixels changed tile by tile, before anything else: [x, y, EGA colour]. */
const EDITS = new Map<number, [number, number, number][]>([
  // The gold's bag, its $ taken off: the sign's brown strokes laid over in the bag's gold.
  [
    0x102,
    [
      ...range(5, 9).flatMap((x) => [8, 10, 12].map((y): [number, number, number] => [x, y, YELLOW])),
      [4, 9, YELLOW],
      [5, 9, YELLOW],
      [7, 9, YELLOW],
      [7, 11, YELLOW],
      [9, 11, YELLOW],
      [10, 11, YELLOW],
      [7, 13, YELLOW],
    ],
  ],
]);

/**
 * The trapped souls (0x13c to 0x13f): a ghost in a mirror - the mirror (0x9d), its frame silver, and in its glass the
 * ghost (0x174 to 0x177, a frame to each of the soul's), drawn to fill the glass in its own colours.
 */
const SOULS = new Set(range(0x13c, 0x13f));
export const MIRROR = 0x9d;
const GHOST = 0x174;

/** The mirror's glass: its EGA pixels inside the frame, flooded from its middle through its dark and its blues. */
export function mirrorGlass(tiles: Uint8Array): Set<number> {
  const mirror = indices(tiles, MIRROR);
  const isGlass = (i: number): boolean => mirror[i] === BLACK || mirror[i] === 1 || mirror[i] === 9;
  const glass = new Set<number>([7 * N + 7]);
  const stack = [7 * N + 7];
  while (stack.length) {
    const i = stack.pop()!;
    const [x, y] = [i % N, Math.floor(i / N)];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const j = ny * N + nx;
      if (nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && !glass.has(j) && isGlass(j)) {
        glass.add(j);
        stack.push(j);
      }
    }
  }
  return glass;
}

/** The ghost in the mirror for soul `t`: the mirror's glass pixels the ghost shows in, index to its EGA colour. */
function ghostInMirror(tiles: Uint8Array, t: number): Map<number, number> {
  const ghost = indices(tiles, GHOST + (t - 0x13c));
  const glass = mirrorGlass(tiles);
  const xs = [...glass].map((i) => i % N);
  const ys = [...glass].map((i) => Math.floor(i / N));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out = new Map<number, number>();
  for (const i of glass) {
    const [x, y] = [i % N, Math.floor(i / N)];
    const c = ghost[Math.floor(((y - y0) * N) / (y1 - y0 + 1)) * N + Math.floor(((x - x0) * N) / (x1 - x0 + 1))];
    if (c !== BLACK) out.set(i, c);
  }
  return out;
}

/**
 * Tiles drawn anew in the EGA's colours, over the ground they stand on (the grass): '.' the ground, a hex digit the
 * colour. The grave marker (0x89) a small round-topped headstone, an inscription's line on it, where the EGA had a
 * cross - a marker for every grave, not one faith's; the tombstone (0x8a) has its RIP, so the two stay apart.
 */
const REDRAWN = new Map<number, [ground: number, rows: string[]]>([
  // A ship's rail: a beam running north and south along the deck, lit on its west edge, shaded on its east, its
  // shadow on the deck, a post under it every eight rows (its cap wider, bolted).
  [
    0x43,
    [
      0x40,
      [
        '......e6648.....',
        '......e6648.....',
        '......e6648.....',
        '.....ee67648....',
        '.....e666648....',
        '......e6648.....',
        '......e6448.....',
        '......e6648.....',
        '......e6648.....',
        '......e6648.....',
        '......e6648.....',
        '.....ee67648....',
        '.....e666648....',
        '......e6648.....',
        '......e4648.....',
        '......e6648.....',
      ],
    ],
  ],
  // Rubble: a low heap of broken stones, each lit on top and shaded below, the dark between them.
  [
    0xc0,
    [
      0xff,
      [
        '................',
        '................',
        '................',
        '................',
        '................',
        '.......ff7......',
        '......f77784....',
        '....ff7888ff7...',
        '...f7778447778..',
        '..f77884f77788..',
        '..7788447f78884.',
        '.f7784f777884...',
        '.77884777888f7..',
        '..884.8888..784.',
        '................',
        '................',
      ],
    ],
  ],
  [
    0xc1,
    [
      0xff,
      [
        '................',
        '................',
        '................',
        '................',
        '.ff7............',
        'f7778...........',
        '77884...........',
        '.884.....ff7....',
        '........f77784..',
        '.......f778f778.',
        '......f7784f7784',
        '......7788477884',
        '....ff78884884..',
        '...f7784...8....',
        '...7884.........',
        '....88..........',
      ],
    ],
  ],
  [
    0xc2,
    [
      0xff,
      [
        '................',
        '................',
        '................',
        '......ff7.......',
        '.....f77784.....',
        '....f7788ff7....',
        '...ff78847778...',
        '..f77784f77884..',
        '..77884f777884..',
        '.f7784f7788ff74.',
        '.7788477884f7784',
        'f7784f7784777884',
        '778847788478884.',
        '.884..884..884..',
        '................',
        '................',
      ],
    ],
  ],
  // Bones: a skull, its hollows dark, and two bones crossed beside it.
  [
    0xcf,
    [
      0xff,
      [
        '................',
        '................',
        '...fff7.........',
        '..ff77778.......',
        '.ff7777778......',
        '.f44774478......',
        '.f44774478......',
        '..7774778.......',
        '...7f7f78.......',
        '....8888ff..ff..',
        '........7ff7f7..',
        '..........ff8...',
        '..........ff8...',
        '........ff8.f7..',
        '........7f..8f..',
        '................',
      ],
    ],
  ],
]);

/** Tile `t`'s EGA colour indices as the Standard look draws it: its own, or as redrawn (REDRAWN, the souls' mirror). */
export function tileOf(tiles: Uint8Array, t: number): Uint8Array {
  if (SOULS.has(t)) return indices(tiles, MIRROR);
  const redrawn = REDRAWN.get(t);
  if (!redrawn) return indices(tiles, t);
  const [ground, rows] = redrawn;
  const px = indices(tiles, ground);
  rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && (px[y * N + x] = parseInt(c, 16))));
  return px;
}

/** The actors kept as the Standard look draws them: the key. */
const KEPT = new Set([0x107]);

/**
 * The map tiles drawn from the originals, lifted off their ground: the places named for it, the stump, the fruit tree
 * and the cactus, the furniture; and as chosen on the deltas page (2026-09-28), the places out in the world (the hut,
 * the Codex's shrine, the keep, the village, the towne, the cave, the mine, the lighthouse, the bridges, the
 * gargoyle's mouth, Blackthorn's palace and Lord British's castle), the pile of rocks, the stone wall, the loose brick,
 * the wall torches, the stairs, the arches, the burst and the dungeon's blood, spark and eyes
 * (docs/standard-originals.md).
 */
const MAP_TILES = [
  0x00,
  ...[0x10, 0x11, 0x12, 0x13, 0x14, 0x16, 0x17, 0x1b, 0x1d, 0x38],
  ...range(0x39, 0x3f),
  0x4c,
  0x4d,
  0x6a,
  0x6b,
  PIER,
  0xb0,
  0xb1,
  ...range(0xc4, 0xc7),
  ...range(0xc0, 0xc2),
  0xcc,
  0xcd,
  0xce,
  0xcf,
  0x43,
  0xe1,
  0xe2,
  0x15,
  0x18,
  0x19,
  0x1a,
  0x29,
  0x2a,
  0x2b,
  0x2e,
  0x2f,
  0x41,
  0x42,
  0x46,
  ...range(0x58, 0x5d),
  ...range(0x80, 0x86),
  ...range(0x88, 0x8b),
  0x8d,
  0x8e,
  ...range(0x90, 0x9f),
  ...range(0xa0, 0xaf),
  ...range(0xb2, 0xbb),
  0xbd,
  0xbe,
  0xbf,
  0xc8,
  0xc9,
  0xca,
  0xcb,
  ...range(0xd8, 0xdc),
  0xde,
  0xdf,
  0xe0,
  ...range(0xe8, 0xfd),
];

/** Every tile drawn from the originals that stands on a ground, lifted off it. */
export const ORIGINALS: ReadonlySet<number> = new Set([...MAP_TILES, ...range(0x100, 0x1ff).filter((t) => !KEPT.has(t))]);

/**
 * The land out in the world drawn from the originals too, whole (it is the ground): the waters, the swamp, the
 * grass and what grows on it, the desert, the high country, the roads and the worn earth, the rivers and the coast's
 * corners, the crops, the lava. The Standard look still draws the shores, the worn earth and the soils' edges from the
 * map over it (shore.ts, wear.ts, soils.ts), in these tiles' own colours. The towns' floors and walls stay the
 * Standard look's, and the bridges and the waterfall, drawn over the river.
 */
export const OUTDOORS: ReadonlySet<number> = new Set([
  ...range(0x01, 0x0f),
  0x1c,
  0x1e,
  0x1f,
  ...range(0x20, 0x26),
  0x2c,
  0x2d,
  ...range(0x30, 0x37),
  ...range(0x60, 0x69),
  ...range(0x6c, 0x6f),
  0x8f,
  0xe3,
  ...range(0xe4, 0xe7),
]);

/**
 * The towns' structure drawn from the originals, whole, as chosen on the deltas page: the wooden floor, the pier, the
 * planks, the arrow slit, the window, the hidden door, the wall, the crenellations, the Guardian's windows, the
 * fireplace and the dark. The cobbles, the hexagonal floor, the roofs and the white stone stay the Standard look's.
 */
export const STRUCTURE: ReadonlySet<number> = new Set([
  0x40,
  ...range(0x48, 0x4b),
  0x4e,
  0x4f,
  ...range(0x50, 0x57),
  0x5e,
  0x5f,
  0xbc,
  0xff,
  ...CORNERS,
  ARCHWAY,
]);

/** Doors, drawn whole as the EGA drew them: the dark between their planks and bars is not ground. */
const WHOLE = new Set([0x97, 0x98, 0xb8, 0xb9, 0xba, 0xbb]);

/** The moongate: the original square, its inside glowing (drawn again each tick). */
export const MOONGATE = 0xdc;

/**
 * The grounds the EGA drew its tiles on, as the tiles that are that ground: the brick floor, the grass, the desert
 * (a cactus's), the mountains, the wooden floor, the hexagonal floor. Plain black is the ground too.
 */
const GROUNDS = [0x44, 0x05, 0x07, 0x0c, 0x40, 0x45];

/** Tile `t`'s EGA colour indices (N x N) from the packed tiles, two pixels a byte. */
export function indices(tiles: Uint8Array, t: number): Uint8Array {
  const out = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const v = tiles[t * 128 + (i >> 1)];
    out[i] = i & 1 ? v & 15 : v >> 4;
  }
  return out;
}

/**
 * Which pixels of `px` are the ground it was drawn on: of black and the GROUNDS, the one its edge matches most, and
 * every pixel matching it that can be reached from the edge through others that do - so a figure's black eye or a
 * gap inside it stays, and what was drawn over the ground is kept.
 */
export function groundOf(tiles: Uint8Array, px: Uint8Array, found?: { pattern: Uint8Array | null }): Uint8Array {
  const grounds = GROUNDS.map((g) => indices(tiles, g));
  const edge: number[] = [];
  for (let i = 0; i < N; i++) edge.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
  const matches = (g: Uint8Array | null, i: number): boolean => (g ? px[i] === g[i] : px[i] === BLACK);
  let best: Uint8Array | null = null;
  let most = edge.filter((i) => matches(null, i)).length;
  for (const g of grounds) {
    const n = edge.filter((i) => matches(g, i)).length;
    // A pattern must show itself, not just its black: more of the edge than black alone accounts for.
    if (n > most) [best, most] = [g, n];
  }
  if (found) found.pattern = best;
  const out = new Uint8Array(N * N);
  const stack = edge.filter((i) => matches(best, i));
  for (const i of stack) out[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const [x, y] = [i % N, Math.floor(i / N)];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (!out[j] && matches(best, j)) {
        out[j] = 1;
        stack.push(j);
      }
    }
  }
  // The ground seen through a gap the edge does not reach (a keep's courtyard, between a tree's branches): each
  // patch of the ground's own pattern that shows something of it besides black, each of those a blade (blade), is
  // ground too. A patch of black alone (an eye, a gap in a figure) is the thing's own, and so is one whose coloured
  // pixels touch others (a leaf that falls where a blade would be): they stay.
  if (best) {
    const seen = out.slice();
    for (let i = 0; i < N * N; i++) {
      if (seen[i] || !matches(best, i)) continue;
      const patch = [i];
      seen[i] = 1;
      for (let k = 0; k < patch.length; k++) {
        const [x, y] = [patch[k] % N, Math.floor(patch[k] / N)];
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          const j = ny * N + nx;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[j] && matches(best, j)) {
            seen[j] = 1;
            patch.push(j);
          }
        }
      }
      if (patch.some((j) => px[j] !== BLACK) && patch.every((j) => px[j] === BLACK || blade(px, j))) for (const j of patch) out[j] = 1;
    }
  }
  return out;
}

/**
 * The blade of grass pixel `i` of `px` is part of, if it is one: a dash of one colour no more than two pixels long,
 * nothing but black round it, as the EGA drew the grass's blades. Its pixels, or null.
 */
function blade(px: Uint8Array, i: number): number[] | null {
  const c = px[i];
  if (c === BLACK) return null;
  const at: number[] = [i];
  for (let k = 0; k < at.length; k++) {
    const [x, y] = [at[k] % N, Math.floor(at[k] / N)];
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (px[j] === c) {
        if (!at.includes(j)) at.push(j);
        if (at.length > 2) return null;
      } else if (px[j] !== BLACK) return null;
    }
  }
  return at;
}

/** The pixels round `at` (four ways), off the tile left out. */
function round(at: number[]): number[] {
  const out: number[] = [];
  for (const i of at) {
    const [x, y] = [i % N, Math.floor(i / N)];
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ])
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !at.includes(ny * N + nx)) out.push(ny * N + nx);
  }
  return out;
}

/**
 * Which pixels of outdoor tile `px` are the grass: those as the grass tile (0x05) is - its green, 1, or the black
 * between its blades, 2 - amid pixels that are as the grass tile is (three of the four beside them, or the tile's
 * edge); so the grass between a wood's bushes or beside a road is found, and a leaf that happens to fall on a blade, or
 * the dark within a bush, is not.
 */
function grassOf(tiles: Uint8Array, px: Uint8Array): Uint8Array {
  const grass = indices(tiles, 0x05);
  const same = (x: number, y: number): boolean => x < 0 || y < 0 || x >= N || y >= N || px[y * N + x] === grass[y * N + x];
  const out = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const [x, y] = [i % N, Math.floor(i / N)];
    if (px[i] !== grass[i] || (px[i] !== 2 && px[i] !== 10 && px[i] !== BLACK)) continue;
    if ([same(x - 1, y), same(x + 1, y), same(x, y - 1), same(x, y + 1)].filter(Boolean).length >= 3) out[i] = px[i] === BLACK ? 2 : 1;
  }
  // Black is the grass's ground only in a tile with grass in it (a few of its blades): the water's, the mountains' and
  // the desert's black is their own.
  if (out.filter((v) => v === 1).length >= 3) {
    // Blades of its own besides the grass tile's (rocky grass, shrub): found by their shape, green all the same.
    for (let i = 0; i < N * N; i++) if (!out[i] && (px[i] === 2 || px[i] === 10) && blade(px, i)) out[i] = 1;
    return out;
  }
  out.fill(0);
  // A tile the EGA drew on its own scatter of grass, not the grass tile's (the hills): its blades found by their shape
  // (blade), green; and the open black round them the grass's ground - the black against anything else (a hill's
  // outline) left as it is.
  for (let i = 0; i < N * N; i++) if ((px[i] === 2 || px[i] === 10) && blade(px, i)) out[i] = 1;
  if (out.filter((v) => v === 1).length < 3) return out.fill(0);
  for (let i = 0; i < N * N; i++) {
    if (px[i] !== BLACK) continue;
    const [x, y] = [i % N, Math.floor(i / N)];
    const open = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ].every(([nx, ny]) => nx < 0 || ny < 0 || nx >= N || ny >= N || px[ny * N + nx] === BLACK || out[ny * N + nx] === 1);
    if (open) out[i] = 2;
  }
  return out;
}

/**
 * The grass's two colours in Modern PC (0xRRGGBB): the ground between the blades - the EGA's black - and the blades,
 * as chosen on the grass page (grass.html), which sets them to try others by eye. Below the world the land is drawn
 * darker and colder (standardArt.ts belowTheWorld), the grass with it.
 */
export const GRASS = { ground: 0, blade: 0 };
/** How many of outdoor tile `t`'s pixels are the grass's (grassOf): none for a tile with no grass in it. */
export function grassIn(tiles: Uint8Array, t: number): number {
  return OUTDOORS.has(t) ? grassOf(tiles, indices(tiles, t)).filter((v) => v !== 0).length : 0;
}

/** The grass's colours as Modern PC has them, before the grass page changes them. */
export const GRASS_DEFAULT = { ground: 0, blade: 0 };

// The rivers' blues: the light blue's hue and saturation, at a value of 0.24 (the deep) and 0.34 (where grass was).
{
  const [r, g, b] = [TONED[9] >> 16, (TONED[9] >> 8) & 0xff, TONED[9] & 0xff];
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const hue = ((max === r ? (g - b) / (max - min) : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4) * 60 + 360) % 360;
  const sat = (max - min) / max;
  RIVER_BLUES.deep = fromHsv(hue, sat, 0.24);
  RIVER_BLUES.shallow = fromHsv(hue, sat, 0.34);
  WATERS.set(0x01, { ground: fromHsv(hue, sat, 0.17), under: fromHsv(hue, sat, 0.11) });
  WATERS.set(0x02, { ground: RIVER_BLUES.deep, under: RIVER_BLUES.deep });
  WATERS.set(0x03, { ground: fromHsv(hue, sat, 0.31), under: fromHsv(hue, sat, 0.4) });
}

// Chosen on the grass page (2026-09-28): a dark green ground, the blades a little lighter.
GRASS_DEFAULT.ground = GRASS.ground = 0x162416;
GRASS_DEFAULT.blade = GRASS.blade = 0x1f361b;

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/**
 * The moongate's inside at `tick`: the EGA's light blue filled with a glow - bright at its heart, the blue at its
 * sides, breathing slowly - its frame as the EGA drew it.
 */
function glow(x: number, y: number, tick: number): number {
  const d = Math.hypot((x - 7) / 6, (y - 8.5) / 7.5);
  const pulse = 0.5 + 0.5 * Math.sin(tick / 4);
  const k = Math.max(0, 1 - d) * (0.65 + 0.35 * pulse);
  const mix = (a: number, b: number): number => Math.round(a + (b - a) * k);
  const [r, g, b] = [0x5e, 0x74, 0xd0];
  return (mix(r, 0xe8) << 16) | (mix(g, 0xf0) << 8) | mix(b, 0xff);
}

/** The waterfall's four frames (drawn over the river running through it: shore.ts, standardArt.ts). */
export const FALLS: readonly number[] = [0xd4, 0xd5, 0xd6, 0xd7];

/**
 * The waterfall's frame `f` in the original water's colours: the Standard look's fall (tools/art sheet-marvels.ts) -
 * a lip of foam across the river's channel, the face below it the river's deep blue with streaks of light falling a quarter of the
 * fall further each frame, foam where it lands - clear outside the channel, the river beneath showing.
 */
function fall(f: number): Uint32Array {
  const G = 32;
  const k = CELL / G;
  const out = new Uint32Array(CELL * CELL);
  const set = (x: number, y: number, c: number): void => {
    for (let r = 0; r < k; r++) out.fill(rgba(c), (y * k + r) * CELL + x * k, (y * k + r) * CELL + x * k + k);
  };
  const [LEFT, RIGHT, LIP, FOOT] = [10, 21, 9, 25];
  let seed = 0xd4 + f;
  const r = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) / 65536;
  for (let x = LEFT; x <= RIGHT; x++) {
    const edge = x === LEFT || x === RIGHT;
    set(x, LIP - 1, TONED[edge ? 1 : 9]);
    set(x, LIP, TONED[11]);
    for (let y = LIP + 1; y < FOOT; y++) {
      const at = (y - LIP - f * 4 + ((x * 7) % 5) * 3 + 64) % 8;
      set(x, y, !edge && x % 2 === 0 && at < 3 ? TONED[at === 0 ? 11 : 9] : y < LIP + 3 ? TONED[1] : RIVER_BLUES.deep);
    }
    for (let y = FOOT; y < FOOT + 4; y++) {
      const churn = r();
      if (churn < 0.55 - (y - FOOT) * 0.12) set(x, y, TONED[churn < 0.2 ? 15 : churn < 0.38 ? 11 : 9]);
    }
  }
  return out;
}

/** 0xRRGGBB from hue (degrees), saturation and value (0 to 1). */
function fromHsv(h: number, sat: number, v: number): number {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * sat * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

/** The saturation and value (0 to 1) of 0xRRGGBB. */
function satVal(c: number): [number, number] {
  const [r, g, b] = [c >> 16, (c >> 8) & 0xff, c & 0xff];
  const max = Math.max(r, g, b);
  return [max ? (max - Math.min(r, g, b)) / max : 0, max / 255];
}

/** The desert's ground: sand's hue at the grass ground's saturation and value. */
const sand = (): number => fromHsv(38, ...satVal(GRASS.ground));
/** The mountains' ground: a grey at the grass ground's value. */
const rockGround = (): number => fromHsv(0, 0, satVal(GRASS.ground)[1]);

/**
 * The flowers of tile `px`: each clump of the EGA's flower (a pixel neither the grass nor black, with those like it
 * beside it) one flower at its middle - index to its hue - the rest of the tile the grass.
 */
function flowersOf(px: Uint8Array, grass: Uint8Array): Map<number, number> {
  const out = new Map<number, number>();
  const seen = new Uint8Array(N * N);
  let k = 0;
  for (let i = 0; i < N * N; i++) {
    if (seen[i] || grass[i] || px[i] === BLACK) continue;
    const clump = [i];
    seen[i] = 1;
    for (let c = 0; c < clump.length; c++) {
      const [x, y] = [clump[c] % N, Math.floor(clump[c] / N)];
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const j = ny * N + nx;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[j] && !grass[j] && px[j] !== BLACK) {
          seen[j] = 1;
          clump.push(j);
        }
      }
    }
    const [cx, cy] = [
      clump.reduce((a, j) => a + (j % N), 0) / clump.length,
      clump.reduce((a, j) => a + Math.floor(j / N), 0) / clump.length,
    ];
    const middle = clump.reduce((a, j) =>
      Math.hypot((j % N) - cx, Math.floor(j / N) - cy) < Math.hypot((a % N) - cx, Math.floor(a / N) - cy) ? j : a,
    );
    out.set(middle, FLOWER_HUES[k++ % FLOWER_HUES.length]);
  }
  return out;
}

/** The archway's arch on the grid of 16: its opening (1) and the stones of its arch (2). */
function arch(x: number, y: number): 0 | 1 | 2 {
  const [cx, cy, r] = [7.5, 8, 3];
  const d = Math.hypot(x - cx, Math.min(0, y - cy));
  if (y >= cy ? Math.abs(x - cx) < r : d < r) return 1;
  if (y >= cy - 0.5 ? Math.abs(x - cx) < r + 1 : d < r + 1.2) return 2;
  return 0;
}

/**
 * Tile `t` as the Standard look draws it from the original (CELL x CELL, RGBA in memory order, clear where its ground
 * was); `lifted`, where given, whether it is lifted off its ground or drawn whole, whatever the tile's own is (the
 * deltas page's choices); `wet`, a dirt edge as it is drawn beside the water (WET_EDGES).
 */
export function original(tiles: Uint8Array, t: number, tick = 0, lifted?: boolean, wet = false): Uint32Array {
  if (FALLS.includes(t)) return fall(t - FALLS[0]);
  // The corner pieces and the archway, from the wall.
  if (CORNERS.includes(t) || t === ARCHWAY) {
    const wall = original(tiles, 0x4f);
    const shape = indices(tiles, t);
    const out = new Uint32Array(CELL * CELL);
    for (let i = 0; i < CELL * CELL; i++) {
      const [x, y] = [Math.floor((i % CELL) / HI), Math.floor(i / CELL / HI)];
      if (t !== ARCHWAY) out[i] = shape[y * N + x] === BLACK ? rgba(TONED[BLACK]) : wall[i];
      else {
        const a = arch(x, y);
        out[i] = a === 1 ? rgba(0x1c1c20) : a === 2 ? rgba(0x8a8a90) : wall[i];
      }
    }
    return out;
  }
  const px = tileOf(tiles, t);
  for (const [x, y, c] of EDITS.get(t) ?? []) px[y * N + x] = c;
  const whole = lifted === undefined ? WHOLE.has(t) || OUTDOORS.has(t) || STRUCTURE.has(t) : !lifted;
  const found: { pattern: Uint8Array | null } = { pattern: null };
  const ground = whole ? new Uint8Array(N * N) : groundOf(tiles, px, found);
  if (!whole && t < 0x100) {
    // A place or a tree the EGA drew on its own scatter of grass, not the grass tile's: a blade (blade) standing on
    // the lifted ground - three in four of the pixels round it ground, or the tile's edge - is grass too. And a piece
    // of the ground's own pattern left standing so (the brick floor under a table, between its legs) is ground. Not for
    // a figure, whose own green is never a stray.
    const strays: number[] = [];
    const seen = new Uint8Array(N * N);
    const brick = indices(tiles, 0x44);
    for (let i = 0; i < N * N; i++) {
      if (ground[i] || seen[i]) continue;
      let piece: number[] | null = px[i] === 2 ? blade(px, i) : null;
      // The pattern its ground was found to be, or where that was plain black, the brick floor's (a table drawn on it).
      const pattern = found.pattern ?? brick;
      if (!piece && pattern && px[i] === pattern[i]) {
        piece = [i];
        seen[i] = 1;
        for (let k = 0; k < piece.length; k++) {
          const [x, y] = [piece[k] % N, Math.floor(piece[k] / N)];
          for (const [nx, ny] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ]) {
            const j = ny * N + nx;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N && !seen[j] && !ground[j] && px[j] === pattern[j]) {
              seen[j] = 1;
              piece.push(j);
            }
          }
        }
      }
      if (!piece) continue;
      const by = round(piece);
      if (by.filter((j) => ground[j]).length >= by.length * 0.75) strays.push(...piece);
    }
    for (const i of strays) ground[i] = 1;
  }
  // A bridge's or the pier's own water and the dark between its planks, all of it lifted: what shows there is the water
  // beneath, rolling on under it.
  if (BRIDGES.has(t) && !whole) for (let i = 0; i < N * N; i++) if (px[i] === BLACK || WATERY.has(px[i])) ground[i] = 1;
  const ghost = SOULS.has(t) ? ghostInMirror(tiles, t) : null;
  // The Shadowlords' bodies: between the outline's sides, row by row, nothing is ground.
  if (BODIES.has(t))
    for (let y = 0; y < N; y++) {
      const row = range(0, N - 1).filter((x) => px[y * N + x] !== BLACK);
      if (row.length) for (let x = row[0]; x <= row[row.length - 1]; x++) ground[y * N + x] = 0;
    }
  const grass = OUTDOORS.has(t) ? grassOf(tiles, px) : null;
  const flowers = FLOWERS.has(t) && grass ? flowersOf(px, grass) : null;
  const road = ROADS.has(t);
  // A river's own pixels, round its lines; not a bridge's, whose planks are brown too.
  const river = RIVERS.has(t) && !BRIDGES.has(t) ? riverOf(px) : null;
  const band = PATHS.has(t) ? bandOf(px) : null;
  const lawn = flowers ? indices(tiles, 0x05) : null;
  const recolour = RECOLOUR.get(t);
  const people = peopleRules(t);
  const colour = (i: number): number => {
    const c = px[i];
    // A path or an edge: its specks brown (an edge by the water, none), a stone here and there; its blades the grass's; between
    // them the grass's ground, or in a path's band bare earth.
    if (road) {
      const [x, y] = [i % N, Math.floor(i / N)];
      if (c === BROWN) {
        if (wet) return GRASS.ground;
        if (hashAt(x, y, 7) < 0.1) return ROAD_STONES[hashAt(x, y, 8) < 0.5 ? 0 : 1];
        return ROAD_SPECKS[Math.floor(hashAt(x, y, 3) * ROAD_SPECKS.length)];
      }
      if (c === 2 || c === 10) return GRASS.blade;
      return band?.[i] ? ROAD_EARTH : GRASS.ground;
    }
    // The flowers: a flower in its hue at the blades' saturation and value, the rest the grass tile's grass.
    if (flowers && lawn) {
      const hue = flowers.get(i);
      if (hue !== undefined) return fromHsv(hue, ...satVal(GRASS.blade));
      return lawn[i] === BLACK ? GRASS.ground : GRASS.blade;
    }
    if (river) {
      if (!river[i]) {
        const [x, y] = [i % N, Math.floor(i / N)];
        if (c === BROWN) return SHORE_SAND[Math.floor(hashAt(x, y, 3) * SHORE_SAND.length)];
        if (c === 2 || c === 10) return GRASS.blade;
        if (c === BLACK) return GRASS.ground;
      } else {
        if (grass?.[i] || c === 2 || c === 10) return RIVER_BLUES.shallow;
        if (c === BLACK || c === BROWN) return RIVER_BLUES.deep;
      }
    }
    if (grass?.[i] === 1) return GRASS.blade;
    if (grass?.[i] === 2) return GRASS.ground;
    const water = WATERS.get(t);
    if (water && c === BLACK) {
      // Under a line (the pixel above it the light blue), and there only at some places along it, the water's under.
      const [x, y] = [i % N, Math.floor(i / N)];
      return px[((y + N - 1) % N) * N + x] === 9 && x % 3 !== 0 ? water.under : water.ground;
    }
    if (c === BLACK) {
      if (t === DESERT) return sand();
      if (HIGH.has(t)) return rockGround();
      if (EARTH.has(t)) return EARTH_DARK;
    }
    const [x, y] = [i % N, Math.floor(i / N)];
    // The pirates' flag, black and white where the EGA flew it gold.
    if (t >= 0x12c && t <= 0x12f && c === YELLOW) return (x + y) & 1 ? 0xf0ece0 : 0x16141a;
    if (t === MOONGATE && c === 9) return glow(x, y, tick);
    if (RAW.has(t)) return EGA_PALETTE[c];
    // The ghost in the mirror, in its own colours.
    const g = ghost?.get(i);
    if (g !== undefined) return EGA_PALETTE[g];
    // A person's skin, in the neutral ramp by the step of the colour it replaces.
    if (people) {
      const hit = people.rules.some(
        (r) =>
          r.colours.includes(c) &&
          (!r.frames || r.frames.includes(people.frame)) &&
          insideBox(r.box, x, y) &&
          !r.unless?.some((b) => insideBox(b, x, y)),
      );
      if (hit) return SKIN[PEOPLE_SKIN][SKIN_STEP[c] ?? 1];
    }
    return recolour?.[c] ?? TONED[c];
  };
  const out = new Uint32Array(CELL * CELL);
  for (let i = 0; i < N * N; i++) {
    if (ground[i]) continue;
    const v = rgba(colour(i));
    const [x, y] = [(i % N) * HI, Math.floor(i / N) * HI];
    for (let r = 0; r < HI; r++) out.fill(v, (y + r) * CELL + x, (y + r) * CELL + x + HI);
  }
  return out;
}

/**
 * wallTextures.ts
 *
 * Dungeon walls drawn as pixel art, for the textured dungeon styles (dungeonArt.ts `kind: 'texture'`): one cell's
 * face of wall, TEXELS_X by TEXELS_Y chunky pixels, that the painter lays on every wall in perspective, so a dungeon's
 * walls are as coarse-grained as the tiles beside them. Five kinds, each in a ramp of its colour: dressed blocks,
 * small bricks, fieldstone, raw rock and dug earth. Each wraps round, so neighbouring cells meet without a seam, and
 * is drawn from a fixed seed, the same on every visit.
 */

export type WallTexture = 'blocks' | 'bricks' | 'fieldstone' | 'rock' | 'earth';

export const WALL_TEXTURES: readonly WallTexture[] = ['blocks', 'bricks', 'fieldstone', 'rock', 'earth'];

/** A cell's face, in texels: a little wider than tall, as a facing wall is (600 by 512 at the nearest). */
export const TEXELS_X = 64;
export const TEXELS_Y = 56;

/** A colour as [r, g, b]. */
type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const scale = ([r, g, b]: Rgb, f: number): Rgb => [r * f, g * f, b * f].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as Rgb;

/** The ramp a texture is drawn in: mortar, deep shade, shade, base, light, highlight. */
function rampOf(base: string): Rgb[] {
  const c = parse(base);
  return [scale(c, 0.3), scale(c, 0.55), scale(c, 0.78), c, scale(c, 1.18), scale(c, 1.36)];
}
const MORTAR = 0;
const DEEP = 1;
const SHADE = 2;
const BASE = 3;
const LIGHT = 4;
const HIGH = 5;

/** A small deterministic generator. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Texel (x, y), wrapped. */
const wrap = (x: number, y: number): number =>
  (((y % TEXELS_Y) + TEXELS_Y) % TEXELS_Y) * TEXELS_X + (((x % TEXELS_X) + TEXELS_X) % TEXELS_X);

/** Value noise on a wrapping grid of `cells` across, smoothly interpolated: 0 to 1. */
function valueNoise(random: () => number, cells: number): (x: number, y: number) => number {
  const cy = Math.max(1, Math.round((cells * TEXELS_Y) / TEXELS_X));
  const grid = Array.from({ length: cells * cy }, random);
  const at = (i: number, j: number) => grid[(((j % cy) + cy) % cy) * cells + (((i % cells) + cells) % cells)];
  return (x, y) => {
    const fx = (x / TEXELS_X) * cells;
    const fy = (y / TEXELS_Y) * cy;
    const [i, j] = [Math.floor(fx), Math.floor(fy)];
    const [u, v] = [fx - i, fy - j].map((t) => t * t * (3 - 2 * t));
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}

/**
 * Courses of rectangular stones, staggered: `rows` courses, stones about `length` texels long, each a shade of its
 * own, lit along its top and left and shadowed along its foot and right, its face flecked.
 */
function coursed(random: () => number, rows: number, length: number): number[] {
  const out = new Array<number>(TEXELS_X * TEXELS_Y).fill(MORTAR);
  const h = TEXELS_Y / rows;
  for (let row = 0; row < rows; row++) {
    const y0 = Math.round(row * h);
    const y1 = Math.round((row + 1) * h) - 1; // the course's mortar under it
    let x = Math.floor(random() * length) + (row % 2 ? Math.floor(length / 2) : 0);
    const start = x;
    while (x < start + TEXELS_X) {
      const w = Math.max(3, Math.round(length * (0.7 + random() * 0.6)));
      const end = Math.min(x + w, start + TEXELS_X) - 1; // the joint after it
      const tone = random() < 0.25 ? SHADE : random() < 0.2 ? LIGHT : BASE;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x; xx < end; xx++) {
          let t = tone;
          if (yy === y0 || xx === x) t = Math.min(HIGH, tone + 1);
          else if (yy === y1 - 1 || xx === end - 1) t = Math.max(DEEP, tone - 1);
          else if (random() < 0.08) t = random() < 0.5 ? Math.max(DEEP, tone - 1) : Math.min(HIGH, tone + 1);
          out[wrap(xx, yy)] = t;
        }
      x = end + 1;
    }
  }
  return out;
}

/**
 * Stones packed together (a Voronoi of `count` of them, round the wrap so they tile), the mortar or a crack between:
 * each a tone of its own, lit along its upper left `bevel` texels in and shadowed along its lower right, flecked.
 */
function stones(random: () => number, count: number, gap: number, bevel: number, squash: number): number[] {
  const seeds = Array.from({ length: count }, () => [random() * TEXELS_X, random() * TEXELS_Y, random()]);
  const owner = new Int16Array(TEXELS_X * TEXELS_Y);
  for (let y = 0; y < TEXELS_Y; y++)
    for (let x = 0; x < TEXELS_X; x++) {
      let [best, second, who] = [Infinity, Infinity, 0];
      seeds.forEach(([sx, sy], i) => {
        const dx = Math.min(Math.abs(x - sx), TEXELS_X - Math.abs(x - sx));
        const dy = Math.min(Math.abs(y - sy), TEXELS_Y - Math.abs(y - sy));
        const d = Math.hypot(dx, dy * squash);
        if (d < best) [second, best, who] = [best, d, i];
        else if (d < second) second = d;
      });
      owner[y * TEXELS_X + x] = second - best < gap ? -1 : who;
    }
  const out = new Array<number>(TEXELS_X * TEXELS_Y);
  for (let y = 0; y < TEXELS_Y; y++)
    for (let x = 0; x < TEXELS_X; x++) {
      const who = owner[y * TEXELS_X + x];
      if (who < 0) {
        out[y * TEXELS_X + x] = MORTAR;
        continue;
      }
      const tone = seeds[who][2] < 0.3 ? SHADE : seeds[who][2] > 0.78 ? LIGHT : BASE;
      let t = tone;
      for (let k = 1; k <= bevel && t === tone; k++) {
        if (owner[wrap(x, y - k)] !== who || owner[wrap(x - k, y)] !== who) t = Math.min(HIGH, tone + (k === 1 ? 2 : 1));
        else if (owner[wrap(x, y + k)] !== who || owner[wrap(x + k, y)] !== who) t = k === 1 ? DEEP : Math.max(DEEP, tone - 1);
      }
      if (t === tone && random() < 0.07) t = random() < 0.5 ? Math.max(DEEP, tone - 1) : Math.min(HIGH, tone + 1);
      out[y * TEXELS_X + x] = t;
    }
  return out;
}

/** Dug earth: strata of their own shades, wandering, a dark seam between them, stones and pebbles bedded in them. */
function earth(random: () => number): number[] {
  const wobble = valueNoise(random, 3);
  const grain = valueNoise(random, 16);
  const tones = [SHADE, BASE, LIGHT, BASE, SHADE, BASE];
  const out = new Array<number>(TEXELS_X * TEXELS_Y);
  for (let y = 0; y < TEXELS_Y; y++)
    for (let x = 0; x < TEXELS_X; x++) {
      const at = y + (wobble(x, y) - 0.5) * 10;
      const band = Math.floor(at / 9.33);
      const within = at - band * 9.33;
      const tone = tones[((band % tones.length) + tones.length) % tones.length];
      const g = grain(x, y);
      out[y * TEXELS_X + x] = within < 1 ? DEEP : g > 0.68 ? Math.min(HIGH, tone + 1) : g < 0.3 ? Math.max(DEEP, tone - 1) : tone;
    }
  // Stones bedded in it: a light top, a dark foot.
  for (let i = 0; i < 9; i++) {
    const [cx, cy, r] = [random() * TEXELS_X, random() * TEXELS_Y, 1.5 + random() * 2.5];
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r * 1.4); dx <= Math.ceil(r * 1.4); dx++) {
        if ((dx / 1.4) ** 2 + dy ** 2 > r * r) continue;
        out[wrap(Math.round(cx + dx), Math.round(cy + dy))] = dy < -r / 3 ? HIGH : dy > r / 3 ? DEEP : LIGHT;
      }
  }
  for (let i = 0; i < 30; i++) out[wrap(Math.floor(random() * TEXELS_X), Math.floor(random() * TEXELS_Y))] = random() < 0.5 ? HIGH : MORTAR;
  return out;
}

/** The texture `kind` in the ramp of `base`, from `seed`: a TEXELS_X x TEXELS_Y canvas, one texel a pixel. */
export function paintWallTexture(kind: WallTexture, base: string, seed = 1): HTMLCanvasElement {
  const random = rng(seed * 7919 + WALL_TEXTURES.indexOf(kind) * 104729);
  const tones =
    kind === 'blocks'
      ? coursed(random, 4, 22)
      : kind === 'bricks'
        ? coursed(random, 9, 12)
        : kind === 'fieldstone'
          ? stones(random, 34, 1.6, 2, 1.25)
          : kind === 'rock'
            ? stones(random, 9, 0.9, 3, 0.8)
            : earth(random);
  const ramp = rampOf(base);
  const canvas = document.createElement('canvas');
  canvas.width = TEXELS_X;
  canvas.height = TEXELS_Y;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(TEXELS_X, TEXELS_Y);
  tones.forEach((t, i) => {
    const [r, g, b] = ramp[t];
    image.data.set([r, g, b, 255], i * 4);
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
}

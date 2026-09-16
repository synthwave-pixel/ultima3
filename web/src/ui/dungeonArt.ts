/**
 * dungeonArt.ts
 *
 * Paints a first-person dungeon sheet in the style of a tile set, at run
 * time, in the layout the renderer expects (see docs/dungeon-sheet.md).
 * LairWare's Mac version had one photographic sheet for every set (kept
 * here as the "Lairware" set, the Mac tiles with the Mac dungeon); the
 * Apple II, Commodore and PC originals drew their dungeons with code, as
 * wireframes, and the NES and later PC versions with flat bricks. So here
 * each set gets a small style record, and the sheet is drawn from it when
 * the set is chosen: nothing to download, nothing binary to keep.
 *
 * The geometry comes from the renderer's own tables (`sheetRegions`) and
 * the Standard mask, which is traced column by column so the lines and
 * brick courses of each angled side wall follow its exact silhouette.
 * Facing walls are painted in screen coordinates so neighbouring pieces
 * tile, and their bricks halve with each cell of distance.
 */

import { DUNGEON_SHEET_HEIGHT, DUNGEON_SHEET_WIDTH, sheetRegions, type SheetRegion } from './dungeonView.ts';

export interface DungeonStyle {
  /** Wireframe (lines on a plain ground) or brick (filled walls with mortar lines). */
  kind: 'wire' | 'brick';
  /** The ground: the corridor with nothing in it, and the inside of wire walls unless `fill` says otherwise. */
  bg: string;
  /** Wire: the line colour. Brick: the mortar. */
  line: string;
  /** Wire only: fill walls with this instead of `bg` (CGA's magenta). */
  fill?: string;
  /** Wire only: 1-pixel colour fringes either side of the lines, as an NTSC television showed them. */
  fringe?: [string, string];
  /** Brick: the facing wall colour. */
  face?: string;
  /** Brick: the side wall colour (a shade darker). */
  side?: string;
  /** Brick: checker-dither the side walls with the mortar colour, as 16-colour art shaded. */
  dither?: boolean;
  /** Brick: how much each brick's shade varies, 0..1. */
  variation?: number;
  floor?: string;
  floorLine?: string;
  ceiling?: string;
  /** Chest and ladder colour. */
  wood: string;
  /** What a doorway is filled with (default black) and outlined with (default nothing). */
  doorFill?: string;
  doorLine?: string;
}

const VGA: DungeonStyle = {
  kind: 'brick',
  bg: '#0c0c10',
  line: '#2a2a30',
  face: '#7c7c84',
  side: '#5c5c64',
  variation: 0.22,
  floor: '#3a3a40',
  floorLine: '#4a4a50',
  ceiling: '#1a1a20',
  wood: '#9a6a3a',
};

/**
 * A style for every tile set but Lairware, which keeps the Mac's
 * photographic sheet. Standard (the Mac tiles) takes the VGA dungeon.
 */
export const DUNGEON_STYLES: Record<string, DungeonStyle> = {
  Standard: VGA,
  'PC VGA': VGA,
  'Apple II Mono': { kind: 'wire', bg: '#000', line: '#fff', wood: '#fff', doorFill: '#000', doorLine: '#fff' },
  'Apple II Color': { kind: 'wire', bg: '#000', line: '#fff', wood: '#ff8000', doorFill: '#000', doorLine: '#fff' },
  'Apple II Color TV': {
    kind: 'wire',
    bg: '#000',
    line: '#f0f0f0',
    fringe: ['#20d020', '#c040ff'],
    wood: '#ff8000',
    doorFill: '#000',
    doorLine: '#f0f0f0',
  },
  'Commodore 64': { kind: 'wire', bg: '#000', line: '#8e8dff', wood: '#a57a4c', doorFill: '#000', doorLine: '#8e8dff' },
  'Macintosh B&W': { kind: 'wire', bg: '#fff', line: '#000', wood: '#000', doorFill: '#000' },
  'PC CGA': { kind: 'wire', bg: '#000', line: '#55ffff', fill: '#0000aa', wood: '#ffffff', doorFill: '#000', doorLine: '#55ffff' },
  'PC EGA': {
    kind: 'brick',
    bg: '#000',
    line: '#000',
    face: '#aa5500',
    side: '#aa5500',
    dither: true,
    floor: '#555555',
    floorLine: '#aaaaaa',
    ceiling: '#000',
    wood: '#ffff55',
  },
  Nintendo: {
    kind: 'brick',
    bg: '#000',
    line: '#301810',
    face: '#a84030',
    side: '#782c20',
    floor: '#404040',
    floorLine: '#585858',
    ceiling: '#000',
    wood: '#d09050',
  },
  'PC MCGA': {
    kind: 'brick',
    bg: '#101010',
    line: '#3a2a1a',
    face: '#8a6a4a',
    side: '#66503a',
    variation: 0.18,
    floor: '#484848',
    floorLine: '#585858',
    ceiling: '#202020',
    wood: '#b07a3a',
  },
  'PC Ultima V': {
    kind: 'brick',
    bg: '#0a0c10',
    line: '#1a2028',
    face: '#5c6c7c',
    side: '#44505c',
    variation: 0.2,
    floor: '#2c3038',
    floorLine: '#3c4048',
    ceiling: '#101418',
    wood: '#8a5a2a',
  },
};

const VP_X = 300;
const VP_Y = 256;
/** Brick courses per wall height, at every distance. */
const COURSES = 8;
/** Bricks along one cell of side wall. */
const BRICKS_PER_CELL = 4;

/** Which wall positions face left (their near edge is on the left). The rest of the masked ones face right. */
const LEFT_WALLS = new Set([1, 6, 7, 15, 16, 17, 28, 29]);

/** The opaque extent of each column of a masked piece, from the mask sheet. */
interface Silhouette {
  first: number; // first column with any opaque pixel (relative to the piece)
  last: number;
  top: Int16Array; // per column; -1 where transparent
  bottom: Int16Array;
}

function trace(maskData: ImageData, r: SheetRegion): Silhouette | null {
  const top = new Int16Array(r.w).fill(-1);
  const bottom = new Int16Array(r.w).fill(-1);
  let first = -1;
  let last = -1;
  for (let x = 0; x < r.w; x++) {
    const mx = r.sx + x;
    if (mx >= maskData.width) break;
    for (let y = 0; y < r.h; y++) {
      const my = r.sy + y;
      if (my < 0 || my >= maskData.height) continue;
      const i = (my * maskData.width + mx) * 4;
      const opaque = maskData.data[i] < 128; // black in the mask is opaque
      if (!opaque) continue;
      if (top[x] < 0) top[x] = y;
      bottom[x] = y;
    }
    if (top[x] >= 0) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? null : { first, last, top, bottom };
}

/** A small deterministic generator so a set's bricks look the same on every visit. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.length === 4 ? hex.slice(1).replace(/./g, (c) => c + c) : hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Paint the whole sheet for a style. `mask` is the (Standard) mask sheet the renderer will apply. */
export function paintDungeonSheet(style: DungeonStyle, mask: HTMLImageElement): HTMLCanvasElement {
  const sheet = document.createElement('canvas');
  sheet.width = DUNGEON_SHEET_WIDTH;
  sheet.height = DUNGEON_SHEET_HEIGHT;
  const ctx = sheet.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
  mctx.drawImage(mask, 0, 0);
  const maskData = mctx.getImageData(0, 0, mask.width, mask.height);

  const painter = new SheetPainter(ctx, style);
  for (const r of sheetRegions()) {
    if (r.name === 'corridor background') painter.corridor(r);
    else if (r.name === 'chest') painter.chest(r);
    else if (r.name === 'ladder rung' || r.name === 'ladder rail') painter.fillRegion(r, style.wood);
    else if (r.masked) {
      const s = trace(maskData, r);
      if (s) painter.sideWall(r, s, LEFT_WALLS.has(Number(r.name.slice(5))));
    } else painter.facingWall(r);
  }
  return sheet;
}

class SheetPainter {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly style: DungeonStyle,
  ) {}

  fillRegion(r: SheetRegion, colour: string): void {
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(r.sx, r.sy, r.w, r.h);
  }

  /** A line in the style's colour, with television fringes when asked for. */
  private stroke(path: () => void, width = 2): void {
    const { ctx, style } = this;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    if (style.fringe) {
      for (const [dx, colour] of [
        [-1, style.fringe[0]],
        [1, style.fringe[1]],
      ] as const) {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.strokeStyle = colour;
        ctx.beginPath();
        path();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.strokeStyle = style.line;
    ctx.beginPath();
    path();
    ctx.stroke();
  }

  // -- Panel D: the empty corridor ------------------------------------------

  corridor(r: SheetRegion): void {
    const { ctx, style } = this;
    if (style.kind === 'wire') return; // nothing but the ground: walls draw themselves
    const ox = r.sx;
    // Ceiling and floor are the triangles that meet at the vanishing point; the sides stay dark.
    ctx.fillStyle = style.ceiling ?? style.bg;
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox + 600, 0);
    ctx.lineTo(ox + VP_X, VP_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = style.floor ?? style.bg;
    ctx.beginPath();
    ctx.moveTo(ox, 512);
    ctx.lineTo(ox + 600, 512);
    ctx.lineTo(ox + VP_X, VP_Y);
    ctx.closePath();
    ctx.fill();
    // Floor lines: converging joints and the cross-joints at each cell of distance.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox, 512);
    ctx.lineTo(ox + 600, 512);
    ctx.lineTo(ox + VP_X, VP_Y);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = style.floorLine ?? style.line;
    ctx.lineWidth = 2;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(ox + VP_X + i * 150, 512);
      ctx.lineTo(ox + VP_X, VP_Y);
      ctx.stroke();
    }
    for (let z = 1; z <= 8; z++) {
      const y = VP_Y + 256 / z;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + 600, y);
      ctx.stroke();
    }
    ctx.restore();
    // The far end fades to the ground colour.
    const g = ctx.createRadialGradient(ox + VP_X, VP_Y, 10, ox + VP_X, VP_Y, 330);
    g.addColorStop(0, style.bg);
    g.addColorStop(0.35, style.bg);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, 0, 600, 512);
  }

  // -- Panels C and E: facing walls -----------------------------------------

  facingWall(r: SheetRegion): void {
    const { ctx, style } = this;
    const index = Number(r.name.slice(5));
    if (style.kind === 'wire') {
      ctx.fillStyle = style.fill ?? style.bg;
      ctx.fillRect(r.sx, r.sy, r.w, r.h);
      this.stroke(() => ctx.rect(r.sx + 1, r.sy + 1, r.w - 2, r.h - 2));
      return;
    }
    // Bricks in screen space, halving with distance, so a band's pieces tile.
    const bh = Math.max(4, r.h / COURSES);
    const bw = bh * 2;
    const mortar = Math.max(1, Math.round(bh / 12));
    const dx = r.dx ?? 0;
    const dy = r.dy ?? 0;
    const random = rng(1000 + index);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.sx, r.sy, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = style.line;
    ctx.fillRect(r.sx, r.sy, r.w, r.h);
    const firstRow = Math.floor(dy / bh);
    const lastRow = Math.ceil((dy + r.h) / bh);
    for (let row = firstRow; row <= lastRow; row++) {
      const stagger = row % 2 ? bw / 2 : 0;
      const firstCol = Math.floor((dx - stagger) / bw) - 1;
      const lastCol = Math.ceil((dx + r.w - stagger) / bw) + 1;
      for (let col = firstCol; col <= lastCol; col++) {
        const x = col * bw + stagger - dx + r.sx;
        const y = row * bh - dy + r.sy;
        const v = style.variation ? 1 + (random() - 0.5) * 2 * style.variation : 1;
        ctx.fillStyle = v === 1 ? style.face! : shade(style.face!, v);
        ctx.fillRect(x + mortar, y + mortar, bw - mortar, bh - mortar);
      }
    }
    ctx.restore();
  }

  // -- Panels A and B: side walls, traced from the mask ---------------------

  sideWall(r: SheetRegion, s: Silhouette, left: boolean): void {
    const { ctx, style } = this;
    const dx = r.dx ?? 0;
    // Near edge and far edge, in piece columns.
    const near = left ? s.first : s.last;
    const far = left ? s.last : s.first;
    const topAt = (x: number) => r.sy + s.top[x];
    const bottomAt = (x: number) => r.sy + s.bottom[x] + 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.sx, r.sy, r.w, r.h);
    ctx.clip();

    if (style.kind === 'wire') {
      // Fill the silhouette, then outline it a pixel inside the mask's edge.
      ctx.fillStyle = style.fill ?? style.bg;
      for (let x = s.first; x <= s.last; x++) {
        if (s.top[x] < 0) continue;
        ctx.fillRect(r.sx + x, topAt(x), 1, bottomAt(x) - topAt(x));
      }
      this.stroke(() => {
        ctx.moveTo(r.sx + s.first + 1, topAt(s.first) + 1);
        for (let x = s.first; x <= s.last; x++) if (s.top[x] >= 0) ctx.lineTo(r.sx + x + 0.5, topAt(x) + 1);
        ctx.lineTo(r.sx + s.last + 0.5, bottomAt(s.last) - 1);
        for (let x = s.last; x >= s.first; x--) if (s.top[x] >= 0) ctx.lineTo(r.sx + x + 0.5, bottomAt(x) - 1);
        ctx.closePath();
      });
      ctx.restore();
      return;
    }

    // Brick: the face, dithered if the style shades that way, then courses and joints in perspective.
    for (let x = s.first; x <= s.last; x++) {
      if (s.top[x] < 0) continue;
      ctx.fillStyle = style.side ?? style.face!;
      ctx.fillRect(r.sx + x, topAt(x), 1, bottomAt(x) - topAt(x));
    }
    if (style.dither) {
      ctx.fillStyle = style.line;
      for (let x = s.first; x <= s.last; x += 1) {
        if (s.top[x] < 0) continue;
        for (let y = topAt(x) + ((x + r.sx) & 1); y < bottomAt(x); y += 2) ctx.fillRect(r.sx + x, y, 1, 1);
      }
    }
    const mortar = Math.max(1, Math.round((bottomAt(near) - topAt(near)) / COURSES / 12));
    ctx.strokeStyle = style.line;
    ctx.lineWidth = mortar;
    // Courses: lines a fixed fraction of the way from the top edge to the bottom edge of every column.
    for (let i = 1; i < COURSES; i++) {
      ctx.beginPath();
      let started = false;
      for (let x = s.first; x <= s.last; x++) {
        if (s.top[x] < 0) continue;
        const y = topAt(x) + ((bottomAt(x) - topAt(x)) * i) / COURSES;
        if (!started) ctx.moveTo(r.sx + x, y);
        else ctx.lineTo(r.sx + x, y);
        started = true;
      }
      ctx.stroke();
    }
    // Joints: the wall is one cell long; a joint a fraction t along it sits where perspective puts it.
    const nearX = dx + near - VP_X; // screen offsets from the vanishing point
    const farX = dx + far - VP_X;
    const z0 = Math.abs(farX) / Math.max(1, Math.abs(nearX) - Math.abs(farX)); // depth of the near edge, in cells
    const xAt = (t: number) => nearX * (z0 / (z0 + t)) + VP_X - dx; // piece column
    for (let i = 0; i < COURSES; i++) {
      const stagger = i % 2 ? 0.5 : 0;
      for (let j = 0; j <= BRICKS_PER_CELL; j++) {
        const t = (j + stagger) / BRICKS_PER_CELL;
        if (t <= 0 || t >= 1) continue;
        const x = Math.round(xAt(t));
        if (x < s.first || x > s.last || s.top[x] < 0) continue;
        const y0 = topAt(x) + ((bottomAt(x) - topAt(x)) * i) / COURSES;
        const y1 = topAt(x) + ((bottomAt(x) - topAt(x)) * (i + 1)) / COURSES;
        ctx.fillStyle = style.line;
        ctx.fillRect(r.sx + x, y0, mortar, y1 - y0);
      }
    }
    ctx.restore();
  }

  // -- The chest ------------------------------------------------------------

  chest(r: SheetRegion): void {
    const { ctx, style } = this;
    const lid = r.h * 0.35;
    if (style.kind === 'wire') {
      ctx.fillStyle = style.fill ?? style.bg;
      ctx.fillRect(r.sx, r.sy, r.w, r.h);
      this.stroke(() => {
        ctx.rect(r.sx + 1, r.sy + 1, r.w - 2, r.h - 2);
        ctx.moveTo(r.sx + 1, r.sy + lid);
        ctx.lineTo(r.sx + r.w - 1, r.sy + lid);
        ctx.rect(r.sx + r.w / 2 - 4, r.sy + lid - 4, 8, 12);
      });
      return;
    }
    ctx.fillStyle = style.wood;
    ctx.fillRect(r.sx, r.sy, r.w, r.h);
    ctx.fillStyle = shade(style.wood, 0.6);
    ctx.fillRect(r.sx, r.sy, r.w, lid);
    ctx.fillRect(r.sx, r.sy + lid, r.w, 2);
    ctx.fillStyle = style.line;
    ctx.fillRect(r.sx + r.w / 2 - 5, r.sy + lid - 5, 10, 14);
    ctx.fillStyle = style.wood;
    ctx.fillRect(r.sx + r.w / 2 - 2, r.sy + lid + 1, 4, 4);
  }
}

/**
 * letterLayer.ts
 *
 * The letters set from a font's outlines at the display's own size, as the Ultima V port sets its lettering: Sixtyfour
 * (U3 2026's and Remastered's own letters, or chosen in Visuals), Legible and Dyslexic. The game draws everything else
 * into its 1280 x 768 canvas, which the browser scales to the window pixel for pixel; a letter drawn there from a
 * sheet comes out with some of its dots a pixel thicker than others at nearly every window size. Here the letters are
 * drawn on a canvas of their own laid over the game's, in the screen's own pixels: each filling 88% of its cell (so
 * that neighbours stand apart), its outline thickened a little (Sixtyfour has the one weight) - the port's measures.
 *
 * The game still draws as it did: the glyph of such a letter goes to the layer instead of the canvas (graphics.ts
 * drawGlyph), and what the game then draws over a cell, copies about or tints is followed (LetterLayer watches the
 * canvas's own drawing calls), so a letter goes when it is drawn over, comes back with what a menu had covered, takes
 * a tint (multiply) and turns dark on an inverted bar (difference) as the canvas's own letters did.
 */

/** A letter in a cell: the character, and its colour. */
export interface Glyph {
  ch: string;
  rgb: [number, number, number];
}

/** Letters taken from a region (LetterCells.take): each at its column and row from the region's corner. */
export type Taken = { col: number; row: number; glyph: Glyph }[];

/** The faces set from their outlines. */
export type LetterFace = 'sixtyfour' | 'legible' | 'dyslexic';

/**
 * The layer's letters, cell by cell, and what the game's drawing does to them - kept apart from the page, to be tested.
 * Rectangles are in the game canvas's pixels; a cell is the game's (`cell` pixels square), a letter's place whole cells.
 */
export class LetterCells {
  readonly glyphs = new Map<number, Glyph>();
  /** Cells to draw again. */
  readonly dirty = new Set<number>();

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly cell: number,
  ) {}

  /** A letter at (dx, dy), `size` square: true where that is a cell, which it is now; false, not one (drawn as ever). */
  set(dx: number, dy: number, size: number, ch: string): boolean {
    const { cell } = this;
    if (size !== cell || dx % cell !== 0 || dy % cell !== 0) return false;
    const col = dx / cell;
    const row = dy / cell;
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return false;
    const i = row * this.columns + col;
    this.glyphs.set(i, { ch, rgb: [255, 255, 255] });
    this.dirty.add(i);
    return true;
  }

  /** The cells whose middles a rectangle covers, as [index, column, row]. */
  covered(x0: number, y0: number, x1: number, y1: number): [number, number, number][] {
    const { cell } = this;
    const c0 = Math.max(0, Math.ceil(x0 / cell - 0.5));
    const c1 = Math.min(this.columns - 1, Math.ceil(x1 / cell - 0.5) - 1);
    const r0 = Math.max(0, Math.ceil(y0 / cell - 0.5));
    const r1 = Math.min(this.rows - 1, Math.ceil(y1 / cell - 0.5) - 1);
    const out: [number, number, number][] = [];
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) out.push([row * this.columns + col, col, row]);
    return out;
  }

  /** Drawn over: the letters under a rectangle gone. */
  clear(x0: number, y0: number, x1: number, y1: number): void {
    if (this.glyphs.size === 0) return;
    for (const [i] of this.covered(x0, y0, x1, y1)) if (this.glyphs.delete(i)) this.dirty.add(i);
  }

  /** A colour laid over a rectangle as the canvas lays it: 'multiply' (a tint) or 'difference' (white: inverted). */
  blend(x0: number, y0: number, x1: number, y1: number, op: 'multiply' | 'difference', rgb: [number, number, number]): void {
    if (this.glyphs.size === 0) return;
    for (const [i] of this.covered(x0, y0, x1, y1)) {
      const g = this.glyphs.get(i);
      if (!g) continue;
      g.rgb = g.rgb.map((v, k) => (op === 'multiply' ? Math.round((v * rgb[k]) / 255) : Math.abs(rgb[k] - v))) as Glyph['rgb'];
      this.dirty.add(i);
    }
  }

  /** The letters in a rectangle, from its top left cell. */
  take(x0: number, y0: number, x1: number, y1: number): Taken {
    const cells = this.covered(x0, y0, x1, y1);
    if (cells.length === 0) return [];
    const [, c0, r0] = cells[0];
    const out: Taken = [];
    for (const [i, col, row] of cells) {
      const g = this.glyphs.get(i);
      if (g) out.push({ col: col - c0, row: row - r0, glyph: { ch: g.ch, rgb: [...g.rgb] } });
    }
    return out;
  }

  /** Letters taken put back with their region's top left cell at the one whose middle (x, y) is nearest. */
  paste(taken: Taken, x: number, y: number): void {
    const col0 = Math.round(x / this.cell);
    const row0 = Math.round(y / this.cell);
    for (const { col, row, glyph } of taken) {
      const c = col0 + col;
      const r = row0 + row;
      if (c < 0 || r < 0 || c >= this.columns || r >= this.rows) continue;
      const i = r * this.columns + c;
      this.glyphs.set(i, { ch: glyph.ch, rgb: [...glyph.rgb] });
      this.dirty.add(i);
    }
  }

  /** Everything gone. */
  reset(): void {
    for (const i of this.glyphs.keys()) this.dirty.add(i);
    this.glyphs.clear();
  }
}

/** A colour as the canvas reports its fillStyle ('#rrggbb' or 'rgba(r, g, b, a)'), or null (a gradient, a pattern). */
export function parseColour(style: unknown): [number, number, number] | null {
  if (typeof style !== 'string') return null;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(style);
  if (hex) return [1, 2, 3].map((k) => parseInt(hex[k], 16)) as [number, number, number];
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(style);
  if (rgb) return [1, 2, 3].map((k) => Number(rgb[k])) as [number, number, number];
  return null;
}

/**
 * A face as it is set (the Ultima V port's measures): its file in public/fonts, how much of a cell it fills, and how much
 * of its size its outline is thickened by; `weight`, the weight a file of several is set in, `weights` their range.
 */
interface FaceSpec {
  family: string;
  file: string;
  share: number;
  bold: number;
  weight?: number;
  weights?: string;
}
const FACES: Record<LetterFace, FaceSpec> = {
  sixtyfour: { family: 'U3 Sixtyfour', file: 'Sixtyfour.ttf', share: 0.88, bold: 0.054 },
  legible: { family: 'U3 Legible', file: 'AtkinsonHyperlegibleMono.ttf', share: 0.9, bold: 0, weight: 800, weights: '200 800' },
  dyslexic: { family: 'U3 Dyslexic', file: 'OpenDyslexicMono-Regular.otf', share: 0.92, bold: 0 },
};

/** How long the game waits for the faces before it draws, the sheets standing in for any that have not come. */
const LOAD_WAIT_MS = 3000;

type Rect = [number, number, number, number];

/** The layer over the game's canvas: its letters (LetterCells), drawn in the screen's own pixels. */
export class LetterLayer {
  readonly cells: LetterCells;
  private readonly overlay = document.createElement('canvas');
  private readonly octx: CanvasRenderingContext2D;
  private faceNow: LetterFace | null = null;
  private readonly loadedFaces = new Set<LetterFace>();
  private readonly metrics = new Map<LetterFace, { advance: number; cap: number }>();
  /** What copyRegion took, by the canvas it was copied to: the letters to come back with it. */
  private readonly snapshots = new WeakMap<object, Taken>();
  private frameAsked = false;
  /** Settled once the faces have loaded, failed to, or the wait ran out. */
  readonly ready: Promise<void>;

  constructor(
    private readonly target: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    columns: number,
    rows: number,
    cell: number,
  ) {
    this.cells = new LetterCells(columns, rows, cell);
    // Over the game and under the scanlines (made after them, so placed before them), never in the way of a tap.
    this.overlay.style.cssText = 'position:absolute;z-index:1;pointer-events:none;';
    this.overlay.setAttribute('aria-hidden', 'true');
    target.after(this.overlay);
    this.octx = this.overlay.getContext('2d')!;
    new ResizeObserver(() => this.layout()).observe(target);
    window.addEventListener('resize', () => this.layout());
    this.follow();
    this.ready = this.load();
    this.layout();
  }

  /** The face the letters are set in, or null: the sheets as ever (the game draws its letters itself). */
  get face(): LetterFace | null {
    return this.faceNow;
  }

  /** Set the letters in `face` from now on, if it has loaded; null for none. The letters there are dropped. */
  setFace(face: LetterFace | null): void {
    const now = face && this.loadedFaces.has(face) ? face : null;
    if (now === this.faceNow) return;
    this.faceNow = now;
    this.cells.reset();
    this.layout();
  }

  /** A letter drawn on `ctx` at (dx, dy), `size` square (graphics.ts drawGlyph): true where it is the layer's now. */
  letter(ctx: CanvasRenderingContext2D, ch: string, dx: number, dy: number, size: number): boolean {
    if (!this.faceNow || ctx !== this.ctx) return false;
    const m = ctx.getTransform();
    if (!m.isIdentity) return false;
    if (!this.cells.set(dx, dy, size, ch)) return false;
    this.ask();
    return true;
  }

  /** A region copied off the canvas into `image` (screen.ts copyRegion): its letters kept with it. */
  remember(image: object, x: number, y: number, w: number, h: number): void {
    const taken = this.cells.take(x, y, x + w, y + h);
    if (taken.length) this.snapshots.set(image, taken);
  }

  // --- Following the canvas ---------------------------------------------------

  /** The rectangle (x, y, w, h) as drawn under the context's transform: its bounds on the canvas. */
  private bounds(x: number, y: number, w: number, h: number): Rect {
    const m = this.ctx.getTransform();
    if (m.isIdentity) return [Math.min(x, x + w), Math.min(y, y + h), Math.max(x, x + w), Math.max(y, y + h)];
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [px, py] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      xs.push(m.a * px + m.c * py + m.e);
      ys.push(m.b * px + m.d * py + m.f);
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /** Watch the canvas's drawing: what is drawn over a letter's cell takes it away, or tints it, or brings one back. */
  private follow(): void {
    const ctx = this.ctx;
    const cells = this.cells;
    const fillRect = ctx.fillRect.bind(ctx);
    const clearRect = ctx.clearRect.bind(ctx);
    const drawImage = ctx.drawImage.bind(ctx) as (...args: unknown[]) => void;
    const putImageData = ctx.putImageData.bind(ctx) as (...args: unknown[]) => void;
    const changed = () => {
      if (cells.dirty.size) this.ask();
    };
    ctx.fillRect = (x: number, y: number, w: number, h: number) => {
      fillRect(x, y, w, h);
      if (cells.glyphs.size === 0 || ctx.globalAlpha < 1) return; // a veil over the letters leaves them
      const [x0, y0, x1, y1] = this.bounds(x, y, w, h);
      const op = ctx.globalCompositeOperation;
      if (op === 'multiply' || op === 'difference') {
        const rgb = parseColour(ctx.fillStyle);
        if (rgb) cells.blend(x0, y0, x1, y1, op, rgb);
      } else cells.clear(x0, y0, x1, y1);
      changed();
    };
    ctx.clearRect = (x: number, y: number, w: number, h: number) => {
      clearRect(x, y, w, h);
      const [x0, y0, x1, y1] = this.bounds(x, y, w, h);
      cells.clear(x0, y0, x1, y1);
      changed();
    };
    ctx.putImageData = (...args: unknown[]) => {
      putImageData(...args);
      const image = args[0] as ImageData;
      const dx = args[1] as number;
      const dy = args[2] as number;
      cells.clear(dx, dy, dx + image.width, dy + image.height);
      changed();
    };
    ctx.drawImage = (...args: unknown[]) => {
      drawImage(...args);
      const source = args[0] as { width: number; height: number };
      const n = args.length;
      const [sx, sy, sw, sh] = n === 9 ? (args.slice(1, 5) as number[]) : [0, 0, source.width, source.height];
      const [dx, dy, dw, dh] =
        n === 9
          ? (args.slice(5, 9) as number[])
          : n === 5
            ? (args.slice(1, 5) as number[])
            : [args[1] as number, args[2] as number, source.width, source.height];
      const kept = this.snapshots.get(source);
      // The canvas copied onto itself (a scroll), or a region copied off it coming back: its letters come too.
      const carried = source === this.target && sw === dw && sh === dh ? cells.take(sx, sy, sx + sw, sy + sh) : null;
      if (cells.glyphs.size === 0 && !kept) return;
      if (ctx.globalAlpha < 1) return;
      const [x0, y0, x1, y1] = this.bounds(dx, dy, dw, dh);
      cells.clear(x0, y0, x1, y1);
      if (carried) cells.paste(carried, x0, y0);
      else if (kept && sw === dw && sh === dh) cells.paste(kept, x0, y0);
      changed();
    };
  }

  // --- Drawing ----------------------------------------------------------------

  private load(): Promise<void> {
    if (typeof FontFace === 'undefined') return Promise.resolve();
    const base = `${import.meta.env.BASE_URL}fonts/`;
    const all = (Object.entries(FACES) as [LetterFace, FaceSpec][]).map(async ([name, f]) => {
      const font = new FontFace(f.family, `url(${base}${f.file})`, f.weights ? { weight: f.weights } : {});
      await font.load();
      document.fonts.add(font);
      const m = document.createElement('canvas').getContext('2d')!;
      m.font = `${f.weight ? `${f.weight} ` : ''}100px "${f.family}"`;
      this.metrics.set(name, {
        advance: m.measureText('M').width / 100,
        cap: m.measureText('H').actualBoundingBoxAscent / 100,
      });
      this.loadedFaces.add(name);
    });
    const loaded = Promise.allSettled(all).then(() => undefined);
    return Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, LOAD_WAIT_MS))]);
  }

  /** Cover the game canvas exactly, on whole device pixels, and set every letter again. */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.target.getBoundingClientRect();
    const left = Math.round((r.left + window.scrollX) * dpr);
    const top = Math.round((r.top + window.scrollY) * dpr);
    const width = Math.round(r.width * dpr);
    const height = Math.round(r.height * dpr);
    const o = this.overlay;
    o.style.left = `${left / dpr}px`;
    o.style.top = `${top / dpr}px`;
    o.style.width = `${width / dpr}px`;
    o.style.height = `${height / dpr}px`;
    o.style.display = this.faceNow ? 'block' : 'none';
    if (o.width !== width || o.height !== height) {
      o.width = width;
      o.height = height;
    }
    this.octx.clearRect(0, 0, o.width, o.height);
    for (const i of this.cells.glyphs.keys()) this.cells.dirty.add(i);
    this.draw();
  }

  /** A frame asked for, to draw the cells changed: one at a time. */
  private ask(): void {
    if (this.frameAsked) return;
    this.frameAsked = true;
    requestAnimationFrame(() => {
      this.frameAsked = false;
      this.draw();
    });
  }

  /** Draw the cells changed since last time. */
  private draw(): void {
    const { cells, octx } = this;
    const face = this.faceNow;
    if (!face || cells.dirty.size === 0) {
      cells.dirty.clear();
      return;
    }
    const f = FACES[face];
    const m = this.metrics.get(face) ?? { advance: 0.6, cap: 0.7 };
    const o = this.overlay;
    const across = o.width / cells.columns;
    const down = o.height / cells.rows;
    const side = Math.min(across, down);
    const size = Math.min((side * f.share) / m.advance, (side * f.share * 0.78) / m.cap);
    const baseline = down / 2 + (m.cap * size) / 2;
    octx.font = `${f.weight ? `${f.weight} ` : ''}${size}px "${f.family}"`;
    octx.textBaseline = 'alphabetic';
    octx.lineJoin = 'miter';
    for (const i of cells.dirty) {
      const col = i % cells.columns;
      const row = Math.floor(i / cells.columns);
      const x0 = Math.round(col * across);
      const y0 = Math.round(row * down);
      const w = Math.round((col + 1) * across) - x0;
      const h = Math.round((row + 1) * down) - y0;
      octx.clearRect(x0, y0, w, h);
      const g = cells.glyphs.get(i);
      if (!g) continue;
      const css = `rgb(${g.rgb.join(',')})`;
      const width = octx.measureText(g.ch).width;
      octx.save();
      octx.beginPath();
      octx.rect(x0, y0, w, h);
      octx.clip();
      octx.translate(x0 + w / 2, y0 + baseline);
      octx.fillStyle = css;
      if (f.bold) {
        octx.strokeStyle = css;
        octx.lineWidth = size * f.bold;
        octx.strokeText(g.ch, -width / 2, 0);
      }
      octx.fillText(g.ch, -width / 2, 0);
      octx.restore();
    }
    cells.dirty.clear();
  }
}

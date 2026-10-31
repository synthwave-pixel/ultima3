/**
 * attract.ts
 *
 * The attract sequence before the title, after `MainLoop()`'s `Intro()` and `Demo()`, in the tile set in use: the set's
 * Exodus logo dissolving in (`FadeOnExodusUltima`), by Lord British's signature, written as it was (`WriteLordBritish`),
 * the party's fight with a dragon under a cave's roof (`FightScene`), then the map of Sosaria playing itself
 * (`DemoUpdate`), all to the combat music, where LairWare's demo played each song in turn and its opening none. A press
 * at any point goes to the title, whose music takes over; the title's Return to the view plays the demo again.
 *
 * Two things differ from LairWare's. Its large "Ultima III" picture under the logo is left out, the signature rising
 * into the room. And its fight was five pictures of one look; here it is the set's own party, dragon, fire and lava,
 * so it matches whichever set is chosen, and its roof is LairWare's, redrawn in the set's resolution and an icy colour
 * of its machine's. The credits are the set's lettering, too. Standard's flat figures stand beside PC Ultima V's dragon
 * and fire (BORROWED_ART), its own being in other styles, under a roof of the slate its figures are shaded in.
 *
 * Attract holds what happens and when, against the small `AttractStage`; `canvasStage` paints it.
 */

import { Shape } from '../game/tiles.ts';
import { Music } from '../game/io.ts';
import { displayOf, type DisplayStyle } from './display.ts';
import { fileStem, loadImage, TILE_COLUMNS, TILE_ROWS, type GraphicsSet, type ImageMap } from './graphics.ts';

/** A tick of the Mac's clock, ms: the original's waits are counted in them. */
const TICK_MS = 1000 / 60;
/** The logo's dissolve: `pass` went from -32767 to 32768 by 1536, a frame every 5 ticks. */
const FADE_STEPS = 43;
const FADE_FRAME_MS = 5 * TICK_MS;
/** One step of the fight (`DrawIntro`), and how long the fire holds. */
const FIGHT_FRAME_MS = 8 * TICK_MS;
const FIRE_HOLD_MS = 30 * TICK_MS;
/** How long the dragon stands alone before the demo: the original waited here for a key. */
const AFTER_FIGHT_MS = 120 * TICK_MS;
/** A frame of the demo: each step of its script is four, and the original's pace was the machine's. */
const DEMO_FRAME_MS = 66;

/** The fight's figures, by tile index: LairWare's order of cleric, wizard, fighter, thief, then its dragon and fire. */
const PARTY_TILES = [65, 66, 64, 67];
const DRAGON_TILE = 29;
const FIREBALL_TILE = 61;
const LAVA_TILE = 33;
/** The fight's row, and where its strip stands at offset 0, in cells: the party, a square's gap, the dragon, centred. */
const FIGHT_ROW = 21;
const FIGHT_LEFT = 14;
const DRAGON_AT = 10;
/** The flame the dragon works up, a cell across, clear of its square; and its breath's squares, gap first, to the thief. */
const BREATH_AT = DRAGON_AT - 1.25;
const BREATH_FLIES = [DRAGON_AT - 2, DRAGON_AT - 3, DRAGON_AT - 4];
/** Pixels of the original's offsets to a cell: its 640 x 384 screen. */
const PX_PER_CELL = 16;

/** The signature's origin, in the original's pixels (`PlotSig`), three rows higher with the big picture gone. */
const SIGNATURE_X = 244;
const SIGNATURE_Y = 253 - 3 * PX_PER_CELL;
const BY_AT = { x: 12, y: 13 };
const CREDIT_ROW = 16;

/** What a press leaves on the screen to read at the demo: any key, button or tap will do. */
const PRESS_TEXT = 'PRESS ANY KEY';
const DEMO_CAPTION = 'ULTIMA III';

/** The screen's part in the sequence. Positions are in cells unless said otherwise. */
export interface AttractStage {
  /** The plain frame, and nothing in it; with `divided`, the rule across row 10 of the demo. (`DrawFrame`) */
  border(divided?: boolean): void;
  /** The set's Exodus logo, with this share of it showing. */
  logo(reveal: number): void;
  /** The cave's roof over the fight. */
  roof(): void;
  /** One dot of the signature's pen, at the original's pixels. */
  dot(x: number, y: number): void;
  text(text: string, x: number, y: number): void;
  /** The frame's caps, either side of `width` letters at (x, y). */
  caption(text: string, y: number): void;
  /** Clear the fight's row. */
  clearFight(): void;
  /** A figure's tile, in the frame asked for, two cells square; or smaller, `size` cells. */
  tile(index: number, altFrame: boolean, x: number, y: number, size?: number): void;
  /** Fire: a square of the set's lava, scrolling. */
  lava(x: number, y: number): void;
  /** The demo's map. */
  map(tiles: Uint8Array, background: Uint8Array): void;
  /** One step of the tiles' animation. */
  animate(): void;
  /** Wait; true if a press came. Held while the window is away. */
  wait(ms: number): Promise<boolean>;
  sound(name: string): void;
  blip(frequency: number): void;
  /** Fade into this music, if music is on. */
  music(track: number): void;
  /** Battery saver: whether a minute has gone with no press, so nothing should go on moving. */
  rest(): boolean;
  /** Clicks and taps count as presses while this is on. */
  listen(on: boolean): void;
  /** Let go of whatever else the press that ended this brought. */
  settle(): Promise<void>;
  /** Have ready what the sequence draws with, before it starts. */
  prepare(): Promise<void>;
}

/** The demo's map: 19 tiles across, 6 down. */
export const DEMO_COLUMNS = 19;
export const DEMO_ROWS = 6;
const DEMO_CELLS = DEMO_COLUMNS * DEMO_ROWS;
/** The script's three parts (`GetDemoRsrc`, `DemoUpdate`): where, what, then the map to start from. */
const DEMO_STEPS = 512;
const DEMO_START = 1024;
const DEMO_START_CELLS = 127;
/** Where the ship starts: the map under it is water. (`DrawDemo`) */
const SHIP_CELL = 62;
/** A step's `where` that means no change, its `what` how long to wait. */
const DEMO_WAIT = 255;
/** A square going back to one of the terrain tiles below this shows with the next step that moves. (`DemoUpdate`) */
const DEMO_QUIET_BELOW = 16;

/** The shape to draw of a value in the demo's map: fighter, cleric, wizard and thief are the party's figures. (`DrawDemo`) */
export function demoShape(value: number): number {
  return value >= 0x28 && value <= 0x2e ? value + 88 : value;
}

/** The demo's script, played a step at a time. */
export class DemoPlayer {
  readonly tiles: Uint8Array;
  readonly background: Uint8Array;
  private at = 0;

  constructor(private readonly script: Uint8Array) {
    this.tiles = script.slice(DEMO_START, DEMO_START + DEMO_START_CELLS);
    this.background = this.tiles.slice(0, DEMO_CELLS);
    this.background[SHIP_CELL] = Shape.Water;
  }

  /** Take the next step, round to the first after the last; how many times the map is drawn for it, each four frames. */
  step(): number {
    const where = this.script[this.at];
    const what = this.script[this.at + DEMO_STEPS];
    this.at = (this.at + 1) % DEMO_STEPS;
    if (where === DEMO_WAIT) return what;
    this.tiles[where] = what;
    return what < DEMO_QUIET_BELOW ? 0 : 1;
  }
}

/**
 * The signature as the pen wrote it (`WriteLordBritish`): the dots of each step, in the original's pixels before its
 * origin. Each value moves the pen one of eight ways; 8 lifts it to the two (signed) bytes after; 0xff ends it.
 */
export function signatureStrokes(data: Uint8Array): [number, number][][] {
  const MOVES: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  const signed = (b: number) => (b << 24) >> 24;
  const steps: [number, number][][] = [];
  let [x, y] = [0, 0];
  for (let i = 0; i < data.length; ) {
    const dots: [number, number][] = [[x * 2, y * 2]];
    const value = data[i++];
    if (value === 0xff) {
      steps.push(dots);
      break;
    }
    if (value === 8) {
      x = signed(data[i]);
      y = signed(data[i + 1]);
      i += 2;
    } else if (value < MOVES.length) {
      const [dx, dy] = MOVES[value];
      dots.push([x * 2 + dx, y * 2 + dy]);
      x += dx;
      y += dy;
    }
    steps.push(dots);
  }
  return steps;
}

/** One step of the fight: how far the strip stands from its place, in the original's pixels, and its frame (1-3). */
export interface FightStep {
  offset: number;
  frame: number;
}

/** The fight (`FightScene`): up to the dragon and back, up and back again, and up to where it breathes. */
export function fightSteps(): FightStep[] {
  const order = [0, 1, 2, 3, 2];
  const steps: FightStep[] = [];
  let anim = 1;
  const forward = () => (anim = anim >= 4 ? 1 : anim + 1);
  const back = () => (anim = anim <= 1 ? 4 : anim - 1);
  for (let x = -25; x < 25; x += 2) {
    steps.push({ offset: x, frame: order[anim] });
    forward();
  }
  for (let x = 25; x > -25; x -= 2) {
    steps.push({ offset: x, frame: order[anim] });
    back();
  }
  for (let x = -25; x < 10; x += 2) {
    steps.push({ offset: x, frame: order[anim] });
    forward();
  }
  for (let i = 0; i < 4; i++) steps.push({ offset: 10, frame: order[anim] });
  return steps;
}

export class Attract {
  constructor(
    private readonly stage: AttractStage,
    private readonly script: Uint8Array,
    private readonly signature: Uint8Array,
    private readonly credits: string[],
  ) {}

  /** The whole of it, before the title: the opening, then the demo; a press in the opening skips the demo too. */
  run(): Promise<void> {
    return this.playing(async () => {
      if (!(await this.opening())) await this.playDemo();
    });
  }

  /** The demo alone, from the title's menu. */
  demo(): Promise<void> {
    return this.playing(() => this.playDemo());
  }

  private async playing(play: () => Promise<void>): Promise<void> {
    await this.stage.prepare();
    this.stage.music(Music.Combat);
    this.stage.listen(true);
    try {
      await play();
    } finally {
      this.stage.listen(false);
      await this.stage.settle();
    }
  }

  /** The opening (`Intro`); true if a press ended it. */
  private async opening(): Promise<boolean> {
    const s = this.stage;
    s.border();
    s.roof();
    this.drawFight({ offset: -25, frame: 2 });
    if (await s.wait(80 * TICK_MS)) return true;
    for (let step = 1; step <= FADE_STEPS; step++) {
      s.logo(step / FADE_STEPS);
      // The tone falls as the logo comes, as `freqDurationCmd`'s note fell with `pass`.
      s.blip(220 * Math.pow(2, ((FADE_STEPS - step) * 32) / FADE_STEPS / 12));
      if (await s.wait(FADE_FRAME_MS)) return true;
    }
    s.logo(1);
    if (await s.wait(60 * TICK_MS)) return true;
    s.text('by', BY_AT.x, BY_AT.y);
    if (await s.wait(10 * TICK_MS)) return true;
    const strokes = signatureStrokes(this.signature);
    for (let i = 0; i < strokes.length; i++) {
      for (const [x, y] of strokes[i]) s.dot(SIGNATURE_X + x, SIGNATURE_Y + y);
      if (i % 2 && (await s.wait(TICK_MS))) return true; // the screen shown every other step, a tick apart
    }
    this.credits.forEach((line, i) => s.caption(line, CREDIT_ROW + i));
    if (await this.fight()) return true;
    return s.wait(AFTER_FIGHT_MS);
  }

  /** The party's fight (`FightScene`), to the fire and the dragon alone; true if a press ended it. */
  private async fight(): Promise<boolean> {
    const s = this.stage;
    for (const step of fightSteps()) {
      s.animate();
      this.drawFight(step);
      if (await s.wait(FIGHT_FRAME_MS)) return true;
    }
    // The dragon's breath crosses the gap, and the party burns: the original's `Immolate`, at its offset 4.
    const last = fightSteps().at(-1)!;
    const left = FIGHT_LEFT + last.offset / PX_PER_CELL;
    for (const x of BREATH_FLIES) {
      this.drawFight(last);
      s.tile(FIREBALL_TILE, false, left + x, FIGHT_ROW);
      if (await s.wait(FIGHT_FRAME_MS)) return true;
    }
    s.sound('Immolate');
    const burning = FIGHT_LEFT + 4 / PX_PER_CELL;
    s.clearFight();
    s.tile(DRAGON_TILE, false, burning + DRAGON_AT, FIGHT_ROW);
    for (let i = 0; i < PARTY_TILES.length; i++) s.lava(burning + i * 2, FIGHT_ROW);
    if (await s.wait(FIRE_HOLD_MS)) return true;
    s.clearFight();
    s.tile(DRAGON_TILE, false, FIGHT_LEFT + 22 / PX_PER_CELL + DRAGON_AT, FIGHT_ROW);
    return false;
  }

  /** The strip at a step: the party with its arms in that step's positions, the dragon, a flame when its frame says. */
  private drawFight({ offset, frame }: FightStep): void {
    const s = this.stage;
    const left = FIGHT_LEFT + offset / PX_PER_CELL;
    s.clearFight();
    PARTY_TILES.forEach((tile, i) => s.tile(tile, (frame + i) % 2 === 0, left + i * 2, FIGHT_ROW));
    if (frame === 1) s.tile(FIREBALL_TILE, false, left + BREATH_AT, FIGHT_ROW + 0.5, 1);
    s.tile(DRAGON_TILE, frame === 3, left + DRAGON_AT, FIGHT_ROW);
  }

  /** The demo (`Demo`), until a press; Battery saver lets it run a minute from the last press. */
  private async playDemo(): Promise<void> {
    const s = this.stage;
    s.border(true);
    s.logo(1);
    s.caption(DEMO_CAPTION, 10);
    s.caption(PRESS_TEXT, 23);
    const player = new DemoPlayer(this.script);
    for (;;) {
      const frames = player.step() * 4;
      for (let i = 0; i < frames; i++) {
        s.animate();
        s.map(player.tiles, player.background);
        if ((await s.wait(DEMO_FRAME_MS)) || s.rest()) return;
      }
    }
  }
}

/** How each set draws the cave's roof, where the picture would not fit it: its ice's colour on its machine. */
const ROOF_COLOURS: Record<string, string> = {
  Standard: '#657287',
  'Apple II Color': '#14cffd',
  'Commodore 64': '#7abfc7',
  'Macintosh B&W': '#ffffff',
  Nintendo: '#3cbcfc',
  'PC CGA': '#55ffff',
  'PC EGA': '#55ffff',
  'PC MCGA': '#55ddff',
  'PC Ultima V': '#5599ff',
  'PC VGA': '#55ddff',
};
/** The sets that show LairWare's roof as it was painted. */
const PAINTED_ROOF = new Set(['Lairware']);
/** The sets that show another's dragon and fire in the fight, by the set they come from. */
const BORROWED_ART: Record<string, string> = { Standard: 'PC Ultima V' };
/** The tiles it lends: its sheet alone is loaded, not the set. */
const BORROWED_TILES = new Set([DRAGON_TILE, FIREBALL_TILE]);
/**
 * A roof's finish, for a set that has one: its pixels a cell, where the set's tiles would give it too fine a grain for
 * its figures (Standard's are drawn on sixteen to the tile, whatever the sheet's size), and its lower edge's colour.
 */
const ROOF_FINISH: Record<string, { pixelsPerCell: number; rim: string }> = {
  Standard: { pixelsPerCell: 8, rim: '#8c98ab' },
};
/** How bright a pixel of the picture must be to be ice. */
const ROOF_THRESHOLD = 40;

/** The size the logo is dissolved at: the original's 29.5 x 8.375 cells of sixteen pixels. */
const LOGO_WIDTH = 472;
const LOGO_HEIGHT = 134;
const LOGO_AT = { x: 5.25, y: 1.25, w: 29.5, h: 8.375 };
/** The pieces the dissolve shows or hides at random, pixels across. */
const FADE_CHUNK = 2;
/** The roof's size, in cells. */
const ROOF_COLUMNS = 38;
const ROOF_ROWS = 2;

/** What `canvasStage` needs of the screen, apart from the pictures it paints with. */
export interface CanvasStageHost {
  ctx: CanvasRenderingContext2D;
  cell: number;
  gfx: () => GraphicsSet;
  setName: () => string;
  images: ImageMap;
  graphicsUrl: string;
  border: (divided: boolean) => void;
  piece: (which: 'left' | 'right', x: number, y: number) => void;
  drawText: (text: string, x: number, y: number) => void;
  columns: number;
  wait: (ms: number) => Promise<boolean>;
  sound: (name: string) => void;
  blip: (frequency: number) => void;
  music: (track: number) => void;
  rest: () => boolean;
  listen: (on: boolean) => void;
  settle: () => Promise<void>;
}

/** A pixel of a roof: nothing, ice, or the ice along its lower edge. */
export const ROOF_AIR = 0;
export const ROOF_ICE = 1;
export const ROOF_RIM = 2;

/**
 * A roof's pixels from where the picture has ice, `width` x `height`: each column solid from the top down to its lowest
 * ice, so no specks or holes, and a line one pixel wide along the edge that hangs: ice with air beneath or beside it.
 */
export function roofPixels(ice: boolean[], width: number, height: number): Uint8Array {
  const depth = Array.from({ length: width }, (_, x) => {
    for (let y = height - 1; y >= 0; y--) if (ice[y * width + x]) return y + 1;
    return 0;
  });
  const pixels = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < depth[x]; y++) {
      const open = y + 1 >= depth[x] || (x > 0 && y >= depth[x - 1]) || (x < width - 1 && y >= depth[x + 1]);
      pixels[y * width + x] = open ? ROOF_RIM : ROOF_ICE;
    }
  }
  return pixels;
}

/** A sheet with no alpha of its own, its black let go: a figure's square hides nothing of what stands behind it. */
function clearBlack(sheet: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(sheet, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) d[i + 3] = 0;
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The roof for a set: a picture at the set's own resolution, in its colour, on nothing. */
function paintRoof(picture: HTMLImageElement, pixelsPerCell: number, colour: string, rim = colour): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ROOF_COLUMNS * pixelsPerCell);
  canvas.height = Math.round(ROOF_ROWS * pixelsPerCell);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const ice = Array.from(
    { length: canvas.width * canvas.height },
    (_, i) => Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= ROOF_THRESHOLD,
  );
  const pixels = roofPixels(ice, canvas.width, canvas.height);
  const [plain, edge] = [colour, rim].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  pixels.forEach((pixel, i) => {
    const rgb = pixel === ROOF_RIM ? edge : plain;
    d[i * 4] = rgb[0];
    d[i * 4 + 1] = rgb[1];
    d[i * 4 + 2] = rgb[2];
    d[i * 4 + 3] = pixel === ROOF_AIR ? 0 : 255;
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The sequence's pictures, on the screen's canvas. */
export function canvasStage(h: CanvasStageHost): AttractStage {
  const { ctx, cell } = h;
  let logoPixels: ImageData | null = null;
  let logoOf: GraphicsSet | null = null;
  const shown = document.createElement('canvas');
  shown.width = LOGO_WIDTH;
  shown.height = LOGO_HEIGHT;
  const shownCtx = shown.getContext('2d', { willReadFrequently: true })!;
  const logoImage = (): CanvasImageSource | undefined => h.gfx().scenes.get('Exodus') ?? h.images.get('Exodus');
  const display = (): DisplayStyle => displayOf(h.setName());
  const ink = () => display().phosphor ?? '#fff';
  const ground = () => (display().lightGround ? '#fff' : '#000');
  /** The sheets lent for the fight, by the set they come from, and how far the lent lava has scrolled. */
  const lent = new Map<string, HTMLCanvasElement>();
  const lentSheet = (): HTMLCanvasElement | undefined => lent.get(BORROWED_ART[h.setName()]);
  let lentScroll = 0;

  const drawLogo = (reveal: number): void => {
    const image = logoImage();
    if (!image) return;
    const [x, y, w, h2] = [LOGO_AT.x * cell, LOGO_AT.y * cell, LOGO_AT.w * cell, LOGO_AT.h * cell];
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h2);
    if (reveal >= 1) {
      ctx.drawImage(image, x, y, w, h2);
      return;
    }
    if (!logoPixels || logoOf !== h.gfx()) {
      shownCtx.clearRect(0, 0, LOGO_WIDTH, LOGO_HEIGHT);
      shownCtx.drawImage(image, 0, 0, LOGO_WIDTH, LOGO_HEIGHT);
      logoPixels = shownCtx.getImageData(0, 0, LOGO_WIDTH, LOGO_HEIGHT);
      logoOf = h.gfx();
    }
    const frame = shownCtx.createImageData(LOGO_WIDTH, LOGO_HEIGHT);
    const [from, to] = [logoPixels.data, frame.data];
    for (let py = 0; py < LOGO_HEIGHT; py++) {
      for (let px = 0; px < LOGO_WIDTH; px += FADE_CHUNK) {
        if (Math.random() >= reveal) continue;
        for (let c = 0; c < FADE_CHUNK; c++) {
          const at = (py * LOGO_WIDTH + px + c) * 4;
          to[at] = from[at];
          to[at + 1] = from[at + 1];
          to[at + 2] = from[at + 2];
          to[at + 3] = from[at + 3];
        }
      }
    }
    shownCtx.putImageData(frame, 0, 0);
    ctx.drawImage(shown, x, y, w, h2);
  };

  return {
    border: (divided = false) => h.border(divided),
    logo: drawLogo,
    roof: () => {
      const picture = h.images.get('Stalagtites');
      if (!picture) return;
      const name = h.setName();
      const finish = ROOF_FINISH[name];
      const source = PAINTED_ROOF.has(name)
        ? picture
        : paintRoof(
            picture,
            finish?.pixelsPerCell ?? h.gfx().tileSize / 2,
            display().phosphor ?? ROOF_COLOURS[name] ?? '#fff',
            finish?.rim,
          );
      ctx.drawImage(source, cell, 19 * cell, 38 * cell, 2 * cell);
    },
    dot: (x, y) => {
      const scale = cell / PX_PER_CELL;
      ctx.fillStyle = ink();
      ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), cell / 4, cell / 8);
    },
    text: h.drawText,
    caption: (text, y) => {
      const x = Math.floor((h.columns - text.length) / 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(x * cell, y * cell, text.length * cell, cell);
      h.drawText(text, x, y);
      if (y === 10 || y === 23) {
        h.piece('left', x - 1, y);
        h.piece('right', x + text.length, y);
      }
    },
    clearFight: () => {
      ctx.fillStyle = ground();
      ctx.fillRect(cell, FIGHT_ROW * cell, 38 * cell, 2 * cell);
    },
    tile: (index, altFrame, x, y, size = 2) => {
      const [dx, dy, to] = [Math.round(x * cell), Math.round(y * cell), size * cell];
      const from = BORROWED_TILES.has(index) ? lentSheet() : undefined;
      if (from) {
        const s = from.width / TILE_COLUMNS;
        const [sx, sy] = [(Math.floor(index / TILE_ROWS) * 2 + (altFrame ? 1 : 0)) * s, (index % TILE_ROWS) * s];
        ctx.drawImage(from, sx, sy, s, s, dx, dy, to, to);
        return;
      }
      const gfx = h.gfx();
      const r = gfx.tileRect(index, altFrame);
      ctx.drawImage(gfx.maskedTiles, r.x, r.y, r.w, r.h, dx, dy, to, to);
    },
    lava: (x, y) => {
      const [dx, dy, to] = [Math.round(x * cell), Math.round(y * cell), 2 * cell];
      const from = lentSheet();
      if (!from) {
        h.gfx().drawShape(ctx, Shape.Lava, dx, dy, to);
        return;
      }
      // Scrolling as GraphicsSet.drawShape does: the tile's lower part at the top, and the rest under it.
      const s = from.width / TILE_COLUMNS;
      const [sx, sy] = [Math.floor(LAVA_TILE / TILE_ROWS) * 2 * s, (LAVA_TILE % TILE_ROWS) * s];
      const off = lentScroll % s;
      const top = (s - off) * (to / s);
      ctx.drawImage(from, sx, sy + off, s, s - off, dx, dy, to, top);
      if (off > 0) ctx.drawImage(from, sx, sy, s, off, dx, dy + top, to, to - top);
    },
    map: (tiles, background) => {
      const gfx = h.gfx();
      const size = 2 * cell;
      for (let i = 0; i < DEMO_CELLS; i++) {
        const [dx, dy] = [cell + (i % DEMO_COLUMNS) * size, 11 * cell + Math.floor(i / DEMO_COLUMNS) * size];
        const value = tiles[i];
        if (value === background[i]) {
          gfx.drawShape(ctx, value, dx, dy, size);
        } else {
          gfx.drawShape(ctx, background[i], dx, dy, size);
          gfx.drawShape(ctx, demoShape(value), dx, dy, size, { masked: true });
        }
      }
    },
    animate: () => {
      h.gfx().tick();
      lentScroll += 1;
    },
    wait: h.wait,
    sound: h.sound,
    blip: h.blip,
    music: h.music,
    rest: h.rest,
    listen: h.listen,
    settle: h.settle,
    prepare: async () => {
      const name = BORROWED_ART[h.setName()];
      if (!name || lent.has(name)) return;
      // Without it (the file not there, offline with the page half stored) the set's own are drawn.
      await loadImage(`${h.graphicsUrl}${encodeURIComponent(`${fileStem(name)}-Tiles.png`)}`)
        .then((sheet) => lent.set(name, clearBlack(sheet)))
        .catch(() => undefined);
    },
  };
}

/**
 * screen.ts
 *
 * The Canvas renderer, and the browser implementation of `GameIO`.
 *
 * The screen is a grid of 40 x 24 cells (`blkSiz` pixels each in the
 * original; `cell` here). The layout is the Apple II one:
 *
 *   columns 0..23,  rows 0..23   border and the 11x11 map viewport (each
 *                                map tile is 2x2 cells, starting at cell 1,1)
 *   columns 24..38, rows 1..11   four character boxes, two rows each,
 *                                separated by border lines at rows 3, 6, 9, 12
 *                                (the Apple II used three rows and 4, 8, 12, 16;
 *                                this port pools gold and food, so the boxes
 *                                shrank and the message area grew)
 *   columns 24..39, rows 13..23  the scrolling message area; the prompt is
 *                                on row 23
 *   row 0                        party gold, moon phases, party food;   row 23  wind
 *
 * Rendering is split in two: the border, text and stats are drawn straight
 * onto the canvas when they change, while the viewport is redrawn twelve
 * times a second from a cached `Viewport` so terrain and creatures animate.
 * In a dungeon the viewport shows the first-person view instead.
 */

import { GraphicsSet, type ImageMap } from './graphics.ts';
import { Keyboard } from './input.ts';
import { LEVELS, levelLabel, SoundPlayer } from './sound.ts';
import { MusicPlayer } from './music.ts';
import { canvasStage, type AttractStage } from './attract.ts';
import { DungeonRenderer } from './dungeonView.ts';
import { markerColour } from './display.ts';
import { ScanlineOverlay } from './scanlines.ts';
import { World, holdCombatMark, STARVATION_MODES, TIMER_MODES } from '../game/world.ts';
import { PlayerRecord, levelUpDue, statusLetter } from '../game/player.ts';
import { commandMenu } from '../game/context.ts';
import { hasMagic } from '../game/whom.ts';
import { memberShape } from '../game/combat.ts';
import { TILE_SETS, helpPages, PAGE_ROWS, PAGE_WIDTH } from './help.ts';
import { journalCard, journalSnapshot, journalTop, wordCard, type JournalLine } from '../game/journal.ts';
import { TIPS, tipPages, type Tip } from '../game/tips.ts';
import { CHEATS } from '../game/cheats.ts';
import { Location } from '../game/party.ts';
import { buildViewport, VIEW_SIZE, VIEW_CENTRE, type Viewport } from '../game/viewport.ts';
import { buildDungeonView, secretMessage } from '../game/dungeon.ts';
import { recordView, MAP_SIDE } from '../game/automap.ts';
import { aroundParty, wholeLevel } from '../game/dungeonLayout.ts';
import { mapPages, marksOn, stepMark, pageTitle, isLandValue, type MapPage, type MapMark, type Direction } from '../game/worldMap.ts';
import { drawChart, drawPlaceSign } from './chart.ts';
import { MapId } from '../data/resources.ts';
import {
  Key,
  Sound,
  CARD_ROWS,
  CARD_WIDTH,
  type Card,
  type CardTone,
  type GameIO,
  type MenuOption,
  type CommandScope,
  type MenuPlacement,
  type SpellFlash,
} from '../game/io.ts';
import { cardWrap, gearName } from '../game/cards.ts';
import {
  controllerKeyFor,
  COMMAND_MENUS,
  BUTTON_SHORTCUTS,
  DIRECTION_KEYS,
  OSK_DELETE,
  OSK_DONE,
  OSK_KEYS,
  layoutKeyboard,
  layoutMenu,
  drawMenu,
  moveCursor,
  applyMenuKey,
  MENU_SOUNDS,
  GamepadReader,
  type MenuWindow,
  HINT_ROWS,
  wrapText,
} from './menus.ts';
import { DungeonCell } from '../game/world.ts';

export const COLUMNS = 40;
export const ROWS = 24;

/** Border pieces in row 0 of the UI sheet, by their 1-based number in `DrawFramePiece()`. */
const Piece = {
  TopLeft: 1,
  TopTee: 2,
  TopRight: 3,
  LeftTee: 4,
  RightTee: 6,
  BottomLeft: 7,
  BottomTee: 8,
  BottomRight: 9,
  Horizontal: 10,
  Vertical: 11,
  CapLeft: 12,
  CapRight: 13,
} as const;

/** The message area. */
/** Character boxes: two rows each, three rows apart, separators below each. */
const BOX_ROWS = 2;

/** Pages over the map (Help, the Journal): text column, width and rows. */
const PAGE_LEFT = 2;
const PAGE_TOP = 1;
const BOX_PITCH = 3;
const BOX_SEPARATORS = [3, 6, 9, 12];
const BOXES_BOTTOM = 12;
const TEXT_LEFT = 24;
const TEXT_RIGHT = 40; // exclusive
const TEXT_TOP = 13;
const TEXT_BOTTOM = 24; // exclusive

const ANIMATION_INTERVAL_MS = 1000 / 12;
/** How long after the press that ends the attract sequence its echoes are let go (`Screen.attractStage`). */
const ATTRACT_SETTLE_MS = 60;
/** How long after the last press Battery saver lets the map rest (`Screen.batterySaver`). */
export const BATTERY_SAVER_REST_MS = 60_000;

/** The 4 x 6 grid of small tiles used for the dungeon map, in row 1 of the UI sheet. */
const DUNGEON_MAP_PIECE_COLUMN = 7;
/** The auto-map's 5x5 overlay: the top-right corner of the message area, under the fourth box. */
const MAP_OVERLAY_SIZE = 5;
const MAP_OVERLAY_LEFT = 35;
const MAP_OVERLAY_TOP = 13;
/** A switch's state as a menu line shows it. */
const onOff = (on: boolean): string => (on ? 'On' : 'Off');

/** The Top down view's cells each way from the party: 21 a side, in the 22 of the window. */
const TOP_DOWN_REACH = 10;

/**
 * What each member's second line in the party panel shows (after the Ultima V port's): hit points and mana, or, while
 * the command menu's bar is on Ztats, Ready weapon or Wear armour, the experience toward the next level, the weapon in
 * hand or the armour worn - kept through the command, its "Who?" with it.
 */
type PanelLine = 'hp' | 'xp' | 'weapon' | 'armour';
const PANEL_LINES: Partial<Record<string, PanelLine>> = { Z: 'xp', R: 'weapon', W: 'armour' };

/** A card's lines by tone (cards.ts): better green, worse red, by the way grey, else white. */
const CARD_TONES: Record<CardTone, string> = { better: '#40ff40', worse: '#ff4040', dim: '#b0b0b0' };

/**
 * Which of the nine map pieces (UI sheet row 1 from column 7) draws a
 * dungeon cell: door, secret door, wall, both ladders, up, down, open,
 * anything else; piece 8 is the party marker.
 */
function dungeonMapPiece(value: number): number {
  switch (value) {
    case DungeonCell.Door:
      return 0;
    case DungeonCell.SecretDoor:
      return 1;
    case DungeonCell.Wall:
      return 2;
    case DungeonCell.LadderUp | DungeonCell.LadderDown:
      return 3;
    case DungeonCell.LadderUp:
      return 4;
    case DungeonCell.LadderDown:
      return 5;
    case DungeonCell.Open:
      return 6;
    default:
      return 7;
  }
}

export class Screen implements GameIO {
  private readonly ctx: CanvasRenderingContext2D;
  /** Pixel size of one cell. */
  readonly cell: number;

  private view: Viewport | null = null;
  /** The viewport wants painting; marking it so asks for a frame (`wake`). */
  private dirty = true;
  private get viewDirty(): boolean {
    return this.dirty;
  }
  private set viewDirty(value: boolean) {
    this.dirty = value;
    if (value) this.wake();
  }
  /**
   * A frame asked for and not yet drawn: one at a time. Frames are asked for only when there is something to show -
   * the picture marked changed, the map's next animation step due (`nextStep`), the map page open - not at every
   * refresh of the display.
   */
  private frameAsked = false;
  /** The timer that asks for the frame of the map's next animation step. */
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  /** The step timer has fired: its frame takes the step, whatever its time stamp says (a frame's is its start). */
  private stepDue = false;
  /** Whether the gamepads are being read (`readPads`). */
  private readingPads = false;
  /** Battery saver (Gameplay): the map rests, nothing animating, a minute after the last press, until the next. */
  batterySaver = false;
  /** The Pause a window losing focus sent (`onPause`) and nothing has read yet. */
  private focusPauseUnread = false;
  /** Whether the key `readKey` last read was that Pause: a wait for any key lets it pass (`waitKey`). */
  private readFocusPause = false;
  /** While a picture or map covers the viewport the animation loop leaves it alone. */
  private viewCovered = false;
  /** True while the in-game border is shown (false on the title screens). */
  private frameShown = false;
  /** Text drawn on the current title screen, replayed when the graphics set changes. */
  private titleText: { x: number; y: number; text: string }[] = [];
  private lastFrame = 0;
  /** Auto-map: the 5x5 overlay is on screen, so text under it is held back. */
  private overlayShown = false;
  /** Auto-map: the secret-door piece (a wall with one pixel out of place), per tile set. */
  private secretDoorPiece: HTMLCanvasElement | null = null;
  /** The frame's light and dark edge colours in the tile set in use (`chrome`), read once a set. */
  private chromeColours: { light: string; dark: string } | null = null;
  private dungeonRenderer: DungeonRenderer | null;
  /** A spell's white pulse over part of the view, while it lasts (cells). */
  private pulse: { x: number; y: number; w: number; h: number } | null = null;

  /** Text cursor in the message area. (`wx`, `wy`) */
  private cursorX = TEXT_LEFT + 1;
  private cursorY = ROWS - 1;
  /** Characters currently shown in the message area, so it can be scrolled. */
  private textRows: string[][] = [];
  /**
   * A turn that prints exactly what the previous turn printed folds into it
   * with counts: "North (x5)" over "POISON! (x5)". `prevTurn` is the last
   * turn's block of lines, where each now sits and how often it has
   * repeated; `thisTurn` gathers the current turn's lines. Lines fold one by
   * one while they match; the first difference, or a turn that ends short,
   * unfolds what matched and prints the turn afresh.
   */
  private prevTurn: { texts: string[]; rows: number[]; counts: number[] } | null = null;
  private thisTurn: { texts: string[]; rows: number[] } = { texts: [], rows: [] };
  private foldedThisTurn = 0;
  private brokenThisTurn = false;
  private linesSincePrompt = 0;

  /** Last values drawn in each stats box, to avoid redrawing every turn. */
  private statsCache: string[] = ['', '', '', ''];
  /** Member marked with arrows in the stats boxes while "Who?" is asked, or -1. */
  private selectedMember = -1;
  private highlighted = new Set<number>();
  /** What each member's second line shows (`PanelLine`): hit points and mana, or what the command menu's bar is on. */
  private panelLine: PanelLine = 'hp';
  /** The card over the party panel while a list's item is highlighted (`showCard`), or null for the members. */
  private card: Card | null = null;

  /**
   * 'controller' (the default): d-pad movement and pop-up menus, driven by
   * a gamepad or by WASD/Enter/Escape/ZXCV. 'keyboard': the Apple II letter
   * commands, for the original feel.
   */
  inputMode: 'keyboard' | 'controller' = 'controller';
  /** Called when a gamepad press switches the mode to 'controller'. */
  onModeChange: (() => void) | null = null;
  /** Called on every gamepad button press (the touch pad hides itself). */
  onGamepadPress: (() => void) | null = null;

  /** Switch to controller mode, as a gamepad or touch-pad press does. */
  useController(): void {
    if (this.inputMode === 'controller') return;
    this.inputMode = 'controller';
    this.onModeChange?.();
  }
  /** What the PAUSED box covers, restored when the window regains focus. */
  private underPaused: { image: HTMLCanvasElement; x: number; y: number } | null = null;
  /** While set, the frame loop paints this instead of the game (the map through its CRT effect). */
  private overlay: ((time: number) => void) | null = null;
  /** Called when anything in the Settings menu changes, so the page can remember it. */
  onSettingsChange: (() => void) | null = null;
  /** Name of the tile set in use (see help.ts TILE_SETS). */
  tileSetName = 'Standard';
  /** CRT lines laid over the whole game when the Scanlines setting is on (scanlines.ts). */
  private readonly crt: ScanlineOverlay;
  /** True while the Pause menu is up: it holds the game paused, and says so itself, so no PAUSED box. */
  private pauseShown = false;
  /**
   * How the party on foot is drawn here: 'grid' is the 2x2 of members (Standard,
   * overworld), 'line' the leader with the others following in a line (Standard
   * in towns and castles, Nintendo everywhere), 'symbol' the Apple II's single figure.
   */
  private get partyStyle(): 'grid' | 'line' | 'symbol' {
    if (this.tileSetName === 'Nintendo') return 'line';
    if (this.tileSetName === 'Standard') return this.world.inTownOrCastle ? 'line' : 'grid';
    return 'symbol';
  }
  /** Standard alone shows the red burst on a hit instead of the HIT tile. */
  private get burstTiles(): boolean {
    return this.tileSetName === 'Standard';
  }
  private readonly gamepads: GamepadReader;
  /** The menu window being shown, drawn over the map every frame. */
  private menu: MenuWindow | null = null;
  /** Scripted keys (auto-combat), read before the keyboard. (`Macro[]`) */
  private macro: string[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private gfx: GraphicsSet,
    private readonly images: ImageMap,
    private readonly keyboard: Keyboard,
    private readonly sounds: SoundPlayer,
    private readonly musicPlayer: MusicPlayer,
    private readonly world: World,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.cell = Math.floor(canvas.width / COLUMNS);
    for (let r = 0; r < TEXT_BOTTOM - TEXT_TOP; r++) this.textRows.push(Array<string>(TEXT_RIGHT - TEXT_LEFT).fill(' '));
    this.dungeonRenderer = DungeonRenderer.forSet(gfx);
    this.crt = new ScanlineOverlay(canvas);
    // A pause holds the music and should not eat into a combat turn's timer. A window that loses focus pauses at
    // once and asks for the Pause menu as well: whatever is waiting for a key reads it and opens the menu, which
    // then holds the game until the player resumes. Where the key is swallowed (inside another menu) the PAUSED
    // box stands in, as before, and focus alone starts the game again.
    keyboard.onPause = (reason) => {
      this.musicPlayer.pause();
      if (reason === 'focus' && !this.pauseShown) {
        this.focusPauseUnread = true;
        keyboard.push(Key.Pause);
      }
      this.wake(); // the PAUSED box, or the map stopped
    };
    keyboard.onResume = (pausedMs) => {
      this.musicPlayer.resume();
      this.wake();
      // A frozen outline (a menu open) gets the whole time back when the menu closes.
      const c = this.world.combat;
      if (c && !c.markedFrozenAt) c.markedAt += pausedMs;
    };
    // The buttons never repeat on a gamepad or the touch screen, so their keys do not either: B held past a closing
    // menu would otherwise pass turn after turn. Held directions still repeat, for walking.
    const buttons: string[] = [Key.A, Key.B, Key.X, Key.Y, Key.Pause, Key.Escape];
    keyboard.dropRepeat = (key) => buttons.includes(this.inputMode === 'controller' ? controllerKeyFor(key) : key);
    this.gamepads = new GamepadReader(keyboard, () => {
      this.useController();
      this.onGamepadPress?.();
    });
    // A press starts the map again after Battery saver's rest; a window coming back starts it after a hold.
    keyboard.onKey = () => this.wake();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.wake());
      document.addEventListener('visibilitychange', () => this.wake());
      window.addEventListener('gamepadconnected', () => this.readPads(true));
    }
    this.readPads();
    this.wake();
  }

  /** Ask for a frame: the next the display draws, one at a time (`frameAsked`). */
  private wake(): void {
    if (this.frameAsked) return;
    this.frameAsked = true;
    if (this.stepTimer !== null) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
    requestAnimationFrame((t) => {
      this.frameAsked = false;
      this.frame(t);
    });
  }

  /**
   * The map's next animation step (water, flags, creatures; twelve a second): its frame asked for when it is due -
   * unless there is no map to animate (a page or picture over it), the window is away (the game held for focus: a
   * page hidden, the Android app in the background), or Battery saver has let the map rest.
   */
  private nextStep(time: number): void {
    if (this.stepTimer !== null) clearTimeout(this.stepTimer); // one step waited for at a time
    this.stepTimer = null;
    if (this.viewCovered || this.keyboard.held('focus') || this.resting(time)) return;
    this.stepTimer = setTimeout(
      () => {
        this.stepTimer = null;
        this.stepDue = true;
        this.wake();
      },
      Math.max(0, this.lastFrame + ANIMATION_INTERVAL_MS - time),
    );
  }

  /** Battery saver: a minute after the last press the map rests, until the next. */
  private resting(time: number): boolean {
    return this.batterySaver && time - this.keyboard.lastInputAt >= BATTERY_SAVER_REST_MS;
  }

  /**
   * Read the gamepads once a frame while one is connected, and stop when none is: one connecting starts it again
   * (`gamepadconnected`, `force`), its first press still down the frame after. Each read is a task of its own, as
   * the keyboard's events arrive: a press read inside a frame would run the game's turn after the frame's repaint
   * but before the browser paints, so a view the turn blanks (a dark dungeon clears it every turn) would show black
   * for a frame.
   */
  private readPads(force = false): void {
    if (this.readingPads || !(force || this.gamepads.connected())) return;
    this.readingPads = true;
    const read = (): void => {
      if (!this.gamepads.poll()) {
        this.readingPads = false;
        return;
      }
      requestAnimationFrame(() => setTimeout(read, 0));
    };
    requestAnimationFrame(() => setTimeout(read, 0));
  }

  // -------------------------------------------------------------------------
  // Frames and title screen
  // -------------------------------------------------------------------------

  private piece(n: number, x: number, y: number): void {
    this.gfx.drawUiPiece(this.ctx, n - 1, 0, x * this.cell, y * this.cell, this.cell);
  }

  private black(x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(x * this.cell, y * this.cell, w * this.cell, h * this.cell);
  }

  /** Draw the in-game border. (`DrawFrame(1)`) */
  showGameFrame(): void {
    this.viewCovered = false;
    this.frameShown = true;
    this.black(0, 0, COLUMNS, ROWS);
    const piece = (n: number, x: number, y: number) => this.piece(n, x, y);
    for (let x = 1; x < 23; x++) {
      piece(Piece.Horizontal, x, 0);
      piece(Piece.Horizontal, x, 23);
    }
    for (let y = 1; y < 23; y++) {
      piece(Piece.Vertical, 0, y);
      piece(Piece.Vertical, 23, y);
    }
    piece(Piece.TopLeft, 0, 0);
    piece(Piece.TopRight, 39, 0);
    piece(Piece.BottomLeft, 0, 23);
    piece(Piece.TopTee, 23, 0);
    piece(Piece.BottomRight, 23, 23);
    this.card = null;
    this.drawPanelFrame();
    this.textRows.forEach((row) => row.fill(' '));
    this.prevTurn = null;
    this.thisTurn = { texts: [], rows: [] };
    this.foldedThisTurn = 0;
    this.redrawTextArea();
    this.showWind();
    this.showMoons();
    this.statsCache = ['', '', '', ''];
    this.updateStats(true);
    this.viewDirty = true;
  }

  /** The plain border and nothing in it, with the rule across row 10 if `divided`. (`DrawFrame(3)`, `DrawFrame(2)`) */
  private showBorder(divided = false): void {
    this.viewCovered = true;
    this.frameShown = false;
    this.titleText = [];
    this.view = null;
    this.black(0, 0, COLUMNS, ROWS);
    for (let x = 1; x < 39; x++) {
      this.piece(Piece.Horizontal, x, 0);
      this.piece(Piece.Horizontal, x, 23);
    }
    for (let y = 1; y < 23; y++) {
      this.piece(Piece.Vertical, 0, y);
      this.piece(Piece.Vertical, 39, y);
    }
    this.piece(Piece.TopLeft, 0, 0);
    this.piece(Piece.TopRight, 39, 0);
    this.piece(Piece.BottomLeft, 0, 23);
    this.piece(Piece.BottomRight, 39, 23);
    if (divided) {
      for (let x = 1; x < 39; x++) this.piece(Piece.Horizontal, x, 10);
      this.piece(Piece.LeftTee, 0, 10);
      this.piece(Piece.RightTee, 39, 10);
    }
  }

  /** The plain border with the Exodus picture. (`DrawFrame(3)`, `DrawExodusPict`) */
  showTitle(): void {
    this.showBorder();
    const exodus = this.gfx.scenes.get('Exodus') ?? this.images.get('Exodus'); // the tile set's own logo; setGraphics() redraws it
    if (exodus) {
      const c = this.cell;
      this.ctx.drawImage(exodus, 5.25 * c, 1.25 * c, 29.5 * c, 8.375 * c);
    }
  }

  /** What the attract sequence draws and waits with (attract.ts). */
  attractStage(): AttractStage {
    const onTap = () => this.keyboard.push(' ');
    return canvasStage({
      ctx: this.ctx,
      cell: this.cell,
      gfx: () => this.gfx,
      setName: () => this.tileSetName,
      images: this.images,
      graphicsUrl: 'graphics/',
      columns: COLUMNS,
      border: (divided) => this.showBorder(divided),
      piece: (which, x, y) => this.piece(which === 'left' ? Piece.CapLeft : Piece.CapRight, x, y),
      drawText: (text, x, y) => this.drawText(text, x, y),
      wait: (ms) => this.pressWithin(ms),
      sound: (name) => this.sounds.play(name),
      blip: (frequency) => this.sounds.blip(frequency),
      music: (track) => this.fadeMusic(track),
      rest: () => this.resting(performance.now()),
      listen: (on) => {
        if (on) window.addEventListener('pointerdown', onTap, true);
        else window.removeEventListener('pointerdown', onTap, true);
      },
      // A tap on the touch pad presses its button as well: both are gone before the title reads a key.
      settle: async () => {
        await new Promise((resolve) => setTimeout(resolve, ATTRACT_SETTLE_MS));
        this.flushKeys();
      },
    });
  }

  clearBottom(): void {
    this.black(1, 10, 38, 13);
    this.titleText = this.titleText.filter((t) => t.y < 10);
  }

  /**
   * Switch to another tile set (font and border pieces included) and redraw
   * everything on screen from what the Screen already knows.
   */
  setGraphics(gfx: GraphicsSet): void {
    this.gfx = gfx;
    this.greenFigures.clear();
    this.secretDoorPiece = null;
    this.chromeColours = null;
    this.dungeonRenderer = DungeonRenderer.forSet(gfx);
    this.redrawAll();
  }

  /** The frame round the party panel: its top, the separators between the members' boxes with their numbers, its sides. */
  private drawPanelFrame(): void {
    const piece = (n: number, x: number, y: number) => this.piece(n, x, y);
    for (let x = 24; x < 39; x++) {
      piece(Piece.Horizontal, x, 0);
      for (const y of BOX_SEPARATORS) piece(Piece.Horizontal, x, y);
    }
    for (let y = 1; y < BOXES_BOTTOM; y++) {
      piece(Piece.Vertical, 23, y);
      piece(Piece.Vertical, 39, y);
    }
    for (const y of BOX_SEPARATORS) piece(Piece.LeftTee, 23, y);
    for (const y of BOX_SEPARATORS.slice(0, 3)) piece(Piece.RightTee, 39, y);
    piece(Piece.BottomRight, 39, BOXES_BOTTOM);
    // Member numbers 1-4 sit in the separators above each box.
    for (let i = 0; i < 4; i++) {
      piece(Piece.CapLeft, 30, i * BOX_PITCH);
      piece(Piece.CapRight, 32, i * BOX_PITCH);
      this.drawText(String(i + 1), 31, i * BOX_PITCH);
    }
  }

  /**
   * A card over the party panel (cards.ts, spells.ts), while a list's item is highlighted, after the Ultima V port's:
   * the four members' boxes made one, its title on the panel's top border in the frame's caps, as a member's number
   * is, and its lines in their tones. Null puts the members back.
   */
  private showCard(card: Card | null): void {
    if (!this.frameShown || (!card && !this.card)) return;
    this.card = card;
    if (!card) {
      this.drawPanelFrame();
      this.updateStats(true);
      return;
    }
    for (const y of BOX_SEPARATORS.slice(0, 3)) {
      this.black(24, y, CARD_WIDTH, 1);
      this.piece(Piece.Vertical, 23, y);
      this.piece(Piece.Vertical, 39, y);
    }
    for (let x = 24; x < 39; x++) this.piece(Piece.Horizontal, x, 0);
    const title = card.title.slice(0, CARD_WIDTH);
    const tx = 24 + Math.floor((CARD_WIDTH - title.length) / 2);
    if (title.length <= CARD_WIDTH - 2) {
      this.piece(Piece.CapLeft, tx - 1, 0);
      this.piece(Piece.CapRight, tx + title.length, 0);
    }
    this.black(tx, 0, title.length, 1);
    this.drawText(title, tx, 0);
    this.black(24, 1, CARD_WIDTH, CARD_ROWS);
    card.lines.slice(0, CARD_ROWS).forEach((line, i) => {
      this.drawText(line.text.slice(0, CARD_WIDTH), 24, 1 + i, line.tone ? CARD_TONES[line.tone] : undefined);
    });
  }

  /** What each member's second line shows (`PanelLine`), redrawn when it changes. */
  private setPanelLine(line: PanelLine): void {
    if (line === this.panelLine) return;
    this.panelLine = line;
    this.updateStats(true);
  }

  /** Redraw the whole screen from what the Screen already knows (after a tile change or a full-screen page). */
  private redrawAll(): void {
    if (this.frameShown) {
      const rows = this.textRows.map((r) => [...r]);
      const cx = this.cursorX;
      const cy = this.cursorY;
      this.showGameFrame();
      this.textRows = rows;
      this.cursorX = cx;
      this.cursorY = cy;
      this.redrawTextArea();
      this.highlighted.forEach((m) => this.invert(24, m * BOX_PITCH + 1, 15, BOX_ROWS));
    } else {
      const texts = this.titleText;
      this.showTitle();
      for (const t of texts) this.drawText(t.text, t.x, t.y);
      this.titleText = texts;
    }
    this.showMenuNow();
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  /** Draw a string with the bitmap font at cell (x, y), no wrapping. */
  drawText(text: string, x: number, y: number, colour?: string): void {
    const { ctx, cell } = this;
    if (this.overlayShown && y >= MAP_OVERLAY_TOP && y < MAP_OVERLAY_TOP + MAP_OVERLAY_SIZE && x + text.length > MAP_OVERLAY_LEFT) {
      // Only the part left of the overlay is drawn; the overlay repaints itself.
      const keep = Math.max(0, MAP_OVERLAY_LEFT - x);
      if (keep === 0) return;
      text = text.slice(0, keep);
    }
    for (let i = 0; i < text.length; i++) {
      ctx.fillStyle = '#000';
      ctx.fillRect((x + i) * cell, y * cell, cell, cell);
      this.gfx.drawGlyph(ctx, text[i], (x + i) * cell, y * cell, cell);
    }
    if (colour) {
      // Tint the white glyphs: multiplying leaves the black background black.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = colour;
      ctx.fillRect(x * cell, y * cell, text.length * cell, cell);
      ctx.restore();
    }
  }

  textAt(x: number, y: number, text: string): void {
    this.drawText(text, x, y);
    if (!this.frameShown) this.titleText.push({ x, y, text });
  }

  centreText(y: number, text: string): void {
    this.textAt(20 - Math.floor(text.length / 2), y, text);
  }

  private redrawTextArea(): void {
    for (let r = 0; r < this.textRows.length; r++) this.drawText(this.textRows[r].join(''), TEXT_LEFT, TEXT_TOP + r);
  }

  /** Scroll the message area up one line. (`UTextScroll`) */
  private scrollText(): void {
    this.textRows.shift();
    this.textRows.push(Array<string>(TEXT_RIGHT - TEXT_LEFT).fill(' '));
    // The folding records follow their lines up the screen; a block that scrolls off is forgotten.
    if (this.prevTurn) {
      this.prevTurn.rows = this.prevTurn.rows.map((r) => r - 1);
      if (this.prevTurn.rows[0] < 0) this.prevTurn = null;
    }
    this.thisTurn.rows = this.thisTurn.rows.map((r) => r - 1);
    while (this.thisTurn.rows.length && this.thisTurn.rows[0] < 0) {
      this.thisTurn.rows.shift();
      this.thisTurn.texts.shift();
    }
    this.redrawTextArea();
    // The prompt corner piece is part of the border; redraw it after scrolling.
    this.piece(Piece.BottomRight, 23, 23);
  }

  print(text: string): void {
    for (const ch of text) {
      if (ch === '\n') {
        if (!this.foldRepeat()) this.newline();
        continue;
      }
      if (ch < ' ') continue;
      if (this.cursorX >= TEXT_RIGHT) continue; // the original simply ran off the edge
      this.textRows[this.cursorY - TEXT_TOP][this.cursorX - TEXT_LEFT] = ch;
      this.drawText(ch, this.cursorX, this.cursorY);
      this.cursorX++;
    }
  }

  private newline(): void {
    this.cursorX = TEXT_LEFT;
    this.cursorY++;
    if (this.cursorY >= TEXT_BOTTOM) {
      this.cursorY = TEXT_BOTTOM - 1;
      this.scrollText();
    }
  }

  /** Write a whole message-area row (text with its prompt column kept) and draw it. */
  private setRow(row: number, text: string): void {
    const width = TEXT_RIGHT - TEXT_LEFT;
    const padded = text.slice(0, width).padEnd(width);
    this.textRows[row] = padded.split('');
    this.drawText(padded, TEXT_LEFT, TEXT_TOP + row);
  }

  private countLabel(text: string, count: number): string {
    return count > 1 && text.trim() ? `${text} (x${count})` : text;
  }

  /**
   * At the end of a line: if this turn has matched the previous turn's block
   * so far and this line matches its next line too, fold it in (count up,
   * leave the cursor where the line began) and return true. Otherwise the
   * line is the turn's own; any lines folded earlier in this turn are unfolded
   * and printed again ahead of it, so a turn that only starts like the last
   * one is shown in full.
   */
  private foldRepeat(): boolean {
    const row = this.cursorY - TEXT_TOP;
    const raw = this.textRows[row].join('').trimEnd(); // keeps the prompt column's leading space
    const k = this.linesSincePrompt++;
    const prev = this.prevTurn;
    const contiguous = prev !== null && prev.rows[prev.rows.length - 1] === row - 1;
    if (!this.brokenThisTurn && prev && contiguous && k === this.foldedThisTurn && k < prev.texts.length && prev.texts[k] === raw) {
      prev.counts[k]++;
      this.setRow(row, '');
      this.setRow(prev.rows[k], this.countLabel(prev.texts[k], prev.counts[k]));
      this.foldedThisTurn++;
      this.cursorX = TEXT_LEFT;
      return true;
    }
    if (this.foldedThisTurn > 0) this.unfold(raw);
    this.brokenThisTurn = true;
    this.thisTurn.texts.push(raw);
    this.thisTurn.rows.push(row);
    return false;
  }

  /** Take back the lines folded this turn and print them again as this turn's own, ahead of `pending` (the line now on the bottom row). */
  private unfold(pending: string | null): void {
    const prev = this.prevTurn!;
    const row = this.cursorY - TEXT_TOP;
    const lines = prev.texts.slice(0, this.foldedThisTurn);
    lines.forEach((text, i) => {
      prev.counts[i]--;
      this.setRow(prev.rows[i], this.countLabel(text, prev.counts[i]));
    });
    this.foldedThisTurn = 0;
    for (const text of lines) {
      this.setRow(this.cursorY - TEXT_TOP, text);
      this.thisTurn.texts.push(text);
      this.thisTurn.rows.push(this.cursorY - TEXT_TOP);
      this.newline();
    }
    if (pending !== null) this.setRow(this.cursorY - TEXT_TOP, pending);
    void row;
  }

  printMessage(n: number): void {
    const s = this.world.resources.strings.Messages[n - 1];
    this.print(s ?? `[msg ${n}]`);
  }

  prompt(): void {
    this.endTurn(); // may print unfolded lines, so before the prompt row is cleared
    this.piece(Piece.BottomTee, 23, 23);
    this.piece(Piece.CapLeft, 24, 23);
    this.textRows[TEXT_BOTTOM - 1 - TEXT_TOP].fill(' ');
    for (let x = TEXT_LEFT + 1; x < TEXT_RIGHT; x++) this.drawText(' ', x, TEXT_BOTTOM - 1);
    this.cursorX = TEXT_LEFT + 1;
    this.cursorY = TEXT_BOTTOM - 1;
  }

  /** A new command prompt: the block just printed becomes the one the next turn may fold into. */
  private endTurn(): void {
    const prev = this.prevTurn;
    if (this.foldedThisTurn > 0 && prev && this.foldedThisTurn < prev.texts.length) {
      // The turn ended before matching the whole block: show it on its own.
      this.unfold(null);
    }
    if (this.thisTurn.texts.length > 0) {
      this.prevTurn = { texts: this.thisTurn.texts, rows: this.thisTurn.rows, counts: this.thisTurn.texts.map(() => 1) };
    }
    this.thisTurn = { texts: [], rows: [] };
    this.foldedThisTurn = 0;
    this.brokenThisTurn = false;
    this.linesSincePrompt = 0;
  }

  // -------------------------------------------------------------------------
  // Keyboard, text input and sound
  // -------------------------------------------------------------------------

  /**
   * Read a key, translating the controller stand-ins when in controller
   * mode (WASD to the d-pad, Enter/Z to A, Escape/X/B to B, C to X, V/Y to Y).
   */
  private async readKey(timeoutMs?: number): Promise<string | null> {
    const scripted = this.macro.shift();
    if (scripted !== undefined) return scripted;
    const key = timeoutMs === undefined ? await this.keyboard.nextKey() : await this.keyboard.nextKeyOrTimeout(timeoutMs);
    if (key === null) return null;
    this.readFocusPause = key === Key.Pause && this.focusPauseUnread;
    if (key === Key.Pause) this.focusPauseUnread = false;
    return this.inputMode === 'controller' ? controllerKeyFor(key) : key;
  }

  /**
   * Any key - but not the Pause a window losing focus sends (`onPause`), which is for the command prompt, where it
   * opens the Pause menu: switching windows neither turns a page nor ends a message.
   */
  async waitKey(): Promise<string> {
    for (;;) {
      const key = (await this.readKey()) as string;
      if (!(key === Key.Pause && this.readFocusPause)) return key;
    }
  }

  waitKeyOrTimeout(ms: number): Promise<string | null> {
    return this.readKey(ms);
  }

  /** Whether a press comes within `ms` - not the Pause a window losing focus sends, which the wait then goes on past. */
  private async pressWithin(ms: number): Promise<boolean> {
    for (;;) {
      const key = await this.readKey(ms);
      if (key === null) return false;
      if (!(key === Key.Pause && this.readFocusPause)) return true;
    }
  }

  flushKeys(): void {
    this.keyboard.flush();
    this.macro.length = 0;
  }

  queueKeys(keys: string[]): void {
    this.macro = [...keys];
  }

  /** Scripted keys are Apple II keys, so prompts read them keyboard-style whatever the mode. */
  private get promptMode(): 'keyboard' | 'controller' {
    return this.macro.length > 0 ? 'keyboard' : this.inputMode;
  }

  // --- Semantic prompts: keyboard reads a key, controller shows a menu ----

  /**
   * Show a menu and run it until the player picks an item (its index) or
   * cancels (-1). Letter keys still pick the matching option, so a keyboard
   * works in controller mode too. On the title screens (the main menu and
   * all it opens) each key is answered with a sound, subject to the Sound
   * FX setting; over the game frame the game's own sounds are playing, so
   * its menus stay quiet.
   *
   * Over the game frame, an item with a card shows it over the party panel
   * while it is highlighted (`showCard`), the members coming back with the
   * menu's close. `onCursor` hears of each item the bar comes to.
   */
  private async runMenu(
    title: string,
    options: MenuOption[],
    columns = 1,
    place?: MenuPlacement,
    cursor = 0,
    onCursor?: (option: MenuOption | undefined) => void,
  ): Promise<number> {
    const visible = options.filter((o) => !o.hidden);
    const menu = layoutMenu(
      title,
      visible.map((o) => o.label),
      columns,
    );
    if (visible.some((o) => o.hint)) menu.hints = visible.map((o) => o.hint);
    if (visible.some((o) => o.hintColour)) menu.hintColours = visible.map((o) => o.hintColour);
    if (visible.some((o) => o.disabled)) menu.disabled = visible.map((o) => !!o.disabled);
    if (visible.some((o) => o.colour)) menu.colours = visible.map((o) => o.colour);
    if (place) this.placeMenu(menu, place);
    else if (cursor > 0 && cursor < menu.items.length) {
      menu.cursor = cursor;
      if (menu.cursor >= menu.visibleRows) menu.top = menu.cursor - menu.visibleRows + 1;
    }
    this.openMenu(menu);
    const feedback = !this.frameShown;
    const cards = this.frameShown && visible.some((o) => o.card);
    const watch = () => {
      if (cards) {
        this.showCard(visible[menu.cursor]?.card ?? null);
        this.showMenuNow(); // over the card, where a wide window reaches the panel
      }
      onCursor?.(visible[menu.cursor]);
    };
    watch();
    try {
      for (;;) {
        const key = await this.readKey();
        if (key === null) continue;
        if (key === Key.Pause && this.readFocusPause) continue; // a window losing focus backs out of no menu
        const action = applyMenuKey(menu, options, visible, key);
        if (action.kind === 'move') {
          if (feedback) this.sound(MENU_SOUNDS.move);
          this.showMenuNow();
          watch();
        } else if (action.kind === 'choose') {
          if (feedback) this.sound(MENU_SOUNDS.choose);
          return action.index;
        } else if (action.kind === 'back') {
          if (feedback) this.sound(MENU_SOUNDS.back);
          return -1;
        } else if (action.kind === 'refused') {
          this.sound(Sound.Error1);
        }
      }
    } finally {
      this.closeMenu();
      if (cards) this.showCard(null);
    }
  }

  /**
   * A placed window sits at the given row, centred on the whole screen and
   * as wide as its labels need. On a title screen it replaces the text at
   * those rows; over the game frame it simply covers what is there, which
   * comes back when it closes.
   */
  private placeMenu(menu: MenuWindow, place: MenuPlacement): void {
    const longest = Math.max(menu.title.length, ...menu.items.map((s) => s.length));
    if (menu.columns === 1) menu.width = Math.min(COLUMNS - 2, longest + 4); // up to the frame's inner edge, for a long title
    menu.y = place.row;
    menu.x = Math.floor((COLUMNS - menu.width) / 2);
    // Keep the window (and its hint row) inside the frame; long lists scroll.
    const available = ROWS - 1 - place.row - 2 - (menu.hints ? HINT_ROWS : 0);
    menu.visibleRows = Math.max(1, Math.min(menu.visibleRows, available));
    if (place.cursor !== undefined && place.cursor >= 0 && place.cursor < menu.items.length) {
      menu.cursor = place.cursor;
      if (menu.cursor >= menu.visibleRows) menu.top = menu.cursor - menu.visibleRows + 1;
    }
    if (!this.frameShown) this.black(1, place.row, COLUMNS - 2, menu.visibleRows + 2 + (menu.hints ? HINT_ROWS : 0));
  }

  /** The Scanlines setting: on, the whole game shows CRT lines, whatever tile set is in use. */
  get scanlines(): boolean {
    return this.crt.enabled;
  }

  set scanlines(on: boolean) {
    this.crt.enabled = on;
  }

  /**
   * The Pause menu: the game stops where it stands and the settings are
   * shown, until Resume (or B, Escape, or the button that opened it). The
   * hold on the keyboard stops the idle timers, the combat turn timer and
   * the music, and outlives a window that regains focus, so a menu opened
   * by a blur stays up until the player closes it.
   */
  async showPause(): Promise<string | null> {
    if (this.pauseShown) return null;
    this.pauseShown = true;
    // A combat turn's outline stops fading where it is, as under the command menu, and the turn cannot expire.
    const release = holdCombatMark(this.world.combat);
    this.keyboard.pause('menu');
    this.hidePaused(); // the PAUSED box a blur put up: the menu says it now
    try {
      return await this.settingsMenu('Paused');
    } finally {
      // The hold goes first: between letting go of it and clearing the flag there would be a frame where the game
      // counts as paused with no menu to say so, and the PAUSED box would be painted over a screen on its way out.
      // While the fade is frozen the keyboard's own resume leaves the mark alone, so the turn gets its time back once.
      this.keyboard.resume('menu');
      this.pauseShown = false;
      this.wake(); // the PAUSED box, should the window still be away
      release();
    }
  }

  /** The Settings menu, on the title screen's main menu. In game the same list is under Pause. */
  async showSettings(): Promise<void> {
    await this.settingsMenu('Settings');
  }

  /**
   * The settings, as the title screen's Settings menu or the in-game Pause
   * menu (which leads with Resume, offers the cheats and can end the game):
   * Visuals, Audio and Gameplay each open a list of their own; Auto combat
   * flips in place; Help shows the pages for the current input mode.
   *
   * Returns a command for the game to run now: 'Q' when Quit and save was
   * chosen, which the field loop carries out once the menu is gone.
   */
  private async settingsMenu(title: 'Settings' | 'Paused'): Promise<string | null> {
    const w = this.world;
    const place: MenuPlacement | undefined = this.frameShown ? undefined : { row: 13, title };
    const resume: MenuOption[] = title === 'Paused' ? [{ key: 'E', label: 'Resume' }] : [];
    // Quit and save, where the game allows it: on the surface, out of a fight. The field loop carries it out.
    const canQuit = title === 'Paused' && w.onSurface && !w.combat;
    const quit: MenuOption[] = canQuit ? [{ key: 'Q', label: 'Quit and save' }] : [];
    // The cheats, in play only: at the title there is no party for them to work on.
    const cheats: MenuOption[] = title === 'Paused' ? [{ key: 'C', label: 'Cheats' }] : [];
    let cursor = 0;
    for (;;) {
      const options: MenuOption[] = [
        ...resume,
        { key: 'A', label: `Auto combat: ${onOff(w.autoCombat)}` },
        { key: 'V', label: 'Visuals' },
        { key: 'P', label: 'Gameplay' },
        { key: 'U', label: 'Audio' },
        { key: 'G', label: 'Tips' },
        { key: 'H', label: 'Help' },
        ...cheats,
        ...quit,
        { key: 'B', label: 'Back' },
      ];
      const picked = await this.runMenu(title, options, 1, place && { ...place, cursor }, cursor);
      if (picked < 0) return null;
      cursor = picked;
      switch (options[picked].key) {
        case 'E':
          return null; // Resume
        case 'Q':
          return 'Q'; // the game saves and ends once this menu is gone
        case 'V':
          await this.visualsMenu();
          break;
        case 'A':
          w.autoCombat = !w.autoCombat;
          w.onAutoCombatChange?.();
          break;
        case 'P':
          await this.gameplayMenu();
          break;
        case 'U':
          await this.audioMenu();
          break;
        case 'G':
          await this.showTips();
          break;
        case 'H':
          await this.showHelp();
          break;
        case 'C': {
          const done = await this.cheatMenu();
          if (done) {
            // What the cheat changed shown at once, beside the menu still open: the party's boxes, the gold and food
            // on the top border, and the map (Go home moves the party).
            this.updateStats(true);
            this.redrawMap();
            this.printWrapped(done); // to the message area beside the menu, as any other event
          }
          break;
        }
        default:
          return null;
      }
      this.onSettingsChange?.();
    }
  }

  /**
   * A list of settings under Settings and Pause (Visuals, Audio, Gameplay):
   * each line as it now stands, Back last; the one chosen is acted on in
   * place and kept, and the list shown again with the cursor where it was.
   */
  private async settingsList(
    title: string,
    lines: () => MenuOption[],
    act: (key: string, place: MenuPlacement | undefined) => Promise<void> | void,
  ): Promise<void> {
    const place: MenuPlacement | undefined = this.frameShown ? undefined : { row: 13, title };
    let cursor = 0;
    for (;;) {
      const options: MenuOption[] = [...lines(), { key: 'B', label: 'Back' }];
      const picked = await this.runMenu(title, options, 1, place && { ...place, cursor }, cursor);
      if (picked < 0 || options[picked].key === 'B') return;
      cursor = picked;
      await act(options[picked].key, place);
      this.onSettingsChange?.();
    }
  }

  /** Visuals: the tile set (its own list of sets) and the scanlines. */
  private async visualsMenu(): Promise<void> {
    await this.settingsList(
      'Visuals',
      () => [
        { key: 'T', label: `Tiles: ${this.tileSetName}` },
        { key: 'L', label: `Scanlines: ${onOff(this.scanlines)}` },
      ],
      async (key) => {
        if (key === 'T') await this.chooseTiles();
        else if (key === 'L') this.scanlines = !this.scanlines;
      },
    );
  }

  /** Audio: the sound effects and their level, the music and its level, each level a dial heard as it turns. */
  private async audioMenu(): Promise<void> {
    const w = this.world;
    await this.settingsList(
      'Audio',
      () => [
        { key: 'S', label: `Sound FX: ${w.soundEnabled ? this.sounds.set : 'Off'}` },
        { key: 'F', label: `FX level: ${levelLabel(this.sounds.level)}` },
        { key: 'M', label: `Music: ${onOff(this.musicPlayer.enabled)}` },
        { key: 'U', label: `Music level: ${levelLabel(this.musicPlayer.level)}` },
      ],
      async (key, place) => {
        switch (key) {
          case 'S':
            // Standard, Lairware, Off, round again.
            if (!w.soundEnabled) {
              w.soundEnabled = true;
              this.sounds.set = 'Standard';
            } else if (this.sounds.set === 'Standard') {
              this.sounds.set = 'Lairware';
            } else {
              w.soundEnabled = false;
            }
            break;
          case 'M':
            this.musicPlayer.enabled = !this.musicPlayer.enabled; // the player stops or resumes the current track itself
            break;
          case 'F':
            // Each step is heard: a footstep at the new level, where sound effects are on.
            await this.dialLevel('FX level', this.sounds.level, place, (n) => {
              this.sounds.level = n;
              this.sound(MENU_SOUNDS.move);
            });
            break;
          case 'U':
            // The music is heard while the dial turns, though the Pause menu holds it.
            this.musicPlayer.hear(true);
            try {
              await this.dialLevel('Music level', this.musicPlayer.level, place, (n) => (this.musicPlayer.level = n));
            } finally {
              this.musicPlayer.hear(false);
            }
            break;
        }
      },
    );
  }

  /**
   * Gameplay: the input mode and the rules the port lets the player soften
   * or keep as the Apple II had them.
   *
   * Input is offered only to a player pressing real keys (`lastSource`).
   * Keyboard mode wants a keyboard: chosen from a gamepad or the on-screen
   * pad it left the player with buttons the letter commands ignore, and
   * choosing it again only switched the mode back for the press itself.
   */
  private async gameplayMenu(): Promise<void> {
    const w = this.world;
    const named = (mode: string) => `${mode[0].toUpperCase()}${mode.slice(1)}`;
    await this.settingsList(
      'Gameplay',
      () => [
        ...(this.keyboard.lastSource === 'keyboard'
          ? [{ key: 'I', label: `Input: ${this.inputMode === 'controller' ? 'Controller' : 'Keyboard'}` }]
          : []),
        { key: 'P', label: `Poison kills: ${onOff(w.poisonKills)}` },
        { key: 'V', label: `Starving: ${named(w.starvation)}` },
        { key: 'X', label: `Balanced XP: ${onOff(w.balancedXp)}` },
        { key: 'R', label: `Timer: ${named(w.timer)}` },
        { key: 'S', label: `Battery saver: ${onOff(this.batterySaver)}` },
      ],
      (key) => {
        switch (key) {
          case 'I':
            this.inputMode = this.inputMode === 'controller' ? 'keyboard' : 'controller';
            this.onModeChange?.();
            break;
          case 'P':
            w.poisonKills = !w.poisonKills;
            break;
          case 'V':
            w.starvation = STARVATION_MODES[(STARVATION_MODES.indexOf(w.starvation) + 1) % STARVATION_MODES.length];
            break;
          case 'X':
            w.balancedXp = !w.balancedXp;
            break;
          case 'R':
            w.timer = TIMER_MODES[(TIMER_MODES.indexOf(w.timer) + 1) % TIMER_MODES.length];
            break;
          case 'S':
            this.batterySaver = !this.batterySaver;
            break;
        }
      },
    );
  }

  /**
   * A level's dial (FX level, Music level): up or right a step louder, down or left a step quieter, each step taken
   * up at once through `apply`, so it is heard as it turns. A or Enter keeps it; B or Escape puts back the level it
   * started at.
   */
  private async dialLevel(title: string, start: number, place: MenuPlacement | undefined, apply: (n: number) => void): Promise<void> {
    let value = start;
    const label = () => `${levelLabel(value).padStart(4)}  up/down`;
    const menu = layoutMenu(title, [label()]);
    if (place) this.placeMenu(menu, { ...place, title });
    menu.cursor = -1;
    this.openMenu(menu);
    try {
      for (;;) {
        const key = await this.readKey();
        if (key === null) continue;
        if (key === Key.A || key === Key.Enter) return;
        if (key === Key.B || key === Key.Escape) {
          if (value !== start) apply(start);
          return;
        }
        let next = value;
        if (key === Key.Up || key === Key.Right) next = Math.min(LEVELS, value + 1);
        else if (key === Key.Down || key === Key.Left) next = Math.max(0, value - 1);
        if (next === value) continue;
        value = next;
        apply(value);
        menu.items[0] = label();
        this.showMenuNow();
      }
    } finally {
      this.closeMenu();
    }
  }

  /** The Tiles sub-menu: pick a set and switch to it. */
  private async chooseTiles(): Promise<void> {
    const options = TILE_SETS.map((name) => ({ key: '', label: name }));
    const current = Math.max(0, TILE_SETS.indexOf(this.tileSetName));
    const place: MenuPlacement | undefined = this.frameShown ? undefined : { row: 13, title: 'Tiles', cursor: current };
    const picked = await this.runMenu('Tiles', options, 1, place, current);
    if (picked < 0) return;
    await this.loadTiles(TILE_SETS[picked]);
  }

  /** Switch to the named set, keeping the current one if it fails to load. */
  private async loadTiles(name: string): Promise<void> {
    try {
      const gfx = await GraphicsSet.load(name);
      this.tileSetName = name;
      this.setGraphics(gfx);
    } catch {
      /* keep the current set */
    }
  }

  /** Step to the next tile set, round and round (a development shortcut, not in the help; see main.ts). */
  async nextTileSet(): Promise<void> {
    const next = TILE_SETS[(TILE_SETS.indexOf(this.tileSetName) + 1) % TILE_SETS.length];
    await this.loadTiles(next);
    this.onSettingsChange?.();
  }

  // -------------------------------------------------------------------------
  // Pages over the map: Help and the Journal
  // -------------------------------------------------------------------------

  /**
   * A page is a boxed screen of text over the map area, with its title in
   * the box's top edge as a menu window has it: up to PAGE_ROWS lines of
   * PAGE_WIDTH characters from row 1, a note row, then two footer rows.
   * Over the game frame the box is the map's own frame; on a title screen
   * the same box is drawn in the plain frame first. Returns whether the
   * viewport was already covered, for closePage.
   */
  private openPage(): boolean {
    const wasCovered = this.viewCovered;
    this.viewCovered = true; // stop the viewport repainting under the page
    if (!this.frameShown) {
      this.black(1, 1, COLUMNS - 2, ROWS - 2); // the title picture comes back on closing
      for (let y = 1; y < 23; y++) this.piece(Piece.Vertical, 23, y);
      this.piece(Piece.TopTee, 23, 0);
      this.piece(Piece.BottomTee, 23, 23);
    }
    return wasCovered;
  }

  private closePage(wasCovered: boolean): void {
    this.viewCovered = wasCovered;
    this.redrawAll();
  }

  private drawPage(title: string, lines: string[], footer: string[], note = '', cursor = -1): void {
    this.black(1, 0, 22, 23);
    for (let x = 1; x <= 22; x++) this.piece(Piece.Horizontal, x, 0);
    const t = title.slice(0, PAGE_WIDTH);
    const tx = 1 + Math.floor((22 - t.length) / 2);
    this.black(tx, 0, t.length, 1);
    this.drawText(t, tx, 0);
    lines.slice(0, PAGE_ROWS).forEach((line, i) => this.drawText(line.slice(0, PAGE_WIDTH), PAGE_LEFT, PAGE_TOP + i));
    if (cursor >= 0 && cursor < Math.min(lines.length, PAGE_ROWS)) this.invert(PAGE_LEFT - 1, PAGE_TOP + cursor, PAGE_WIDTH + 2, 1);
    if (note) this.drawText(note.slice(0, PAGE_WIDTH), PAGE_LEFT, PAGE_TOP + PAGE_ROWS);
    footer.forEach((line, i) => this.drawText(line.slice(0, PAGE_WIDTH), PAGE_LEFT, PAGE_TOP + PAGE_ROWS + 1 + i));
  }

  /**
   * The help pages for the current input mode, in a box over the map. Any
   * key (A) turns the page, and Escape or B closes.
   */
  private async showHelp(): Promise<void> {
    const pages = helpPages(this.inputMode, this.tileSetName); // the last page speaks of the set in use
    const footer = this.inputMode === 'controller' ? ['A next  B close'] : ['Any key next  Esc'];
    const wasCovered = this.openPage();
    try {
      for (let index = 0; index < pages.length; ) {
        this.drawPage(pages[index].title, pages[index].lines, footer);
        const key = await this.readKey();
        if (key === Key.Escape || key === Key.B) break;
        if (key === Key.Pause && this.readFocusPause) continue; // a window losing focus turns no page
        index++;
      }
    } finally {
      this.closePage(wasCovered);
    }
  }

  /**
   * The quest journal (J), one page over the map (journal.ts): its five lines - the main quest, the towns, the
   * dungeons, Ambrosia, the words - each opening to its own lines, and a town or a main-quest step to what was heard
   * there or of it. Up and Down move the cursor (the page scrolls to keep it in view), A (Enter, Right) opens, B
   * (Backspace, Left) comes back and on the top closes, Escape closes; Y (H) prints the line's hint to the message
   * area. The highlighted line's card - what the party knows of it - stands over the party panel. What was shown is
   * noted on closing, so "Journal updated" only marks real change.
   */
  async showJournal(): Promise<void> {
    const controller = this.inputMode === 'controller';
    const wasCovered = this.openPage();
    // The levels open, the top first: each a list with its cursor, or text read from the line that opened it.
    type Level = { title: string; lines?: JournalLine[]; text?: string[]; from?: JournalLine; selected: number; top: number };
    const stack: Level[] = [{ title: 'Journal', lines: journalTop(this.world), selected: 0, top: 0 }];
    try {
      for (;;) {
        const level = stack[stack.length - 1];
        const line = level.lines ? level.lines[level.selected] : level.from;
        let rows: string[];
        let cursor = -1;
        if (level.lines) {
          rows = level.lines.map((l) => l.label);
          if (level.selected < level.top) level.top = level.selected;
          if (level.selected >= level.top + PAGE_ROWS) level.top = level.selected - PAGE_ROWS + 1;
          cursor = level.selected - level.top;
        } else {
          rows = (level.text ?? []).flatMap((p, i) => [...(i ? [''] : []), ...wrapText(p, PAGE_WIDTH, 12)]);
          level.top = Math.max(0, Math.min(rows.length - PAGE_ROWS, level.top));
        }
        const opens = !!line?.open && !!level.lines;
        const inner = stack.length > 1;
        // Only the hint's key: opening and backing out are as in every list.
        const footer = [controller ? 'Y hint' : 'H hint', ''];
        const note = !level.lines && rows.length > PAGE_ROWS ? 'Up/Down: scroll' : '';
        this.drawPage(level.title, rows.slice(level.top), footer, note, cursor);
        this.showCard(line ? journalCard(line) : null);
        const key = await this.readKey();
        if (key === null) continue;
        if (key === Key.Escape || key === 'j' || key === 'J') break;
        if (key === Key.B || key === Key.Backspace || key === Key.Left) {
          if (inner) stack.pop();
          else if (key !== Key.Left) break;
        } else if (key === Key.Up || key === Key.Down) {
          const step = key === Key.Up ? -1 : 1;
          if (level.lines) level.selected = (level.selected + step + level.lines.length) % level.lines.length;
          else level.top += step;
        } else if (key === Key.A || key === Key.Enter || key === Key.Right) {
          const open = opens ? line?.open : undefined;
          if (open) stack.push({ title: open.title, lines: open.lines, text: open.text, from: line, selected: 0, top: 0 });
        } else if (line && (key === Key.Y || key === 'h' || key === 'H')) this.printWrapped(line.hint);
      }
    } finally {
      this.showCard(null);
      journalSnapshot(this.world);
      this.closePage(wasCovered);
    }
  }

  /**
   * Tips (the Pause menu and the title's Settings): pointers for a new player, one page over the map as the journal
   * is - the topics, a list; A (Enter, Right) opens the one under the cursor to its text, B (Backspace) comes back
   * from it and on the list closes, Escape closes from either.
   */
  private async showTips(): Promise<void> {
    const wasCovered = this.openPage();
    let selected = 0;
    try {
      for (;;) {
        this.drawPage(
          'Tips',
          TIPS.map((t) => t.topic),
          [],
          '',
          selected,
        );
        const key = await this.readKey();
        if (key === null) continue;
        if (key === Key.Escape || key === Key.B || key === Key.Backspace) break;
        if (key === Key.Up) selected = (selected + TIPS.length - 1) % TIPS.length;
        else if (key === Key.Down) selected = (selected + 1) % TIPS.length;
        else if ((key === Key.A || key === Key.Enter || key === Key.Right) && !(await this.readTip(TIPS[selected]))) break;
      }
    } finally {
      this.closePage(wasCovered);
    }
  }

  /**
   * A topic's text, a page at a time (tips.ts tipPages), its name on the page's top border: A (Enter, Right) turns
   * the page, and from the last comes back to the topics, as B (Backspace, Left) does from any page. False where
   * Escape closed Tips altogether.
   */
  private async readTip(tip: Tip): Promise<boolean> {
    const pages = tipPages(tip, PAGE_WIDTH, PAGE_ROWS, wrapText);
    for (let index = 0; index < pages.length; ) {
      this.drawPage(tip.topic, pages[index], []);
      const key = await this.readKey();
      if (key === null) continue;
      if (key === Key.Escape) return false;
      if (key === Key.B || key === Key.Backspace || key === Key.Left) return true;
      if (key === Key.A || key === Key.Enter || key === Key.Right) index++;
    }
    return true;
  }

  /** Print a sentence to the message area, wrapped to its sixteen columns (journal hints, cheat confirmations). */
  private printWrapped(text: string): void {
    this.print('\n');
    for (const line of wrapText(text, TEXT_RIGHT - TEXT_LEFT, TEXT_BOTTOM - TEXT_TOP - 2)) this.print(`${line}\n`);
  }

  /**
   * The map (worldMap.ts), over the whole screen until closed; no turn passes. The page fills the map's box - a map of
   * 64 squares at 11 pixels in the tile set's own tiles, Sosaria's unseen parts its chart (chart.ts), or a dungeon's
   * level as its auto-map - and the boxes beside it are its legend: the page's name, the mark the cursor is on, how
   * much of the map has been seen, and the keys. The d-pad (arrows) moves between the marks, A (Enter) opens the map
   * of a town or castle the party has been in and B (Backspace) comes back from it, Y (Space) comes back to the party,
   * X turns to the next map, and B on the first page, Escape or # closes.
   */
  async showMap(): Promise<void> {
    const { world } = this;
    const controller = this.inputMode === 'controller';
    const wasCovered = this.openPage();
    const pages = mapPages(world);
    const back: MapPage[] = [];
    let turned = 0;
    let page = pages[0];
    let marks: MapMark[] = [];
    let selected = 0;
    let art: HTMLCanvasElement | null = null;
    const show = (next: MapPage) => {
      page = next;
      marks = marksOn(world, page);
      selected = 0;
      art = page.kind === 'map' ? this.mapArt(page.id) : null;
    };
    show(page);
    this.overlay = (time) =>
      this.paintWorldMap(page, art, marks, selected, { back: back.length > 0, more: pages.length > 1, controller }, time);
    this.wake();
    try {
      for (;;) {
        const key = await this.readKey();
        if (key === null) continue;
        const letter = key.length === 1 ? key.toLowerCase() : '';
        if (key === Key.Pause && this.readFocusPause) continue; // a window losing focus closes no map
        if (key === Key.Escape || key === Key.Pause || key === '#') break;
        if (key === Key.B || key === Key.Backspace) {
          if (back.length === 0) {
            if (key === Key.B) break;
            continue;
          }
          show(back.pop()!);
        } else if (key === Key.Up || key === Key.Down || key === Key.Left || key === Key.Right) {
          const dir: Direction = key === Key.Up ? 'up' : key === Key.Down ? 'down' : key === Key.Left ? 'left' : 'right';
          const wraps = page.kind === 'map' && (page.id === MapId.Sosaria || page.id === MapId.Ambrosia);
          selected = stepMark(marks, selected, dir, page.kind === 'map' ? MAP_SIDE : 16, wraps);
        } else if (key === Key.Y || key === Key.Space || letter === 'y') {
          selected = Math.max(
            0,
            marks.findIndex((m) => m.kind === 'party' || m.party),
          );
        } else if (key === Key.X || letter === 'x') {
          back.length = 0;
          turned = (turned + 1) % pages.length;
          show(pages[turned]);
        } else if (key === Key.A || key === Key.Enter) {
          const opens = marks[selected]?.opens;
          if (opens !== undefined) {
            back.push(page);
            show({ kind: 'map', id: opens });
          }
        }
      }
    } finally {
      this.overlay = null;
      this.closePage(wasCovered);
    }
  }

  /**
   * A map page's picture, drawn once as the page opens: what the party has seen of the map, square by square in the
   * tile set's tiles (the ground under anyone standing on it), over Sosaria's chart or, elsewhere, the dark.
   */
  private mapArt(id: number): HTMLCanvasElement {
    const { world } = this;
    const sq = (22 * this.cell) / MAP_SIDE;
    const art = document.createElement('canvas');
    art.width = art.height = Math.round(sq * MAP_SIDE);
    const c = art.getContext('2d')!;
    const state = id === MapId.Sosaria ? world.surface : id === world.current.id ? world.current : world.loadMapState(id);
    if (id === MapId.Sosaria) {
      const raw = world.resources.maps.get(id);
      drawChart(c, sq, (x, y) => !!raw && isLandValue(raw[1 + y * MAP_SIDE + x]));
    } else {
      c.fillStyle = '#000';
      c.fillRect(0, 0, art.width, art.height);
    }
    for (let y = 0; y < MAP_SIDE; y++) {
      for (let x = 0; x < MAP_SIDE; x++) {
        if (!world.autoMap.squareSeen(id, x, y)) continue;
        const someone = state.monsters.at(x, y);
        const value = someone >= 0 ? state.monsters.tileUnder(someone) : state.tiles[y * MAP_SIDE + x];
        this.gfx.drawShape(c, (value >> 2) * 2, x * sq, y * sq, sq);
      }
    }
    return art;
  }

  /** One frame of the map: the page, its marks and the cursor, and the legend beside it. */
  private paintWorldMap(
    page: MapPage,
    art: HTMLCanvasElement | null,
    marks: MapMark[],
    selected: number,
    can: { back: boolean; more: boolean; controller: boolean },
    time: number,
  ): void {
    const { ctx, cell, world } = this;
    this.black(1, 1, 22, 22);
    // Where a mark's square is, and how big a square is, on this page: a dungeon's level drawn whole and still, cut at
    // its seams (dungeonLayout.ts), in the middle of the window.
    const dungeon = page.kind === 'dungeon';
    const level = dungeon ? wholeLevel(world) : null;
    const sq = level ? cell : (22 * cell) / MAP_SIDE;
    const [left, top] = level
      ? [cell + Math.round(((22 - level.cols) * cell) / 2), cell + Math.round(((22 - level.rows) * cell) / 2)]
      : [cell, cell];
    if (level) this.paintAutoMap((i, j) => level.at(i, j), [0, 0], [level.cols, level.rows], [left, top], level.party);
    else if (art) ctx.drawImage(art, cell, cell, 22 * cell, 22 * cell);
    const corner = (m: MapMark) => {
      const [x, y] = level && m.kind === 'party' ? level.party : [m.x, m.y];
      return [left + x * sq, top + y * sq];
    };
    // The towns known of but not yet seen, each a sign in the chart's ink.
    for (const m of marks) {
      if (!m.unseen) continue;
      const [x, y] = corner(m);
      drawPlaceSign(ctx, x + sq / 2, y + sq / 2, sq, m.kind === 'castle');
    }
    // The moongates the party has come out of, each as the moon that opens it.
    for (const m of marks) {
      if (m.kind !== 'moongate' || m.phase === undefined) continue;
      const [x, y] = corner(m);
      this.drawMoonMark(x + sq / 2, y + sq / 2, sq * 0.9, m.phase);
    }
    // The party, blinking.
    const party = marks.find((m) => m.kind === 'party' || m.party);
    if (party && Math.floor(time / 350) % 2 === 0) {
      const [x, y] = corner(party);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, sq / 5);
      ctx.strokeRect(x - 1, y - 1, sq + 2, sq + 2);
    }
    // The cursor: brackets round the mark it is on, three squares across, in the frame's two edge colours - its dark
    // edge outside all round, its light edge inside, a band each - so that it reads as centred on dark ground and
    // light alike (lit as the frame is, the dark bottom and right sank into dark ground and pulled it up and left).
    // Where two arms meet they are mitred: a pixel of the corner nearer the cursor's top or bottom edge than its side
    // is the arm across's, the rest (the diagonal too) the side arm's. Where the party is all there is to mark (a
    // dungeon's level, a town's or a castle's map) there is nothing to step between and no cursor: its blinking box
    // says where it is.
    const chosen = marks[selected];
    const places = marks.length > 1;
    if (chosen && places) {
      const [x, y] = corner(chosen);
      const r = sq * 1.5;
      const [cx, cy] = [x + sq / 2, y + sq / 2];
      const band = Math.max(1, Math.round((2 * cell) / 32)); // two of the Standard sheet's pixels, a cell being 32 of them
      const { light, dark } = this.chrome();
      const inward = [dark, light]; // an arm's bands from its outer edge in
      const t = band * inward.length;
      const arm = Math.max(t * 2, Math.round(r * 0.7));
      const [left, top] = [Math.round(cx - r), Math.round(cy - r)];
      const [right, bottom] = [Math.round(cx + r) - t, Math.round(cy + r) - t];
      const fill = (colour: string, fx: number, fy: number, fw: number, fh: number) => {
        ctx.fillStyle = colour;
        ctx.fillRect(fx, fy, fw, fh);
      };
      for (const [sx, sy] of [
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom],
      ]) {
        const [atLeft, atTop] = [sx === left, sy === top];
        // Each arm's bands from its top (or left) row: outside first on the top and left, inside first below and right.
        const across = atTop ? inward : [...inward].reverse();
        const down = atLeft ? inward : [...inward].reverse();
        // The arm across and the arm down, beyond the corner they share.
        const ax = atLeft ? sx + t : sx + t - arm;
        const ay = atTop ? sy + t : sy + t - arm;
        for (let k = 0; k < inward.length; k++) {
          fill(across[k], ax, sy + k * band, arm - t, band);
          fill(down[k], sx + k * band, ay, band, arm - t);
        }
        for (let dy = 0; dy < t; dy++) {
          for (let dx = 0; dx < t; dx++) {
            const fromSide = atLeft ? dx : t - 1 - dx;
            const fromEnd = atTop ? dy : t - 1 - dy;
            const [bands, at] = fromEnd < fromSide ? [across, dy] : [down, dx];
            fill(bands[Math.floor(at / band)], sx + dx, sy + dy, 1, 1);
          }
        }
      }
    }
    // The legend, in one box beside the map's where the party's boxes and the messages are (closing the map draws
    // the frame again as it was).
    const LEFT = 24;
    const WIDTH = 15;
    this.black(LEFT, 1, WIDTH + 1, 23);
    for (let x = LEFT; x < 39; x++) {
      this.piece(Piece.Horizontal, x, 0);
      this.piece(Piece.Horizontal, x, 23);
    }
    for (let y = 1; y < 23; y++) {
      this.piece(Piece.Vertical, 23, y);
      this.piece(Piece.Vertical, 39, y);
    }
    this.piece(Piece.TopTee, 23, 0);
    this.piece(Piece.BottomTee, 23, 23);
    this.piece(Piece.TopRight, 39, 0);
    this.piece(Piece.BottomRight, 39, 23);
    const centred = (text: string, row: number, colour?: string) =>
      this.drawText(text, LEFT + Math.floor((WIDTH - text.length) / 2), row, colour);
    const grey = '#b0b0b0';
    wrapText(pageTitle(world, page), WIDTH, 2).forEach((line, i) => centred(line, 1 + i));
    let row = 4;
    if (chosen) {
      for (const line of wrapText(chosen.label, WIDTH, 3)) this.drawText(line, LEFT, row++);
      for (const line of wrapText(chosen.detail, WIDTH, 2)) this.drawText(line, LEFT, row++, grey);
      if (chosen.kind === 'moongate' && chosen.phase !== undefined) {
        this.drawMoonMark((LEFT + 1) * cell, (row + 0.6) * cell, cell * 0.55, chosen.phase);
      }
    }
    // The keys that do something on this page: stepping between places and back to the party only where there are any.
    const keys = can.controller
      ? [
          places ? 'D-pad: places' : '',
          chosen?.opens !== undefined ? 'A: its map' : '',
          places ? 'Y: the party' : '',
          can.more ? 'X: next map' : '',
          can.back ? 'B: back' : 'B: close',
        ]
      : [
          places ? 'Arrows: places' : '',
          chosen?.opens !== undefined ? 'Enter: its map' : '',
          places ? 'Space: party' : '',
          can.more ? 'X: next map' : '',
          can.back ? 'Bksp: back' : 'Esc: close',
        ];
    keys.filter(Boolean).forEach((line, i, all) => this.drawText(line, LEFT, 23 - all.length + i, grey));
  }

  /** A moon mark: the moon (Trammel's `phase`) that opens a gate, in a round frame, centred on (x, y). */
  private drawMoonMark(x: number, y: number, radius: number, phase: number): void {
    const { ctx, cell } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    this.gfx.drawMoon(ctx, 0, phase, x - radius, y - radius, radius * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, cell / 12);
    ctx.strokeStyle = '#f0e0a0';
    ctx.stroke();
  }

  /** The cheat menu, from the Pause menu. Returns a confirmation line for the message area, or '' when nothing was done. */
  private async cheatMenu(): Promise<string> {
    const cheats = CHEATS.filter((c) => c.available(this.world));
    const options: MenuOption[] = [...cheats.map((c) => ({ key: c.key, label: c.label })), { key: 'B', label: 'Back' }];
    // Placed on the whole screen, so the longest ("Go home (Lord British)") is not cut to the map's width.
    const picked = await this.runMenu('Cheats', options, 1, { row: 8, title: 'Cheats' });
    if (picked < 0 || picked >= cheats.length) return '';
    return await cheats[picked].apply(this.world, this);
  }

  async chooseFromList(options: MenuOption[], place?: MenuPlacement): Promise<string> {
    const picked = await this.runMenu(place?.title ?? 'Choose', options, 1, place);
    return picked < 0 ? '' : options[picked].key;
  }

  async allocatePoints(labels: string[], total: number, min: number, max: number, place: MenuPlacement): Promise<number[] | null> {
    // Start with an even spread, the remainder going to the first rows.
    const n = labels.length;
    const values = labels.map((_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
    const left = () => total - values.reduce((a, b) => a + b, 0);
    const width = Math.max(...labels.map((l) => l.length));
    const items = () => [...labels.map((l, i) => `${l.padEnd(width)}  < ${String(values[i]).padStart(2)} >`), 'O.K.'];
    const hints = () => {
      const hint = left() > 0 ? `${left()} points left to spend` : 'All points spent';
      return [...labels.map(() => hint), left() === 0 ? 'Press A or Enter to accept' : hint];
    };
    const menu = layoutMenu(place.title, items(), 1);
    menu.hints = hints();
    this.placeMenu(menu, place);
    this.openMenu(menu);
    try {
      for (;;) {
        const key = await this.readKey();
        if (key === null) continue;
        if (key === Key.Left || key === Key.Right) {
          if (menu.cursor < n) {
            const delta = key === Key.Right ? 1 : -1;
            const next = Math.max(min, Math.min(max, values[menu.cursor] + delta));
            // Right stops at the last point: the pool can be spent, never overspent.
            if (delta > 0 && left() <= 0) this.sound(Sound.Error1);
            else values[menu.cursor] = next;
            menu.items = items();
            menu.hints = hints();
            this.showMenuNow();
          }
          continue;
        }
        if (moveCursor(menu, key)) {
          this.showMenuNow();
          continue;
        }
        if (key === Key.A || key === Key.Enter) {
          if (menu.cursor < n) {
            menu.cursor++; // step to the next row, as a form would
            this.showMenuNow();
            continue;
          }
          if (left() === 0) return values;
          continue;
        }
        if (key === Key.B || key === Key.Escape) return null;
      }
    } finally {
      this.closeMenu();
    }
  }

  /** Pixels under the open menu, restored when it closes over a static screen. */
  private underMenu: { image: HTMLCanvasElement; x: number; y: number } | null = null;

  /**
   * A copy of a region of the screen, made canvas to canvas so the GPU
   * keeps the pixels (a readback through getImageData stalls the pipeline
   * and makes Chrome suggest willReadFrequently). Put back with drawImage.
   */
  private copyRegion(x: number, y: number, w: number, h: number): { image: HTMLCanvasElement; x: number; y: number } {
    const image = document.createElement('canvas');
    image.width = w;
    image.height = h;
    image.getContext('2d')!.drawImage(this.ctx.canvas, x, y, w, h, 0, 0, w, h);
    return { image, x, y };
  }

  /** Open a menu window: remember what is under it, then draw it. */
  private openMenu(menu: MenuWindow): void {
    const { cell } = this;
    // The hint line runs across the whole screen under the window, so save that too.
    const x = menu.hints ? 1 : menu.x;
    const w = menu.hints ? COLUMNS - 2 : menu.width;
    const h = menu.visibleRows + 2 + (menu.hints ? HINT_ROWS : 0);
    this.underMenu = this.copyRegion(x * cell, menu.y * cell, w * cell, Math.min(h, ROWS - menu.y) * cell);
    this.menu = menu;
    this.showMenuNow();
  }

  /** Close the menu window and restore what it covered. */
  private closeMenu(): void {
    this.menu = null;
    if (this.underMenu) this.ctx.drawImage(this.underMenu.image, this.underMenu.x, this.underMenu.y);
    this.underMenu = null;
    if (!this.viewCovered) this.viewDirty = true;
  }

  /** Redraw the open menu (after the cursor moved or its text changed). */
  private showMenuNow(): void {
    if (!this.menu) return;
    if (this.viewCovered) drawMenu(this.ctx, this.gfx, this.cell, this.menu);
    else this.viewDirty = true;
  }

  async waitCommand(scope: CommandScope, timeoutMs?: number): Promise<string | null> {
    // A command done, the members' hit points come back to the panel (`PanelLine`).
    this.setPanelLine('hp');
    // Null means the time ran out (the turn passes), so a menu closed with B goes back to waiting instead.
    let left = timeoutMs;
    for (;;) {
      const asked = this.keyboard.activeTime();
      const key = await this.readKey(left);
      if (key === null || this.promptMode === 'keyboard') return key;
      if (DIRECTION_KEYS.includes(key)) return key;
      const shortcuts = BUTTON_SHORTCUTS[scope];
      if (key === Key.B) return shortcuts.B;
      if (key === Key.X) return shortcuts.X;
      if (key === Key.Y) return shortcuts.Y;
      if (key !== Key.A) return key;
      if (left !== undefined) left = Math.max(0, left - (this.keyboard.activeTime() - asked));
      // With the menu open the turn cannot pass by itself, so the outline's fade stops where it is.
      const c = this.world.combat;
      const fading = c && c.markedFor > 0 && !c.markedFrozenAt ? c : null;
      if (fading) fading.markedFrozenAt = performance.now();
      // The commands the surroundings call for come first.
      const options = commandMenu(this.world, scope, COMMAND_MENUS[scope]);
      // The panel shows what the bar's command is about (`PanelLine`), and keeps it while the command is carried out.
      const picked = await this.runMenu('Command', options, 1, undefined, 0, (o) => this.setPanelLine(PANEL_LINES[o?.key ?? ''] ?? 'hp'));
      if (picked >= 0) return options[picked].key;
      this.setPanelLine('hp');
      // Closed: the turn's time and the outline's fade go on from where they stopped.
      if (fading) {
        fading.markedAt += performance.now() - fading.markedFrozenAt;
        fading.markedFrozenAt = 0;
      }
    }
  }

  /**
   * "Who?": the member is picked in the stats boxes. Up and Down move a
   * pair of arrows (">" and "<" on the frame either side of a box) among the
   * members offered; Enter or A takes the marked one, Escape or B cancels
   * (0), and a digit 1-4 still answers at once as on the Apple II. The
   * prompt itself sits on the map's bottom border. The answer is echoed
   * to the message area as the typed digit was.
   */
  async chooseMember(only?: number[], preferred?: number): Promise<number> {
    const offered = [0, 1, 2, 3].filter((m) => this.world.party.memberSlot(m) >= 0 && (!only || only.includes(m)));
    if (!this.frameShown) return this.chooseMemberByKey();
    this.borderPrompt(this.promptMode === 'controller' ? 'Who? B: Cancel' : 'Who? Esc Cancel');
    // The arrows start on the member likeliest to succeed, where the command says who that is.
    let at = preferred === undefined ? 0 : Math.max(0, offered.indexOf(preferred));
    let n = 0;
    try {
      for (;;) {
        this.selectedMember = offered[at] ?? -1;
        this.updateStats();
        const key = await this.waitKey();
        if (key === Key.Escape || key === Key.B) break;
        if (key >= '1' && key <= '4' && key.length === 1) {
          n = Number(key);
          break;
        }
        if (!offered.length) continue;
        if (key === Key.Up) at = (at + offered.length - 1) % offered.length;
        else if (key === Key.Down) at = (at + 1) % offered.length;
        else if (key === Key.Enter || key === Key.A) {
          n = offered[at] + 1;
          break;
        }
      }
    } finally {
      this.selectedMember = -1;
      this.updateStats();
      this.restoreBorder();
    }
    this.print(n ? `${n}\n` : ' \n');
    return n;
  }

  /** The Apple II prompt as it was, for a screen without stats boxes: the typed digit, echoed. */
  private async chooseMemberByKey(): Promise<number> {
    const key = (await this.waitKey()).toUpperCase();
    this.print(key.length === 1 && key >= ' ' ? key : ' ');
    this.print('\n');
    return key.charCodeAt(0) - '0'.charCodeAt(0);
  }

  /** A one-line prompt centred on the map's bottom border, the border showing either side; restoreBorder() takes it away. */
  private borderPrompt(label: string): void {
    for (let x = 1; x <= 22; x++) this.piece(Piece.Horizontal, x, 23);
    const text = label.slice(0, 22);
    const x = 1 + Math.floor((22 - text.length) / 2);
    this.black(x, 23, text.length, 1);
    this.drawText(text, x, 23);
  }

  private restoreBorder(): void {
    for (let x = 1; x <= 22; x++) this.piece(Piece.Horizontal, x, 23);
    this.showWind();
  }

  /**
   * A direction prompt sits on the map's bottom border, where the wind
   * line is, so the map stays in view (in combat, the member whose turn it
   * is). The border comes back when the prompt ends. Space or A answers
   * "none" when allowed; the label keeps to cancel, which ends the command
   * the same way.
   */
  async chooseDirection(allowNone: boolean, allowDiagonal: boolean): Promise<string | null> {
    const accepted = allowDiagonal ? [...DIRECTION_KEYS, '1', '2', '3', '4', '6', '7', '8', '9'] : [...DIRECTION_KEYS, '2', '4', '6', '8'];
    this.borderPrompt(this.promptMode === 'controller' ? 'Direction? B: Cancel' : 'Direction? Esc Cancel');
    try {
      for (;;) {
        const key = await this.waitKey();
        if (accepted.includes(key)) return key;
        if (allowNone && (key === Key.Space || key === Key.A)) return Key.Space;
        if (key === Key.B || key === Key.Escape) return null;
      }
    } finally {
      this.restoreBorder();
    }
  }

  async chooseOption(options: MenuOption[], echo: 'none' | 'key' | 'line', place?: MenuPlacement): Promise<string> {
    let key = '';
    for (;;) {
      if (this.promptMode === 'controller') {
        const picked = await this.runMenu(place?.title ?? 'Choose', options, 1, place);
        key = picked < 0 ? '' : options[picked].key;
        break;
      }
      const k = (await this.waitKey()).toUpperCase();
      if (k === Key.Escape) break;
      const hit = options.find((o) => o.key === k);
      if (hit?.disabled) {
        this.sound(Sound.Error1); // e.g. a spell the caster cannot afford
        continue;
      }
      if (hit) {
        key = k;
        break;
      }
      // Other keys are ignored; a controller button loops round to show the menu.
    }
    if (echo !== 'none') this.print(key || ' ');
    if (echo === 'line') this.print('\n');
    return key;
  }

  /**
   * Line input with a blinking cursor. Mirrors `UInputText()`: the cursor
   * frames are in row 1 of the UI sheet, and the text is echoed in place.
   */
  private async readLine(x: number, y: number, maxChars: number, numbersOnly: boolean, echo: (s: string) => void): Promise<string> {
    let text = '';
    let frame = 0;
    for (;;) {
      echo(text);
      const cx = x + text.length;
      // Blink the cursor while waiting.
      let key: string | null = null;
      while (key === null) {
        frame = (frame + 1) % 7;
        if (cx < COLUMNS) this.gfx.drawUiPiece(this.ctx, frame, 1, cx * this.cell, y * this.cell, this.cell);
        key = await this.keyboard.nextKeyOrTimeout(120);
      }
      if (cx < COLUMNS) this.drawText(' ', cx, y);
      if (key === Key.Enter || key === Key.Escape) return text;
      if (key === Key.Backspace) {
        text = text.slice(0, -1);
        continue;
      }
      if (key.length !== 1 || key < ' ') continue;
      if (numbersOnly && (key < '0' || key > '9')) continue;
      if (text.length < maxChars) text += key;
    }
  }

  async inputText(maxChars: number, numbersOnly: boolean, words?: string[]): Promise<string> {
    const x = this.cursorX;
    const y = this.cursorY;
    let result: string;
    if (this.inputMode === 'controller') result = await this.controllerInput(maxChars, numbersOnly, words);
    else result = await this.readLine(x, y, maxChars, numbersOnly, (s) => this.drawText((s + '   ').slice(0, maxChars + 1), x, y));
    // Leave the typed text in the message buffer and move the cursor past it.
    this.cursorX = x;
    this.print(result);
    return result;
  }

  async inputTextAt(x: number, y: number, maxChars: number, numbersOnly: boolean): Promise<string> {
    if (this.inputMode === 'controller') {
      // The keyboard's window opens on the row above the prompt, over it, as the menu before it did.
      const result = await this.controllerInput(maxChars, numbersOnly, undefined, y - 1);
      this.drawText((result + ' ').padEnd(maxChars + 1), x, y);
      return result;
    }
    return this.readLine(x, y, maxChars, numbersOnly, (s) => this.drawText((s + ' ').padEnd(maxChars + 1), x, y));
  }

  /**
   * Controller text entry: a spinner for numbers (d-pad up/down by one,
   * left/right by ten), a word list when one is offered, otherwise an
   * on-screen keyboard, at `row` when given (else over the map area).
   */
  private async controllerInput(maxChars: number, numbersOnly: boolean, words?: string[], row?: number): Promise<string> {
    if (numbersOnly) {
      const max = Math.pow(10, maxChars) - 1;
      let value = 0;
      const menu = layoutMenu('Amount', [`${String(0).padStart(maxChars, ' ')}  up/down`]);
      menu.cursor = -1;
      this.openMenu(menu);
      const show = () => {
        menu.items[0] = `${String(value).padStart(maxChars, ' ')}  up/down`;
        this.showMenuNow();
      };
      try {
        for (;;) {
          const key = await this.readKey();
          if (key === Key.Up) value = Math.min(max, value + 1);
          else if (key === Key.Down) value = Math.max(0, value - 1);
          else if (key === Key.Right) value = Math.min(max, value + 10);
          else if (key === Key.Left) value = Math.max(0, value - 10);
          else if (key === Key.A) return String(value);
          else if (key === Key.B) return '';
          else if (key !== null && key >= '0' && key <= '9') value = Math.min(max, value * 10 + Number(key));
          show();
        }
      } finally {
        this.closeMenu();
      }
    }
    if (words) {
      // The words learnt (journal.ts), each with its card; none yet, a line that says so (B backs out).
      const none = cardWrap('None learnt yet. Townsfolk say them: walk into everyone.').map((text) => ({ text }));
      const options = words.length
        ? words.map((w) => ({ key: w[0], label: w, card: wordCard(w) }))
        : [{ key: '-', label: 'None known', disabled: true, card: { title: 'Words', lines: none } }];
      const picked = await this.runMenu('Word', options);
      return picked < 0 ? '' : (words[picked] ?? '');
    }
    // On-screen keyboard.
    const keys = OSK_KEYS;
    let text = '';
    let cursor = 0; // the window is made again for each key, the cursor kept where it was
    for (;;) {
      const menu = layoutKeyboard(text || 'Type');
      if (row !== undefined) this.placeMenu(menu, { row, title: menu.title });
      menu.cursor = cursor;
      this.openMenu(menu);
      let picked = -1;
      try {
        for (;;) {
          const key = await this.readKey();
          if (key === null) continue;
          if (moveCursor(menu, key)) {
            this.showMenuNow();
            continue;
          }
          if (key === Key.A) {
            picked = menu.cursor;
            break;
          }
          if (key === Key.B) {
            picked = keys.indexOf(OSK_DELETE);
            break;
          }
          if (key === Key.X || key === Key.Y) {
            picked = keys.indexOf(OSK_DONE);
            break;
          }
          if (key.length === 1 && key >= ' ') {
            text = (text + key).slice(0, maxChars);
            break;
          }
        }
      } finally {
        cursor = menu.cursor;
        this.closeMenu();
      }
      if (picked < 0) continue;
      const k = keys[picked];
      if (k === OSK_DONE) return text;
      if (k === OSK_DELETE) {
        if (!text) return '';
        text = text.slice(0, -1);
      } else if (text.length < maxChars) text += k;
    }
  }

  sound(name: string): void {
    if (this.world.soundEnabled) this.sounds.play(name);
  }

  music(track: number): void {
    this.musicPlayer.play(track);
  }

  fadeMusic(track: number): void {
    this.musicPlayer.fadeTo(track);
  }

  pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Map viewport
  // -------------------------------------------------------------------------

  redrawMap(): void {
    this.viewCovered = false;
    this.view = buildViewport(this.world);
    recordView(this.world, this.view); // what the view shows is on the map from now (worldMap.ts)
    this.viewDirty = true;
  }

  clearTiles(): void {
    this.view = null;
    this.viewCovered = true;
    this.black(1, 1, 22, 22);
  }

  /** Paint the cached viewport, or the dungeon view. Called from the animation loop. */
  /**
   * In combat, a rounded outline around the member whose turn it is, two
   * game pixels wide just outside their tile. It starts white and fades to
   * mid grey over the time the member has before the turn passes by
   * itself, so the outline doubles as the timer; once they have chosen, or
   * with the timer off, it stays white. On the Macintosh set, whose ground
   * is white, it runs black to grey instead. (The Apple II blinked the
   * figure.)
   */
  private markActiveMember(): void {
    const c = this.world.combat;
    if (!c || c.markedMember < 0) return;
    const { ctx, cell } = this;
    const me = c.members[c.markedMember];
    if (me.x > 10 || me.y > 10) return;
    const tile = 2 * cell;
    const gamePixel = tile / 16; // the Apple II tile was 16 pixels, whatever the sheet's size
    const width = 2 * gamePixel;
    const x = (1 + 2 * me.x) * cell - width / 2;
    const y = (1 + 2 * me.y) * cell - width / 2;
    // A menu opened during the wait freezes the fade where it was: the turn can no longer expire.
    const now = c.markedFrozenAt || performance.now();
    const elapsed = c.markedFor > 0 ? (now - c.markedAt) / c.markedFor : 0;
    // White fading to half on the dark sets, black fading up on the Macintosh set's white ground, and in a monochrome
    // monitor's colour where there is one, so the outline matches the figures it frames.
    const colour = `rgb(${markerColour(this.gfx.display, elapsed).join(',')})`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell, cell, 22 * cell, 22 * cell); // never paint over the border
    ctx.clip();
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, tile + width, tile + width, 3 * gamePixel);
    else ctx.rect(x, y, tile + width, tile + width);
    ctx.stroke();
    ctx.restore();
  }

  private paintViewport(): void {
    const { ctx, cell, gfx, world } = this;
    const inDungeon = world.party.location === Location.Dungeon && !world.combat;
    const overlay = inDungeon && world.mapMode !== 'off'; // small: the 5x5 map; full: the small first-person view
    if (this.overlayShown && !overlay) {
      // The overlay has gone: bring back the text it was covering.
      this.overlayShown = false;
      this.redrawTextArea();
    }
    if (inDungeon) {
      const lit = world.dungeon.torch > 0 && this.dungeonRenderer;
      const view = lit ? this.dungeonRenderer!.render(buildDungeonView(world), world.dungeon.torch, secretMessage(world)) : null;
      if (world.mapMode === 'full') {
        // The level fills the window; the first-person view shrinks into the overlay slot.
        this.overlayShown = true;
        this.black(1, 1, 22, 22);
        // The party in the middle and the level round it, moving as it walks (dungeonLayout.ts).
        const span = TOP_DOWN_REACH * 2 + 1;
        const edge = cell + Math.round(((22 - span) * cell) / 2);
        this.paintAutoMap(aroundParty(world), [-TOP_DOWN_REACH, -TOP_DOWN_REACH], [span, span], [edge, edge], [0, 0]);
        this.black(MAP_OVERLAY_LEFT, MAP_OVERLAY_TOP, MAP_OVERLAY_SIZE, MAP_OVERLAY_SIZE);
        if (view) {
          const w = MAP_OVERLAY_SIZE * cell;
          const h = Math.round((w * 512) / 600);
          ctx.drawImage(view, MAP_OVERLAY_LEFT * cell, MAP_OVERLAY_TOP * cell + Math.floor((MAP_OVERLAY_SIZE * cell - h) / 2), w, h);
        }
        return;
      }
      if (overlay) {
        this.overlayShown = true;
        const half = MAP_OVERLAY_SIZE >> 1;
        this.paintAutoMap(
          aroundParty(world),
          [-half, -half],
          [MAP_OVERLAY_SIZE, MAP_OVERLAY_SIZE],
          [MAP_OVERLAY_LEFT * cell, MAP_OVERLAY_TOP * cell],
          [0, 0],
        );
      }
      this.black(1, 1, 22, 22);
      if (!view) return;
      // The original drew the 600x512 view at (84, 128) for 32-pixel cells, scaling with the cell size.
      const mult = cell / 32;
      ctx.drawImage(view, 84 * mult, 128 * mult, 600 * mult, 512 * mult);
      return;
    }
    if (!this.view) return;
    const tile = cell * 2;
    for (let i = 0; i < this.view.cells.length; i++) {
      const c = this.view.cells[i];
      const dx = cell + (i % VIEW_SIZE) * tile;
      const dy = cell + Math.floor(i / VIEW_SIZE) * tile;
      gfx.drawShape(ctx, c.base, dx, dy, tile);
      if (c.follower !== undefined && this.partyStyle === 'line') this.drawMember(c.follower, dx, dy, tile);
      if (c.hit && !this.burstTiles) {
        // The Apple II way: the ball's "HIT" frame replaces whatever was hit.
        gfx.drawShape(ctx, c.hit.shape, dx, dy, tile, { masked: true, altFrame: true });
        continue;
      }
      if (c.party && this.partyStyle !== 'symbol') this.drawParty(dx, dy, tile, this.partyStyle);
      else if (c.overlay !== undefined) gfx.drawShape(ctx, c.overlay, dx, dy, tile, { masked: true, flip: c.flip, altFrame: c.altFrame });
      if (c.hit) this.drawBurst(dx, dy, tile, c.hit.frame);
    }
    this.markActiveMember();
  }

  /**
   * With the Standard tiles the party on foot is drawn as its members. On
   * the overworld they are at half size in a 2x2 grid in marching order
   * (1 top left, 2 top right, 3 bottom left, 4 bottom right), which sells
   * the scale of the map. In a town or castle the first living member
   * stands here at full size and the others follow in a line behind (see
   * `world.trail`); with the Nintendo tiles the line is used everywhere, as
   * the NES did. A poisoned member is drawn all in green; a dead one, or
   * ashes, is not drawn. The other tile sets keep the Apple II's single figure.
   */
  private drawParty(dx: number, dy: number, tile: number, style: 'grid' | 'line'): void {
    const { world } = this;
    if (style === 'line') {
      const leader = [0, 1, 2, 3].find((m) => world.party.memberSlot(m) >= 0 && world.memberAlive(m));
      if (leader !== undefined) this.drawMember(leader, dx, dy, tile);
      return;
    }
    const q = tile / 2;
    for (let m = 0; m < 4; m++) {
      if (world.party.memberSlot(m) < 0) continue;
      this.drawMember(m, dx + (m % 2) * q, dy + Math.floor(m / 2) * q, q);
    }
  }

  /** One member's class figure at (x, y), `size` pixels square: green if poisoned, nothing if dead or ashes. */
  private drawMember(m: number, x: number, y: number, size: number): void {
    const p = this.world.member(m);
    if (p.status === 'D' || p.status === 'A') return;
    const shape = memberShape(this.world, p.classLetter);
    if (p.status === 'P') this.ctx.drawImage(this.greenFigure(shape, size), x, y);
    else this.gfx.drawShape(this.ctx, shape, x, y, size, { masked: true });
  }

  /** Cache of member figures recoloured green (poison), keyed by shape and size. */
  private greenFigures = new Map<string, HTMLCanvasElement>();

  /** A member figure with every pixel turned green, its shading kept as brightness. */
  private greenFigure(shape: number, size: number): HTMLCanvasElement {
    const key = `${shape}:${size}`;
    const cached = this.greenFigures.get(key);
    if (cached) return cached;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    octx.imageSmoothingEnabled = false;
    this.gfx.drawShape(octx, shape, 0, 0, size, { masked: true });
    const image = octx.getImageData(0, 0, size, size);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const bright = Math.max(d[i], d[i + 1], d[i + 2]);
      d[i] = 0;
      d[i + 1] = Math.max(64, bright);
      d[i + 2] = 0;
    }
    octx.putImageData(image, 0, 0);
    this.greenFigures.set(key, off);
    return off;
  }

  /**
   * A hit with the Standard tiles: a red burst that grows over three frames,
   * drawn on the 16-pixel grid of the era's tiles so it sits with the art.
   * Frames 1 and 2 are filled discs, a bright rim round a darker centre;
   * frame 3 is a ring, so the target shows through as the burst passes.
   */
  private drawBurst(dx: number, dy: number, tile: number, frame: number): void {
    const { ctx } = this;
    const gp = tile / 16;
    const radius = [0, 2.6, 4.6, 6.8][frame] ?? 6.8;
    const inner = frame === 3 ? 4.6 : frame === 2 ? 3.0 : 0; // hollow, or the darker centre
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const d = Math.hypot(px - 7.5, py - 7.5);
        if (d > radius) continue;
        if (frame === 3 && d <= inner) continue;
        ctx.fillStyle = d <= inner ? '#a01818' : d > radius - 1.2 ? '#ff5040' : '#e02020';
        ctx.fillRect(dx + px * gp, dy + py * gp, gp, gp);
      }
    }
  }

  private invert(x: number, y: number, w: number, h: number): void {
    const { ctx, cell } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff';
    ctx.fillRect(x * cell, y * cell, w * cell, h * cell);
    ctx.restore();
  }

  async flashTiles(): Promise<void> {
    this.invert(1, 1, 22, 22);
    await this.pause(100);
    this.viewDirty = true;
    if (this.viewCovered) this.invert(1, 1, 22, 22);
  }

  async flashSpell(kind: SpellFlash, member: number, sound: string): Promise<void> {
    const rect = this.tileSetName === 'Standard' && !this.viewCovered ? this.spellFlashRect(kind, member) : null;
    if (!rect) {
      await this.flashTiles();
      this.sound(sound);
      await this.flashTiles();
      return;
    }
    // The pulse is drawn now and again after any repaint while it lasts (the arena animates), then painted away.
    this.pulse = rect;
    this.drawPulse();
    this.sound(sound);
    await this.pause(100);
    this.pulse = null;
    this.viewDirty = true;
  }

  private drawPulse(): void {
    if (!this.pulse) return;
    const { ctx, cell } = this;
    const { x, y, w, h } = this.pulse;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x * cell, y * cell, w * cell, h * cell);
    ctx.restore();
  }

  /** The cells a spell's flash covers: a member's 2x2 square in the arena, the party's square on a map, or the whole view. */
  private spellFlashRect(kind: SpellFlash, member: number): { x: number; y: number; w: number; h: number } {
    const whole = { x: 1, y: 1, w: 22, h: 22 };
    if (kind === 'window') return whole;
    const c = this.world.combat;
    if (c) {
      const p = c.members[member];
      if (!p || p.x > 10 || p.y > 10) return whole;
      return { x: 1 + p.x * 2, y: 1 + p.y * 2, w: 2, h: 2 };
    }
    if (this.world.party.location === Location.Dungeon) return whole; // no square to point at in the first-person view
    return { x: 1 + VIEW_CENTRE * 2, y: 1 + VIEW_CENTRE * 2, w: 2, h: 2 };
  }

  private frame(time: number): void {
    // Paused with no menu to say so (a key press could not reach the game): the screen shows PAUSED and stops
    // animating. Under the Pause menu the frame loop runs on, so the menu draws and answers the cursor.
    const boxed = this.keyboard.paused && !this.pauseShown;
    if (boxed !== (this.underPaused !== null)) {
      if (boxed) this.showPaused();
      else this.hidePaused();
    }
    if (this.underPaused) return; // the PAUSED box stands; the hold's letting go wakes the frames
    if (this.overlay) {
      this.overlay(time); // the map page: its marks blink, every frame while it is open
      this.wake();
      return;
    }
    if (this.stepDue || time - this.lastFrame >= ANIMATION_INTERVAL_MS) {
      this.stepDue = false;
      this.lastFrame = time;
      this.gfx.tick();
      if (!this.viewCovered) this.dirty = true; // painted below, in this frame: no other asked for
    }
    if (this.viewDirty && !this.viewCovered) {
      this.paintViewport();
      this.drawPulse();
      this.viewDirty = false;
      if (this.menu) drawMenu(this.ctx, this.gfx, this.cell, this.menu);
    }
    this.nextStep(time);
  }

  /**
   * A small black box reading PAUSED over whatever is there: the middle of
   * the map window in play, the gap under the Options box on the title screen.
   */
  private showPaused(): void {
    const { cell } = this;
    const text = 'PAUSED';
    const w = text.length + 4;
    const h = 3;
    const x = this.frameShown ? Math.floor((1 + VIEW_SIZE * 2) / 2 - w / 2) + 1 : Math.floor((COLUMNS - w) / 2);
    const y = this.frameShown ? Math.floor((1 + VIEW_SIZE * 2) / 2 - h / 2) + 1 : 19;
    this.underPaused = this.copyRegion(x * cell, y * cell, w * cell, h * cell);
    this.black(x, y, w, h);
    this.drawText(text, x + 2, y + 1);
  }

  private hidePaused(): void {
    if (!this.underPaused) return;
    this.ctx.drawImage(this.underPaused.image, this.underPaused.x, this.underPaused.y);
    this.underPaused = null;
  }

  // -------------------------------------------------------------------------
  // Pictures, mini maps, the ending
  // -------------------------------------------------------------------------

  showImage(name: string): void {
    const img = this.gfx.scenes.get(name) ?? this.images.get(name); // the tile set's own picture; the shared map for images.get
    this.viewCovered = true;
    this.view = null;
    this.black(1, 1, 22, 22);
    if (img) this.ctx.drawImage(img, this.cell, this.cell, 22 * this.cell, 22 * this.cell);
  }

  /**
   * Cells of the dungeon auto-map, `at` saying which cell of the level goes
   * where (dungeonLayout.ts: round the party, or the whole level): `w` x `h`
   * of them from (i0, j0) in its terms, drawn from pixel (left, top) with
   * the pieces Peer at gem uses. Only cells the party has seen (or, in the
   * dark, the 3x3 around it) are drawn; the rest stay black. Secret doors
   * are drawn as a wall with one pixel out of place, so a sharp eye can
   * spot them where Peer shows them plainly. The party, at `party` in the
   * same terms, is the figure of its first living member, standing still
   * (Peer's blinking diamond was a distraction on a map that stays up).
   */
  private paintAutoMap(
    at: (i: number, j: number) => number,
    [i0, j0]: [number, number],
    [w, h]: [number, number],
    [left, top]: [number, number],
    party: [number, number],
  ): void {
    const { ctx, cell, world } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(left, top, w * cell, h * cell);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const c = at(i0 + col, j0 + row);
        if (c < 0) continue;
        const [dx, dy] = [left + col * cell, top + row * cell];
        const value = world.getXYDng(c & 0x0f, c >> 4);
        if (value === DungeonCell.SecretDoor) ctx.drawImage(this.secretDoor(), dx, dy, cell, cell);
        else this.gfx.drawUiPiece(ctx, DUNGEON_MAP_PIECE_COLUMN + dungeonMapPiece(value), 1, dx, dy, cell);
      }
    }
    const [col, row] = [party[0] - i0, party[1] - j0];
    const leader = this.livingLeader();
    if (leader !== undefined && col >= 0 && col < w && row >= 0 && row < h) {
      this.drawMember(leader, left + col * cell, top + row * cell, cell);
    }
  }

  /** The first member in marching order who is neither dead nor ashes. */
  private livingLeader(): number | undefined {
    for (let m = 0; m < 4; m++) {
      if (this.world.party.memberSlot(m) < 0) continue;
      const s = this.world.member(m).status;
      if (s !== 'D' && s !== 'A') return m;
    }
    return undefined;
  }

  /**
   * The frame's two edge colours in the tile set in use: the lightest down its top half (the light its top and left
   * catch) and the darkest down its bottom half (the shade on its bottom and right), read from the frame's straight
   * piece, for the map's cursor.
   */
  private chrome(): { light: string; dark: string } {
    if (this.chromeColours) return this.chromeColours;
    const size = this.gfx.uiSize;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const octx = off.getContext('2d')!;
    this.gfx.drawUiPiece(octx, Piece.Horizontal - 1, 0, 0, 0, size);
    const column = octx.getImageData(Math.floor(size / 2), 0, 1, size).data;
    let [light, dark] = [
      [255, 255, 255],
      [0, 0, 0],
    ];
    let [most, least] = [-1, Infinity];
    for (let y = 0; y < size; y++) {
      const [r, g, b, a] = column.slice(y * 4, y * 4 + 4);
      if (a < 128) continue;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (y < size / 2 && lum > most) [most, light] = [lum, [r, g, b]];
      if (y >= size / 2 && lum < least) [least, dark] = [lum, [r, g, b]];
    }
    this.chromeColours = { light: `rgb(${light.join(',')})`, dark: `rgb(${dark.join(',')})` };
    return this.chromeColours;
  }

  /** The wall piece with one pixel (one Apple-scale pixel, whatever the sheet's size) turned black. */
  private secretDoor(): HTMLCanvasElement {
    if (this.secretDoorPiece) return this.secretDoorPiece;
    const size = this.gfx.uiSize;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d')!;
    this.gfx.drawUiPiece(octx, DUNGEON_MAP_PIECE_COLUMN + 2, 1, 0, 0, size);
    const dot = Math.max(1, Math.floor(size / 32));
    octx.fillStyle = '#000';
    octx.fillRect(Math.floor(size * 0.6), Math.floor(size * 0.35), dot, dot);
    this.secretDoorPiece = off;
    return off;
  }

  /** Mirrors `DrawMiniMap()`: the whole map in miniature, the party's square blinking. */
  async showMiniMap(): Promise<void> {
    const { ctx, cell, world } = this;
    this.viewCovered = true;
    this.view = null;
    const size = world.mapSize;
    const mini = Math.max(1, Math.floor((cell * 22) / size));
    const left = 12 * cell - mini * (size / 2);
    const top = left;
    this.black(1, 1, 22, 22);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        this.gfx.drawShape(ctx, (world.getXYVal(x, y) >> 2) * 2, left + x * mini, top + y * mini, mini);
      }
    }
    let bright = true;
    for (;;) {
      ctx.fillStyle = bright ? '#fff' : '#444';
      ctx.fillRect(left + world.x * mini, top + world.y * mini, mini, mini);
      bright = !bright;
      const key = await this.readKey(150);
      if (key !== null && !(key === Key.Pause && this.readFocusPause)) break; // a window losing focus ends no look
    }
    this.redrawMap();
  }

  /** Mirrors `DrawMiniDng()`: the current level as a 16x16 map from the UI sheet's small pieces. */
  async showMiniDungeon(): Promise<void> {
    const { ctx, cell, world } = this;
    this.viewCovered = true;
    this.view = null;
    this.black(1, 1, 22, 22);
    const draw = (xs: number, ys: number, piece: number) =>
      this.gfx.drawUiPiece(ctx, piece + DUNGEON_MAP_PIECE_COLUMN, 1, (xs + 4) * cell, (ys + 4) * cell, cell);
    let under = 6;
    for (let ys = 0; ys < 16; ys++) {
      for (let xs = 0; xs < 16; xs++) {
        const piece = dungeonMapPiece(world.getXYDng(xs, ys));
        draw(xs, ys, piece);
        if (xs === world.x && ys === world.y) under = piece;
      }
    }
    let shown = true;
    for (;;) {
      draw(world.x, world.y, shown ? 8 : under);
      shown = !shown;
      const key = await this.keyboard.nextKeyOrTimeout(160);
      if (key !== null) break;
    }
    this.print('\n');
    this.redrawMap();
  }

  /** The victory sequence: flashing colours over the map, then the closing text. */
  async playEnding(): Promise<void> {
    const { ctx, cell } = this;
    this.viewCovered = true;
    this.view = null;
    for (let i = 0; i <= 20; i++) {
      ctx.fillStyle = `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`;
      ctx.fillRect(cell, cell, 22 * cell, 22 * cell);
      this.sound('Hit');
      await this.pause(120);
    }
    this.black(1, 1, 22, 22);
    const lines = [
      '   And so it came to',
      'pass  that  on  this',
      'day EXODUS,hell-born',
      'incarnate  of  evil,',
      'was vanquished  from',
      'SOSARIA.   What  now',
      'lies  ahead  in  the',
      'ULTIMA saga can only',
      'be pure speculation!',
      'Onward to ULTIMA IV!',
    ];
    lines.forEach((line, i) => this.drawText(line, 2, 3 + i * 2));
    await this.keyboard.nextKey();
    this.redrawMap();
  }

  // -------------------------------------------------------------------------
  // Stats boxes, wind, moons
  // -------------------------------------------------------------------------

  /**
   * The four character boxes, two rows each (the Apple II's had three:
   * name and status letter; sex, race, class, mana and level; hit points
   * and food):
   *
   *   Tatiana               name, coloured by state: green poisoned, light
   *   100/150     M:25      grey dead, dark grey ashes, blue when Lord
   *                         British would raise the member, else white
   *
   * Hit points turn yellow under a quarter of the maximum and red under a
   * tenth. Gold and food are pooled and shown on the top border (`showMoons`).
   *
   * While the command menu's bar is on Ztats, Ready weapon or Wear armour
   * the second line shows the experience toward the next level instead
   * (blue where Lord British owes a level), the weapon in hand or the armour
   * worn (`PanelLine`). Under a card (`showCard`) nothing is drawn.
   */
  updateStats(force = false): void {
    if (this.card) {
      this.statsCache = ['', '', '', ''];
      this.showMoons();
      return;
    }
    for (let m = 0; m < 4; m++) {
      const slot = this.world.party.memberSlot(m);
      const p = slot >= 0 ? this.world.roster.get(slot) : null;
      const due = p ? levelUpDue(p) : false;
      const selected = m === this.selectedMember;
      const line = this.panelLine;
      const key = p
        ? `${p.name}|${p.status}|${due}|${p.hitPoints}|${p.maxHitPoints}|${p.mana}|${selected}|${line}|${p.bytes[30]}|${p.bytes[31]}|${p.bytes[48]}|${p.bytes[40]}`
        : '';
      if (!force && key === this.statsCache[m]) continue;
      this.statsCache[m] = key;

      const top = m * BOX_PITCH + 1;
      this.black(24, top, 15, BOX_ROWS);
      // The arrows of "Who?" sit on the frame either side of the box; the frame comes back when it is unmarked.
      for (const row of [top, top + 1]) {
        if (selected) {
          this.black(23, row, 1, 1);
          this.drawText('>', 23, row);
          this.black(39, row, 1, 1);
          this.drawText('<', 39, row);
        } else {
          this.piece(Piece.Vertical, 23, row);
          this.piece(Piece.Vertical, 39, row);
        }
      }
      if (p) {
        // The Standard set tells a member's state by colour: the name green
        // poisoned, grey dead, dark grey ashes, blue with a level due; dead
        // or ashes, the whole box takes that grey; hit points go yellow under
        // a quarter and red under a tenth. Every other set does as the Apple
        // II did: the status letter at the end of the name row and no colour
        // at all, with an L of this port's own where a level is due.
        const classic = this.tileSetName !== 'Standard';
        const nameColour = classic ? undefined : memberColour(p, due);
        this.drawText(p.name, 24, top, nameColour);
        if (classic) this.drawText(statusLetter(p), 38, top);
        const gone = p.status === 'D' || p.status === 'A';
        if (this.panelLine === 'xp') {
          // Experience counts a level every hundred, to 9899 (actions.ts addExperience).
          const xp = p.bytes[30] * 100 + p.bytes[31];
          const next = xp >= 9899 ? ' MAX' : `/${(p.bytes[30] + 1) * 100}`;
          this.drawText(`XP ${xp}${next}`, 24, top + 1, classic ? undefined : gone ? nameColour : due ? memberColour(p, due) : undefined);
        } else if (this.panelLine !== 'hp') {
          const weapon = this.panelLine === 'weapon';
          this.drawText(gearName(this.world, weapon, p.bytes[weapon ? 48 : 40]), 24, top + 1, gone && !classic ? nameColour : undefined);
        } else {
          const hp = p.hitPoints;
          const max = Math.max(1, p.maxHitPoints);
          const hpColour = classic ? undefined : gone ? nameColour : hp < max / 10 ? '#ff4040' : hp < max / 4 ? '#ffe040' : undefined;
          this.drawText(`${hp}/${p.maxHitPoints}`, 24, top + 1, hpColour);
          if (hasMagic(this.world, p)) {
            const mana = `M:${p.mana}`;
            this.drawText(mana, 39 - mana.length, top + 1, gone && !classic ? nameColour : undefined);
          }
        }
      }
      if (this.highlighted.has(m)) this.invert(24, top, 15, BOX_ROWS);
    }
    this.showMoons();
  }

  async flashMember(member: number): Promise<void> {
    if (this.card) return; // under a card the boxes are not there to flash
    const top = member * BOX_PITCH + 1;
    this.invert(24, top, 15, BOX_ROWS);
    await this.pause(100);
    this.invert(24, top, 15, BOX_ROWS);
  }

  highlightMember(member: number, on: boolean): void {
    if (this.highlighted.has(member) === on) return;
    if (on) this.highlighted.add(member);
    else this.highlighted.delete(member);
    if (!this.card) this.invert(24, member * BOX_PITCH + 1, 15, BOX_ROWS); // a card puts it back as it goes
  }

  /** Wind indicator on the bottom border, or the heading in a dungeon. (`ShowWind`, `DngInfo`) */
  showWind(): void {
    const w = this.world;
    const mm = w.resources.strings.MoreMessages;
    if (w.party.location === Location.Dungeon) {
      this.piece(Piece.CapLeft, 6, 23);
      this.piece(Piece.CapRight, 17, 23);
      // MoreMessages 49 "HEAD-", then 50..53 North, -East, South, -West.
      const label = (mm[48] + mm[49 + w.dungeon.heading]).padEnd(10);
      this.drawText(label, 7, 23);
      return;
    }
    if (w.party.location === Location.Combat || !w.windEnabled) {
      for (let x = 6; x <= 17; x++) this.piece(Piece.Horizontal, x, 23);
      return;
    }
    this.piece(Piece.CapLeft, 6, 23);
    this.piece(Piece.CapRight, 17, 23);
    // MoreMessages 43..47 (1-based) are CALM WINDS, NORTH WIND ... WEST WIND.
    this.drawText((mm[42 + w.windDirection] ?? '').padEnd(10), 7, 23);
  }

  /**
   * The status bar on the top border over the map: the party's gold on the
   * left, the moon phases (or the dungeon level) in the middle where the
   * Apple II showed them, and the party's food on the right.
   * (`DrawMoonGateStuff`, `DngInfo`)
   */
  showMoons(): void {
    const w = this.world;
    if (!this.frameShown) return; // title screens have no status bar
    const piece = (n: number, x: number) => this.piece(n, x, 0);

    // Plain bar across the top of the map, then the three fields over it:
    // gold at the left, the moons (or dungeon level) in the middle where the
    // Apple II showed them, food at the right. The moons are the tile set's
    // pictures of the phases, Trammel then Felucca, between two bar caps;
    // the Apple II printed the phases as digits, LairWare drew these.
    for (let x = 1; x <= 22; x++) piece(Piece.Horizontal, x);
    this.drawText(`G:${w.party.gold}`, 1, 0);
    if (w.party.location === Location.Dungeon) this.drawText(`Lvl:${w.dungeon.level + 1}`.padEnd(6), 9, 0);
    else {
      piece(Piece.CapLeft, 9);
      this.gfx.drawMoon(this.ctx, 0, w.moonPhase[0], 10 * this.cell, 0, this.cell);
      this.gfx.drawMoon(this.ctx, 1, w.moonPhase[1], 11 * this.cell, 0, this.cell);
      piece(Piece.CapRight, 12);
    }
    const food = `F:${w.party.food}`;
    this.drawText(food, 23 - food.length, 0);
  }
}

/**
 * The colour that tells a member's state: green poisoned, light grey dead,
 * dark grey ashes, blue when a raise is due, undefined (white) otherwise.
 */
function memberColour(p: PlayerRecord, due = false): string | undefined {
  if (p.status === 'P') return '#40ff40';
  if (p.status === 'D') return '#b0b0b0';
  if (p.status === 'A') return '#606060';
  return due ? '#60a0ff' : undefined;
}

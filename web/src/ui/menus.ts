/**
 * menus.ts
 *
 * Controller mode: pop-up menu windows drawn over the map, the command
 * lists they show (in the spirit of the NES version of Ultima III, where a
 * button opened a command window), the keyboard stand-ins for the four
 * buttons, and a Gamepad API reader that turns button presses into keys.
 *
 * Nothing here knows about the game; the Screen decides when to show a
 * menu and what to do with the answer.
 */

import { Key, Sound, type CommandScope, type MenuOption } from '../game/io.ts';
import { VIEW_MAP_KEY } from '../game/context.ts';
import { GraphicsSet } from './graphics.ts';
import { HOLD_FIRST_MS, INPUT_PACES, Keyboard } from './input.ts';

/**
 * How keyboard keys stand in for the controller when in controller mode.
 * Escape is not among them: it pauses, as the pad's system buttons do, and
 * a menu takes it as backing out anyway.
 */
export function controllerKeyFor(key: string): string {
  switch (key) {
    case 'w':
    case 'W':
      return Key.Up;
    case 's':
    case 'S':
      return Key.Down;
    case 'a':
    case 'A':
      return Key.Left;
    case 'd':
    case 'D':
      return Key.Right;
    case Key.Enter:
    case 'z':
    case 'Z':
      return Key.A;
    case 'x':
    case 'X':
    case 'b':
    case 'B':
      return Key.B;
    case 'c':
    case 'C':
      return Key.X;
    case 'v':
    case 'V':
    case 'y':
    case 'Y':
      return Key.Y;
    default:
      return key;
  }
}

export const DIRECTION_KEYS: string[] = [Key.Up, Key.Down, Key.Left, Key.Right];

/**
 * The command menus for each scope: menu label and the letter the game
 * understands. Pass is not among them (B passes), nor Pause (the system
 * buttons, and Escape, open it), nor the settings it holds: Quit and save
 * and Auto combat are in the Pause menu.
 */
export const COMMAND_MENUS: Record<CommandScope, MenuOption[]> = {
  field: [
    { key: 'A', label: 'Attack' },
    { key: 'T', label: 'Transact (talk)' },
    { key: 'L', label: 'Look' },
    { key: 'E', label: 'Enter' },
    { key: 'B', label: 'Board' },
    { key: 'X', label: 'X-it craft' },
    { key: 'F', label: 'Fire cannons' },
    { key: 'G', label: 'Get chest' },
    { key: 'U', label: 'Unlock door' },
    { key: 'S', label: 'Steal' },
    { key: 'C', label: 'Cast spell' },
    { key: 'Z', label: 'Ztats' },
    { key: 'R', label: 'Ready weapon' },
    { key: 'W', label: 'Wear armour' },
    { key: 'M', label: 'Modify order' },
    { key: 'N', label: 'Negate time' },
    { key: 'P', label: 'Peer at gem' },
    { key: 'O', label: 'Other command' },
    { key: 'J', label: 'Journal' },
    { key: VIEW_MAP_KEY, label: 'View map' },
  ],
  combat: [
    { key: 'A', label: 'Attack' },
    { key: 'C', label: 'Cast spell' },
    { key: 'N', label: 'Negate time' },
    { key: 'R', label: 'Ready weapon' },
    { key: 'Z', label: 'Ztats' },
  ],
  dungeon: [
    { key: 'I', label: 'Ignite torch' },
    { key: 'L', label: 'Change view' },
    { key: 'K', label: 'Klimb ladder' },
    { key: 'D', label: 'Descend ladder' },
    { key: 'G', label: 'Get chest' },
    { key: 'C', label: 'Cast spell' },
    { key: 'Z', label: 'Ztats' },
    { key: 'P', label: 'Peer at gem' },
    { key: 'R', label: 'Ready weapon' },
    { key: 'W', label: 'Wear armour' },
    { key: 'M', label: 'Modify order' },
    { key: 'N', label: 'Negate time' },
    { key: 'O', label: 'Other command' },
    { key: 'J', label: 'Journal' },
    { key: VIEW_MAP_KEY, label: 'View map' },
  ],
};

/** What the B, X and Y buttons do outside a menu, per scope. */
export const BUTTON_SHORTCUTS: Record<CommandScope, { B: string; X: string; Y: string }> = {
  field: { B: ' ', X: 'Z', Y: 'L' },
  combat: { B: ' ', X: 'Z', Y: 'A' },
  dungeon: { B: ' ', X: 'Z', Y: 'I' },
};

/** Rows of the on-screen keyboard used for typing names and words with a controller. */
export const ON_SCREEN_KEYBOARD = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', "0123456789 '-"];
/** The keyboard's delete and done keys, by the characters that stand for them; drawn as DEL and DONE (OSK_LABELS). */
export const OSK_DELETE = '<';
export const OSK_DONE = '>';
/** Every key of the on-screen keyboard, in order: the letters' rows, then DEL and DONE. */
export const OSK_KEYS = [...ON_SCREEN_KEYBOARD.join(''), OSK_DELETE, OSK_DONE];
/** How the keyboard's delete and done keys read: DONE at the lower right, for a pad with no Y to finish with. */
const OSK_LABELS: Record<string, string> = { [OSK_DELETE]: 'DEL', [OSK_DONE]: 'DONE' };

/** A menu window's state, kept by the Screen and drawn every frame. */
export interface MenuWindow {
  title: string;
  items: string[];
  cursor: number;
  /** First visible item when the list scrolls. */
  top: number;
  /** Cells. */
  x: number;
  y: number;
  width: number;
  visibleRows: number;
  /** For grid menus (the on-screen keyboard): items per row. */
  columns: number;
  /** Optional one-line hint per item, drawn centred under the window. */
  hints?: (string | undefined)[];
  /** Optional colour per item's hint. */
  hintColours?: (string | undefined)[];
  /** Items drawn grey and refused when chosen. */
  disabled?: boolean[];
  /** Optional colour per item. */
  colours?: (string | undefined)[];
  /**
   * A grid's short last row laid across the window, each label whole: its first item at the left, its last at the
   * right (the on-screen keyboard's DEL and DONE). The d-pad goes to the nearer of them from the row above.
   */
  spreadLastRow?: boolean;
}

const MAX_ROWS = 12;
/** The screen's width in cells (Screen's COLUMNS), for a grid too wide for the map area. */
const SCREEN_COLUMNS = 40;

/**
 * Lay out a menu window over the map area (cells 1..22 in both directions).
 * A grid (the on-screen keyboard) gives each column its widest item and the
 * cursor's cell before it, so it can be wider than the map area; it is
 * then centred on the whole screen.
 */
export function layoutMenu(title: string, items: string[], columns = 1): MenuWindow {
  const longestItem = Math.max(0, ...items.map((s) => s.length));
  const rows = Math.ceil(items.length / columns);
  const visibleRows = Math.min(rows, MAX_ROWS);
  const width =
    columns > 1
      ? Math.min(SCREEN_COLUMNS - 2, Math.max(title.length + 4, columns * (longestItem + 1) + 3))
      : Math.min(22, Math.max(8, Math.max(title.length, longestItem) + 4));
  const height = visibleRows + 2;
  const centre = width > 22 ? SCREEN_COLUMNS / 2 : 12;
  return {
    title,
    items,
    cursor: 0,
    top: 0,
    x: Math.max(1, Math.floor(centre - width / 2)),
    y: Math.max(1, Math.floor(12 - height / 2)),
    width,
    visibleRows,
    columns,
  };
}

/** The on-screen keyboard's window: the letters' grid, as wide as its one-letter keys need, then DEL and DONE. */
export function layoutKeyboard(title: string): MenuWindow {
  const menu = layoutMenu(title, OSK_KEYS, ON_SCREEN_KEYBOARD[0].length);
  menu.items = OSK_KEYS.map((k) => OSK_LABELS[k] ?? k);
  menu.spreadLastRow = true;
  return menu;
}

/** Whether a grid's short last row is laid across the window (spreadLastRow), and where that row starts. */
function spreadRow(menu: MenuWindow): number {
  const n = menu.items.length;
  const c = menu.columns;
  return menu.spreadLastRow && c > 1 && n % c !== 0 ? Math.floor(n / c) * c : -1;
}

/** Border pieces in row 0 of the UI sheet (1-based numbers as in `DrawFramePiece`). */
const Piece = { TopLeft: 1, TopRight: 3, BottomLeft: 7, BottomRight: 9, Horizontal: 10, Vertical: 11 };

/** Draw a menu window with the bitmap font and the border tiles. */
export function drawMenu(ctx: CanvasRenderingContext2D, gfx: GraphicsSet, cell: number, menu: MenuWindow): void {
  const { x, y, width } = menu;
  const height = menu.visibleRows + 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(x * cell, y * cell, width * cell, height * cell);
  const piece = (n: number, px: number, py: number) => gfx.drawUiPiece(ctx, n - 1, 0, px * cell, py * cell, cell);
  for (let i = 1; i < width - 1; i++) {
    piece(Piece.Horizontal, x + i, y);
    piece(Piece.Horizontal, x + i, y + height - 1);
  }
  for (let j = 1; j < height - 1; j++) {
    piece(Piece.Vertical, x, y + j);
    piece(Piece.Vertical, x + width - 1, y + j);
  }
  piece(Piece.TopLeft, x, y);
  piece(Piece.TopRight, x + width - 1, y);
  piece(Piece.BottomLeft, x, y + height - 1);
  piece(Piece.BottomRight, x + width - 1, y + height - 1);

  const text = (s: string, tx: number, ty: number) => {
    for (let i = 0; i < s.length; i++) gfx.drawGlyph(ctx, s[i], (tx + i) * cell, ty * cell, cell);
  };
  // Title on the top border.
  const title = menu.title.slice(0, width - 4);
  const tx = x + Math.floor((width - title.length) / 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(tx * cell, y * cell, title.length * cell, cell);
  text(title, tx, y);

  const colWidth = Math.floor((width - 3) / menu.columns);
  const spread = spreadRow(menu);
  for (let row = 0; row < menu.visibleRows; row++) {
    for (let col = 0; col < menu.columns; col++) {
      const index = (menu.top + row) * menu.columns + col;
      if (index >= menu.items.length) continue;
      let px = x + 2 + col * colWidth;
      const py = y + 1 + row;
      let label = menu.items[index].slice(0, menu.columns > 1 ? colWidth - 1 : width - 4);
      if (spread >= 0 && index >= spread) {
        // Laid across: whole labels, the last ending under the grid's last column.
        label = menu.items[index];
        if (index === menu.items.length - 1 && index > spread) px = x + 2 + (menu.columns - 1) * colWidth + 1 - label.length;
      }
      text(label, px, py);
      if (index === menu.cursor) {
        // The cursor is an inverted cell to the left of the item.
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff';
        ctx.fillRect((px - 1) * cell, py * cell, (label.length + 1) * cell, cell);
        ctx.restore();
      }
      const tint = menu.disabled?.[index] ? '#707070' : menu.colours?.[index];
      if (tint) {
        // Tint after the cursor: white glyphs (or the cursor's white bar) take the colour, black stays black.
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tint;
        ctx.fillRect(
          (index === menu.cursor ? px - 1 : px) * cell,
          py * cell,
          (label.length + (index === menu.cursor ? 1 : 0)) * cell,
          cell,
        );
        ctx.restore();
      }
    }
  }
  // Scroll marks.
  if (menu.top > 0) text('^', x + width - 2, y + 1);
  if ((menu.top + menu.visibleRows) * menu.columns < menu.items.length) text('v', x + width - 2, y + height - 2);

  // The highlighted item's hint on the rows under the window, word-wrapped.
  const hint = menu.hints?.[menu.cursor];
  if (menu.hints) {
    ctx.fillStyle = '#000';
    ctx.fillRect(cell, (y + height) * cell, 38 * cell, HINT_ROWS * cell);
    if (hint) {
      const tint = menu.hintColours?.[menu.cursor];
      wrapText(hint, 38, HINT_ROWS).forEach((line, i) => {
        const lx = Math.max(1, 20 - Math.floor(line.length / 2));
        text(line, lx, y + height + i);
        if (!tint) return;
        // As an item's colour: white glyphs take it, black stays black.
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tint;
        ctx.fillRect(lx * cell, (y + height + i) * cell, line.length * cell, cell);
        ctx.restore();
      });
    }
  }
}

/** Rows kept under a menu window for its hint. */
export const HINT_ROWS = 2;

/** Break text into at most `rows` lines of `width` characters, at spaces where possible. */
export function wrapText(s: string, width: number, rows: number): string[] {
  const lines: string[] = [];
  let rest = s.trim();
  while (rest && lines.length < rows) {
    if (rest.length <= width) {
      lines.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', width);
    if (cut <= 0) cut = width;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return lines;
}

/** Move the cursor for a d-pad key and keep it visible. Returns true if the key was a movement. */
export function moveCursor(menu: MenuWindow, key: string): boolean {
  const n = menu.items.length;
  const c = menu.columns;
  let next: number;
  // A last row laid across the window: its first item stands under the first column, its last under the last, and
  // the d-pad goes to whichever is nearer.
  const spread = spreadRow(menu);
  if (spread >= 0 && [Key.Up, Key.Down, Key.Left, Key.Right].includes(key as never)) {
    const inLast = menu.cursor >= spread;
    const colOf = (i: number) => (i < spread ? i % c : i === spread ? 0 : c - 1);
    const nearer = (col: number) => (col < c / 2 ? spread : n - 1);
    if (key === Key.Left || key === Key.Right) next = inLast ? (menu.cursor === spread ? n - 1 : spread) : -1;
    else if (key === Key.Up) next = inLast ? spread - c + colOf(menu.cursor) : menu.cursor < c ? nearer(menu.cursor) : -1;
    else next = inLast ? colOf(menu.cursor) : menu.cursor + c >= spread ? nearer(menu.cursor % c) : -1;
    if (next >= 0) {
      menu.cursor = next;
      const row = Math.floor(next / c);
      if (row < menu.top) menu.top = row;
      if (row >= menu.top + menu.visibleRows) menu.top = row - menu.visibleRows + 1;
      return true;
    }
  }
  switch (key) {
    case Key.Up:
      next = menu.cursor - c;
      if (next < 0) next = menu.cursor + Math.floor((n - 1 - menu.cursor) / c) * c; // wrap to the bottom of the column
      break;
    case Key.Down:
      next = menu.cursor + c;
      // Past the end: into a short last row (the keyboard's < and >) its last item, else wrap to the top of the column.
      if (next >= n) next = Math.floor(menu.cursor / c) < Math.floor((n - 1) / c) ? n - 1 : menu.cursor % c;
      break;
    case Key.Left:
      next = c > 1 ? (menu.cursor % c === 0 ? menu.cursor + c - 1 : menu.cursor - 1) : menu.cursor;
      break;
    case Key.Right:
      next = c > 1 ? (menu.cursor % c === c - 1 ? menu.cursor - c + 1 : menu.cursor + 1) : menu.cursor;
      break;
    default:
      return false;
  }
  menu.cursor = Math.max(0, Math.min(n - 1, next));
  const row = Math.floor(menu.cursor / c);
  if (row < menu.top) menu.top = row;
  if (row >= menu.top + menu.visibleRows) menu.top = row - menu.visibleRows + 1;
  return true;
}

/** What a title-screen menu answers a key with: a footstep as the cursor moves, the attack for a choice, a swing on backing out. */
export const MENU_SOUNDS = { move: Sound.Step, choose: Sound.Attack, back: Sound.Swish[0] } as const;

/** What a key did in a menu window. */
export type MenuAction =
  | { kind: 'move' } // the cursor moved
  | { kind: 'choose'; index: number } // an option was chosen: its index in the whole list
  | { kind: 'refused' } // a disabled option was chosen
  | { kind: 'back' } // the menu was backed out of
  | { kind: 'none' }; // the key did nothing

/**
 * Apply a key to a menu window. A direction moves the cursor (and scrolls
 * the window with it); A or Enter chooses the item at the cursor; B or
 * Escape backs out; a letter chooses the option with that key, shown or
 * hidden, so a keyboard works wherever a menu is shown. A disabled option
 * is refused. `options` is the whole list and `visible` the options the
 * window shows, in its order.
 */
export function applyMenuKey(menu: MenuWindow, options: MenuOption[], visible: MenuOption[], key: string): MenuAction {
  const before = menu.cursor;
  if (moveCursor(menu, key)) return { kind: menu.cursor === before ? 'none' : 'move' };
  if (key === Key.A || key === Key.Enter) {
    const at = visible[menu.cursor];
    if (!at) return { kind: 'back' };
    return at.disabled ? { kind: 'refused' } : { kind: 'choose', index: options.indexOf(at) };
  }
  // Pause backs out too: pressed on the Pause menu itself that resumes, and a menu is never left open behind it.
  if (key === Key.B || key === Key.Escape || key === Key.Pause) return { kind: 'back' };
  const byKey = options.findIndex((o) => o.key === key.toUpperCase());
  if (byKey < 0) return { kind: 'none' };
  return options[byKey].disabled ? { kind: 'refused' } : { kind: 'choose', index: byKey };
}

/** How near its centre a stick axis must come to count as at rest (`GamepadReader`). */
export const STICK_REST = 0.25;

/**
 * Reads gamepads through the Gamepad API and pushes button presses into the
 * keyboard queue as keys. Standard mapping: buttons 0-3 are A, B, X, Y and
 * 12-15 the d-pad; the left stick also steers. A held direction repeats as
 * a held key does (input.ts): after HOLD_FIRST_MS, then at the keyboard's
 * Max input pace, only while the game is waiting for a key, so no presses
 * pile up in the queue, and not at all once a new scene has broken the hold
 * until it is let go; the buttons never repeat.
 *
 * A stick's axis steers only once it has been seen at rest near its centre
 * (the Ultima V port's): some pads report a trigger as an axis resting at
 * -1, and a worn stick drifts, either of which would be a direction held
 * for ever.
 */
export class GamepadReader {
  /** For each pad and key held: when it went down, when it last counted, and whether a new scene has spent it. */
  private held = new Map<string, { since: number; last: number; spent: boolean }>();
  /** The keyboard's `holdBreaks` when last read: a new count spends every direction held. */
  private breaks = 0;
  /** The stick axes seen at rest, by pad and axis: only these steer. */
  private rested = new Set<string>();

  constructor(
    private readonly keyboard: Pick<Keyboard, 'push' | 'waiting'> & Partial<Pick<Keyboard, 'pace' | 'holdBreaks'>>,
    private readonly onActivity: () => void,
    private readonly now: () => number = () => performance.now(),
    private readonly pads: () => (Gamepad | null)[] = () =>
      typeof navigator === 'undefined' || !navigator.getGamepads ? [] : navigator.getGamepads(),
  ) {}

  /** Whether any pad is connected: the screen reads them only while one is (screen.ts `readPads`). */
  connected(): boolean {
    return this.pads().some((pad) => pad !== null);
  }

  /** Call once per animation frame. Returns whether any pad is connected, to go on reading (screen.ts `readPads`). */
  poll(): boolean {
    const t = this.now();
    let any = false;
    const breaks = this.keyboard.holdBreaks ?? 0;
    if (breaks !== this.breaks) {
      this.breaks = breaks;
      for (const was of this.held.values()) was.spent = true;
    }
    const pace = this.keyboard.pace ?? INPUT_PACES.medium;
    for (const pad of this.pads()) {
      if (!pad) continue;
      any = true;
      // An axis, once seen at rest; until then, none.
      const axis = (n: number): number => {
        const value = pad.axes[n] ?? 0;
        const id = `${pad.index}:${pad.id}:${n}`;
        if (Math.abs(value) < STICK_REST) this.rested.add(id);
        return this.rested.has(id) ? value : 0;
      };
      const [x, y] = [axis(0), axis(1)];
      const map: [string, boolean][] = [
        [Key.A, pad.buttons[0]?.pressed ?? false],
        [Key.B, pad.buttons[1]?.pressed ?? false],
        [Key.X, pad.buttons[2]?.pressed ?? false],
        [Key.Y, pad.buttons[3]?.pressed ?? false],
        // The two system buttons either side of the maker's logo (View and Menu on an Xbox pad, Select and Start
        // elsewhere): both pause, as a console's do.
        [Key.Pause, (pad.buttons[8]?.pressed ?? false) || (pad.buttons[9]?.pressed ?? false)],
        [Key.Up, (pad.buttons[12]?.pressed ?? false) || y < -0.5],
        [Key.Down, (pad.buttons[13]?.pressed ?? false) || y > 0.5],
        [Key.Left, (pad.buttons[14]?.pressed ?? false) || x < -0.5],
        [Key.Right, (pad.buttons[15]?.pressed ?? false) || x > 0.5],
      ];
      for (const [key, down] of map) {
        const id = `${pad.index}:${key}`;
        const was = this.held.get(id);
        if (!down) {
          this.held.delete(id);
          continue;
        }
        if (!was) {
          this.held.set(id, { since: t, last: t, spent: false });
          this.keyboard.push(key, 'gamepad');
          this.onActivity();
          continue;
        }
        const repeats = DIRECTION_KEYS.includes(key);
        if (repeats && !was.spent && t - was.since >= HOLD_FIRST_MS && t - was.last >= pace && this.keyboard.waiting) {
          was.last = t;
          this.keyboard.push(key, 'gamepad');
        }
      }
    }
    return any;
  }
}

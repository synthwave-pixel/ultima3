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

import { Key, type CommandScope, type MenuOption } from '../game/io.ts';
import { VIEW_MAP_KEY } from '../game/context.ts';
import { GraphicsSet } from './graphics.ts';
import { Keyboard } from './input.ts';

/** How keyboard keys stand in for the controller when in controller mode. */
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
    case Key.Escape:
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

/** The command menus for each scope: menu label and the letter the game understands. */
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
    { key: 'Q', label: 'Quit and save' },
    { key: ' ', label: 'Pass' },
    { key: 'J', label: 'Journal' },
    { key: VIEW_MAP_KEY, label: 'View map' },
  ],
  combat: [
    { key: 'A', label: 'Attack' },
    { key: 'C', label: 'Cast spell' },
    { key: 'N', label: 'Negate time' },
    { key: 'R', label: 'Ready weapon' },
    { key: 'Z', label: 'Ztats' },
    { key: ' ', label: 'Pass' },
  ],
  dungeon: [
    { key: 'I', label: 'Ignite torch' },
    { key: 'L', label: 'Map off/small/full' },
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
    { key: ' ', label: 'Pass' },
    { key: 'J', label: 'Journal' },
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
export const OSK_DELETE = '←';
export const OSK_DONE = '✓';

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
  /** Items drawn grey and refused when chosen. */
  disabled?: boolean[];
  /** Optional colour per item. */
  colours?: (string | undefined)[];
}

const MAX_ROWS = 12;

/** Lay out a menu window over the map area (cells 1..22 in both directions). */
export function layoutMenu(title: string, items: string[], columns = 1): MenuWindow {
  const longest = Math.max(title.length, ...items.map((s) => s.length));
  const rows = Math.ceil(items.length / columns);
  const visibleRows = Math.min(rows, MAX_ROWS);
  const width = Math.min(22, Math.max(8, columns > 1 ? columns * (longest + 1) + 3 : longest + 4));
  const height = visibleRows + 2;
  return {
    title,
    items,
    cursor: 0,
    top: 0,
    x: Math.max(1, Math.floor(12 - width / 2)),
    y: Math.max(1, Math.floor(12 - height / 2)),
    width,
    visibleRows,
    columns,
  };
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
  for (let row = 0; row < menu.visibleRows; row++) {
    for (let col = 0; col < menu.columns; col++) {
      const index = (menu.top + row) * menu.columns + col;
      if (index >= menu.items.length) continue;
      const px = x + 2 + col * colWidth;
      const py = y + 1 + row;
      const label = menu.items[index].slice(0, menu.columns > 1 ? colWidth - 1 : width - 4);
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
      wrapText(hint, 38, HINT_ROWS).forEach((line, i) => text(line, Math.max(1, 20 - Math.floor(line.length / 2)), y + height + i));
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
  switch (key) {
    case Key.Up:
      next = menu.cursor - c;
      if (next < 0) next = menu.cursor + Math.floor((n - 1 - menu.cursor) / c) * c; // wrap to the bottom of the column
      break;
    case Key.Down:
      next = menu.cursor + c;
      if (next >= n) next = menu.cursor % c;
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

/** A held direction repeats, as a held key does on a keyboard: after this long, then at this rate. */
export const GAMEPAD_REPEAT_FIRST_MS = 250;
export const GAMEPAD_REPEAT_MS = 120;

/**
 * Reads gamepads through the Gamepad API and pushes button presses into the
 * keyboard queue as keys. Standard mapping: buttons 0-3 are A, B, X, Y and
 * 12-15 the d-pad; the left stick also steers. A held direction repeats
 * while the game is waiting for a key, so walking flows at the game's pace
 * and no presses pile up in the queue; the buttons never repeat.
 */
export class GamepadReader {
  /** For each pad and key held: when it went down and when it last counted. */
  private held = new Map<string, { since: number; last: number }>();

  constructor(
    private readonly keyboard: Pick<Keyboard, 'push' | 'waiting'>,
    private readonly onActivity: () => void,
    private readonly now: () => number = () => performance.now(),
    private readonly pads: () => (Gamepad | null)[] = () =>
      typeof navigator === 'undefined' || !navigator.getGamepads ? [] : navigator.getGamepads(),
  ) {}

  /** Call once per animation frame. */
  poll(): void {
    const t = this.now();
    for (const pad of this.pads()) {
      if (!pad) continue;
      const map: [string, boolean][] = [
        [Key.A, pad.buttons[0]?.pressed ?? false],
        [Key.B, pad.buttons[1]?.pressed ?? false],
        [Key.X, pad.buttons[2]?.pressed ?? false],
        [Key.Y, pad.buttons[3]?.pressed ?? false],
        [Key.Up, (pad.buttons[12]?.pressed ?? false) || (pad.axes[1] ?? 0) < -0.5],
        [Key.Down, (pad.buttons[13]?.pressed ?? false) || (pad.axes[1] ?? 0) > 0.5],
        [Key.Left, (pad.buttons[14]?.pressed ?? false) || (pad.axes[0] ?? 0) < -0.5],
        [Key.Right, (pad.buttons[15]?.pressed ?? false) || (pad.axes[0] ?? 0) > 0.5],
      ];
      for (const [key, down] of map) {
        const id = `${pad.index}:${key}`;
        const was = this.held.get(id);
        if (!down) {
          this.held.delete(id);
          continue;
        }
        if (!was) {
          this.held.set(id, { since: t, last: t });
          this.keyboard.push(key);
          this.onActivity();
          continue;
        }
        const repeats = DIRECTION_KEYS.includes(key);
        if (repeats && t - was.since >= GAMEPAD_REPEAT_FIRST_MS && t - was.last >= GAMEPAD_REPEAT_MS && this.keyboard.waiting) {
          was.last = t;
          this.keyboard.push(key);
        }
      }
    }
  }
}

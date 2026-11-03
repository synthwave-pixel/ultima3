import { describe, expect, it } from 'vitest';
import { Key, Sound, type MenuOption } from '../src/game/io.ts';
import {
  applyMenuKey,
  COMMAND_MENUS,
  controllerKeyFor,
  GamepadReader,
  drawMenu,
  layoutMenu,
  MENU_SOUNDS,
  moveCursor,
  ON_SCREEN_KEYBOARD,
  OSK_DELETE,
  OSK_DONE,
  OSK_KEYS,
  layoutKeyboard,
} from '../src/ui/menus.ts';
import { HOLD_FIRST_MS, INPUT_PACES, type InputSource } from '../src/ui/input.ts';

const GAMEPAD_REPEAT_FIRST_MS = HOLD_FIRST_MS;
const GAMEPAD_REPEAT_MS = INPUT_PACES.medium;
import { FONT_GLYPHS, type GraphicsSet } from '../src/ui/graphics.ts';

describe('controller stand-ins on the keyboard', () => {
  it('map WASD to the d-pad and the button row and the pad letters to the buttons', () => {
    expect(['w', 'a', 's', 'd'].map(controllerKeyFor)).toEqual([Key.Up, Key.Left, Key.Down, Key.Right]);
    expect([Key.Enter, 'z', 'Z'].map(controllerKeyFor)).toEqual([Key.A, Key.A, Key.A]);
    expect(['x', 'X', 'b', 'B'].map(controllerKeyFor)).toEqual([Key.B, Key.B, Key.B, Key.B]);
    expect(controllerKeyFor(Key.Escape)).toBe(Key.Escape); // Escape pauses instead of standing in for B
    expect(['c', 'C'].map(controllerKeyFor)).toEqual([Key.X, Key.X]);
    expect(['v', 'V', 'y', 'Y'].map(controllerKeyFor)).toEqual([Key.Y, Key.Y, Key.Y, Key.Y]);
  });

  it('pass every other key through', () => {
    expect(controllerKeyFor(Key.Up)).toBe(Key.Up);
    expect(controllerKeyFor('q')).toBe('q');
    expect(controllerKeyFor(' ')).toBe(' ');
  });
});

describe('the command menus', () => {
  it('leave out what a button or the Pause menu does', () => {
    for (const scope of ['field', 'combat', 'dungeon'] as const) {
      const keys = COMMAND_MENUS[scope].map((o) => o.key);
      expect(keys).not.toContain(' '); // B passes
      expect(keys).not.toContain(Key.Escape); // the system buttons, and Escape, pause
      expect(keys).not.toContain('Q'); // Quit and save is in the Pause menu
      expect(keys).not.toContain('H'); // and so is auto combat
    }
  });
});

describe('gamepad reader', () => {
  const pad = (down: number[], axes: number[] = [0, 0]) =>
    ({ index: 0, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })), axes }) as unknown as Gamepad;
  const setup = () => {
    let t = 0;
    let pads: (Gamepad | null)[] = [];
    const pushed: string[] = [];
    const sources: (string | undefined)[] = [];
    const keyboard = {
      push: (k: string, source?: InputSource) => {
        sources.push(source);
        pushed.push(k);
      },
      waiting: true,
      pace: INPUT_PACES.medium as number,
      holdBreaks: 0,
    };
    const reader = new GamepadReader(
      keyboard,
      () => {},
      () => t,
      () => pads,
    );
    return { reader, pushed, sources, keyboard, hold: (p: (Gamepad | null)[]) => (pads = p), at: (ms: number) => (t = ms) };
  };

  it('presses a button once however long it is held', () => {
    const { reader, pushed, sources, hold, at } = setup();
    hold([pad([0])]);
    for (let ms = 0; ms < 2000; ms += 16) {
      at(ms);
      reader.poll();
    }
    expect(pushed).toEqual([Key.A]);
    expect(sources).toEqual(['gamepad']); // so the Settings menu knows a pad, not a keyboard, is in hand
  });

  it('repeats a held direction after a pause, at the repeat rate, only while the game waits', () => {
    const { reader, pushed, keyboard, hold, at } = setup();
    hold([pad([15])]);
    at(0);
    reader.poll();
    at(GAMEPAD_REPEAT_FIRST_MS - 1);
    reader.poll();
    expect(pushed).toEqual([Key.Right]);
    at(GAMEPAD_REPEAT_FIRST_MS);
    reader.poll();
    expect(pushed).toEqual([Key.Right, Key.Right]);
    at(GAMEPAD_REPEAT_FIRST_MS + GAMEPAD_REPEAT_MS - 1);
    reader.poll();
    expect(pushed).toHaveLength(2);
    keyboard.waiting = false; // the game is busy: nothing piles up
    at(GAMEPAD_REPEAT_FIRST_MS + 2 * GAMEPAD_REPEAT_MS);
    reader.poll();
    expect(pushed).toHaveLength(2);
    keyboard.waiting = true;
    reader.poll();
    expect(pushed).toHaveLength(3);
    hold([pad([])]); // released, then pressed again: a fresh press at once
    reader.poll();
    hold([pad([], [0.9, 0])]);
    reader.poll();
    expect(pushed).toHaveLength(4);
  });

  it('repeats at the Max input pace', () => {
    const { reader, pushed, keyboard, hold, at } = setup();
    keyboard.pace = INPUT_PACES.slow;
    hold([pad([15])]);
    at(0);
    reader.poll();
    at(HOLD_FIRST_MS);
    reader.poll();
    at(HOLD_FIRST_MS + INPUT_PACES.slow - 1);
    reader.poll();
    expect(pushed).toHaveLength(2);
    at(HOLD_FIRST_MS + INPUT_PACES.slow);
    reader.poll();
    expect(pushed).toHaveLength(3);
  });

  it('stops a held direction at a new scene, until it is let go and pressed again', () => {
    const { reader, pushed, keyboard, hold, at } = setup();
    hold([pad([15])]);
    at(0);
    reader.poll();
    keyboard.holdBreaks++; // a fight begins under the held stick
    for (let ms = 16; ms < 2000; ms += 16) {
      at(ms);
      reader.poll();
    }
    expect(pushed).toEqual([Key.Right]);
    hold([pad([])]);
    reader.poll();
    hold([pad([15])]);
    reader.poll();
    expect(pushed).toEqual([Key.Right, Key.Right]);
  });
});

describe('a gamepad stick', () => {
  const pad = (axes: number[]) => ({ index: 0, id: 'pad', buttons: [], axes }) as unknown as Gamepad;

  it('steers only once seen at rest: a trigger resting at -1, or a drifting stick, is not a direction held', () => {
    let pads: (Gamepad | null)[] = [pad([0, -1])]; // axis 1 reads -1 from the start: a trigger, not a stick up
    const pushed: string[] = [];
    const reader = new GamepadReader(
      { push: (k: string) => pushed.push(k), waiting: true },
      () => {},
      () => 0,
      () => pads,
    );
    reader.poll();
    expect(pushed).toEqual([]);
    pads = [pad([0, 0])]; // at rest: from now on it steers
    reader.poll();
    pads = [pad([0, -1])];
    reader.poll();
    expect(pushed).toEqual([Key.Up]);
  });

  it('is read only while a pad is connected', () => {
    let pads: (Gamepad | null)[] = [null, null];
    const reader = new GamepadReader(
      { push: () => {}, waiting: true },
      () => {},
      () => 0,
      () => pads,
    );
    expect(reader.connected()).toBe(false);
    pads = [null, pad([0, 0])];
    expect(reader.connected()).toBe(true);
  });
});

describe('keys in a menu window', () => {
  const options: MenuOption[] = [
    { key: 'J', label: 'Journey onward' },
    { key: 'X', label: 'Hidden', hidden: true },
    { key: 'O', label: 'Organize a party' },
    { key: 'S', label: 'Settings', disabled: true },
  ];
  const setup = () => {
    const visible = options.filter((o) => !o.hidden);
    return {
      menu: layoutMenu(
        'Options',
        visible.map((o) => o.label),
      ),
      visible,
    };
  };

  it('moves the cursor for a direction that changes it, and reports no move for one that does not', () => {
    const { menu, visible } = setup();
    expect(applyMenuKey(menu, options, visible, Key.Down)).toEqual({ kind: 'move' });
    expect(menu.cursor).toBe(1);
    expect(applyMenuKey(menu, options, visible, Key.Left)).toEqual({ kind: 'none' }); // one column: nowhere to go
    expect(menu.cursor).toBe(1);
    expect(applyMenuKey(menu, options, visible, Key.Up)).toEqual({ kind: 'move' });
    expect(applyMenuKey(menu, options, visible, Key.Up)).toEqual({ kind: 'move' }); // wraps to the bottom
    expect(menu.cursor).toBe(2);
  });

  it('chooses the item at the cursor with A or Enter, by its index in the whole list', () => {
    const { menu, visible } = setup();
    applyMenuKey(menu, options, visible, Key.Down);
    expect(applyMenuKey(menu, options, visible, Key.A)).toEqual({ kind: 'choose', index: 2 }); // past the hidden option
    expect(applyMenuKey(menu, options, visible, Key.Enter)).toEqual({ kind: 'choose', index: 2 });
  });

  it('chooses by letter in either case, hidden options included, and refuses disabled ones', () => {
    const { menu, visible } = setup();
    expect(applyMenuKey(menu, options, visible, 'o')).toEqual({ kind: 'choose', index: 2 });
    expect(applyMenuKey(menu, options, visible, 'X')).toEqual({ kind: 'choose', index: 1 });
    expect(applyMenuKey(menu, options, visible, 'S')).toEqual({ kind: 'refused' });
    applyMenuKey(menu, options, visible, Key.Up); // wraps down to Settings
    expect(applyMenuKey(menu, options, visible, Key.A)).toEqual({ kind: 'refused' });
    expect(applyMenuKey(menu, options, visible, 'q')).toEqual({ kind: 'none' });
  });

  it('backs out with B or Escape, and with A on an empty list', () => {
    const { menu, visible } = setup();
    expect(applyMenuKey(menu, options, visible, Key.B)).toEqual({ kind: 'back' });
    expect(applyMenuKey(menu, options, visible, Key.Escape)).toEqual({ kind: 'back' });
    expect(applyMenuKey(layoutMenu('Empty', []), [], [], Key.A)).toEqual({ kind: 'back' });
  });

  it('answers with a footstep, the attack and a swing', () => {
    expect(MENU_SOUNDS).toEqual({ move: Sound.Step, choose: Sound.Attack, back: 'Swish1' });
  });
});

describe('the on-screen keyboard', () => {
  const keys = OSK_KEYS;
  const columns = ON_SCREEN_KEYBOARD[0].length;

  it('draws every key, each with a cell for the cursor before it, and DEL and DONE across the last row', () => {
    const menu = layoutKeyboard('Type');
    const drawn: string[] = [];
    const at: number[] = [];
    const gfx = {
      drawUiPiece: () => {},
      drawGlyph: (_c: unknown, ch: string, x: number) => {
        drawn.push(ch);
        at.push(x / 32);
      },
    } as unknown as GraphicsSet;
    const ctx = { fillRect: () => {}, save: () => {}, restore: () => {} } as unknown as CanvasRenderingContext2D;
    drawMenu(ctx, gfx, 32, menu);
    expect(drawn.join('')).toBe('Type' + ON_SCREEN_KEYBOARD.join('') + 'DEL' + 'DONE');
    const colWidth = Math.floor((menu.width - 3) / columns);
    expect(colWidth).toBe(2); // as wide as its one-letter keys need, DEL and DONE notwithstanding
    // DEL starts under the first column; DONE ends under the last, in the lower-right corner.
    const lastColumn = menu.x + 2 + (columns - 1) * colWidth;
    expect(at[drawn.length - 7]).toBe(menu.x + 2);
    expect(at[drawn.length - 1]).toBe(lastColumn);
  });

  it('reaches DEL and DONE from every column: the nearer of them, and back to the column it stands under', () => {
    const menu = layoutKeyboard('Type');
    const at = (k: string) => keys.indexOf(k);
    const press = (from: string, ...moves: string[]) => {
      menu.cursor = at(from);
      for (const m of moves) expect(moveCursor(menu, m)).toBe(true);
      return keys[menu.cursor];
    };
    expect(press('9', Key.Down)).toBe(OSK_DONE);
    expect(press('0', Key.Down)).toBe(OSK_DELETE);
    expect(press('3', Key.Down)).toBe(OSK_DELETE); // the left half to DEL
    expect(press('-', Key.Down)).toBe(OSK_DONE); // the right half to DONE
    expect(press(OSK_DONE, Key.Up)).toBe('-'); // up from DONE to the last column
    expect(press(OSK_DELETE, Key.Up)).toBe('0');
    expect(press(OSK_DELETE, Key.Right)).toBe(OSK_DONE);
    expect(press(OSK_DONE, Key.Right)).toBe(OSK_DELETE);
    expect(press(OSK_DONE, Key.Left)).toBe(OSK_DELETE);
    expect(press(OSK_DONE, Key.Down)).toBe('M'); // round to the top of its column
    expect(press(OSK_DELETE, Key.Down)).toBe('A');
    expect(press('M', Key.Up)).toBe(OSK_DONE); // and up from the top
    expect(press('A', Key.Up)).toBe(OSK_DELETE);
    expect(press('A', Key.Down)).toBe('N'); // the letters as before
    expect(press('A', Key.Left)).toBe('M');
  });

  it("uses only keys every set's font can draw (its 96 glyphs from space up)", () => {
    for (const k of keys) expect(k.charCodeAt(0) - 0x20, k).toBeGreaterThanOrEqual(0);
    for (const k of keys) expect(k.charCodeAt(0) - 0x20, k).toBeLessThan(FONT_GLYPHS);
  });

  it('is centred on the screen, too wide for the map area, while a list stays over the map', () => {
    const grid = layoutMenu('Type', keys, columns);
    expect(grid.width).toBeGreaterThan(22);
    expect(grid.x).toBe(Math.floor((40 - grid.width) / 2));
    const list = layoutMenu('Options', ['Journey onward', 'Settings']);
    expect(list.x + list.width).toBeLessThanOrEqual(23);
  });
});

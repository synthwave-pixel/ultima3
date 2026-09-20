import { describe, expect, it } from 'vitest';
import { Key, Sound, type MenuOption } from '../src/game/io.ts';
import {
  applyMenuKey,
  controllerKeyFor,
  GamepadReader,
  GAMEPAD_REPEAT_FIRST_MS,
  GAMEPAD_REPEAT_MS,
  layoutMenu,
  MENU_SOUNDS,
} from '../src/ui/menus.ts';
import type { InputSource } from '../src/ui/input.ts';

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

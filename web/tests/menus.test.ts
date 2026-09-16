import { describe, expect, it } from 'vitest';
import { Key } from '../src/game/io.ts';
import { controllerKeyFor, GamepadReader, GAMEPAD_REPEAT_FIRST_MS, GAMEPAD_REPEAT_MS } from '../src/ui/menus.ts';

describe('controller stand-ins on the keyboard', () => {
  it('map WASD to the d-pad and the button row and the pad letters to the buttons', () => {
    expect(['w', 'a', 's', 'd'].map(controllerKeyFor)).toEqual([Key.Up, Key.Left, Key.Down, Key.Right]);
    expect([Key.Enter, 'z', 'Z'].map(controllerKeyFor)).toEqual([Key.A, Key.A, Key.A]);
    expect([Key.Escape, 'x', 'X', 'b', 'B'].map(controllerKeyFor)).toEqual([Key.B, Key.B, Key.B, Key.B, Key.B]);
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
    const keyboard = { push: (k: string) => pushed.push(k), waiting: true };
    const reader = new GamepadReader(
      keyboard,
      () => {},
      () => t,
      () => pads,
    );
    return { reader, pushed, keyboard, hold: (p: (Gamepad | null)[]) => (pads = p), at: (ms: number) => (t = ms) };
  };

  it('presses a button once however long it is held', () => {
    const { reader, pushed, hold, at } = setup();
    hold([pad([0])]);
    for (let ms = 0; ms < 2000; ms += 16) {
      at(ms);
      reader.poll();
    }
    expect(pushed).toEqual([Key.A]);
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

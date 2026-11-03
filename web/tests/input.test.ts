import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Key } from '../src/game/io.ts';
import { HOLD_FIRST_MS, INPUT_PACES, Keyboard, STALE_KEY_MS } from '../src/ui/input.ts';

describe('keyboard queue', () => {
  const setup = () => {
    let t = 0;
    const keyboard = new Keyboard(new EventTarget(), () => t);
    return { keyboard, at: (ms: number) => (t = ms) };
  };

  it('keeps fast type-ahead in order', async () => {
    const { keyboard, at } = setup();
    at(0);
    keyboard.push('a');
    at(100);
    keyboard.push('b');
    at(200);
    expect(await keyboard.nextKey()).toBe('a');
    expect(await keyboard.nextKey()).toBe('b');
  });

  it('drops presses that went stale while the game was busy', async () => {
    const { keyboard, at } = setup();
    at(0);
    keyboard.push('x');
    keyboard.push('y');
    at(STALE_KEY_MS + 50);
    keyboard.push('z');
    at(STALE_KEY_MS + 100);
    expect(await keyboard.nextKey()).toBe('z');
    expect(keyboard.waiting).toBe(false);
  });

  it('keeps a clock that stands still while paused', () => {
    const { keyboard, at } = setup();
    at(1000);
    const start = keyboard.activeTime();
    at(1400);
    keyboard.pause();
    at(9000);
    expect(keyboard.activeTime() - start).toBe(400); // paused: the clock waits
    keyboard.resume();
    at(9100);
    expect(keyboard.activeTime() - start).toBe(500);
  });

  it('remembers what the last press came from, so the menu knows what the player is holding', async () => {
    const target = new EventTarget();
    const keyboard = new Keyboard(target, () => 0);
    expect(keyboard.lastSource).toBe('keyboard');
    keyboard.push(Key.A, 'touch');
    expect(keyboard.lastSource).toBe('touch');
    keyboard.push(Key.Up, 'gamepad');
    expect(keyboard.lastSource).toBe('gamepad');
    keyboard.push(Key.Pause); // the game's own, when a window loses focus: the player's last still stands
    expect(keyboard.lastSource).toBe('gamepad');
    target.dispatchEvent(Object.assign(new Event('keydown'), { key: 'a', repeat: false }));
    expect(keyboard.lastSource).toBe('keyboard');
  });

  it('repeats a held key it is not told to drop, and never one it is', async () => {
    vi.useFakeTimers();
    try {
      const target = new EventTarget();
      const keyboard = new Keyboard(target, () => Date.now());
      keyboard.dropRepeat = (key) => key === 'x'; // x stands in for the B button
      const keydown = (key: string, code: string) =>
        target.dispatchEvent(Object.assign(new Event('keydown'), { key, code, repeat: false }));
      keydown('x', 'KeyX');
      keydown('ArrowUp', 'ArrowUp');
      expect(await keyboard.nextKey()).toBe('x');
      expect(await keyboard.nextKey()).toBe(Key.Up);
      const next = keyboard.nextKey();
      await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS);
      expect(await next).toBe(Key.Up); // a held direction still walks; the held button gave nothing more
      expect(keyboard.waiting).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands a press straight to a waiting game', async () => {
    const { keyboard, at } = setup();
    at(0);
    const next = keyboard.nextKey();
    expect(keyboard.waiting).toBe(true);
    at(5000);
    keyboard.push('q');
    expect(await next).toBe('q');
  });
});

describe('a held key', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const target = new EventTarget();
    const keyboard = new Keyboard(target, () => Date.now());
    const pressed: string[] = [];
    // The game, waiting for key after key, as the field loop does.
    const read = async () => {
      for (;;) pressed.push(await keyboard.nextKey());
    };
    void read();
    const key = (type: 'keydown' | 'keyup', repeat = false) =>
      target.dispatchEvent(Object.assign(new Event(type), { key: 'ArrowRight', code: 'ArrowRight', repeat }));
    return { keyboard, pressed, key };
  };

  it("repeats at the game's pace, not the system's, until let go", async () => {
    const { keyboard, pressed, key } = setup();
    key('keydown');
    await vi.advanceTimersByTimeAsync(0);
    expect(pressed).toEqual([Key.Right]);
    for (let i = 0; i < 20; i++) key('keydown', true); // the system's own repeats count for nothing
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS);
    expect(pressed).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(keyboard.pace * 4);
    expect(pressed).toHaveLength(6);
    key('keyup');
    await vi.advanceTimersByTimeAsync(1000);
    expect(pressed).toHaveLength(6);
  });

  it('repeats at the Max input pace chosen', async () => {
    const { keyboard, pressed, key } = setup();
    keyboard.pace = INPUT_PACES.slow;
    key('keydown');
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS + INPUT_PACES.slow * 5);
    expect(pressed).toHaveLength(1 + 1 + 5);
  });

  it('stops at a new scene, with what was queued, until pressed again', async () => {
    const { keyboard, pressed, key } = setup();
    key('keydown');
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS);
    expect(pressed).toHaveLength(2);
    keyboard.breakHold(); // a fight begins
    key('keydown', true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pressed).toHaveLength(2);
    key('keyup');
    key('keydown');
    await vi.advanceTimersByTimeAsync(0);
    expect(pressed).toHaveLength(3);
  });

  it('does not queue repeats while the game is busy', async () => {
    const target = new EventTarget();
    const keyboard = new Keyboard(target, () => Date.now());
    keyboard.hold('touch', Key.Up, 'touch'); // held, with the game busy: nobody is waiting for a key
    await vi.advanceTimersByTimeAsync(2000);
    expect(keyboard.waiting).toBe(false);
    const next = keyboard.nextKey(); // the game asks: a repeat comes, and only the one
    await vi.advanceTimersByTimeAsync(20);
    expect(await next).toBe(Key.Up);
    keyboard.letGo('touch');
  });
});

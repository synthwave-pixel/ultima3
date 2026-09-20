import { describe, expect, it } from 'vitest';
import { Key } from '../src/game/io.ts';
import { Keyboard, STALE_KEY_MS } from '../src/ui/input.ts';

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

  it('drops the auto-repeat of the keys it is told to, and keeps the rest', async () => {
    const target = new EventTarget();
    const keyboard = new Keyboard(target, () => 0);
    keyboard.dropRepeat = (key) => key === 'x'; // x stands in for the B button
    const keydown = (key: string, repeat: boolean) => target.dispatchEvent(Object.assign(new Event('keydown'), { key, repeat }));
    keydown('x', false);
    keydown('x', true);
    keydown('x', true);
    keydown('ArrowUp', false);
    keydown('ArrowUp', true);
    expect(await keyboard.nextKey()).toBe('x');
    expect(await keyboard.nextKey()).toBe(Key.Up);
    expect(await keyboard.nextKey()).toBe(Key.Up); // a held direction still walks
    expect(keyboard.waiting).toBe(false);
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

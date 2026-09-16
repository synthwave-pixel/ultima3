import { describe, expect, it } from 'vitest';
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

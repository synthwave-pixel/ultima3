import { describe, it, expect } from 'vitest';
import { GamepadReader } from '../src/ui/menus.ts';
import { connectedPads } from '../src/ui/pads.ts';
import { cancelsTouch } from '../src/ui/touch.ts';
import { Key } from '../src/game/io.ts';

const pad = (index: number, down: number[], axes: number[] = [0, 0], id = 'pad') =>
  ({
    index,
    id,
    connected: true,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })),
    axes,
  }) as unknown as Gamepad;

/** An older WebView's GamepadList: a length and indexes, none of an Array's methods. */
const gamepadList = (...pads: (Gamepad | null)[]): ArrayLike<Gamepad | null> => {
  const list: Record<number, Gamepad | null> & { length: number } = { length: pads.length };
  pads.forEach((p, i) => (list[i] = p));
  return list;
};

const reader = (list: () => ArrayLike<Gamepad | null> | null) => {
  const pushed: string[] = [];
  const r = new GamepadReader(
    { push: (k: string) => pushed.push(k), waiting: true },
    () => {},
    () => 0,
    list,
  );
  return { r, pushed };
};

describe('the pads', () => {
  it("are read from an older WebView's GamepadList, which has no Array methods (#24)", () => {
    const { r, pushed } = reader(() => gamepadList(null, pad(1, [0])));
    expect(r.connected()).toBe(true);
    expect(r.poll()).toBe(true);
    expect(pushed).toEqual([Key.A]);
  });

  it('are none where the list is missing, or holds only pads gone', () => {
    expect(connectedPads(null)).toEqual([]);
    expect(connectedPads(gamepadList(null, { ...pad(0, []), connected: false }))).toEqual([]);
    expect(reader(() => null).r.poll()).toBe(false);
  });

  it('are all read as one: a press on a pad listed after another is heard, and a button held on two is one press (#27)', () => {
    let list = gamepadList(pad(0, [], [0, 0], 'remote'), pad(1, [2]));
    const { r, pushed } = reader(() => list);
    r.poll();
    expect(pushed).toEqual([Key.X]);
    list = gamepadList(pad(0, [2], [0, 0], 'remote'), pad(1, [2]));
    r.poll();
    expect(pushed).toEqual([Key.X]);
  });

  it("take the stick pushed furthest, each pad's only once seen at rest", () => {
    // The first pad's axis 1 rests at -1 (a trigger): never "up"; the second's stick is pushed right.
    let list = gamepadList(pad(0, [], [0, -1], 'remote'), pad(1, [], [0, 0]));
    const { r, pushed } = reader(() => list);
    r.poll();
    expect(pushed).toEqual([]);
    list = gamepadList(pad(0, [], [0, -1], 'remote'), pad(1, [], [0.9, 0]));
    r.poll();
    expect(pushed).toEqual([Key.Right]);
  });
});

describe('the touch pad', () => {
  const at = (matches: boolean) => ({ closest: () => (matches ? {} : null) });
  it("lets a tap through to the page's own controls, and cancels the rest (#26)", () => {
    expect(cancelsTouch(at(true))).toBe(false);
    expect(cancelsTouch(at(false))).toBe(true);
    expect(cancelsTouch(null)).toBe(true);
    expect(cancelsTouch({})).toBe(true);
  });
});

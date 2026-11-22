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

describe('the pad played last (#40)', () => {
  /** A reader over `list`, at time `t`, the window's focus as `focus` says. */
  const timed = (list: () => ArrayLike<Gamepad | null>) => {
    const pushed: string[] = [];
    const state = { t: 0, focus: true };
    const r = new GamepadReader(
      { push: (k: string) => pushed.push(k), waiting: true, pace: 100 },
      () => {},
      () => state.t,
      list,
      () => state.focus,
    );
    const run = (from: number, to: number) => {
      for (state.t = from; state.t <= to; state.t += 16) r.poll();
    };
    return { r, pushed, state, run };
  };

  it('is the one read: a pad left frozen with a way held holds nothing once the player presses on another', () => {
    // A Bluetooth pad dropped and listed again: its old place frozen with Up down, the pad in hand at another.
    let list = gamepadList(pad(0, [12]), pad(1, []));
    const { pushed, run } = timed(() => list);
    run(0, 16);
    expect(pushed).toEqual([Key.Up]); // first seen with Up down: taken for played
    list = gamepadList(pad(0, [12]), pad(1, [1])); // B on the pad in hand
    run(32, 2000);
    expect(pushed).toEqual([Key.Up, Key.B]); // and no Up repeating for ever
  });

  it('two ways held go in turn, not the first of them every time', () => {
    const { pushed, run } = timed(() => gamepadList(pad(0, [12, 15])));
    run(0, 1500);
    const repeats = pushed.slice(2);
    expect(pushed.slice(0, 2)).toEqual([Key.Up, Key.Right]);
    expect(repeats.filter((k) => k === Key.Up).length).toBeGreaterThan(2);
    expect(Math.abs(repeats.filter((k) => k === Key.Up).length - repeats.filter((k) => k === Key.Right).length)).toBeLessThanOrEqual(1);
  });

  it('is answered only with the focus, and a button held as it comes back counts once pressed again', () => {
    let list = gamepadList(pad(0, [0]));
    const { pushed, state, run } = timed(() => list);
    state.focus = false;
    run(0, 500);
    expect(pushed).toEqual([]);
    state.focus = true;
    run(516, 1000);
    expect(pushed).toEqual([]); // still the same press
    list = gamepadList(pad(0, []));
    run(1016, 1032);
    list = gamepadList(pad(0, [0]));
    run(1048, 1064);
    expect(pushed).toEqual([Key.A]);
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

/**
 * pads.ts
 *
 * The browser's gamepads, read so that every browser the game runs in gives the same answer: the one place that asks
 * navigator.getGamepads (as the Ultima V port's pads.ts). Today's browsers hand back an Array; older ones - Android's
 * WebView among them - a GamepadList, which has a length and its indexes but none of an Array's methods, so a some() on
 * it threw and the controller did nothing at all (issue #24). Its slots may be null, or hold a pad no longer connected;
 * the call may be missing altogether, or throw where the page is not allowed gamepads. Each of those is no pad, never an
 * error. A pad's buttons and axes are read by index too, for the same reason.
 */

/** What navigator.getGamepads gives: an Array, or an older browser's list with only a length and indexes. */
export type PadList = ArrayLike<Gamepad | null> | null | undefined;

/** The browser's own list of pads, or null where there is none or it may not be asked. */
export function browserPads(): PadList {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null;
  } catch {
    return null; // not allowed here (a permissions policy): no pads
  }
}

/** The connected pads in `list`, in its order, as a plain array. */
export function connectedPads(list: PadList): Gamepad[] {
  const out: Gamepad[] = [];
  for (let i = 0; list && i < list.length; i++) {
    const pad = list[i];
    if (pad && pad.connected !== false) out.push(pad);
  }
  return out;
}

/** Whether a pad's button is down, by index (a missing one is up). */
export function pressed(pad: Gamepad, button: number): boolean {
  return pad.buttons?.[button]?.pressed ?? false;
}

/** A pad's axis, by index (a missing one at its middle). */
export function axis(pad: Gamepad, n: number): number {
  return pad.axes?.[n] ?? 0;
}

/** How near its middle a stick axis must come to count as at rest. */
export const STICK_REST = 0.25;
/** How far from its middle an axis must go to count as played with (the reader's own dead zone: menus.ts). */
const PLAYED = 0.5;

/** A pad in the browser's list: its place there and its name, so another pad in the same place is another. */
const keyOf = (pad: Gamepad, place: number): string => `${typeof pad.index === 'number' ? pad.index : place}:${pad.id}`;

/**
 * The axes of each pad seen at rest, by its place in the browser's list (the Ultima V port's): only these are read.
 * Some pads report a trigger as an axis resting at -1, and a worn stick drifts; either would be a way held for ever.
 */
export class Rest {
  private seen = new Map<string, Set<number>>();

  /** The pad's axes at rest now, noted. */
  note(pad: Gamepad, place: number): void {
    const key = keyOf(pad, place);
    let axes = this.seen.get(key);
    if (!axes) this.seen.set(key, (axes = new Set()));
    for (let i = 0; i < (pad.axes?.length ?? 0); i++) if (Math.abs(axis(pad, i)) < STICK_REST) axes.add(i);
  }

  /** The pad's axis `i`, or 0 until it has been seen at rest. */
  axis(pad: Gamepad, place: number, i: number): number {
    return this.seen.get(keyOf(pad, place))?.has(i) ? axis(pad, i) : 0;
  }
}

/**
 * The pad played last, of those connected (the Ultima V port's, issue #40 there and here): the one whose buttons down,
 * or sticks pushed past half way (once at rest), changed most recently. Every pad was read as one, a button down on
 * any being down - and a pad the browser keeps listing after it stops answering (a Bluetooth pad dropped and listed
 * again in a new place, its old place frozen as it was) held its way for good: a step repeated long after it was let
 * go, and the pad in hand ignored. Now a pad that only sits there - at rest, or frozen - never takes over, while a
 * Steam Deck's own controls and a pad plugged into it, or a TV box's remote listed first, are each read once played.
 * A pad first seen with something down counts as changed; one first seen at rest does not.
 */
export class Played {
  /** What each pad had down when last read, by keyOf. */
  private last = new Map<string, string>();
  /** The pad played last, by keyOf; null till one is. */
  private active: string | null = null;

  constructor(readonly rest = new Rest()) {}

  /** Of `all` (connectedPads, in order), the pad to read and its place: the one played last, or null while none has been. */
  pick(all: Gamepad[]): { pad: Gamepad; place: number } | null {
    const keys = all.map(keyOf);
    let changed: string | null = null;
    let changedDown = false;
    all.forEach((pad, place) => {
      this.rest.note(pad, place);
      const now = this.downOn(pad, place);
      const before = this.last.get(keys[place]) ?? '';
      this.last.set(keys[place], now);
      // Two changed at once: the one with something down now.
      if (now !== before && (changed === null || (!changedDown && now !== ''))) [changed, changedDown] = [keys[place], now !== ''];
    });
    for (const key of [...this.last.keys()]) if (!keys.includes(key)) this.last.delete(key);
    if (changed !== null) this.active = changed;
    const at = this.active === null ? -1 : keys.indexOf(this.active);
    if (at < 0) this.active = null;
    return at < 0 ? null : { pad: all[at], place: at };
  }

  /** What `pad` has down: its buttons, and its sticks' axes pushed past half way, as a string to compare. */
  private downOn(pad: Gamepad, place: number): string {
    const out: string[] = [];
    for (let i = 0; i < (pad.buttons?.length ?? 0); i++) if (pressed(pad, i)) out.push(`b${i}`);
    for (let i = 0; i < (pad.axes?.length ?? 0); i++) {
      const v = this.rest.axis(pad, place, i);
      if (Math.abs(v) > PLAYED) out.push(`a${i}${v < 0 ? '-' : '+'}`);
    }
    return out.join(' ');
  }
}

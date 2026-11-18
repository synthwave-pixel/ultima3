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

/**
 * windowFocus.ts
 *
 * Whether the game's window has the focus, for the gamepad's reader (menus.ts; the Ultima V port's): the browser hands
 * a pad's state to every page it shows, focused or not, so the game in two windows - a browser's and the desktop
 * app's - moved in both at one press. Kept by the window's own blur and focus, and had from the start: a window never
 * told of its focus (a Steam Deck's Game Mode, an Android web view) is not locked out of its pad, as asking
 * document.hasFocus might.
 */

export class FocusWatch {
  focused = true;

  constructor(target: Pick<EventTarget, 'addEventListener'> | undefined) {
    target?.addEventListener('blur', () => (this.focused = false));
    target?.addEventListener('focus', () => (this.focused = true));
  }
}

const watch = new FocusWatch(typeof window !== 'undefined' ? window : undefined);

/** Whether the game's window has the focus now. */
export const windowFocused = (): boolean => watch.focused;

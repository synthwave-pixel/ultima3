/**
 * input.ts
 *
 * Keyboard input as an awaitable queue. The game loop calls `nextKey()`;
 * key presses that arrive while nobody is waiting are queued (up to a small
 * limit) so fast typing is not lost, matching the original's event queue.
 * A queued press goes stale after a moment: presses made while the game was
 * busy for longer than that (a combat starting, an animation, a load) are
 * dropped when it next asks, so they cannot pile up and play out later.
 *
 * Keys are normalised to the single-character codes in `Key` (game/io.ts):
 * arrows map to the Mac arrow codes 28..31; letters keep their case.
 */

import { Key } from '../game/io.ts';

const MAX_QUEUED = 8;
/** A queued press older than this when the game asks for a key is dropped. */
export const STALE_KEY_MS = 300;

export class Keyboard {
  private queue: { key: string; at: number }[] = [];
  private waiter: ((key: string) => void) | null = null;
  /** True while the window has lost focus: idle timers stop, so turns do not pass unattended. */
  paused = false;
  /** The pending timed wait, so it can be stopped and restarted around a pause. */
  private timed: { remaining: number; started: number; timer: ReturnType<typeof setTimeout> | null; fire: () => void } | null = null;
  /** Called when the window loses focus (the game pauses). */
  onPause: (() => void) | null = null;
  /** Called when the window regains focus, with how long it was away (ms). */
  onResume: ((pausedMs: number) => void) | null = null;
  /** Called on every key from any source, the gamepad included (audio is unlocked from here). */
  onInput: (() => void) | null = null;
  /** True while the game is blocked on a key press and none is queued (a driver script can wait on this). */
  get waiting(): boolean {
    return this.waiter !== null && this.queue.length === 0;
  }
  private pausedAt = 0;

  constructor(
    target: EventTarget = window,
    private readonly now: () => number = () => performance.now(),
  ) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => this.pause());
      window.addEventListener('focus', () => this.resume());
      document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.resume()));
    }
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    const t = this.timed;
    if (t && t.timer !== null) {
      clearTimeout(t.timer);
      t.timer = null;
      t.remaining -= performance.now() - t.started;
    }
    this.onPause?.();
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const t = this.timed;
    if (t && t.timer === null) {
      t.started = performance.now();
      t.timer = setTimeout(t.fire, Math.max(0, t.remaining));
    }
    this.onResume?.(performance.now() - this.pausedAt);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Leave browser shortcuts alone.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = translate(e);
    if (key === null) return;
    e.preventDefault();
    this.push(key);
  }

  /** The oldest queued press that is still fresh, dropping any that went stale. */
  private takeQueued(): string | undefined {
    const fresh = this.now() - STALE_KEY_MS;
    while (this.queue.length > 0 && this.queue[0].at < fresh) this.queue.shift();
    return this.queue.shift()?.key;
  }

  /** Resolve with the next key press. */
  nextKey(): Promise<string> {
    const queued = this.takeQueued();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  /** Resolve with the next key press, or `null` after `ms` milliseconds. */
  nextKeyOrTimeout(ms: number): Promise<string | null> {
    const queued = this.takeQueued();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const fire = () => {
        if (this.waiter === waiter) this.waiter = null;
        this.timed = null;
        resolve(null);
      };
      const timed = { remaining: ms, started: performance.now(), timer: null as ReturnType<typeof setTimeout> | null, fire };
      // While paused the timer waits for focus to come back.
      if (!this.paused) timed.timer = setTimeout(fire, ms);
      this.timed = timed;
      const waiter = (key: string) => {
        if (timed.timer !== null) clearTimeout(timed.timer);
        this.timed = null;
        resolve(key);
      };
      this.waiter = waiter;
    });
  }

  /** Drop queued presses (used after "INVALID MOVE!" so a held key does not repeat the bump). */
  flush(): void {
    this.queue.length = 0;
  }

  /** Inject a key from another source, such as a gamepad button. */
  push(key: string): void {
    this.onInput?.();
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(key);
    } else if (this.queue.length < MAX_QUEUED) {
      this.queue.push({ key, at: this.now() });
    }
  }
}

/** Convert a DOM key event to a game key, or null if the game does not use it. */
export function translate(e: KeyboardEvent): string | null {
  switch (e.key) {
    case 'ArrowLeft':
      return Key.Left;
    case 'ArrowRight':
      return Key.Right;
    case 'ArrowUp':
      return Key.Up;
    case 'ArrowDown':
      return Key.Down;
    case 'Enter':
      return Key.Enter;
    case 'Backspace':
      return Key.Backspace;
    case 'Escape':
      return Key.Escape;
    default:
      break;
  }
  // Letters keep their case; game code upper-cases commands itself, so
  // names typed at the character creation screen keep mixed case.
  if (e.key.length === 1) return e.key;
  return null;
}

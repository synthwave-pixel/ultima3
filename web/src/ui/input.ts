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
 * A key held down repeats at the game's own pace, not the system's: the
 * Max input setting's (`INPUT_PACES`), the same for a keyboard, a gamepad
 * (menus.ts) and the touch pad, and only while the game is waiting for a
 * key, so no repeats queue up. A new scene (a fight beginning or ending, a
 * town or dungeon entered or left, a moongate) breaks every hold
 * (`breakHold`): a key still down there does nothing until it is let go and
 * pressed again, so a run across the map does not walk on into the fight.
 *
 * Keys are normalised to the single-character codes in `Key` (game/io.ts):
 * arrows map to the Mac arrow codes 28..31; letters keep their case.
 */

import { Key } from '../game/io.ts';

const MAX_QUEUED = 8;
/** A queued press older than this when the game asks for a key is dropped. */
export const STALE_KEY_MS = 300;

/** Max input (Gameplay): the least time between two repeats of a held key, ms. Separate presses are never held back. */
export const INPUT_PACES = { verySlow: 250, slow: 200, medium: 150, fast: 130 } as const;
export type InputPace = keyof typeof INPUT_PACES;
export const INPUT_PACE_NAMES = Object.keys(INPUT_PACES) as InputPace[];
/** How the Gameplay menu shows each pace: "V slow" fits the window where "Very slow" would not. */
export const INPUT_PACE_LABELS: Record<InputPace, string> = { verySlow: 'V slow', slow: 'Slow', medium: 'Medium', fast: 'Fast' };
/** A held key's first repeat comes after this long (a gamepad's and the touch pad's too). */
export const HOLD_FIRST_MS = 250;
/** How soon a held key looks again when the game was busy at its repeat: it repeats once the game waits. */
const HOLD_RECHECK_MS = 16;

/** A key held down, repeating (`Keyboard.hold`). */
interface Hold {
  key: string;
  source: InputSource;
  /** When it last counted: its press, or its last repeat. */
  last: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** What holds the game paused: the window is not focused, or the Pause menu is open. */
export type PauseReason = 'focus' | 'menu';

/** Where a press came from: a real keyboard, a gamepad, or the on-screen pad. */
export type InputSource = 'keyboard' | 'gamepad' | 'touch';

export class Keyboard {
  private queue: { key: string; at: number }[] = [];
  private waiter: ((key: string) => void) | null = null;
  /**
   * True while the game is paused: idle timers stop, so turns do not pass
   * unattended. Two things pause it (see `PauseReason`), and it runs again
   * only when both have let go: a window that regains focus while the Pause
   * menu is open leaves the game paused, as the menu is still up.
   */
  get paused(): boolean {
    return this.holds.size > 0;
  }
  private readonly holds = new Set<PauseReason>();
  /** Whether `reason` is holding the game: the window away (focus), or the Pause menu open (menu). */
  held(reason: PauseReason): boolean {
    return this.holds.has(reason);
  }
  /** When the last key came, from any source (`now`'s clock): Battery saver rests the map a minute after it. */
  lastInputAt = 0;
  /** Called on every key, after `onInput`: the screen wakes its frames (screen.ts `wake`). */
  onKey: (() => void) | null = null;
  /** The pending timed wait, so it can be stopped and restarted around a pause. */
  private timed: { remaining: number; started: number; timer: ReturnType<typeof setTimeout> | null; fire: () => void } | null = null;
  /** Called when the game pauses, with what paused it. */
  onPause: ((reason: PauseReason) => void) | null = null;
  /** Called when the game runs again, with how long it was paused (ms). */
  onResume: ((pausedMs: number) => void) | null = null;
  /** Called on every key from any source, the gamepad included (audio is unlocked from here). */
  onInput: (() => void) | null = null;
  /** Whether a held key's auto-repeat is dropped (a key standing in for a controller button, which never repeats). */
  dropRepeat: ((key: string) => boolean) | null = null;
  /**
   * Where the last press came from. What the player is holding decides what
   * the Settings menu offers: only someone pressing real keys is shown the
   * switch between keyboard and controller mode, since choosing keyboard
   * mode with a thumb would leave a touch screen with no way back.
   */
  lastSource: InputSource = 'keyboard';
  /** True while the game is blocked on a key press and none is queued (a driver script can wait on this). */
  get waiting(): boolean {
    return this.waiter !== null && this.queue.length === 0;
  }
  private pausedAt = 0;
  /** Time spent paused before the current pause, ms. */
  private pausedFor = 0;
  /** Max input: the least time between a held key's repeats (`INPUT_PACES`). */
  pace: number = INPUT_PACES.medium;
  /** Counts the holds broken (`breakHold`), so a gamepad's reader can tell its own held directions are spent. */
  holdBreaks = 0;
  /** Keys held down and repeating, by what holds them: a keyboard's key code, or the touch pad. */
  private keysHeld = new Map<string, Hold>();

  constructor(
    target: EventTarget = window,
    private readonly now: () => number = () => performance.now(),
  ) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    target.addEventListener('keyup', (e) => this.letGo(`key:${(e as KeyboardEvent).code}`));
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => this.pause('focus'));
      window.addEventListener('focus', () => this.resume('focus'));
      document.addEventListener('visibilitychange', () => (document.hidden ? this.pause('focus') : this.resume('focus')));
    }
  }

  /** Pause the game: the window lost focus (blur, or the page hidden), or the Pause menu opened. */
  pause(reason: PauseReason = 'focus'): void {
    if (reason === 'focus') for (const id of [...this.keysHeld.keys()]) this.letGo(id); // their key-ups go elsewhere
    if (this.holds.has(reason)) return;
    const first = !this.paused;
    this.holds.add(reason);
    if (!first) return;
    this.pausedAt = this.now();
    const t = this.timed;
    if (t && t.timer !== null) {
      clearTimeout(t.timer);
      t.timer = null;
      t.remaining -= this.now() - t.started;
    }
    this.onPause?.(reason);
  }

  /** Let go of one hold: the game runs again once nothing holds it, with the idle timers' remaining time. */
  resume(reason: PauseReason = 'focus'): void {
    if (!this.holds.delete(reason) || this.paused) return;
    const t = this.timed;
    if (t && t.timer === null) {
      t.started = this.now();
      t.timer = setTimeout(t.fire, Math.max(0, t.remaining));
    }
    const away = this.now() - this.pausedAt;
    this.pausedFor += away;
    this.onResume?.(away);
  }

  /**
   * A clock (ms) that stands still while paused, as the timed waits do, so
   * the time between two readings is how long the player had: what is left
   * of a timed wait that a key cut short can be carried into the next one.
   */
  activeTime(): number {
    const now = this.now();
    return now - this.pausedFor - (this.paused ? now - this.pausedAt : 0);
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Leave browser shortcuts alone.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = translate(e);
    if (key === null) return;
    e.preventDefault();
    if (e.repeat) return; // the system's repeats: a held key repeats at the game's pace instead (`hold`)
    this.push(key, 'keyboard');
    if (!this.dropRepeat?.(key)) this.hold(`key:${e.code}`, key, 'keyboard');
  }

  /**
   * `key`, just pressed, is held down by `id` (a keyboard's key, the touch pad): it repeats, the first time after
   * HOLD_FIRST_MS and then every `pace`, each only when the game is waiting for a key, until `letGo` or `breakHold`.
   */
  hold(id: string, key: string, source: InputSource): void {
    this.letGo(id);
    const hold: Hold = { key, source, last: this.now(), timer: null };
    this.keysHeld.set(id, hold);
    const look = (ms: number) => (hold.timer = setTimeout(tick, ms));
    const tick = () => {
      const due = hold.last + this.pace - this.now();
      if (due > 0) return look(due);
      if (!this.waiting) return look(HOLD_RECHECK_MS);
      hold.last = this.now();
      this.push(key, source);
      look(this.pace);
    };
    look(HOLD_FIRST_MS);
  }

  /** What `id` held is let go: it repeats no more. */
  letGo(id: string): void {
    const hold = this.keysHeld.get(id);
    if (!hold) return;
    if (hold.timer !== null) clearTimeout(hold.timer);
    this.keysHeld.delete(id);
  }

  /**
   * A new scene: whatever is held down stops repeating, and must be let go and pressed again to count; presses
   * waiting in the queue are dropped. A gamepad's held directions stop too (menus.ts, by `holdBreaks`).
   */
  breakHold(): void {
    for (const id of [...this.keysHeld.keys()]) this.letGo(id);
    this.holdBreaks++;
    this.flush();
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

  /**
   * Inject a key from another source, such as a gamepad button. Without a
   * `source` the last one stands, for a key the game gives itself (the
   * Pause a lost focus asks for) rather than one the player pressed.
   */
  push(key: string, source?: InputSource): void {
    if (source) this.lastSource = source;
    this.lastInputAt = this.now();
    this.onInput?.();
    this.onKey?.();
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

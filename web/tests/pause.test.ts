import { describe, expect, it } from 'vitest';
import { Key } from '../src/game/io.ts';
import { Keyboard, type PauseReason } from '../src/ui/input.ts';
import { applyMenuKey, layoutMenu, GamepadReader } from '../src/ui/menus.ts';
import { newWorld, FakeIO } from './helpers.ts';
import { holdCombatMark, type CombatState } from '../src/game/world.ts';
import { Game } from '../src/game/game.ts';

describe('what holds the game paused', () => {
  const setup = () => {
    let t = 0;
    const keyboard = new Keyboard(new EventTarget(), () => t);
    const paused: PauseReason[] = [];
    const resumed: number[] = [];
    keyboard.onPause = (reason) => paused.push(reason);
    keyboard.onResume = (ms) => resumed.push(ms);
    return { keyboard, paused, resumed, at: (ms: number) => (t = ms) };
  };

  it('tells what paused it, and pauses once however many hold it', () => {
    const { keyboard, paused, at } = setup();
    at(100);
    keyboard.pause('focus');
    keyboard.pause('menu');
    expect(paused).toEqual(['focus']); // the second hold is not a second pause
    expect(keyboard.paused).toBe(true);
  });

  it('keeps the game paused while the Pause menu is open, though the window has focus again', () => {
    const { keyboard, resumed, at } = setup();
    at(0);
    keyboard.pause('focus'); // the window went away
    keyboard.pause('menu'); // and the menu it asked for opened
    at(5000);
    keyboard.resume('focus'); // focus came back: the menu is still up
    expect(keyboard.paused).toBe(true);
    expect(resumed).toEqual([]);
    keyboard.resume('menu'); // the player chose Resume
    expect(keyboard.paused).toBe(false);
    expect(resumed).toEqual([5000]); // the whole pause, so a combat turn gets it all back
  });

  it('stops the clock and the idle timer for the length of a pause', async () => {
    const { keyboard, at } = setup();
    at(1000);
    const start = keyboard.activeTime();
    const waited = keyboard.nextKeyOrTimeout(50);
    at(1200);
    keyboard.pause('menu');
    at(9000);
    expect(keyboard.activeTime() - start).toBe(200); // the pause does not count against the turn
    keyboard.resume('menu');
    keyboard.push('a');
    expect(await waited).toBe('a'); // the wait outlived the pause instead of timing out
  });

  it('resumes only what paused it, and ignores a hold let go twice', () => {
    const { keyboard } = setup();
    keyboard.pause('menu');
    keyboard.resume('focus'); // never held
    expect(keyboard.paused).toBe(true);
    keyboard.resume('menu');
    keyboard.resume('menu');
    expect(keyboard.paused).toBe(false);
  });
});

describe('a combat turn under a pause', () => {
  const turn = (markedFor: number) => ({ markedAt: 1000, markedFor, markedFrozenAt: 0 }) as CombatState;

  it('stops the outline where it is and gives the whole pause back', () => {
    const c = turn(10_000);
    let now = 4000; // 3 s of the turn gone
    const release = holdCombatMark(c, () => now);
    expect(c.markedFrozenAt).toBe(4000);
    now = 24_000; // 20 s paused
    release();
    expect(c.markedFrozenAt).toBe(0);
    expect(now - c.markedAt).toBe(3000); // still 3 s gone, so 7 s left as before
  });

  it('leaves a turn with no countdown, or one the command menu froze, alone', () => {
    const steady = turn(0);
    holdCombatMark(steady, () => 5000)();
    expect(steady).toEqual({ markedAt: 1000, markedFor: 0, markedFrozenAt: 0 });

    const frozen = { markedAt: 1000, markedFor: 10_000, markedFrozenAt: 2000 } as CombatState;
    holdCombatMark(frozen, () => 5000)();
    expect(frozen.markedFrozenAt).toBe(2000); // the menu that froze it still owns it
    expect(frozen.markedAt).toBe(1000);
  });

  it('does nothing out of combat', () => {
    expect(() => holdCombatMark(null, () => 0)()).not.toThrow();
  });
});

describe('the buttons that pause', () => {
  const pad = (down: number[]) =>
    ({ index: 0, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })), axes: [0, 0] }) as unknown as Gamepad;

  const press = (button: number): string[] => {
    const pushed: string[] = [];
    const keyboard = { push: (k: string) => pushed.push(k), waiting: true };
    const reader = new GamepadReader(
      keyboard,
      () => {},
      () => 0,
      () => [pad([button])],
    );
    reader.poll();
    return pushed;
  };

  it('are the two system buttons either side of the logo', () => {
    expect(press(8)).toEqual([Key.Pause]); // View, Back or Select
    expect(press(9)).toEqual([Key.Pause]); // Menu or Start
    expect(press(0)).toEqual([Key.A]); // the face buttons are unchanged
  });

  it('back out of a menu, so the Pause menu closes on the button that opened it', () => {
    const menu = layoutMenu('Paused', ['Resume', 'Input', 'Back']);
    const options = [
      { key: 'E', label: 'Resume' },
      { key: 'I', label: 'Input' },
      { key: 'B', label: 'Back' },
    ];
    expect(applyMenuKey(menu, options, options, Key.Pause)).toEqual({ kind: 'back' });
  });
});

describe('pausing from the field', () => {
  /** Run the field loop on the keys, then Q to end it, and report what the pause and the party did. */
  const play = async (keys: string[]) => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.keys.push(...keys, 'Q');
    const moves = world.party.moves;
    await new Game(world, io).run();
    return { paused: io.paused, moves: world.party.moves - moves, world, io };
  };

  it('opens the Pause menu on Escape and on the system buttons, and spends no turn', async () => {
    expect(await play([Key.Escape]).then((r) => [r.paused, r.moves])).toEqual([1, 0]);
    expect(await play([Key.Pause]).then((r) => [r.paused, r.moves])).toEqual([1, 0]);
  });

  it('carries out Quit and save when the menu asks for it', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.pauseAnswer = 'Q'; // the player chose Quit and save in the Pause menu
    io.keys.push(Key.Pause);
    await new Game(world, io).run();
    expect(io.output).toContain('Quit'); // the game saved and ended without another key
  });
});

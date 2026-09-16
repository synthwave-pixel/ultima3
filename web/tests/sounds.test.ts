import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sound } from '../src/game/io.ts';
import { SoundPlayer, SOUND_SETS, fileFor } from '../src/ui/sound.ts';
import { EFFECTS } from '../tools/chip-sfx.ts';

const soundNames = Object.values(Sound).flat() as string[];

describe('the Standard effect set', () => {
  it('renders every file the game asks the set for, and nothing else', () => {
    const files = [...new Set(soundNames.map((n) => fileFor('Standard', n)))].sort();
    expect(Object.keys(EFFECTS).sort()).toEqual(files);
    expect(files).toContain('Swish');
    expect(files).not.toContain('Swish1');
    expect(fileFor('Lairware', 'Swish3')).toBe('Swish3');
  });

  it('keeps the repeated effects quieter than the jingles', () => {
    const level = (n: string) => EFFECTS[n][0];
    for (const quiet of ['Step', 'HorseWalk', 'Bump', 'Error1']) expect(level(quiet)).toBeLessThan(level('CombatStart'));
    for (const [, [db]] of Object.entries(EFFECTS)) expect(db).toBeLessThanOrEqual(-9);
  });
});

/** A stand-in AudioContext: records what starts, with a settable clock. */
function fakeAudio() {
  const started: { name: string; gain: number; rate: number }[] = [];
  const durations: Record<string, number> = {};
  const ctx = {
    currentTime: 0,
    state: 'running',
    resume: () => Promise.resolve(),
    decodeAudioData: (data: ArrayBuffer) =>
      Promise.resolve({ duration: durations[new TextDecoder().decode(data)] ?? 0.1, name: new TextDecoder().decode(data) }),
    createBufferSource: () => {
      const s = {
        buffer: null as { name: string } | null,
        gain: 1,
        playbackRate: { value: 1 },
        connect: (g: { value: number }) => (s.gain = g.value),
        start: () => started.push({ name: s.buffer!.name, gain: s.gain, rate: s.playbackRate.value }),
      };
      return s;
    },
    createGain: () => {
      const g = { value: 1, gain: { value: 1 }, connect: () => {} };
      Object.defineProperty(g, 'value', { get: () => g.gain.value });
      return g;
    },
    destination: {},
  };
  vi.stubGlobal('AudioContext', function () {
    return ctx;
  });
  // fetch answers with the requested path as the "audio data", so decode can name the buffer.
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) }),
  );
  return { ctx, started, durations };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('sound player', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has both sets', () => {
    expect(SOUND_SETS).toEqual(['Standard', 'Lairware']);
  });

  it('plays from the chosen set with its gain, and does not restart the same effect within a moment', async () => {
    const { started } = fakeAudio();
    let t = 0;
    const p = new SoundPlayer('sounds/', () => t);
    p.unlock();
    p.play('Step');
    p.play('Step'); // too soon
    t = 100;
    p.play('Step');
    p.set = 'Lairware';
    t = 200;
    p.play('Step');
    await tick();
    await tick();
    expect(started.map((s) => s.name)).toEqual(['sounds/standard/Step.wav', 'sounds/standard/Step.wav', 'sounds/Step.wav']);
    expect(started[0].gain).toBe(1);
    expect(started[2].gain).toBeCloseTo(Math.pow(10, -9 / 20), 5);
  });

  it('detunes the repeated Standard effects a little each play, and never the Lairware set', async () => {
    const { started } = fakeAudio();
    let t = 0;
    const rolls = [0, 1, 0.5, 0];
    const p = new SoundPlayer(
      'sounds/',
      () => t,
      () => rolls.shift() ?? 0.5,
    );
    p.unlock();
    p.play('Hit'); // roll 0: a semitone down
    t = 100;
    p.play('Hit'); // roll 1: a semitone up
    t = 200;
    p.play('CombatStart'); // a jingle: as rendered
    p.set = 'Lairware';
    t = 300;
    p.play('Hit'); // as recorded
    await tick();
    await tick();
    expect(started.map((s) => s.rate.toFixed(4))).toEqual([
      Math.pow(2, -1 / 12).toFixed(4),
      Math.pow(2, 1 / 12).toFixed(4),
      '1.0000',
      '1.0000',
    ]);
  });

  it('does not restart a long effect while it sounds, and ducks the music under it', async () => {
    const { ctx, started, durations } = fakeAudio();
    durations['sounds/standard/CombatStart.wav'] = 2;
    let t = 0;
    const p = new SoundPlayer('sounds/', () => t);
    const ducks: number[] = [];
    p.onLong = (s) => ducks.push(s);
    p.unlock();
    p.play('CombatStart');
    await tick();
    await tick();
    t = 500;
    ctx.currentTime = 0.5;
    p.play('CombatStart'); // still sounding
    await tick();
    await tick();
    ctx.currentTime = 2.5;
    t = 2500;
    p.play('CombatStart'); // over: plays again
    await tick();
    await tick();
    expect(started).toHaveLength(2);
    expect(ducks).toEqual([2, 2]);
  });
});

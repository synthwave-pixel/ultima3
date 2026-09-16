import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuickTimeMusic, MusicPlayer } from '../src/ui/music.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadSong(name: string): ArrayBuffer {
  const buf = readFileSync(join(HERE, '..', '..', 'Resources', 'Music', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('QuickTime music parser', () => {
  it('decodes the notes of the Sosaria theme', () => {
    const tune = parseQuickTimeMusic(loadSong('Song_1.mov'));
    expect(tune.notes.length).toBeGreaterThan(100);
    // The first note: C3 for one second at volume 64, after a 425-unit rest.
    const first = tune.notes[0];
    expect(first.pitch).toBe(48);
    expect(first.volume).toBe(64);
    expect(first.duration).toBeCloseTo(1, 3);
    expect(first.time).toBeCloseTo(425 / 600, 3);
    // Notes are in time order and the tune has a sensible length.
    for (let i = 1; i < tune.notes.length; i++) expect(tune.notes[i].time).toBeGreaterThanOrEqual(tune.notes[i - 1].time);
    expect(tune.length).toBeGreaterThan(30);
    expect(tune.length).toBeLessThan(300);
    // The one extended (long) note in this tune: G3 held for 5097 units.
    const long = tune.notes.find((n) => n.duration > 5);
    expect(long?.pitch).toBe(55);
    expect(long?.duration).toBeCloseTo(5097 / 600, 3);
  });

  it('decodes every shipped song', () => {
    for (const file of [
      'Song_1.mov',
      'Song_2.mov',
      'Song_3.mov',
      'Song_4.mov',
      'Song_5.mov',
      'Song_6.mov',
      'Song_7.mov',
      'Song_8.mov',
      'Song_A.mov',
      'Song_B.mov',
    ]) {
      const tune = parseQuickTimeMusic(loadSong(file));
      expect(tune.notes.length, file).toBeGreaterThan(10);
      expect(
        tune.notes.every((n) => n.volume > 0 && n.volume <= 127),
        file,
      ).toBe(true);
      for (const n of tune.notes) {
        expect(n.pitch, file).toBeGreaterThan(20);
        expect(n.pitch, file).toBeLessThan(110);
      }
    }
  });
});

describe('the music player', () => {
  /** A stand-in AudioContext: the player only needs a gain node and a state. */
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    static last: FakeContext | null = null;
    constructor() {
      FakeContext.last = this;
    }
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }

  async function player(): Promise<MusicPlayer> {
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeContext;
    (globalThis as { fetch?: unknown }).fetch = () => Promise.reject(new Error('no files in tests'));
    return new MusicPlayer();
  }

  it('stays silent while off, whatever the game asks for, and resumes the wanted track when turned on', async () => {
    const m = await player();
    m.enabled = false;
    m.play(1); // Sosaria, asked for while music is off
    m.unlock(); // the first key press
    expect(m.active).toBe(0); // off means off, even after the unlock
    m.enabled = true;
    expect(m.active).toBe(1); // on resumes the track the game wanted
    m.enabled = false;
    expect(m.active).toBe(0);
  });

  it('holds the audio clock while the game is paused, and a key during the pause does not restart it', async () => {
    const m = await player();
    m.play(1);
    m.unlock();
    const ctx = FakeContext.last!;
    expect(ctx.state).toBe('running');
    m.pause();
    expect(ctx.state).toBe('suspended');
    m.unlock(); // a gamepad press while the window is unfocused
    expect(ctx.state).toBe('suspended');
    m.resume();
    expect(ctx.state).toBe('running');
    expect(m.active).toBe(1); // the same tune, from where it stopped
  });

  it('waits for the unlock, then follows the track the game wants', async () => {
    const m = await player();
    m.play(2);
    expect(m.active).toBe(0); // no audio before a user gesture
    m.unlock();
    expect(m.active).toBe(2);
    m.play(2);
    expect(m.active).toBe(2); // asking again changes nothing
    m.play(5);
    expect(m.active).toBe(5);
    m.play(0);
    expect(m.active).toBe(0);
  });
});

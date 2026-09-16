// Renders the Standard sound effects: chip-tune voices (pulse, triangle and
// noise, as an 8-bit console had) with short envelopes and sweeps, one WAV
// per effect the game knows, balanced for repetition. `npm run sfx` writes
// them to public/sounds/standard/ at 44.1 kHz, 16-bit mono.
//
// Levels are peaks in dBFS: the effects a turn repeats (steps, bumps, the
// error blip) sit far below the one-off jingles, and nothing clips. The
// repeated effects are also shaped for repetition: energy kept under
// 500 Hz, noise low-passed, and a percussive envelope that is 20 dB down
// within a few dozen milliseconds (the recipe of every game's most-played
// footstep), so the average energy the ear accumulates stays small.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;
type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'saw';
type Curve = (t: number) => number;

/** A pulse, triangle or saw tone. `freq` and `env` are functions of time in seconds. */
function tone(dur: number, freq: Curve | number, wave: Wave, env: Curve): Float32Array {
  const n = Math.round(dur * RATE);
  const out = new Float32Array(n);
  const f = typeof freq === 'number' ? () => freq : freq;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase = (phase + f(t) / RATE) % 1;
    let v: number;
    switch (wave) {
      case 'p12':
        v = phase < 0.125 ? 1 : -1;
        break;
      case 'p25':
        v = phase < 0.25 ? 1 : -1;
        break;
      case 'p50':
        v = phase < 0.5 ? 1 : -1;
        break;
      case 'tri':
        v = 4 * Math.abs(phase - 0.5) - 1;
        break;
      case 'saw':
        v = 2 * phase - 1;
        break;
    }
    out[i] = v * env(t);
  }
  return out;
}

/** Console noise: a shift register sampled at `rate` Hz (a function of time), so it can sweep from hiss to rumble. */
function noise(dur: number, rate: Curve | number, env: Curve, seed = 0x7fff): Float32Array {
  const n = Math.round(dur * RATE);
  const out = new Float32Array(n);
  const r = typeof rate === 'number' ? () => rate : rate;
  let lfsr = seed;
  let acc = 0;
  let v = 1;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    acc += r(t) / RATE;
    while (acc >= 1) {
      acc -= 1;
      const bit = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      v = lfsr & 1 ? 1 : -1;
    }
    out[i] = v * env(t);
  }
  return out;
}

/** Silence. */
const rest = (dur: number) => new Float32Array(Math.round(dur * RATE));

/** Sum of layers, each optionally delayed. */
function mix(...layers: (Float32Array | [Float32Array, number])[]): Float32Array {
  let len = 0;
  const parts = layers.map((l) => (Array.isArray(l) ? l : ([l, 0] as [Float32Array, number])));
  for (const [buf, at] of parts) len = Math.max(len, Math.round(at * RATE) + buf.length);
  const out = new Float32Array(len);
  for (const [buf, at] of parts) {
    const off = Math.round(at * RATE);
    for (let i = 0; i < buf.length; i++) out[off + i] += buf[i];
  }
  return out;
}

/** One after another. */
const seq = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

// Envelopes and curves.
/** Attack then exponential decay to `floor` of the peak over `dur`. */
const ad =
  (attack: number, dur: number, floor = 0.001): Curve =>
  (t) =>
    t < attack ? t / attack : Math.pow(floor, (t - attack) / Math.max(0.001, dur - attack));
/** Flat with a short fade at both ends. */
const hold =
  (dur: number, edge = 0.008): Curve =>
  (t) =>
    Math.max(0, Math.min(1, t / edge, (dur - t) / edge));
/** Exponential glide from `a` to `b` over `dur`. */
const glide =
  (a: number, b: number, dur: number): Curve =>
  (t) =>
    a * Math.pow(b / a, Math.min(1, t / dur));
/** Vibrato around `f`. */
const vib =
  (f: number, depth: number, hz: number): Curve =>
  (t) =>
    f * (1 + depth * Math.sin(2 * Math.PI * hz * t));

/**
 * A percussive envelope in the shape of a well-worn game thud: instant
 * attack, 20 dB down within `fast` seconds, then a quiet tail that fades
 * over the rest of `dur`. Most of the sound's energy is over in the first
 * few dozen milliseconds, so it reads as an event without wearing on the ear.
 */
const perc =
  (fast: number, dur: number, tail = 0.08): Curve =>
  (t) =>
    t < 0.001 ? t / 0.001 : Math.max(Math.pow(0.1, t / fast), tail * Math.pow(0.001, t / dur)) * (t < dur ? 1 : 0);
/** One-pole low-pass at `hz`: takes the edge off noise and pulse layers. */
function lowpass(buf: Float32Array, hz: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
  const out = new Float32Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += k * (buf[i] - y);
    out[i] = y;
  }
  return out;
}

/** A note of the given MIDI number. */
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
/** A run of notes: MIDI numbers, each `step` long with a plucked envelope. */
const run = (notes: number[], step: number, wave: Wave = 'p25', sustain = 0.9) =>
  seq(...notes.map((n) => tone(step, midi(n), wave, ad(0.004, step * sustain))));
/** Notes sounding together (a chord), each with the same envelope. */
const chord = (notes: number[], dur: number, wave: Wave, env: Curve) => {
  const out = mix(...notes.map((n) => tone(dur, midi(n), wave, env)));
  for (let i = 0; i < out.length; i++) out[i] /= notes.length;
  return out;
};

/** Scale to a peak of `db` dBFS. */
function peak(buf: Float32Array, db: number): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? Math.pow(10, db / 20) / max : 0;
  return buf.map((v) => v * k);
}

function wav(buf: Float32Array): Buffer {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// ---------------------------------------------------------------------------
// The effects, by the names the game uses (game/io.ts), with their peak levels.

/**
 * Blows, after the shape of a game's most-played impacts: a low triangle
 * dropping in pitch under a dark noise tick, 20 dB down within a few dozen
 * milliseconds, a faint sub tail after. Energy stays under 500 Hz and
 * nothing reaches 2 kHz, so a thousand of them do not wear.
 */
const thud = (f: number, fast: number, dur: number) => tone(dur, glide(f, f * 0.45, dur * 0.5), 'tri', perc(fast, dur));
const tick = (dur: number, cut: number, seed: number, rate = 3000) => lowpass(noise(dur, rate, perc(dur * 0.35, dur, 0.03), seed), cut);
/** A layer at a fraction of its level. */
const at = (buf: Float32Array, k: number) => buf.map((v) => v * k);
/** A landed blow (the break): a full thud, a dark tick, and a faint sub-bass tail. */
const blow = (f: number, fast: number, dur: number, seed: number) =>
  mix(thud(f, fast, dur), at(tick(0.05, 600, seed), 0.5), [at(tone(dur * 0.6, 55, 'tri', perc(dur * 0.2, dur * 0.6, 0.02)), 0.12), 0.02]);
/** A swing or a glancing hit (the hit while mining): lighter, faster, with a pebble of a second tick. */
const swing = (f: number, seed: number) =>
  mix(thud(f, 0.015, 0.3), at(tick(0.03, 500, seed), 0.3), [at(tick(0.025, 600, seed ^ 0x5a5a), 0.15), 0.05]);
/** A soft impact for movement: a thud under a short dark noise burst. */
const impact = (f: number, fast: number, dur: number, cut: number, seed = 0x6543) =>
  mix(thud(f, fast, dur), lowpass(noise(dur * 0.4, 5000, perc(fast * 0.6, dur * 0.4), seed), cut));
const fanfare = (notes: number[], step: number, last: number) =>
  mix(seq(run(notes.slice(0, -1), step, 'p25'), tone(last, midi(notes[notes.length - 1]), 'p50', ad(0.005, last, 0.01))), [
    seq(
      run(
        notes.slice(0, -1).map((n) => n - 12),
        step,
        'tri',
        0.8,
      ),
      tone(last, midi(notes[notes.length - 1] - 12), 'tri', ad(0.005, last, 0.01)),
    ),
    0,
  ]);

export const EFFECTS: Record<string, [number, () => Float32Array]> = {
  // Movement and the interface: quiet, short, low, and shaped to repeat (see `perc`).
  Step: [-20, () => impact(140, 0.03, 0.14, 700, 0x0f0f)],
  HorseWalk: [-18, () => seq(impact(230, 0.025, 0.1, 900, 0x1e1e), rest(0.06), impact(190, 0.025, 0.12, 900, 0x2d2d))],
  Bump: [-14, () => impact(100, 0.04, 0.2, 600)],
  Error1: [-14, () => tone(0.16, glide(440, 330, 0.06), 'tri', perc(0.04, 0.16))],
  Error2: [-14, () => tone(0.18, glide(330, 247, 0.06), 'tri', perc(0.045, 0.18))],
  ForceField: [-16, () => tone(0.12, vib(160, 0.15, 55), 'p12', hold(0.12))],
  Creak: [-15, () => tone(0.4, (t) => 95 + 30 * Math.sin(2 * Math.PI * 4 * t) + 40 * t, 'saw', hold(0.4, 0.03))],
  MountHorse: [-14, () => run([55, 62], 0.12, 'p25')],
  // Combat: the swing (one file; the player detunes each play), the landed blow, the monster's blow.
  Swish: [-16, () => swing(300, 0x2345)],
  Hit: [-10, () => blow(210, 0.035, 0.4, 0x7b7b)],
  Attack: [-11, () => blow(160, 0.04, 0.45, 0x1234)],
  Ouch: [-12, () => tone(0.22, glide(520, 200, 0.12), 'tri', perc(0.06, 0.22))],
  Shoot: [-12, () => mix(tone(0.25, glide(900, 380, 0.15), 'tri', perc(0.08, 0.25)), lowpass(noise(0.08, 9000, perc(0.03, 0.08)), 2000))],
  FailedSpell: [-14, () => seq(tone(0.09, 466, 'p50', hold(0.09)), tone(0.16, glide(440, 220, 0.16), 'p50', ad(0.003, 0.16)))],
  MonsterSpell: [-12, () => tone(0.4, glide(1800, 220, 0.4), 'p25', ad(0.005, 0.4))],
  MiscSpell: [-12, () => run([72, 76, 79, 84], 0.06, 'p12')],
  Immolate: [-10, () => mix(noise(0.5, glide(400, 6000, 0.3), ad(0.02, 0.5)), tone(0.5, glide(80, 40, 0.5), 'tri', ad(0.01, 0.5)))],
  // A siren rather than a bell: one voice wailing between two pitches, twice, then fading.
  Alarm: [
    -15,
    () =>
      lowpass(
        tone(
          1.5,
          (t) => 520 * Math.pow(2, 0.9 * (0.5 - Math.abs(((t * 1.4) % 1) - 0.5)) * 2),
          'p25',
          (t) => hold(1.5, 0.02)(t) * (t > 1.1 ? Math.pow(0.02, (t - 1.1) / 0.4) : 1),
        ),
        2500,
      ),
  ],
  // Deaths.
  DeathMale: [-10, () => run([52, 48, 45, 40], 0.13, 'p50', 1)],
  DeathFemale: [-10, () => run([64, 60, 57, 52], 0.13, 'p25', 1)],
  BigDeath: [-9, () => mix(tone(1.0, glide(220, 30, 1.0), 'p50', ad(0.01, 1.0, 0.01)), noise(0.9, glide(3000, 200, 0.9), ad(0.05, 0.9)))],
  // Jingles: one at a time, never long.
  CombatStart: [-10, () => fanfare([57, 57, 60, 64], 0.11, 0.3)],
  CombatVictory: [-10, () => fanfare([67, 71, 74, 79, 83], 0.1, 0.45)],
  LBLevelRise: [-10, () => fanfare([60, 64, 67, 72, 76], 0.12, 0.5)],
  ExpLevelUp: [-10, () => fanfare([62, 66, 69, 74], 0.12, 0.5)],
  // Magic and places: softer, longer.
  Heal: [-13, () => mix(run([60, 64, 67, 72], 0.14, 'tri', 1), [run([72, 76, 79, 84], 0.14, 'p12', 0.7), 0.07])],
  Invocation: [-13, () => chord([48, 55, 60, 64], 1.1, 'p25', ad(0.35, 1.1, 0.02))],
  Shrine: [-13, () => seq(chord([60, 64, 67], 0.5, 'tri', ad(0.15, 0.5, 0.2)), chord([62, 65, 69, 74], 0.9, 'tri', ad(0.15, 0.9, 0.01)))],
  Moongate: [-12, () => mix(run([60, 67, 72, 79, 84, 91], 0.07, 'p12'), [tone(0.7, vib(262, 0.02, 6), 'tri', ad(0.1, 0.7, 0.01)), 0.1])],
  TorchIgnite: [-14, () => mix(noise(0.45, glide(300, 5000, 0.2), ad(0.02, 0.45)), tone(0.3, glide(180, 420, 0.3), 'tri', ad(0.05, 0.3)))],
  Upwards: [-12, () => run([55, 59, 62, 67], 0.09, 'p25')],
  Downwards: [-12, () => run([67, 62, 59, 55], 0.09, 'p25')],
  Sink: [-12, () => mix(tone(1.2, glide(330, 55, 1.2), 'p50', ad(0.01, 1.2, 0.02)), noise(1.0, glide(1500, 150, 1.0), ad(0.1, 1.0)))],
};

export function renderAll(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const names: string[] = [];
  for (const [name, [db, make]] of Object.entries(EFFECTS)) {
    writeFileSync(join(dir, `${name}.wav`), wav(peak(make(), db)));
    names.push(name);
  }
  return names;
}

if (process.argv[1] && process.argv[1].endsWith('chip-sfx.ts')) {
  const dir = join(import.meta.dirname, '..', 'public', 'sounds', 'standard');
  const names = renderAll(dir);
  console.log(`wrote ${names.length} effects to ${dir}`);
}

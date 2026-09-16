/**
 * sound.ts
 *
 * Sound effects through the Web Audio API, from one of two sets:
 *
 *   Standard   chip-tune effects rendered by tools/chip-sfx.ts into
 *              public/sounds/standard/, balanced against each other.
 *   Lairware   the original Mac effects in public/sounds (IMA ADPCM WAVs,
 *              shipped as 16-bit PCM with their sample rates kept), which
 *              were recorded at very different levels: a gain table below
 *              brings them into line.
 *
 * Effects are decoded once and cached. Two mixing rules keep repeats from
 * piling up: the same effect is not started again within a few dozen
 * milliseconds, and an effect longer than half a second is not restarted
 * while it is still sounding. A long effect asks the music to duck under
 * it (`onLong`). In the Standard set the effects a turn repeats play at a
 * slightly different pitch each time, as a game's footsteps do, so no two
 * are the same; the Lairware set plays as recorded.
 *
 * Browsers refuse to start audio until the user has interacted with the
 * page, so the AudioContext is created lazily on the first key press or
 * click (main.ts).
 */

export type SoundSet = 'Standard' | 'Lairware';
export const SOUND_SETS: SoundSet[] = ['Standard', 'Lairware'];

const FOLDER: Record<SoundSet, string> = { Standard: 'standard/', Lairware: '' };
/** Names a set serves from another file: the Standard set has one swing, varied at play time, where the Mac had four. */
const ALIAS: Record<SoundSet, Record<string, string>> = {
  Standard: { Swish1: 'Swish', Swish2: 'Swish', Swish3: 'Swish', Swish4: 'Swish' },
  Lairware: {},
};
/** The file a set plays for a game sound name (without folder or extension). */
export const fileFor = (set: SoundSet, name: string): string => ALIAS[set][name] ?? name;

/** The same effect starts at most this often. */
const MIN_INTERVAL_MS = 70;
/** An effect at least this long is not restarted while it plays. */
const LONG_S = 0.5;
/** An effect at least this long ducks the music. */
const DUCK_S = 1;
/** Standard-set effects that repeat every turn or every blow: each play is detuned by up to this many semitones either way. */
const VARIED = new Set([
  'Step',
  'HorseWalk',
  'Bump',
  'Hit',
  'Attack',
  'Swish1',
  'Swish2',
  'Swish3',
  'Swish4',
  'Ouch',
  'Shoot',
  'Error1',
  'Error2',
]);
const DETUNE_SEMITONES = 1;

/**
 * Gain per effect in dB. The Lairware files were measured (mean level)
 * and pulled to targets by kind: what a turn repeats far below the
 * one-off jingles. The Standard set is rendered at its levels already.
 */
const GAIN_DB: Record<SoundSet, Record<string, number>> = {
  Standard: {},
  Lairware: {
    Step: -9,
    HorseWalk: 0,
    Bump: -9,
    Error1: -8,
    Error2: -6,
    Attack: -6,
    Swish1: 1,
    Swish2: -1,
    Swish3: -3,
    Swish4: -5,
    Hit: -8,
    Ouch: -5,
    Shoot: -3,
    DeathMale: -4,
    DeathFemale: -10,
    BigDeath: -8,
    CombatStart: -7,
    CombatVictory: -9,
    Alarm: -5,
    Creak: -2,
    TorchIgnite: -6,
    Sink: -5,
    Moongate: -9,
    MountHorse: -9,
    Upwards: -7,
    Downwards: -7,
    ForceField: -8,
    FailedSpell: -7,
    Immolate: -9,
    MiscSpell: -10,
    MonsterSpell: -5,
    Invocation: -4,
    Heal: -11,
    Shrine: -13,
    LBLevelRise: -10,
    ExpLevelUp: -6,
  },
};

export class SoundPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** When each effect last started, by set and name (milliseconds, performance clock). */
  private lastStart = new Map<string, number>();
  /** When each long effect ends (AudioContext time). */
  private ends = new Map<string, number>();
  enabled = true;
  set: SoundSet = 'Standard';
  /** Called with the length in seconds when a long effect starts (the music ducks). */
  onLong: ((seconds: number) => void) | null = null;

  constructor(
    private readonly baseUrl = 'sounds/',
    private readonly now: () => number = () => performance.now(),
    private readonly random: () => number = Math.random,
  ) {}

  /** Create the AudioContext. Call from a user-gesture handler. */
  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  private load(key: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(key);
    if (!p) {
      p = fetch(`${this.baseUrl}${key}.wav`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((data) => this.context!.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(key, p);
    }
    return p;
  }

  /** Play a named effect from the current set. Missing files fail silently. */
  play(name: string): void {
    if (!this.enabled || !this.context) return;
    const set = this.set;
    const key = `${FOLDER[set]}${fileFor(set, name)}`;
    const t = this.now();
    if (t - (this.lastStart.get(key) ?? -Infinity) < MIN_INTERVAL_MS) return;
    this.lastStart.set(key, t);
    void this.load(key).then((buffer) => {
      if (!buffer || !this.context) return;
      const ctx = this.context;
      if (buffer.duration >= LONG_S && (this.ends.get(key) ?? 0) > ctx.currentTime) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (set === 'Standard' && VARIED.has(name))
        source.playbackRate.value = Math.pow(2, ((this.random() * 2 - 1) * DETUNE_SEMITONES) / 12);
      const gain = ctx.createGain();
      gain.gain.value = Math.pow(10, (GAIN_DB[set][name] ?? 0) / 20);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      if (buffer.duration >= LONG_S) this.ends.set(key, ctx.currentTime + buffer.duration);
      if (buffer.duration >= DUCK_S) this.onLong?.(buffer.duration);
    });
  }
}

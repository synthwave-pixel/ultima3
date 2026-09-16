/**
 * music.ts
 *
 * Background music. The original tracks (Resources/Music/Song_*.mov) are
 * QuickTime Music Architecture files: not audio, but a list of note events
 * that QuickTime's software synthesizer played. Browsers cannot play them,
 * so this module reads the note list itself and plays it with Web Audio
 * oscillators.
 *
 * File layout (QuickTime container): the `stco` atom lists chunk offsets
 * and `stsz` the sample sizes; concatenated, the samples are a stream of
 * big-endian 32-bit "music events" (Inside Macintosh: QuickTime Music
 * Architecture):
 *
 *   000 dddddddd dddddddddddddddd            rest      d = duration (24 bits)
 *   001 ppppp nnnnnn vvvvvvv ddddddddddd     note      part, pitch + 32, volume, duration
 *   010 ppppp cccccccc vvvvvvvvvvvvvvvv      control   controller 7 = part volume (8.8 fixed)
 *   011 ...                                  marker    (0x60000000 ends the tune)
 *   1001 pppppppppppp nnnnnnnnnnnnnnnn       extended note, word 1: part, pitch
 *   10 vvvvvvvv dddddddddddddddddddddd       extended note, word 2: volume, duration
 *   1010 / 1011 ...                          extended control / knob (two words, ignored)
 *   1111 pppppppppppp llllllllllllllll       general event: l words long, skipped
 *
 * Durations are in the track's time scale (`mdhd`, 600 units per second).
 */

export interface MusicNote {
  /** Start time in seconds from the beginning of the tune. */
  time: number;
  /** MIDI pitch. */
  pitch: number;
  /** 0..127 */
  volume: number;
  /** Seconds. */
  duration: number;
  part: number;
}

export interface Tune {
  notes: MusicNote[];
  /** Length of the tune in seconds (where it loops). */
  length: number;
}

/** Find the first atom of a type at the top level or inside container atoms. */
function findAtom(data: DataView, type: string, start = 0, end = data.byteLength): number {
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
  let off = start;
  while (off + 8 <= end) {
    let size = data.getUint32(off);
    const t = String.fromCharCode(data.getUint8(off + 4), data.getUint8(off + 5), data.getUint8(off + 6), data.getUint8(off + 7));
    if (size === 0) size = end - off;
    if (size < 8) break;
    if (t === type) return off;
    if (containers.has(t)) {
      const inner = findAtom(data, type, off + 8, off + size);
      if (inner >= 0) return inner;
    }
    off += size;
  }
  return -1;
}

/** Decode a QuickTime music file into a note list. */
export function parseQuickTimeMusic(buffer: ArrayBuffer): Tune {
  const data = new DataView(buffer);
  const mdhd = findAtom(data, 'mdhd');
  const timeScale = mdhd >= 0 ? data.getUint32(mdhd + 20) : 600;

  // Gather the sample bytes in order.
  const stco = findAtom(data, 'stco');
  const stsz = findAtom(data, 'stsz');
  if (stco < 0 || stsz < 0) throw new Error('not a QuickTime music file');
  const chunkCount = data.getUint32(stco + 12);
  const fixedSize = data.getUint32(stsz + 12);
  const sampleCount = data.getUint32(stsz + 16);
  const words: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const offset = data.getUint32(stco + 16 + i * 4);
    const size = fixedSize || (i < sampleCount ? data.getUint32(stsz + 20 + i * 4) : 0);
    for (let p = offset; p + 4 <= offset + size && p + 4 <= data.byteLength; p += 4) words.push(data.getUint32(p));
  }

  const notes: MusicNote[] = [];
  const partVolume = new Map<number, number>(); // controller 7 per part, 0..1
  let time = 0; // in time-scale units
  const push = (part: number, pitch: number, volume: number, duration: number) => {
    notes.push({
      time: time / timeScale,
      part,
      pitch,
      volume: Math.round(volume * (partVolume.get(part) ?? 1)),
      duration: duration / timeScale,
    });
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nibble = w >>> 28;
    if (nibble <= 1) {
      time += w & 0x00ffffff; // rest
    } else if (nibble <= 3) {
      push((w >>> 24) & 0x1f, ((w >>> 18) & 0x3f) + 32, (w >>> 11) & 0x7f, w & 0x7ff); // note
    } else if (nibble <= 5) {
      // Control event: controller 7 is the part's volume as an 8.8 fixed value.
      const controller = (w >>> 16) & 0xff;
      if (controller === 7) partVolume.set((w >>> 24) & 0x1f, Math.min(1, ((w & 0xffff) >> 8) / 127));
    } else if (nibble === 0x9) {
      // Extended note, two words: part and pitch, then volume and a 22-bit duration.
      const w2 = words[++i] ?? 0;
      const rawPitch = w & 0xffff;
      push((w >>> 16) & 0xfff, rawPitch > 255 ? rawPitch / 256 : rawPitch, (w2 >>> 22) & 0xff, w2 & 0x3fffff);
    } else if (nibble === 0xa || nibble === 0xb) {
      i++; // extended control and knob events are two words; nothing we need
    } else if (nibble === 0xf) {
      // General event: skip its declared length (in words, including both header words).
      i += Math.max(1, w & 0xffff) - 1;
    }
    // Markers (0x6, 0x7) and stray trailer words (0x8, 0xC, 0xD) carry nothing we need.
  }
  const length = notes.reduce((max, n) => Math.max(max, n.time + n.duration), time / timeScale);
  return { notes, length };
}

/** The song files by track number (`gSongNext` values); 9 and 12-15 do not exist. */
export const SONG_FILES: Record<number, string> = {
  1: 'Song_1.mov',
  2: 'Song_2.mov',
  3: 'Song_3.mov',
  4: 'Song_4.mov',
  5: 'Song_5.mov',
  6: 'Song_6.mov',
  7: 'Song_7.mov',
  8: 'Song_8.mov',
  10: 'Song_A.mov',
  11: 'Song_B.mov',
};

/** How far ahead notes are scheduled, and how often the scheduler runs. */
const LOOKAHEAD_S = 1.5;
const SCHEDULER_MS = 250;

/**
 * Plays tunes on a simple polyphonic synthesizer: one triangle oscillator
 * per note with a short attack and release. Tunes loop until stopped.
 *
 * The game says which track it wants (`play`), the player says whether
 * music is on (`enabled`), and the browser says whether audio may start
 * yet (`unlock`); `sync` makes what sounds match all three, so a track
 * asked for while music was off, or before the first key, starts the
 * moment it may.
 */
export class MusicPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private tunes = new Map<number, Promise<Tune | null>>();
  /** The track the game wants, 0 for silence. */
  private current = 0;
  /** The track playing or loading, 0 while silent. */
  private activeTrack = 0;
  /** Bumped by every start and stop, so a load that finishes late is dropped. */
  private startToken = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tune: Tune | null = null;
  private loopStart = 0;
  private nextNote = 0;
  private playing = new Set<AudioScheduledSourceNode>();
  private on = true;
  /** While the game is paused (window not focused) the clock stops, so the tune holds its place. */
  private paused = false;
  /** 0..1 */
  volume = 0.35;

  constructor(private readonly baseUrl = 'music/') {}

  /** Music on or off (the Settings toggle). Turning it on resumes the wanted track. */
  get enabled(): boolean {
    return this.on;
  }
  set enabled(on: boolean) {
    this.on = on;
    this.sync();
  }

  /**
   * Dip under a sound effect of `seconds`: down to a third for its length,
   * then back over a moment. (`duck` has no effect before the first key.)
   */
  duck(seconds: number): void {
    if (!this.master || !this.context) return;
    const g = this.master.gain;
    const now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.volume / 3, now + 0.05);
    g.setValueAtTime(this.volume / 3, now + Math.max(0.05, seconds - 0.25));
    g.linearRampToValueAtTime(this.volume, now + seconds + 0.3);
  }

  /** The track playing or loading, 0 while silent. */
  get active(): number {
    return this.activeTrack;
  }

  /** Create the AudioContext. Call from a user-gesture handler. */
  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended' && !this.paused) void this.context.resume();
    this.sync();
  }

  /** The game paused: stop the audio clock, so the tune holds its place and resumes from it. */
  pause(): void {
    this.paused = true;
    if (this.context?.state === 'running') void this.context.suspend();
  }

  /** The game resumed: the tune goes on from where it stopped, if music is on. */
  resume(): void {
    this.paused = false;
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  /** Start or stop so that what sounds is the wanted track, if music is on and audio unlocked, else nothing. */
  private sync(): void {
    const wanted = this.on && this.context ? this.current : 0;
    if (wanted === this.activeTrack) return;
    this.stopScheduling();
    this.activeTrack = wanted;
    if (wanted) this.start(wanted);
  }

  private load(track: number): Promise<Tune | null> {
    let p = this.tunes.get(track);
    if (!p) {
      const file = SONG_FILES[track];
      p = file
        ? fetch(this.baseUrl + file)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
            .then(parseQuickTimeMusic)
            .catch(() => null)
        : Promise.resolve(null);
      this.tunes.set(track, p);
    }
    return p;
  }

  /** Switch to a track (0 = silence). Safe to call before audio is unlocked or while music is off: the track is remembered. */
  play(track: number): void {
    this.current = track;
    this.sync();
  }

  private start(track: number): void {
    const token = ++this.startToken;
    void this.load(track).then((tune) => {
      if (!tune || token !== this.startToken || this.activeTrack !== track || !this.context) return;
      this.tune = tune;
      this.loopStart = this.context.currentTime + 0.1;
      this.nextNote = 0;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), SCHEDULER_MS);
    });
  }

  private stopScheduling(): void {
    this.startToken++;
    this.activeTrack = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tune = null;
    for (const node of this.playing) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing.clear();
  }

  /** Schedule every note that starts within the lookahead window, looping the tune. */
  private schedule(): void {
    const ctx = this.context;
    const tune = this.tune;
    if (!ctx || !tune || !this.master) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (true) {
      if (this.nextNote >= tune.notes.length) {
        // Loop.
        this.loopStart += Math.max(tune.length, 0.5);
        this.nextNote = 0;
        if (tune.notes.length === 0) return;
      }
      const note = tune.notes[this.nextNote];
      const at = this.loopStart + note.time;
      if (at > horizon) return;
      this.nextNote++;
      this.playNote(note, at);
    }
  }

  private playNote(note: MusicNote, at: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    osc.type = note.part === 0 ? 'triangle' : 'square';
    osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const gain = ctx.createGain();
    const peak = (note.volume / 127) * 0.5;
    const end = at + Math.max(0.05, note.duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.02);
    gain.gain.setValueAtTime(peak, Math.max(at + 0.02, end - 0.05));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(at);
    osc.stop(end + 0.01);
    this.playing.add(osc);
    osc.onended = () => this.playing.delete(osc);
  }
}

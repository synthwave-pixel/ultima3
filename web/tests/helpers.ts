/**
 * Shared test helpers: load the extracted resources from disk and provide a
 * fake GameIO that records what the game printed and played.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourcesFromBundle, type Bundle, type GameResources } from '../src/data/resources.ts';
import { serialize, type SaveData } from '../src/game/save.ts';
import { World } from '../src/game/world.ts';
import { Key, type GameIO, type MenuOption, type CommandScope } from '../src/game/io.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

let cached: GameResources | null = null;

/** A save as it comes back from storage: through JSON, so nothing but plain data survives. */
export function savedCopy(world: World): SaveData {
  return JSON.parse(JSON.stringify(serialize(world))) as SaveData;
}

/** Load public/data/resources.json once per test run. */
export function loadTestResources(): GameResources {
  if (!cached) {
    const json = readFileSync(join(HERE, '..', 'public', 'data', 'resources.json'), 'utf8');
    cached = resourcesFromBundle(JSON.parse(json) as Bundle);
  }
  return cached;
}

/** A fresh world on Sosaria with the default party, using a fixed RNG seed. */
export function newWorld(seed = 1234): World {
  const world = new World(loadTestResources(), seed);
  world.newGame();
  return world;
}

/**
 * GameIO that records output instead of drawing. Keys are fed from `keys`;
 * when the queue runs dry, `waitKey` throws so a test cannot hang, while
 * `waitKeyOrTimeout` returns null (an idle turn). Text input is fed from
 * `inputs`.
 */
export class FakeIO implements GameIO {
  output = '';
  sounds: string[] = [];
  keys: string[] = [];
  /** Scripted keys (auto-combat), read before `keys`. */
  macro: string[] = [];
  /** When set, supplies keys after `keys` runs dry (for scripted fights). */
  keyProvider: (() => string | null) | null = null;
  inputs: string[] = [];
  redraws = 0;
  images: string[] = [];
  musicTrack = 0;

  constructor(private readonly resources: GameResources) {}

  print(text: string): void {
    this.output += text;
  }
  printMessage(n: number): void {
    this.output += this.resources.strings.Messages[n - 1] ?? `[msg ${n}]`;
  }
  prompt(): void {
    this.output += '\n>';
  }
  async waitKey(): Promise<string> {
    const k = this.macro.shift() ?? this.keys.shift() ?? this.keyProvider?.() ?? undefined;
    if (k === undefined || k === null) throw new Error(`FakeIO: no more keys. Output so far:\n${this.output}`);
    return k;
  }
  async waitKeyOrTimeout(): Promise<string | null> {
    return this.macro.shift() ?? this.keys.shift() ?? this.keyProvider?.() ?? null;
  }
  flushKeys(): void {}
  queueKeys(keys: string[]): void {
    this.macro = [...keys];
  }
  /** Keyboard-style answers, read from the key queue exactly as the original read keys. */
  async waitCommand(_scope: CommandScope): Promise<string | null> {
    return this.waitKeyOrTimeout();
  }
  /** A digit answers; Escape cancels (0), as the Screen's prompt does. */
  async chooseMember(_only?: number[]): Promise<number> {
    const key = (await this.waitKey()).toUpperCase();
    if (key === Key.Escape) {
      this.output += ' \n';
      return 0;
    }
    this.output += `${key}\n`;
    return key.charCodeAt(0) - '0'.charCodeAt(0);
  }
  async chooseDirection(allowNone: boolean): Promise<string | null> {
    for (;;) {
      const key = await this.waitKey();
      if (key === Key.Escape) return null;
      if ([Key.Up, Key.Down, Key.Left, Key.Right, '1', '2', '3', '4', '6', '7', '8', '9'].includes(key)) return key;
      if (allowNone && key === Key.Space) return key;
    }
  }
  async chooseOption(options: MenuOption[], echo: 'none' | 'key' | 'line'): Promise<string> {
    for (;;) {
      const key = (await this.waitKey()).toUpperCase();
      if (key === Key.Escape) return '';
      const hit = options.find((o) => o.key === key);
      if (!hit) continue;
      if (echo !== 'none') this.output += key;
      if (echo === 'line') this.output += '\n';
      return key;
    }
  }
  async showSettings(): Promise<void> {}
  async showJournal(): Promise<void> {}
  async showMap(): Promise<void> {}
  /** Answered from the key queue like chooseOption. */
  async chooseFromList(options: MenuOption[]): Promise<string> {
    return this.chooseOption(options, 'none');
  }
  /** Answered from `inputs` as comma-separated values; an empty entry cancels. */
  async allocatePoints(labels: string[]): Promise<number[] | null> {
    const t = this.inputs.shift();
    if (t === undefined) throw new Error('FakeIO: no more inputs');
    if (t === '') return null;
    const values = t.split(',').map((v) => parseInt(v, 10));
    if (values.length !== labels.length) throw new Error(`FakeIO: expected ${labels.length} values`);
    return values;
  }
  async inputText(): Promise<string> {
    const t = this.inputs.shift();
    if (t === undefined) throw new Error('FakeIO: no more inputs');
    this.output += t;
    return t;
  }
  async inputTextAt(): Promise<string> {
    return this.inputText();
  }
  sound(name: string): void {
    this.sounds.push(name);
  }
  music(track: number): void {
    this.musicTrack = track;
  }
  redrawMap(): void {
    this.redraws++;
  }
  async flashTiles(): Promise<void> {}
  /** Spell flashes, by kind; the spell's sound is recorded with the others. */
  flashes: string[] = [];
  async flashSpell(kind: string, _member: number, sound: string): Promise<void> {
    this.flashes.push(kind);
    this.sounds.push(sound);
  }
  async flashMember(): Promise<void> {}
  highlightMember(): void {}
  updateStats(): void {}
  showWind(): void {}
  showMoons(): void {}
  clearTiles(): void {}
  showImage(name: string): void {
    this.images.push(name);
  }
  async showMiniMap(): Promise<void> {}
  async showMiniDungeon(): Promise<void> {}
  async playEnding(): Promise<void> {}
  async pause(): Promise<void> {}
  showTitle(): void {}
  showGameFrame(): void {}
  clearBottom(): void {}
  textAt(_x: number, _y: number, text: string): void {
    this.output += text;
  }
  centreText(_y: number, text: string): void {
    this.output += text + '\n';
  }
}

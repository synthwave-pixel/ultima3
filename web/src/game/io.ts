/**
 * io.ts
 *
 * The boundary between game logic and the browser. Game code talks to the
 * screen, keyboard and speaker only through this interface, so the logic can
 * be unit-tested with a fake and the renderer can be swapped.
 *
 * The original was written in a blocking style (`WaitKeyMouse()` spun until a
 * key arrived). A browser cannot block, so every wait is a Promise and every
 * game routine that might wait is `async`.
 */

/** Single-character key codes used throughout the game logic. */
export const Key = {
  Left: '\x1c',
  Right: '\x1d',
  Up: '\x1e',
  Down: '\x1f',
  Enter: '\r',
  Backspace: '\b',
  Escape: '\x1b',
  Space: ' ',
  /** Controller buttons (also produced by Enter/Escape/Z/X/C/V in controller mode). */
  A: '\x01',
  B: '\x02',
  X: '\x03',
  Y: '\x04',
  /** The controller's system buttons (View and Menu), the touch pad's pause button, and a window that loses focus. */
  Pause: '\x05',
} as const;

/** One choice in a menu or a letter prompt. */
/**
 * Where a controller-mode menu window should go when the screen has text
 * laid out for it (the title screens): its top row and the title to show.
 * The window replaces the text at those rows. Keyboard mode ignores it.
 */
export interface MenuPlacement {
  row: number;
  title: string;
  /** Item to highlight first (default 0). */
  cursor?: number;
}

export interface MenuOption {
  /** The key the keyboard user presses (a letter, digit or Y/N). */
  key: string;
  /** What controller users see in the menu. */
  label: string;
  /** Accepted from the keyboard but not shown in the menu (e.g. an item the member does not own). */
  hidden?: boolean;
  /** One line shown under the menu while this item is highlighted. */
  hint?: string;
  /** Shown greyed and not selectable (possible in principle, but e.g. nothing to use it with). */
  disabled?: boolean;
  /** Draw the label in this colour (a CSS colour); e.g. a member's state. */
  colour?: string;
}

/** Where a top-level command is being read; decides which command menu a controller sees. */
export type CommandScope = 'field' | 'combat' | 'dungeon';

/** Music tracks, numbered as `gSongNext` was in the C source. */
export const Music = {
  None: 0,
  Sosaria: 1,
  Town: 2,
  Castle: 3,
  Dungeon: 4,
  Combat: 5,
  Shop: 6,
  ExodusCastle: 7,
  LordBritish: 8,
  Shrine: 10,
  Ambrosia: 11,
} as const;

/** Where a spell's flash lands: the caster's square, the recipient's square, or the whole view. */
export type SpellFlash = 'caster' | 'target' | 'window';

export interface GameIO {
  /** Print to the scrolling message area. `\n` starts a new line. (`UPrintWin`) */
  print(text: string): void;
  /** Print entry `n` (1-based, as in the C source) of the Messages table. (`UPrintMessage`) */
  printMessage(n: number): void;
  /** Draw the command prompt on the bottom line and move the cursor after it. (`DrawPrompt`) */
  prompt(): void;

  /** Wait for the next key press. (`WaitKeyMouse`) */
  waitKey(): Promise<string>;
  /** Wait for a key, or resolve `null` after `ms` milliseconds. Used for the idle "Pass". */
  waitKeyOrTimeout(ms: number): Promise<string | null>;
  /** Discard any queued key presses. (`FlushEvents`) */
  flushKeys(): void;
  /**
   * Replace the scripted keys. They are read before any real input, as the
   * Apple II keys they are, whatever the input mode. Auto-combat uses this
   * to "type" a member's turn. (`Macro[]` / `AddMacro`)
   */
  queueKeys(keys: string[]): void;

  // --- Semantic prompts ----------------------------------------------------
  // Game logic says what kind of answer it needs; the UI decides how to get
  // it. With a keyboard these read a key as the Apple II did. With a
  // controller they show a menu.

  /**
   * Read the next top-level command: a movement key, a command letter, or
   * null when `timeoutMs` passes with no input (the turn then passes).
   * Without a limit it waits for a key (the timer setting Off). A command
   * menu closed without a choice is no answer: the wait goes on, with the
   * time that was left.
   */
  waitCommand(scope: CommandScope, timeoutMs?: number): Promise<string | null>;
  /**
   * After a "whom?" prompt: 1..4, or 0 when cancelled. Echoes the answer.
   * `only` (0-based members) limits what the controller menu lists, say to
   * the members who hold a gem; a keyboard still accepts any digit. (`GetChar`)
   */
  chooseMember(only?: number[]): Promise<number>;
  /**
   * After a "Direction-" prompt: a movement key (arrows or keypad digits), the
   * space bar when `allowNone`, or null when cancelled.
   */
  chooseDirection(allowNone: boolean, allowDiagonal: boolean): Promise<string | null>;
  /**
   * Pick one option. Resolves with the option's key, or '' when cancelled.
   * `echo` says whether to print the chosen key ('none'), the key ('key'),
   * or the key and a newline ('line'), matching what the original printed.
   */
  chooseOption(options: MenuOption[], echo: 'none' | 'key' | 'line', place?: MenuPlacement): Promise<string>;
  /** The Settings menu (input mode, tiles, scanlines, difficulty, sound, music, help). Returns when closed. */
  showSettings(): Promise<void>;
  /**
   * The Pause menu: the game stops (idle timers, combat turn timers and the
   * music with it) and the settings are shown, until Resume. No turn passes.
   * Resolves with a command key the player chose there to run now ('Q',
   * quit and save), or null.
   */
  showPause(): Promise<string | null>;
  /** The quest journal (J): a page over the map. No turn passes. */
  showJournal(): Promise<void>;
  /** The cloth map of Sosaria over the whole screen, until a key. No turn passes. */
  showMap(): Promise<void>;
  /**
   * Pick from a list shown as a menu in every input mode (the title and
   * party screens, where there is no Apple II key to press). Resolves with
   * the option's key, or '' when cancelled.
   */
  chooseFromList(options: MenuOption[], place?: MenuPlacement): Promise<string>;
  /**
   * Share `total` points among `labels.length` attributes, each between
   * `min` and `max`, on a screen where left and right adjust a row and OK
   * is accepted once every point is spent. Resolves with the values, or
   * null when cancelled.
   */
  allocatePoints(labels: string[], total: number, min: number, max: number, place: MenuPlacement): Promise<number[] | null>;
  /**
   * Read a line of text at the cursor with a blinking cursor, echoing each
   * character. Backspace edits; Enter finishes. (`UInputText`) With a
   * controller, numbers use a spinner and words an on-screen keyboard; the
   * optional `words` list offers ready-made answers.
   */
  inputText(maxChars: number, numbersOnly: boolean, words?: string[]): Promise<string>;

  /** Play a sound effect by file name without extension, e.g. "Step". (`PlaySoundFile`) */
  sound(name: string): void;
  /** Select the background music track (`gSongNext`). Music is optional; may be a no-op. */
  music(track: number): void;

  /** Redraw the map viewport around the party (or the combat arena, or the dungeon). (`DrawMap`) */
  redrawMap(): void;
  /** Briefly invert the map viewport. (`InverseTiles`) */
  flashTiles(): Promise<void>;
  /**
   * A spell being cast: flash and play its sound. With the Standard tiles
   * the flash is one white pulse over the caster's square, the recipient's
   * square or the whole view, by `kind`; other sets invert the view twice
   * around the sound, as the original did. (`Flashriek`)
   */
  flashSpell(kind: SpellFlash, member: number, sound: string): Promise<void>;
  /** Briefly highlight one member's stats box. (`InverseChar`) */
  flashMember(member: number): Promise<void>;
  /** Keep one member's stats box highlighted (combat turn marker). (`InverseChnum`) */
  highlightMember(member: number, on: boolean): void;
  /** Redraw the four character stat boxes if anything changed. (`ShowChars`) */
  updateStats(force?: boolean): void;
  /** Redraw the wind indicator on the bottom border. (`ShowWind`) */
  showWind(): void;
  /** Redraw the moon phase indicators on the top border. (`DrawMoonGateStuff`, display part) */
  showMoons(): void;
  /** Black out the map viewport. (`ClearTiles`) */
  clearTiles(): void;

  /** Show a full-viewport picture: "Fountain", "Rod", "Shrine", "TimeLord". (`ImageDisplay`) */
  showImage(name: string): void;
  /** Draw the whole current map small, with the party blinking, until a key is pressed. (`DrawMiniMap`) */
  showMiniMap(): Promise<void>;
  /** Draw the current dungeon level as a map until a key is pressed. (`DrawMiniDng`) */
  showMiniDungeon(): Promise<void>;
  /** Play the end-of-game colour flash and scrolling text. (`OtherCommand` INSERT ending) */
  playEnding(): Promise<void>;

  /** Wait `ms` milliseconds while keeping animations running. (`IdleUntil`) */
  pause(ms: number): Promise<void>;

  // --- Title screen and party organisation menus -------------------------

  /** Draw the plain border and the Exodus title picture. (`DrawFrame(3)` + `DrawExodusPict`) */
  showTitle(): void;
  /** Draw the in-game border with the stats boxes. (`DrawFrame(1)`) */
  showGameFrame(): void;
  /** Black out the lower part of the title screen where menu text goes. (`ClearBottom`) */
  clearBottom(): void;
  /** Draw text at a cell position, outside the message area. (`UPrint`) */
  textAt(x: number, y: number, text: string): void;
  /** Draw text centred on the 40-column screen. (`CenterMessage`) */
  centreText(y: number, text: string): void;
  /** Read a line of text at a cell position (for the character creation screen). */
  inputTextAt(x: number, y: number, maxChars: number, numbersOnly: boolean): Promise<string>;
}

/** Options for a letter prompt: one option per letter, labels from `labels`. */
export function letterOptions(letters: string, labels: (letter: string) => string): MenuOption[] {
  return Array.from(letters, (key) => ({ key, label: labels(key) }));
}

/** The yes/no question. Resolves true for Y. Echoes as the original did (the caller prints the newline). */
export async function yesNo(io: GameIO): Promise<boolean> {
  const answer = await io.chooseOption(
    [
      { key: 'Y', label: 'Yes' },
      { key: 'N', label: 'No' },
    ],
    'none',
  );
  return answer === 'Y';
}

/** Read a number of up to two digits. (`UInputNum`) */
export async function inputNumber(io: GameIO, maxDigits = 2): Promise<number> {
  const text = await io.inputText(maxDigits, true);
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Sound effect names, matching files in public/sounds. */
export const Sound = {
  Step: 'Step',
  HorseWalk: 'HorseWalk',
  Bump: 'Bump',
  MountHorse: 'MountHorse',
  Hit: 'Hit',
  Attack: 'Attack',
  ForceField: 'ForceField',
  Moongate: 'Moongate',
  Sink: 'Sink',
  Shoot: 'Shoot',
  Error1: 'Error1',
  Error2: 'Error2',
  DeathMale: 'DeathMale',
  DeathFemale: 'DeathFemale',
  BigDeath: 'BigDeath',
  TorchIgnite: 'TorchIgnite',
  Creak: 'Creak',
  Ouch: 'Ouch',
  Alarm: 'Alarm',
  CombatStart: 'CombatStart',
  CombatVictory: 'CombatVictory',
  FailedSpell: 'FailedSpell',
  Immolate: 'Immolate',
  Downwards: 'Downwards',
  Upwards: 'Upwards',
  Invocation: 'Invocation',
  Heal: 'Heal',
  MiscSpell: 'MiscSpell',
  MonsterSpell: 'MonsterSpell',
  Shrine: 'Shrine',
  LBLevelRise: 'LBLevelRise',
  ExpLevelUp: 'ExpLevelUp',
  Swish: ['Swish1', 'Swish2', 'Swish3', 'Swish4'],
} as const;

/** The death sound for a character. */
export function deathSound(sex: string): string {
  return sex === 'F' ? Sound.DeathFemale : Sound.DeathMale;
}

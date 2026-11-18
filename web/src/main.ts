/**
 * main.ts
 *
 * Browser entry point: load the data and graphics, build the world, wire up
 * the screen and keyboard, then run the title menu, which starts the game.
 *
 * Settings live in the game's own Settings menu (Escape, or the last entry
 * of the controller command menu); this file only remembers them between
 * visits, in localStorage.
 */

import { loadResources } from './data/resources.ts';
import { World, STARVATION_MODES, TIMER_MODES, type Starvation, type Timer } from './game/world.ts';
import { Game } from './game/game.ts';
import { localSave, exportGame, parseExport, restoreExported, SAVE_KEY } from './game/save.ts';
import { registerSW } from 'virtual:pwa-register';
import type { Transfer } from './game/menu.ts';
import { appQuit, launchWarning, warningDue, type NativeQuit } from './ui/platform.ts';
import { androidUpdates, desktopUpdates, isRelease, newerRelease, webUpdates, type DesktopUpdates, type UpdateHook } from './ui/updates.ts';

const WARNED_KEY = 'ultima3.warned';
/** The newest release the Android app's player has been told of (menu.ts updateBox), so each is told of once. */
const UPDATE_TOLD_KEY = 'ultima3.updateTold';
/** When the storage warning was last shown, or null. */
function readWarnedAt(): number | null {
  try {
    const raw = localStorage.getItem(WARNED_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}
import { AutoMap, MAP_MODES, type MapMode } from './game/automap.ts';
import { chooseRules, mainMenu } from './game/menu.ts';
import { Attract } from './ui/attract.ts';
import { GraphicsSet, loadImages } from './ui/graphics.ts';
import { validFont, type FontChoice } from './ui/lettering.ts';
import { INPUT_PACE_NAMES, Keyboard, type InputPace } from './ui/input.ts';
import { LEVELS, SoundPlayer, SOUND_SETS, validLevel, type SoundSet } from './ui/sound.ts';
import { TouchPad } from './ui/touch.ts';
import { fullScreen } from './ui/fullScreen.ts';
import { bootHold } from './ui/bootHold.ts';
import { MusicPlayer } from './ui/music.ts';
import { Screen } from './ui/screen.ts';
import { TILE_SETS } from './ui/help.ts';
import { WALLS } from './ui/dungeonArt.ts';

const PREFS_KEY = 'ultima3.settings';

/** What the Settings menu can change, as remembered between visits. */
interface Prefs {
  inputMode: 'keyboard' | 'controller';
  tiles: string;
  /** CRT lines over the whole game (scanlines.ts); off unless asked for. */
  scanlines: boolean;
  /** The top-down views glide from square to square (glide.ts); on unless turned off, for players new and old. */
  smoothMotion: boolean;
  /** The letters' font (Visuals, lettering.ts): the look's own unless another is chosen. */
  font: FontChoice;
  autoCombat: boolean;
  poisonKills: boolean;
  starvation: Starvation;
  balancedXp: boolean;
  /** Snap targets (snap.ts): on unless turned off; and the fights' tips given (snap.ts COMBAT_TIPS). */
  snapTargets: boolean;
  tips: string[];
  /** The turn timer; Fast, the Apple II's, for games from before the setting. */
  timer: Timer;
  sound: boolean;
  soundSet: SoundSet;
  /** The FX level, 0 to LEVELS; LEVELS is how loud the effects always were. */
  effectsLevel: number;
  music: boolean;
  /** The Music level, 0 to LEVELS; LEVELS is how loud the music always was. */
  musicLevel: number;
  dungeonMap: MapMode;
  /** The virtual controller shown; on first visit, shown on a touch screen. */
  touchPad: boolean;
  /** Battery saver: the map rests a minute after the last press (screen.ts); off unless asked for. */
  batterySaver: boolean;
  /** Max input: how soon a held key repeats (input.ts INPUT_PACES). */
  maxInput: InputPace;
}

const DEFAULT_PREFS: Prefs = {
  inputMode: 'controller',
  // A new player's look; one who has played before keeps theirs (loadPrefs).
  tiles: 'Remastered',
  scanlines: false,
  smoothMotion: true,
  font: 'look',
  autoCombat: false,
  poisonKills: false,
  starvation: 'mild',
  balancedXp: true,
  snapTargets: true,
  tips: [],
  timer: 'fast',
  sound: true,
  soundSet: 'Standard',
  effectsLevel: LEVELS,
  music: true,
  musicLevel: LEVELS,
  dungeonMap: 'off',
  touchPad: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  batterySaver: false,
  maxInput: 'medium',
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    const prefs = { ...DEFAULT_PREFS, ...saved };
    // Remastered became the look a new player starts in after Standard ("U3 2026") had been: anyone who has played
    // before - settings kept, or a game saved - stays in Standard unless they chose another set.
    const played = raw !== null || localStorage.getItem(SAVE_KEY) !== null;
    if (saved.tiles === undefined && played) prefs.tiles = 'Standard';
    // Apple II Color TV was dropped when scanlines became a setting; Apple II Color is its art without the fringing.
    if (prefs.tiles === 'Apple II Color TV') prefs.tiles = 'Apple II Color';
    if (!TILE_SETS.includes(prefs.tiles)) prefs.tiles = DEFAULT_PREFS.tiles;
    if (typeof prefs.scanlines !== 'boolean') prefs.scanlines = DEFAULT_PREFS.scanlines;
    if (typeof prefs.smoothMotion !== 'boolean') prefs.smoothMotion = DEFAULT_PREFS.smoothMotion;
    prefs.font = validFont(prefs.font);
    if (typeof prefs.batterySaver !== 'boolean') prefs.batterySaver = DEFAULT_PREFS.batterySaver;
    if (!INPUT_PACE_NAMES.includes(prefs.maxInput)) prefs.maxInput = DEFAULT_PREFS.maxInput;
    if (prefs.inputMode !== 'keyboard') prefs.inputMode = DEFAULT_PREFS.inputMode;
    if (!MAP_MODES.includes(prefs.dungeonMap)) prefs.dungeonMap = 'off';
    if (!STARVATION_MODES.includes(prefs.starvation)) prefs.starvation = 'mild';
    if (!TIMER_MODES.includes(prefs.timer)) prefs.timer = 'fast';
    if (!SOUND_SETS.includes(prefs.soundSet)) prefs.soundSet = 'Standard';
    prefs.effectsLevel = validLevel(prefs.effectsLevel);
    prefs.musicLevel = validLevel(prefs.musicLevel);
    return prefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
}

/** The boot screen (index.html: the box's demon over the canvas while the game loads) taken away. */
function bootDone(): void {
  document.getElementById('boot')?.remove();
}

/** Text on the bare canvas instead of the game, on failure. */
function canvasNotice(text: string): void {
  bootDone();
  const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#c8c8c8';
  ctx.font = `${canvas.height / 24}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 40, canvas.height / 2);
}

// The installed app: a new version downloads in the background and waits; the
// title menu offers the restart. Long-running pages look again every hour.
// The desktop app (desktop/, an app:// origin) and the Android app (mobile/,
// Capacitor) ship their own files and have no service worker; their updates
// are new builds.
const native = Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
let updateReady = false;
const applyUpdate =
  location.protocol.startsWith('http') && !native
    ? registerSW({
        onNeedRefresh() {
          updateReady = true;
        },
        onRegisteredSW(_url, registration) {
          if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
        },
      })
    : () => Promise.resolve();
const swUpdate = webUpdates(
  () => updateReady,
  () => void applyUpdate(true),
);

/** A download of the text as a JSON file named by the moment. */
async function saveFile(text: string): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ultima3-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The file picker; resolves to the file's text, or '' when the picker is dismissed. */
function pickFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (text: string): void => {
      if (done) return;
      done = true;
      input.remove();
      resolve(text);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish('');
      file.text().then(finish, (e: unknown) => {
        done = true;
        input.remove();
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
    input.addEventListener('cancel', () => finish(''));
    // Browsers without the cancel event: the window regains focus when the picker closes; a file, if any, has arrived by then.
    window.addEventListener('focus', () => setTimeout(() => !input.files?.length && finish(''), 1500), { once: true });
    input.click();
  });
}

async function start(): Promise<void> {
  // The boot screen is held a while before the title, and a click or tap from now on cuts it short (bootHold.ts).
  const holdBootScreen = bootHold();
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const prefs = loadPrefs();
  // Development starts (devStarts.ts, `npm run dev` only): ?peek saves nothing, ?tiles= is a set for this page alone.
  const dev = import.meta.env.DEV ? await import('./game/devStarts.ts') : null;
  const peek = dev !== null && params.has('peek');
  if (peek) localSave.off = true;
  const tilesAsked = dev?.tileSetAsked(params.get('tiles'), TILE_SETS) ?? null;
  const tiles = tilesAsked ?? prefs.tiles;
  // A newer version (ui/updates.ts), looked for now, the game going on meanwhile: the desktop app's main process looks
  // and downloads (desktop/updates.cjs); the Android app (its Quit plugin is how it is known) asks GitHub from here, its
  // version built in; the web has its service worker's.
  const plugins = (window as { Capacitor?: { Plugins?: { Quit?: NativeQuit } } }).Capacitor?.Plugins;
  const update = updateHook(plugins);

  const [resources, gfx, images] = await Promise.all([loadResources(), GraphicsSet.load(tiles), loadImages()]);

  // The party never moves diagonally, as on the Apple II (the Mac's option stays in the code, unexposed).
  const world = new World(resources);
  world.setDiagonalMoves(false);
  world.autoCombat = prefs.autoCombat;
  world.poisonKills = prefs.poisonKills;
  world.starvation = prefs.starvation;
  world.balancedXp = prefs.balancedXp;
  world.snapTargets = prefs.snapTargets !== false;
  world.tipsShown = new Set(Array.isArray(prefs.tips) ? prefs.tips.filter((t) => typeof t === 'string') : []);
  world.timer = prefs.timer;
  world.soundEnabled = prefs.sound;
  world.mapMode = prefs.dungeonMap;
  // What the party has seen goes with the save (save.ts); a new game starts it blank.
  world.autoMap = new AutoMap();

  // Resume the saved game unless the URL asks for a new one (?new).
  if (params.has('new') || !localSave.read(world)) {
    world.newGame();
    world.autoMap.clear();
  }

  const sounds = new SoundPlayer();
  sounds.set = prefs.soundSet;
  sounds.level = prefs.effectsLevel;
  const music = new MusicPlayer();
  music.level = prefs.musicLevel;
  sounds.onLong = (seconds) => music.duck(seconds); // long effects duck the music
  music.enabled = prefs.music;
  const keyboard = new Keyboard();
  // ?awake (development): the game plays on without the focus, as one of looks.html's pair does.
  if (dev && params.has('awake')) keyboard.followsFocus = false;
  // Audio may only start after a user gesture. A key press or a click is
  // one; a gamepad button is not, but once the page has had a click (to
  // focus it, say) the browser lets audio start, so every key from any
  // source tries the unlock, which is harmless once it has worked.
  const unlockAudio = () => {
    sounds.unlock();
    music.unlock();
  };
  keyboard.onInput = unlockAudio;
  window.addEventListener('pointerdown', unlockAudio);
  // The apps may start it with no press: the attract sequence has its music from its first moment. A browser tab waits.
  if (location.protocol === 'app:' || plugins?.Quit) unlockAudio();

  const screen = new Screen(canvas, gfx, images, keyboard, sounds, music, world);
  // ?controller starts in controller mode whatever was remembered (a Steam shortcut, a kiosk).
  screen.inputMode = params.has('controller') ? 'controller' : prefs.inputMode;
  screen.tileSetName = tiles;
  // ?walls=NAME (development): those walls in every dungeon (dungeonArt.ts WALLS), to try them.
  const wallsParam = dev ? params.get('walls') : null;
  if (wallsParam) screen.wallsAsked = Object.keys(WALLS).find((name) => dev!.slug(name) === dev!.slug(wallsParam)) ?? null;
  screen.scanlines = prefs.scanlines;
  screen.smoothMotion = prefs.smoothMotion;
  await screen.setFont(prefs.font, false); // before anything is drawn
  screen.batterySaver = prefs.batterySaver;
  screen.maxInput = prefs.maxInput;
  canvas.focus();
  // The Android app sent to the background is held as a hidden page is: its web view may not be told the page is
  // hidden, and would go on animating, the music and the turn timer with it. Capacitor's App plugin says so.
  const app = (window as { Capacitor?: { Plugins?: { App?: { addListener?: (e: string, f: () => void) => unknown } } } }).Capacitor?.Plugins
    ?.App;
  void app?.addListener?.('pause', () => keyboard.pause('focus'));
  void app?.addListener?.('resume', () => keyboard.resume('focus'));

  // Whatever changes a setting (the menu, a gamepad press, Escape in a fight), remember it.
  const remember = () => {
    if (peek) return;
    savePrefs({
      inputMode: screen.inputMode,
      // A set asked for in the address (development) is this page's alone: the one remembered stays.
      tiles: screen.tileSetName === tilesAsked ? prefs.tiles : screen.tileSetName,
      scanlines: screen.scanlines,
      smoothMotion: screen.smoothMotion,
      font: screen.font,
      autoCombat: world.autoCombat,
      poisonKills: world.poisonKills,
      starvation: world.starvation,
      balancedXp: world.balancedXp,
      snapTargets: world.snapTargets,
      tips: [...world.tipsShown],
      timer: world.timer,
      sound: world.soundEnabled,
      soundSet: sounds.set,
      effectsLevel: sounds.level,
      music: music.enabled,
      musicLevel: music.level,
      dungeonMap: world.mapMode,
      touchPad: prefs.touchPad,
      batterySaver: screen.batterySaver,
      maxInput: screen.maxInput,
    });
  };
  screen.onSettingsChange = remember;
  world.onMapModeChange = remember;
  world.onRulesChange = remember;
  screen.onModeChange = remember;
  world.onAutoCombatChange = remember;
  world.onTipGiven = remember;

  // The virtual controller: a tap shows it, its close button (or a physical key or gamepad press) hides it.
  const pad = new TouchPad({
    keyboard,
    shown: prefs.touchPad,
    fullScreen: fullScreen(),
    onPress: () => screen.useController(),
    onToggle: (shown) => {
      prefs.touchPad = shown;
      remember();
    },
  });
  screen.onGamepadPress = () => pad.show(false);

  // Development shortcut, not in the help: Option-Shift-6 (Alt-Shift-6, the ^ key) steps to the next tile set.
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'Digit6') {
      e.preventDefault();
      void screen.nextTileSet();
    }
  });

  // Keep the browser from evicting the saved game under disk pressure (Chrome, Edge, Firefox honour this).
  if (navigator.storage?.persist) void navigator.storage.persist();
  // An iOS browser tab deletes the saved game after a week away; say so before the title, once a day.
  const warning = launchWarning(navigator, (q) => window.matchMedia(q));
  if (warning && warningDue(readWarnedAt(), Date.now())) {
    alert(warning);
    try {
      localStorage.setItem(WARNED_KEY, String(Date.now()));
    } catch {
      /* storage unavailable: the warning will simply show again */
    }
  }

  const game = new Game(world, screen, { save: (w) => localSave.write(w), load: (w) => localSave.read(w), update });
  screen.update = update; // the Pause menu's Update line
  // Debug hook: lets the console (and the browser tests) inspect and poke the game.
  (window as unknown as { u3: unknown }).u3 = { world, screen, game, keyboard, update };
  // Export and import: the save, with the map in it, as text, through the clipboard or a file.
  const transfer: Transfer = {
    export: () => (world.party.formed ? exportGame(world) : null),
    import: (text) => {
      let parsed: ReturnType<typeof parseExport>;
      try {
        parsed = parseExport(text);
      } catch (e) {
        return (e as Error).message;
      }
      if (!restoreExported(world, parsed)) return 'the save does not fit';
      localSave.write(world);
      return null;
    },
    clipboard: { write: (text) => navigator.clipboard.writeText(text), read: () => navigator.clipboard.readText() },
    file: { save: saveFile, load: pickFile },
  };
  // The desktop app closes its window to quit (its last window closing quits it), and the Android app asks its
  // Quit plugin; a browser tab gets no Quit.
  const quit = appQuit(location.protocol, () => window.close(), plugins?.Quit);
  // The title (or the game) comes next: the boot screen, held until it has been up 3 seconds or a press skips it, gives
  // way to it. A development start goes straight on.
  await holdBootScreen(keyboard, !(dev && (params.has('play') || params.has('at'))));
  bootDone();
  // The attract sequence before the title, and the demo from its menu. A development start, or ?noattract, skips it.
  const sequence = new Attract(screen.attractStage(), resources.demo, resources.signature, [
    resources.strings.MoreMessages[25].replace(/©/g, '(C)'),
    'Macintosh version by Leon McNeill',
  ]);
  const skipAttract = dev !== null && (params.has('play') || params.has('at') || params.has('noattract'));
  const attract = { run: () => (skipAttract ? Promise.resolve() : sequence.run()), demo: () => sequence.demo() };
  // ?play and ?at= (development): straight into the game, placed where asked, the start's first key played.
  if (dev && (params.has('play') || params.has('at'))) {
    world.devLit = params.has('lit'); // ?lit: dungeons entered lit, to look at them
    const at = dev.parseAt(params.get('at'));
    const placed = at ? dev.startAt(world, at) : { key: null };
    if (typeof placed === 'string') console.warn(`?at=${params.get('at')}: ${placed}`);
    if (params.has('at') && !at) console.warn(`?at=${params.get('at')}: not a start (see devStarts.ts)`);
    if (world.party.formed && (!world.party.rulesPending || (await chooseRules(world, screen)))) {
      if (typeof placed !== 'string' && placed.key) keyboard.push(placed.key);
      await game.run();
    }
  }
  await mainMenu(world, screen, () => game.run(), {
    save: (w) => localSave.write(w),
    transfer,
    update,
    quit,
    attract,
  });
}

/**
 * Where a newer version is learnt of (ui/updates.ts): the desktop app's main process (preload.cjs u3native.updates),
 * the Android app's look at GitHub (its page opened by going to it, which Capacitor sends to the system browser), or
 * the web's service worker.
 */
function updateHook(plugins: { Quit?: NativeQuit } | undefined): UpdateHook {
  const desktop = (window as { u3native?: { updates?: DesktopUpdates } }).u3native?.updates;
  if (desktop) return desktopUpdates(desktop);
  const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined;
  if (!plugins?.Quit) return swUpdate;
  return androidUpdates({
    release: isRelease(appVersion) ? newerRelease(appVersion) : Promise.resolve(null),
    open: (url) => location.assign(url),
    told: {
      get: () => {
        try {
          return localStorage.getItem(UPDATE_TOLD_KEY);
        } catch {
          return null; // storage unavailable: told of each time the app starts
        }
      },
      set: (version) => {
        try {
          localStorage.setItem(UPDATE_TOLD_KEY, version);
        } catch {
          /* as above */
        }
      },
    },
  });
}

start().catch((err) => {
  console.error(err);
  canvasNotice(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
});

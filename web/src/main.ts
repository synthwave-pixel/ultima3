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
import { localSave, exportGame, parseExport, restore } from './game/save.ts';
import { registerSW } from 'virtual:pwa-register';
import type { Transfer, Update } from './game/menu.ts';
import { launchWarning, warningDue } from './ui/platform.ts';

const WARNED_KEY = 'ultima3.warned';
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
import { mainMenu } from './game/menu.ts';
import { GraphicsSet, loadImages } from './ui/graphics.ts';
import { Keyboard } from './ui/input.ts';
import { SoundPlayer, SOUND_SETS, type SoundSet } from './ui/sound.ts';
import { TouchPad } from './ui/touch.ts';
import { MusicPlayer } from './ui/music.ts';
import { Screen } from './ui/screen.ts';
import { TILE_SETS } from './ui/help.ts';

const PREFS_KEY = 'ultima3.settings';
const AUTOMAP_KEY = 'ultima3.automap';

/** What the Settings menu can change, as remembered between visits. */
interface Prefs {
  inputMode: 'keyboard' | 'controller';
  tiles: string;
  autoCombat: boolean;
  poisonKills: boolean;
  starvation: Starvation;
  balancedXp: boolean;
  /** The turn timer; Fast, the Apple II's, for games from before the setting. */
  timer: Timer;
  sound: boolean;
  soundSet: SoundSet;
  music: boolean;
  dungeonMap: MapMode;
  /** The virtual controller shown; on first visit, shown on a touch screen. */
  touchPad: boolean;
}

const DEFAULT_PREFS: Prefs = {
  inputMode: 'keyboard',
  tiles: 'Standard',
  autoCombat: false,
  poisonKills: false,
  starvation: 'mild',
  balancedXp: true,
  timer: 'fast',
  sound: true,
  soundSet: 'Standard',
  music: true,
  dungeonMap: 'off',
  touchPad: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    const prefs = { ...DEFAULT_PREFS, ...saved };
    if (!TILE_SETS.includes(prefs.tiles)) prefs.tiles = DEFAULT_PREFS.tiles;
    if (prefs.inputMode !== 'controller') prefs.inputMode = 'keyboard';
    if (!MAP_MODES.includes(prefs.dungeonMap)) prefs.dungeonMap = 'off';
    if (!STARVATION_MODES.includes(prefs.starvation)) prefs.starvation = 'mild';
    if (!TIMER_MODES.includes(prefs.timer)) prefs.timer = 'fast';
    if (!SOUND_SETS.includes(prefs.soundSet)) prefs.soundSet = 'Standard';
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

/** Text on the bare canvas before the game (or instead of it, on failure). */
function canvasNotice(text: string): void {
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
const update: Update = { ready: () => updateReady, apply: () => void applyUpdate(true) };

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
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  canvasNotice('Loading...');
  const params = new URLSearchParams(location.search);
  const prefs = loadPrefs();

  const [resources, gfx, images] = await Promise.all([loadResources(), GraphicsSet.load(prefs.tiles), loadImages()]);

  // The party never moves diagonally, as on the Apple II (the Mac's option stays in the code, unexposed).
  const world = new World(resources);
  world.setDiagonalMoves(false);
  world.autoCombat = prefs.autoCombat;
  world.poisonKills = prefs.poisonKills;
  world.starvation = prefs.starvation;
  world.balancedXp = prefs.balancedXp;
  world.timer = prefs.timer;
  world.soundEnabled = prefs.sound;
  world.mapMode = prefs.dungeonMap;
  // The dungeon auto-map keeps its own store; a new game starts it blank.
  world.autoMap = new AutoMap({ read: () => localStorage.getItem(AUTOMAP_KEY), write: (text) => localStorage.setItem(AUTOMAP_KEY, text) });

  // Resume the saved game unless the URL asks for a new one (?new).
  if (params.has('new') || !localSave.read(world)) {
    world.newGame();
    world.autoMap.clear();
  }

  const sounds = new SoundPlayer();
  sounds.set = prefs.soundSet;
  const music = new MusicPlayer();
  sounds.onLong = (seconds) => music.duck(seconds); // long effects duck the music
  music.enabled = prefs.music;
  const keyboard = new Keyboard();
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

  const screen = new Screen(canvas, gfx, images, keyboard, sounds, music, world);
  // ?controller starts in controller mode whatever was remembered (a Steam shortcut, a kiosk).
  screen.inputMode = params.has('controller') ? 'controller' : prefs.inputMode;
  screen.tileSetName = prefs.tiles;
  canvas.focus();

  // Whatever changes a setting (the menu, a gamepad press, Escape in a fight), remember it.
  const remember = () => {
    savePrefs({
      inputMode: screen.inputMode,
      tiles: screen.tileSetName,
      autoCombat: world.autoCombat,
      poisonKills: world.poisonKills,
      starvation: world.starvation,
      balancedXp: world.balancedXp,
      timer: world.timer,
      sound: world.soundEnabled,
      soundSet: sounds.set,
      music: music.enabled,
      dungeonMap: world.mapMode,
      touchPad: prefs.touchPad,
    });
  };
  screen.onSettingsChange = remember;
  world.onMapModeChange = remember;
  world.onRulesChange = remember;
  screen.onModeChange = remember;
  world.onAutoCombatChange = remember;

  // The virtual controller: a tap shows it, its close button (or a physical key or gamepad press) hides it.
  const pad = new TouchPad({
    keyboard,
    shown: prefs.touchPad,
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

  const game = new Game(world, screen, { save: (w) => localSave.write(w), load: (w) => localSave.read(w) });
  // Debug hook: lets the console (and the browser tests) inspect and poke the game.
  (window as unknown as { u3: unknown }).u3 = { world, screen, game, keyboard, update };
  // Export and import: the save and the auto-map as text, through the clipboard.
  const automapStore = () => ({
    read: () => localStorage.getItem(AUTOMAP_KEY),
    write: (text: string) => localStorage.setItem(AUTOMAP_KEY, text),
  });
  const transfer: Transfer = {
    export: () => (world.party.formed ? exportGame(world, localStorage.getItem(AUTOMAP_KEY)) : null),
    import: (text) => {
      let parsed: ReturnType<typeof parseExport>;
      try {
        parsed = parseExport(text);
      } catch (e) {
        return (e as Error).message;
      }
      if (!restore(world, parsed.save)) return 'the save does not fit';
      localSave.write(world);
      if (parsed.automap) localStorage.setItem(AUTOMAP_KEY, parsed.automap);
      else localStorage.removeItem(AUTOMAP_KEY);
      world.autoMap = new AutoMap(automapStore());
      return null;
    },
    clipboard: { write: (text) => navigator.clipboard.writeText(text), read: () => navigator.clipboard.readText() },
    file: { save: saveFile, load: pickFile },
  };
  await mainMenu(world, screen, () => game.run(), { save: (w) => localSave.write(w), transfer, update });
}

start().catch((err) => {
  console.error(err);
  canvasNotice(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
});

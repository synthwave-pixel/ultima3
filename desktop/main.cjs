// The desktop app: one window showing the built game from app/, served over a
// private app:// scheme so it behaves as a secure origin (storage, gamepads,
// clipboard) without a web server. No menu bar, so every key reaches the
// game; F11 or Alt+Enter toggles full screen, as do the system's own
// controls (the green button on macOS) and the touch pad's full-screen
// button (preload.cjs). The window starts full screen unless the player last
// left it a window, and always when Steam's Game Mode launched it
// (windowState.cjs). Under gamescope,
// Steam's Game Mode compositor, GPU acceleration and the Chromium sandbox
// are turned off: see below. Only one copy runs; a second launch brings the
// first window forward.
const { app, BrowserWindow, protocol, net, shell, session, ipcMain, screen } = require('electron');
const { join, normalize } = require('node:path');
const { pathToFileURL } = require('node:url');
const { writeFileSync, existsSync } = require('node:fs');
const { placeOnScreen, readState, startsFullScreen, writeState } = require('./windowState.cjs');
const updates = require('./updates.cjs');
const { installSteamArt } = require('./steamArt.cjs');
const { portableData } = require('./portable.cjs');
const { homedir } = require('node:os');

// The portable .exe's data beside it (portable.cjs), set before anything (the single-instance lock, the page's
// storage) uses it.
const beside = portableData({ env: process.env, old: app.getPath('userData') });
if (beside) app.setPath('userData', beside);

// Game Mode runs the app under the gamescope compositor, where Chromium's GPU process has hung whole sessions and
// its seccomp sandbox has killed apps Steam launched. The game is a 2D canvas that needs neither, so under gamescope
// both are off, and the window is X11 (XWayland), the path gamescope handles best. Desktop Mode is left alone.
const inGamescope = !!process.env.GAMESCOPE_WAYLAND_DISPLAY || /gamescope/i.test(process.env.XDG_CURRENT_DESKTOP ?? '');
if (inGamescope) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

const APP_DIR = join(__dirname, 'app');
const SCHEME = 'app';
const HOST = 'ultima3';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Where the window was last as a window, and whether it was last full screen (windowState.cjs). */
const stateFile = () => join(app.getPath('userData'), 'window.json');
function saveBounds(win) {
  if (!win.isFullScreen() && !win.isMaximized()) writeState(stateFile(), win.getBounds());
}

function createWindow() {
  const saved = readState(stateFile());
  // The place kept, fitted to the screens there are now (a monitor unplugged since, a smaller screen): see windowState.cjs.
  const place = placeOnScreen(
    { width: 1280, height: 800, ...saved },
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  );
  const win = new BrowserWindow({
    width: place.width,
    height: place.height,
    x: place.x,
    y: place.y,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    // Full screen at the start only when wanted. `fullscreen: false` said outright would also take full screen away on
    // macOS altogether (the green button, Window > Enter Full Screen, F11), so it is left unsaid otherwise.
    fullscreenable: true,
    ...(startsFullScreen(process.argv, process.env, saved) ? { fullscreen: true } : {}),
    title: 'Ultima III',
    icon: join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(__dirname, 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.on('resize', () => saveBounds(win));
  win.on('move', () => saveBounds(win));
  // However full screen came or went (F11, the system's controls, the touch pad's button), it is remembered for the
  // next start and told to the page, whose button shows it.
  for (const [event, on] of [
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ])
    win.on(event, () => {
      writeState(stateFile(), { fullScreen: on });
      if (!win.webContents.isDestroyed()) win.webContents.send('full-screen-changed', on);
    });
  // F11 and Alt+Enter toggle full screen; nothing else is intercepted, so Escape and the letters reach the game.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Links out of the game (there are none today) open in the system browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Query flags the game understands (?new, ?controller) pass through from the command line.
  const flags = process.argv.filter((a) => /^--(new|controller)$/.test(a)).map((a) => a.slice(2));
  void win.loadURL(`${SCHEME}://${HOST}/index.html${flags.length ? '?' + flags.join('&') : ''}`);
  return win;
}

// One copy at a time. A second launch (Steam starting the shortcut twice, or Play pressed again while the first copy
// was still coming up) brings the first window forward and quits, instead of opening a second game on the same save,
// where whichever copy saved last would silently overwrite the other. Under Flatpak the lock works across launches
// because the wrapper points TMPDIR, where Chromium keeps the lock's socket, at a directory the instances share.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// A newer release, asked for as the app starts, for the title menu's "Update (x.y.z)" (updates.cjs): the page asks for
// it (preload.cjs) and, chosen, has its page opened in the system browser.
const releaseOffer = updates.shouldCheck({
  packaged: app.isPackaged,
  env: process.env,
  argv: process.argv,
  version: app.getVersion(),
  gamescope: inGamescope,
})
  ? updates.newerRelease(app.getVersion())
  : Promise.resolve(null);
ipcMain.handle('update-offer', () => releaseOffer);
// The touch pad's full-screen button (preload.cjs): whether the window is full screen, set first if `on` is given.
// Only the game's own page may ask.
ipcMain.handle('full-screen', (event, on) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !String(event.senderFrame?.url ?? '').startsWith(`${SCHEME}://`)) return false;
  if (typeof on === 'boolean' && on !== win.isFullScreen()) win.setFullScreen(on);
  return win.isFullScreen();
});
ipcMain.handle('open-release', async () => {
  const offer = await releaseOffer;
  if (offer) await shell.openExternal(offer.url);
});

/** How long the smoke test waits for the game to start, and then for it to draw before the screenshot. */
const SMOKE_START_MS = 30_000;
const SMOKE_DRAW_MS = 3000;

/**
 * The smoke test's screenshot. The page asks for frames only when it has something to show (screen.ts, wake): on the
 * title screen none for seconds, and a capture with no frame coming can fail (UnknownVizError, under xvfb's software
 * compositing). So the page is kept drawing while it is taken - its opacity swung by a thousandth, invisible and apart
 * from the game - and a capture that fails anyway is tried again.
 */
async function smokeCapture(win) {
  await win.webContents.executeJavaScript(
    `document.documentElement.animate([{ opacity: 1 }, { opacity: 0.999 }], { duration: 250, direction: 'alternate', iterations: Infinity });
    new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))`,
  );
  for (let tries = 1; ; tries++) {
    try {
      return await win.webContents.capturePage();
    } catch (e) {
      if (tries === 5) throw e;
      console.warn(`smoke: capture failed (${e.message}), trying again`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

app.whenReady().then(() => {
  if (!primary) return; // quitting: see above
  // app://ultima3/<path> -> app/<path>, confined to that folder.
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';
    const file = normalize(join(APP_DIR, path));
    // Optional files the game probes for (a set's Mask, a scene) are simply absent: a quiet 404.
    if (!file.startsWith(APP_DIR) || !existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Nothing in the game needs a permission prompt; deny them all rather than show a dialog.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'));
  const win = createWindow();
  // Launched from a non-Steam shortcut, the first time: Steam's library artwork put in place (steamArt.cjs), a moment
  // after the window is up, apart from everything else. It never throws, and what it did is only logged.
  setTimeout(() => {
    installSteamArt({
      env: process.env,
      home: homedir(), // $HOME (the Flatpak's is the player's own home)
      platform: process.platform,
      artDir: join(__dirname, 'build', 'steam'),
      noteFile: join(app.getPath('userData'), 'steam-art.json'),
    })
      .then((r) => r.result !== 'not from a shortcut' && console.log('steam artwork:', JSON.stringify(r)))
      .catch(() => {});
  }, 3000);
  // A smoke test (smoke.cjs): wait for the game to start, screenshot it once drawn, then quit. The start is waited for
  // rather than given a fixed time: a slow CI runner took longer than six seconds, and the test failed with nothing
  // wrong. The page's errors and how long the start took go to the log, so a failure says why.
  const shot = process.env.ULTIMA3_SMOKE;
  if (shot) {
    win.webContents.on('console-message', (e, level, message) => {
      // Electron passes one event object now, (event, level, message) before.
      const [lvl, text] = [e.level ?? level, e.message ?? message];
      if (lvl === 'error' || lvl === 'warning' || lvl === 3 || lvl === 2) console.log(`smoke: page ${lvl}: ${text}`);
    });
    win.webContents.on('render-process-gone', (_e, details) => console.log(`smoke: page gone: ${details.reason}`));
    win.webContents.on('did-finish-load', async () => {
      const loaded = Date.now();
      try {
        let ok = false;
        while (!ok && Date.now() - loaded < SMOKE_START_MS) {
          await new Promise((r) => setTimeout(r, 500));
          ok = await win.webContents.executeJavaScript('!!(window.u3 && window.u3.world)');
        }
        console.log(`smoke: game ${ok ? 'started' : 'NOT started'} ${((Date.now() - loaded) / 1000).toFixed(1)} s after the page loaded`);
        if (ok) await new Promise((r) => setTimeout(r, SMOKE_DRAW_MS));
        const image = await smokeCapture(win);
        writeFileSync(shot, image.toPNG());
        console.log(`smoke: game ${ok ? 'running' : 'NOT running'}, screenshot ${shot}`);
        app.exit(ok ? 0 : 1);
      } catch (e) {
        console.error('smoke failed', e);
        app.exit(1);
      }
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

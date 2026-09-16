// The desktop app: one window showing the built game from app/, served over a
// private app:// scheme so it behaves as a secure origin (storage, gamepads,
// clipboard) without a web server. No menu bar, so every key reaches the
// game; F11 or Alt+Enter toggles full screen, and the window starts full
// screen when asked (--fullscreen) or when Steam launched it (the SteamDeck
// or SteamOS environment variables, set in Game Mode).
const { app, BrowserWindow, protocol, net, shell, session } = require('electron');
const { join, normalize } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');

const APP_DIR = join(__dirname, 'app');
const SCHEME = 'app';
const HOST = 'ultima3';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Where the window was last, so it comes back the same size. */
const boundsFile = () => join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    return JSON.parse(readFileSync(boundsFile(), 'utf8'));
  } catch {
    return null;
  }
}
function saveBounds(win) {
  try {
    if (!win.isFullScreen() && !win.isMaximized()) writeFileSync(boundsFile(), JSON.stringify(win.getBounds()));
  } catch {
    /* not fatal */
  }
}

function wantsFullScreen() {
  if (process.argv.includes('--windowed')) return false;
  if (process.argv.includes('--fullscreen')) return true;
  return process.env.SteamDeck === '1' || process.env.SteamOS === '1';
}

function createWindow() {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreen: wantsFullScreen(),
    title: 'Ultima III',
    icon: join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.on('resize', () => saveBounds(win));
  win.on('move', () => saveBounds(win));
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

app.whenReady().then(() => {
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
  // A smoke test (smoke.cjs): screenshot after the game has drawn, then quit.
  const shot = process.env.ULTIMA3_SMOKE;
  if (shot) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const ok = await win.webContents.executeJavaScript('!!(window.u3 && window.u3.world)');
          const image = await win.webContents.capturePage();
          writeFileSync(shot, image.toPNG());
          console.log(`smoke: game ${ok ? 'running' : 'NOT running'}, screenshot ${shot}`);
          app.exit(ok ? 0 : 1);
        } catch (e) {
          console.error('smoke failed', e);
          app.exit(1);
        }
      }, 6000);
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

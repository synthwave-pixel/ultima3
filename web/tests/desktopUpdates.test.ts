import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyUpdate,
  checkForUpdates,
  currentOffer,
  isNewer,
  lookForNews,
  newsSeen,
  currentNews,
  plainNotes,
  releaseNotes,
  onOffer,
  RELEASES,
  shouldNotice,
  steamLaunch,
  toldOfUpdate,
  updateKind,
} from '../../desktop/updates.cjs';

/** Updates from the GitHub releases (desktop/updates.cjs), as the Ultima V port's. */
describe('the desktop app’s updates', () => {
  const kind = (
    platform: string,
    env: Record<string, string> = {},
    packaged = true,
    argv: string[] = [],
    selfUpdate = false,
    inApplications = false,
  ) => updateKind({ packaged, platform, env, argv, selfUpdate, inApplications });

  it('install themselves where electron-updater can replace the copy: the Windows installer’s, the AppImage', () => {
    expect(kind('win32')).toBe('auto');
    expect(kind('linux', { APPIMAGE: '/home/deck/Ultima-III.AppImage' })).toBe('auto');
  });

  it('are told of where it cannot: the Windows portable .exe, and a Mac build not signed for release', () => {
    expect(kind('darwin')).toBe('notice');
    expect(kind('darwin', {}, true, [], false, true)).toBe('notice'); // ad hoc (a local or a fork's build), in Applications
    expect(kind('win32', { PORTABLE_EXECUTABLE_DIR: 'D:\\\\Games' })).toBe('notice');
  });

  it('on a Mac, install themselves in a release build run from Applications - told of where run from elsewhere', () => {
    expect(kind('darwin', {}, true, [], true, true)).toBe('auto');
    // From the disk image, or Downloads (macOS runs it from a read-only copy there): the app cannot be replaced.
    expect(kind('darwin', {}, true, [], true, false)).toBe('notice');
    expect(kind('darwin', {}, true, ['--no-update-check'], true, true)).toBe('none');
  });

  it('in the Flatpak, go through its update portal (flatpakUpdates.cjs)', () => {
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima3', APPIMAGE: '/x' })).toBe('flatpak');
    expect(kind('linux', { container: 'flatpak' })).toBe('flatpak');
  });

  it('are only told of with --no-auto-update, on every desktop build - nothing downloaded or installed', () => {
    const no = ['--no-auto-update'];
    expect(kind('linux', { APPIMAGE: '/home/deck/Ultima-III-x86_64.AppImage' }, true, no)).toBe('notice');
    expect(kind('win32', {}, true, no)).toBe('notice');
    expect(kind('darwin', {}, true, no, true, true)).toBe('notice');
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima3' }, true, no)).toBe('notice');
    // --no-update-check still says nothing at all; unpackaged, nothing either way.
    expect(kind('win32', {}, true, [...no, '--no-update-check'])).toBe('none');
    expect(kind('win32', {}, false, no)).toBe('none');
  });

  it('are left alone unpackaged, and when told not to look', () => {
    expect(kind('linux', { FLATPAK_ID: 'com.synthwavepixel.ultima3' }, false)).toBe('none');
    expect(kind('win32', {}, false)).toBe('none');
    expect(kind('darwin', {}, true, ['--no-update-check'])).toBe('none');
  });

  it('compare versions as the releases number them, a development build never', () => {
    expect(isNewer('1.1.12', '1.1.10')).toBe(true);
    expect(isNewer('v1.1.12', '1.1.12')).toBe(false);
    expect(isNewer('1.1.9', '1.1.10')).toBe(false); // by number, not as text
    expect(isNewer('1.2.0', '1.1.99')).toBe(true);
    expect(isNewer('1.1.0', '1.1.0-dev.20261008.1700')).toBe(false);
    expect(isNewer('', '1.1.10')).toBe(false);
  });

  it('are left alone in a copy built locally (a development version), as before', () => {
    const where = { packaged: true, platform: 'win32', env: {}, argv: [] };
    expect(updateKind({ ...where, version: '1.0.0-dev.20261010.1200' })).toBe('none');
    expect(updateKind({ ...where, version: '1.0.86' })).toBe('auto');
  });

  it('know a copy Steam launched: a non-Steam shortcut, or a Steam app', () => {
    expect(steamLaunch({ SteamGameId: '12345678901234567890' })).toBe(true);
    expect(steamLaunch({ SteamAppId: '0', SteamOverlayGameId: '9876543210' })).toBe(true);
    expect(steamLaunch({ SteamAppId: '0' })).toBe(false);
    expect(steamLaunch({})).toBe(false);
  });

  it('tell of each newer release once', () => {
    expect(shouldNotice('1.1.12', '1.1.10', null)).toBe(true);
    expect(shouldNotice('1.1.12', '1.1.10', '1.1.12')).toBe(false); // told already
    expect(shouldNotice('1.1.13', '1.1.10', '1.1.12')).toBe(true); // a newer one since
    expect(shouldNotice('1.1.10', '1.1.10', null)).toBe(false); // up to date
  });

  it('tell the game of a newer release, its page opened from the game, told of once - nothing up to date or offline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const file = join(dir, 'updates.json');
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      let latest = 'v1.1.12';
      let reachable = true;
      const opened: string[] = [];
      const seen: unknown[] = [];
      onOffer((o: unknown) => seen.push(o));
      const electron = {
        app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir },
        net: {
          fetch: async () => {
            if (!reachable) throw new Error('offline');
            return { ok: true, json: async () => ({ tag_name: latest }) };
          },
        },
        shell: { openExternal: async (url: string) => void opened.push(url) },
      };
      const look = (quiet = false) => checkForUpdates({ electron, quiet, file });
      await look();
      expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.12', current: '1.1.10', told: false });
      expect(seen).toHaveLength(1);
      // The game's box shown: told, and kept so; its Open release page.
      toldOfUpdate({ file });
      expect(currentOffer()?.told).toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ noticed: '1.1.12' });
      expect(applyUpdate({ electron })).toBe(true);
      expect(opened).toEqual([RELEASES]);
      // Looked again, the same release: told already.
      await look();
      expect(currentOffer()?.told).toBe(true);
      // A newer one since: to be told of.
      latest = 'v1.1.13';
      await look(true); // Game Mode: no page offered
      expect(currentOffer()?.version).toBe('1.1.12');
      reachable = false;
      await look(); // offline: only logged
      expect(currentOffer()?.version).toBe('1.1.12');
      reachable = true;
      await look();
      expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.13', current: '1.1.10', told: false });
    } finally {
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never offers a pre-release: electron-updater is told so', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'win32' });
    // electron-updater is loaded with require inside updates.cjs, so its cache entry is what gets stubbed.
    const path = createRequire(join(process.cwd(), '../desktop/updates.cjs')).resolve('electron-updater');
    const real = require.cache[path];
    const autoUpdater = { allowPrerelease: true, on: () => {}, checkForUpdates: async () => null };
    require.cache[path] = { id: path, filename: path, loaded: true, exports: { autoUpdater } } as never;
    try {
      const electron = { app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir }, net: {} };
      await checkForUpdates({ electron, quiet: false, file: join(dir, 'updates.json') });
      expect(autoUpdater.allowPrerelease).toBe(false);
    } finally {
      if (real) require.cache[path] = real;
      else delete require.cache[path];
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('on a Mac, look for a release build with electron-updater, and tell of a newer release where it fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const path = createRequire(join(process.cwd(), '../desktop/updates.cjs')).resolve('electron-updater');
    const real = require.cache[path];
    let looked = 0;
    let failed: (e: Error) => void = () => {};
    const autoUpdater = {
      on: (name: string, fn: typeof failed) => name === 'error' && (failed = fn),
      checkForUpdates: async () => {
        looked++;
        failed(new Error('Code signature did not match'));
        throw new Error('Code signature did not match');
      },
    };
    require.cache[path] = { id: path, filename: path, loaded: true, exports: { autoUpdater } } as never;
    try {
      const electron = {
        app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir, isInApplicationsFolder: () => true },
        net: { fetch: async () => ({ ok: true, json: async () => ({ tag_name: 'v1.1.12' }) }) },
      };
      await checkForUpdates({ electron, quiet: false, file: join(dir, 'updates.json'), selfUpdate: true });
      expect(looked).toBe(1);
      expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.12', current: '1.1.10', told: false });
    } finally {
      if (real) require.cache[path] = real;
      else delete require.cache[path];
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('in a Steam launch, only install a downloaded build as the game quits: no restart into it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const path = createRequire(join(process.cwd(), '../desktop/updates.cjs')).resolve('electron-updater');
    const real = require.cache[path];
    let installs = 0;
    let downloaded: (info: { version: string }) => void = () => {};
    const autoUpdater = {
      autoInstallOnAppQuit: false,
      allowPrerelease: true,
      on: (name: string, fn: typeof downloaded) => name === 'update-downloaded' && (downloaded = fn),
      checkForUpdates: async () => null,
      quitAndInstall: () => void (installs++, order.push('install')),
    };
    const order: string[] = [];
    require.cache[path] = { id: path, filename: path, loaded: true, exports: { autoUpdater } } as never;
    try {
      const electron = {
        app: {
          isPackaged: true,
          getVersion: () => '1.1.10',
          getPath: () => dir,
          quit: () => {},
          releaseSingleInstanceLock: () => void order.push('release'),
        },
        net: {},
      };
      await checkForUpdates({ electron, quiet: false, file: join(dir, 'updates.json'), steam: true });
      downloaded({ version: '1.1.12' });
      expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(currentOffer()).toEqual({ kind: 'restart', onQuit: true, version: '1.1.12', current: '1.1.10', told: false });
      expect(applyUpdate({ electron, steam: true })).toBe(false);
      expect(installs).toBe(0);
      // Outside Steam the same offer restarts into the build.
      await checkForUpdates({ electron, quiet: false, file: join(dir, 'updates.json') });
      downloaded({ version: '1.1.12' });
      expect(currentOffer()?.onQuit).toBeUndefined();
      expect(applyUpdate({ electron })).toBe(true);
      expect(installs).toBe(1);
      // The one-copy lock let go before the new version starts, so that it isn't turned away as a second copy.
      expect(order).toEqual(['release', 'install']);
    } finally {
      if (real) require.cache[path] = real;
      else delete require.cache[path];
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the AppImage’s file name carries no version, so an update overwrites it in place', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'desktop', 'package.json'), 'utf8')) as {
      build: { appImage: { artifactName: string } };
    };
    expect(pkg.build.appImage.artifactName).toBe('Ultima-III-${arch}.${ext}');
    expect(pkg.build.appImage.artifactName).not.toContain('${version}');
  });

  it('register no appimage-filename-updated handler: the AppImage keeps its path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const was = { platform: process.platform };
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const env = { ...process.env };
    process.env.APPIMAGE = join(dir, 'Ultima-III-x86_64.AppImage');
    const path = createRequire(join(process.cwd(), '../desktop/updates.cjs')).resolve('electron-updater');
    const real = require.cache[path];
    const handlers = new Map<string, unknown>();
    const autoUpdater = {
      on: (name: string, fn: unknown) => void handlers.set(name, fn),
      checkForUpdates: async () => null,
    };
    require.cache[path] = { id: path, filename: path, loaded: true, exports: { autoUpdater } } as never;
    try {
      const electron = { app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir }, net: {} };
      await checkForUpdates({ electron, quiet: false, file: join(dir, 'updates.json') });
      expect(handlers.has('update-downloaded')).toBe(true);
      expect([...handlers.keys()]).not.toContain('appimage-filename-updated');
    } finally {
      if (real) require.cache[path] = real;
      else delete require.cache[path];
      process.env = env;
      Object.defineProperty(process, 'platform', { value: was.platform });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('in a Steam launch, never start the Flatpak’s new version: the update only quits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-updates-'));
    const wasId = process.env.FLATPAK_ID;
    process.env.FLATPAK_ID = 'com.synthwavepixel.ultima3';
    try {
      let spawned = 0;
      let quits = 0;
      let installed: () => void = () => {};
      const flatpak = {
        connect: async () => ({ spawnLatest: async () => void spawned++ }),
        watch: async (o: { installed: () => void }) => void (installed = o.installed),
      };
      const electron = {
        app: { isPackaged: true, getVersion: () => '1.1.10', getPath: () => dir, quit: () => void quits++ },
        net: { fetch: async () => ({ ok: true, json: async () => ({ tag_name: 'v1.1.12' }) }) },
      };
      await checkForUpdates({
        electron,
        quiet: false,
        file: join(dir, 'updates.json'),
        steam: true,
        flatpak: flatpak as never,
      });
      installed();
      expect(currentOffer()).toMatchObject({ kind: 'restart', installed: true, quits: true, version: '1.1.12' });
      expect(applyUpdate({ electron, steam: true })).toBe(true);
      expect(quits).toBe(1);
      expect(spawned).toBe(0);
    } finally {
      if (wasId === undefined) delete process.env.FLATPAK_ID;
      else process.env.FLATPAK_ID = wasId;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('say, once, that this is the first start of a newer version - not on the first run, nor running unpackaged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'u3-news-'));
    const file = join(dir, 'updates.json');
    try {
      const app = (version: string, isPackaged = true) => ({ app: { isPackaged, getVersion: () => version }, file });
      expect(lookForNews(app('1.1.166'))).toBeNull(); // the first run: nothing to compare with
      expect(lookForNews(app('1.1.166'))).toBeNull(); // the same again
      expect(lookForNews(app('1.1.168'))).toEqual({ version: '1.1.168', from: '1.1.166' });
      expect(currentNews()).toEqual({ version: '1.1.168', from: '1.1.166' });
      newsSeen();
      expect(currentNews()).toBeNull();
      expect(lookForNews(app('1.1.168'))).toBeNull(); // started again: said already
      expect(lookForNews(app('1.1.170', false))).toBeNull(); // a development run
      // Kept beside the release last told of, not over it.
      writeFileSync(file, JSON.stringify({ noticed: '1.1.170', lastRun: '1.1.168' }));
      lookForNews(app('1.1.170'));
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ noticed: '1.1.170', lastRun: '1.1.170' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('give a release’s notes as plain lines, its Markdown and compare link let go; none offline', async () => {
    expect(
      plainNotes('### Menus\n\n- **The command menu** sits low ([why](https://x)).\n  - `Sh. Sword`\n\n\n**Full Changelog**: https://y'),
    ).toBe('Menus\n\n- The command menu sits low (why).\n  - Sh. Sword');
    const net = (ok: boolean) => ({
      fetch: async (url: string) => {
        if (!ok) throw new Error('offline');
        expect(url).toMatch(/\/releases\/tags\/v1\.1\.168$/);
        return { ok: true, json: async () => ({ body: '### Rules\n- **999** arrows' }) };
      },
    });
    expect(await releaseNotes({ net: net(true), version: '1.1.168' })).toBe('Rules\n- 999 arrows');
    expect(await releaseNotes({ net: net(false), version: '1.1.168' })).toBeNull();
  });

  it('has the network in the Flatpak: GitHub’s newest release, and a release’s notes, are looked for from inside it', () => {
    // Without it Chromium sees no network at all (net::ERR_INTERNET_DISCONNECTED) and the update waits on the portal's
    // own look. The portal will not take an update that adds a permission: this one came by Discover.
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'desktop', 'package.json'), 'utf8')) as {
      build: { flatpak: { finishArgs: string[] } };
    };
    expect(pkg.build.flatpak.finishArgs).toContain('--share=network');
  });
});

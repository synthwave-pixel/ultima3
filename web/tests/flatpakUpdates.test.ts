import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connect,
  reason,
  STATUS,
  watch,
  type Available,
  type PortalConnection,
  type UpdateMonitor,
} from '../../desktop/flatpakUpdates.cjs';
import { applyUpdate, checkForUpdates, closeUpdates, currentOffer, updating } from '../../desktop/updates.cjs';

/** A portal of our own: what was asked of it, and its signals to send. */
function fakePortal() {
  const asked = { updates: 0, spawned: 0, closed: 0 };
  const send = {
    available: (_info?: Available) => {},
    progress: (_p: { status: number; error?: string; error_message?: string }) => {},
  };
  const monitor: UpdateMonitor = {
    onAvailable: (fn) => void (send.available = fn),
    onProgress: (fn) => void (send.progress = fn),
    update: async () => void asked.updates++,
    close: async () => void asked.closed++,
  };
  const portal: PortalConnection = { createMonitor: async () => monitor, spawnLatest: async () => void asked.spawned++ };
  return { asked, send, portal };
}

/** The Flatpak's updates through Flatpak's update portal (desktop/flatpakUpdates.cjs, updates.cjs). */
describe('the Flatpak’s updates', () => {
  let dir = '';
  const was = { platform: process.platform, flatpak: process.env.FLATPAK_ID };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'u3-flatpak-'));
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.FLATPAK_ID = 'com.synthwavepixel.ultima3';
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: was.platform });
    if (was.flatpak === undefined) delete process.env.FLATPAK_ID;
    else process.env.FLATPAK_ID = was.flatpak;
    rmSync(dir, { recursive: true, force: true });
  });

  /** The app, GitHub's newest release `latest` (null: offline), and a look through `portal` (null: none to be had). */
  const look = async (latest: string | null, portal: PortalConnection | null, quiet = false) => {
    const quits = { n: 0 };
    const electron = {
      app: { isPackaged: true, getVersion: () => '1.1.10', quit: () => void quits.n++ },
      net: {
        fetch: async () => {
          if (latest === null) throw new Error('offline');
          return { ok: true, json: async () => ({ tag_name: `v${latest}` }) };
        },
      },
      shell: { openExternal: async () => undefined },
    };
    await checkForUpdates({ electron, quiet, file: join(dir, 'updates.json'), flatpak: { connect: async () => portal, watch } });
    return { electron, quits };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /** The once-only approval given already (updates.json), as at any start but the first at the desktop. */
  const allow = () => writeFileSync(join(dir, 'updates.json'), JSON.stringify({ approved: true }));
  /** What updates.json keeps. */
  const kept = (): { lastError?: unknown } => JSON.parse(readFileSync(join(dir, 'updates.json'), 'utf8')) as { lastError?: unknown };

  it('asks for the newer release at once, waits for the repository, and offers the restart into it', async () => {
    const { asked, send, portal } = fakePortal();
    const { electron, quits } = await look('1.1.12', portal);
    expect(asked.updates).toBe(1);
    // The repository not yet holding it (the Pages deploy behind the release): asked again when the portal sees it.
    send.progress({ status: STATUS.empty });
    send.available();
    expect(asked.updates).toBe(2);
    send.progress({ status: STATUS.running });
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toEqual({ kind: 'restart', installed: true, quits: false, version: '1.1.12', current: '1.1.10', told: false });
    // Restart now: the newest version started, this one gone.
    expect(applyUpdate({ electron })).toBe(true);
    await settle();
    expect(asked.spawned).toBe(1);
    expect(quits.n).toBe(1);
    // Nothing more once installed.
    send.available();
    expect(asked.updates).toBe(2);
  });

  it('under Game Mode, takes the update up by quitting only, to be started again from Steam', async () => {
    const { asked, send, portal } = fakePortal();
    const { electron, quits } = await look('1.1.12', portal, true);
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toMatchObject({ kind: 'restart', installed: true, quits: true });
    applyUpdate({ electron });
    await settle();
    expect(asked.spawned).toBe(0);
    expect(quits.n).toBe(1);
  });

  it('up to date (or offline), waits for the portal to see a newer one', async () => {
    const { asked, send, portal } = fakePortal();
    allow();
    await look(null, portal);
    expect(asked.updates).toBe(0);
    send.available();
    expect(asked.updates).toBe(1);
    send.progress({ status: STATUS.done });
    expect(currentOffer()).toEqual({ kind: 'restart', installed: true, quits: false, current: '1.1.10', told: false });
  });

  it('without the portal, tells of the release instead - its page, or under Game Mode only the way to it', async () => {
    await look('1.1.13', null);
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.13', current: '1.1.10', told: false });
    const { electron } = await look('1.1.14', null, true);
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.14', current: '1.1.10', told: false, page: false });
    expect(applyUpdate({ electron })).toBe(false); // nothing to open
  });

  it('says while an update is coming down, for a quit to wait for it (main.cjs), and when it ends', async () => {
    const { send, portal } = fakePortal();
    await look('1.1.16', portal);
    const pending = updating();
    expect(pending).not.toBeNull();
    let ended = false;
    void pending!.then(() => (ended = true));
    send.progress({ status: STATUS.running });
    await settle();
    expect(ended).toBe(false);
    send.progress({ status: STATUS.done });
    await settle();
    expect(ended).toBe(true);
    expect(updating()).toBeNull();
  });

  it('when the update fails, tells of the release instead', async () => {
    const { send, portal } = fakePortal();
    await look('1.1.15', portal);
    send.progress({ status: STATUS.error, error_message: 'no space' });
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.15', current: '1.1.10', told: false });
  });

  // UpdateAvailable's commits (flatpak-portal.c): the portal's first look says them whether anything is newer or not.
  const C = (running: string, local: string, remote: string): Available => ({
    'running-commit': running,
    'local-commit': local,
    'remote-commit': remote,
  });

  it('asks for nothing when the portal’s look finds nothing newer - the approval never asked for no update', async () => {
    const { asked, send, portal } = fakePortal();
    allow();
    await look(null, portal);
    const before = currentOffer();
    send.available(C('a', 'a', 'a'));
    expect(asked.updates).toBe(0);
    expect(currentOffer()).toBe(before); // nothing said
    // The remote's commit beyond the deployed one: asked for.
    send.available(C('a', 'a', 'b'));
    expect(asked.updates).toBe(1);
  });

  it('tells of an update deployed already (by Discover, while playing) without asking for it again', async () => {
    const { asked, send, portal } = fakePortal();
    allow();
    await look(null, portal);
    send.available(C('a', 'b', 'b'));
    expect(asked.updates).toBe(0);
    expect(currentOffer()).toEqual({ kind: 'restart', installed: true, quits: false, current: '1.1.10', told: false });
  });

  it('under Game Mode, where the once-only approval cannot be asked, says to give it in Desktop Mode, and keeps why', async () => {
    const { send, portal } = fakePortal();
    await look('1.1.17', portal, true);
    send.progress({ status: STATUS.error, error: 'org.freedesktop.DBus.Error.NotSupported', error_message: 'No portal support found' });
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.17', current: '1.1.10', told: false, page: false, why: 'approve' });
    expect(kept().lastError).toMatchObject({ message: 'No portal support found', why: 'approve', version: '1.1.17', quiet: true });
    // Then allowed and installed: the failure let go.
    const again = fakePortal();
    await look('1.1.17', again.portal, true);
    again.send.progress({ status: STATUS.done });
    expect(kept().lastError).toBeNull();
  });

  it('turned down, says how to allow it again; a release asking for more permissions, Discover', async () => {
    const a = fakePortal();
    await look('1.1.18', a.portal, true);
    a.send.progress({
      status: STATUS.error,
      error: 'org.freedesktop.DBus.Error.AccessDenied',
      error_message: 'Application update not allowed',
    });
    expect(currentOffer()).toMatchObject({ page: false, why: 'denied' });
    const b = fakePortal();
    await look('1.1.19', b.portal, true);
    b.send.progress({
      status: STATUS.error,
      error: 'org.freedesktop.DBus.Error.Failed',
      error_message: 'Self update not supported, new version requires new permissions',
    });
    expect(currentOffer()).toEqual({ kind: 'release', version: '1.1.19', current: '1.1.10', told: false, page: false });
  });

  it('asks the once-only approval at the first start at the desktop, nothing newer needed, and then no more', async () => {
    const first = fakePortal();
    await look(null, first.portal);
    expect(first.asked.updates).toBe(1); // the portal asks the player before it looks for anything
    first.send.progress({ status: STATUS.empty }); // allowed; nothing to update
    expect(kept()).toMatchObject({ approved: true });
    const next = fakePortal();
    await look(null, next.portal);
    expect(next.asked.updates).toBe(0);
    // Turned down there: kept, and nothing told of with nothing newer out.
    rmSync(join(dir, 'updates.json'));
    const denied = fakePortal();
    await look(null, denied.portal);
    denied.send.progress({
      status: STATUS.error,
      error: 'org.freedesktop.DBus.Error.AccessDenied',
      error_message: 'Application update not allowed',
    });
    expect(kept()).toMatchObject({ lastError: { why: 'denied' } });
    expect(kept()).not.toHaveProperty('approved');
  });

  it('never asks it under Game Mode, where the dialog may not be shown, unless there is an update', async () => {
    const { asked, portal } = fakePortal();
    await look(null, portal, true);
    expect(asked.updates).toBe(0);
  });

  it('names why an update failed from the portal’s error', () => {
    expect(reason('org.freedesktop.DBus.Error.NotSupported', 'No portal support found')).toBe('approve');
    expect(reason('org.freedesktop.DBus.Error.Failed', 'Failed to show access dialog')).toBe('approve');
    expect(reason('org.freedesktop.DBus.Error.ServiceUnknown')).toBe('approve');
    expect(reason('org.freedesktop.DBus.Error.AccessDenied', 'Application update not allowed')).toBe('denied');
    expect(reason('org.freedesktop.DBus.Error.Failed', 'Self update not supported, new version requires new permissions')).toBe(
      'permissions',
    );
    expect(reason('org.freedesktop.DBus.Error.Failed', 'No space left on device')).toBe('other');
    expect(reason()).toBe('other');
  });

  it('lets the monitor go as the game quits', async () => {
    const { asked, portal } = fakePortal();
    await look(null, portal);
    await closeUpdates();
    expect(asked.closed).toBe(1);
    await closeUpdates(); // once only
    expect(asked.closed).toBe(1);
  });
});

/** The D-Bus side (flatpakUpdates.cjs connect), against a bus of our own. */
describe('Flatpak’s update portal, on the bus', () => {
  const bus = (version: number) => {
    const calls: unknown[][] = [];
    const objects: string[] = [];
    const signals: Record<string, (info: unknown) => void> = {};
    const dbus = {
      sessionBus: () => ({
        disconnect: () => calls.push(['disconnect']),
        getProxyObject: async (_name: string, path: string) => {
          objects.push(path);
          return {
            getInterface: (iface: string) =>
              iface === 'org.freedesktop.DBus.Properties'
                ? { Get: async () => ({ value: version }) }
                : iface === 'org.freedesktop.portal.Flatpak'
                  ? {
                      CreateUpdateMonitor: async (o: unknown) => (calls.push(['CreateUpdateMonitor', o]), '/monitor/1'),
                      Spawn: async (...a: unknown[]) => void calls.push(['Spawn', ...a]),
                    }
                  : {
                      on: (name: string, fn: (info: unknown) => void) => void (signals[name] = fn),
                      Update: async (...a: unknown[]) => void calls.push(['Update', ...a]),
                      Close: async () => void calls.push(['Close']),
                    },
          };
        },
      }),
    };
    return { dbus, calls, objects, signals };
  };

  it('is not had from a portal too old for update monitors', async () => {
    const { dbus, calls } = bus(3);
    expect(await connect({ dbus })).toBeNull();
    expect(calls).toEqual([['disconnect']]);
  });

  it('makes a monitor, asks it to update, reads its progress, and spawns the newest version', async () => {
    const { dbus, calls, objects, signals } = bus(6);
    const portal = (await connect({ dbus }))!;
    const monitor = await portal.createMonitor();
    expect(objects).toEqual(['/org/freedesktop/portal/Flatpak', '/monitor/1']);
    const seen: unknown[] = [];
    monitor.onProgress((p) => seen.push(p));
    signals.Progress({ status: { signature: 'u', value: 2 }, n_ops: { signature: 'u', value: 1 } });
    expect(seen).toEqual([{ status: 2, n_ops: 1 }]);
    const found: unknown[] = [];
    monitor.onAvailable((info) => found.push(info));
    signals.UpdateAvailable({ 'local-commit': { signature: 's', value: 'a' }, 'remote-commit': { signature: 's', value: 'b' } });
    expect(found).toEqual([{ 'local-commit': 'a', 'remote-commit': 'b' }]);
    await monitor.update();
    await portal.spawnLatest();
    await monitor.close?.();
    expect(calls).toEqual([
      ['CreateUpdateMonitor', {}],
      ['Update', '', {}],
      ['Spawn', Buffer.from('/\0'), [Buffer.from('electron-wrapper\0')], {}, {}, 2, {}],
      ['Close'],
    ]);
  });
});

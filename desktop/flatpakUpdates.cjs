// The Flatpak's own updates (updates.cjs), through Flatpak's update portal - org.freedesktop.portal.Flatpak, which
// every Flatpak may talk to without a permission of its own. Discover updates a Flatpak only in Desktop Mode, so on a
// Steam Deck played in Game Mode a release would otherwise wait for the player's trip to the desktop. The portal lets
// the app ask, from inside its sandbox, for its own newer commit to be pulled from the remote it was installed from
// (here the site's signed repository, flatpak-repo.sh) and deployed beside the running one, verified as flatpak
// verifies any update; the copy playing keeps running, and the next start is the new version.
//
//   1. CreateUpdateMonitor: an UpdateMonitor object for this app, whose UpdateAvailable signal the portal sends when
//      it looks at the remote (half an hour after the monitor is made, and every half hour) and finds something changed
//      - its first look always, newer or not - with the commits running, deployed (local) and on the remote.
//   2. Update on that monitor, when the remote's commit is newer than the deployed one - or at once, when GitHub's
//      newest release is newer than this copy (the portal's own look is half an hour away). One deployed already (by
//      Discover, while the game played) is only told of. Its Progress signal says how it goes: running (0), nothing to
//      do (1: the repository not yet holding the release, the Pages deploy a few minutes behind it; the portal's signal
//      comes when it does), done (2), failed (3, with the D-Bus error's name and message).
//
// The first Update asks the player, once: "Update Ultima III?", through the desktop's Access portal, the answer kept in
// the permission store (table flatpak, id updates; flatpak permission-show) and never asked again. Under Steam's
// Game Mode there may be no Access portal to ask it (gamescope's holo portal) and the update fails; started once in
// Desktop Mode and allowed there, the game updates itself in Game Mode from then on - which the player is told
// (updates.cjs, the reason the update failed: approve). The question comes before the portal looks for anything to
// update, so the game asks it at its first start at the desktop (watch's `approve`), an Update with nothing newer -
// answered there, where it can be, rather than at the first release, in Game Mode, where it may not. Turned down, it is never asked again, and the player is told
// how to allow it (denied); a release asking for a permission the installed one lacks is never self-updated
// (Discover).
//   3. Done: the game is told the update is installed, and a restart plays it - Spawn with FLATPAK_SPAWN_FLAGS_LATEST_
//      VERSION starts the newest deployed version in a sandbox of its own, and this one quits. Under Steam's Game Mode
//      the restart is only a quit: a game started outside Steam is not shown there, so the player starts it again from
//      the library.
//
// Where the portal cannot be had - an old flatpak (no UpdateMonitor before the portal's version 4), no session bus -
// or the update fails, connect() or watch() says so and updates.cjs falls back to telling the player of the release.
// The signals come only to the connection that made the monitor, so the D-Bus talk is in process (@particle/dbus-next),
// not through gdbus.

const PORTAL = 'org.freedesktop.portal.Flatpak';
const PORTAL_PATH = '/org/freedesktop/portal/Flatpak';
const MONITOR = 'org.freedesktop.portal.Flatpak.UpdateMonitor';
/** The portal version that has UpdateMonitor. */
const MONITOR_VERSION = 4;
/** Spawn's flag for the newest deployed version of the app (flatpak-portal.h). */
const SPAWN_LATEST_VERSION = 2;
/** The command the Flatpak runs the app by (electron-builder's flatpak target: /app/bin/electron-wrapper). */
const COMMAND = 'electron-wrapper';
/** Progress's status. */
const STATUS = { running: 0, empty: 1, done: 2, error: 3 };

/** A string as D-Bus's `ay` takes a path or an argument: its bytes, NUL-ended. */
const bytes = (s) => Buffer.from(`${s}\0`);

/**
 * The portal, through the session bus: { createMonitor, spawnLatest }, or null where it cannot be had (no bus, no
 * portal, one too old for update monitors). `dbus` is @particle/dbus-next (tests give their own).
 */
async function connect({ dbus = require('@particle/dbus-next') } = {}) {
  let bus;
  try {
    bus = dbus.sessionBus();
    const obj = await bus.getProxyObject(PORTAL, PORTAL_PATH);
    const portal = obj.getInterface(PORTAL);
    const version = Number((await obj.getInterface('org.freedesktop.DBus.Properties').Get(PORTAL, 'version')).value);
    if (!(version >= MONITOR_VERSION)) throw new Error(`the portal is version ${version}, without update monitors`);
    return {
      /** A monitor: { onAvailable(fn), onProgress(fn), update() }. */
      async createMonitor() {
        const handle = await portal.CreateUpdateMonitor({});
        const monitor = (await bus.getProxyObject(PORTAL, handle)).getInterface(MONITOR);
        return {
          onAvailable: (fn) => monitor.on('UpdateAvailable', (info) => fn(plain(info))),
          onProgress: (fn) => monitor.on('Progress', (info) => fn(plain(info))),
          update: () => monitor.Update('', {}),
          close: () => monitor.Close().catch(() => {}),
        };
      },
      /** The newest deployed version started, in its own sandbox. */
      spawnLatest: () => portal.Spawn(bytes('/'), [bytes(COMMAND)], {}, {}, SPAWN_LATEST_VERSION, {}),
    };
  } catch (e) {
    console.warn('flatpak update portal:', e?.message ?? e);
    bus?.disconnect();
    return null;
  }
}

/** An a{sv} as plain values: { status: 2, error_message: '...' }. */
function plain(info) {
  const out = {};
  for (const [k, v] of Object.entries(info ?? {})) out[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return out;
}

/**
 * Why an update failed, from the D-Bus error Progress gives (flatpak-portal.c request_update_permissions_sync): the
 * player's once-only approval could not be asked (no Access portal, as under Game Mode) - 'approve'; it was turned
 * down - 'denied'; the release asks for a permission this one lacks - 'permissions'; anything else (the network, the
 * disk) - 'other'.
 */
function reason(name = '', message = '') {
  if (/AccessDenied$/.test(name)) return 'denied';
  if (/new permissions/i.test(message)) return 'permissions';
  if (/(NotSupported|ServiceUnknown|NoReply|UnknownMethod|NameHasNoOwner)$/.test(name) || /access dialog|portal support/i.test(message))
    return 'approve';
  return 'other';
}

/**
 * Keep this copy up to date through `portal` (connect's): an update asked for when the portal sees a newer commit on
 * the remote, or at once when `newer` (GitHub's newest release is newer than this copy) or `approve` (the player's
 * approval to be asked, nothing newer needed); `installed()` when one is deployed (or found deployed already),
 * `allowed()` when an update gets past the approval, `failed(message, why)` when one fails (why: reason's), and
 * `busy(true|false)` as one starts and ends (updates.cjs holds the game's quitting for it). One at a time; nothing
 * more once installed.
 */
async function watch({ portal, newer, approve = false, installed, failed, allowed = () => {}, busy: told = () => {} }) {
  const monitor = await portal.createMonitor();
  let busy = false;
  let done = false;
  const setBusy = (b) => {
    if (b === busy) return;
    busy = b;
    told(b);
  };
  const update = () => {
    if (busy || done) return;
    setBusy(true);
    monitor.update().catch((e) => {
      setBusy(false);
      failed(e?.message ?? String(e), reason(e?.type ?? e?.name, e?.message));
    });
  };
  // What the portal's look found: the remote's commit beyond the deployed one, an update to ask for; the deployed one
  // beyond the running one, an update in place already. Its first look, nothing changed, says so too: nothing to do.
  const available = (info = {}) => {
    const { 'running-commit': running, 'local-commit': local, 'remote-commit': remote } = info;
    if (!local || !remote) return update(); // no commits said: asked, the portal finding what there is
    if (remote !== local) return update();
    if (running && local !== running && !busy && !done) {
      done = true;
      installed();
    }
  };
  monitor.onProgress((p) => {
    if (p.status === STATUS.running) return;
    setBusy(false);
    if (p.status !== STATUS.error) allowed(); // the approval given (or never needed): asked no more
    if (p.status === STATUS.done) {
      done = true;
      installed();
    } else if (p.status === STATUS.error) failed(p.error_message || p.error || 'the update failed', reason(p.error, p.error_message));
    // Nothing to do (STATUS.empty): the repository not yet holding it; the portal's signal will come when it does.
  });
  monitor.onAvailable(available);
  if (newer || approve) update();
  return monitor;
}

module.exports = { connect, watch, reason, STATUS };

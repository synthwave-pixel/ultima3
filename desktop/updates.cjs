// Updates from the GitHub releases (main.cjs), looked for as the app starts, each way as this copy allows (as the
// Ultima V port does):
//   'auto'   - Windows installed by its installer, the AppImage, and the Mac app a release build signed with the
//              Developer ID certificate (macSigning.cjs marks it selfUpdate) run from Applications: electron-updater
//              fetches a newer release in the background (the latest*.yml the release carries; on a Mac its .zip) and
//              installs it when the game quits, or at once if the player restarts into it. Where it fails - a Mac
//              refusing the new app, say - the newer release is told of instead, as 'notice' does.
//   'notice' - the Windows portable .exe, and a Mac app electron-updater cannot replace: one signed ad hoc (a local
//              or a fork's build, or a release built without the repository's Apple secrets; macOS installs an update
//              only into an app signed by an Apple developer), or run from anywhere but Applications (the disk image,
//              read-only; Downloads, where macOS runs a read-only copy of it): the player is told a newer release is
//              out and offered its page, to read what changed and download from.
//   'flatpak' - the Flatpak: through Flatpak's update portal (flatpakUpdates.cjs), the newer release pulled from the
//              site's repository and deployed, a restart playing it - so a Steam Deck in Game Mode is kept up to date
//              without Discover, which runs only in Desktop Mode. Where the portal cannot be had or the update fails,
//              a notice instead: under Game Mode with no page offered, only the way to update - the once-only approval
//              given in Desktop Mode where that is what failed (flatpakUpdates.cjs reason), else Discover.
//   'none'   - the app run unpackaged, or built locally (a development version, 1.0.0-dev.x); or --no-update-check.
// --no-auto-update makes any copy a 'notice': a newer release is told of, as for the portable .exe, and nothing is
// downloaded or installed - for players who would choose when to update (the Flatpak's Discover still updates it).
// Pre-releases are for testers, who install them by hand: nothing updates to one, nor is told of one.
// What there is is told to the page (preload.cjs u3native.updates; web/src/ui/updates.ts), which says so in the
// game's own way - a box over the title once a version, a line in its menu, and in play a line in the message area -
// and asks for the restart or the page from here. Under Steam's Game Mode no page is offered (a browser there leaves
// the game behind); a build downloaded is still installed when the game quits. Launched by Steam (steamLaunch), a copy
// never restarts itself (Steam would see the game end and the new one start outside its overlay): what comes down is
// installed as the game quits, and the Flatpak's installed update is started by the player, from Steam again. A
// failure to look (offline, GitHub down) is only logged. ULTIMA3_RELEASES_API points GitHub's API elsewhere, to test.
const { readFileSync, writeFileSync } = require('node:fs');
const flatpakUpdates = require('./flatpakUpdates.cjs');

const OWNER = 'synthwave-pixel';
const REPO = 'ultima3';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const API = () => process.env.ULTIMA3_RELEASES_API || `https://api.github.com/repos/${OWNER}/${REPO}`;

/**
 * How this copy is updated: 'auto', 'notice', 'flatpak' or 'none' (see above). `version`: this copy's; `selfUpdate`: a
 * Mac release build signed for it; `inApplications`: a Mac app run from Applications (app.isInApplicationsFolder).
 */
function updateKind({ packaged, platform, env, argv, version, selfUpdate = false, inApplications = false }) {
  if (!packaged || argv.includes('--no-update-check')) return 'none';
  if (version !== undefined && parts(version) === null) return 'none';
  if (argv.includes('--no-auto-update')) return 'notice';
  if (env.FLATPAK_ID || env.container === 'flatpak') return 'flatpak';
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_DIR ? 'notice' : 'auto';
  if (platform === 'linux') return env.APPIMAGE ? 'auto' : 'notice';
  if (platform === 'darwin') return selfUpdate && inApplications ? 'auto' : 'notice';
  return 'notice';
}

/**
 * Whether Steam launched this copy (a non-Steam shortcut, as the game is added to Steam): Steam gives the game it
 * starts its id (SteamGameId, steamArt.cjs), or an app id.
 */
function steamLaunch(env) {
  return ['SteamGameId', 'SteamAppId', 'SteamOverlayGameId'].some((name) => /^[1-9]\d*$/.test(String(env[name] ?? '').trim()));
}

/** Whether this build was signed to replace itself (macSigning.cjs puts selfUpdate in the packaged package.json). */
function signedForUpdates() {
  try {
    return require('./package.json').selfUpdate === true;
  } catch {
    return false;
  }
}

/** A released version's numbers (1.0.39, v1.0.39), or null for anything else (a development or pre-release build's). */
function parts(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether release `latest` is newer than `current`; never for a version that is not a release's. */
function isNewer(latest, current) {
  const [l, c] = [parts(latest), parts(current)];
  if (!l || !c) return false;
  for (let i = 0; i < 3; i++) if (l[i] !== c[i]) return l[i] > c[i];
  return false;
}

/** The version last noticed (updates.json), so each newer release is told of once. */
function noticed(file) {
  return kept(file).noticed ?? null;
}

/**
 * What updates.json keeps: the version last told of (noticed), the version that ran last (lastRun), the Flatpak's
 * once-only approval given (approved) and its last failure (lastError).
 */
function kept(file) {
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    return typeof d === 'object' && d !== null ? d : {};
  } catch {
    return {};
  }
}

/** `patch` kept in updates.json beside what it keeps already. */
function keep(file, patch) {
  try {
    writeFileSync(file, JSON.stringify({ ...kept(file), ...patch }));
  } catch (e) {
    console.warn('update:', e?.message ?? e);
  }
}

/** Whether to tell the player of `latest`: newer than this copy, and not told of already. */
function shouldNotice(latest, current, told) {
  return isNewer(latest, current) && (told === null || isNewer(latest, told));
}

/**
 * What there is to update to, for the page (web/src/ui/updates.ts UpdateOffer): a build come down ('restart'), or a
 * release out ('release'); its version and this copy's; and whether the player has been told of it. The Flatpak's
 * restart is `installed` already (and, under Game Mode or launched by Steam, only `quits`); a Steam launch's
 * downloaded build installs `onQuit`; a release with no `page` offered is told of only.
 */
let offer = null;
/** The Flatpak's restart: its newest version started (flatpakUpdates.cjs spawnLatest); null, a quit alone. */
let relaunch = null;
/**
 * A Flatpak update under way, settling when it ends; null when none is. The portal gives up an update when the game
 * that asked for it goes, so a quit waits for it (main.cjs), a while at most.
 */
let pending = null;
let settle = null;
/** The Flatpak's update monitor, closed as the game quits (closeUpdates). */
let monitor = null;
const updating = () => pending;
const listeners = new Set();

/** The offer now, or null. */
const currentOffer = () => offer;

/** Told each time the offer changes. */
function onOffer(listener) {
  listeners.add(listener);
}

function publish(next) {
  offer = next;
  for (const l of listeners) l(offer);
}

/** GitHub's newest full release's version (1.0.86): its API's latest is never a pre-release or a draft. */
async function latestRelease(net) {
  const res = await net.fetch(`${API()}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return String((await res.json()).tag_name ?? '').replace(/^v/, '');
}

/**
 * Look for an update, as this copy allows (updateKind). `electron` is the main process's (app, net); `quiet` true
 * under Game Mode, where no page is offered. `file`, where the version last told of is kept (updates.json).
 * `flatpak`, the portal's (flatpakUpdates.cjs; the tests give their own). `steam` true in a Steam launch
 * (steamLaunch): no restart is offered or made. `selfUpdate`, whether a Mac build was signed to replace itself (the
 * packaged package.json's, signedForUpdates; the tests give their own).
 */
async function checkForUpdates({ electron, quiet, file, flatpak = flatpakUpdates, steam = false, selfUpdate = signedForUpdates() }) {
  const { app, net } = electron;
  const kind = updateKind({
    packaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
    argv: process.argv,
    version: app.getVersion(),
    selfUpdate,
    inApplications: process.platform === 'darwin' && Boolean(app.isInApplicationsFolder?.()),
  });
  if (kind === 'none') return;
  if (kind === 'flatpak') return flatpakUpdate({ app, net, quiet, steam, file, flatpak });
  if (kind === 'auto') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Pre-releases are for testers, who install them by hand: nothing updates to one.
    autoUpdater.allowPrerelease = false;
    // Failed - offline, or a Mac refusing the new app - the newer release told of instead, once, unless one has come
    // down already.
    let downloaded = false;
    let fellBack = false;
    const failed = (e) => {
      console.warn('update:', e?.message ?? e);
      if (downloaded || fellBack) return;
      fellBack = true;
      void tellOfRelease({ app, net, quiet, file });
    };
    autoUpdater.on('error', failed);
    autoUpdater.on('update-downloaded', (info) => {
      downloaded = true;
      console.log(`update: ${info.version} downloaded, installed on quitting`);
      publish({
        kind: 'restart',
        // In a Steam launch, installed as the game quits and no more: the offer says so (web/src/game/menu.ts).
        ...(steam ? { onQuit: true } : {}),
        version: String(info.version),
        current: app.getVersion(),
        told: false,
      });
    });
    await autoUpdater.checkForUpdates().catch(failed);
    return;
  }
  await tellOfRelease({ app, net, quiet, file });
}

/** A notice: the newest release, from GitHub's API, told of where newer than this copy (none under Game Mode). */
async function tellOfRelease({ app, net, quiet, file }) {
  if (quiet) return;
  try {
    const latest = await latestRelease(net);
    const current = app.getVersion();
    if (!latest || !isNewer(latest, current)) return;
    notice(latest, current, file, true);
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
}

/**
 * A newer release told of: its page offered, or (`page` false) only the way to it said - with `why` the Flatpak's
 * update failed where the way is not Discover's (the approval to give in Desktop Mode, or to give again).
 */
function notice(latest, current, file, page, why) {
  publish({
    kind: 'release',
    version: latest,
    current,
    told: !shouldNotice(latest, current, noticed(file)),
    ...(page ? {} : { page }),
    ...(!page && (why === 'approve' || why === 'denied') ? { why } : {}),
  });
}

/**
 * The Flatpak's update (flatpakUpdates.cjs): the portal asked to keep this copy up to date - at once where GitHub has
 * a newer release - and the game told when it is installed; where the portal cannot be had or the update fails, the
 * release told of instead (under Game Mode, without its page).
 */
async function flatpakUpdate({ app, net, quiet, steam, file, flatpak }) {
  const current = app.getVersion();
  let latest = null;
  try {
    latest = await latestRelease(net);
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
  const newer = !!latest && isNewer(latest, current);
  const fallback = (why) => newer && notice(latest, current, file, !quiet, why);
  const portal = await flatpak.connect();
  if (!portal) return void fallback();
  relaunch = quiet || steam ? null : portal.spawnLatest;
  try {
    monitor = await flatpak.watch({
      portal,
      newer,
      // At the desktop, until allowed: the once-only approval asked now, where its dialog can be shown, not left to
      // the first release - which may come under Game Mode, where it cannot (flatpakUpdates.cjs).
      approve: !quiet && kept(file).approved !== true,
      allowed: () => kept(file).approved !== true && keep(file, { approved: true }),
      installed: () => {
        console.log(`update: ${newer ? latest : 'a newer version'} installed by the flatpak portal`);
        keep(file, { lastError: null });
        publish({
          kind: 'restart',
          installed: true,
          quits: quiet || steam,
          ...(newer ? { version: latest } : {}),
          current,
          told: false,
        });
      },
      failed: (message, why) => {
        console.warn(`flatpak update (${why}):`, message);
        // Kept for the player to send (updates.json), the Game Mode console out of reach.
        keep(file, { lastError: { message, why, version: latest, at: new Date().toISOString(), quiet } });
        fallback(why);
      },
      busy: (b) => {
        if (b) pending = new Promise((r) => (settle = r));
        else {
          settle?.();
          pending = settle = null;
        }
      },
    });
  } catch (e) {
    console.warn('flatpak update:', e?.message ?? e);
    fallback();
  }
}

/** The Flatpak's update monitor let go, the game quitting (main.cjs). */
function closeUpdates() {
  const m = monitor;
  monitor = null;
  return m?.close?.() ?? Promise.resolve();
}

/**
 * Take up the offer: the restart into the build come down (the Flatpak's: its newest version started, and this one
 * quits - or, under Game Mode or launched by Steam, only the quit), or the release's page in the player's browser.
 */
function applyUpdate({ electron, steam = false }) {
  if (!offer) return false;
  // In a Steam launch a downloaded build installs as the game quits, never by a restart.
  if (steam && offer.kind === 'restart' && !offer.installed) return false;
  if (offer.kind === 'restart' && offer.installed) {
    const quit = () => electron.app.quit();
    if (relaunch && !steam)
      void relaunch().then(quit, (e) => {
        console.warn('update: the new version would not start:', e?.message ?? e);
        quit();
      });
    else quit();
  } else if (offer.kind === 'restart') {
    // The new version starts while this copy is still quitting (the AppImage's is started before this one goes): the
    // one-copy lock (main.cjs requestSingleInstanceLock) let go first, or the new copy is taken for a second one and
    // quits unseen - and a copy stuck quitting would turn every launch after away the same way.
    electron.app.releaseSingleInstanceLock?.();
    require('electron-updater').autoUpdater.quitAndInstall();
  } else return openRelease(electron, offer);
  return true;
}

/** The release's page opened in the player's browser, where one is offered. */
function openRelease(electron, from) {
  if (from.page === false) return false;
  void electron.shell.openExternal(RELEASES);
  return true;
}

/** The player has been told of the offer (its box shown): not again for this version, a release's kept in `file`. */
function toldOfUpdate({ file }) {
  if (!offer) return;
  if (offer.kind === 'release') keep(file, { noticed: offer.version });
  publish({ ...offer, told: true });
}

// --- What is new: the first start after an update ---------------------------------------------------------------

/** This copy's version, where it is newer than the one that ran last (kept in updates.json): { version, from }. */
let news = null;

/**
 * Whether this is the first start of a newer version (an update taken up, by whatever way it came): noted as `news`
 * for the title to say once, and the version kept as the last run. Not in a copy run unpackaged.
 */
function lookForNews({ app, file }) {
  if (!app.isPackaged) return null;
  const current = app.getVersion();
  const last = kept(file).lastRun;
  keep(file, { lastRun: current });
  news = typeof last === 'string' && isNewer(current, last) ? { version: current, from: last } : null;
  return news;
}

const currentNews = () => news;
/** The player has been told (the title's box shown): not again. */
const newsSeen = () => void (news = null);

/**
 * A release's notes as plain paragraphs for the game's own text pages (web's GameIO showText): GitHub's Markdown -
 * headings, bold, links, bullets - let go of its marks; the compare link left off. Paragraphs apart by a blank line.
 */
function plainNotes(markdown) {
  const out = [];
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    if (/^\s*\*\*Full Changelog\*\*/.test(raw)) continue;
    const line = raw
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trimEnd();
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** The notes of release `version`, from GitHub, as plain text; null where they cannot be had (offline). */
async function releaseNotes({ net, version }) {
  try {
    const res = await net.fetch(`${API()}/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return plainNotes((await res.json()).body);
  } catch (e) {
    console.warn('release notes:', e?.message ?? e);
    return null;
  }
}

module.exports = {
  updating,
  closeUpdates,
  lookForNews,
  currentNews,
  newsSeen,
  plainNotes,
  releaseNotes,
  updateKind,
  steamLaunch,
  isNewer,
  shouldNotice,
  checkForUpdates,
  applyUpdate,
  toldOfUpdate,
  currentOffer,
  onOffer,
  RELEASES,
};

/**
 * updates.ts
 *
 * A newer version of the game, as the page learns of it, for the title (game/menu.ts: a box of its own once a
 * version, then its menu's Update line) and for play (game/game.ts: a line in the message area; the Pause menu's
 * Update line), in the words of game/updateOffer.ts. Where it comes from depends on where the game runs (as in the
 * Ultima V port):
 *   - the web: the service worker has fetched the new build, which a restart takes up ('restart', the version unsaid);
 *   - the desktop app: its main process (desktop/updates.cjs) - a build electron-updater has downloaded, installed by
 *     a restart or as the game quits ('restart'), or, where it cannot replace the copy (a Mac app not signed for it,
 *     the portable .exe), a newer release out ('release'), whose page is opened for the player to read and download
 *     from; the Flatpak's, installed already by Flatpak's update portal, a restart playing it (under Steam's Game Mode
 *     only a quit, the player starting it again), or where the portal fails a release told of - under Game Mode with
 *     no page, only the way to it;
 *   - the Android app: a newer release on GitHub than the APK's own version (VITE_APP_VERSION, mobile/bundle.cjs)
 *     ('release'), its page opened by going to it, which Capacitor sends to the system browser.
 * The releases page, never the file itself: what changed is read there first, and the download is the player's.
 */

import type { UpdateHook, UpdateNews, UpdateOffer } from '../game/updateOffer.ts';

export type { UpdateHook, UpdateNews, UpdateOffer };

export const RELEASES_PAGE = 'https://github.com/synthwave-pixel/ultima3/releases/latest';
const LATEST_API = 'https://api.github.com/repos/synthwave-pixel/ultima3/releases/latest';

/** A released version's numbers (1.0.39, v1.0.39), or null for anything else (a development build's). */
function parts(version: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether release `latest` is newer than `current`; never for a version that is not a release's. */
export function isNewer(latest: string, current: string): boolean {
  const [l, c] = [parts(latest), parts(current)];
  if (!l || !c) return false;
  for (let i = 0; i < 3; i++) if (l[i] !== c[i]) return l[i] > c[i];
  return false;
}

/** Whether `version` is a release's (x.y.z), so worth comparing; a development build's is not. */
export function isRelease(version: string | undefined): version is string {
  return version !== undefined && parts(version) !== null;
}

/** A newer release found on GitHub: its version and its page. */
export interface ReleaseOffer {
  version: string;
  url: string;
}

/** Ask GitHub for the newest release (never a pre-release): an offer where newer than `current`, else null (failures too). */
export async function newerRelease(current: string, get: typeof fetch = fetch): Promise<ReleaseOffer | null> {
  try {
    const res = await get(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const latest = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const version = typeof latest.tag_name === 'string' ? latest.tag_name.replace(/^v/, '') : '';
    if (!isNewer(version, current)) return null;
    const url = typeof latest.html_url === 'string' && latest.html_url.startsWith('https://github.com/') ? latest.html_url : RELEASES_PAGE;
    return { version, url };
  } catch {
    return null;
  }
}

/** The desktop app's bridge (desktop/preload.cjs u3native.updates). */
export interface DesktopUpdates {
  offer: () => Promise<UpdateOffer | null>;
  apply: () => Promise<unknown>;
  told: () => Promise<unknown>;
  onChange: (listener: (offer: UpdateOffer | null) => void) => void;
  news?: () => Promise<UpdateNews | null>;
  newsSeen?: () => Promise<unknown>;
  notes?: (version: string) => Promise<string | null>;
}

/** The desktop app's offer, kept as its main process tells it. */
export function desktopUpdates(bridge: DesktopUpdates): UpdateHook {
  let offer: UpdateOffer | null = null;
  let news: UpdateNews | null = null;
  bridge.onChange((o) => (offer = o));
  void bridge
    .offer()
    .then((o) => (offer ??= o))
    .catch(() => undefined);
  void bridge
    .news?.()
    .then((n) => (news = n))
    .catch(() => undefined);
  return {
    offer: () => offer,
    apply: () => void bridge.apply().catch(() => undefined),
    told: () => {
      if (offer) offer = { ...offer, told: true };
      void bridge.told().catch(() => undefined);
    },
    news: () => news,
    newsSeen: () => {
      news = null;
      void bridge.newsSeen?.().catch(() => undefined);
    },
    notes: (version) => bridge.notes?.(version).catch(() => null) ?? Promise.resolve(null),
  };
}

/** What the Android app gives: GitHub's answer, a page opened outside it, and the version last told of. */
export interface AndroidUpdates {
  release: Promise<ReleaseOffer | null>;
  open: (url: string) => void;
  /** The version last told of, kept by the page (localStorage). */
  told: { get: () => string | null; set: (version: string) => void };
}

/** The Android app's offer: GitHub's newest release, where newer than the APK, told of once a version. */
export function androidUpdates(app: AndroidUpdates): UpdateHook {
  let offer: UpdateOffer | null = null;
  let url = RELEASES_PAGE;
  void app.release
    .then((r) => {
      if (!r) return;
      url = r.url;
      const was = app.told.get();
      offer = { kind: 'release', version: r.version, told: was !== null && !isNewer(r.version, was) };
    })
    .catch(() => undefined);
  return {
    offer: () => offer,
    apply: () => app.open(url),
    told: () => {
      if (!offer) return;
      offer = { ...offer, told: true };
      if (offer.version) app.told.set(offer.version);
    },
  };
}

/** The web's: the service worker's new build, which a restart takes up. Said in the menu alone: no box for it. */
export function webUpdates(ready: () => boolean, restart: () => void): UpdateHook {
  return { offer: () => (ready() ? { kind: 'restart', told: true } : null), apply: restart, told: () => undefined };
}

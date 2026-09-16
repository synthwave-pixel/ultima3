/**
 * platform.ts
 *
 * Where the game is running, as far as storage is concerned. Every browser
 * on iOS wraps Apple's WebKit, whose tracking prevention deletes a site's
 * script-written storage (the saved game included) after seven days of
 * browser use without a visit. A web app added to the Home Screen keeps
 * its own storage and is not subject to that, so the warning is for a
 * browser tab on iOS only.
 */

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** Safari's flag for a page launched from the Home Screen. */
  standalone?: boolean;
}

/** iPhone, iPod, iPad, and iPadOS 13+ which calls itself a Mac with a touch screen. */
export function isIOS(nav: NavigatorLike): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

/** Launched from the Home Screen (or otherwise installed), by Safari's flag or the display-mode media query. */
export function isInstalled(nav: NavigatorLike, matchMedia?: (query: string) => { matches: boolean }): boolean {
  return nav.standalone === true || matchMedia?.('(display-mode: standalone)').matches === true;
}

export const IOS_STORAGE_WARNING =
  'Saved games in an iOS browser tab are deleted after seven days of browser use without a visit here. ' +
  'That is a WebKit rule, the same in Safari, Chrome and Brave. To keep a game: add this page to the Home Screen ' +
  '(Share, then Add to Home Screen), or export it to a file from the title menu.';

/** The warning to show at launch, or null when it does not apply. */
export function launchWarning(nav: NavigatorLike, matchMedia?: (query: string) => { matches: boolean }): string | null {
  return isIOS(nav) && !isInstalled(nav, matchMedia) ? IOS_STORAGE_WARNING : null;
}

export const WARNING_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Whether the warning is due: never shown, or shown a day or more ago (a clock set back counts as due too). */
export function warningDue(lastShown: number | null, now: number): boolean {
  return lastShown === null || !Number.isFinite(lastShown) || now - lastShown >= WARNING_INTERVAL_MS || lastShown > now;
}

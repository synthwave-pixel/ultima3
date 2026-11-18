/**
 * updateOffer.ts
 *
 * A newer version of the game as the game says it (as the Ultima V port does): what the page has learnt of it
 * (ui/updates.ts, from the desktop app's main process, the Android app's look at GitHub or the web's service worker),
 * and the words for it - the title's box and menu line (menu.ts), the line in the message area in play (game.ts), and
 * the Pause menu's Update line (ui/screen.ts). A restart is never offered out of a game in play: it is said there, and
 * taken up at the title.
 */

/** What there is to update to. `told`: the player has been shown its box already (shown once a version). */
export interface UpdateOffer {
  kind: 'restart' | 'release';
  /** The new version and this copy's, where known (the service worker's build has no number). */
  version?: string;
  current?: string;
  told: boolean;
  /** A restart: the update installed already (the Flatpak's), not on quitting; and taking it up only quits. */
  installed?: boolean;
  quits?: boolean;
  /** A restart: a Steam launch's, a build come down that installs as the game quits and is never restarted into. */
  onQuit?: boolean;
  /** A release: false where no page can be offered (under Game Mode), the way to it only said. */
  page?: boolean;
  /**
   * The Flatpak's: why its own update failed, where the way is not Discover's - its once-only approval not to be asked
   * under Game Mode ('approve': given in Desktop Mode, the game updates itself from then on), or turned down ('denied').
   */
  why?: 'approve' | 'denied';
}

/** The first start of a newer version (the desktop app's: desktop/updates.cjs lookForNews): it, and the one before. */
export interface UpdateNews {
  version: string;
  from: string;
}

/**
 * The game's view of it: the offer now, taking it up, and the player told of it; and, the desktop app's, the first
 * start of a newer version - the player told of it once - and a release's notes (null offline).
 */
export interface UpdateHook {
  offer: () => UpdateOffer | null;
  apply: () => void;
  told: () => void;
  news?: () => UpdateNews | null;
  newsSeen?: () => void;
  notes?: (version: string) => Promise<string | null>;
}

/** The game's name with the version, or "A new version" where it has none. */
export function updateName(offer: UpdateOffer): string {
  return offer.version ? `Ultima III ${offer.version}` : 'A new version';
}

/** The way to a release where no page is offered (under Game Mode): the approval to give, or Discover. */
export function desktopModeWay(offer: UpdateOffer): string {
  if (offer.why === 'approve')
    return 'Start the game once in Desktop Mode and choose Update when asked: from then on it updates itself, here too.';
  if (offer.why === 'denied')
    return 'Its updates were turned down. Allow them in Desktop Mode, as the README says, or update it from Discover.';
  return 'Update it in Desktop Mode, from Discover.';
}

/** The title menu's line for an offer: "Update (1.0.45)", or the web's "Update: restart". */
export function updateLabel(offer: UpdateOffer): string {
  return offer.version ? `Update (${offer.version})` : 'Update: restart';
}

/**
 * The title's box for an offer (menu.ts updateBox): its title, what it says, and what may be chosen - the way to it
 * (Restart now, Quit now, Open release page) and Later, or only OK where there is nothing to take up.
 */
export function updateBoxText(offer: UpdateOffer): { title: string; text: string; go: string | null } {
  const name = updateName(offer);
  if (offer.kind === 'release') {
    const out = `${name} is out${offer.current ? `; this is ${offer.current}` : ''}.`;
    return offer.page === false
      ? { title: 'Update available', text: `${out} ${desktopModeWay(offer)} Your saved game carries over.`, go: null }
      : { title: 'Update available', text: `${out} Its page says what is new. Your saved game carries over.`, go: 'Open release page' };
  }
  if (offer.onQuit) return { title: 'Update ready', text: `${name} has downloaded. It installs when the game quits.`, go: null };
  if (!offer.installed)
    return {
      title: 'Update ready',
      text: `${name} has downloaded. It is installed when you quit, or restart to play it now.`,
      go: 'Restart now',
    };
  return offer.quits
    ? { title: 'Update ready', text: `${name} is installed. Quit, and start the game again to play it.`, go: 'Quit now' }
    : {
        title: 'Update ready',
        text: `${name} is installed. Restart to play it now, or it starts the next time you play.`,
        go: 'Restart now',
      };
}

/** What the message area says in play of a build come down, once (game.ts): null for anything else. */
export function inPlayNotice(offer: UpdateOffer | null): string | null {
  if (!offer || offer.told || offer.kind !== 'restart' || !offer.version) return null;
  if (offer.installed) return `Ultima III ${offer.version} is installed: it starts the next time you play.`;
  return `Ultima III ${offer.version} has downloaded: it is installed when you quit.`;
}

/**
 * What the Pause menu's Update line says, in play: never a restart out of the game, only the way to the new version.
 * Null where choosing it opens the release's page (a release with one to offer).
 */
export function inPlayWay(offer: UpdateOffer): string | null {
  const name = updateName(offer);
  if (offer.kind === 'release') return offer.page === false ? `${name} is out. ${desktopModeWay(offer)}` : null;
  if (offer.onQuit) return `${name} has downloaded. It installs when the game quits.`;
  if (offer.installed) return `${name} is installed. It starts the next time you play: Quit and save, and start the game again.`;
  return `${name} has downloaded. It is installed when you quit: Quit and save, and choose Update on the title to play it now.`;
}

/** `text` in lines of at most `width` letters, broken at spaces (a word longer than a line is cut). */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    for (let w = word; w; ) {
      const piece = w.slice(0, width);
      w = w.slice(width);
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

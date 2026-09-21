/**
 * help.ts
 *
 * The in-game help pages and the list of tile sets, for the Settings menu.
 * The pages show in a box over the map area: each has a title, drawn in
 * the box's top edge, and up to 19 lines of at most 20 characters. Which
 * set of pages shows depends on the input mode.
 */

/**
 * Tile sets shipped in public/graphics, as the Settings menu lists them:
 * best first. Standard is LairWare's 64-pixel art, drawn at native size;
 * then the 32-pixel colour sets, the Apple II colour set, the
 * monochrome sets, and the 16-pixel 8-bit and early PC sets.
 */
export const TILE_SETS = [
  'Standard',
  'Lairware',
  'PC VGA',
  'Nintendo',
  'PC Ultima V',
  'PC MCGA',
  'Apple II Color',
  'Apple II Mono',
  'Macintosh B&W',
  'PC EGA',
  'PC CGA',
  'Commodore 64',
];

export interface HelpPage {
  title: string;
  lines: string[];
}

/** The page box over the map: how many lines fit, and how wide each is. Longer pages are cut, so they are split. */
export const PAGE_ROWS = 19;
export const PAGE_WIDTH = 20;

/** The build this page came from: the commit's short hash, set by the build (VITE_BUILD), or "dev". */
export const BUILD: string = (import.meta.env.VITE_BUILD as string | undefined) || 'dev';

/**
 * How a member's state is shown, which is what the tile set decides: the
 * Standard set colours the name, and every other set draws the Apple II's
 * status letter after it instead (`classic` in screen.ts). The help says
 * whichever the player is looking at.
 */
function partyStatus(tileSet: string): string[] {
  return tileSet === 'Standard'
    ? ["The name's colour:", 'Green: poisoned', 'Grey: dead', 'Dark grey: ashes', 'Blue: level up from', '  Lord British']
    : ['A letter by the name', 'G: good', 'L: level up from', '  Lord British', 'P: poisoned', 'D: dead', 'A: ashes'];
}

const KEYBOARD_PAGES: HelpPage[] = [
  {
    title: 'Keys 1/5',
    lines: [
      'Arrows: walk; move',
      '  in combat',
      'Space: pass a turn',
      'Escape: pause menu',
      'J: journal',
      '#: view the map',
      '!: heal the party',
      '@: safe chest',
      '$: light the way',
      '',
      'A "Who?" prompt',
      'takes 1-4, or',
      'Up/Down and Enter.',
      'A direction is an',
      'arrow key.',
    ],
  },
  {
    title: 'Keys 2/5',
    lines: [
      'A: attack',
      'B: board horse/ship',
      'C: cast a spell',
      'E: enter a place',
      'F: fire cannons',
      'G: get a chest',
      'I: ignite a torch',
      'K: klimb a ladder',
      'L: look',
      'M: marching order',
      'N: negate time',
      'O: other, say a word',
      'P: peer at a gem',
    ],
  },
  {
    title: 'Keys 3/5',
    lines: [
      'Q: quit and save',
      '  (surface only)',
      'R: ready a weapon',
      'S: steal',
      'T: transact: talk,',
      '  shop, the king',
      'U: unlock a door',
      'V: volume',
      'W: wear armour',
      'X: exit horse/ship',
      'Y: yell (same as O)',
      'Z: ztats',
    ],
  },
  {
    title: 'Keys 4/5',
    lines: [
      'COMBAT',
      'Arrows: move; into',
      '  a monster attacks',
      'A: attack, then a',
      '  direction',
      'C, N, R, Z: as above',
      'B or Escape: take',
      '  the fight back',
      '  from auto combat',
      '',
      'DUNGEONS',
      'Up/Down: advance,',
      '  retreat',
      'Left/Right: turn',
      'I, K, D: ignite,',
      '  klimb, descend',
      'L: map off, 5x5,',
      '  whole level',
    ],
  },
];

const CONTROLLER_PAGES: HelpPage[] = [
  {
    title: 'Controller 1/2',
    lines: [
      'D-pad: move, menus',
      'A: menu, and choose',
      'B: cancel, or pass',
      'X: ztats',
      'Y: look; attack in',
      '  combat; ignite in',
      '  dungeons',
      'View or Menu: pause',
      '',
      'Keys for the pad:',
      'WASD/arrows: d-pad',
      'Enter or Z: A',
      'X or B: B',
      'C: X    V or Y: Y',
      'Escape: pause',
      '',
      'The pause menu holds',
      'the settings, auto',
      'combat and quit.',
    ],
  },
];

/**
 * The help pages for an input mode, with the last one written for the tile
 * set in use: how it shows a member's state, and how the game is saved.
 */
export function helpPages(mode: 'keyboard' | 'controller', tileSet: string): HelpPage[] {
  const pages = mode === 'controller' ? CONTROLLER_PAGES : KEYBOARD_PAGES;
  const saving = mode === 'controller' ? ['Quit (Pause) saves;', 'resumes next visit.'] : ['Q saves and resumes', 'next visit.'];
  const n = pages.length + 1;
  return [...pages, { title: `Status ${n}/${n}`, lines: [...partyStatus(tileSet), '', ...saving, `Build ${BUILD}`] }];
}

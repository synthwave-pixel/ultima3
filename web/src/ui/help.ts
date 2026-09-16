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
 * then the 32-pixel colour sets, the tripled Apple II colour sets, the
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
  'Apple II Color TV',
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

/** The build this page came from: the commit's short hash, set by the build (VITE_BUILD), or "dev". */
export const BUILD: string = (import.meta.env.VITE_BUILD as string | undefined) || 'dev';

/** How the game works, common to both input modes; the last line differs. */
const HOW_IT_WORKS = [
  'Walk into a person',
  'to talk, a counter',
  'to shop, a locked',
  'door to unlock, a',
  'monster to attack.',
  '',
  'Gold and food are',
  "the party's (top).",
  'Standard: name green',
  'poisoned, grey dead,',
  'dark grey ashes,',
  'blue when the king',
  'will raise them; HP',
  'yellow under 1/4,',
  'red under 1/10.',
  'Others: G P D A code',
  '',
];

export const KEYBOARD_HELP: HelpPage[] = [
  {
    title: 'Keys 1/4',
    lines: [
      'Arrows  walk',
      'Space   pass',
      'Escape  settings',
      'J       journal',
      '',
      'A attack',
      'B board horse/ship',
      'X exit horse/ship',
      'E enter',
      'F fire cannons',
      'L look',
      'T transact: talk,',
      '  shop, the king',
      'U unlock (key)',
      'S steal',
      'G get chest',
      'P peer at gem',
      'O other: say a word',
      'Y yell (same as O)',
    ],
  },
  {
    title: 'Keys 2/4',
    lines: [
      'Z ztats',
      'C cast',
      'R ready weapon',
      'W wear armour',
      'M marching order',
      'N negate time',
      'Q quit and save',
      '  (surface only)',
      '# view the map',
      '',
      'COMBAT',
      'Arrows  move; into a',
      '        foe attacks',
      'A       attack, then',
      '        a direction',
      'C N R Z as above',
      'Escape  auto combat',
      '        off',
    ],
  },
  {
    title: 'Keys 3/4',
    lines: [
      'DUNGEONS',
      'Up/Down  advance,',
      '         retreat',
      'Left/Rt  turn',
      'I ignite torch',
      'K klimb   D descend',
      'L map: off, 5x5,',
      '  whole level',
      '  (whole: arrows',
      '  are compass)',
      '',
      '"Who?" takes 1-4, or',
      'Up/Down and Enter.',
      'A direction is an',
      'arrow key.',
    ],
  },
  {
    title: 'How it works 4/4',
    lines: [...HOW_IT_WORKS, 'Q saves; the game', 'resumes next visit.', '', `Build ${BUILD}`],
  },
];

export const CONTROLLER_HELP: HelpPage[] = [
  {
    title: 'Controller 1/2',
    lines: [
      'D-pad  move; menus',
      'A      command menu,',
      '       choose',
      'B      cancel, pass',
      'X      ztats',
      'Y      look; attack',
      '       in combat;',
      '       ignite in',
      '       dungeons',
      '',
      'Keyboard stand-ins:',
      'WASD/arrows = d-pad',
      'Enter or Z = A',
      'Esc, X or B = B',
      'C = X  V or Y = Y',
      '',
      'A gamepad press',
      'switches to',
      'controller mode.',
    ],
  },
  {
    title: 'How it works 2/2',
    lines: [...HOW_IT_WORKS, 'Quit (menu) saves;', 'resumes next visit.', '', `Build ${BUILD}`],
  },
];

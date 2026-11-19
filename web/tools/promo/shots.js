// The README's screenshots (promo/features.jpg, promo/tile-sets.jpg), taken from a development build. With the dev server
// running, the screenshot server too (node web/tools/pilot/shots.mjs), and a page of the game open, in the console:
//
//     (0, eval)(await (await fetch('/tools/promo/shots.js')).text())
//     await promo.tileSets()            // every look at the opening, in a fight and in a dungeon: ts-<look>-<scene>.png
//     await promo.shot('f01-overworld') // the screen as it is now: f01-overworld.png
//
// A shot is the game's canvas with the letters set over it (src/ui/letterLayer.ts) drawn in, at the canvas's 1280 x 768;
// `tileSets` keeps only the map's 704 x 704. Each lands in screenshots/ at the repository's root, where
// web/tools/features-sheet.sh and web/tools/tile-sets-sheet.sh lay them out.
//
// tileSets goes from page to page itself (the dev starts, devStarts.ts), so it is run once per scene: it says which to
// load next and is called again there. In a tab the browser has hidden, frames stop; the script keeps them coming.
window.promo = (() => {
  const SERVER = 'http://127.0.0.1:5199';
  const LOOKS = [
    'Remastered',
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
  // The opening: a new game's square on Sosaria, by Lord British's castle. A fight with orcs. Doom's first corridor.
  const SCENES = { opening: '/?at=world:42,20&peek', combat: '/?at=fight:orc&peek', dungeon: '/?at=place:doom&lit&peek' };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  /** Frames even in a hidden tab, and a turn that never passes by itself, so a scene holds still for its shots. */
  function steady() {
    window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);
    const { screen, world } = window.u3;
    world.timeLimit = () => undefined;
    screen.frameAsked = false;
    screen.wake();
    // The letters too: a frame they asked for before this would never come.
    screen.letters.frameAsked = false;
    screen.letters.layout();
  }

  /** The canvas with the letters over it, or its `crop` [x, y, w, h] in canvas pixels. */
  function picture(crop) {
    const game = document.getElementById('screen');
    const [x, y, w, h] = crop ?? [0, 0, game.width, game.height];
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(game, x, y, w, h, 0, 0, w, h);
    const letters = game.nextElementSibling;
    if (letters?.tagName === 'CANVAS' && letters.style.display !== 'none') {
      const sx = letters.width / game.width;
      const sy = letters.height / game.height;
      ctx.drawImage(letters, x * sx, y * sy, w * sx, h * sy, 0, 0, w, h);
    }
    return out;
  }

  async function post(name, canvas) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    await fetch(`${SERVER}/?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    return name;
  }

  /** The screen as it is now, saved as `name`.png. */
  async function shot(name) {
    steady();
    await wait(400);
    return post(name, picture());
  }

  /**
   * Each look in turn at the scene this page is in (opening, combat or dungeon: the one whose address it is), its map
   * saved as ts-<look>-<scene>.png. Then the next scene's address, to open and call this again; null after the last.
   */
  async function tileSets() {
    const scene = Object.keys(SCENES).find((s) => window.location.search === SCENES[s].slice(1)) ?? 'opening';
    steady();
    await wait(1500);
    const { screen } = window.u3;
    if (screen.menu) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await wait(500);
    }
    const cell = screen.cell;
    for (const look of LOOKS) {
      // A fight's outline on the first member in every look, its timer stopped: the same moment in each.
      const fight = window.u3.world.combat;
      if (fight) Object.assign(fight, { markedMember: 0, markedFor: 0, snapShown: -1 });
      await screen.loadTiles(look);
      screen.viewDirty = true;
      await wait(900);
      await post(`ts-${slug(look)}-${scene}`, picture([cell, cell, 22 * cell, 22 * cell]));
    }
    const names = Object.keys(SCENES);
    const next = names[names.indexOf(scene) + 1];
    return next ? SCENES[next] : null;
  }

  return { shot, tileSets, steady, picture, LOOKS, SCENES };
})();

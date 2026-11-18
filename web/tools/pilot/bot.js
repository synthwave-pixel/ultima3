// The pilot: a controller-only player for the development build (see README.md here). It presses only what a
// controller has - the d-pad, A, B, X, Y and the system button, sent as keydown events, the path a player's keys
// take - and reads the game through the development hook (window.u3) to plan, never writing it. Evaluate it in the
// page's console; it defines window.bot.
(() => {
  const u3 = window.u3;
  if (!u3) throw new Error('bot.js: no window.u3 here (open the development build)');
  if (u3.screen.inputMode !== 'controller') console.warn('bot.js: the game is in keyboard mode; open it with ?controller');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** The keys the keyboard stands in for a controller with: arrows for the d-pad, Z X C V for A B X Y. */
  const KEYS = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    A: 'z',
    B: 'x',
    X: 'c',
    Y: 'v',
    pause: 'Escape',
  };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  /** Map values (src/game/tiles.ts), for the paths. */
  const MV = { Water: 0, Mountains: 16, Whirlpool: 48, MoonGate: 136, Shrine: 248, Lava: 132, ForceField: 128, LetterI: 184 };
  const Loc = { Sosaria: 0, Dungeon: 1, Town: 2, Castle: 3, Combat: 0x80, Ambrosia: 0xff };
  const FRIGATE = 0x16;

  const log = [];
  const say = (line) => {
    log.push(line);
    console.log(`bot: ${line}`);
  };
  const W = () => u3.world;
  const menu = () => u3.screen.menu;

  /** Until the game waits for a key (a menu open counts), or `ms` pass. */
  async function idle(ms = 15000) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      if (u3.keyboard.waiting) {
        await sleep(40);
        if (u3.keyboard.waiting) return true;
      }
      await sleep(25);
    }
    return false;
  }

  /** Press a controller key (`up`, `A`, `pause` ...) `n` times, each once the game is waiting. */
  async function press(key, n = 1) {
    const code = KEYS[key];
    if (!code) throw new Error(`bot.press: no key "${key}"`);
    for (let i = 0; i < n; i++) {
      await idle();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: code, bubbles: true }));
      await sleep(60);
    }
  }

  /** Whether the game is asking "Who?" (a member's highlight in the stats boxes, the border saying "Who?"). */
  const askingWho = () => u3.screen.selectedMember >= 0;

  /** Answer a pending "Who?" with the member highlighted (the first offered), as A does. True if one was asked. */
  async function answerWho() {
    await idle();
    if (!askingWho()) return false;
    await press('A');
    await idle();
    return true;
  }

  /** In the open menu, move to the item that matches `re` and choose it. */
  async function choose(re) {
    await idle();
    const m = menu();
    if (!m) throw new Error(`bot.choose ${re}: no menu open`);
    const i = m.items.findIndex((t) => re.test(t));
    if (i < 0) throw new Error(`bot.choose ${re}: not in ${m.title}: ${m.items.join(' | ')}`);
    while (menu() && menu().cursor !== i) await press(menu().cursor < i ? 'down' : 'up');
    await press('A');
  }

  /** A command from the command menu (A), by its label. */
  async function command(re) {
    await press('A');
    await choose(re);
  }

  /** Whether the party could stand on (x, y) of the current map: the game's rule (commands.ts validDir), and no one there. */
  function open(x, y, goal) {
    const w = W();
    const v = w.getXYVal(x, y);
    if (w.monsters.at(x, y) >= 0) return goal;
    if (w.party.shape === FRIGATE) return v === MV.Water;
    if (v === MV.MoonGate || v === MV.LetterI) return goal; // a gate moves the party; a door wants a key
    if (v === MV.Shrine) return true;
    return v < MV.Whirlpool && v !== MV.Water && v !== MV.Mountains;
  }

  /** The first step of a shortest path to a square for which `done(x, y)` holds, on the current map; null if none. */
  function firstStep(done) {
    const w = W();
    const size = w.current.size;
    const wraps = w.party.location === Loc.Sosaria;
    const key = (x, y) => y * size + x;
    const from = new Map([[key(w.x, w.y), null]]);
    const queue = [[w.x, w.y]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if ((x !== w.x || y !== w.y) && done(x, y)) return from.get(key(x, y)).dir;
      for (const [dir, [dx, dy]] of Object.entries(DIRS)) {
        let nx = x + dx;
        let ny = y + dy;
        if (wraps) {
          nx = (nx + size) % size;
          ny = (ny + size) % size;
        } else if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const k = key(nx, ny);
        if (from.has(k)) continue;
        const goal = done(nx, ny);
        if (!open(nx, ny, goal)) continue;
        // Each square keeps the first step from the party's square that leads to it.
        from.set(k, { dir: from.get(key(x, y))?.dir ?? dir });
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  /** Until the fight is over, auto combat (the Pause menu's setting) playing it. */
  async function fight() {
    if (!W().combat) return;
    if (!W().autoCombat) await autoCombat(true);
    say('a fight');
    while (W().combat) {
      if (menu()) await press('B');
      await sleep(250);
    }
    await idle();
    say(W().memberAlive(0) || W().memberAlive(1) || W().memberAlive(2) || W().memberAlive(3) ? 'won' : 'the party fell');
  }

  /** Turn the Pause menu's Auto combat on or off. */
  async function autoCombat(on) {
    await press('pause');
    const m = menu();
    const line = m && m.items.find((t) => /^Auto combat/.test(t));
    if (line && /On$/.test(line) !== on) await choose(/^Auto combat/);
    await choose(/^Resume/);
  }

  /**
   * Walk (or sail) toward a square for which `done(x, y)` holds, taking fights as they come. True on arrival. With no
   * way there a turn is passed, for the townsfolk (or the wind) to move, `patience` times running before it gives up.
   */
  async function walkUntil(done, most = 400, patience = 3) {
    let stuck = 0;
    for (let i = 0; i < most; i++) {
      await idle();
      if (await answerWho()) continue; // a step into Lord British asks who will speak; a direction would only move the highlight
      if (W().combat) await fight();
      if (done(W().x, W().y)) return true;
      const dir = firstStep(done);
      if (!dir) {
        if (++stuck > patience) return false;
        await press('B');
        continue;
      }
      stuck = 0;
      await press(dir);
    }
    return false;
  }

  /** Walk to (x, y) on the current map. */
  const walkTo = (x, y) => walkUntil((px, py) => px === x && py === y);

  /** A place's square on Sosaria (misc.locationX/Y), by a start of its name as the map list has it. */
  function placeSquare(name) {
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = slug(name);
    const entry = [...W().resources.mapNames.entries()].find(
      ([id, n]) => id >= 400 && id <= 418 && (slug(n).startsWith(q) || slug(n).startsWith('dungeon' + q)),
    );
    if (!entry) throw new Error(`bot: no place "${name}"`);
    const index = Array.from({ length: 32 }, (_, i) => i).find((i) => (i > 18 ? 403 + i : 400 + i) === entry[0]);
    return { id: entry[0], name: entry[1], x: W().resources.misc.locationX[index], y: W().resources.misc.locationY[index] };
  }

  /** Walk to a town's, castle's or dungeon's square on Sosaria and Enter it. */
  async function enterAt(name) {
    const p = placeSquare(name);
    say(`to ${p.name} at ${p.x},${p.y}`);
    if (!(await walkTo(p.x, p.y))) return say(`could not reach ${p.name}`);
    await command(/^Enter/);
    await idle();
    say(W().current.id === p.id ? `in ${p.name}` : `did not get into ${p.name}`);
  }

  /** In a town or castle: walk into everyone once (the townsfolk move: each is sought again until reached). */
  async function talkAll(most = 40) {
    const w = W();
    const done = new Set();
    for (let n = 0; n < most; n++) {
      const people = [];
      for (let i = 0; i < 32; i++) if (w.monsters.type(i) && !done.has(i)) people.push(i);
      if (!people.length) break;
      const beside = (x, y) => people.some((i) => Math.abs(w.monsters.x(i) - x) + Math.abs(w.monsters.y(i) - y) === 1);
      // None of the rest can be reached (behind a counter, a locked door, the king's guards): done here.
      if (!(await walkUntil(beside, 120))) break;
      const i = people.find((j) => Math.abs(w.monsters.x(j) - w.x) + Math.abs(w.monsters.y(j) - w.y) === 1);
      if (i === undefined) continue;
      const dx = w.monsters.x(i) - w.x;
      const dy = w.monsters.y(i) - w.y;
      await press(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
      await answerWho(); // Lord British asks who will speak to him
      done.add(i);
      say(
        `talked: ${u3.screen.textRows
          .slice(-6)
          .map((r) => r.join('').trim())
          .filter(Boolean)
          .join(' / ')}`,
      );
    }
    say(`talked to ${done.size}`);
  }

  /**
   * Leave a town or castle by its nearest edge. The game takes the party out at the end of a turn on the west or north
   * edge (turn.ts endTurn); a step off the east or south edge wraps round to them.
   */
  async function leave() {
    const w = W();
    const size = w.current.size;
    const outside = () => w.party.location === Loc.Sosaria;
    const edge = (x, y) => outside() || x === 0 || y === 0 || x === size - 1 || y === size - 1;
    await walkUntil(edge, 600, 30); // the townsfolk in a passage the only way out are waited for longer
    if (!outside()) {
      await press(w.x === 0 ? 'left' : w.x === size - 1 ? 'right' : w.y === 0 ? 'up' : 'down');
      await idle();
    }
    say(outside() ? `out, at ${w.x},${w.y}` : 'still inside');
  }

  /** A PNG of the canvas, to tools/pilot/shots.mjs (screenshots/<name>.png at the repository's root). */
  async function shot(name) {
    await idle();
    // The game's canvas with the letters laid over it (src/ui/letterLayer.ts: the canvas just after it), at its size.
    const screen = document.getElementById('screen');
    const canvas = document.createElement('canvas');
    canvas.width = screen.width;
    canvas.height = screen.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(screen, 0, 0);
    const letters = screen.nextElementSibling;
    if (letters?.tagName === 'CANVAS' && letters.style.display !== 'none') ctx.drawImage(letters, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    try {
      await fetch(`http://127.0.0.1:5199/?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
      say(`shot ${name}`);
    } catch {
      say(`no shot ${name}: is the screenshot server running? (node web/tools/pilot/shots.mjs)`);
    }
  }

  /** For each place: walk there, go in, talk to everyone, take a shot, and leave. */
  async function tour(names, shots = false) {
    for (const name of names) {
      await enterAt(name);
      if (W().party.location === Loc.Town || W().party.location === Loc.Castle) {
        if (shots) await shot(`tour-${name}`);
        await talkAll();
        await leave();
      }
    }
  }

  window.bot = { press, idle, choose, command, walkTo, walkUntil, enterAt, talkAll, leave, fight, autoCombat, shot, tour, log };
  say('ready');
})();

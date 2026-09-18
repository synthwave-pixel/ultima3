# Ultima III in the browser: developer notes

A TypeScript port of LairWare's Macintosh remake of Ultima III (the C sources
in `../Sources`). It renders with plain Canvas 2D, plays sound and music with
Web Audio, and needs no game engine. What the game is and what changed for
the player is in the [root README](../README.md); this file is about the
code.

## Running it

```sh
cd web
npm install
npm run extract   # converts ../Resources and ../Images into public/
npm run dev       # http://localhost:5173
npm test          # unit tests (Vitest, run in Node)
npm run build     # typecheck + production build into dist/
npm run figures   # writes art/figures/ into the Standard tile sheet
```

The last Help page in the game shows `Build <hash>`, the short commit hash
the page was built from (`VITE_BUILD`, set by the Pages workflow and the
desktop bundler; `dev` otherwise), which tells a stale browser cache from a
real bug. `npm run extract` only needs to run again if the original
resources change.
Its output is committed so the game runs straight after `npm install`.
`?new` on the URL starts a fresh game instead of resuming the last one.

## What is ported

Everything the Apple II game had:

- Sosaria and Ambrosia: walking, wrap-around, line of sight, horse and
  frigate, wind, moongates and moon phases, the whirlpool, lava and
  forcefields, food, poison, healing, wandering monsters, pirates and
  dragons shooting, the Exodus castle traps.
- Towns and castles: NPCs and their dialogue, guards, doors and keys,
  signs, the eight shop types (pub, grocer, healer, weapons, armour,
  guild, oracle, horses), stealing, bribing, Lord British raising levels.
- Combat on the terrain arenas: melee, thrown daggers, bows and slings,
  monster movement, breath attacks, monster spells, thieves pilfering,
  poison, experience.
- All 35 spells, including the three post-Exodus wizard spells.
- Dungeons: first-person view, ladders, torches, chests and traps,
  fountains, the Time Lord, marks, gremlins, misty writing, random
  encounters.
- The shrines of Ambrosia, the cards and marks, the exotics, EVOCARE, the
  four cards in Exodus and the ending.
- Party management: creation, forming, marching order, handing equipment,
  ztats, death and resurrection, save and resume.
- Music: the original QuickTime music files are decoded and played on a
  small Web Audio synthesizer (`src/ui/music.ts`).
- Auto-combat, a LairWare addition.

Left out on purpose, all additions LairWare made for the Mac rather than
parts of the game: the animated intro and attract mode, auto-heal, the
"modern" stats dialog, the Diorama map and random map generator,
text-to-speech, mouse control, and the Mac dialogs (the Apple II text flow
is used instead).

## Implementation notes

The technical side of the changes listed in the root README. The records
written are still the Apple II's, so nothing here changes what a save
contains except the pooled gold, food and gear.

- **Pooled gold and food** live in spare bytes of the party record; the
  per-member counters (0..9999 each) are no longer used. Members eat a
  tenth of a ration a turn from the pool.
- **The bag** of weapons and armour is in spare bytes of the party record
  as well; a member's record keeps only the readied weapon and worn
  armour. Gems, keys, powders and torches are bytes 56-59 of the party
  record. Forming a party pools everything; dispersing deals it out, to
  members who can use each item first.
- **The save file** is at version 6: the journal came in at 5 and the
  moongate marks on the cloth map at 6. Older saves load with those empty.
  `Export game` writes `{ game, format, exported, save, automap }` as JSON;
  `parseExport` names what is wrong with a file it will not take.
- **The dungeon auto-map** keeps seen cells in its own browser store, not
  the save file, so "try again from last save" keeps what was learned.
- **Autosave** happens at Journey onward and at every town, castle and
  dungeon door, in and out. The overworld is deliberately not autosaved
  between doors.
- **Persistent storage** is requested from the browser at start
  (`navigator.storage.persist()`); the iOS seven-day warning is an `alert`
  once a day, keyed in local storage.
- **The PWA** uses `vite-plugin-pwa` with `registerType: 'prompt'`: the
  service worker precaches every file (about six megabytes), a waiting
  worker sets the "Update: restart" title entry, and `registration.update()`
  runs hourly.
- **Auto combat** follows the Mac planner with four departures: a member
  closing to melee follows a breadth-first path to the nearest square they
  can strike from, round comrades and walls; "nearly dead" is a quarter
  of maximum hit points, at most 50; a wounded member who cannot get away
  fights back; and Sanctu is cast only when someone is under 60% and down
  at least 20. The planner queues the keys a player would press
  (`GameIO.queueKeys`) and the ordinary prompts read them.
- **Diagonal moves** for the party, which the Mac allowed and walled
  Exodus' castle with mountains to compensate (`BlockExodus()`), remain
  behind `World.setDiagonalMoves` but are not offered in Settings.
- **The controller command menu** is built by `context.ts`: availability
  per scope (hidden, greyed, shown), the surroundings' suggestions first,
  then the shortcut entries. `healPlan`, `safeChestCaster` and `lightPlan`
  in `spells.ts` choose the caster and spell; their keys are `!`, `@` and
  `$`, dispatched in `game.ts`, `dungeon.ts` and `combat.ts`.
- **The journal** (`journal.ts`) reads "done" from the party where it can
  (marks borne, cards found, exotics in the bag, Exodus destroyed) and from
  flags set as things happen (the audience, the shore of Ambrosia, the word
  learned, the serpent parted, the Time Lord). Clues are ids like
  `Moon#6` or `LB:mark`. `journalPage` lays the page out for the cursor.
- **`heading()`** in `monsters.ts` uses true 8-bit wrap-around, as the
  Apple II did; the C port tested for negative values first.
- **Tile sheets**: 12 columns by 16 rows, two frames per tile, indices
  0-63 the Apple II tiles, 64-67 the shared party figures, 68-78 one
  figure per class in career-table order (only the sets in
  `CLASS_FIGURE_SETS`, Standard today; the others fill those cells with a
  flat colour and fall back in `tileRect` to the original
  `DetermineShape()` grouping), 80-95 the monster variants.
- **Graphics files** are listed in `public/graphics/index.json`, written
  by `npm run graphics-index` (and by `npm run build`) and checked by a
  test; the loader reads it once and asks only for files that exist, so a
  set without a mask or its own dungeon sheets costs no 404s. The Exodus
  tile is blank; its four light panels sit in column 5, rows 0-3, and
  `tileRect` points at the one whose turn it is. Tiles 58 and 59 are the
  north and south halves of the Great Serpent.
- **The Standard figures** are two atlases in `art/figures/` with their
  manifests, drawn to `docs/figure-art-spec.md` (with `snake-brief.md`
  and `second-pass-brief.md`); `tools/compose-figures.ts` writes them into
  `public/graphics/Standard-Tiles.png` doubled to 64 px, then rims every
  figure cell (and the two balls) with one sheet pixel of 50% black where
  a transparent pixel has an opaque 8-neighbour; rim pixels count as
  neither, so a rerun changes nothing, and `--no-halo` skips it. The Ranger's
  second frame in the older Standard art was made by turning the arm of
  the Mac's single frame about the shoulder.
- **Masks**: the Mac shipped a grey Mask image per set for creature
  transparency (QuickDraw had no alpha); those are baked into the alpha of
  the five sheets that had one. A set that ships a Mask file is still
  honoured. LairWare's originals remain in `Resources/Graphics`.
- **Dungeon art per set** is painted at run time (`dungeonArt.ts`) into the
  Mac sheet's layout and cut by its mask, so the first-person renderer is
  unchanged; `docs/dungeon-sheet.md` documents the layout. Moons likewise
  (`moonArt.ts`). Scene pictures are `<Set>-<Scene>.png` beside the tile
  sheets (`docs/scene-images.md`).
- **Chrome per set**: the Standard frame is LairWare's recoloured to
  copper; the five PC sets have UI sheets in their own palettes, snapped
  to their platform's colours.
- **The combat marker** is a rounded outline two game pixels wide, fading
  white to grey over the turn timer (black to grey on the Macintosh B&W
  set).
- **Hits** on the Standard set are a three-frame burst on the 16-pixel
  grid; the other sets keep their HIT tile.
- **Repeated turns** fold when a turn prints exactly what the previous one
  printed.
- **Cheats** are a table in `cheats.ts`, reached from the Help pages with
  Y (V on a keyboard in controller mode), and print to the message area.

## The desktop app

`../desktop/` wraps the built game in Electron for Windows, macOS and
Linux (the Steam Deck's target). `npm run bundle` there builds the game
with `VITE_BASE=./` and copies `dist/` into `desktop/app/`, dropping the
service worker; `main.cjs` serves that folder over a private `app://`
scheme, which counts as a secure origin, so storage, the clipboard and
the Gamepad API behave as on the web. The game skips service-worker
registration when its origin is not `http(s)`. `npm run smoke` launches
the app, screenshots it once the game is running and exits with the
result (`ELECTRON_NO_SANDBOX=1` for a root container). `npm run dist`
builds installers with electron-builder; `.github/workflows/desktop.yml`
does so on the three platforms for every push to main that touches the
game or an app (artifacts only) and for every manual run or push to the
`release` branch (published as a GitHub Release with every file). `desktop/version.cjs` decides the
version for every build: major.minor from `desktop/package.json` plus the
run number in Actions, a timestamped pre-release elsewhere. Builds are
unsigned; macOS is Apple Silicon only.

## The Android app

`../mobile/` wraps the same bundle with Capacitor for Android handhelds
(see its README). Its `npm run bundle` mirrors the desktop one, `npx cap
sync android` copies the result into the generated `android/` Gradle
project, and `./gradlew assembleRelease` makes the APK. The game detects
Capacitor (`window.Capacitor.isNativePlatform()`) and skips service-worker
registration there too. The desktop workflow builds the APK in an
`android` job beside the desktop matrix, and a final `release` job
publishes all four files together.

## How the code is organised

The port keeps the original module boundaries and function names so that
the C source can be read alongside it. Every function that ports a C routine
names it in its doc comment.

```
tools/extract-resources.ts   Mac resource fork + plists + images -> public/
src/data/resources.ts        typed access to the extracted data

src/game/   pure game logic, no DOM, unit tested
  tiles.ts        the three tile numbering schemes (map value, shape, tile index)
  player.ts       64-byte character record, with the byte layout documented
  party.ts        64-byte party record
  monsterTable.ts 256-byte monster/NPC table
  world.ts        map, monsters, position, moons, wind, dungeon and combat state
  viewport.ts     DrawMap: the 11x11 window with line of sight and overlays
  monsters.ts     SpawnMonster / MoveMonsters
  turn.ts         end-of-turn processing (the C code's Routine6E35)
  commands.ts     movement and the world commands (Board, Enter, Look ...)
  actions.ts      the party's own records (Get, Ready, Wear, Ztats ...)
  interact.ts     other creatures (Transact, Attack, Fire, Steal, Unlock, Other)
  shops.ts        the eight shops
  context.ts      which commands fit the surroundings (controller menu order)
  combat.ts       tactical combat
  autocombat.ts   the auto-combat planner (returns the keys to press)
  spells.ts       Cast and the spell effects
  dungeon.ts      the dungeon loop and what is visible in first person
  death.ts        party wipe and resurrection
  menu.ts         title screen, character creation, party organisation (menus)
  journal.ts      the quest journal: entries, clues, hints
  automap.ts      the dungeon auto-map
  cheats.ts       the cheat table
  names.ts        stock of names for the "random name" option
  game.ts         the main loop (Game) and command dispatch
  io.ts           the GameIO interface: how logic talks to screen/keys/sound
  save.ts         save-game serialisation
  random.ts       seedable RNG (RandNum)

src/ui/     browser only
  graphics.ts     tile sheet, mask, font and UI sheet; tile animation
  screen.ts       Canvas renderer and the GameIO implementation
  dungeonView.ts  the first-person dungeon renderer
  input.ts        keyboard as an awaitable queue
  menus.ts        menu windows (keys, feedback sounds), controller command lists, gamepad reader
  touch.ts        the virtual controller on touch screens
  dungeonArt.ts   dungeon sheets painted per tile set
  moonArt.ts      moon phases painted per tile set
  platform.ts     iOS detection and the storage warning
  sound.ts        Web Audio effects: two sets, a gain table, repeat rules
  music.ts        QuickTime music decoder and synthesizer
src/main.ts       bootstrap, service worker, export/import transfer
tools/compose-figures.ts   art/figures/ -> the Standard tile sheet
tools/chip-sfx.ts          renders the Standard sound effects (npm run sfx)
```

### Semantic prompts

Game logic never reads raw keys for a decision. It asks the `GameIO` for a
_member_, a _direction_, an _option_ from a list, a _number_ or a _word_
(`chooseMember`, `chooseDirection`, `chooseOption`, `inputText`, and
`waitCommand` for the top-level command). The keyboard implementation
answers each the way the Apple II did; the controller implementation
(`ui/menus.ts` and the Screen) answers with a menu window. Tests use a fake
that answers from a key queue.

### The blocking-input problem

The C code waits for keys deep inside call stacks (`WaitKeyMouse()` spins on
the Mac event loop). A browser cannot block, so every routine that may wait
is `async` and awaits `io.waitKey()`. The control flow is otherwise the same
as the original, which keeps the port easy to compare against the C. Keys
pressed while the game is busy queue up, as the Mac's events did, but a
queued press older than 300 ms is dropped when the game next asks, so
presses made during a combat start or an animation do not play out later.

### Data formats

The byte layouts of the character record, party record, monster table,
combat arenas, map and dungeon resources are documented at the top of
`player.ts`, `party.ts`, `monsterTable.ts`, `combat.ts`, `world.ts` and
`resources.ts`. The tile numbering (map value, shape, tile index) is
explained in `tiles.ts`, and the music event format in `ui/music.ts`.

### Testing

`npm test` runs the Vitest suite against the real extracted data: records,
viewport line of sight, movement, monsters, turn processing, combat,
spells, shops, dialogue, doors and chests, dungeons, menus, save
round-trips and the music decoder. The renderer is exercised in headless
Chromium (Playwright is preinstalled in the development environment) by
driving the keyboard and taking screenshots. `npm run format` applies
Prettier (single quotes, 140 columns; see `.prettierrc.json`) and
`npm run lint` runs ESLint (typescript-eslint's type-checked rules, with
unawaited promises as errors; see `eslint.config.js`). The CI workflow
runs the format check, the lint, the tests and the build, in that order.

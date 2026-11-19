# Developing Ultima III

*The new version lives in the `web` directory. The sources, resources and
Xcode project in [`Lairware/`](Lairware/) are the old LairWare build, kept
for reference.*

The port is in [`web/`](web/README.md): how to run it, how the code is
organized, data formats and testing. The desktop app is in
[`desktop/`](desktop/README.md), a thin Electron shell around the built
game, with its own notes, and the Android app in
[`mobile/`](mobile/README.md), the same game wrapped with Capacitor.

The art briefs the new figures and dungeon sheets were drawn to are in
[`web/docs/`](web/docs/). The original Macintosh sources and resources are
in [`Lairware/`](Lairware/), unchanged.

[`showcase/`](showcase/README.md) holds exported games at the game's
sights, for trying it, screenshots and testing: `npm run saves` in `web/`
makes them from a new game brought on by the test harness
(`web/tools/saves/showcase.ts`), which runs under node through
`web/tools/node-ts.mjs`, a loader that compiles the game's TypeScript
(node strips types itself, but not the classes' parameter properties).

Three tools play the game without a person at the keyboard. The fuzzer
(`npm run fuzz` in `web/`, `web/tools/sim/fuzz.ts`) plays it headless at
random - fights with random parties and monsters, and travels from towns,
castles, dungeons, Ambrosia and a frigate - and after every key checks
what must always hold: where the party stands, its hit points, stats and
supplies, a fight's squares, a fight that ends. A failure is reported with
the arguments that replay it (`fights=0 travels=1 seed=N log`). The pilot
(`web/tools/pilot/bot.js`, its [README](web/tools/pilot/README.md)) plays
the development build in a browser with a controller's keys only, and
`web/tools/pilot/shots.mjs` saves its screenshots to `screenshots/`.

The READMEs open with the banner, `promo/banner.jpg`: the wide capsule at
twice its size. It, the logo (`promo/logo.png`), the Steam artwork and the
boot screen are made by `web/tools/key-art.mjs` from the box (see
[its README](web/art/box/README.md)). The four sheets after the banner are
in [`promo/`](promo/): twelve screenshots of the Remastered look, six to a
sheet (the world, then playing it), and the thirteen tile sets at the
opening, in one fight and in one dungeon corridor, over two sheets (the new
looks and the PC's, then the Macintosh, Apple II, Commodore 64 and NES). The shots are taken in a development build by
`web/tools/promo/shots.js`, pasted into the console as the pilot is: a shot
is the game canvas with the letters layer drawn in (`promo.shot(name)`),
and `promo.tileSets()` sets each scene up once and redraws it in every
set, so a row compares the same moment. `web/tools/pilot/shots.mjs` saves
them to `screenshots/`, and `web/tools/features-sheet.sh` and
`web/tools/tile-sets-sheet.sh` (ImageMagick 7) lay them out, naming each
shot. Both are JPEG.

Inside the app, F11 or Alt+Enter toggles full screen, as do the system's
own controls (macOS's green button) and the touch pad's full-screen switch
(through `preload.cjs`; `web/src/ui/fullScreen.ts`). The window starts full
screen unless it was last left a window, which `window.json` in the app's
data remembers with its place and size (`desktop/windowState.cjs`), and
always under Steam's Game Mode; `--fullscreen` and `--windowed` on the
command line force one or the other, and `--new` and `--controller` do what
the web version's `?new` and `?controller` flags do. The window must never
be made with `fullscreen: false` said outright: on macOS that takes full
screen away altogether, the green button and F11 with it.

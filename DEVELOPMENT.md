# Developing Ultima III

*The new version lives in the `web` directory. The sources, resources and
Xcode project at the root are the old LairWare build, kept for reference.*

The port is in [`web/`](web/README.md): how to run it, how the code is
organized, data formats and testing. The desktop app is in
[`desktop/`](desktop/README.md), a thin Electron shell around the built
game, with its own notes, and the Android app in
[`mobile/`](mobile/README.md), the same game wrapped with Capacitor.

The art briefs the new figures and dungeon sheets were drawn to are in
[`web/docs/`](web/docs/). The original Macintosh sources and resources are
at the root of the repository, unchanged.

The two sheets the README opens with are in [`promo/`](promo/): six
720p screenshots of the Standard experience, and the game's view in each
of the thirteen tile sets with combat and dungeon views for some. They are
composed from 1280x720 screenshots of the game, laid out in a page and
captured with Playwright's Chromium. Playwright is not a dependency of this
repository, so a reshoot needs it installed separately.

Inside the app, F11 or Alt+Enter toggles full screen, `--fullscreen` and
`--windowed` on the command line force one or the other, and `--new` and
`--controller` do what the web version's `?new` and `?controller` flags do.

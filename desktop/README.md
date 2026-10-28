# Ultima III desktop app

![EXODUS: Ultima III, 1983 to 2026, beside the demon from Denis Loubet's box painting](../promo/banner.jpg)

A thin Electron shell around the built game in `../web`. See the developer
notes in `../web/README.md` for how it fits together, and the root README
for how to install the builds on Windows, macOS, Linux and the Steam Deck.

```sh
npm install
npm run bundle     # builds ../web with relative paths and copies dist/ into app/
npm start          # runs the app (add --fullscreen, --windowed, --new, --controller)
npm run smoke      # launches it, screenshots the running game, exits 0 on success
npm run dist       # installers for this platform into dist/ (dist:linux, dist:win, dist:mac)
npm run smoke:built  # the same smoke test, of the app as dist/ packaged it
```

Builds for all three platforms come from the "Desktop and Android builds"
workflow under Actions: a push to main that touches the game or an app
keeps them as artifacts; a manual run, or a push to the `release` branch
(`git push origin main:release`), publishes them as a release. The
version comes from `version.cjs`: the major.minor of `version` in
`package.json` with the run number as the patch in Actions, or a
timestamped pre-release (`1.0.0-dev.20260915.2214`) for a build made
anywhere else; `BUILD_VERSION` overrides both. `npm run dist` passes it
to electron-builder as metadata, so `package.json` is never edited.
macOS builds are Apple Silicon only, for macOS 13 or later (Electron 44's
minimum), and signed ad-hoc (`identity: "-"`), which Apple Silicon needs
once the fuses below have changed the Electron binary. A manual run with
"publish" off keeps the builds as artifacts instead of making a release.

The packaged app checks its own code as it loads. electron-builder sets
Electron's fuses (`electronFuses` in `package.json`): the app is loaded
only from its `app.asar`, whose hash the build records and Electron checks
block by block as it reads (on macOS and Windows), and the binary cannot
be run as plain Node, take `NODE_OPTIONS` or open an inspector, and gives
`file:` pages no extra privileges. A copy with any file in the archive
altered refuses to start. `npx @electron/fuses read --app <the app>`
lists them; `npm run smoke:built` launches the app as packaged, fuses
set.

A release's notes come from the changelog in the root README:
`release-notes.cjs` prints the section headed with the release's version
(`### v1.0.27, September 18, 2026`), each wrapped item joined onto one
line, and the release job puts it above GitHub's generated compare link.
Since the patch is the run number, the heading names the number the push
to `release` will get: one more than the push to `main` made just before
it, which `gh run list --workflow desktop.yml` shows. Without a section
for its version a release still goes out, with a warning and the compare
link alone.

One copy runs at a time (`app.requestSingleInstanceLock()` in
`main.cjs`): a second launch brings the first window forward and quits,
since two copies would share one save. Under Flatpak the lock holds across
launches because electron-builder's wrapper points `TMPDIR`, where
Chromium keeps the lock's socket, at a directory the instances share. The
game offers Quit on its title menu when it sees the `app:` scheme the
window loads it from, and quits by closing that window.

As it starts, the app asks GitHub for the newest release (`updates.cjs`);
where that is newer than its own version, the page learns of it through
`preload.cjs` (the one thing the page may ask of the app, with opening the
release's page) and the title says so, once a version in a box of its own
and in its menu's "Update (x.y.z)" line, either opening the page in the
system browser. Nothing is downloaded or installed. It does not
ask in the Flatpak (flatpak updates it from the site's repository), under
gamescope (Steam's Game Mode, where a browser would cover the game), in a
copy run unpackaged or built locally, or with `--no-update-check`.
`ULTIMA3_RELEASES_API` points the question elsewhere, for testing.

Added to Steam as a non-Steam game (the Flatpak on a Steam Deck, say), the
game has no artwork in Steam's library: Steam takes it only from
`userdata/<account>/config/grid/`, under the shortcut's id. Launched from
such a shortcut, Steam passes that id (`SteamGameId`), and the app copies
its artwork there (`steamArt.cjs`, from `build/steam/`): the portrait and
wide capsules, the hero and a blank logo (the hero shows bare; with no
logo Steam would write the game's name over it), which Steam shows the
next time it starts. Only for a non-Steam shortcut, only into the account whose
`shortcuts.vdf` lists it, never over a picture already there, each file
written aside and linked into place, every failure caught and logged, and
once per shortcut (a note in the app's data says so; a later version's
new artwork replaces only the pictures the app put there itself). The
pictures are made by `web/tools/key-art.mjs` from the box scan in
`web/art/box/`.

Linux gets an AppImage and a Flatpak bundle. The Flatpak is built only
where `flatpak-builder` and the Freedesktop 25.08 runtime, SDK and
Electron base app are installed, which the Linux job does (on a Linux
machine: `flatpak install flathub org.freedesktop.Platform//25.08
org.freedesktop.Sdk//25.08 org.electronjs.Electron2.BaseApp//25.08`), so
`npm run dist:linux` elsewhere builds the AppImage alone and the workflow
asks for both (`--linux AppImage flatpak`). Its permissions are the
`flatpak` block in `package.json`: display, sound, the home folder for
Export and Import, every device, and read access to udev's device
database, which Chromium needs before it lists a gamepad. Under gamescope
(Steam's Game Mode) `main.cjs` turns off GPU acceleration and the
Chromium sandbox, which have hung other Electron apps there.

The site also serves the newest release as a Flatpak repository, at
`/flatpak/` under the Pages address: the Pages workflow runs
`flatpak-repo.sh`, which downloads the release's bundle, imports it into
a fresh OSTree repository, signs it with the key in the `FLATPAK_GPG_KEY`
and `FLATPAK_GPG_KEY_ID` secrets, and writes the `.flatpakrepo` and
`.flatpakref` files beside it. The release job starts a Pages deploy of
the commit it released, so the site's game and the repository both follow
each release (a push to main deploys nothing); a pruned repository holds
one commit, so nothing is kept between deploys. The
service worker leaves `/flatpak/` alone (`navigateFallbackDenylist` in
`../web/vite.config.ts`), or a browser that had played the game would be
handed the game instead of the `.flatpakref`.

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
workflow under Actions, which runs only for releases and on demand: a push
to main gets the checks alone (the "Checks" workflow, `ci.yml`), which
every build run also passes first. A push to the `release` branch
(`git push origin main:release`) is a release: the apps and the web game
are built, then published as a GitHub Release and the site deployed, in
one run. A manual run does what its "kind" says: `dev-builds` (the
default) keeps the builds as artifacts, `prerelease` publishes a GitHub
pre-release for testers (the update offer ignores it, and the site is not
deployed), and `release` is a release. The
version comes from `version.cjs`: the major.minor of `version` in
`package.json` with the run number as the patch in Actions, or a
timestamped pre-release (`1.0.0-dev.20260915.2214`) for a build made
anywhere else; `BUILD_VERSION` overrides both. `npm run dist` passes it
to electron-builder as metadata, so `package.json` is never edited.
macOS builds are Apple Silicon only, for macOS 13 or later (Electron 44's
minimum), a `.dmg` and the `.zip` an update installs. `dist.cjs` hands
electron-builder the Mac settings from `macSigning.cjs`: given the
Developer ID certificate (`CSC_LINK`, the `.p12` in base64, with
`CSC_KEY_PASSWORD` and `MACOS_SIGNING_IDENTITY`), the app is signed with
it under the hardened runtime and `build/entitlements.mac.plist`, the
build fails rather than fall back to ad hoc, and the packaged
`package.json` is marked `selfUpdate`; with `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` as well it is
notarized. Without the certificate (a local build, and the release
builds until the repository has the secrets) it is signed ad hoc
(`identity: "-"`), which Apple Silicon needs once the fuses below have
changed the Electron binary, and it cannot update itself.

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

Updates follow the Ultima V port's (`updates.cjs`). As the app starts it
looks for a newer release, each copy as it can be updated:

- **auto**: the Windows installer's copy, the AppImage, and a Mac app
  signed with the Developer ID (`selfUpdate`) and run from Applications.
  electron-updater downloads the release in the background, from the
  `latest*.yml`, blockmaps and Mac `.zip` the release carries (the
  `publish` block in `package.json` has electron-builder write them, even
  with `--publish never`), and installs it as the game quits, or at once
  on Restart now. The AppImage is always `ultima3-sp-x86_64.AppImage`, so
  an update replaces it in place. A restart lets go of the one-copy lock
  first, or the new copy, started before this one has gone, would take
  itself for a second launch. Should it fail (a Mac refusing the new
  app), the release is told of instead.
- **notice**: the Windows portable `.exe`, and a Mac app signed ad hoc or
  run outside Applications (macOS runs a downloaded app from a read-only
  copy). The newer release, from GitHub's API, is told of, and its page
  offered.
- **flatpak**: through Flatpak's update portal (`flatpakUpdates.cjs`, in
  process over D-Bus with `@particle/dbus-next`), from the site's signed
  repository; see [`../docs/flatpak-updates.md`](../docs/flatpak-updates.md).
  The once-only approval is asked at the desktop; where the portal
  can't be had or the update fails, a notice says how to update. A quit
  while it comes down waits for it, a minute at most. The Flatpak has
  `--share=network` for GitHub's API and the release notes.
- **none**: a copy run unpackaged or built locally (a `-dev` version), or
  started with `--no-update-check`. With `--no-auto-update` any copy is a
  notice only.

What there is goes to the page through `preload.cjs` (`u3native.updates`:
the offer, taking it up, the player told of it, and What's new), and the
game says it (`../web/src/game/updateOffer.ts`): a box over the title
once a version and its menu's "Update (x.y.z)" line, a line in the
message area in play with an Update line on the Pause menu, and on the
first start after an update "Updated to Ultima III x.y.z" with What's
new, the release's notes as the game's own pages. `updates.json` in the
app's data keeps the release last told of, the version last run, the
Flatpak's approval and its last failure. Under gamescope (Steam's Game
Mode) no page is offered; a copy Steam launched (`SteamGameId`) never
restarts itself, and its update installs as it quits. Pre-releases are
never updated to: electron-updater is told so, and GitHub's latest
release is never one. `ULTIMA3_RELEASES_API` points the GitHub questions
elsewhere, for testing; a smoke test asks nothing.

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
`flatpak` block in `package.json`: display, sound, the network (for the
update check and release notes), the home folder for Export and Import,
every device, and read access to udev's device database, which Chromium
needs before it lists a gamepad. Under gamescope
(Steam's Game Mode) `main.cjs` turns off GPU acceleration and the
Chromium sandbox, which have hung other Electron apps there.

The site also serves the newest release as a Flatpak repository, at
`/flatpak/` under the Pages address: a release's run builds the site and
runs `flatpak-repo.sh` with that run's own Linux bundle, which it imports
into a fresh OSTree repository, signs with the key in the
`FLATPAK_GPG_KEY` and `FLATPAK_GPG_KEY_ID` secrets, and serves with the
`.flatpakrepo` and `.flatpakref` files beside it; the site is deployed
once the release is published, so the site's game and the repository
both follow each release (a push to main deploys nothing). The "Redeploy
the latest release" workflow (`pages.yml`) puts the newest release back,
downloading its bundle. A pruned repository holds one commit, so nothing
is kept between deploys. The
service worker leaves `/flatpak/` alone (`navigateFallbackDenylist` in
`../web/vite.config.ts`), or a browser that had played the game would be
handed the game instead of the `.flatpakref`.

# Ultima III desktop app

A thin Electron shell around the built game in `../web`. See the developer
notes in `../web/README.md` for how it fits together, and the root README
for how to install the builds on Windows, macOS, Linux and the Steam Deck.

```sh
npm install
npm run bundle     # builds ../web with relative paths and copies dist/ into app/
npm start          # runs the app (add --fullscreen, --windowed, --new, --controller)
npm run smoke      # launches it, screenshots the running game, exits 0 on success
npm run dist       # installers for this platform into dist/ (dist:linux, dist:win, dist:mac)
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
macOS builds are Apple Silicon only. A manual run with "publish" off
keeps the builds as artifacts instead of making a release.

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
Chromium keeps the lock's socket, at a directory the instances share.

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
`.flatpakref` files beside it. The release job starts a Pages deploy
after publishing, so the repository follows each release; a pruned
repository holds one commit, so nothing is kept between deploys. The
service worker leaves `/flatpak/` alone (`navigateFallbackDenylist` in
`../web/vite.config.ts`), or a browser that had played the game would be
handed the game instead of the `.flatpakref`.

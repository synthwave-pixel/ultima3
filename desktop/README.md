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

Linux gets an AppImage and a Flatpak bundle. The Flatpak is built only
where `flatpak-builder` and the Freedesktop 25.08 runtime, SDK and
Electron base app are installed, which the Linux job does (on a Linux
machine: `flatpak install flathub org.freedesktop.Platform//25.08
org.freedesktop.Sdk//25.08 org.electronjs.Electron2.BaseApp//25.08`), so
`npm run dist:linux` elsewhere builds the AppImage alone and the workflow
asks for both (`--linux AppImage flatpak`). Its permissions are the
`flatpak` block in `package.json`: display, sound, the home folder for
Export and Import, and every device so gamepads are seen. Under gamescope
(Steam's Game Mode) `main.cjs` turns off GPU acceleration and the
Chromium sandbox, which have hung other Electron apps there.

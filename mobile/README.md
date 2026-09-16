# Ultima III for Android

The built game wrapped in [Capacitor](https://capacitorjs.com/) as an
Android app, for handhelds such as the AYN Odin, the Retroid Pocket and
any phone or tablet that can sideload an APK. iOS is left out on purpose:
installing outside the App Store is more trouble than the web version's
Add to Home Screen.

## What the app does

- Loads the game from its own files (`app/`, packed into the APK) over
  Capacitor's `https://localhost` origin, so storage, the clipboard and
  the Gamepad API behave as in a browser. The service worker is dropped:
  updates are new APKs, and the saved game stays in the app's storage
  across them.
- Runs full screen in landscape with the system bars hidden; a swipe from
  an edge shows them for a moment.
- Maps the system Back button (and a handheld's Back key) to Escape, which
  opens the game's Settings menu.
- Physical controls that Android reports as a gamepad switch the game to
  controller mode on the first press; a tap on the screen shows the
  virtual controller instead.

## Obtainium

The root README carries a "Get it on Obtainium" badge (`badge_obtainium.png`
here, Obtainium's own artwork, trimmed). It is an
`apps.obtainium.imranr.dev/redirect` link to `obtainium://app/<config>`,
where the config names this repository as the source, so Obtainium
installs the APK from the latest release and updates it from later ones.
The APK is the only `.apk` in a release, so no asset filter is needed.

## Building

Requirements: Node 22, a JDK (17 or newer) and the Android SDK with
platform 35 and build-tools (Android Studio installs them; on a CI runner
they are preinstalled).

```sh
cd web && npm ci && cd ../mobile && npm ci
npm run bundle          # builds ../web with VITE_BASE=./ into app/
npx cap sync android    # copies app/ and the plugin list into android/
npm run apk             # dist/Ultima-III-<version>-android.apk
```

`node icons.mjs` regenerates the launcher icons and the black launch
background from `../desktop/build/icon.png` (it uses the Playwright
Chromium from the web project's tooling).

## Signing

Android refuses an unsigned APK, and refuses to update an app whose new
build is signed with a different key. `sideload.keystore` is therefore
committed: every CI build signs with it, so one build installs over the
last and keeps its saves. It is a sideload key only; it proves nothing
beyond "built from this repository's CI", and its password is in
`android/app/build.gradle`.

For a release key of your own, set four repository secrets and the
workflow uses them instead: `ANDROID_KEYSTORE_BASE64` (the keystore file,
base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD`. Locally, the same names as environment variables
(with `ANDROID_KEYSTORE_FILE` as the path) do the same.

## Versions

`apk.cjs` takes the version from `../desktop/version.cjs`, the one source
for every build: in Actions the major.minor from `desktop/package.json`
with the run number as the patch, elsewhere a timestamped pre-release.
Android's `versionCode`, which must rise for a build to install over the
last, is the run number in Actions and minutes-since-2024 for a local
build, so a developer's APK installs over any release; going back to a
release after that means uninstalling first. `package.json` here carries
no version of its own. The `android/` folder is Capacitor's
generated project, kept in git as Capacitor intends, with these local
changes: the version and signing block in `app/build.gradle`,
`screenOrientation` in the manifest, `MainActivity.java`, the icons, the
black splash and launcher background.

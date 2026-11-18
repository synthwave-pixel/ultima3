# A Flatpak that updates itself

How the desktop app's Flatpak keeps itself up to date, written up as a
pattern for any Electron app shipped as a Flatpak. It came from the
Ultima V port, which works the same way. The code is
[`desktop/flatpakUpdates.cjs`](../desktop/flatpakUpdates.cjs) (about 120
lines), wired in by [`desktop/updates.cjs`](../desktop/updates.cjs).

## The problem

A Flatpak is normally updated from outside: GNOME Software, KDE Discover,
or `flatpak update`. On a Steam Deck that means Discover, which runs only
in Desktop Mode, so a player who stays in Game Mode, which is most of them,
never sees a release until they switch to the desktop to look. Other
builds of the game (the Windows installer, the AppImage) update themselves
with electron-updater, which can't replace a Flatpak's files.

## The answer: Flatpak's update portal

Flatpak gives every sandboxed app a D-Bus service for updating itself:
the update portal, `org.freedesktop.portal.Flatpak` at
`/org/freedesktop/portal/Flatpak`. This is not part of
xdg-desktop-portal: it is flatpak's own `flatpak-portal`, started on
demand. It works under Steam's Game Mode, and it needs no extra
permission. A Flatpak's filtered session bus always reaches
`org.freedesktop.portal.*`, so nothing changes in `finishArgs`, and there
is no sandbox escape.

With it, the app asks for its own newer commit to be pulled from the
remote it was installed from and deployed beside the running one. Flatpak
verifies it exactly as it would any update (here, the GPG-signed
repository the site serves; see `desktop/flatpak-repo.sh`). The running
copy carries on, and the next start is the new version.

### The calls

| Call | What it does |
|---|---|
| Property `version` | The portal's version. Update monitors arrived in version 4 (flatpak 1.6). Check before using them. |
| `CreateUpdateMonitor(a{sv} options) → o handle` | An `org.freedesktop.portal.Flatpak.UpdateMonitor` object for this app. |
| Signal `UpdateAvailable(a{sv})` | What the portal's own check found: `running-commit`, `local-commit` (deployed) and `remote-commit`. It checks half an hour after the monitor is made, then every half hour, and signals whenever these change. Its first check always signals, newer or not. |
| `UpdateMonitor.Update(s parent_window, a{sv} options)` | Pull and deploy it. Pass `''` and `{}`. Returns at once; progress comes as signals. |
| Signal `Progress(a{sv} info)` | `status` (uint): 0 running, 1 empty (nothing to do), 2 done, 3 error (`error`, `error_message`). Also `n_ops`, `op`, `progress`. |
| `Spawn(ay cwd, aay argv, a{uh} fds, a{ss} env, u flags, a{sv} options)` | With flag 2 (`FLATPAK_SPAWN_FLAGS_LATEST_VERSION`), starts the newest deployed version in a sandbox of its own: the restart. |
| `UpdateMonitor.Close()` | Lets the monitor go. Called as the app quits. |

### The once-only approval

The first `Update` an app asks for shows a dialog, "Update Ultima III?"
("The application wants to update itself"), with Deny and Update. The
portal asks through the desktop's Access portal
(`org.freedesktop.impl.portal.Access`). The answer is kept in the
permission store, table `flatpak`, id `updates`, and the dialog never
comes again. `flatpak permission-show com.synthwavepixel.ultima3` shows
it. This is all in `request_update_permissions_sync` in flatpak's
`portal/flatpak-portal.c`, and it runs before the portal looks for
anything to update.

**Under Steam's Game Mode the dialog may not be shown.** Game Mode's
portal backend (`xdg-desktop-portal-holo`) isn't KDE's. On a Steam Deck,
the first update tried in Game Mode failed, and the game fell back to
"update it in Desktop Mode". Started from the desktop, the same update
asked, was allowed, and went through. Once allowed, later updates need
no dialog, Game Mode included.

So the app asks at the desktop, before it matters. On its first start
outside Game Mode, until the approval is given, it calls `Update` even
with nothing newer. The dialog shows; the portal then finds nothing to
do (`Progress` status 1) and the app notes in `updates.json` that it's
allowed. A player who installs from Discover and starts the game once
before going back to Game Mode never meets the problem.

If an update still fails in Game Mode for want of the approval, the game
says so: "Start the game once in Desktop Mode and choose Update when
asked: from then on it updates itself, here too."

If the player chose Deny, the store says no, and the dialog never comes
again. The game says updates were turned down. To allow them again, run
this in Konsole:

    flatpak permission-set flatpak updates com.synthwavepixel.ultima3 yes

or reset it with `flatpak permission-reset com.synthwavepixel.ultima3` so
the next update asks again.

### The flow (`flatpakUpdates.cjs`)

1. As soon as the app starts, look at GitHub's newest release (the same
   check the other builds make). The game plays on while the rest
   happens in the background; nobody waits at the title for it.
2. Connect to the portal, check its version, and create an update
   monitor.
3. Call `Update` at once if GitHub already has a newer release (the
   portal's own check is half an hour away), or, at the desktop, to ask
   the approval (above). When `UpdateAvailable` arrives, compare its
   commits:
   - `remote-commit` differs from `local-commit`: call `Update`.
   - The same, but `local-commit` differs from `running-commit`: an
     update is installed already (Discover, while the game played). Say
     so, without calling `Update`.
   - All three the same: nothing to do. That's the first check's signal,
     and calling `Update` for it would ask the approval for nothing.

   Only one update at a time; nothing more once installed.
4. On `Progress`:
   - **2 (done):** tell the game. At the title, a box says "Ultima III
     1.0.90 is installed. Restart to play it now", in the same box and
     menu line the other builds use (`web/src/ui/updates.ts`,
     `web/src/game/updateOffer.ts`, `menu.ts`). In play, a line in the
     message area says it instead, before the next turn, interrupting
     nothing (`game.ts`), and the Pause menu keeps an Update line
     (`web/src/ui/screen.ts`). A restart is never offered from play: it
     would lose the game since the last save, so the line says to Quit
     and save.
   - **1 (empty):** do nothing yet. The release is out but the repository
     doesn't have it, because the Pages deploy runs a few minutes after
     the release job. The portal's `UpdateAvailable` comes once it does.
   - **3 (error):** fall back (below).
5. Restart: `Spawn` the newest version with the app's own command, then
   quit. **Under Steam's Game Mode, only quit.** A process started outside
   Steam isn't shown in Game Mode, so the box says "Quit, and start the
   game again" and Steam's next launch runs the new version.
6. **Quitting mid-download waits for it.** The portal gives up an update
   when the app that asked for it goes away, so a short session could
   otherwise never finish one. While an update is coming down, closing
   the window (or the game's Quit) is held: the page shows "Finishing the
   update…" (`preload.cjs`) and the app quits when the update ends, or
   after a minute at most (`main.cjs` `holdForUpdate`). Only a quit the
   app can see is held; Steam's Exit game, which kills the process, isn't.
7. **The first start after an update says so.** The app keeps the version
   it last ran (`updates.json`). When a newer one starts, by whatever route
   the update came, the title shows "Updated to Ultima III 1.0.90, from
   1.0.86" with a **What's new** button. That fetches the release's notes
   from GitHub and shows them, Markdown stripped, as the game's own text
   pages, which works under Game Mode where a browser wouldn't.

### The fallback

If the portal can't be had (no session bus, a flatpak older than 1.6) or
the update fails, the app tells the player about the release instead.
Outside Game Mode that's the release's page, as the portable `.exe` does.
Under Game Mode it's only the way to update, since a browser there would
leave the game behind. That depends on why it failed
(`flatpakUpdates.cjs` `reason`, from `Progress`'s D-Bus error name):

| Failure | Error | What the game says |
|---|---|---|
| The approval couldn't be asked | `NotSupported` ("No portal support found"), `ServiceUnknown`, `NoReply`, "Failed to show access dialog" | Start the game once in Desktop Mode and choose Update. |
| The approval was refused | `AccessDenied` ("Application update not allowed") | Updates were turned down: allow them as the README says, or use Discover. |
| The release adds a permission | "new version requires new permissions" | Update it in Desktop Mode, from Discover. |
| Anything else (network, disk) | other | Update it in Desktop Mode, from Discover. |

The failure is also kept in `updates.json` (`lastError`: message, reason,
version, time), since Game Mode has no console to read it from. A later
successful update clears it.

## Gotchas

- **The signals are unicast.** The portal sends `UpdateAvailable` and
  `Progress` only to the connection that created the monitor, and
  `Update` is accepted only from that connection. So `gdbus call` and
  `gdbus monitor` in separate processes can't drive it; the D-Bus client
  has to live in the app. We use
  [`@particle/dbus-next`](https://www.npmjs.com/package/@particle/dbus-next),
  a maintained, pure-JavaScript fork of `dbus-next`. It needs no native
  module, so it doesn't complicate electron-builder's cross-platform
  builds, and it's only `require`d when the portal is actually used.
- **The app needs the network itself.** The portal pulls the update on
  the host, outside the sandbox, but the app's own GitHub check and the
  release notes are fetched from inside it. Without `--share=network` in
  `finishArgs`, Chromium sees no network at all
  (`net::ERR_INTERNET_DISCONNECTED`), and the update waits for the
  portal's own periodic look. This port's Flatpak had no network until
  it began to update itself.
- **The portal won't take an update that adds a permission.** A new
  version asking for more than the installed one has (as adding
  `--share=network` did) has to come through Discover or `flatpak update`,
  which show the permission and ask. Updates that keep the permissions
  the same go through the portal as usual. So settle the permissions
  before relying on self-updates.
- **The command to spawn.** electron-builder's flatpak target runs the
  app as `electron-wrapper` (in `/app/bin`, which wraps `zypak-wrapper`
  around Electron), so that is the `argv` given to `Spawn`. Each `ay`
  argument is NUL-terminated.
- **Self-hosted repository, not Flathub.** Flathub builds and serves the
  updates itself, and any app installed from it updates the same way. The
  portal pulls from whatever remote the app came from: here the signed
  OSTree repository the Pages deploy builds from each release.
- **The release lags the repository.** The release job publishes first,
  and the Pages deploy builds the repository after. "Empty" from the
  portal in that window is expected, not an error.
- **The variants.** dbus-next hands `a{sv}` values back as
  `{ signature, value }`; `plain()` in `flatpakUpdates.cjs` unwraps them.
- **The approval is asked, and can fail, before anything downloads.**
  `Update` returns at once whatever happens, and the dialog runs in the
  portal's update thread, so a missing dialog shows only as a `Progress`
  error. See "The once-only approval".

## Testing

The D-Bus side is injected, so the tests run anywhere:

- `web/tests/flatpakUpdates.test.ts` drives the flow with a fake portal
  (an update at once, the repository behind, Game Mode's quit, no portal,
  a failed update, the approval asked at the desktop, the commits
  compared, each failure's reason). It also checks the exact D-Bus calls against a fake
  bus: the version check, `CreateUpdateMonitor`, `Update`, and `Spawn`'s
  arguments.
- `web/tests/updates.test.ts` checks the title screen's wording for
  each offer, the line in play and the Pause menu's.

What the tests can't show is the real portal. Check that on a Steam Deck:

1. Install a release from Discover and start it once from the desktop.
   "Update Ultima III?" should appear; choose Update.
   `flatpak permission-show com.synthwavepixel.ultima3` should then list
   `flatpak updates com.synthwavepixel.ultima3 yes`.
2. Publish a newer release and wait for the Pages deploy.
3. Start the game in Game Mode. The box should say the update is
   installed; quit, and start the game again from the library.

If it falls back instead, `~/.var/app/com.synthwavepixel.ultima3/config/Ultima III/updates.json`
holds `lastError`.

## To use it elsewhere

1. Copy `flatpakUpdates.cjs` and add `@particle/dbus-next` as a
   dependency (listed in electron-builder's `files` so it's packaged).
   Make sure the Flatpak's `finishArgs` include `--share=network`.
2. Detect the Flatpak (`FLATPAK_ID` set, or `container=flatpak`) and run
   `connect()`, then `watch({ portal, newer, installed, failed })` a few
   seconds after start.
3. Say "installed, restart to play it" in your own UI. Restart with
   `spawnLatest()` then quit, or just quit under gamescope
   (`GAMESCOPE_WAYLAND_DISPLAY` set).
4. Keep a fallback notice for when `connect()` returns null or the update
   fails, worded by `reason`'s answer. Pass `approve: true` on starts
   outside gamescope until `allowed()` has been called, and keep that.
   Call the monitor's `close()` as the app quits.
5. Change `COMMAND` if your Flatpak's command isn't electron-builder's
   `electron-wrapper`.

# Ultima III: Exodus, in the browser

**Play it:** <https://synthwave-pixel.github.io/ultima3/>

Background: I played Ultima III on both my Apple //c and my Nintendo, and
then Ultima V on my Apple //gs. Later I rediscovered the game via the
LairWare macOS port.

I am pleased to offer an updated version of the title with quite a few
changes:

1. Rebuilt in TypeScript. Runs in the browser, installs as an offline PWA,
   and ships as macOS, Windows, Linux and Android builds.
2. Still offers an experience very close to the original if you choose,
   building on the LairWare baseline with its full set of period tile
   sets: Apple II in color and mono, Commodore 64, NES, the PC's CGA,
   EGA, MCGA and VGA, the Ultima V look and the Macintosh black on
   white.
3. Includes an updated Standard experience: controller play, new art and
   sound, and tweakable settings.

The following were design principles for the updated Standard experience:

1. No changes to the core data files - it's Ultima III.
2. Changes are all made with the spirit and look of the original, with
   just enough updates to allow a new player to enjoy the game completely
   offline and have a great time.

The game starts in the new Controller mode, inspired by the NES version,
which most modern players will prefer. In Controller mode the whole game
is played using simple, in-game controls and menus.

This controller user experience works as well with a keyboard as with a
gamepad or a touch screen, and is far more accessible on a desktop than
typing letters. Menus put the common actions at the top, and a few
shortcuts (cast the right heal, open a chest safely, light a dungeon) make
combat and exploration more fun - it's still grindy, but now the grind is
*fun*. Everything is designed to look like it could have been in the
original, while still bringing a more modern UX design to the table.

The cloth map that came in the box can be viewed in the game, and a quest
journal gives just enough in-game hints that most players should be able
to finish the game without an external guide. There are options that ease
the difficulty a little. The party shares one inventory for unequipped
gear. And many, many other subtle improvements.

All of it is configurable in the game's Settings. If you want the original
gameplay, it is all still there: classic difficulty, keyboard commands,
the original skins. Not a single data file from the original LairWare
build has been touched.

Ultima III is by Richard Garriott and Origin Systems (1983). The Macintosh
port is by Leon McNeill of LairWare, whose original README is at the
bottom of this page.

## Playing

The game runs in any current browser. Chrome, Edge and Android offer to
install it from the address bar or the browser menu; on iOS use Share,
then Add to Home Screen. After the first visit it runs without a network.
Updates download in the background, and the title menu then offers
"Update: restart".

The game saves itself at every town, castle and dungeon door and at Quit,
in the browser's local storage, and resumes on the next visit. The title
menu's Export game copies the saved game as text to the clipboard or a
file, and Import game reads it back, which is how a game moves between
devices.

**Back up your saved game.** Browsers can clear a site's storage on their
own: Safari and every other iOS browser delete it after seven days without
a visit, and any browser may drop it under storage pressure, when site
data is cleared, or at the end of a private window. Play often, and export
the game now and then so a copy is on the clipboard or in a file. On iOS,
add the game to the Home Screen, which keeps its storage; in a browser tab
the game warns of this once a day. If a browser cannot keep a save at all,
copy and paste alone is enough to carry a game through.

### Desktop app, and the Steam Deck

The same game is packaged as a desktop app with Electron, for players who
want a plain window, an icon in the dock, or a Steam shortcut. Builds for
Windows, macOS and Linux are on the
[Releases page](https://github.com/synthwave-pixel/ultima3/releases). The
desktop app keeps its saved game in its own storage, separate from the
browser's; Export and Import move a game between them.

- **Windows**: an installer and a portable `.exe`. Both are unsigned, so
  SmartScreen asks once; choose More info, then Run anyway.
- **macOS**: an Apple Silicon `.dmg` (Intel Macs: use the web version).
  Unsigned as well, so the first launch is refused; right-click the app
  and choose Open, or run `xattr -cr "/Applications/Ultima III.app"` once.
- **Linux and SteamOS**: a Flatpak bundle and an `AppImage`. The Flatpak
  is the one for a Steam Deck. One line in Konsole, in Desktop Mode,
  fetches the newest release and installs it per user, which needs no
  password; run the same line again later to update.

      curl -fLo ~/Downloads/ultima3.flatpak "$(curl -fsSL https://api.github.com/repos/synthwave-pixel/ultima3/releases/latest | grep -o 'https://[^"]*linux-x86_64\.flatpak')" && flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo && flatpak install --user ~/Downloads/ultima3.flatpak

  It downloads the bundle from the Releases page, tells your user
  installation about Flathub, where the runtime comes from, and installs
  the file. Opening a downloaded bundle in Discover installs it
  system-wide instead, which asks for a password the deck account does not
  have. The game then appears in the application menu and in Steam's Add a
  Non-Steam Game list. Add it there, and in the shortcut's controller
  settings pick a Gamepad template. The app sees the controller as a
  gamepad and switches to controller mode on the first press, and starts
  full screen when Steam launches it. In Game Mode it also turns off GPU
  acceleration and the browser sandbox, which have hung other Electron
  apps under gamescope. The AppImage suits any other Linux: make it
  executable and run it.

### Android handhelds

For Android handhelds like the AYN Odin or the Retroid Pocket, and for
phones and tablets, the same workflow also builds an APK
(`Ultima-III-<version>-android.apk`), published in the same release as
the desktop installers. Copy it to the device and open it; Android asks
once to allow installs from that source. Or let
[Obtainium](https://github.com/ImranR98/Obtainium) install it and keep it
updated from the releases: tap the badge on the device, or add
`https://github.com/synthwave-pixel/ultima3` in Obtainium by hand.

<a href="https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.synthwavepixel.ultima3%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Fsynthwave-pixel%2Fultima3%22%2C%22author%22%3A%22synthwave-pixel%22%2C%22name%22%3A%22Ultima%20III%22%7D"><img src="mobile/badge_obtainium.png" alt="Get it on Obtainium" width="161"></a>

The app runs full screen in landscape, the Back button opens Settings as
Escape does, and built-in controls that Android reports as a gamepad
switch the game to controller mode on the first press. The APK is signed
with a key kept in the repository, so a new build installs over the old
one and keeps the saved game. iOS has no such build on purpose: install
the web version from Safari's Share menu with Add to Home Screen instead.

### Controller mode

The default; a gamepad button press also switches back to it from keyboard
mode. A tap on a touch screen shows a virtual controller, sized to an NES
pad on any screen. Holding a direction, on a gamepad or the virtual pad,
keeps walking as a held key does.

    D-pad   move, or move the cursor in a menu
    A       open the command menu; choose
    B       cancel, or pass a turn
    X       ztats
    Y       look; attack in combat; ignite a torch in dungeons

On a keyboard the stand-ins are WASD or the arrows for the d-pad, Enter or
Z for A, Escape, X or B for B, C for X, V or Y for Y.

### Keyboard mode

For the original feel, chosen in Settings (the last entry of the command
menu). The Apple II commands, one letter each:

    Arrows       walk; move in combat      Space   pass a turn
    Escape       settings                  J       journal
    #            view the cloth map

    A attack     B board      C cast      E enter     F fire
    G get chest  I ignite     L look      M modify    N negate
    O other      P peer gem   Q quit/save R ready     S steal
    T transact   U unlock     V volume    W wear      X exit craft
    Y yell       Z ztats

    Combat:   arrows move (into a monster attacks), A attack in a
              direction, C N R Z, Escape turns auto combat off
    Dungeons: up/down advance or retreat, left/right turn, I K D
              ignite, klimb, descend, L cycle the auto-map
    Shortcuts: ! cast the heal the party needs, @ safe chest, $ light

A "whom" prompt takes a member number, or Up and Down through the stats
boxes and Enter. The same controls are in the game under Settings > Help.

### Settings

Input mode, tile set, auto combat, poison kills, starvation, balanced XP,
the turn timer, Sound FX (Standard, Lairware or Off), music and Help.
Every setting is remembered by the browser. A new game asks "Choose Thine
Adventure!": Modern (recommended), Classic (hardcore, the Apple II's
rules) or Story (relaxed), each a preset of the difficulty settings that
can be changed afterwards.

## What changed

### Changes to all modes

These apply whatever tile set and sound set are chosen.

#### Controller mode

- The command menu lists what the surroundings call for first: Enter on a
  town, Board on a horse, Get on a chest, Attack beside a monster. Commands
  that make no sense where you stand are left out, and ones with nothing
  on hand (no gem, no torch, no caster alive) are grayed.
- In combat, a ranged weapon in hand puts "Attack (Bow)" first and a
  caster gets "Cast (spell)" with their last spell ready. Walking into a
  foe attacks it.
- Shortcuts cast at once, with no prompts, choosing the caster with the
  most mana: "Cast (Heal)" or "Cast (Great heal)" leads the menu when
  someone is hurt; "Cast (Safe chest)" sits under Get chest on a chest;
  "Cast (Long light)" or "Cast (Light)" sits under Ignite torch in a dark
  dungeon, the strongest light spell anyone can cast.
- Menus replace typed numbers on the title and party screens: the roster
  is a pick list, the party a list in marching order, attributes a screen
  where left and right spend the points, and a random name is offered.
  "Who?" prompts move a pair of arrows through the stats boxes.
- A virtual controller on touch screens, a gamepad through the Gamepad
  API, and an on-screen keyboard for names and words.

#### Journal, map and hints

- A quest journal, which the Apple II never had. It reveals the main line
  one step at a time: speak to the king, the Mark of Kings, lost Ambrosia,
  the four cards, exotic arms, the Marks of Fire and Force, the silver
  snake, the order of the cards, Exodus. Each entry shows its progress and
  every clue heard about it, kept as the townsperson, king, prayer or
  *redacted* spoke it, with the town's name. Up and Down move between
  entries, and H (Y on a controller) prints a hint written for this port.
  "Journal updated" prints when something real changes.
- View map shows the cloth map of Sosaria from the box, through a CRT
  effect. Every moongate the party has come out of is marked on it with the
  moon that opens it, so the gate table writes itself one trip at a time.
- A dungeon auto-map, the graph paper of old: cells seen by torchlight are
  recorded, shown as a small overlay or as the whole level in place of the
  first-person view, which turns the dungeon into a top-down crawl.

#### Party and inventory

- Gold and food are pooled for the whole party and shown on the top
  border. Members eat from the pool and go hungry together.
- Weapons and armor are pooled in one bag; a member's record keeps only
  what is readied and worn. Ready and Wear draw from the bag, so one sword
  cannot arm two members. Shops gray what the buyer's class cannot use and
  offer to ready or wear a purchase on the spot. Forming a party pools the
  bags; dispersing deals them out. The Hand command is gone.
- Gems, keys, powders and torches are the party's too, so Peer, Unlock,
  Negate time and Ignite never ask whose.
- Lord British's raise adds the hundred hit points as well as the room for
  them, and his prompt lists only the members due a level.

#### Difficulty and settings

- Poison kills, off by default: poison stops at one hit point so a member
  limps home; on, it kills as on the Apple II.
- Starvation: Classic (the Apple II's, to the death), Mild (stops at half
  hit points, the default) or None.
- Timer: Fast (the Apple II's turn timer), Slow, or Off, which makes the
  game turn-based through and through.
- Balanced XP, on by default: a kill's experience is shared among the
  living members instead of going all to the killer.
- Auto combat, LairWare's addition, kept, with a smarter planner: members
  path round comrades and walls to the nearest square they can strike
  from.

#### Sound

- Two sets of effects, chosen in Settings: Standard, new and described
  under the Standard changes below, and Lairware, the Macintosh port's
  sampled set with a per-effect gain table that evens out its levels. Off
  silences them.
- The same effect is not restarted within a few dozen milliseconds, a long
  one is not restarted while it sounds, and the music dips under a long
  effect.
- The title-screen menus answer each key with an effect from the chosen
  set: a footstep as the cursor moves, the attack for a choice, a swing on
  backing out.

#### Play

- Bumping into things does what you would have typed next: a townsperson
  is talked to, a counter opens the shop, a locked door asks for a key, a
  monster is attacked.
- Transact asks the direction first and "who" only when it matters.
- Spell menus name spells by what they do (Magic bolt, Heal, Up a level),
  with the book name, cost and effect beneath.
- Other and Yell are one command, and EVOCARE works from either.
- Repeated turns fold together: "North (x5)" instead of five lines.
- Fountains and the *redacted* speak when the party steps onto them, not
  on every turn spent standing there.
- Direction and "who" prompts sit on the map's border so the map and the
  combat marker stay in view. The active member in combat has a fading
  outline instead of a blink.
- A party wipe offers a choice: try again from the last save, or flee to
  Lord British as the Apple II did.
- The game pauses, music included, while the window is not focused.
- Cheats, on the Help pages: full restore, raise every level, go home,
  exit dungeon, gold, food, gems, keys and torches. None of it existed in
  the original; it is there for testing and for anyone who wants it.

#### Bug fixes

- Monsters far to the west of the party headed the long way round: the C
  port's heading test did not wrap as the Apple II's 8-bit arithmetic did.
- A new character could throw away their only dagger; now a dagger is
  thrown only when there is a spare.

#### Left out on purpose

LairWare's Mac additions that were not part of the game: the animated
intro and attract mode, auto-heal, the LairWare stats dialog, the Diorama
map and random map generator, text-to-speech, mouse control and the Mac
dialogs. The Apple II text flow is used instead. Diagonal movement for the
party, which the Mac allowed, is off: as on the Apple II, monsters may
move diagonally and the party may not. LairWare had some other updates
for things like portraits that are not included.

### Changes to the historic modes

Changes that make each of the older tile sets look more like its machine
than the Mac version did.

- Each set paints its own first-person dungeon: wireframe corridors for the
  Apple II, Commodore 64 and Macintosh sets, blue and cyan for CGA, flat
  bricks in each palette for the NES and the EGA, MCGA, VGA and Ultima V
  sets. The Mac drew one photographic dungeon whatever the tiles; that
  pairing is the Lairware set.
- Each set has its own frame and cursor in its own palette; the five PC
  sets had borrowed the Mac's. Moon phases are shown as pictures in every
  set, flat pixel moons for the sets whose machines had them.
- The four full-window scenes and the title logo are drawn per set, in
  its style and palette; the Lairware set keeps the 3D renders.
- Exodus' lights run in every set. The Mac's cycling panels were kept
  in spare cells and copied about; the port draws them where they sit.
- Creature transparency is read from the sheet's own alpha; the Mac's
  separate mask files are honored where a set ships one, and a set with
  neither draws creatures opaque, as its machine did.

### Standard-specific changes

Standard is the port's own theme. It is meant to evoke the memory of a
classic PC VGA look, with a modern sensibility about color and design:
how you vaguely remember the game through nostalgia glasses, rather than
how any specific machine drew it. As I mentioned earlier - I played on the
Apple //c and the NES, and this is a fusion incorporating both the best of
those builds and a modern developer sensibility.

#### The look

- Every figure is new flat pixel art: the eleven character classes, the
  townspeople, the eight monsters and their sixteen variants, the Exodus
  machine's four light states, the horse, the ships, the whirlpool, chest,
  moongate and shrine. The figures are drawn at 32 pixels on Apple II
  silhouettes, three tones per material, and doubled into the sheet, so
  they read as one family from the party grid to the combat arena.
- Each class has its own figure. Paladins, barbarians, druids, larks,
  illusionists, alchemists and rangers no longer borrow the fighter,
  cleric, wizard or jester. The party on the overworld is drawn as its
  members at half size in a 2x2 grid; in towns and castles the leader
  walks at full size with the others in a line behind, as on the NES.
- Every figure and object carries a one-pixel rim of half-black, so it
  stands out against water, stone and lava; over the near-black grass it is
  invisible. It is a build step, not part of the art. This is an
  example of a tiny cheat for readability - most players won't notice
  unless they are pixel-peeping, but it does help make game objects
  easier to read.
- The magic and fire balls of combat are flat orbs with the Apple II's
  diamond core, and a hit is a three-frame red burst rather than a HIT
  tile. The forcefield is bands of violet and blue that scroll without a
  seam.
- The frame, caps and cursor are recolored from LairWare's teal to a
  darker copper that recedes behind the map. Moon phases are flat pixel
  moons. The fountain, mark rod, shrine and *redacted*
  scenes and the title logo are drawn in the theme's own style.
- The first-person dungeon is flat bricks in the VGA palette, painted at
  run time and cut by the theme's own mask sheet, so the corridors match
  the tiles.
- Character boxes color the name by state (green poisoned, gray dead,
  dark gray ashes, blue when Lord British would raise the member), the
  whole box taking that gray for the dead, and hit points go yellow under
  a quarter and red under a tenth. The color stands in for the status
  letter the other sets print after the name.
- Casting a spell gives one white pulse at half strength instead of the
  original's two full inversions of the view: over the caster's square
  for a bolt or a self-directed spell, over the recipient's for a heal,
  and over the whole view for spells that change all of it, the light
  spells included. The other tile sets keep the original flash.
- Seams in the scrolling water, lava and moongate tiles and the fringe
  around creatures are repaired in the Standard sheet, and the Ranger has
  a second animation frame, so he no longer stands still.

#### The sound

- The Standard effects are new: chip-tune voices (pulse, triangle and
  noise, as the consoles of the day had) in the spirit of the originals,
  balanced so that what repeats every turn, a footstep or a bump, sits
  well below the one-off jingles, and the combat fanfares are short. The
  repeated effects (steps, bumps, hits, misses, the error blip) are shaped
  the way a game's most-played footstep is: energy kept low, no hiss, over
  within a few dozen milliseconds, and each play detuned a little so no
  two are alike. One swing sound, varied at play time, stands in for the
  Mac's four.

## For developers

*The new version lives in the `web` directory. The sources, resources and
Xcode project at the root are the old LairWare build, kept for reference.*

The port is in [`web/`](web/README.md): how to run it, how the code is
organized, data formats and testing. The desktop app is in
[`desktop/`](desktop/), a thin Electron shell around the built game, with
its own notes in the developer README, and the Android app in
[`mobile/`](mobile/README.md), the same game wrapped with Capacitor.

The art briefs the new figures and dungeon sheets were drawn to are in
[`web/docs/`](web/docs/). The original Macintosh sources and resources are
at the root of the repository, unchanged.

Inside the app, F11 or Alt+Enter toggles full screen, `--fullscreen` and
`--windowed` on the command line force one or the other, and `--new` and
`--controller` do what the web version's `?new` and `?controller` flags do.

## License

The code is under the MIT License (see LICENSE), as LairWare released it.
The game's name, maps, music and other assets are Origin Systems' and are
included as Leon McNeill describes below.

---

Below is the original LairWare README, including the License information.

# LairWare's Ultima III

This started out as an unofficial fan remake of the original 1983 Apple II game from Origin Systems. Origin had made official Mac ports of a few older Ultima games, but these were all monochrome. My remake was originally implemented in Think C for 1990s-era color Macintosh computers on Motorola processors running Mac OS 7. I really liked how it was turning out, so I managed to get ahold of Richard Garriott over AOL and he liked it enough to give me permission to release it officially sometime in 1994 or 1995.

Some of the logic was originally gleaned through examining the Apple II version's 6502 assembly code. You can find comments throughout the source referring to memory locations in this version! There were no such things as "shrinkwrap" licenses back then which would forbid such reverse engineering.

In my spare time over the following 10+ years I would poke and prod at it to keep it running on current systems of the time; making it capable of running on Mac OS X without the need for Classic, compiling it for Intel processors to eliminate the need for Rosetta, adding support for alternate graphics, etc. I had transitioned the project to CodeWarrior early on, then to Xcode when that came out. By the time macOS Catalina was released with its removal of support for 32-bit executables, I had only barely touched this project for many many years.

For upload, I've mostly removed license key handling and update checking. I haven't checked if it still compiles! I keep telling myself that this isn't intended to be useful to anyone, it's just some code archaeology.

_Random fun fact: Ultima III was one of the first games to acknowledge non-binary gender!_

## License

Usage is provided under the [MIT License](http://opensource.org/licenses/mit-license.php). See LICENSE for the full details.

However, certain non-code assets (such as the project name, music, maps, etc) were not originally created by me. These assets are included under the assumption that copyright will no longer be actively enforced due to their age (40+ years). If you are a rights-holder and have concerns, please contact me.

To put it another way: I'm not claiming any copyright on the Ultima franchise name, NPC names, the specific maps found in this game, etc. This license just refers to everything else here. I'm presenting it merely as historical code in good faith, in hope that no one will care to litigate -- there is indeed no feasible way I am aware of to build this project to run on a modern system without an emulator.

Leon McNeill AKA "Beastie"

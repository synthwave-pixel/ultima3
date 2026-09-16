# Scene pictures per tile set

Each tile set ships five pictures of its own: four full-window scenes
and the Exodus logo on the title screen. The logo is `<Set>-Exodus.png`,
**944 by 268 pixels** on an opaque black ground, drawn at that size on
the title screen (29.5 by 8.375 cells at the canvas's 32-pixel cell), so
draw it at exactly that size; it changes as the tile set is changed in
Settings. The Lairware set has no logo file of its own: it shows the
original LairWare logo from `public/images/Exodus.png`, which any set
without a logo falls back to. The rest of this note is about the four
scenes.

The game shows four full-window pictures at fixed moments:

| File name | Shown when                                              |
| --------- | ------------------------------------------------------- |
| Fountain  | the party steps onto a fountain in a dungeon            |
| Rod       | the party steps onto a mark rod in a dungeon            |
| Shrine    | the party stands at a shrine in Ambrosia                |
| TimeLord  | the party reaches the Time Lord, level 8 of Time Awaits |

Every tile set ships its own four, drawn in its style; the Lairware set
has LairWare's 3D renders from the Mac. This note is the spec they were
drawn to, for anyone redrawing them.

## Where the files go

Put a set's pictures beside its tile sheets in `public/graphics`, named
`<Set>-<Scene>.png`, for example `Nintendo-Fountain.png` or
`PC CGA-TimeLord.png`. The set name is as the Settings menu lists it,
with one exception: "&" is dropped from file names, since it cannot
travel in a URL, so the Macintosh set's files are `Macintosh BW-...`.
PNG is preferred; JPEG and GIF also load.

A scene a set lacks shows as a black window, so give a set all four.
(The loader also accepts a shared picture in `public/images` as a
fallback, but none ships.)

## How the game draws them

- The picture fills the map window: 22 by 22 cells on a 1280 by 768
  canvas, so **704 by 704 pixels**, square.
- Whatever size you supply is stretched to 704 with nearest-neighbour
  scaling, no smoothing, and the browser then scales the canvas to the
  window with pixelated rendering. So draw at 704, or at an integer
  fraction of it: 352 scales by 2, 176 by 4, with every pixel a crisp
  square. A size that does not divide 704 gets uneven pixels.
- There is no transparency to worry about: the window is black behind
  the picture. Any part you leave black merges with the border.
- The picture sits inside the game frame; nothing is drawn over it. The
  message area to the right stays live ("Who will drink?").

## Per tile set

Tile size is the set's own sprite size. Native size is that times 11,
the map window's width in tiles, and gives crisp pixels at 704.

| Set               | Tile | Native picture | Scale to 704 | Colours in the set's sheet                 |
| ----------------- | ---- | -------------- | ------------ | ------------------------------------------ |
| Standard          | 64   | 704            | 1            | full colour                                |
| Lairware          | 64   | 704            | 1            | full colour (the current renders fit here) |
| PC VGA            | 32   | 352            | 2            | 8 flat colours                             |
| PC MCGA           | 32   | 352            | 2            | about 340, VGA 256-colour art              |
| PC Ultima V       | 32   | 352            | 2            | about 110                                  |
| Nintendo          | 32   | 352            | 2            | 48 from the NES palette                    |
| Apple II Color    | 48   | 528            | 1.33         | Apple hi-res six, anti-aliased             |
| Apple II Color TV | 48   | 528            | 1.33         | the same through composite blur            |
| Apple II Mono     | 32   | 352            | 2            | 31 greens, phosphor glow                   |
| Macintosh B&W     | 24   | 264            | 2.67         | black and white only                       |
| PC EGA            | 16   | 176            | 4            | 16 EGA colours                             |
| PC CGA            | 16   | 176            | 4            | 4                                          |
| Commodore 64      | 16   | 176            | 4            | 9 of the C64's 16                          |

For the Apple II colour sets and the Macintosh set the native size does
not divide 704. Their tiles already scale unevenly in play, so either
draw at the native size and accept the same look, or draw at 704 (or
352 for the Mac) with pixels the size the tiles come out at on screen.

## Palettes

Measured from the tile sheets as shipped. Where a machine's palette is
larger than what the sheet uses, any colour from the machine is fair.

- **PC CGA**: `#000000 #ffffff #a800a8 #00a8a8`. Black, white, magenta,
  cyan: CGA palette 1, high intensity. Nothing else.
- **PC EGA**: the standard EGA sixteen. The sheet uses black, white
  `#fcfcfc`, grey `#b0b0b0`, orange `#fc9000`, green `#00b000`, red
  `#fc0000`, yellow `#fcfc00`, blues `#0070fc` and `#0000fc`, cyan
  `#00fcfc`, magenta `#fc00fc`.
- **PC VGA**: `#000000 #ffffff #0000ff #00ff00 #00ffff #ff0000 #ffff00
#ff00ff`. Eight pure colours only; the MCGA sheet is the richer one.
- **PC MCGA** and **PC Ultima V**: VGA 256-colour art. Greys `#c0c0c0
#808080 #404040`, browns such as `#a05000`. Any 256 colours; keep
  gradients to eight steps or fewer to look of the period.
- **Commodore 64**: from the C64 sixteen. The sheet uses black, white,
  `#8b1f00` brown-red, `#4fb317` green, `#1b0a93` blue, `#a34700`
  orange, `#65cda8` light green, `#f3eb5b` yellow, `#002200`.
- **Nintendo**: the NES master palette, 48 used. Dominant: white,
  `#6b0000` dark red, black, `#ff8473` salmon, `#b5197c` magenta,
  `#b53221` red. The NES limit of three colours plus black per 16 by 16
  block is optional; nothing enforces it.
- **Apple II Color**: the hi-res six: black, white, green, violet,
  orange, blue. The sheet has black, white, `#15cffd` light blue,
  `#11a6ca` blue, `#ff6a3c` orange and the rest anti-aliased. Six flat
  colours look right.
- **Apple II Color TV**: reuse the Apple II Color picture unchanged; the
  set is the same art blurred as a composite TV showed it.
- **Apple II Mono**: green on black. `#8cf88c` full brightness, `#467c46
#408540 #204320` for glow. Two greens and black is enough.
- **Macintosh B&W**: pure one-bit, `#000000` and `#ffffff`. Dither for
  tone.
- **Standard** and **Lairware**: unrestricted.

## Reuse

Six or seven pieces of art per scene cover all thirteen sets:

- One 352 picture in the MCGA palette serves PC VGA, PC MCGA and PC
  Ultima V.
- One 176 picture in EGA colours serves PC EGA; reduce its colours to
  four for CGA and to the C64 nine for the Commodore. The three share a
  size.
- Apple II Color and Color TV share one file. Apple II Mono can be a
  green recolour of it at 352.
- Nintendo and Macintosh B&W each want their own.
- Standard gets its own painted set; Lairware keeps the renders.

Copy a finished file under each set name it serves; the loader looks
for the set's own name only.

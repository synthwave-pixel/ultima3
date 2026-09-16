# Dungeon art sheets

The first-person dungeon view is drawn from two images that belong to a
tile set, next to its Tiles, Font and UI files in `public/graphics`:

- `<Set>-DungeonShapes.png` (or `.jpg`): a 3000x512 sheet of wall pieces
  and corridor background.
- `<Set>-DungeonMasks.png`: a 1200x512 mask for the angled side walls in
  the first two panels. Black is opaque, white transparent, grey partial.

Only Lairware ships a sheet file: the Mac's photographic dungeon, paired
with the Mac tiles. Every other set's sheet (Standard included, which
takes the PC VGA style) is painted at run time by `src/ui/dungeonArt.ts`
from a small style record (wireframe or brick, a palette, a door
treatment) into this same layout, so nothing is downloaded and the
renderer (`src/ui/dungeonView.ts`, a port of the drawing half of
`UltimaDngn.c`) needs no changes. A sheet file placed in `public/graphics`
for a set overrides its painted one. The mask is shared: it lives as
`Standard-DungeonMasks.png`, which every set falls back to. This document
describes the layout both the painter and a hand-made sheet must follow.

`dungeon-sheet-guide.png` shows the layout over the Lairware sheet at
half opacity: red boxes are masked side-wall pieces, blue are facing-wall
pieces, yellow the chest and ladder art. It is generated from the
renderer's tables by `sheetRegions()`.

## The five panels

The sheet is five 600-pixel panels. The view is 600x512, so a panel is
one screen.

| Panel | Sheet x    | Holds                                                                                                                                       |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | 0..599     | Side walls on the left, seen at an angle, for the adjacent cell (1), one cell ahead (7, 17, 29, 30 ...) and deeper. Cut by the mask.        |
| B     | 600..1199  | Side walls on the right (6, 9, 15, 16, 19, 20, 28, 31 ...), cut by the mask, plus the chest and the two ladder textures at the bottom left. |
| C     | 1200..1799 | The facing wall filling the whole view (position 0: a wall directly ahead).                                                                 |
| D     | 1800..2399 | The empty corridor: ceiling, floor and the dark far end. Drawn first, everything else lands on top.                                         |
| E     | 2400..2999 | Facing walls one, two and three cells away, in three bands (y 0..255, 260..387, 392..455) cut into left, centre and right pieces.           |

Doors are not in the sheet: the renderer fills a black trapezoid over
the wall piece. The chest (150x64) is drawn whole or as a left or right
half. The ladder is built from the rung (4x8) and rail (8x96) textures,
stretched.

## Every rectangle the renderer reads

Source rectangles in sheet pixels, and where each lands in the 600x512
view. Positions follow the original's numbering of the 32 visible cells.

| Piece               | x    | y   | w   | h   | Lands at   | Masked |
| ------------------- | ---- | --- | --- | --- | ---------- | ------ |
| wall 0              | 1200 | 0   | 600 | 512 | (0, 0)     |        |
| wall 1              | 0    | 0   | 150 | 512 | (0, 0)     | yes    |
| wall 2              | 450  | 0   | 150 | 512 | (450, 0)   | yes    |
| wall 3              | 2400 | 0   | 150 | 256 | (0, 128)   |        |
| wall 4              | 2550 | 0   | 300 | 256 | (150, 128) |        |
| wall 5              | 2850 | 0   | 150 | 256 | (450, 128) |        |
| wall 6              | 600  | 0   | 150 | 256 | (0, 128)   | yes    |
| wall 7              | 150  | 130 | 76  | 252 | (150, 130) | yes    |
| wall 8              | 374  | 130 | 76  | 252 | (374, 130) | yes    |
| wall 9              | 1050 | 0   | 150 | 256 | (450, 128) | yes    |
| wall 10             | 2400 | 260 | 150 | 128 | (0, 192)   |        |
| wall 11             | 2550 | 260 | 76  | 128 | (150, 192) |        |
| wall 12             | 2626 | 260 | 148 | 128 | (226, 192) |        |
| wall 13             | 2774 | 260 | 76  | 128 | (374, 192) |        |
| wall 14             | 2850 | 260 | 150 | 128 | (450, 192) |        |
| wall 15             | 600  | 260 | 148 | 128 | (0, 192)   | yes    |
| wall 16             | 750  | 64  | 74  | 128 | (150, 192) | yes    |
| wall 17             | 226  | 194 | 34  | 124 | (226, 194) | yes    |
| wall 18             | 340  | 194 | 34  | 124 | (340, 194) | yes    |
| wall 19             | 976  | 64  | 74  | 128 | (376, 192) | yes    |
| wall 20             | 1052 | 260 | 148 | 128 | (452, 192) | yes    |
| wall 21             | 2400 | 392 | 150 | 64  | (0, 224)   |        |
| wall 22             | 2550 | 392 | 74  | 64  | (150, 224) |        |
| wall 23             | 2624 | 392 | 36  | 64  | (224, 224) |        |
| wall 24             | 2660 | 392 | 80  | 64  | (260, 224) |        |
| wall 25             | 2740 | 392 | 36  | 64  | (340, 224) |        |
| wall 26             | 2776 | 392 | 74  | 64  | (376, 224) |        |
| wall 27             | 2850 | 392 | 150 | 64  | (450, 224) |        |
| wall 28             | 824  | 96  | 40  | 64  | (224, 224) | yes    |
| wall 29             | 260  | 224 | 36  | 64  | (260, 224) | yes    |
| wall 30             | 304  | 224 | 36  | 64  | (304, 224) | yes    |
| wall 31             | 936  | 96  | 40  | 64  | (336, 224) | yes    |
| chest               | 600  | 416 | 150 | 64  | stretched  |        |
| ladder rung         | 750  | 416 | 4   | 8   | stretched  |        |
| ladder rail         | 754  | 416 | 8   | 96  | stretched  |        |
| corridor background | 1800 | 0   | 600 | 512 | (0, 0)     |        |

## Making a sheet for a set

1. Start from `dungeon-sheet-guide.png` so the pieces line up.
2. Keep the perspective: pieces in A and B are the _same_ wall surface
   seen at an angle, so a brick course should run toward the vanishing
   point at the sheet's centre line (y 256), as the Lairware art does.
3. Draw the corridor background in D as a complete empty corridor. Panels
   C and E are flat facing walls; E's bands are the same wall smaller.
4. Reuse `Standard-DungeonMasks.png` unless the side-wall silhouettes
   change; the mask only trims the angled pieces.
5. Save as `<Set>-DungeonShapes.png` (lossless is better for pixel art)
   and, if changed, `<Set>-DungeonMasks.png`. Set names match the Tiles
   file: `Apple II Color`, `Nintendo`, `PC EGA` and so on.
6. Light: the renderer darkens the view by 57% when the torch is nearly
   out, so keep the art bright enough to survive that.

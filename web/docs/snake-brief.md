# Snake: one 32 x 64 figure across two tiles

Status: delivered and integrated; kept as the record of the correction.

A correction to `figure-art-spec.md`. The first pass drew tiles 58 and 59 as
two separate snakes. They are the two halves of one tall snake, and the
delivered pair could not be used. Redraw it as one figure.

## Where it appears

One snake in the whole game, on the Sosaria overworld at (11,57) and
(11,58): the Great Serpent that blocks the pass to the Silver Snake's lands
until a party member with the Mark of the Snake casts EVOCARE beside it. Tile
58 is the north cell, tile 59 the south cell. The party stands directly south
of it, so the head faces south, toward the player. See `snake-reference.png`:
every original set draws it this way, tail in the north cell and head with
tongue at the bottom of the south cell.

## Format

| Item         | Rule                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image        | One PNG, 32 wide x 64 tall, RGBA. Rows 0-31 become tile 58, rows 32-63 become tile 59. Deliver also the two 32 x 32 halves as `snake-58-0.png` and `snake-59-0.png`, cut from that image with no changes                          |
| Frames       | One. Neither cell animates. The row's second frame cell is filled with the same art by the integrator                                                                                                                             |
| Transparency | Alpha 0 or 255 only, as the rest of the set                                                                                                                                                                                       |
| Grid         | Silhouette on the 2 px grid, single pixels only for the eyes and tongue                                                                                                                                                           |
| Continuity   | The body must cross row 31/32 without a break: the columns it occupies on row 31 are the columns it occupies on row 32, in the same tones                                                                                         |
| Footprint    | Body may use the full 32 px width. The head touches or nearly touches row 63 (the bottom of the south cell). The tail may start as high as row 0                                                                                  |
| Colours      | Snake green, from the palette: light `#7dd659`, base `#2e8b3a`, shade `#15471c`. Eyes: white `#fefefe` with `#141416` pupil, or gold `#d9b65a`. Tongue: `#ae4551` red, 2 px wide, 4 to 6 px long, forked if it reads at that size |

## Drawing

- Pose: an S or double S seen from above, tail at the top, head at the
  bottom, the head widened to 10 to 14 px and facing straight down.
- Body width 8 to 10 px through the coils, tapering to 2 to 4 px at the tail.
- Three tones: light along the spine or the outer edge of each curve, base
  for the body, shade on the inner edge of each curve and under the head.
- Optional: a row of light-tone belly scales down the middle, as the current
  Standard art has, if it survives the 2 px grid.
- No ground, no shadow, no outline.

## Checks before delivery

- [ ] 32 x 64, hard alpha, colours from the list only
- [ ] Rows 31 and 32 match column for column
- [ ] Stacked, it reads as one snake at 32 x 64 and at 16 x 32 (half size)
- [ ] The head is at the bottom, facing down, tongue out
- [ ] `snake-58-0.png` is rows 0-31 and `snake-59-0.png` rows 32-63, unchanged

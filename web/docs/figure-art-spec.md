# Figure art spec: flat 32 px creatures, people and objects

Brief for the artist. The eleven class figures in `figure-style-reference.png`
set the style. This spec lists everything else that shares the screen with them
and must be redrawn the same way, with the rules the game engine imposes.

## 0. Status

Delivered and integrated (`art/figures/`, `npm run figures`). One correction
to this brief came out of the first delivery: tiles 58 and 59 are the north
and south halves of one tall snake drawn on the map, not two animation
frames. The redraw was briefed in `snake-brief.md` and is in the sheet. Pincher, Snatch
and Griffon were redrawn in a second pass (`second-pass-brief.md`) and are in
the sheet.

## 1. Why

The class figures are 32 x 32, flat, three tones per material, on Apple II
silhouettes. The rest of the Standard set is painted 64 px art with soft
anti-aliased edges (225 alpha levels, about 1,000 to 4,000 colours per tile).
Side by side, the two styles do not read as one game. The fix is to redraw
every figure-scale tile in the new style. Terrain is a separate decision (see
section 7).

The same 32 px art serves three sets: PC VGA and PC MCGA use it as drawn, and
the Standard set uses it doubled with nearest-neighbour scaling (4 screen
pixels per Apple pixel). Draw once.

## 2. Format

| Item         | Rule                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cell         | 32 x 32 px, PNG, RGBA                                                                                                                                                                                            |
| Transparency | Alpha 0 or 255 only. No soft edges, no shadows on the ground                                                                                                                                                     |
| Outlines     | None. Edges are the darkest tone of the local material against transparency                                                                                                                                      |
| Grid         | Silhouette on a 2 px grid (each Apple II pixel is a 2 x 2 block). Interior detail may use single pixels where a 2 px stroke is too coarse, as the class figures do (about 75% of their blocks are 2 x 2 uniform) |
| Baseline     | Feet or base on row 31 (the bottom row). Every figure stands on the same line                                                                                                                                    |
| Footprint    | Humanoids: x 1 to 30, top of head at row 4 to 7. Flyers and beasts may fill rows 0 to 31                                                                                                                         |
| Tones        | Three per material: light, base, shade. The three must differ in luminance, not only hue (the game recolours poisoned figures to green using luminance)                                                          |
| Colours      | From section 5 only. Add a colour only when a creature needs a material the list lacks, and note it                                                                                                              |
| Frames       | Two per tile unless section 6 says one. Frame 1 rest, frame 2 action. Same footprint and baseline in both                                                                                                        |
| Timing       | 350 ms per frame, as the class set                                                                                                                                                                               |

## 3. Delivery

Deliver as the class set was delivered:

- `atlas.png`: 2 columns (frame 1, frame 2) x N rows, in the order of the
  tables in section 6, 32 px cells, no padding.
- `atlas.json`: rows named with the tile index and name from section 6.
- One PNG per frame: `<name>-0.png`, `<name>-1.png`.
- `palette.json`: every colour used, named.

Do not try to place tiles in the game's sheet layout. Integration into
`Standard-Tiles.png`, `PC VGA-Tiles.png` and `PC MCGA-Tiles.png` is done by
script from the atlas.

## 4. Engine constraints

- Figures draw over any terrain: grass, water, stone floor, lava, and the
  black void of dungeons. Test each figure on black and on mid green.
- Monsters and townspeople draw at the same size as the party figures, in the
  combat arena and on the map.
- The party figures also draw at quarter size (four members in one map cell),
  so silhouettes must survive a 2x reduction. The same holds for any figure
  drawn on the map.
- Ships carry the party. Draw no crew: the ship alone is the party's marker.
  The horse likewise has no rider.
- Exodus is not a figure. It is four panel states drawn in sequence (3, 2, 1, 0) as its lights cycle. See section 6, tile 31.
- Snake is one tall figure drawn as two stacked tiles: 59 on top, 58 below,
  one frame each. Draw it as a 32 x 64 image and split it.

## 5. Palette

Class set colours, from its `palette.json`. Use these first.

| Material      | Light     | Base      | Shade     |
| ------------- | --------- | --------- | --------- |
| Skin          | `#f3cec2` | `#dcafa6` | `#ad7975` |
| Leather, hair | `#cc9141` | `#a46117` | `#663e19` |
| Steel         | `#e2e9ee` | `#aab8c7` | `#627389` |
| Cleric blue   | `#d4e6ff` | `#a6c4f4` | `#637fae` |
| Wizard indigo | `#a4afff` | `#6675fd` | `#3c479a` |
| Teal          | `#78b7b7` | `#478d92` | `#2b565f` |
| Olive         | `#bcc65b` | `#879337` | `#515d28` |
| Red           | `#e77b81` | `#ae4551` | `#713440` |
| Gold          |           | `#d9b65a` |           |
| Bomb grey     |           | `#444759` |           |

Extension colours for the creatures, taken from the painted Standard tiles so
the new set keeps the same reading of each monster.

| Material         | Light     | Base      | Shade     | Used by                                     |
| ---------------- | --------- | --------- | --------- | ------------------------------------------- |
| Bone             | `#f2f2f1` | `#d8d8d7` | `#a9a7a7` | Skeleton, Ghoul, Horse, sails, Griffon body |
| Orc green        | `#7dd659` | `#45a81a` | `#319212` | Orc                                         |
| Troll green      | `#47912d` | `#31771a` | `#2d6115` | Troll                                       |
| Snake green      | `#7dd659` | `#2e8b3a` | `#15471c` | Snake                                       |
| Wyvern olive     | `#a4b84a` | `#788b31` | `#637419` | Wyvern                                      |
| Daemon red-brown | `#dd8d77` | `#c25f46` | `#a73119` | Daemon                                      |
| Dragon red       | `#ef0504` | `#c00202` | `#920201` | Dragon                                      |
| Coral            | `#fdaaa2` | `#f7635c` | `#f34c45` | Gargoyle                                    |
| Flesh pink       | `#f3dbd4` | `#d6958a` | `#be7d73` | Balron, Devil                               |
| Tan              | `#fdd7a9` | `#f5c18f` | `#dca576` | Giant, Titan                                |
| Titan orange     |           | `#f47a04` |           | Titan accent                                |
| Goblin tan       | `#d29260` | `#be7a49` | `#a56132` | Goblin                                      |
| Lilac            | `#f5edfd` | `#d7c0f9` | `#c2a9f3` | Pincher                                     |
| Brain pink       | `#eabfbe` | `#d29290` | `#ac605d` | Bradle                                      |
| Orcus pink       | `#fdd4f8` | `#fdc1f2` | `#f194d4` | Orcus                                       |
| Stone grey       | `#d7dee8` | `#bfc6d2` | `#a7aeba` | Golem                                       |
| Slate            | `#7c7c8a` | `#5c5b65` | `#44434c` | Snatch                                      |
| Blue-grey        | `#71788e` | `#5d6377` | `#494d5d` | Cutpurse                                    |
| Sea grey         | `#718c94` | `#5b757c` | `#475c61` | Brigand                                     |
| Olive gold       | `#dbd291` | `#baac61` | `#8c7b30` | Mane                                        |
| Zombie ochre     | `#d4bc79` | `#bfa560` | `#a98d4a` | Zombie                                      |
| Guard blue       | `#a3c3f1` | `#7497d4` | `#5e78a8` | Guard                                       |
| Royal violet     | `#bc90fd` | `#a778f5` | `#9160f3` | Lord British                                |
| Sky blue         |           | `#2e92f6` |           | Jester motley (with Red)                    |
| Wood             | `#a7622d` | `#8d491d` | `#622d13` | Chest, hulls                                |
| Water blue       | `#028ff7` | `#0176f1` | `#0043c3` | Whirlpool, Man-O-War                        |
| Moongate blue    | `#0629d9` | `#0106a7` |           | Moon Gate                                   |
| Magic cyan       | `#02effd` | `#017ff3` | `#0265bb` | Magic ball                                  |
| Fire red         | `#fd1804` | `#fd0301` | `#a70101` | Fire ball                                   |
| Near black       |           | `#141416` |           | Pirate sails, eyes                          |
| White            |           | `#fefefe` |           | Shrine, highlights                          |

## 6. Inventory

Reference strips: `figure-ref-monsters.png`, `figure-ref-people.png`,
`figure-ref-objects.png`. Each row shows the tile in Apple II Mono, Apple II
Color, PC VGA and the current Standard set, both frames. Start from the Apple
II silhouette, as the class figures did. Use the Standard column for colour
and identity, the VGA column for pose ideas.

The tile index is the game's; keep it in the atlas row name.

### 6.1 Monsters

The eight base monsters and their sixteen variants. In the original Apple II
game a variant reused its base's shape in a different colour. Here each variant
gets its own drawing, but it must keep the base's silhouette family so a
player reads Ghoul as a Skeleton kind, Titan as a Giant kind, and so on.

| Index | Name         | Family   | Description and frame 2 action                                                                                                                     |
| ----- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24    | Orc          | Orc      | Green humanoid, leather harness, club or scimitar. Frame 2 raises the weapon                                                                       |
| 25    | Skeleton     | Skeleton | Bone figure, sword. Frame 2 swings                                                                                                                 |
| 26    | Giant        | Giant    | Broad tan humanoid, loincloth, axe. Frame 2 lifts the axe                                                                                          |
| 27    | Daemon       | Daemon   | Winged red-brown devil, horns. Frame 2 spreads wings                                                                                               |
| 28    | Pincher      | Pincher  | Lilac blob with two claws and eyes. Frame 2 opens claws                                                                                            |
| 29    | Dragon       | Dragon   | Red dragon in profile, wings up. Frame 2 wings down                                                                                                |
| 30    | Balron       | Balron   | Large winged flesh-pink demon, whip. Frame 2 raises whip                                                                                           |
| 58    | Snake bottom | Snake    | Lower half of a tall snake: coils and tail. One frame; stacks under 59                                                                             |
| 59    | Snake top    | Snake    | Upper half: head with tongue, facing down. One frame; stacks over 58                                                                               |
| 80    | Brigand      | Thief    | Sea-grey hooded figure, cutlass. Frame 2 lunges                                                                                                    |
| 81    | Cutpurse     | Thief    | Blue-grey masked figure, dagger. Frame 2 lunges                                                                                                    |
| 82    | Goblin       | Orc      | Small goblin-tan humanoid, horned helm. Frame 2 raises weapon                                                                                      |
| 83    | Troll        | Orc      | Troll-green hulk, big hands. Frame 2 raises arms                                                                                                   |
| 84    | Ghoul        | Skeleton | Bone figure with flesh-pink remnants. Frame 2 reaches                                                                                              |
| 85    | Zombie       | Skeleton | Ochre bandaged figure, arms out. Frame 2 lurches                                                                                                   |
| 86    | Golem        | Giant    | Stone-grey giant, blocky. Frame 2 raises fist                                                                                                      |
| 87    | Titan        | Giant    | Tan giant with orange hair or belt, sword. Frame 2 swings                                                                                          |
| 88    | Gargoyle     | Daemon   | Coral winged stone devil. Frame 2 spreads wings                                                                                                    |
| 89    | Mane         | Daemon   | Olive-gold hunched fiend. Frame 2 rears                                                                                                            |
| 90    | Snatch       | Pincher  | Slate-grey clawed blob, red eyes. Frame 2 opens claws                                                                                              |
| 91    | Bradle       | Pincher  | Brain-pink lobed blob. Frame 2 pulses (lobes shift)                                                                                                |
| 92    | Griffon      | Dragon   | Bone-and-gold winged lion. Frame 2 wings down                                                                                                      |
| 93    | Wyvern       | Dragon   | Olive two-legged dragon, barbed tail. Frame 2 wings down                                                                                           |
| 94    | Orcus        | Balron   | Orcus-pink winged demon. Frame 2 raises arm                                                                                                        |
| 95    | Devil        | Balron   | Flesh-pink devil with trident. Frame 2 raises trident                                                                                              |
| 31    | Exodus       | Machine  | Four panel states, not two frames: a machine face with lights. State 3 all lights on, then 2, 1, 0 fewer each. Deliver four 32 px cells in the row |

### 6.2 People

| Index | Name          | Description and frame 2 action                                                    |
| ----- | ------------- | --------------------------------------------------------------------------------- |
| 16    | Merchant      | Olive tunic, purse. Frame 2 shifts weight                                         |
| 17    | Jester        | Red and sky-blue motley, cap with bells, arms wide. Frame 2 legs crossed, arms up |
| 18    | Guard         | Guard-blue tabard, steel helm, halberd. Frame 2 lowers halberd                    |
| 19    | Lord British  | Royal violet robe, gold crown, sceptre. Frame 2 raises sceptre                    |
| 20    | Fighter (old) | Retire. Replaced by the class figures                                             |
| 21    | Cleric (old)  | Retire                                                                            |
| 22    | Wizard (old)  | Retire                                                                            |
| 23    | Thief (old)   | Retire                                                                            |
| 63    | Ranger (old)  | Retire                                                                            |

The five old party tiles go blank once the class figures are in place. They
are only listed so nobody redraws them.

### 6.3 Vehicles and objects

| Index | Name        | Frames | Description and frame 2 action                                                                          |
| ----- | ----------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 10    | Horse       | 2      | White horse in profile, no rider. Frame 2 legs mid stride                                               |
| 11    | Frigate     | 2      | Wood hull, white sails, red pennant. Frame 2 pennant flips                                              |
| 15    | Pirate ship | 2      | Wood hull, black sails, skull. Frame 2 pennant flips                                                    |
| 14    | Man-O-War   | 2      | Water-blue giant squid, tentacles up. Frame 2 tentacles shift                                           |
| 13    | Serpent     | 2      | Sea serpent, green, head south. Frame 2 body coil shifts. Already flat in Standard; match the new tones |
| 12    | Whirlpool   | 2      | Water-blue spiral. Frame 2 rotated a step                                                               |
| 9     | Chest       | 1      | Wood chest, steel bands, gold lock                                                                      |
| 34    | Moon Gate   | 1      | Moongate-blue upright oval, white crescent. Frame 2 cell is used by Exodus; leave blank                 |
| 62    | Shrine      | 1      | White shrine, red cross on the door                                                                     |
| 32    | Force Field | 1      | Bands of violet, magenta, blue. Already flat; keep. Frame 2 cell is used by Exodus                      |
| 60    | Magic       | 2      | Cyan orb; frame 2 the hit burst                                                                         |
| 61    | Fire        | 2      | Red orb; frame 2 the hit burst                                                                          |

The balls and the force field were redrawn flat recently and can stay. They
are listed so the artist checks them against the new figures.

## 7. Out of scope, decide after seeing 6.1

Terrain (Water, Grass, Brush, Forest, Mountains, Dungeon, Towne, Castle,
Floor, Lava, both Walls, Void) and the twenty brick letters A to T. Flat
figures over painted terrain is a common look. If the result jars, terrain
becomes a second brief with the same rules.

Not in scope at all: the UI sheet, the font, the first-person dungeon walls,
the four full-window scenes and the title logo.

## 8. Acceptance

- [ ] Every cell 32 x 32, alpha 0 or 255 only, no colour outside `palette.json`
- [ ] Every figure on baseline row 31, both frames same footprint
- [ ] Every material has three tones with distinct luminance
- [ ] Each variant reads as its base family at a glance
- [ ] Every figure legible on black and on green at 16 px (half size)
- [ ] Exodus row has four cells, the snake halves one each and stack, singles as marked
- [ ] Atlas row order and names match section 6

## Counts

| Group                | Tiles                                                | Cells |
| -------------------- | ---------------------------------------------------- | ----- |
| Monsters             | 25 (23 two-frame, 2 one-frame)                       | 48    |
| Exodus               | 1                                                    | 4     |
| People               | 4                                                    | 8     |
| Vehicles and objects | 8 to draw (5 two-frame, 3 one-frame); 4 already flat | 13    |
| Total to draw        | 38                                                   | 73    |

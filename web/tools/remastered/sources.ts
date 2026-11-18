/**
 * sources.ts
 *
 * Which of Ultima V's tiles each PC Ultima V tile was drawn from, so the Ultima V port's treatment of that tile
 * (originals.ts: its ground, its recolours, its people's skin) is the one it gets. Keyed "index.frame" (the tile, and
 * its first or second sheet frame); the value is the Ultima V tile and whether the PC Ultima V one is its mirror image.
 *
 * Found by matching the PC Ultima V sheet against the 1988 game's TILES.16, pixel for pixel, once (the share of their
 * drawn pixels alike is noted after each); neither the game's tiles nor anything read from them is kept here. A tile
 * not listed was drawn for the set, or changed past matching, and is toned as it is (remastered.ts `toned`).
 */

export const SOURCES: Record<string, [u5: number, mirrored: 0 | 1]> = {
  '0.0': [0x2, 0], // water: drawn for the set, but toned as Ultima V's water (its blues behind the lines) is
  '1.0': [0x5, 0], // grass, 100%
  '2.0': [0x8, 0], // brush, 100%
  '3.0': [0xa, 0], // forest, 100%
  '4.0': [0xd, 0], // mountains, 100%
  '5.0': [0x17, 0], // dungeon, 100%
  '7.0': [0x15, 0], // castle, 84%
  '7.1': [0x15, 0], // 81%
  '8.0': [0x44, 0], // floor, 100%
  '13.0': [0x188, 0], // serpent, 100%
  '13.1': [0x189, 0],
  '14.0': [0x186, 0], // man-o-war, 100%
  '14.1': [0x187, 0],
  '16.0': [0x154, 0], // merchant, 100%
  '16.1': [0x155, 0],
  '17.0': [0x15a, 1], // jester, 56%
  '17.1': [0x158, 1], // 61%
  '20.0': [0x14a, 0], // fighter, 100%
  '20.1': [0x14b, 0],
  '21.0': [0x178, 0], // cleric (Blackthorn), 75%
  '21.1': [0x179, 0], // 65%
  '22.0': [0x140, 0], // wizard, 62%
  '22.1': [0x141, 0], // 66%
  '23.0': [0x146, 0], // thief (the bard), 100%
  '23.1': [0x147, 0],
  '24.0': [0x1c0, 0], // orc, 100%
  '24.1': [0x1c1, 0],
  '25.0': [0x1c4, 0], // skeleton, 100%
  '25.1': [0x1c6, 0],
  '26.0': [0x1cc, 0], // giant, 100%
  '26.1': [0x1cd, 0],
  '27.0': [0x1d8, 0], // daemon, 93%
  '27.1': [0x1d9, 0], // 100%
  '28.0': [0x1ba, 0], // pincher, 49%
  '28.1': [0x1ba, 0], // 100%
  '29.0': [0x1dc, 0], // dragon, 100%
  '29.1': [0x1dd, 0],
  '33.0': [0x8f, 0], // lava, 100%
  '35.0': [0x4f, 0], // wall, 100%
  '46.1': [0xb9, 0], // the door (the I's second frame), 100%
  '62.0': [0x19, 0], // shrine, 100%
  '63.0': [0x11c, 0], // ranger, the party on the surface (the Avatar), 100%
  '63.1': [0x14f, 0],
  '64.0': [0x148, 0], // fighter (shared), 100%
  '64.1': [0x149, 0],
  '65.0': [0x179, 0], // cleric (shared), 52%
  '65.1': [0x17b, 0], // 65%
  '66.0': [0x141, 0], // wizard (shared), 66%
  '66.1': [0x142, 0], // 64%
  '67.0': [0x146, 0], // thief (shared), 100%
  '67.1': [0x147, 0],
  '80.0': [0x144, 0], // brigand, 100%
  '80.1': [0x145, 0],
  '81.0': [0x144, 0], // cutpurse, 100%
  '81.1': [0x145, 0],
  '83.0': [0x1e4, 0], // troll, 100%
  '83.1': [0x1e5, 0],
  '88.0': [0x1da, 0], // gargoyle, 61%
  '88.1': [0x1db, 0], // 59%
  '90.0': [0x1b9, 0], // snatch, 100%
  '90.1': [0x1bb, 0],
  '91.0': [0x1b9, 0], // bradle, 100%
  '91.1': [0x1bb, 0],
};

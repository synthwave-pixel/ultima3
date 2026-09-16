/**
 * names.ts
 *
 * A stock of character names for the "random name" button on the
 * character creation screen. Nothing in the game depends on them.
 */

export const NAMES = [
  'Aldric',
  'Brenna',
  'Cedric',
  'Dara',
  'Elric',
  'Fenna',
  'Gareth',
  'Hilde',
  'Ivar',
  'Jorun',
  'Kael',
  'Liora',
  'Merrick',
  'Nessa',
  'Orin',
  'Petra',
  'Quill',
  'Rowan',
  'Sabra',
  'Torvin',
  'Ulla',
  'Varek',
  'Wren',
  'Xanthe',
  'Ysolde',
  'Zarek',
  'Ansel',
  'Bryn',
  'Corwin',
  'Delia',
  'Emrys',
  'Faelan',
  'Gwyn',
  'Halvard',
  'Isolde',
  'Jasper',
  'Keira',
  'Lorcan',
  'Maren',
  'Niall',
  'Oriel',
  'Pell',
  'Rhiannon',
  'Soren',
  'Tamsin',
  'Ulric',
  'Vesna',
  'Wystan',
  'Yorick',
  'Zelda',
];

/** A name from the list, avoiding `taken` (roster names) when it can. */
export function randomName(random: () => number, taken: string[] = []): string {
  const free = NAMES.filter((n) => !taken.includes(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/**
 * extract-resources.ts
 *
 * One-time build step that converts the original Macintosh game data into
 * files a browser can fetch.
 *
 *   Input  (repo root)                          Output (web/public)
 *   ------------------------------------------  --------------------------------
 *   Resources/English.lproj/MainResources.rsrc  data/resources.json
 *   Resources/English.lproj/Strings/*.plist     data/resources.json (strings)
 *   Resources/Graphics/*                        graphics/*
 *   Resources/Sounds/*                          sounds/*
 *   Resources/Music/*                           music/*   (QuickTime music, see ui/music.ts)
 *   Images/<a few>                              images/*
 *
 * MainResources.rsrc is a classic Mac OS "resource fork" stored as a plain
 * data file. The format is documented in Inside Macintosh: More Macintosh
 * Toolbox, chapter 1 ("Resource Manager"). In short:
 *
 *   header      16 bytes  offsets/lengths of the data and map sections
 *   data        every resource, each prefixed by a 4-byte big-endian length
 *   map         a type list, then a reference list per type, then a name list
 *
 * Only the game-data types are exported (maps, monsters, dialogue, combat
 * arenas, lookup tables, default roster and party). The Mac UI resources
 * (menus, dialogs, icons, fonts) are ignored.
 *
 * Run with:  npm run extract      (Node 22+ can execute TypeScript directly)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const RESOURCES = join(REPO_ROOT, 'Resources');
const OUT = join(HERE, '..', 'public');

// ---------------------------------------------------------------------------
// Resource fork parser
// ---------------------------------------------------------------------------

interface RawResource {
  type: string;
  id: number;
  name: string;
  bytes: Uint8Array;
}

/** Decode Mac Roman bytes to a JS string (ASCII range is enough for us). */
function macRoman(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

function parseResourceFork(file: Uint8Array): RawResource[] {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const dataOffset = dv.getUint32(0);
  const mapOffset = dv.getUint32(4);

  // Resource map header: 16 bytes copy of the file header, 4 bytes next-map
  // handle, 2 bytes file ref, 2 bytes attributes, then the two offsets we need.
  const typeListOffset = mapOffset + dv.getUint16(mapOffset + 24);
  const nameListOffset = mapOffset + dv.getUint16(mapOffset + 26);
  const typeCount = dv.getUint16(typeListOffset) + 1;

  const out: RawResource[] = [];
  let p = typeListOffset + 2;
  for (let t = 0; t < typeCount; t++) {
    const type = macRoman(file.subarray(p, p + 4));
    const refCount = dv.getUint16(p + 4) + 1;
    const refListOffset = typeListOffset + dv.getUint16(p + 6);
    p += 8;

    let q = refListOffset;
    for (let r = 0; r < refCount; r++) {
      const id = dv.getInt16(q);
      const nameOffset = dv.getInt16(q + 2);
      // The data offset is a 3-byte big-endian value following a 1-byte attribute field.
      const dataRel = (dv.getUint8(q + 5) << 16) | (dv.getUint8(q + 6) << 8) | dv.getUint8(q + 7);
      q += 12;

      const start = dataOffset + dataRel;
      const length = dv.getUint32(start);
      const bytes = file.subarray(start + 4, start + 4 + length);

      let name = '';
      if (nameOffset !== -1) {
        const n = nameListOffset + nameOffset;
        name = macRoman(file.subarray(n + 1, n + 1 + file[n]));
      }
      out.push({ type, id, name, bytes });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Property-list (XML) string arrays
// ---------------------------------------------------------------------------

/**
 * The string tables are Apple XML plists containing a single <array> of
 * <string> elements. A full plist parser is overkill; a regex over the
 * <string> elements is sufficient and keeps this tool dependency-free.
 */
function parseStringArrayPlist(xml: string): string[] {
  const strings: string[] = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    strings.push(
      m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'),
    );
  }
  return strings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function main(): void {
  const forkPath = join(RESOURCES, 'English.lproj', 'MainResources.rsrc');
  const resources = parseResourceFork(new Uint8Array(readFileSync(forkPath)));

  /** Types we export, keyed by the JSON property name they end up under. */
  const wanted: Record<string, string> = {
    maps: 'MAPS', // 64x64 (and 16x16x8 dungeon) tile maps
    monsters: 'MONS', // initial monster/NPC tables per map
    talk: 'TLKS', // NPC dialogue per map
    combat: 'CONS', // 11x11 combat arenas
    misc: 'MISC', // lookup tables (moongates, classes, locations, experience)
    party: 'PRTY', // default party record
    roster: 'ROST', // default roster of 20 characters
    demo: 'DEMO', // attract-mode script
  };

  const bundle: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(wanted)) {
    const entries: Record<string, { name: string; data: string }> = {};
    for (const r of resources.filter((r) => r.type === type)) {
      entries[String(r.id)] = { name: r.name, data: base64(r.bytes) };
    }
    bundle[key] = entries;
  }

  const strings: Record<string, string[]> = {};
  const stringsDir = join(RESOURCES, 'English.lproj', 'Strings');
  for (const file of readdirSync(stringsDir)) {
    if (!file.endsWith('.plist')) continue;
    strings[file.replace(/\.plist$/, '')] = parseStringArrayPlist(readFileSync(join(stringsDir, file), 'utf8'));
  }
  bundle.strings = strings;

  mkdirSync(join(OUT, 'data'), { recursive: true });
  writeFileSync(join(OUT, 'data', 'resources.json'), JSON.stringify(bundle));

  // Graphics and sounds are usable as-is; just copy them where Vite serves them.
  for (const [src, dst] of [
    ['Graphics', 'graphics'],
    ['Sounds', 'sounds'],
    ['Music', 'music'],
  ] as const) {
    mkdirSync(join(OUT, dst), { recursive: true });
    for (const file of readdirSync(join(RESOURCES, src))) {
      if (file.startsWith('_') || file.startsWith('.')) continue;
      // "&" cannot travel in a URL safely: "Macintosh B&W-Tiles.gif" is served as "Macintosh BW-Tiles.gif" (see fileStem in graphics.ts).
      // LairWare's teal UI sheet is the Lairware set's; the Standard set's is a copper recolour of it kept in public/graphics.
      const name = file === 'Standard-UI.png' ? 'Lairware-UI.png' : file.replace(/&/g, '');
      copyFileSync(join(RESOURCES, src, file), join(OUT, dst, name));
    }
  }

  // Pictures used in play: the dungeon wall sheet and its mask, the title
  // picture and the cloth map of Sosaria (View map). LairWare's scene
  // renders (fountain, rod, shrine, Time Lord) go to the Lairware tile set
  // as its own scene pictures; the other sets have theirs drawn for them
  // (see docs/scene-images.md).
  const images = ['DungeonShapes.jpg', 'DungeonMasks.png', 'Exodus.png', 'SosariaMap.jpg'];
  mkdirSync(join(OUT, 'images'), { recursive: true });
  for (const file of images) copyFileSync(join(REPO_ROOT, 'Images', file), join(OUT, 'images', file));
  for (const scene of ['Fountain', 'Rod', 'Shrine', 'TimeLord']) {
    copyFileSync(join(REPO_ROOT, 'Images', `${scene}.jpg`), join(OUT, 'graphics', `Lairware-${scene}.jpg`));
  }

  const counts = Object.entries(wanted)
    .map(([k]) => `${k}=${Object.keys(bundle[k] as object).length}`)
    .join(' ');
  console.log(`Wrote public/data/resources.json (${counts}, strings=${Object.keys(strings).length} tables)`);
}

main();

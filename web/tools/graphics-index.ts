/**
 * graphics-index.ts
 *
 * Writes public/graphics/index.json: the names of every file in
 * public/graphics, sorted. The game reads it once and asks only for
 * files that exist, instead of probing each set's optional files (a
 * transparency mask, its own dungeon sheets, a scene in another format)
 * and collecting 404s. Run after adding or removing a graphics file:
 *
 *   npm run graphics-index
 *
 * `npm run build` runs it first, and a test checks the file against the
 * folder so a stale index fails CI.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'graphics');
export const graphicsIndex = (): string[] =>
  readdirSync(dir)
    .filter((f) => f !== 'index.json' && !f.startsWith('.'))
    .sort();
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = graphicsIndex();
  writeFileSync(join(dir, 'index.json'), JSON.stringify(files, null, 2) + '\n');
  console.log(`wrote ${files.length} names to public/graphics/index.json`);
}

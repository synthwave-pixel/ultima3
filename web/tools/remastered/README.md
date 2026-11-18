# tools/remastered

What `npm run remastered` (`tools/remastered.ts`) draws the Remastered tile
sheet with, from the PC Ultima V one:

- `originals.ts`: copied from the Ultima V port
  ([synthwave-pixel/ultima5](https://github.com/synthwave-pixel/ultima5),
  `web/src/ui/originals.ts`, at f0766f2), its Remastered look's treatment
  of Ultima V's EGA tiles: the toned palette, the grounds lifted, the
  recolours. Only its imports are changed (to `ega.ts`). Copy it again to
  take up that port's changes.
- `ega.ts`: what `originals.ts` took from the rest of that game: the EGA
  palette, the enlargement, the people's skin ramps.
- `png.ts`: copied from the same port's `web/tools/png.ts`.
- `sources.ts`: which Ultima V tile each PC Ultima V tile was drawn from,
  found once by matching the two; no game file is read or kept.

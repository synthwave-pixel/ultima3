/**
 * talk.ts
 *
 * Decoding of the TLKS resources: NPC dialogue for each map. Kept apart
 * from interact.ts so the World (which the journal asks for a town's
 * lines) can use it without a circular import.
 */

/**
 * Mirrors `Speak()`: NPC dialogue. A TLKS resource is a run of NUL
 * terminated strings; `person` selects the nth. Characters have the high
 * bit set (Apple II text) and 0xFF marks a line break.
 */
export function speech(talk: Uint8Array, person: number): string {
  let p = 0;
  while (person > 0 && p < 256) {
    while (talk[p] !== 0 && p < 256) p++;
    person--;
    p++;
  }
  let out = '';
  while (p < 256 && talk[p] !== 0) {
    out += talk[p] === 0xff ? '\n' : String.fromCharCode(talk[p] & 0x7f);
    p++;
  }
  return out;
}

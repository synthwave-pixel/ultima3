/**
 * moonArt.ts
 *
 * Moon phases painted at run time for the 8-bit and 16-colour tile sets.
 * LairWare drew shaded, anti-aliased moons for every UI sheet, which look
 * wrong beside a Commodore 64 or Apple II tile; the sets named here get
 * flat pixel moons in their own palettes instead, on a 16 by 16 grid like
 * the Nintendo and Macintosh sheets' own. Standard takes the EGA moons
 * too, by choice. Sets not named keep the moons of their UI sheet.
 *
 * The phases run as the Nintendo and Macintosh sheets draw them: 0 new,
 * 1 to 3 a crescent growing on the left, 4 full, 5 to 7 shrinking on the
 * right. Trammel and Felucca each get a colour, so the two moons on the
 * status bar tell apart at a glance.
 */

export interface MoonStyle {
  /** The lit side of Trammel, and of Felucca. */
  trammel: string;
  felucca: string;
  /** The dark side; drawn, so a new moon still shows as a disc. */
  dark: string;
}

export const MOON_STYLES: Record<string, MoonStyle> = {
  Standard: { trammel: '#ffffff', felucca: '#ffff55', dark: '#555555' }, // as PC EGA: LairWare's shaded moons look too modern beside the tiles
  'Commodore 64': { trammel: '#8e8dff', felucca: '#f3eb5b', dark: '#3b3b3b' },
  'Apple II Color': { trammel: '#15cffd', felucca: '#ff6a3c', dark: '#303030' },
  'Apple II Color TV': { trammel: '#15cffd', felucca: '#ff6a3c', dark: '#303030' },
  'Apple II Mono': { trammel: '#8cf88c', felucca: '#8cf88c', dark: '#204320' },
  'PC CGA': { trammel: '#55ffff', felucca: '#ff55ff', dark: '#000000' },
  'PC EGA': { trammel: '#ffffff', felucca: '#ffff55', dark: '#555555' },
};

/** Logical pixels across a moon cell, and the pixels each is painted with. */
const GRID = 16;
const SCALE = 4;
export const MOON_CELL = GRID * SCALE;

/** Whether logical pixel (x, y) of phase `phase` is lit; null when it is off the disc. */
export function moonPixel(phase: number, x: number, y: number): boolean | null {
  const cx = (x + 0.5 - GRID / 2) / 6.5;
  const cy = (y + 0.5 - GRID / 2) / 6.5;
  if (cx * cx + cy * cy > 1) return null;
  const half = Math.sqrt(1 - cy * cy); // the disc's half-width on this row
  const k = phase <= 4 ? phase / 4 : (8 - phase) / 4; // lit fraction, 0 new to 1 full
  const terminator = half * Math.cos(Math.PI * k); // an ellipse's edge, as a real moon's
  return phase <= 4 ? cx < -terminator : cx > terminator;
}

/** Paint the sixteen moons (Trammel's eight, then Felucca's) as one strip, MOON_CELL pixels square each. */
export function paintMoons(style: MoonStyle): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MOON_CELL * 16;
  canvas.height = MOON_CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; // on black, as the sheets' moons are: the cell covers the bar it sits on
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let column = 0; column < 16; column++) {
    const lit = column < 8 ? style.trammel : style.felucca;
    const phase = column & 7;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const on = moonPixel(phase, x, y);
        if (on === null) continue;
        ctx.fillStyle = on ? lit : style.dark;
        ctx.fillRect(column * MOON_CELL + x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
  }
  return canvas;
}

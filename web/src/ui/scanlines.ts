/**
 * scanlines.ts
 *
 * The Scanlines setting: the look of a CRT over the whole game, the map,
 * text, menus, the dungeon and the cloth map alike, whatever tile set is
 * shown. One dark band for each of the Apple II's 192 screen lines. The
 * bands are drawn in the screen's own pixels, on a canvas laid over the
 * game's, not into the game's canvas: that one is scaled to the window,
 * which would thicken some lines, thin others and drop a few.
 */

/** The Apple II's screen lines, and so the scanlines down the picture. */
export const SCREEN_LINES = 192;
/** How much of the picture's brightness the dark band of a line lets through. */
export const SCANLINE_LEVEL = 0.65;

/**
 * The dark bands for a picture `height` device pixels tall, as [top,
 * rows]: one per line at an even whole-pixel pitch, the lower half of
 * each. Under two pixels a line there is no room for a band and its gap,
 * and none are drawn.
 */
export function scanlineBands(height: number): [number, number][] {
  const pitch = Math.round(height / SCREEN_LINES);
  if (pitch < 2) return [];
  const dark = Math.floor(pitch / 2);
  const bands: [number, number][] = [];
  for (let top = pitch - dark; top < height; top += pitch) bands.push([top, Math.min(dark, height - top)]);
  return bands;
}

/** The bands, on their own canvas over the game's, following it as the window changes. */
export class ScanlineOverlay {
  private readonly overlay = document.createElement('canvas');
  private on = false;

  constructor(private readonly target: HTMLCanvasElement) {
    // Over the game, under the virtual controller (z-index 10), and never in the way of a tap.
    this.overlay.style.cssText = 'position:absolute;z-index:1;pointer-events:none;display:none;';
    this.overlay.setAttribute('aria-hidden', 'true');
    target.after(this.overlay);
    new ResizeObserver(() => this.layout()).observe(target);
    window.addEventListener('resize', () => this.layout());
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    this.on = on;
    this.overlay.style.display = on ? 'block' : 'none';
    this.layout();
  }

  /** Cover the game canvas exactly, on whole device pixels, and draw the bands. */
  private layout(): void {
    if (!this.on) return;
    const dpr = window.devicePixelRatio || 1;
    const r = this.target.getBoundingClientRect();
    const left = Math.round((r.left + window.scrollX) * dpr);
    const top = Math.round((r.top + window.scrollY) * dpr);
    const width = Math.round(r.width * dpr);
    const height = Math.round(r.height * dpr);
    const o = this.overlay;
    o.style.left = `${left / dpr}px`;
    o.style.top = `${top / dpr}px`;
    o.style.width = `${width / dpr}px`;
    o.style.height = `${height / dpr}px`;
    o.width = width;
    o.height = height;
    const ctx = o.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(0,0,0,${1 - SCANLINE_LEVEL})`;
    for (const [y, rows] of scanlineBands(height)) ctx.fillRect(0, y, width, rows);
  }
}

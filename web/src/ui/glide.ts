/**
 * glide.ts
 *
 * Smooth motion (Visuals): the top-down views slide from square to square
 * instead of jumping. The game itself still moves in whole squares; this
 * only says, for the frame being painted, how far behind its square each
 * thing is still drawn. A pure tracker, fed each new view's positions and
 * read for the lags; screen.ts does the drawing.
 *
 * Each track holds where its thing now stands (`to`) and how far from there
 * it was drawn when it got there (`offset`), the lag running down to nothing
 * at an even pace. A step arriving mid-glide starts from where the thing is
 * drawn, so a held key walks at an even pace rather than in lurches. Steps
 * last as long as the time since the last one, up to `longest`, so a fast
 * key repeat is followed as closely as a slow one. A jump of more than a square
 * (a moongate, a ladder, a fight beginning) is not glided, nor is anything in
 * a new scene.
 */

/** A step's glide when steps come no faster: the gamepad's and the touch pad's held repeat (120 ms), and a little. */
export const GLIDE_MS = 125;
/** The shortest glide, however fast the steps come. */
export const GLIDE_MIN_MS = 30;
/**
 * The longest glide past a held key's pace (input.ts Max input): a held step comes a frame or so after its pace has
 * gone by, and the glide should last until it does, so the walk is one slide with no rest between squares.
 */
export const GLIDE_SLACK_MS = 20;

export interface Point {
  x: number;
  y: number;
}

interface Track {
  to: Point;
  offset: Point;
  start: number;
  ms: number;
}

const STILL: Point = { x: 0, y: 0 };

export class Glide {
  private scene: unknown = undefined;
  private tracks = new Map<string, Track>();
  private lastStep = -Infinity;
  /** The longest a step glides: GLIDE_MS, or a held key's pace and GLIDE_SLACK_MS (screen.ts). */
  longest = GLIDE_MS;

  /**
   * A new view: where each thing now stands (map squares; `camera` for the view's own corner), in `scene` (any
   * value, compared by identity: a new one starts every track afresh). `wrap` is the map's size where it wraps
   * round (the surface), so a step across the seam is a step, or 0.
   */
  update(scene: unknown, places: Map<string, Point>, wrap: number, now: number): void {
    if (scene !== this.scene) {
      this.scene = scene;
      this.tracks.clear();
    }
    const near = (d: number) => (wrap > 0 ? ((((d + wrap / 2) % wrap) + wrap) % wrap) - wrap / 2 : d);
    const ms = Math.max(GLIDE_MIN_MS, Math.min(this.longest, now - this.lastStep));
    let stepped = false;
    for (const id of [...this.tracks.keys()]) if (!places.has(id)) this.tracks.delete(id);
    for (const [id, to] of places) {
      const was = this.tracks.get(id);
      if (!was) {
        this.tracks.set(id, { to, offset: STILL, start: now, ms });
        continue;
      }
      const step = { x: near(to.x - was.to.x), y: near(to.y - was.to.y) };
      if (step.x === 0 && step.y === 0) continue;
      const lag = this.lagOf(was, now);
      const offset = { x: lag.x - step.x, y: lag.y - step.y };
      const glides = Math.abs(step.x) <= 1 && Math.abs(step.y) <= 1 && Math.abs(offset.x) <= 2 && Math.abs(offset.y) <= 2;
      this.tracks.set(id, { to, offset: glides ? offset : STILL, start: now, ms });
      if (glides) stepped = true;
    }
    if (stepped) this.lastStep = now;
  }

  /** How far from its square `id` is drawn at `now`, in squares (drawn minus standing): nothing once it has arrived. */
  lag(id: string, now: number): Point {
    const t = this.tracks.get(id);
    return t ? this.lagOf(t, now) : STILL;
  }

  /** Whether anything is still on its way, so the frames should keep coming. */
  moving(now: number): boolean {
    for (const t of this.tracks.values()) if ((t.offset.x || t.offset.y) && now - t.start < t.ms) return true;
    return false;
  }

  /** Forget everything: the next view starts still. */
  reset(): void {
    this.scene = undefined;
    this.tracks.clear();
  }

  private lagOf(t: Track, now: number): Point {
    const left = Math.max(0, 1 - (now - t.start) / t.ms);
    return left === 0 ? STILL : { x: t.offset.x * left, y: t.offset.y * left };
  }
}

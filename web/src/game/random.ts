/**
 * random.ts
 *
 * A small seedable pseudo-random generator. The original used the Mac
 * Toolbox `Random()`; we use mulberry32 so tests can be deterministic.
 */

export class Random {
  private state: number;

  constructor(seed = Date.now() >>> 0) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Integer in the inclusive range [low, high].
   * Mirrors `RandNum(lowrnd, highrnd)` in UltimaMain.c.
   */
  range(low: number, high: number): number {
    return low + Math.floor(this.next() * (high - low + 1));
  }
}

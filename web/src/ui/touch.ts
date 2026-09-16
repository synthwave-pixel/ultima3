/**
 * touch.ts
 *
 * A virtual controller for touch screens (and the mouse): a d-pad at the
 * lower left, A and B at the lower right in the Xbox arrangement (A low,
 * B up and to its right) with Y above B (Y opens the cheats from the help
 * pages, and is Look, Attack or Ignite in play), a close button at the
 * upper left and, at the upper right, a full-screen button where the
 * browser allows it. Everything is drawn as one-pixel lines at
 * three-quarter white, each with a one-pixel rim of half black on either
 * side so it reads over any ground, and nothing inside, so the game shows
 * through. Sizes are in millimetres, which CSS scales by the device's
 * pixel ratio, so the pad is about the size of an NES controller's on any
 * screen (the d-pad half as large again, for thumbs on glass).
 *
 * The pad feeds the same Keyboard the game reads, as a gamepad does, and
 * switches the game to controller mode. A tap anywhere shows it; only its
 * close button hides it (or a physical key or gamepad press, so a mouse
 * user who clicked once is not stuck with it). Whether it is shown is
 * remembered between visits.
 */

import { Key } from '../game/io.ts';
import type { Keyboard } from './input.ts';

/** Sizes in millimetres: the NES d-pad is about 24 across and its buttons about 10; thumbs on glass want more, the d-pad most. */
const DPAD_MM = 42;
const BUTTON_MM = 14;
const SMALL_MM = 10;
const MARGIN_MM = 8;
/** Holding a d-pad direction repeats it, as a held key does. */
const REPEAT_FIRST_MS = 250;
const REPEAT_MS = 120;

const STROKE = 'rgba(255,255,255,0.75)';
const RIM = 'rgba(0,0,0,0.5)';
/** One CSS pixel is 0.26 mm (CSS defines the millimetre as 96/25.4 px), whatever the screen's density. */
const PX = 0.26;
const SVG = 'http://www.w3.org/2000/svg';

export interface TouchPadOptions {
  keyboard: Keyboard;
  /** Called on every press: the game switches to controller mode. */
  onPress: () => void;
  /** Called when the pad is shown or hidden, to remember it. */
  onToggle: (shown: boolean) => void;
  shown: boolean;
}

export class TouchPad {
  private readonly root: HTMLDivElement;
  private repeat: ReturnType<typeof setTimeout> | null = null;
  private fullscreenButton: SVGSVGElement | null = null;
  private _shown = false;

  constructor(private readonly options: TouchPadOptions) {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;z-index:10;';
    document.body.appendChild(this.root);

    this.root.appendChild(this.dpad());
    // A low and B up to its right, each a button's width and a little more apart on the diagonal.
    this.root.appendChild(this.button('A', Key.A, `right:${MARGIN_MM + BUTTON_MM + 1}mm;bottom:${MARGIN_MM}mm`));
    this.root.appendChild(this.button('B', Key.B, `right:${MARGIN_MM}mm;bottom:${MARGIN_MM + BUTTON_MM + 1}mm`));
    // Y above B, with the same clear space between them as between A and B, which sit a button apart on the diagonal.
    const gap = Math.SQRT2 * (BUTTON_MM + 1) - BUTTON_MM;
    this.root.appendChild(this.button('Y', Key.Y, `right:${MARGIN_MM}mm;bottom:${(MARGIN_MM + 2 * BUTTON_MM + 1 + gap).toFixed(1)}mm`));
    this.root.appendChild(this.closeButton());
    if (document.fullscreenEnabled) {
      this.fullscreenButton = this.fullscreenToggle();
      this.root.appendChild(this.fullscreenButton);
      document.addEventListener('fullscreenchange', () => this.showFullscreenButton());
      this.showFullscreenButton();
    }

    // A tap or click anywhere shows the pad; a physical key hides it.
    window.addEventListener('pointerdown', () => {
      if (!this._shown) this.show(true);
    });
    // iOS WebKit zooms in on a double-tapped element whatever the CSS and
    // viewport say, unless the page cancels the tap itself: the pad works
    // through pointer events, so the touch events can be cancelled outright,
    // and the pinch gesture with them. Nothing else on the page needs them.
    const cancel = (e: Event) => e.preventDefault();
    document.addEventListener('touchend', cancel, { passive: false });
    document.addEventListener('touchmove', cancel, { passive: false });
    document.addEventListener('gesturestart', cancel, { passive: false });
    document.addEventListener('dblclick', cancel);
    window.addEventListener('keydown', (e) => {
      if (this._shown && !e.metaKey && !e.ctrlKey && !e.altKey) this.show(false);
    });
    this.show(options.shown, true);
  }

  get shown(): boolean {
    return this._shown;
  }

  /** Show or hide the pad. */
  show(on: boolean, quiet = false): void {
    this._shown = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) this.release();
    if (!quiet) this.options.onToggle(on);
  }

  private showFullscreenButton(): void {
    if (this.fullscreenButton) this.fullscreenButton.style.display = document.fullscreenElement ? 'none' : 'block';
  }

  /** An SVG of `mm` millimetres square placed with the given CSS position, with a safe-area inset added. */
  private svg(mm: number, position: string): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${mm} ${mm}`);
    svg.setAttribute('width', `${mm}mm`);
    svg.setAttribute('height', `${mm}mm`);
    svg.style.cssText = `position:absolute;${position};pointer-events:none;overflow:visible;touch-action:none;`;
    // Keep clear of notches and rounded corners.
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const m = position.match(new RegExp(`${side}:([0-9.]+)mm`));
      if (m) svg.style.setProperty(side, `calc(${m[1]}mm + env(safe-area-inset-${side}, 0px))`);
    }
    return svg;
  }

  /**
   * A shape drawn as a one-pixel line over a three-pixel rim of half black
   * (one pixel showing either side), with a transparent fill so taps inside
   * it count. Both are added to `svg`; the line is returned, since it is
   * what presses recolour. `rim: false` for hit zones that are never seen.
   */
  private shape(svg: SVGSVGElement, kind: 'path' | 'circle' | 'rect', attrs: Record<string, string>, rim = true): SVGElement {
    const make = (stroke: string, width: number) => {
      const el = document.createElementNS(SVG, kind);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.setAttribute('fill', 'transparent');
      el.setAttribute('stroke', stroke);
      el.setAttribute('stroke-width', `${width}`);
      el.setAttribute('stroke-linejoin', 'round');
      return el;
    };
    if (rim) {
      const under = make(RIM, 3 * PX);
      under.style.pointerEvents = 'none';
      svg.appendChild(under);
    }
    const el = make(STROKE, PX);
    svg.appendChild(el);
    return el;
  }

  /** Make an element a button: pressing pushes `key`; the d-pad's repeat while held. */
  private pressable(el: SVGElement, key: string, repeats: boolean): void {
    el.style.pointerEvents = 'all';
    el.style.cursor = 'pointer';
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      el.setAttribute('stroke', '#fff');
      el.setAttribute('stroke-width', `${2 * PX}`);
      this.press(key);
      if (repeats) {
        this.release();
        this.repeat = setTimeout(() => {
          this.repeat = setInterval(() => this.press(key), REPEAT_MS);
        }, REPEAT_FIRST_MS);
      }
    };
    const up = () => {
      el.setAttribute('stroke', STROKE);
      el.setAttribute('stroke-width', `${PX}`);
      this.release();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  private press(key: string): void {
    this.options.onPress();
    this.options.keyboard.push(key);
  }

  private release(): void {
    if (this.repeat !== null) {
      clearTimeout(this.repeat);
      clearInterval(this.repeat);
      this.repeat = null;
    }
  }

  /** The d-pad: a cross outline, its four arms the buttons, with a small circle in each. */
  private dpad(): SVGSVGElement {
    const svg = this.svg(DPAD_MM, `left:${MARGIN_MM}mm;bottom:${MARGIN_MM}mm`);
    const s = DPAD_MM;
    const a = s / 3; // arm width
    const c = s / 2;
    const r = s / 14; // the marks' radius
    this.shape(svg, 'path', {
      d: `M${a} 0 H${2 * a} V${a} H${s} V${2 * a} H${2 * a} V${s} H${a} V${2 * a} H0 V${a} H${a} Z`,
    });
    // Each arm's hit zone, and the centre of the circle marking it.
    const arms: [string, string, number, number][] = [
      [Key.Up, `M${a} 0 H${2 * a} V${a} H${a} Z`, c, a / 2],
      [Key.Down, `M${a} ${2 * a} H${2 * a} V${s} H${a} Z`, c, s - a / 2],
      [Key.Left, `M0 ${a} H${a} V${2 * a} H0 Z`, a / 2, c],
      [Key.Right, `M${2 * a} ${a} H${s} V${2 * a} H${2 * a} Z`, s - a / 2, c],
    ];
    for (const [key, hit, cx, cy] of arms) {
      const mark = this.shape(svg, 'circle', { cx: `${cx}`, cy: `${cy}`, r: `${r}` });
      const zone = this.shape(svg, 'path', { d: hit }, false);
      zone.setAttribute('stroke', 'none');
      this.pressable(zone, key, true);
      // The zone brightens the arrow rather than itself.
      zone.addEventListener('pointerdown', () => mark.setAttribute('stroke', '#fff'));
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
        zone.addEventListener(ev, () => mark.setAttribute('stroke', STROKE));
    }
    return svg;
  }

  /** A round button with its letter drawn as an outline. */
  private button(label: string, key: string, position: string): SVGSVGElement {
    const svg = this.svg(BUTTON_MM, position);
    const r = BUTTON_MM / 2;
    const circle = this.shape(svg, 'circle', { cx: `${r}`, cy: `${r}`, r: `${r - 0.5}` });
    // The letter, as an outline over its rim like the shapes.
    for (const [stroke, width] of [
      [RIM, 3 * PX],
      [STROKE, PX],
    ] as const) {
      const text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', `${r}`);
      text.setAttribute('y', `${r + 2}`);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '6');
      text.setAttribute('fill', 'transparent');
      text.setAttribute('stroke', stroke);
      text.setAttribute('stroke-width', `${width}`);
      text.setAttribute('stroke-linejoin', 'round');
      text.style.pointerEvents = 'none';
      text.textContent = label;
      svg.appendChild(text);
    }
    this.pressable(circle, key, false);
    return svg;
  }

  /** Upper left: a circled cross that hides the pad. */
  private closeButton(): SVGSVGElement {
    const svg = this.svg(SMALL_MM, `left:${MARGIN_MM}mm;top:${MARGIN_MM}mm`);
    const r = SMALL_MM / 2;
    const circle = this.shape(svg, 'circle', { cx: `${r}`, cy: `${r}`, r: `${r - 0.5}` });
    const cross = this.shape(svg, 'path', { d: `M${r - 2} ${r - 2} L${r + 2} ${r + 2} M${r + 2} ${r - 2} L${r - 2} ${r + 2}` });
    cross.style.pointerEvents = 'none';
    circle.style.pointerEvents = 'all';
    circle.style.cursor = 'pointer';
    circle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.show(false);
    });
    return svg;
  }

  /** Upper right: a square with corner marks that asks for full screen; hidden while in it. */
  private fullscreenToggle(): SVGSVGElement {
    const svg = this.svg(SMALL_MM, `right:${MARGIN_MM}mm;top:${MARGIN_MM}mm`);
    const s = SMALL_MM;
    const box = this.shape(svg, 'rect', { x: '0.5', y: '0.5', width: `${s - 1}`, height: `${s - 1}`, rx: '1' });
    const corners = this.shape(svg, 'path', {
      d: `M2.5 4.5 V2.5 H4.5 M${s - 4.5} 2.5 H${s - 2.5} V4.5 M${s - 2.5} ${s - 4.5} V${s - 2.5} H${s - 4.5} M4.5 ${s - 2.5} H2.5 V${s - 4.5}`,
    });
    corners.style.pointerEvents = 'none';
    box.style.pointerEvents = 'all';
    box.style.cursor = 'pointer';
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void document.documentElement.requestFullscreen().catch(() => {
        /* refused: nothing to do */
      });
    });
    return svg;
  }
}

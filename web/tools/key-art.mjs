// The game's key art, made from the 1983 box painting by Denis Loubet for Origin Systems: art/box/ultima3-box-c64.jpg,
// the Commodore 64 box's front. The painting is kept at the scan's own resolution or close to it: smooth, a painting,
// as the box was. The desktop app's Steam library artwork (desktop/steamArt.cjs puts it in place), in
// desktop/build/steam/:
//   - capsule.png (600x900, the library's portrait capsule): the box, its own title at the top, its border and the
//     "Commodore 64" label gone (the lava under the label is the left side's, mirrored), its foot fading to dark under
//     "1983 ~ 2026";
//   - wide.png (920x430, the wide capsule): the painting below the title to the left, fading into the dark; the title
//     (tools/title-art.mjs, drawn afresh as vectors) and the years to the right;
//   - hero.png (3840x1240, across the game's page): the demon cut from the cavern along his wings' outer edges, their
//     finger bones with them, sharp-edged, on a glow of his own reds and yellows that dies to black at the edges; his
//     eyes and his glowing hands inside Steam's safe zone, the middle 860x380 (x 1490-2350, y 430-810) sure to stay in
//     view as the window is resized, his wings running off the top and bottom edges; nothing in the top-right corner
//     the Steam Deck's status bar covers; the sliver of the title's underside along its top, between the wings, painted
//     out with the dark below it;
//   - logo.png: blank. Steam lays the logo over the hero, and with none it writes the game's name there instead; the
//     hero is shown bare, with no words.
// Besides them:
//   - promo/logo.png (1280 wide, transparent): the title alone;
//   - promo/banner.jpg (1840x860): the wide capsule at twice its size, at the top of the READMEs;
//   - web/public/share.jpg (1200x630): the wide capsule laid out again for a shared link's picture (index.html's
//     og:image), the scene the whole height on the left, the title and the years to its right;
//   - web/public/boot.jpg (1600x960, the game's 5:3): the hero's middle, the demon alone, shown while the game loads.
// The years are U5's dateline (its tools/key-art.mjs) - IM FELL English's figures (art/fonts/), a wave between them -
// cut into stone: the wing's veined red for the cut's floor, a darker copy of it as the wall in shadow along the top
// and left of each stroke and a lighter copy as the lit wall along the bottom and right, a thin dark outline around.
// Run `node tools/key-art.mjs` in web/; it needs ImageMagick 7 (`magick`).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { titleSvg } from './title-art.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = join(WEB, 'art', 'box', 'ultima3-box-c64.jpg');
const ROOT = join(WEB, '..');
const FONT = 'IM FELL English';
const RESVG = { font: { fontFiles: [join(WEB, 'art', 'fonts', 'IMFeENrm28P.ttf')], loadSystemFonts: false, defaultFontFamily: FONT } };
const tmp = mkdtempSync(join(tmpdir(), 'key-art-'));
const t = (name) => join(tmp, name);
const magick = (...args) => execFileSync('magick', args.flat(Infinity), { stdio: 'inherit' });
/** Written pictures (their paths from the repository's root) carry no dates, so the same scan makes the same files. */
const write = (...path) => ['-strip', '-define', 'png:exclude-chunks=date,time', join(ROOT, ...path)];
const steam = (name) => write('desktop', 'build', 'steam', name);
/** A JPEG, progressive (a coarse picture first, finer as it comes). */
const jpeg = (quality, ...path) => ['-strip', '-quality', String(quality), '-interlace', 'Plane', join(ROOT, ...path)];
/** An SVG rendered to a PNG in the temporary folder. */
const render = (svg, name) => writeFileSync(t(name), new Resvg(svg, RESVG).render().asPng());
const uri = (name) => `data:image/png;base64,${readFileSync(t(name)).toString('base64')}`;
const n = (v) => Number(v.toFixed(1));

// The hero's cut, in the painting's pixels (the scan less its border). Each wing's outer edge is found row by row: near
// a rough trace, where the dark of the cavern outside steps up most sharply to the wing's lit rim (the median of nine
// rows taken, then a running mean, a pixel outward so the rim stays whole). Each finger bone is a thin white line,
// followed upward from its glint row by row at its brightest. Over the wings' tops, glint to glint, then up the inner
// bone to the title: what is between the wings, the dark over the demon's head, stays.
const WING_LEFT = [
  [422, 77],
  [490, 67],
  [540, 65],
  [610, 67],
  [670, 72],
  [720, 82],
  [770, 95],
  [820, 112],
  [860, 132],
  [890, 145],
];
const WING_RIGHT = [
  [410, 596],
  [455, 609],
  [540, 616],
  [610, 616],
  [670, 611],
  [740, 599],
  [800, 581],
  [855, 559],
  [890, 539],
];
const BONES = {
  outerLeft: [
    [416, 80],
    [342, 121],
    [305, 155],
    [282, 174],
  ],
  middleLeft: [
    [372, 138],
    [324, 165],
    [282, 189],
  ],
  innerLeft: [
    [342, 183],
    [282, 206],
  ],
  outerRight: [
    [406, 593],
    [282, 511],
  ],
  middleRight: [
    [365, 536],
    [282, 489],
  ],
  innerRight: [
    [342, 490],
    [282, 466],
  ],
};
const GLINTS_LEFT = [
  [183, 345],
  [136, 375],
  [80, 418],
];
const GLINTS_RIGHT = [
  [595, 409],
  [538, 367],
  [492, 344],
];
// Where the painting shows on the hero: its row 302 at the top edge, 2.37 times its size (the eyes, row 486, at 436;
// the glowing hands, row 614, at 739), its middle (column 341) on the hero's.
const HERO = { top: 302, scale: 2.37, middle: 341, eyes: 486, hands: 614 };
/** What of the hero's top edge is painted out: between the wings, in the painting's pixels, `height` of the hero's down. */
const HERO_PATCH = { left: 259, right: 416, height: 14 };

/** `pts` ([y, x] by y) read at row `y`, in a straight line between them. */
function along(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [[y0, x0], [y1, x1]] = [pts[i - 1], pts[i]];
    if ((y - y0) * (y - y1) <= 0) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return pts.at(-1)[1];
}

/** The hero's cut as an SVG path, its points in the painting's pixels mapped by `pt`. */
function heroCut(gray, width, pt, bottom) {
  const lum = (x, y) => gray[y * width + Math.round(x)];
  const edge = (trace, dir) => {
    const rows = [];
    for (let y = trace[0][0]; y <= Math.min(bottom, trace.at(-1)[0]); y++) {
      const guess = Math.round(along(trace, y));
      let [best, at] = [-Infinity, guess];
      for (let x = guess - 14; x <= guess + 14; x++) {
        const step = lum(x + dir, y) + lum(x + 2 * dir, y) - lum(x - dir, y) - lum(x - 2 * dir, y);
        if (step > best) [best, at] = [step, x];
      }
      rows.push([y, at]);
    }
    const median = rows.map(([y], i) => [
      y,
      rows
        .slice(Math.max(0, i - 4), i + 5)
        .map((r) => r[1])
        .sort((a, b) => a - b)[4] ?? rows[i][1],
    ]);
    const smooth = median.map(([y], i) => {
      const near = median.slice(Math.max(0, i - 5), i + 6);
      return [y, near.reduce((s, r) => s + r[1], 0) / near.length];
    });
    return smooth.map(([y, x]) => [x - dir, y]);
  };
  const bone = (trace) => {
    const line = [];
    let x = trace[0][1];
    for (let y = trace[0][0] - 4; y >= trace.at(-1)[0]; y--) {
      const guess = Math.round(line.length ? x : along(trace, y));
      let [best, at] = [-1, guess];
      for (let c = guess - 5; c <= guess + 5; c++) if (lum(c, y) > best) [best, at] = [lum(c, y), c];
      let [sum, weight] = [0, 0];
      for (let c = at - 2; c <= at + 2; c++) {
        const v = Math.max(0, lum(c, y) - 40);
        [sum, weight] = [sum + v * c, weight + v];
      }
      x = weight ? sum / weight : at;
      line.push([x, y]);
    }
    return line;
  };
  const left = edge(WING_LEFT, 1);
  const right = edge(WING_RIGHT, -1).reverse();
  const shift = (line, dx) => line.map(([x, y]) => [x + dx, y]);
  const outline = [
    ...shift(bone(BONES.innerLeft), -1.6).reverse(),
    ...GLINTS_LEFT,
    ...left,
    [left.at(-1)[0], bottom + 20],
    [right[0][0], bottom + 20],
    ...right,
    ...GLINTS_RIGHT,
    ...shift(bone(BONES.innerRight), 1.6),
  ];
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join(' ');
  const bones = [BONES.outerLeft, BONES.middleLeft, BONES.outerRight, BONES.middleRight].map((b) => path(bone(b)));
  return { outline: `${path(outline)}Z`, bones };
}

try {
  // The painting: the scan with the label's corner covered by the left side's lava (mirrored, its edges feathered),
  // then the striped border trimmed off.
  magick(
    SCAN,
    '-crop',
    '84x132+10+850',
    '+repage',
    '-flop',
    '-alpha',
    'set',
    '-channel',
    'A',
    '-fx',
    'min(1, min(i/24, j/24))',
    '+channel',
    t('patch.png'),
  );
  magick(SCAN, t('patch.png'), '-geometry', '+604+850', '-composite', '-crop', '669x972+15+10', '+repage', t('painting.png'));
  // The scene below the title (the demon, his wings and the rock), and the stone for the years (the left wing, turned).
  magick(t('painting.png'), '-crop', '669x662+0+310', '+repage', t('scene.png'));
  magick(t('painting.png'), '-crop', '56x250+72+435', '+repage', '-rotate', '90', '-modulate', '80,105', t('stone.png'));

  /**
   * "1983 ~ 2026" cut into the stone, `w` x `h` on transparency: U5's dateline as large as fits (the wave a type size
   * across at the figures' middle, a type size and a quarter of space each side of it, the years beyond), the three
   * stones through it, the outline.
   */
  const carve = (w, h, out) => {
    // IM FELL's figures are old-style: they reach 0.59 of the type size above the baseline and 0.23 below.
    const size = Math.min(w / 7.2, h / 0.86);
    const [x, y] = [w / 2, h / 2 + size * 0.18];
    const half = size * 0.5;
    const gap = half + size * 1.25;
    const [mid, rise] = [y - size * 0.24, size * 0.09];
    const wave =
      `M${n(x - half)} ${n(mid + rise * 0.4)} C${n(x - half * 0.6)} ${n(mid - rise * 1.6)} ${n(x - half * 0.2)} ${n(mid - rise)} ${n(x)} ${n(mid)} ` +
      `S${n(x + half * 0.6)} ${n(mid + rise * 1.6)} ${n(x + half)} ${n(mid - rise * 0.4)}`;
    render(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/>
      <g fill="#fff" font-family="${FONT}" font-size="${n(size)}"><text x="${n(x - gap)}" y="${n(y)}" text-anchor="end">1983</text><text x="${n(x + gap)}" y="${n(y)}">2026</text></g>
      <path d="${wave}" fill="none" stroke="#fff" stroke-width="${n(size * 0.1)}" stroke-linecap="round"/></svg>`,
      'mask-text.png',
    );
    magick(t('mask-text.png'), '-alpha', 'off', '-colorspace', 'gray', t('mask.png'));
    const d = Math.max(1, Math.round(size / 30));
    const stone = (brightness, name) =>
      magick(
        t('stone.png'),
        '-resize',
        `${w}x${h}^`,
        '-gravity',
        'center',
        '-extent',
        `${w}x${h}`,
        '-modulate',
        `${brightness},100`,
        t(name),
      );
    stone(100, 'floor.png');
    stone(62, 'dark.png');
    stone(140, 'light.png');
    // The walls: the part of each stroke its own copy shifted down and right leaves bare (the top and left, in shadow),
    // and the part its copy shifted up and left leaves bare (the bottom and right, lit).
    magick(t('mask.png'), '(', t('mask.png'), '-roll', `+${d}+${d}`, '-negate', ')', '-compose', 'Multiply', '-composite', t('shade.png'));
    magick(t('mask.png'), '(', t('mask.png'), '-roll', `-${d}-${d}`, '-negate', ')', '-compose', 'Multiply', '-composite', t('lit.png'));
    const through = (image, mask, name) => magick(t(image), t(mask), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', t(name));
    through('floor.png', 'mask.png', 'l-floor.png');
    through('dark.png', 'shade.png', 'l-shade.png');
    through('light.png', 'lit.png', 'l-lit.png');
    magick(t('mask.png'), '-morphology', 'Dilate', `Disk:${Math.max(1, Math.round(size / 26))}`, t('grown.png'));
    magick(
      '-size',
      `${w}x${h}`,
      'xc:#120303',
      t('grown.png'),
      '-alpha',
      'off',
      '-compose',
      'CopyOpacity',
      '-composite',
      t('l-outline.png'),
    );
    magick(
      t('l-outline.png'),
      t('l-floor.png'),
      '-compose',
      'Over',
      '-composite',
      t('l-shade.png'),
      '-compose',
      'Over',
      '-composite',
      t('l-lit.png'),
      '-compose',
      'Over',
      '-composite',
      out,
    );
  };

  // The logo: the title alone, on nothing. Steam is given a blank one (see above).
  render(titleSvg(1280).svg, 'logo.png');
  magick(t('logo.png'), write('promo', 'logo.png'));
  magick('-size', '1280x720', 'xc:none', steam('logo.png'));

  // The portrait capsule: the box, 2:3, its foot fading to dark under the years.
  carve(440, 64, t('years-capsule.png'));
  magick(
    [t('painting.png'), '-gravity', 'center', '-crop', '648x972+0+0', '+repage', '-resize', '600x900!', '-unsharp', '0x0.6+0.4+0'],
    ['-gravity', 'northwest', '(', '-size', '600x240', 'gradient:rgba(0,0,0,0)-rgba(6,1,1,0.96)', ')', '-geometry', '+0+660', '-composite'],
    [t('years-capsule.png'), '-geometry', '+80+816', '-composite', steam('capsule.png')],
  );

  /**
   * The wide capsule at `k` times its 920x430: the scene to the left fading into the dark, the title and the years to
   * the right, together in the middle of the height; written to `out`.
   */
  const wide = (k, out) => {
    const [width, height] = [920 * k, 430 * k];
    const title = titleSvg(430 * k);
    render(title.svg, 'wide-title.png');
    const [yearsW, yearsH, between] = [330 * k, 48 * k, 14 * k];
    const titleTop = Math.round((height - title.height - between - yearsH) / 2);
    carve(yearsW, yearsH, t('years-wide.png'));
    magick(
      t('scene.png'),
      '-resize',
      `x${height}`,
      '-alpha',
      'set',
      '-channel',
      'A',
      '-fx',
      `min(1, (w-1-i)/${90 * k})`,
      '+channel',
      t('wide-scene.png'),
    );
    magick(
      ['-size', `${height}x${width}`, 'gradient:#2a0a06-#050101', '-rotate', '270'],
      [t('wide-scene.png'), '-geometry', '+0+0', '-composite', t('wide-title.png'), '-geometry', `+${460 * k}+${titleTop}`, '-composite'],
      [t('years-wide.png'), '-geometry', `+${(460 + 215) * k - yearsW / 2}+${titleTop + title.height + between}`, '-composite'],
      ['-depth', '8', out],
    );
  };
  wide(1, steam('wide.png'));
  wide(2, jpeg(88, 'promo', 'banner.jpg'));

  // A shared link's picture: the wide capsule's scene, title and years, at the 1200x630 the sites show (their own crop
  // of the banner, a wider shape, would cut into the title).
  {
    const [width, height] = [1200, 630];
    const title = titleSvg(540);
    render(title.svg, 'share-title.png');
    const k = 540 / 430;
    const [yearsW, yearsH, between] = [Math.round(330 * k), Math.round(48 * k), Math.round(14 * k)];
    const titleTop = Math.round((height - title.height - between - yearsH) / 2);
    carve(yearsW, yearsH, t('years-share.png'));
    magick(
      t('scene.png'),
      '-resize',
      `x${height}`,
      '-alpha',
      'set',
      '-channel',
      'A',
      '-fx',
      'min(1, (w-1-i)/130)',
      '+channel',
      t('share-scene.png'),
    );
    magick(
      ['-size', `${height}x${width}`, 'gradient:#2a0a06-#050101', '-rotate', '270'],
      [
        t('share-scene.png'),
        '-geometry',
        '+0+0',
        '-composite',
        t('share-title.png'),
        '-geometry',
        `+${910 - 270}+${titleTop}`,
        '-composite',
      ],
      [t('years-share.png'), '-geometry', `+${910 - yearsW / 2}+${titleTop + title.height + between}`, '-composite'],
      jpeg(88, 'web', 'public', 'share.jpg'),
    );
  }

  // The hero: the demon cut out, on his glow.
  const gray = execFileSync('magick', [t('painting.png'), '-colorspace', 'gray', '-depth', '8', 'gray:-'], { maxBuffer: 1 << 24 });
  const s = HERO.scale;
  const left = 1920 - HERO.middle * s;
  const bottom = HERO.top + 1240 / s;
  const pt = ([x, y]) => `${n(x * s + left)} ${n((y - HERO.top) * s)}`;
  const cut = heroCut(gray, 669, pt, Math.ceil(bottom) + 4);
  const [w, h] = [Math.round(669 * s), Math.round(972 * s)];
  magick(t('painting.png'), '-filter', 'Lanczos', '-resize', `${w}x${h}!`, '-unsharp', '0x1+0.5+0', t('hero-painting.png'));
  // The title's underside shows along the hero's top edge between the wings: the dark just under it, mirrored, over it.
  const [patchX, patchY] = [Math.round(HERO_PATCH.left * s), Math.round(HERO.top * s)];
  const [patchW, patchH] = [Math.round((HERO_PATCH.right - HERO_PATCH.left) * s), HERO_PATCH.height];
  magick(
    t('hero-painting.png'),
    ['(', '+clone', '-crop', `${patchW}x${patchH}+${patchX}+${patchY + patchH}`, '+repage', '-flip', ')'],
    ['-geometry', `+${patchX}+${patchY}`, '-composite', t('hero-painting.png')],
  );
  // The glow: as U5's hero is lit (a broad light behind the picture, dying away to its edges), in the demon's colours.
  const [cx, cy, rx, ry] = [1920, 760, 1700, 1100];
  const stops = [
    [0, '#f0a030'],
    [0.22, '#a83010'],
    [0.34, '#6a1006'],
    [0.55, '#2a0504'],
    [0.8, '#0c0202'],
    [1, '#050101'],
  ];
  render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="1240">
    <defs>
      <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${rx}" gradientTransform="translate(${cx} ${cy}) scale(1 ${n(ry / rx)}) translate(${-cx} ${-cy})">
        ${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
      </radialGradient>
      <mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="3840" height="1240">
        <path d="${cut.outline}" fill="#fff"/>
        <g fill="none" stroke="#fff" stroke-width="${n(2.6 * s)}" stroke-linecap="round" stroke-linejoin="round">${cut.bones.map((d) => `<path d="${d}"/>`).join('')}</g>
      </mask>
    </defs>
    <rect width="3840" height="1240" fill="url(#glow)"/>
    <image x="${n(left)}" y="${n(-HERO.top * s)}" width="${w}" height="${h}" href="${uri('hero-painting.png')}" mask="url(#cut)"/>
    </svg>`,
    'hero.png',
  );
  magick(t('hero.png'), steam('hero.png'));
  // The boot screen: the hero's middle at the game's 5:3, the whole of its height.
  magick(
    t('hero.png'),
    '-gravity',
    'center',
    '-crop',
    '2067x1240+0+0',
    '+repage',
    '-filter',
    'Lanczos',
    '-resize',
    '1600x960!',
    jpeg(80, 'web', 'public', 'boot.jpg'),
  );
  console.log(`hero: eyes at y ${Math.round((HERO.eyes - HERO.top) * s)}, hands at y ${Math.round((HERO.hands - HERO.top) * s)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

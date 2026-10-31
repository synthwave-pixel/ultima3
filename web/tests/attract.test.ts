import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resourcesFromBundle, type Bundle } from '../src/data/resources.ts';
import {
  Attract,
  DemoPlayer,
  demoShape,
  fightSteps,
  roofPixels,
  ROOF_AIR,
  ROOF_ICE,
  ROOF_RIM,
  signatureStrokes,
  type AttractStage,
} from '../src/ui/attract.ts';
import { mainMenu, TITLE_MENU_FIRST_ROW } from '../src/game/menu.ts';
import { FakeIO, newWorld } from './helpers.ts';
import { Music, type MenuOption, type MenuPlacement } from '../src/game/io.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const { demo, signature } = resourcesFromBundle(
  JSON.parse(readFileSync(join(HERE, '..', 'public', 'data', 'resources.json'), 'utf8')) as Bundle,
);

/** A stage that records what it is asked, and has a press come at the `pressAt`th wait. */
function fakeStage(pressAt = Infinity): AttractStage & { log: string[]; waits: number } {
  const log: string[] = [];
  const stage = {
    log,
    waits: 0,
    border: (divided = false) => log.push(divided ? 'border divided' : 'border'),
    logo: (reveal: number) => log.push(`logo ${reveal === 1 ? 'whole' : 'part'}`),
    roof: () => log.push('roof'),
    dot: () => log.push('dot'),
    text: (text: string) => log.push(`text ${text}`),
    caption: (text: string) => log.push(`caption ${text}`),
    clearFight: () => log.push('clear'),
    tile: (index: number) => log.push(`tile ${index}`),
    lava: () => log.push('lava'),
    map: () => log.push('map'),
    animate: () => {},
    wait: async () => (++stage.waits >= pressAt ? true : false),
    sound: (name: string) => log.push(`sound ${name}`),
    blip: () => {},
    music: (track: number) => log.push(`music ${track}`),
    rest: () => false,
    listen: (on: boolean) => log.push(`listen ${on}`),
    settle: async () => {
      log.push('settle');
    },
    prepare: async () => {
      log.push('prepare');
    },
  };
  return stage;
}

describe('the attract demo', () => {
  it("starts from the script's own map, the ship on water", () => {
    const player = new DemoPlayer(demo);
    expect([...player.tiles.subarray(0, 8)]).toEqual([0x08, 0x08, 0x08, 0x06, 0x02, 0x02, 0x02, 0x02]);
    expect(player.tiles[62]).toBe(0x16); // the frigate
    expect(player.background[62]).toBe(0); // on water
    expect(player.background).toHaveLength(19 * 6);
  });

  it('plays steps: a change, a wait of its count, a change to terrain held back; round again after the last', () => {
    const script = new Uint8Array(1280);
    script.set([3, 255, 4], 0);
    script.set([0x28, 7, 0x02], 512);
    const player = new DemoPlayer(script);
    expect(player.step()).toBe(1);
    expect(player.tiles[3]).toBe(0x28);
    expect(player.step()).toBe(7);
    expect(player.step()).toBe(0);
    expect(player.tiles[4]).toBe(0x02);
    for (let i = 3; i < 512; i++) player.step();
    player.tiles[3] = 0;
    player.step();
    expect(player.tiles[3]).toBe(0x28);
  });

  it('draws fighter, cleric, wizard and thief as the party figures', () => {
    expect(demoShape(0x28)).toBe(0x80);
    expect(demoShape(0x2e)).toBe(0x86);
    expect(demoShape(0x2a)).toBe(0x82);
    expect(demoShape(0x30)).toBe(0x30);
    expect(demoShape(0x16)).toBe(0x16);
  });

  it('plays to the combat music, and lets a press go when one ends it', async () => {
    const stage = fakeStage(5);
    await new Attract(stage, demo, signature, ['credit']).demo();
    expect(stage.log.slice(0, 3)).toEqual(['prepare', `music ${Music.Combat}`, 'listen true']);
    expect(stage.log).toContain('border divided');
    expect(stage.log).toContain('caption ULTIMA III');
    expect(stage.log.slice(-2)).toEqual(['listen false', 'settle']);
  });

  it("lets Battery saver's rest end it", async () => {
    const stage = fakeStage();
    let frames = 0;
    stage.rest = () => ++frames >= 3;
    await new Attract(stage, demo, signature, []).demo();
    expect(frames).toBe(3);
  });
});

describe('the signature', () => {
  it('is pen strokes from the data, in the bounds of the picture it was made for', () => {
    const steps = signatureStrokes(signature);
    const dots = steps.flat();
    expect(steps.length).toBeGreaterThan(100);
    expect(steps[0][0]).toEqual([0, 0]);
    // A pen's move leaves two dots, the step and the half step to it.
    expect(steps.some((s) => s.length === 2)).toBe(true);
    const [xs, ys] = [dots.map((d) => d[0]), dots.map((d) => d[1])];
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-16);
    expect(Math.max(...xs)).toBeLessThanOrEqual(260);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-16);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
  });

  it('reads moves, a lift of the pen with signed bytes, and the end', () => {
    expect(signatureStrokes(Uint8Array.from([4, 8, 0xfe, 3, 6, 0xff, 4]))).toEqual([
      [
        [0, 0],
        [1, 0],
      ],
      [[2, 0]],
      [
        [-4, 6],
        [-4, 7],
      ],
      [[-4, 8]],
    ]);
  });
});

describe("the cave's roof", () => {
  it('is solid down to its lowest ice, with a rim one pixel wide along the edge that hangs', () => {
    // Three columns, four rows: a speck in the middle column's way, and depths of 1, 3 and 2.
    const X = true;
    const _ = false;
    const ice = [X, _, X, _, _, X, _, X, _, _, _, _];
    const [I, R, A] = [ROOF_ICE, ROOF_RIM, ROOF_AIR];
    expect([...roofPixels(ice, 3, 4)]).toEqual([R, I, I, A, R, R, A, R, A, A, A, A]);
  });
});

describe('the fight', () => {
  it('goes up to the dragon and back, up and back, and up to where it breathes', () => {
    const steps = fightSteps();
    expect(steps).toHaveLength(25 + 25 + 18 + 4);
    expect(steps[0].offset).toBe(-25);
    expect(steps[24].offset).toBe(23);
    expect(steps[25].offset).toBe(25);
    expect(steps.at(-1)!.offset).toBe(10);
    expect(new Set(steps.map((s) => s.frame))).toEqual(new Set([1, 2, 3]));
  });
});

describe("the dragon's breath", () => {
  it('is worked up clear of its square, behind it, and flies from the gap to the party', async () => {
    const stage = fakeStage();
    stage.rest = () => stage.log.includes('map');
    const frames: { index: number; x: number; size: number }[][] = [[]];
    stage.clearFight = () => frames.push([]);
    stage.tile = (index, _alt, x, _y, size = 2) => frames.at(-1)!.push({ index, x, size });
    await new Attract(stage, demo, signature, []).run();
    const [DRAGON, FIRE] = [29, 61];
    let worked = 0;
    let flown = 0;
    for (const frame of frames) {
      const dragon = frame.findIndex((t) => t.index === DRAGON);
      if (dragon < 0) continue;
      for (const [at, tile] of frame.entries()) {
        if (tile.index !== FIRE) continue;
        expect(tile.x + tile.size).toBeLessThanOrEqual(frame[dragon].x);
        if (at < dragon) worked++;
        else flown++;
        if (tile.size === 2) expect(at).toBeGreaterThan(dragon); // over the party, after it is drawn
      }
    }
    expect(worked).toBeGreaterThan(0);
    expect(flown).toBe(3);
  });
});

describe('the opening', () => {
  it("dissolves the logo in, signs, credits, fights with the set's own figures, burns the party and goes on to the demo", async () => {
    const stage = fakeStage();
    stage.rest = () => stage.log.includes('map');
    await new Attract(stage, demo, signature, ['the credit', 'and another']).run();
    const at = (entry: string) => stage.log.indexOf(entry);
    expect(at('border')).toBeGreaterThan(-1);
    expect(at('logo part')).toBeGreaterThan(at('roof'));
    expect(at('logo whole')).toBeGreaterThan(at('logo part'));
    expect(at('text by')).toBeGreaterThan(at('logo whole'));
    expect(at('dot')).toBeGreaterThan(at('text by'));
    expect(at('caption the credit')).toBeGreaterThan(at('dot'));
    expect(at('caption and another')).toBeGreaterThan(at('dot'));
    expect(stage.log.lastIndexOf('tile 29')).toBeGreaterThan(at('caption the credit'));
    expect(at('sound Immolate')).toBeGreaterThan(at('caption the credit'));
    expect(stage.log.filter((e) => e === 'lava')).toHaveLength(4);
    expect(at('border divided')).toBeGreaterThan(at('sound Immolate'));
    // No big "Ultima III" picture, and the party is gone once it has burned.
    expect(stage.log.slice(at('sound Immolate')).filter((e) => /^tile (64|65|66|67)$/.test(e))).toHaveLength(0);
  });

  it('goes straight to the title on a press, the demo skipped, the sound stopped and the press let go', async () => {
    for (const pressAt of [1, 5, 60, 150]) {
      const stage = fakeStage(pressAt);
      await new Attract(stage, demo, signature, []).run();
      expect(stage.log).not.toContain('border divided');
      expect(stage.log).not.toContain('map');
      expect(stage.log.slice(-2)).toEqual(['listen false', 'settle']);
      expect(stage.log).toContain(`music ${Music.Combat}`);
    }
  });
});

describe('the title menu', () => {
  it('fades to the exploration music after the sequence, and after the demo and the game', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const heard: number[] = [];
    io.fadeMusic = (track: number) => void heard.push(track);
    let menus = 0;
    io.chooseFromList = async () => {
      if (++menus === 1) return 'R';
      throw new Error('stop');
    };
    await mainMenu(world, io, async () => {}, { attract: { run: async () => {}, demo: async () => {} } }).catch(() => {});
    expect(heard).toEqual([Music.Sosaria, Music.Sosaria]);
  });

  it('runs the sequence once, first, and offers the demo again, which plays it alone', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const calls: string[] = [];
    let menus = 0;
    let listed: string[] = [];
    io.chooseFromList = async (options: MenuOption[]) => {
      listed = options.map((o) => o.label);
      calls.push('menu');
      if (++menus === 1) return 'R';
      if (menus === 2) return 'X';
      throw new Error('stop');
    };
    await mainMenu(world, io, async () => {}, {
      attract: {
        run: async () => void calls.push('run'),
        demo: async () => void calls.push('demo'),
      },
    }).catch(() => {});
    expect(calls).toEqual(['run', 'menu', 'demo', 'menu', 'menu']);
    expect(listed).toContain('Return to the view');
  });

  it('keeps the tagline clear with the longest list, the copyright giving way; shorter, the copyright stays', async () => {
    const world = newWorld();
    const attract = { run: async () => {}, demo: async () => {} };
    const row = async (options: Parameters<typeof mainMenu>[3]) => {
      const io = new FakeIO(world.resources);
      let at = 0;
      let lines = 0;
      io.chooseFromList = async (list: MenuOption[], place?: MenuPlacement) => {
        at = place!.row;
        lines = list.length;
        throw new Error('stop');
      };
      await mainMenu(world, io, async () => {}, options).catch(() => {});
      return { at, lines, copyright: io.output.includes('Lord British') };
    };
    const update = { ready: () => true, apply: () => {}, label: () => 'Update (1.0.45)' };
    const transfer = {
      export: () => null,
      import: () => null,
      clipboard: { write: async () => {}, read: async () => '' },
      file: { save: async () => {}, load: async () => '' },
    };
    const longest = await row({ attract, update, transfer, quit: () => {} });
    expect(longest.at).toBe(TITLE_MENU_FIRST_ROW);
    expect(longest.copyright).toBe(false);
    const shorter = await row({ attract, transfer, quit: () => {} });
    expect(shorter.copyright).toBe(true);
    expect(shorter.at + shorter.lines + 1).toBeLessThanOrEqual(21);
  });
});

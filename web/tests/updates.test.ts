import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { isNewer, isRelease, newerRelease, within, RELEASES_PAGE } from '../src/ui/updates.ts';
import { mainMenu } from '../src/game/menu.ts';
import { FakeIO, newWorld } from './helpers.ts';
import type { MenuOption } from '../src/game/io.ts';

const desktop = createRequire(import.meta.url)('../../desktop/updates.cjs') as {
  shouldCheck: (o: { packaged: boolean; env: Record<string, string>; argv: string[]; version: string; gamescope: boolean }) => boolean;
  isNewer: (latest: string, current: string) => boolean;
  newerRelease: (current: string, get: unknown, api?: string) => Promise<{ version: string; url: string } | null>;
};

/** A fetch that answers with `body` (or fails with `status`). */
const answer =
  (body: unknown, status = 200) =>
  async () =>
    ({ ok: status === 200, status, json: async () => body }) as Response;

describe('release updates', () => {
  it('compare released versions only, the page and the desktop app alike', () => {
    for (const newer of [isNewer, desktop.isNewer]) {
      expect(newer('1.0.45', '1.0.39')).toBe(true);
      expect(newer('v1.0.45', '1.0.39')).toBe(true);
      expect(newer('1.1.0', '1.0.99')).toBe(true);
      expect(newer('1.0.39', '1.0.39')).toBe(false);
      expect(newer('1.0.10', '1.0.9')).toBe(true); // by number, not by letter
      expect(newer('1.0.38', '1.0.39')).toBe(false);
      expect(newer('1.0.45', '1.0.0-dev.20261010.1200')).toBe(false); // a development build is never told
      expect(newer('', '1.0.39')).toBe(false);
    }
    expect(isRelease('1.0.39')).toBe(true);
    expect(isRelease('1.0.0-dev.20261010.1200')).toBe(false);
    expect(isRelease(undefined)).toBe(false);
  });

  it("offer GitHub's newest release where it is newer, with its page, and nothing on any failure", async () => {
    const latest = { tag_name: 'v1.0.45', html_url: 'https://github.com/synthwave-pixel/ultima3/releases/tag/v1.0.45' };
    for (const ask of [
      (get: unknown) => newerRelease('1.0.39', get as typeof fetch),
      (get: unknown) => desktop.newerRelease('1.0.39', get, 'test'),
    ]) {
      expect(await ask(answer(latest))).toEqual({ version: '1.0.45', url: latest.html_url });
      expect(await ask(answer({ ...latest, tag_name: 'v1.0.39' }))).toBeNull();
      expect(await ask(answer({ ...latest, html_url: 'https://elsewhere.example/' }))).toEqual({ version: '1.0.45', url: RELEASES_PAGE });
      expect(await ask(answer({}, 403))).toBeNull();
      expect(
        await ask(async () => {
          throw new Error('offline');
        }),
      ).toBeNull();
    }
  });

  it('are looked for only by a released copy outside the Flatpak and Game Mode', () => {
    const base = { packaged: true, env: {}, argv: [], version: '1.0.39', gamescope: false };
    expect(desktop.shouldCheck(base)).toBe(true);
    expect(desktop.shouldCheck({ ...base, packaged: false })).toBe(false);
    expect(desktop.shouldCheck({ ...base, env: { FLATPAK_ID: 'io.github.synthwave_pixel.ultima3' } })).toBe(false);
    expect(desktop.shouldCheck({ ...base, gamescope: true })).toBe(false);
    expect(desktop.shouldCheck({ ...base, argv: ['--no-update-check'] })).toBe(false);
    expect(desktop.shouldCheck({ ...base, version: '1.0.0-dev.20261010.1200' })).toBe(false);
  });

  it('do not hold the title up for a slow answer', async () => {
    expect(await within(new Promise<string>(() => {}), 10, 'none')).toBe('none');
    expect(await within(Promise.resolve('1.0.45'), 1000, 'none')).toBe('1.0.45');
  });

  it("show on the title menu as the app's own line, which opens the release", async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    let listed: string[] = [];
    io.chooseFromList = async (options: MenuOption[]) => {
      listed = options.map((o) => o.label);
      return 'U';
    };
    let opened = 0;
    await mainMenu(world, io, async () => {}, {
      update: {
        ready: () => true,
        label: () => 'Update (1.0.45)',
        apply: () => {
          opened++;
          throw new Error('stop'); // the page is open; nothing more to see
        },
      },
    }).catch(() => {});
    expect(listed).toContain('Update (1.0.45)');
    expect(opened).toBe(1);
  });

  it('are told of once a version, in a box of their own before the title menu', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    const menus: string[][] = [];
    const answers = ['L', 'U'];
    io.chooseFromList = async (options: MenuOption[]) => {
      menus.push(options.map((o) => o.label));
      return answers.shift() ?? 'U';
    };
    let told = 0;
    let due = true;
    let opened = 0;
    await mainMenu(world, io, async () => {}, {
      update: {
        ready: () => true,
        label: () => 'Update (1.0.45)',
        apply: () => {
          opened++;
          throw new Error('stop');
        },
        news: {
          version: '1.0.45',
          due: () => due,
          told: () => {
            told++;
            due = false;
          },
        },
      },
    }).catch(() => {});
    // Later in the box: the title menu next, its Update line still there; the box is not shown again.
    expect(menus[0]).toEqual(['Open release page', 'Later']);
    expect(menus.slice(1).every((m) => !m.includes('Later') && m.includes('Update (1.0.45)'))).toBe(true);
    expect(io.output).toContain('Ultima III 1.0.45 is out');
    expect(told).toBe(1);
    expect(opened).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { androidUpdates, desktopUpdates, isNewer, isRelease, newerRelease, webUpdates, RELEASES_PAGE } from '../src/ui/updates.ts';
import type { DesktopUpdates, UpdateHook, UpdateOffer } from '../src/ui/updates.ts';
import { inPlayNotice, inPlayWay, updateBoxText, wrapWords } from '../src/game/updateOffer.ts';
import { mainMenu } from '../src/game/menu.ts';
import { Game } from '../src/game/game.ts';
import { FakeIO, newWorld } from './helpers.ts';
import type { MenuOption, MenuPlacement } from '../src/game/io.ts';

/** A fetch that answers with `body` (or fails with `status`). */
const answer =
  (body: unknown, status = 200) =>
  async () =>
    ({ ok: status === 200, status, json: async () => body }) as Response;

/** A hook offering `offer`, counting what was asked of it. */
function hook(offer: UpdateOffer | null, extra: Partial<UpdateHook> = {}) {
  const calls = { applied: 0, told: 0 };
  let now = offer;
  const update: UpdateHook = {
    offer: () => now,
    apply: () => void calls.applied++,
    told: () => {
      calls.told++;
      if (now) now = { ...now, told: true };
    },
    ...extra,
  };
  return { update, calls };
}

/** The title menu, answered from `answers` (then a stop), with every list's labels and title kept. */
async function title(update: UpdateHook, answers: string[]) {
  const world = newWorld();
  const io = new FakeIO(world.resources);
  const menus: { title?: string; labels: string[] }[] = [];
  io.chooseFromList = async (options: MenuOption[], place?: MenuPlacement) => {
    menus.push({ title: place?.title, labels: options.map((o) => o.label) });
    const next = answers.shift();
    if (next === undefined) throw new Error('stop');
    return next;
  };
  await mainMenu(world, io, async () => {}, { update }).catch((e: unknown) => {
    if (!(e instanceof Error && e.message === 'stop')) throw e;
  });
  return { menus, output: io.output, said: io.output.replace(/\s+/g, ' ') };
}

describe('release updates', () => {
  it('compare released versions only', () => {
    expect(isNewer('1.0.45', '1.0.39')).toBe(true);
    expect(isNewer('v1.0.45', '1.0.39')).toBe(true);
    expect(isNewer('1.1.0', '1.0.99')).toBe(true);
    expect(isNewer('1.0.39', '1.0.39')).toBe(false);
    expect(isNewer('1.0.10', '1.0.9')).toBe(true); // by number, not by letter
    expect(isNewer('1.0.38', '1.0.39')).toBe(false);
    expect(isNewer('1.0.45', '1.0.0-dev.20261010.1200')).toBe(false); // a development build is never told
    expect(isNewer('', '1.0.39')).toBe(false);
    expect(isRelease('1.0.39')).toBe(true);
    expect(isRelease('1.0.0-dev.20261010.1200')).toBe(false);
    expect(isRelease(undefined)).toBe(false);
  });

  it("offer GitHub's newest release where it is newer, with its page, and nothing on any failure", async () => {
    const latest = { tag_name: 'v1.0.45', html_url: 'https://github.com/synthwave-pixel/ultima3/releases/tag/v1.0.45' };
    const ask = (get: unknown) => newerRelease('1.0.39', get as typeof fetch);
    expect(await ask(answer(latest))).toEqual({ version: '1.0.45', url: latest.html_url });
    expect(await ask(answer({ ...latest, tag_name: 'v1.0.39' }))).toBeNull();
    expect(await ask(answer({ ...latest, html_url: 'https://elsewhere.example/' }))).toEqual({ version: '1.0.45', url: RELEASES_PAGE });
    expect(await ask(answer({}, 403))).toBeNull();
    expect(
      await ask(async () => {
        throw new Error('offline');
      }),
    ).toBeNull();
  });

  it("keep the desktop app's offer as its main process tells it, and tell it back", async () => {
    let listener: (o: UpdateOffer | null) => void = () => {};
    const asked = { applied: 0, told: 0, newsSeen: 0 };
    const bridge: DesktopUpdates = {
      offer: async () => null,
      apply: async () => void asked.applied++,
      told: async () => void asked.told++,
      onChange: (l) => void (listener = l),
      news: async () => ({ version: '1.0.90', from: '1.0.86' }),
      newsSeen: async () => void asked.newsSeen++,
      notes: async (v) => `notes of ${v}`,
    };
    const update = desktopUpdates(bridge);
    await new Promise((r) => setTimeout(r, 0));
    expect(update.offer()).toBeNull();
    expect(update.news?.()).toEqual({ version: '1.0.90', from: '1.0.86' });
    listener({ kind: 'restart', version: '1.0.91', current: '1.0.90', told: false });
    expect(update.offer()?.version).toBe('1.0.91');
    update.told();
    expect(update.offer()?.told).toBe(true);
    update.apply();
    update.newsSeen?.();
    expect(update.news?.()).toBeNull();
    expect(await update.notes?.('1.0.90')).toBe('notes of 1.0.90');
    expect(asked).toEqual({ applied: 1, told: 1, newsSeen: 1 });
  });

  it("tell the Android app's player of each newer release once, and open its page", async () => {
    let kept: string | null = null;
    const opened: string[] = [];
    const make = () =>
      androidUpdates({
        release: Promise.resolve({ version: '1.0.45', url: 'https://github.com/synthwave-pixel/ultima3/releases/tag/v1.0.45' }),
        open: (url) => void opened.push(url),
        told: { get: () => kept, set: (v) => void (kept = v) },
      });
    const first = make();
    await new Promise((r) => setTimeout(r, 0));
    expect(first.offer()).toEqual({ kind: 'release', version: '1.0.45', told: false });
    first.told();
    expect(kept).toBe('1.0.45');
    first.apply();
    expect(opened).toEqual(['https://github.com/synthwave-pixel/ultima3/releases/tag/v1.0.45']);
    const again = make();
    await new Promise((r) => setTimeout(r, 0));
    expect(again.offer()?.told).toBe(true);
  });

  it("show the web's new build as the title menu's Update: restart, with no box", async () => {
    let restarted = 0;
    const { menus } = await title(
      webUpdates(
        () => true,
        () => void restarted++,
      ),
      ['U'],
    );
    expect(menus[0].labels).toContain('Update: restart');
    expect(menus[0].title).not.toBe('Update available');
    expect(restarted).toBe(1);
  });

  it('are told of once a version, in a box of their own before the title menu, then on its Update line', async () => {
    const { update, calls } = hook({ kind: 'release', version: '1.0.45', current: '1.0.39', told: false });
    const { menus, said } = await title(update, ['L', 'U']);
    // Later in the box: the title menu next, its Update line still there; the box is not shown again.
    expect(menus[0]).toEqual({ title: 'Update available', labels: ['Open release page', 'Later'] });
    expect(menus[1].labels).toContain('Update (1.0.45)');
    expect(said).toContain('Ultima III 1.0.45 is out; this is 1.0.39.');
    expect(calls).toEqual({ told: 1, applied: 1 });
  });

  it('offer the restart into a build come down, or only say it where nothing may be taken up', async () => {
    const ready = hook({ kind: 'restart', version: '1.0.45', current: '1.0.39', told: false });
    expect((await title(ready.update, ['O'])).menus[0]).toEqual({ title: 'Update ready', labels: ['Restart now', 'Later'] });
    expect(ready.calls.applied).toBe(1);
    // Launched by Steam: installed as the game quits, never restarted into. The menu's line says so again.
    const steam = hook({ kind: 'restart', onQuit: true, version: '1.0.45', current: '1.0.39', told: false });
    const seen = await title(steam.update, ['L', 'U', 'L']);
    expect(seen.menus.map((m) => m.title)).toEqual(['Update ready', 'OPTIONS:', 'Update ready', 'OPTIONS:']);
    expect(seen.menus[0].labels).toEqual(['OK']);
    expect(seen.said).toContain('It installs when the game quits.');
    expect(steam.calls.applied).toBe(0);
    // The Flatpak's under Game Mode: installed, and only a quit.
    expect(updateBoxText({ kind: 'restart', installed: true, quits: true, version: '1.0.45', told: false }).go).toBe('Quit now');
  });

  it('under Game Mode offer no page, only the way to the release, worded by why the Flatpak could not update', async () => {
    const { update, calls } = hook({ kind: 'release', version: '1.0.45', current: '1.0.39', told: false, page: false, why: 'approve' });
    const { menus, said } = await title(update, ['L', 'U', 'L']);
    expect(menus[0].labels).toEqual(['OK']);
    expect(menus[2].labels).toEqual(['OK']); // the menu's line shows the box again
    expect(said).toContain('Start the game once in Desktop Mode');
    expect(calls.applied).toBe(0);
    const words = updateBoxText({ kind: 'release', version: '1.0.45', told: false, page: false }).text;
    expect(words).toContain('from Discover');
  });

  it("say the first start after an update once, with What's new from the release's notes", async () => {
    let news: { version: string; from: string } | null = { version: '1.0.90', from: '1.0.86' };
    const { update } = hook(null, {
      news: () => news,
      newsSeen: () => void (news = null),
      notes: async () => 'Menus\n\n- One\n- Two',
    });
    const { menus, output, said } = await title(update, ['W']);
    expect(menus[0]).toEqual({ title: 'Updated', labels: ["What's new", 'OK'] });
    expect(said).toContain('Updated to Ultima III 1.0.90, from 1.0.86.');
    expect(output).toContain("[What's new in 1.0.90]\nMenus\n\n- One\n- Two");
    expect(menus[1].title).toBe('OPTIONS:'); // said once: the title's menu next
    // Offline, the notes are not to be had: the way to them said instead.
    news = { version: '1.0.90', from: '1.0.86' };
    const offline = hook(null, { news: () => news, newsSeen: () => void (news = null), notes: async () => null });
    expect((await title(offline.update, ['W'])).said).toContain('They are on the game');
  });

  it('say a build come down while playing in the message area, once, before the turn', async () => {
    const world = newWorld();
    const io = new FakeIO(world.resources);
    io.keys.push(' ', ' ', 'Q');
    const { update, calls } = hook({ kind: 'restart', installed: true, version: '1.0.100', current: '1.0.90', told: false });
    await new Game(world, io, { update }).run();
    const said = io.output.replace(/\s+/g, ' ');
    expect(said.split('Ultima III 1.0.100 is installed: it starts the next time you play.')).toHaveLength(2);
    expect(calls).toEqual({ told: 1, applied: 0 });
    for (const line of wrapWords(inPlayNotice({ kind: 'restart', version: '1.0.100', told: false })!, 16))
      expect(line.length).toBeLessThanOrEqual(16);
    // A release out is left for the title; the web's build has no version to say.
    expect(inPlayNotice({ kind: 'release', version: '1.0.100', told: false })).toBeNull();
    expect(inPlayNotice({ kind: 'restart', told: false })).toBeNull();
  });

  it('keep a way to it on the Pause menu, never a restart out of the game in play', () => {
    expect(inPlayWay({ kind: 'restart', version: '1.0.45', told: true })).toContain('Quit and save');
    expect(inPlayWay({ kind: 'restart', installed: true, version: '1.0.45', told: true })).toContain('Quit and save');
    expect(inPlayWay({ kind: 'restart', onQuit: true, version: '1.0.45', told: true })).toContain('installs when the game quits');
    expect(inPlayWay({ kind: 'release', version: '1.0.45', told: true, page: false })).toContain('Desktop Mode');
    expect(inPlayWay({ kind: 'release', version: '1.0.45', told: true })).toBeNull(); // its page opened
  });
});

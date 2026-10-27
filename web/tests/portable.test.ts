import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { portableData, DATA } = createRequire(import.meta.url)(
  '../../desktop/portable.cjs',
) as typeof import('../../desktop/portable.d.cts');

describe("the Windows portable .exe's data (desktop/portable.cjs)", () => {
  let root = '';
  let old = '';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'u3-portable-'));
    old = join(root, 'AppData', 'Ultima III');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  /** An earlier run's AppData folder: the save in the page's storage, the window's place, and Chromium's leavings. */
  const earlierRun = () => {
    mkdirSync(join(old, 'Local Storage', 'leveldb'), { recursive: true });
    writeFileSync(join(old, 'Local Storage', 'leveldb', '000003.log'), 'the save');
    writeFileSync(join(old, 'window.json'), '{"fullScreen":false}');
    for (const dir of ['Cache', 'Code Cache', 'GPUCache', 'Crashpad']) mkdirSync(join(old, dir));
    writeFileSync(join(old, 'SingletonLock'), '');
  };

  it('is only for the portable .exe: the installed copy, macOS and Linux keep the usual place', () => {
    expect(portableData({ env: {}, old })).toBeNull();
    expect(portableData({ env: { PORTABLE_EXECUTABLE_DIR: '' }, old })).toBeNull();
  });

  it('is "Ultima III Data" beside the .exe, filled once from an earlier run, less the caches', () => {
    earlierRun();
    const usb = join(root, 'USB');
    mkdirSync(usb);
    const data = portableData({ env: { PORTABLE_EXECUTABLE_DIR: usb }, old });
    expect(DATA).toBe('Ultima III Data');
    expect(data).toBe(join(usb, DATA));
    expect(readFileSync(join(data!, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe('the save');
    expect(readFileSync(join(data!, 'window.json'), 'utf8')).toBe('{"fullScreen":false}');
    for (const gone of ['Cache', 'Code Cache', 'GPUCache', 'Crashpad', 'SingletonLock']) expect(existsSync(join(data!, gone))).toBe(false);
    expect(existsSync(join(old, 'window.json'))).toBe(true); // copied, not moved: an installed copy may share it
    expect(existsSync(`${data}.part`)).toBe(false);

    // Later runs leave the folder alone: its own saves are never overwritten.
    writeFileSync(join(data!, 'window.json'), '{"fullScreen":true}');
    expect(portableData({ env: { PORTABLE_EXECUTABLE_DIR: usb }, old })).toBe(data);
    expect(readFileSync(join(data!, 'window.json'), 'utf8')).toBe('{"fullScreen":true}');
  });

  it('starts empty when there was no earlier run, and clears a copy cut short', () => {
    const usb = join(root, 'USB');
    mkdirSync(join(usb, `${DATA}.part`), { recursive: true });
    writeFileSync(join(usb, `${DATA}.part`, 'half.log'), 'half');
    const data = portableData({ env: { PORTABLE_EXECUTABLE_DIR: usb }, old });
    expect(data).toBe(join(usb, DATA));
    expect(existsSync(join(data!, 'half.log'))).toBe(false);
  });

  it('falls back to the usual place where the folder beside the .exe cannot be made', () => {
    const notADir = join(root, 'a file');
    writeFileSync(notADir, '');
    expect(portableData({ env: { PORTABLE_EXECUTABLE_DIR: notADir }, old })).toBeNull();
  });
});

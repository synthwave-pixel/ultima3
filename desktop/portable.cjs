// The Windows portable .exe keeps everything beside itself (main.cjs), as the Ultima V port's does. electron-builder's
// portable target unpacks the app to a temporary folder and runs it from there, telling it the .exe's own folder in
// PORTABLE_EXECUTABLE_DIR; left alone, Electron would keep the save, the window's place and the rest in
// AppData\Roaming\Ultima III like the installed copy. Instead they go in "Ultima III Data" next to the .exe, so the
// game moves with it (a USB stick, a games folder).
// A portable copy that ran before this kept its data in AppData: the first time, that is copied over (not moved, as an
// installed copy may share it), less Chromium's caches. A folder beside the .exe that cannot be written (a read-only
// stick, Program Files) leaves the data where Electron would keep it.
const { cpSync, existsSync, mkdirSync, renameSync, rmSync } = require('node:fs');
const { basename, join } = require('node:path');

const DATA = 'Ultima III Data';

/** Chromium's own throwaway files: caches, crash reports, the running instance's locks. */
const throwaway = (name) => /cache/i.test(name) || name === 'Crashpad' || name.startsWith('Singleton') || name === 'lockfile';

/**
 * The folder the portable .exe's data goes in, made (and filled from `old` the first time) if need be; null when this
 * is not the portable .exe, or the folder beside it cannot be written.
 */
function portableData({ env, old }) {
  const dir = env.PORTABLE_EXECUTABLE_DIR;
  if (!dir) return null;
  const data = join(dir, DATA);
  try {
    if (existsSync(data)) return data;
    // Copied to a folder of its own and renamed into place, so a copy cut short is never taken for the data.
    const part = `${data}.part`;
    rmSync(part, { recursive: true, force: true });
    if (old && existsSync(old)) cpSync(old, part, { recursive: true, filter: (src) => src === old || !throwaway(basename(src)) });
    else mkdirSync(part);
    renameSync(part, data);
    return data;
  } catch (e) {
    console.warn(`portable data beside the .exe unavailable (${e.message}); using ${old}`);
    return null;
  }
}

module.exports = { DATA, portableData };

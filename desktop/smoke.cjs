// Launches the app with a screenshot flag and exits with its status: 0 when the game is running. A copy of the app
// already running would take the launch over (the single-instance lock) and the launch quit at once with 0, so the
// screenshot is removed first and its absence afterwards is a failure.
const { spawnSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const electron = require('electron');
const shot = process.argv[2] ?? join(__dirname, 'smoke.png');
// ELECTRON_NO_SANDBOX=1 for a root container (never for users).
const extra = process.env.ELECTRON_NO_SANDBOX ? ['--no-sandbox'] : [];
rmSync(shot, { force: true });
const r = spawnSync(electron, ['.', '--windowed', ...extra], { cwd: __dirname, stdio: 'inherit', env: { ...process.env, ULTIMA3_SMOKE: shot } });
if (r.status === 0 && !existsSync(shot)) {
  console.error('smoke: no screenshot taken (is another copy of the app running?)');
  process.exit(1);
}
process.exit(r.status ?? 1);

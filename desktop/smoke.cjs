// Launches the app with a screenshot flag and exits with its status: 0 when the game is running.
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const electron = require('electron');
const shot = process.argv[2] ?? join(__dirname, 'smoke.png');
// ELECTRON_NO_SANDBOX=1 for a root container (never for users).
const extra = process.env.ELECTRON_NO_SANDBOX ? ['--no-sandbox'] : [];
const r = spawnSync(electron, ['.', '--windowed', ...extra], { cwd: __dirname, stdio: 'inherit', env: { ...process.env, ULTIMA3_SMOKE: shot } });
process.exit(r.status ?? 1);

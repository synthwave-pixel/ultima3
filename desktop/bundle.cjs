// Builds the game with relative asset paths and copies it into app/, the folder the desktop app loads.
// Run before `npm start` or `npm run dist`.
const { execSync } = require('node:child_process');
const { cpSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const web = join(__dirname, '..', 'web');
let build = 'dev';
try {
  build = execSync('git rev-parse --short HEAD', { cwd: web }).toString().trim();
} catch {
  /* not a checkout */
}
execSync('npm run build', { cwd: web, stdio: 'inherit', env: { ...process.env, VITE_BASE: './', VITE_BUILD: process.env.VITE_BUILD || build } });
const app = join(__dirname, 'app');
if (existsSync(app)) rmSync(app, { recursive: true });
cpSync(join(web, 'dist'), app, { recursive: true });
// The service worker is for browsers; the app has no use for it.
for (const f of ['sw.js', 'registerSW.js']) if (existsSync(join(app, f))) rmSync(join(app, f));
for (const f of require('node:fs').readdirSync(app)) if (/^workbox-.*\.js$/.test(f)) rmSync(join(app, f));
console.log('bundled web/dist into desktop/app');

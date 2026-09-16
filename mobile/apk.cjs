// Builds the release APK at the build's version (see ../desktop/version.cjs) into dist/Ultima-III-<version>-android.apk.
// Run `npm run bundle` and `npx cap sync android` first.
const { execFileSync } = require("node:child_process");
const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { buildVersion, buildCode } = require("../desktop/version.cjs");
const version = buildVersion();
const code = buildCode();
console.log(`building version ${version} (${code})`);
const android = join(__dirname, "android");
execFileSync(
  process.platform === "win32" ? "gradlew.bat" : "./gradlew",
  [
    "assembleRelease",
    "--no-daemon",
    `-PversionName=${version}`,
    `-PversionCode=${code}`,
  ],
  { stdio: "inherit", cwd: android, shell: process.platform === "win32" },
);
const dist = join(__dirname, "dist");
mkdirSync(dist, { recursive: true });
const out = join(dist, `Ultima-III-${version}-android.apk`);
copyFileSync(
  join(android, "app", "build", "outputs", "apk", "release", "app-release.apk"),
  out,
);
console.log(out);

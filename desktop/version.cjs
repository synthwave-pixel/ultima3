// The version every build carries, decided in one place for the desktop app, the Android app and the workflow:
//   BUILD_VERSION, when set, verbatim;
//   in GitHub Actions, the major.minor of package.json here with the run number as the patch (1.0.37);
//   anywhere else, a timestamped pre-release of that series (1.0.0-dev.20260915.2214, UTC).
// A new series starts by changing major.minor in package.json. `node version.cjs` prints the version.
const { version } = require("./package.json");
const series = version.split(".").slice(0, 2).join(".");

function buildVersion() {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION;
  if (process.env.GITHUB_RUN_NUMBER)
    return `${series}.${process.env.GITHUB_RUN_NUMBER}`;
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const day = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  return `${series}.0-dev.${day}.${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/**
 * Android's integer version code, which must rise for one build to install over another: the run number in
 * Actions; for a local build, minutes since 2024, so a developer's APK installs over any release (going back to a
 * release after that means uninstalling first).
 */
function buildCode() {
  if (process.env.GITHUB_RUN_NUMBER)
    return Number(process.env.GITHUB_RUN_NUMBER);
  return Math.floor((Date.now() - Date.UTC(2024, 0, 1)) / 60000);
}

module.exports = { buildVersion, buildCode, series };
if (require.main === module) console.log(buildVersion());

// Builds installers with electron-builder at the build's version (see version.cjs), which is passed as metadata so
// package.json is never edited. Arguments go through: node dist.cjs --linux
// electron-builder's CLI runs under this node directly: on Windows `npx` is a .cmd shim that spawnSync cannot run.
// Nothing is published from here (--publish never): the release job publishes, but the publish settings in
// package.json still have electron-builder write the latest*.yml files and blockmaps electron-updater reads.
const { execFileSync } = require("node:child_process");
const { rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { buildVersion } = require("./version.cjs");
const { writeMetainfo } = require("./metainfo.cjs");
const { macBuildConfig } = require("./macSigning.cjs");
const version = buildVersion();
console.log(`building version ${version}`);
// The Flatpak's AppStream metainfo at this version (metainfo.cjs), for flatpak.files to put in.
writeMetainfo(version);
// A Mac build's settings go in a file of their own, signed with the Developer ID certificate where the build has one
// (macSigning.cjs), its version among them; other builds take package.json's, the version given on the command line.
const args = process.argv.slice(2);
const mac = args.includes("--mac") || (process.platform === "darwin" && !args.some((a) => ["--linux", "--win"].includes(a)));
const macConfig = join(__dirname, ".mac-build.json");
if (mac) writeFileSync(macConfig, JSON.stringify(macBuildConfig(require("./package.json").build, process.env, version)));
try {
  execFileSync(
    process.execPath,
    [
      require.resolve("electron-builder/cli.js"),
      ...args,
      "--publish",
      "never",
      ...(mac ? ["--config", macConfig] : [`--config.extraMetadata.version=${version}`]),
    ],
    { stdio: "inherit", cwd: __dirname },
  );
} finally {
  if (mac) rmSync(macConfig, { force: true });
}

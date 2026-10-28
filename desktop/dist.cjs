// Builds installers with electron-builder at the build's version (see version.cjs), which is passed as metadata so
// package.json is never edited. Arguments go through: node dist.cjs --linux
// electron-builder's CLI runs under this node directly: on Windows `npx` is a .cmd shim that spawnSync cannot run.
const { execFileSync } = require("node:child_process");
const { buildVersion } = require("./version.cjs");
const { writeMetainfo } = require("./metainfo.cjs");
const version = buildVersion();
console.log(`building version ${version}`);
// The Flatpak's AppStream metainfo at this version (metainfo.cjs), for flatpak.files to put in.
writeMetainfo(version);
execFileSync(
  process.execPath,
  [
    require.resolve("electron-builder/cli.js"),
    ...process.argv.slice(2),
    "--publish",
    "never",
    `--config.extraMetadata.version=${version}`,
  ],
  { stdio: "inherit", cwd: __dirname },
);

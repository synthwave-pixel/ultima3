// The AppStream metainfo the Flatpak carries (dist.cjs writes it before each build, for electron-builder's
// flatpak.files to put in /share/metainfo), as the Ultima V port's does: what Discover and GNOME Software show of the
// game - its name, summary, description and screenshot, and the version installed and offered as an update. Without
// it they named the Flatpak's branch, "master", where the version goes.
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const ID = "com.synthwavepixel.ultima3";
const SITE = "https://synthwave-pixel.github.io/ultima3/";
const REPO = "https://github.com/synthwave-pixel/ultima3";

/** The metainfo for `version`, released on `date` (YYYY-MM-DD). */
function metainfo(version, date) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${ID}</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <name>Ultima III</name>
  <summary>A modernized port of Ultima III: Exodus</summary>
  <developer id="io.github.synthwave-pixel">
    <name>synthwave-pixel</name>
  </developer>
  <description>
    <p>The 1983 role-playing game Ultima III: Exodus, rebuilt from LairWare's Macintosh port. Play it close to the original in any of its period looks - the Apple II, the Commodore 64, the NES, the PC's CGA to VGA, the Ultima V look and the Macintosh - or in the Standard experience, with new art and sound.</p>
    <p>Play it with a controller, a keyboard or a touch screen, with a map of Sosaria as the party has seen it, a journal of the quest, tips, and settings to tweak.</p>
  </description>
  <launchable type="desktop-id">${ID}.desktop</launchable>
  <url type="homepage">${SITE}</url>
  <url type="bugtracker">${REPO}/issues</url>
  <url type="vcs-browser">${REPO}</url>
  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/synthwave-pixel/ultima3/main/promo/features.jpg</image>
    </screenshot>
  </screenshots>
  <categories>
    <category>Game</category>
    <category>RolePlaying</category>
  </categories>
  <content_rating type="oars-1.1">
    <content_attribute id="violence-fantasy">moderate</content_attribute>
  </content_rating>
  <releases>
    <release version="${version}" date="${date}">
      <url type="details">${REPO}/releases/tag/v${version}</url>
    </release>
  </releases>
</component>
`;
}

/** Writes the metainfo for `version`, dated today (UTC), where package.json's flatpak.files looks for it. */
function writeMetainfo(version) {
  const dir = join(__dirname, "build-meta");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ID}.metainfo.xml`);
  writeFileSync(file, metainfo(version, new Date().toISOString().slice(0, 10)));
  return file;
}

module.exports = { metainfo, writeMetainfo };

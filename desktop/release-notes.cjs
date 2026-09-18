// A release's notes, from the root README's changelog: the section headed "### v<version>" (the heading may go on
// with ", <date>"), up to the next heading, with each wrapped list item and paragraph joined onto one line, since
// GitHub keeps a release body's line breaks. Prints nothing when the README has no section for that version.
//   node release-notes.cjs 1.0.27
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function releaseNotes(version, readme) {
  const lines = readme.split("\n");
  const start = lines.findIndex(
    (l) => l === `### v${version}` || l.startsWith(`### v${version},`),
  );
  if (start < 0) return "";
  let end = start + 1;
  while (end < lines.length && !/^#{1,3} /.test(lines[end])) end++;
  const out = [];
  for (const line of lines.slice(start + 1, end)) {
    const joins =
      out.length > 0 &&
      out[out.length - 1] !== "" &&
      line !== "" &&
      !line.startsWith("- ");
    if (joins) out[out.length - 1] += " " + line.trim();
    else out.push(line);
  }
  return out.join("\n").trim();
}

module.exports = { releaseNotes };
if (require.main === module) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: node release-notes.cjs <version>");
    process.exit(2);
  }
  const notes = releaseNotes(
    version,
    readFileSync(join(__dirname, "..", "README.md"), "utf8"),
  );
  if (notes) console.log(notes);
}

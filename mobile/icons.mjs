// Renders the Android launcher icons and splash from desktop/build/icon.png with headless Chromium.
// Run once after `cap add android` or when the icon changes: node icons.mjs
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const RES = new URL("./android/app/src/main/res/", import.meta.url).pathname;
const icon = readFileSync(
  new URL("../desktop/build/icon.png", import.meta.url),
).toString("base64");
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<img id="i" src="data:image/png;base64,${icon}">`);
await p.waitForFunction(() => document.getElementById("i").complete);
const render = (w, h, draw) =>
  p.evaluate(
    ([w, h, draw]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      new Function("ctx", "img", "w", "h", draw)(
        ctx,
        document.getElementById("i"),
        w,
        h,
      );
      return c.toDataURL("image/png").split(",")[1];
    },
    [w, h, draw],
  );
const save = async (path, w, h, draw) => {
  mkdirSync(RES + path.split("/")[0], { recursive: true });
  writeFileSync(RES + path, Buffer.from(await render(w, h, draw), "base64"));
};
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const s = 48 * k,
    f = 108 * k;
  await save(
    `mipmap-${d}/ic_launcher.png`,
    s,
    s,
    "ctx.drawImage(img, 0, 0, w, h)",
  );
  await save(
    `mipmap-${d}/ic_launcher_round.png`,
    s,
    s,
    "ctx.beginPath(); ctx.arc(w/2, h/2, w/2, 0, Math.PI*2); ctx.clip(); ctx.drawImage(img, 0, 0, w, h)",
  );
  // Adaptive icon foreground: the icon in the safe zone (the middle two thirds) over the black background colour.
  await save(
    `mipmap-${d}/ic_launcher_foreground.png`,
    f,
    f,
    "const m = w / 6; ctx.drawImage(img, m, m, w - 2*m, h - 2*m)",
  );
}
// The launch background: plain black; the game draws its own loading text at once.
for (const dir of [
  "drawable",
  ...["land", "port"].flatMap((o) =>
    Object.keys(densities).map((d) => `drawable-${o}-${d}`),
  ),
])
  await save(
    `${dir}/splash.png`,
    64,
    64,
    'ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h)',
  );
await b.close();
console.log("icons written");

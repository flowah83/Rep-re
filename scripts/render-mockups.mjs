import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const htmlDir = path.join(root, "mockups", "html");
const outDir = path.join(root, "mockups");
const chrome = "/usr/bin/google-chrome";

const screens = [
  ["01-aujourdhui.html", "01_aujourdhui.png", 393, 852],
  ["02-seance.html", "02_seance.png", 393, 852],
  ["03-exercice.html", "03_exercice.png", 393, 852],
  ["04-progression.html", "04_progression.png", 393, 852],
  ["05-historique.html", "05_historique.png", 393, 852],
  ["06-bilan.html", "06_bilan.png", 393, 852],
];

const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--disable-dev-shm-usage", "--hide-scrollbars", "--font-render-hinting=none"],
});

async function shoot(file, outName, width, height, scale) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const url = pathToFileURL(path.join(htmlDir, file)).href;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({
    path: path.join(outDir, outName),
    type: "png",
    clip: { x: 0, y: 0, width, height },
  });
  await context.close();
  console.log("wrote", outName);
}

for (const [file, out, w, h] of screens) {
  await shoot(file, out, w, h, 3);
}

await shoot("00-overview.html", "00_overview.png", 1180, 1680, 2);
await browser.close();

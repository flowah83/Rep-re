import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  locale: "fr-FR",
});
page.setDefaultTimeout(15000);

await page.goto("http://127.0.0.1:8742/", { waitUntil: "networkidle" });
await page.getByTestId("onboarding-next").click();
await page.getByTestId("onboarding-next").click();
await page.getByTestId("onboarding-start").click();
await page.getByTestId("open-settings").click();
await page.getByTestId("demo-toggle").click();
await page.getByTestId("start-session").waitFor();

await page.screenshot({ path: `${outDir}/app_01_aujourdhui.png` });
await page.getByTestId("tab-progress").click();
await page.screenshot({ path: `${outDir}/app_04_progres.png` });
await page.getByTestId("tab-history").click();
await page.screenshot({ path: `${outDir}/app_05_carnet.png` });

await page.getByTestId("tab-today").click();
await page.getByTestId("open-settings").click();
await page.getByTestId("theme-dark").click();
await page.getByTestId("close-sheet").click();
await page.getByTestId("start-session").click();
await page.locator("[data-screen=session]").waitFor();
await page.getByTestId("complete-set").waitFor();
await completeOne(page);
await completeOne(page);
await page.getByTestId("rest-timer").waitFor();
await page.waitForTimeout(250);
await page.screenshot({ path: `${outDir}/app_02_seance.png` });

await page.getByTestId("open-gesture").click();
await page.getByTestId("mannequin").waitFor();
await page.waitForTimeout(200);
await page.screenshot({ path: `${outDir}/app_03_geste.png` });
await page.getByRole("button", { name: "Séance" }).click();

const chips = page.locator(".exswitch button");
const count = await chips.count();
for (let index = 0; index < count; index += 1) {
  await chips.nth(index).click();
  await page.locator(".exswitch button.on").waitFor();
  for (let set = 0; set < 8; set += 1) {
    const marked = await completeOne(page, { skipRest: true });
    if (!marked) break;
  }
}
await page.getByTestId("finish-session").click();
await page.getByTestId("share-coach").waitFor();
await page.screenshot({ path: `${outDir}/app_06_bilan.png` });

const summary = await page.locator("[data-screen=bilan]").innerText();
if (!summary.includes("séries dures") || summary.includes("0\nséries dures")) {
  throw new Error(`Bilan vide:\n${summary.slice(0, 400)}`);
}
await browser.close();
console.log("captures ok");

async function completeOne(page, { skipRest = false } = {}) {
  const check = page.getByTestId("complete-set");
  if ((await check.count()) === 0) return false;
  const before = await page.locator("[data-screen=session] .set.done").count();
  await check.click();
  await page.waitForFunction((count) => document.querySelectorAll("[data-screen=session] .set.done").length > count, before);
  if (skipRest) {
    const pass = page.getByRole("button", { name: "Passer" });
    if ((await pass.count()) > 0) await pass.click();
  }
  return true;
}

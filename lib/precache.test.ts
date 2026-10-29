import { describe, expect, it } from "vitest";
import { precacheUrls, servedAsset } from "../scripts/precache.mjs";

describe("précache", () => {
  it("écarte les fichiers que GitHub Pages ne sert pas", () => {
    expect(servedAsset("/.nojekyll")).toBe(false);
    expect(servedAsset("/sw.js")).toBe(false);
    expect(servedAsset("/_next/static/app.js.map")).toBe(false);
    expect(servedAsset("/_next/static/app.js")).toBe(true);
    expect(servedAsset("/models/body.glb")).toBe(true);
    const urls = precacheUrls(["/.nojekyll", "/index.html", "/sw.js", "/models/body.glb", "/app.js.map"], "/Rep-re");
    expect(urls).toEqual(["/Rep-re/index.html", "/Rep-re/models/body.glb"]);
    expect(urls.some((url: string) => url.split("/").pop()?.startsWith("."))).toBe(false);
  });
});

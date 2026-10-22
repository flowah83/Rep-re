import { describe, expect, it } from "vitest";
import { normalizeBasePath } from "../scripts/base-path.mjs";

describe("BASE_PATH", () => {
  it("accepte la racine et un sous-chemin GitHub Pages", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
    expect(normalizeBasePath("/Rep-re/")).toBe("/Rep-re");
    expect(normalizeBasePath("/Rep-re")).toBe("/Rep-re");
    expect(normalizeBasePath("Rep-re")).toBe("/Rep-re");
  });
});

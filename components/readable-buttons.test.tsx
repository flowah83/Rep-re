import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./ui/button";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("boutons lisibles", () => {
  it("rend le texte des boutons importants", () => {
    for (const label of ["Déposer le plan", "Importer un plan", "Lire", "Ajouter au carnet"]) {
      const html = renderToStaticMarkup(<Button>{label}</Button>);
      expect(html).toContain(label);
      expect(html).toContain("text-[var(--btn-ink)]");
      expect(html).toContain("bg-[var(--btn-bg)]");
    }
  });

  it("laisse la couleur du bouton gagner sur l’héritage", () => {
    const unlayered = css.replace(/@layer base \{[\s\S]*?\n\}/, "");
    expect(unlayered).not.toMatch(/button,\s*input,\s*textarea,\s*select\s*\{[^}]*color:\s*inherit/);
    expect(css).toMatch(/@layer base \{[\s\S]*color:\s*inherit/);
  });

  it("garde un contraste lisible en clair et en sombre", () => {
    const light = block(css, ":root,\nhtml.light");
    const dark = block(css, "html.dark");
    expect(contrast(light["--btn-ink"], light["--btn-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--btn-ink"], dark["--btn-bg"])).toBeGreaterThanOrEqual(4.5);
    expect(light["--btn-ink"].toLowerCase()).not.toBe(light["--btn-bg"].toLowerCase());
    expect(dark["--btn-ink"].toLowerCase()).not.toBe(dark["--btn-bg"].toLowerCase());
  });
});

function block(source: string, header: string): Record<string, string> {
  const start = source.indexOf(header);
  const body = source.slice(start, source.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[match[1]] = match[2].trim();
  return vars;
}

function contrast(ink: string, background: string): number {
  const lighter = Math.max(luminance(ink), luminance(background));
  const darker = Math.min(luminance(ink), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

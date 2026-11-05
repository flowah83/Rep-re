import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { KeepCard, SetChips, StepperCard } from "./set-entry";
import type { ExerciseLog, SetLog } from "@/lib/types";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const sets: SetLog[] = [
  { id: "w", loadKg: 60, reps: 8, rpe: null, warmup: true, done: true },
  { id: "a", loadKg: 80, reps: 6, rpe: null, warmup: false, done: true },
  { id: "b", loadKg: 80, reps: null, rpe: null, warmup: false, done: false },
  { id: "c", loadKg: 80, reps: null, rpe: null, warmup: false, done: false },
  { id: "d", loadKg: 80, reps: null, rpe: null, warmup: false, done: false },
];

const exercise: ExerciseLog = {
  id: "e",
  name: "Développé couché barre",
  pattern: "hpush",
  stepKg: 2.5,
  cues: [],
  muscles: [],
  planned: { sets: 4, reps: 6, loadKg: 80, restSec: 120, rpe: 8 },
  sets,
};

function frame(body: string, rest = false): string {
  return renderToStaticMarkup(
    <div className={`overlay sport-mode${rest ? " resting" : ""}`}>
      <div className="overlay-in session-screen" data-screen="session" data-testid="session-screen">
        <div className="sessbar">
          <button type="button" className="navline">Quitter</button>
          <button type="button" className="coach-mini" aria-label="Ouvrir le coach">R</button>
          <button type="button" className="linkend">Abandonner</button>
        </div>
        <button type="button" className="crumb">
          <span>Exercice 1 sur 6</span>
          <span>Série 2 sur 4</span>
        </button>
        <div className="sesshead"><h1>Développé couché barre</h1></div>
        <div dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </div>,
  );
}

function cards(load: number, reps: number): string {
  return renderToStaticMarkup(
    <>
      <SetChips exercise={exercise} currentId="b" onCorrect={() => undefined} />
      <div className="sessbody">
        <StepperCard kind="load" label="Charge" value={load} planned={80} unit="kg · barre" stepLabel="± 2,5 kg" aside="25 + 5 de chaque côté" onStep={() => undefined} onOpen={() => undefined} onRevert={() => undefined} />
        <StepperCard kind="reps" label="Répétitions" value={reps} planned={6} unit="répétitions" stepLabel="± 1" onStep={() => undefined} onOpen={() => undefined} onRevert={() => undefined} />
        <div className="thumb">
          <button type="button" className="btn"><b>Valider la série 2</b><small>{load} kg × {reps}</small></button>
          <button type="button" className="undoline">Passer cette série</button>
        </div>
      </div>
    </>,
  );
}

const scenes: Record<string, string> = {
  "série en cours": frame(cards(80, 6)),
  "charge modifiée": frame(cards(77.5, 5)),
  "question": frame(`${renderToStaticMarkup(<KeepCard prompt="Garder 77,5 kg pour les séries suivantes ?" onNo={() => undefined} onYes={() => undefined} />)}${cards(77.5, 5)}`),
  repos: frame(
    `${cards(77.5, 6)}<section class="restband" data-testid="rest-timer"><div class="resttop"><b class="num">1:52</b><p>Repos · puis série 3 · 77,5 kg</p><button type="button" class="pass">Passer</button></div><div class="rperow"><span>Effort</span>${[6, 7, 8, 9, 10].map((n) => `<button type="button">${n}</button>`).join("")}</div></section>`,
    true,
  ),
};

describe("mise en page iPhone 15", () => {
  it("tient dans 393×852, en clair, en sombre, et en grand texte", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
      const problems: string[] = [];
      for (const theme of ["light", "dark"]) {
        for (const size of [16, 20]) {
          for (const [name, html] of Object.entries(scenes)) {
            await page.setContent(`<!doctype html><html class="${theme}" style="font-size:${size}px"><head><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: "domcontentloaded" });
            await page.evaluate(() => {
              for (const animation of document.getAnimations()) {
                const iterations = animation.effect?.getTiming().iterations;
                if (iterations !== Infinity) animation.finish();
              }
            });
            const report = await page.evaluate(() => {
              const root = document.querySelector("[data-testid=session-screen]") as HTMLElement;
              const bad: string[] = [];
              if (root.scrollHeight > root.clientHeight + 1) bad.push(`défile ${root.scrollHeight}>${root.clientHeight}`);
              for (const el of document.querySelectorAll("button")) {
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) continue;
                const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32);
                if (rect.right > 393.5 || rect.left < -0.5) bad.push(`${label} sort à droite (${Math.round(rect.right)})`);
                // offsetWidth est la boîte en pixels CSS entiers. Un rectangle à 43,98 px
                // pour un min-height de 44 px reste un contrôle de 44 px, et un contrôle de 43 px échoue.
                const box = el as HTMLElement;
                if (box.offsetWidth < 44 || box.offsetHeight < 44) bad.push(`${label} ${box.offsetWidth}×${box.offsetHeight}`);
              }
              return bad;
            });
            for (const item of report) problems.push(`${theme} ${size}px · ${name} · ${item}`);
          }
        }
      }
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60000);

  it("laisse l’effort lisible sur le papier, et dans le bandeau noir", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
      const lows: string[] = [];
      const effort = `<div class="rperow" data-testid="effort-row"><span>Effort</span><button type="button">6</button><button type="button" class="on">8</button><p class="fine">6 facile, 10 maximal.</p></div>`;
      for (const theme of ["light", "dark"]) {
        await page.setContent(
          `<!doctype html><html class="${theme}"><head><style>${css}</style></head><body><div class="overlay" data-testid="paper">${effort}</div><section class="restband" data-testid="rest">${effort}</section></body></html>`,
          { waitUntil: "domcontentloaded" },
        );
        const found = await page.evaluate(() => {
          const bad: string[] = [];
          const parse = (color: string) => {
            const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
            return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts.length > 3 ? parts[3] : 1 };
          };
          const channel = (value: number) => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          const luma = (rgb: { r: number; g: number; b: number }) => 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
          const over = (fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }) => ({
            r: fg.r * fg.a + bg.r * (1 - fg.a),
            g: fg.g * fg.a + bg.g * (1 - fg.a),
            b: fg.b * fg.a + bg.b * (1 - fg.a),
          });
          const opaque = (node: Element) => {
            let current: Element | null = node;
            while (current) {
              const color = parse(getComputedStyle(current).backgroundColor);
              if (color.a >= 0.99) return color;
              current = current.parentElement;
            }
            return { r: 255, g: 255, b: 255 };
          };
          const pair = (name: string, node: Element, background: Element) => {
            const fg = parse(getComputedStyle(node).color);
            const own = parse(getComputedStyle(node).backgroundColor);
            const base = own.a >= 0.99 ? own : opaque(background);
            const ink = over(fg, base);
            const ratio = (Math.max(luma(ink), luma(base)) + 0.05) / (Math.min(luma(ink), luma(base)) + 0.05);
            if (ratio < 4.5) bad.push(`${name} ${ratio.toFixed(2)}`);
          };
          for (const place of ["paper", "rest"]) {
            const root = document.querySelector(`[data-testid=${place}]`) as HTMLElement;
            const row = root.querySelector(".rperow") as HTMLElement;
            pair(`${place} mot`, row.querySelector("span") as Element, root);
            pair(`${place} chiffre`, row.querySelector("button") as Element, root);
            pair(`${place} choisi`, row.querySelector("button.on") as Element, row.querySelector("button.on") as Element);
            const help = row.querySelector(".fine");
            if (help) pair(`${place} aide`, help, root);
          }
          return bad;
        });
        for (const item of found) lows.push(`${theme} ${item}`);
      }
      expect(lows).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60000);
});

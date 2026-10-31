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
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
      const problems: string[] = [];
      for (const theme of ["light", "dark"]) {
        for (const size of [16, 20]) {
          for (const [name, html] of Object.entries(scenes)) {
            await page.setContent(`<!doctype html><html class="${theme}" style="font-size:${size}px"><head><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: "domcontentloaded" });
            const report = await page.evaluate(() => {
              const root = document.querySelector("[data-testid=session-screen]") as HTMLElement;
              const bad: string[] = [];
              if (root.scrollHeight > root.clientHeight + 1) bad.push(`défile ${root.scrollHeight}>${root.clientHeight}`);
              for (const el of document.querySelectorAll("button")) {
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) continue;
                const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32);
                if (rect.right > 393.5 || rect.left < -0.5) bad.push(`${label} sort à droite (${Math.round(rect.right)})`);
                if (rect.width < 44 || rect.height < 44) bad.push(`${label} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
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
});

import { describe, expect, it } from "vitest";
import { comparableSessions, dipSentence, heldLoads, setsLine } from "./progress-board";
import { calendarMidpoint, daysBetween, weekdayLetter } from "./utils";
import { readFileSync } from "node:fs";
import { heatFill } from "@/components/chart";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(loadKg: number, reps: number, rpe = 8): SetLog {
  return { id: `${loadKg}-${reps}-${rpe}`, loadKg, reps, rpe, warmup: false, done: true };
}

function exercise(sets: SetLog[], name = "Développé couché barre"): ExerciseLog {
  return {
    id: name,
    name,
    pattern: "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux", "epaules", "triceps"],
    planned: { sets: sets.length, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets,
  };
}

function session(date: string, sets: SetLog[], title = "Poussée"): Session {
  return { id: date, date, title, status: "done", source: "manual", exercises: [exercise(sets)] };
}

describe("séances comparables", () => {
  it("dit qu’une séance plus légère n’est pas un recul", () => {
    const rows = comparableSessions(
      [
        session("2026-10-08", [set(88.5, 5)]),
        session("2026-10-15", [set(90, 5)]),
        session("2026-10-22", [set(80, 6), set(80, 6), set(80, 6), set(80, 5)]),
      ],
      "Développé couché barre",
      "kg",
      "2026-08-01",
      "2026-10-29",
    );
    expect(rows[0].date).toBe("2026-10-22");
    expect(rows[0].badge).toBe("+1 rép.");
    expect(rows.find((row) => row.date === "2026-10-15")?.badge).toBe("record");
    expect(setsLine(rows[0].sets, "kg")).toBe("80 kg × 6 · 6 · 6 · 5");
    expect(dipSentence(rows)).toMatch(/Ce n’est pas un recul/);
    expect(dipSentence(rows)).toMatch(/plus de répétitions avec moins de charge/);
    expect(dipSentence(rows)).not.toMatch(/tonnage|régression/i);
  });

  it("garde le filet au record quand la séance d’après est plus légère", () => {
    expect(heldLoads([75, 90, 80])).toEqual([75, 90, 90]);
    expect(heldLoads([80, 80])).toEqual([80, 80]);
  });
});

describe("semaine, date et corps", () => {
  it("distingue mardi et mercredi", () => {
    expect(weekdayLetter("2026-11-02")).toBe("L");
    expect(weekdayLetter("2026-11-03")).toBe("Ma");
    expect(weekdayLetter("2026-11-04")).toBe("Me");
    expect(weekdayLetter("2026-11-05")).toBe("J");
  });

  it("place le milieu du graphique sur le calendrier local", () => {
    expect(calendarMidpoint("2026-07-01", "2026-07-29")).toBe("2026-07-15");
    expect(calendarMidpoint("2026-10-01", "2026-10-29")).toBe("2026-10-15");
    expect(calendarMidpoint("2026-01-01", "2026-01-29")).toBe("2026-01-15");
    expect(daysBetween("2026-10-01", "2026-10-20")).toBe(19);
  });

  it("fonce le jour et éclaircit la nuit, sans revenir en arrière", () => {
    expect(heatFill(0)).toBe("var(--heat-0)");
    expect(heatFill(7)).toBe("var(--heat-1)");
    expect(heatFill(11)).toBe("var(--heat-2)");
    expect(heatFill(15)).toBe("var(--heat-3)");
    expect(heatFill(16)).toBe("var(--heat-4)");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const light = heatVars(css, ":root,\nhtml.light");
    const dark = heatVars(css, "html.dark");
    expect(lightness(light)).toEqual([...lightness(light)].sort((a, b) => b - a));
    expect(lightness(dark)).toEqual([...lightness(dark)].sort((a, b) => a - b));
    expect(css).toContain("var(--heat-0), var(--heat-1)");
    expect(css).not.toContain("#f0b27a");
    expect(css).not.toContain("#F0B27A");
  });
});

function heatVars(source: string, header: string): string[] {
  const start = source.indexOf(header);
  const body = source.slice(start, source.indexOf("}", start));
  return [0, 1, 2, 3, 4].map((step) => {
    const match = body.match(new RegExp(`--heat-${step}:\\s*(#[0-9a-fA-F]{6})`));
    if (!match) throw new Error(`--heat-${step} manquant`);
    return match[1];
  });
}

function lightness(colors: string[]): number[] {
  return colors.map((hex) => {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
    const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  });
}

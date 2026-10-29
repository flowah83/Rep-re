import { describe, expect, it } from "vitest";
import { comparableSessions, dipSentence, setsLine } from "./progress-board";
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
});

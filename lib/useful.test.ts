import { describe, expect, it } from "vitest";
import { CATALOG } from "./exercises";
import { backupProblem, isBackup } from "./backup";
import type { Session } from "./types";
import { buildSportSession, gearAllows, moveItem, readTemplates, rememberTemplate, sportIndicator, sportPace, substituteExercise, templateFromSession, toggleGear } from "./useful";

function session(): Session {
  return {
    id: "s",
    date: "2026-10-29",
    title: "Poussée",
    status: "done",
    source: "manual",
    exercises: [
      {
        id: "a",
        name: "Développé couché barre",
        pattern: "hpush",
        stepKg: 2.5,
        cues: [],
        muscles: ["pectoraux"],
        planned: { sets: 4, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
        sets: [],
      },
      {
        id: "b",
        name: "Écarté poulie",
        pattern: "hpush",
        stepKg: 2.5,
        cues: [],
        muscles: ["pectoraux"],
        planned: { sets: 3, reps: 12, loadKg: 15, restSec: 60, rpe: 8 },
        sets: [],
      },
    ],
  };
}

describe("fonctions utiles", () => {
  it("réordonne les exercices sans en perdre", () => {
    const rows = ["couché", "écarté", "triceps"];
    expect(moveItem(rows, 2, -1)).toEqual(["couché", "triceps", "écarté"]);
    expect(moveItem(rows, 0, -1)).toEqual(rows);
  });

  it("propose un autre matériel seulement s’il est disponible", () => {
    expect(substituteExercise("Développé couché barre", undefined)).toBeNull();
    expect(substituteExercise("Développé couché barre", ["halteres", "corps"])?.name).toBe("Développé incliné haltères");
    expect(substituteExercise("Développé couché barre", ["corps"])).toBeNull();
    expect(gearAllows("barre", toggleGear(undefined, "barre"))).toBe(false);
  });

  it("garde un modèle et relit une copie ancienne sans modèles", () => {
    const kept = rememberTemplate(undefined, templateFromSession(session()));
    expect(kept).toHaveLength(1);
    expect(kept[0].exercises.map((item) => item.name)).toEqual(["Développé couché barre", "Écarté poulie"]);
    expect(rememberTemplate(kept, templateFromSession(session()))).toHaveLength(1);
    expect(readTemplates(undefined)).toEqual([]);
    const old = {
      app: "repere" as const,
      version: 1 as const,
      exportedAt: "2026-10-01T00:00:00.000Z",
      settings: { onboarded: true, theme: "light" as const, barKg: 20 },
      sessions: [],
      customExercises: [],
    };
    expect(isBackup(old)).toBe(true);
    expect(backupProblem(old)).toBeNull();
  });

  it("sépare course et natation, sans note de forme", () => {
    expect(sportPace("course", 5, 25)).toBe("5:00 / km");
    expect(sportPace("natation", 1500, 30)).toBe("2:00 / 100 m");
    const run = buildSportSession({ kind: "course", date: "2026-10-29", durationMin: 25, distance: 5, rpe: 6 });
    const swim = buildSportSession({ kind: "natation", date: "2026-10-29", durationMin: 30, distance: 1500, rpe: 5 });
    if ("error" in run || "error" in swim) throw new Error("forme refusée");
    expect(run.session.cardio?.sport).toBe("Course");
    expect(swim.session.cardio?.distanceKm).toBe(1.5);
    expect(sportIndicator(swim.session.cardio!)).toMatch(/30 min · 1\s?500 m · 2:00 \/ 100 m · ressenti 5/);
    expect(sportIndicator(run.session.cardio!)).not.toMatch(/score|forme/i);
    expect(buildSportSession({ kind: "course", date: "2026-10-29", durationMin: null, distance: 5, rpe: 6 })).toMatchObject({ error: expect.stringMatching(/durée/) });
    expect(CATALOG.some((item) => item.equipment === "barre")).toBe(true);
  });
});

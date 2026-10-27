import { describe, expect, it } from "vitest";
import { bestLoads } from "./calc";
import { describePlan, estimateMinutes, historyBucket, plateGlance, runFacts, seriesWord, unitOfExercise, unitPhrase } from "./display";
import type { ExerciseLog, Session } from "./types";

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: "e",
    name: "Course",
    pattern: "hinge",
    stepKg: 2.5,
    cues: [],
    muscles: [],
    planned: { sets: 1, reps: null, loadKg: null, restSec: 0, rpe: null },
    sets: [],
    ...partial,
  };
}

describe("lignes de plan", () => {
  it("annonce les disques seulement pour une barre", () => {
    expect(plateGlance(60, "kg", 20)).toBe("20 kg de chaque côté, soit 60 kg");
    expect(plateGlance(20, "kg/main", 20)).toBeNull();
    expect(plateGlance(70, "corps", 20)).toBeNull();
  });

  it("dit 1 série et n’écrit pas un repos de 0 s", () => {
    expect(seriesWord(1)).toBe("1 série");
    expect(describePlan(exercise())).toBe("1 série");
    expect(describePlan(exercise({ planned: { sets: 3, reps: 10, loadKg: 20, restSec: 120, rpe: null }, unit: "kg/main" }))).toBe(
      "20 kg par haltère · 3 × 10 · repos 2 min",
    );
  });

  it("décrit une course par sa durée, pas par des séries", () => {
    const session = {
      cardio: { sport: "Course", durationMin: 32, distanceKm: 5, rpe: null, pace: "6:24", hrAvg: null, hrMax: null, elevationM: null, kcal: null },
    } as Session;
    expect(describePlan(exercise(), session)).toMatch(/32/);
    expect(describePlan(exercise(), session)).not.toMatch(/repos/);
  });

  it("range Upper, Lower et la course", () => {
    expect(historyBucket({ title: "Upper B" })).toBe("upper");
    expect(historyBucket({ title: "Lower A" })).toBe("lower");
    expect(historyBucket({ title: "Footing", cardio: { sport: "Course", durationMin: 20, distanceKm: null, rpe: null, pace: null, hrAvg: null, hrMax: null, elevationM: null, kcal: null } })).toBe("cardio");
    expect(historyBucket({ title: "Mobilité" })).toBe("other");
  });

  it("estime la durée avec les repos, et garde celle d’une course", () => {
    const strength = session("Développé couché", 20, "2026-10-25");
    strength.exercises[0].planned.restSec = 120;
    strength.exercises[0].planned.sets = 3;
    strength.exercises[0].sets = [
      { id: "a", loadKg: 20, reps: null, rpe: null, warmup: false, done: false },
      { id: "b", loadKg: 20, reps: null, rpe: null, warmup: false, done: false },
      { id: "c", loadKg: 20, reps: null, rpe: null, warmup: false, done: false },
    ];
    expect(estimateMinutes(strength)).toBe(6);
    const run = {
      ...strength,
      cardio: { sport: "Course", durationMin: 32, distanceKm: 5, rpe: null, pace: "6:24", hrAvg: null, hrMax: null, elevationM: null, kcal: null },
      exercises: [{ ...strength.exercises[0], planned: { ...strength.exercises[0].planned, loadKg: null, restSec: 0, sets: 1 }, sets: [] }],
    };
    expect(estimateMinutes(run)).toBe(32);
    const plannedRun = {
      ...strength,
      cardio: undefined,
      coachNote: "Restez à l’aise.",
      exercises: [
        {
          ...strength.exercises[0],
          note: "45–50 min facile. Notez la distance et l’allure.",
          planned: { sets: 1, reps: null, loadKg: null, restSec: 0, rpe: 4 },
          sets: [],
        },
      ],
    };
    expect(estimateMinutes(plannedRun)).toBe(48);
    expect(runFacts(plannedRun).duration).toBe("45–50 min");
    expect(runFacts(plannedRun).distance).toBeNull();
  });

  it("nomme l’haltère", () => {
    expect(unitPhrase("kg/main")).toBe("kg par haltère");
    expect(unitPhrase(null)).toBe("kg");
    expect(unitOfExercise({ name: "Élévations latérales" })).toBe("kg/main");
    expect(unitPhrase(unitOfExercise({ name: "Élévations latérales" }))).toBe("kg par haltère");
  });
});

describe("records", () => {
  it("classe par la charge la plus lourde, pas par la date", () => {
    const heavy = session("Développé couché", 100, "2026-09-01");
    const light = session("Élévations", 12, "2026-10-20");
    const loads = bestLoads([light, heavy]);
    expect(loads[0].name).toBe("Développé couché");
    expect(loads[0].loadKg).toBe(100);
    expect(loads[0].unit).toBe("kg/main");
  });
});

function session(name: string, load: number, date: string): Session {
  return {
    id: name,
    date,
    title: "Upper",
    status: "done",
    source: "coach",
    exercises: [
      {
        id: "e",
        name,
        pattern: "hpush",
        stepKg: 2.5,
        cues: [],
        muscles: ["pectoraux"],
        unit: "kg/main",
        planned: { sets: 1, reps: 8, loadKg: load, restSec: 120, rpe: null },
        sets: [{ id: "s", loadKg: load, reps: 8, rpe: 8, warmup: false, done: true, unit: "kg/main" }],
      },
    ],
  };
}

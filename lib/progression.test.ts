import { describe, expect, it } from "vitest";
import { applySuggestion, suggestForExercise, suggestionsForSession } from "./progression";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { loadKg: number | null; reps: number | null }): SetLog {
  return {
    id: partial.id ?? "s",
    loadKg: partial.loadKg,
    reps: partial.reps,
    rpe: partial.rpe ?? null,
    rir: partial.rir,
    unit: partial.unit,
    warmup: partial.warmup ?? false,
    done: partial.done ?? true,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex-1",
    name: partial.name ?? "Développé couché barre",
    pattern: "hpush",
    stepKg: partial.stepKg ?? 2.5,
    cues: [],
    muscles: ["pectoraux"],
    unit: partial.unit,
    planned: partial.planned ?? { sets: 4, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [],
  };
}

function doneSession(date: string, ex: ExerciseLog, extra: Partial<Session> = {}): Session {
  return {
    id: extra.id ?? `done-${date}`,
    date,
    title: extra.title ?? "Poussée",
    status: extra.status ?? "done",
    source: "manual",
    exercises: [ex],
    cardio: extra.cardio,
    endedAt: extra.endedAt,
  };
}

describe("double progression", () => {
  it("monte la charge quand toutes les séries atteignent l’objectif", () => {
    const history = [
      doneSession("2026-10-01", exercise({
        sets: [set({ loadKg: 80, reps: 6, rpe: 8 }), set({ loadKg: 80, reps: 6, rpe: 8 }), set({ loadKg: 80, reps: 6, rpe: 8 })],
      })),
    ];
    const suggestion = suggestForExercise(exercise(), history, "today");
    expect(suggestion?.loadKg).toBe(82.5);
    expect(suggestion?.reps).toBe(6);
    expect(suggestion?.reason).toMatch(/Objectif de répétitions atteint/);
    expect(suggestion?.changesPlan).toBe(true);
  });

  it("mentionne l’aisance quand le RIR est d’au moins 2", () => {
    const history = [
      doneSession("2026-10-01", exercise({
        sets: [set({ loadKg: 80, reps: 6, rir: 2, rpe: 7 }), set({ loadKg: 80, reps: 6, rir: 3 })],
      })),
    ];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.loadKg).toBe(82.5);
    expect(suggestion?.reason).toMatch(/faciles/);
  });

  it("garde la charge si les répétitions sont atteintes mais le RPE est à 9", () => {
    const history = [doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 6, rpe: 9 })] }))];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.loadKg).toBe(80);
    expect(suggestion?.reps).toBe(6);
    expect(suggestion?.reason).toMatch(/effort était maximal/);
    expect(suggestion?.changesPlan).toBe(false);
  });

  it("baisse la charge si les répétitions manquent et le RIR est à 0", () => {
    const history = [doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 4, rir: 0, rpe: 10 })] }))];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.loadKg).toBe(77.5);
    expect(suggestion?.reps).toBe(6);
    expect(suggestion?.reason).toMatch(/Répétitions manquées/);
  });

  it("garde la charge si les répétitions manquent sans effort maximal", () => {
    const history = [doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 5, rpe: 8 })] }))];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.loadKg).toBe(80);
    expect(suggestion?.reps).toBe(6);
    expect(suggestion?.reason).toMatch(/n’y étaient pas toutes/);
  });

  it("ignore l’échauffement, le cardio et une séance sans historique", () => {
    const cardio = doneSession("2026-10-20", exercise({ sets: [set({ loadKg: 200, reps: 1 })] }), {
      cardio: { sport: "Course", durationMin: 30, distanceKm: 5, rpe: 5, pace: null, hrAvg: null, hrMax: null, elevationM: null, kcal: null },
    });
    const warmupOnly = doneSession("2026-10-18", exercise({
      sets: [set({ loadKg: 40, reps: 10, warmup: true })],
    }));
    expect(suggestForExercise(exercise(), [cardio, warmupOnly])).toBeNull();
    expect(suggestForExercise(exercise(), [])).toBeNull();
  });

  it("utilise seulement la séance la plus récente et le pas de l’exercice", () => {
    const older = doneSession("2026-09-01", exercise({ sets: [set({ loadKg: 100, reps: 6, rpe: 8 })] }));
    const newer = doneSession("2026-10-10", exercise({
      stepKg: 1,
      sets: [set({ loadKg: 28, reps: 10, rpe: 8 })],
    }));
    const planned = exercise({ stepKg: 1, planned: { sets: 3, reps: 10, loadKg: 28, restSec: 90, rpe: 8 } });
    const suggestion = suggestForExercise(planned, [older, newer]);
    expect(suggestion?.loadKg).toBe(29);
    expect(suggestion?.reps).toBe(10);
  });

  it("ne transforme pas une charge inconnue en zéro et ajoute une répétition au poids du corps", () => {
    const history = [doneSession("2026-10-01", exercise({
      sets: [set({ loadKg: null, reps: 8, rpe: 7 })],
    }))];
    const planned = exercise({ planned: { sets: 3, reps: 8, loadKg: null, restSec: 90, rpe: null } });
    const suggestion = suggestForExercise(planned, history);
    expect(suggestion?.loadKg).toBeNull();
    expect(suggestion?.reps).toBe(9);
    expect(suggestion?.reason).toMatch(/Poids du corps/);
    expect(suggestion?.reason).not.toMatch(/\b0\b/);
  });

  it("ne double pas une charge en kg/main", () => {
    const history = [doneSession("2026-10-01", exercise({
      unit: "kg/main",
      sets: [set({ loadKg: 14, reps: 10, rpe: 8, unit: "kg/main" })],
    }))];
    const planned = exercise({
      unit: "kg/main",
      stepKg: 1,
      planned: { sets: 3, reps: 10, loadKg: 14, restSec: 90, rpe: 8 },
    });
    const suggestion = suggestForExercise(planned, history);
    expect(suggestion?.loadKg).toBe(15);
    expect(suggestion?.reason).toMatch(/15 kg\/main/);
    expect(suggestion?.reason).not.toMatch(/30/);
  });

  it("reconnaît le même geste malgré les accents", () => {
    const history = [doneSession("2026-10-01", exercise({
      name: "developpe couche barre",
      sets: [set({ loadKg: 80, reps: 6, rpe: 8 })],
    }))];
    const suggestion = suggestForExercise(exercise({ name: "Développé couché barre" }), history);
    expect(suggestion?.loadKg).toBe(82.5);
  });

  it("propose une suggestion par exercice et l’accepter ne touche pas les séries faites", () => {
    const planned: Session = {
      id: "today",
      date: "2026-10-22",
      title: "Poussée",
      status: "planned",
      source: "manual",
      exercises: [
        exercise({ id: "a", sets: [set({ id: "w", loadKg: 60, reps: 8, warmup: true, done: false }), set({ id: "n", loadKg: 80, reps: null, done: false })] }),
        exercise({ id: "b", name: "Élévations latérales", stepKg: 1, planned: { sets: 3, reps: 15, loadKg: 10, restSec: 60, rpe: 8 } }),
      ],
    };
    const history = [
      doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 6, rpe: 8 })] })),
      doneSession("2026-10-01", exercise({
        name: "Élévations latérales",
        stepKg: 1,
        sets: [set({ loadKg: 10, reps: 15, rpe: 8 })],
      }), { id: "lat" }),
    ];
    const suggestions = suggestionsForSession(planned, history);
    expect(suggestions.map((item) => item.exerciseId)).toEqual(["a", "b"]);
    const next = applySuggestion(planned, suggestions[0]);
    const updated = next.exercises[0];
    expect(updated.planned.loadKg).toBe(82.5);
    expect(updated.sets[0].loadKg).toBe(60);
    expect(updated.sets[1].loadKg).toBe(82.5);
    expect(updated.sets[1].done).toBe(false);
  });
});

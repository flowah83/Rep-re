import { describe, expect, it } from "vitest";
import { bestLoads, bestReps, heaviestSet, samplesForExercise } from "./calc";
import { trueRecords } from "./home";
import { compareExercise, duplicateAsPlan, sessionEffort, versus } from "./session";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { loadKg: number | null; reps: number | null }): SetLog {
  return { id: partial.id ?? "s", loadKg: partial.loadKg, reps: partial.reps, rpe: partial.rpe ?? null, unit: partial.unit, warmup: false, done: partial.done ?? true, skipped: partial.skipped };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: partial.pattern ?? "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux"],
    unit: partial.unit,
    planned: partial.planned ?? { sets: 4, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [set({ loadKg: 80, reps: 6 })],
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Poussée",
    status: partial.status ?? "done",
    source: partial.source ?? "manual",
    closed: partial.closed,
    startedAt: partial.startedAt,
    endedAt: partial.endedAt,
    exercises: partial.exercises ?? [exercise()],
  };
}

describe("lot B", () => {
  it("ne mélange pas kg et kg/main sur la même carte de record", () => {
    const bar = session({
      date: "2026-03-01",
      exercises: [exercise({ sets: [set({ loadKg: 100, reps: 5, unit: "kg" })] })],
    });
    const dumbbell = session({
      date: "2026-03-08",
      id: "db",
      exercises: [exercise({ sets: [set({ loadKg: 40, reps: 8, unit: "kg/main" })] })],
    });
    const loads = bestLoads([bar, dumbbell]).filter((item) => item.name === "Développé couché barre");
    expect(loads).toHaveLength(2);
    expect(loads.map((item) => item.unit).sort()).toEqual(["kg", "kg/main"]);
    expect(heaviestSet([bar, dumbbell], "Développé couché barre", "kg")?.loadKg).toBe(100);
    expect(heaviestSet([bar, dumbbell], "Développé couché barre", "kg/main")?.loadKg).toBe(40);
    expect(samplesForExercise([bar, dumbbell], "Développé couché barre", "kg").map((item) => item.loadKg)).toEqual([100]);
    expect(bestReps([bar, dumbbell], "Développé couché barre", "kg/main")?.reps).toBe(8);
    const hits = trueRecords([bar, dumbbell]);
    expect(hits.filter((hit) => hit.unit === "kg/main").every((hit) => hit.loadKg === 40)).toBe(true);
    expect(hits.some((hit) => hit.unit === "kg" && hit.loadKg === 40)).toBe(false);
  });

  it("reprend le plan sans copier les séries réalisées", () => {
    const source = session({
      date: "2026-03-01",
      noteForMe: "privé",
      exercises: [exercise({ sets: [set({ id: "done", loadKg: 80, reps: 6, rpe: 9 })] })],
    });
    const copy = duplicateAsPlan(source, "2026-03-20");
    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe("planned");
    expect(copy.noteForMe).toBeUndefined();
    expect(copy.exercises[0].planned.loadKg).toBe(80);
    expect(copy.exercises[0].sets.every((item) => item.done === false && item.loadKg == null && item.reps == null)).toBe(true);
    expect(copy.exercises[0].sets.some((item) => item.id === "done")).toBe(false);
  });

  it("distingue une séance partielle et aligne prévu et réalisé", () => {
    const exerciseLog = exercise({
      sets: [set({ loadKg: 80, reps: 5, rpe: 8 }), set({ id: "left", loadKg: null, reps: null, done: false })],
    });
    const partial = session({
      date: "2026-03-01",
      closed: "partial",
      startedAt: "2026-03-01T18:00:00.000Z",
      endedAt: "2026-03-01T18:31:00.000Z",
      exercises: [exerciseLog],
    });
    expect(sessionEffort(partial)).toMatchObject({ minutes: 31, done: 1, left: 1, partial: true });
    expect(versus(exerciseLog)).toMatchObject({
      plannedLoad: "80 kg × 6",
      doneLoad: "80 kg × 5",
    });
    expect(versus(exerciseLog).doneDetail).toMatch(/effort 8/);
    const skipped = exercise({ sets: [set({ id: "left", loadKg: null, reps: null, done: false })] });
    expect(compareExercise(skipped, []).kind).toBe("vide");
    expect(versus(skipped)).toMatchObject({ plannedLoad: "80 kg × 6", plannedSets: "4 séries", doneLoad: "Pas fait", doneDetail: "0 série" });
  });
});

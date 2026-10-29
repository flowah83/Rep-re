import { describe, expect, it } from "vitest";
import { resumeGlance } from "./resume";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { id: string }): SetLog {
  return {
    id: partial.id,
    loadKg: partial.loadKg === undefined ? 80 : partial.loadKg,
    reps: partial.reps === undefined ? 6 : partial.reps,
    rpe: partial.rpe ?? null,
    warmup: partial.warmup ?? false,
    done: partial.done ?? false,
    skipped: partial.skipped,
  };
}

function exercise(partial: Partial<ExerciseLog> & { id: string; name: string }): ExerciseLog {
  return {
    id: partial.id,
    name: partial.name,
    pattern: partial.pattern ?? "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux"],
    planned: partial.planned ?? { sets: 4, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [],
  };
}

function session(exercises: ExerciseLog[]): Session {
  return {
    id: "live",
    date: "2026-10-29",
    title: "Poussée",
    status: "active",
    source: "manual",
    startedAt: "2026-10-29T17:00:00.000Z",
    exercises,
  };
}

describe("carte reprendre", () => {
  it("annonce la prochaine série, les points, et la séance d’après", () => {
    const glance = resumeGlance(
      session([
        exercise({
          id: "bench",
          name: "Développé couché barre",
          sets: [set({ id: "a", done: true }), set({ id: "b" }), set({ id: "c" }), set({ id: "d" })],
        }),
        exercise({
          id: "incline",
          name: "Développé incliné haltères",
          pattern: "hpush",
          planned: { sets: 3, reps: 10, loadKg: 28, restSec: 90, rpe: 8 },
          sets: [set({ id: "e", loadKg: 28, reps: 10 }), set({ id: "f", loadKg: 28, reps: 10 }), set({ id: "g", loadKg: 28, reps: 10 })],
        }),
      ]),
      Date.parse("2026-10-29T17:09:00.000Z"),
    );
    expect(glance.status).toBe("En cours · depuis 9 min");
    expect(glance.nextLine).toBe("Ensuite : développé couché barre, série 2 sur 4");
    expect(glance.target).toBe("80 kg × 6 visés");
    expect(glance.dots).toEqual(["done", "now", "todo", "todo", "todo", "todo", "todo"]);
    expect(glance.saved).toBe("1 série notée sur 7. Tout est déjà enregistré.");
    expect(glance.after).toBe("Développé incliné haltères · 3 × 10");
  });
});

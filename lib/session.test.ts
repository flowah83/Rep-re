import { describe, expect, it } from "vitest";
import { completeSet, sessionFullyLogged, skipSet } from "./session";
import type { Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { id: string }): SetLog {
  return {
    loadKg: 60,
    reps: null,
    rpe: null,
    warmup: false,
    done: false,
    ...partial,
  };
}

function session(restSec: number, sets: SetLog[]): Session {
  return {
    id: "s",
    date: "2026-10-25",
    title: "Poussée",
    status: "active",
    source: "coach",
    exercises: [
      {
        id: "e1",
        name: "Militaire",
        pattern: "vpush",
        stepKg: 2.5,
        cues: [],
        muscles: [],
        planned: { sets: sets.filter((item) => !item.warmup).length, reps: 8, loadKg: 27.5, restSec, rpe: 8 },
        sets,
      },
    ],
  };
}

describe("fin de série", () => {
  it("ne lance pas de repos si le repos est à 0, et ne recopie pas le RPE du plan", () => {
    const next = completeSet(session(0, [set({ id: "a" }), set({ id: "b" })]), "e1", "a");
    expect(next.restEndsAt).toBeNull();
    expect(next.exercises[0].sets[0].rpe).toBeNull();
    expect(next.exercises[0].sets[0].done).toBe(true);
  });

  it("lance le repos seulement s’il reste une série, pas après la dernière", () => {
    const first = completeSet(session(90, [set({ id: "a" }), set({ id: "b" })]), "e1", "a");
    expect(first.restEndsAt).toBeGreaterThan(Date.now());
    const last = completeSet(first, "e1", "b");
    expect(last.restEndsAt).toBeNull();
    expect(sessionFullyLogged(last)).toBe(true);
  });

  it("ne sonne pas après un échauffement", () => {
    const next = completeSet(session(90, [set({ id: "w", warmup: true, loadKg: 20 }), set({ id: "a" })]), "e1", "w");
    expect(next.restEndsAt).toBeNull();
    expect(next.exercises[0].sets[0].done).toBe(true);
  });

  it("une série passée ne bloque pas la fin", () => {
    const skipped = skipSet(session(90, [set({ id: "a" }), set({ id: "b", done: true, reps: 8 })]), "e1", "a");
    expect(skipped.restEndsAt).toBeNull();
    expect(skipped.exercises[0].sets[0].skipped).toBe(true);
    expect(sessionFullyLogged(skipped)).toBe(true);
  });
});

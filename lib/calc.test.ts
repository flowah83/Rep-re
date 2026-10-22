import { describe, expect, it } from "vitest";
import { bestLoads, e1rmSeries, epley, hardSetCount, muscleTotals, platesPerSide, tonnage } from "./calc";
import { buildDemo } from "./demo";
import { EXAMPLE_PLAN, decodePlan, encodePlan, parsePlan } from "./plan";
import type { ExerciseLog, Session } from "./types";

function ex(partial: Partial<ExerciseLog> & Pick<ExerciseLog, "sets">): ExerciseLog {
  return {
    id: "e",
    name: "Développé couché barre",
    pattern: "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux", "epaules", "triceps"],
    planned: { sets: 4, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    ...partial,
  };
}

describe("epley", () => {
  it("calcule 90 kg × 5 = 105", () => {
    expect(epley(90, 5)).toBe(105);
  });

  it("ignore les séries au-delà de 10 répétitions", () => {
    expect(epley(10, 15)).toBeNull();
    expect(epley(80, 0)).toBeNull();
    expect(epley(0, 5)).toBeNull();
  });

  it("arrondit au dixième", () => {
    expect(epley(82.5, 6)).toBe(99);
  });
});

describe("volume", () => {
  const exercises = [
    ex({
      sets: [
        { id: "w", loadKg: 60, reps: 8, rpe: null, warmup: true, done: true },
        { id: "1", loadKg: 80, reps: 6, rpe: 8, warmup: false, done: true },
        { id: "2", loadKg: 80, reps: 6, rpe: 8, warmup: false, done: true },
        { id: "3", loadKg: 80, reps: 6, rpe: 8, warmup: false, done: true },
        { id: "4", loadKg: 80, reps: 5, rpe: 9, warmup: false, done: false },
      ],
    }),
  ];

  it("ne compte pas l’échauffement ni une série non faite", () => {
    expect(hardSetCount(exercises)).toBe(3);
    expect(tonnage(exercises)).toBe(80 * 6 * 3);
  });
});

describe("courbe", () => {
  it("ne baisse pas le jour d’une séance légère", () => {
    const series = e1rmSeries([
      { date: "2026-10-10", loadKg: 90, reps: 5 },
      { date: "2026-10-17", loadKg: 80, reps: 6 },
    ]);
    expect(series[0].bestSoFar).toBe(105);
    expect(series[1].dayEstimate).toBe(96);
    expect(series[1].bestSoFar).toBe(105);
  });

  it("laisse un trou de dates réel", () => {
    const series = e1rmSeries([
      { date: "2026-08-17", loadKg: 80, reps: 5 },
      { date: "2026-09-14", loadKg: 85, reps: 5 },
    ]);
    expect(series.map((p) => p.date)).toEqual(["2026-08-17", "2026-09-14"]);
  });
});

describe("muscles", () => {
  it("compte une série dure sur chaque muscle du mouvement", () => {
    const session: Session = {
      id: "s",
      date: "2026-10-20",
      title: "Poussée",
      status: "done",
      source: "manual",
      exercises: [
        ex({
          sets: [{ id: "1", loadKg: 80, reps: 6, rpe: 8, warmup: false, done: true }],
        }),
      ],
    };
    const totals = muscleTotals([session], "2026-10-01", "2026-10-22");
    expect(totals.pectoraux).toBe(1);
    expect(totals.epaules).toBe(1);
    expect(totals.triceps).toBe(1);
    expect(totals.mollets).toBe(0);
  });
});

describe("disques", () => {
  it("répartit 80 kg sur une barre de 20 kg", () => {
    const result = platesPerSide(80, 20);
    expect(result.perSide).toBe(30);
    expect(result.remainder).toBe(0);
    expect(result.plates).toEqual([
      { kg: 25, count: 1 },
      { kg: 5, count: 1 },
    ]);
  });
});

describe("plan", () => {
  it("lit l’exemple de l’audit", () => {
    const parsed = parsePlan(EXAMPLE_PLAN);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.sessions).toHaveLength(1);
    const bench = parsed.sessions[0].exercises[0];
    expect(bench.name).toBe("Développé couché barre");
    expect(bench.sets.filter((s) => s.warmup)).toHaveLength(1);
    expect(bench.sets.filter((s) => !s.warmup)).toHaveLength(4);
    expect(bench.planned.loadKg).toBe(80);
    expect(parsed.sessions[0].exercises[1].muscles).toContain("epaules");
  });

  it("explique ce qui manque", () => {
    const parsed = parsePlan('{"seances":[{"date":"2026-10-22","titre":"Poussée","exercices":[{}]}]}');
    expect(parsed).toEqual({ error: "Un exercice de « Poussée » n’a pas de nom." });
  });

  it("fait l’aller-retour d’un lien #plan=", () => {
    const token = encodePlan(EXAMPLE_PLAN);
    expect(token).not.toMatch(/[+/=]/);
    expect(decodePlan(token)).toBe(EXAMPLE_PLAN);
  });
});

describe("exemple fictif", () => {
  it("garde le record de couché après la séance légère", () => {
    const sessions = buildDemo(new Date(2026, 9, 22));
    const samples = sessions.flatMap((session) =>
      session.exercises
        .filter((ex) => ex.name === "Développé couché barre" && session.status !== "planned")
        .flatMap((ex) =>
          ex.sets
            .filter((s) => s.done && !s.warmup && s.loadKg && s.reps)
            .map((s) => ({ date: session.date, loadKg: s.loadKg as number, reps: s.reps as number })),
        ),
    );
    const series = e1rmSeries(samples);
    const last = series[series.length - 1];
    expect(last.bestSoFar).toBeGreaterThanOrEqual(last.dayEstimate);
    expect(Math.max(...series.map((p) => p.bestSoFar))).toBe(105);
    const loads = bestLoads(sessions).find((b) => b.name === "Squat barre");
    expect(loads?.loadKg).toBe(100);
  });
});

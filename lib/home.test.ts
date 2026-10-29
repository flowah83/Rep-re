import { describe, expect, it } from "vitest";
import { buildHome, sessionsForHome, trueRecords } from "./home";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { loadKg: number | null; reps: number | null }): SetLog {
  return {
    id: partial.id ?? "s",
    loadKg: partial.loadKg,
    reps: partial.reps,
    rpe: partial.rpe ?? 8,
    warmup: partial.warmup ?? false,
    done: partial.done ?? true,
    unit: partial.unit,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: partial.pattern ?? "hpush",
    stepKg: partial.stepKg ?? 2.5,
    cues: [],
    muscles: partial.muscles ?? ["pectoraux", "epaules", "triceps"],
    unit: partial.unit,
    note: partial.note,
    planned: partial.planned ?? { sets: 3, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [set({ loadKg: 80, reps: 6 }), set({ loadKg: 80, reps: 6 }), set({ loadKg: 80, reps: 6 })],
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Poussée",
    status: partial.status ?? "done",
    source: partial.source ?? "coach",
    exercises: partial.exercises ?? [exercise()],
    cardio: partial.cardio,
    closed: partial.closed,
    coachNote: partial.coachNote,
    time: partial.time,
  };
}

const TODAY = "2026-10-22";

describe("données d’accueil", () => {
  it("ignore l’exemple dès qu’une vraie séance existe", () => {
    const demo = session({ date: "2026-10-19", source: "demo", exercises: [exercise({ sets: [set({ loadKg: 200, reps: 5 })] })] });
    const real = session({ date: "2026-10-21", exercises: [exercise({ sets: [set({ loadKg: 40, reps: 5 })] })] });
    expect(sessionsForHome([demo, real])).toEqual([real]);
    const home = buildHome([demo, real], TODAY);
    expect(home.bench?.kg).toBe(46.7);
    expect(home.bench?.bestSet).toEqual({ loadKg: 40, reps: 5 });
    expect(home.bench?.aria).toMatch(/max estimé/);
    expect(home.bench?.aria).toMatch(/meilleure série/);
    expect(sessionsForHome([demo])).toEqual([demo]);
  });

  it("marque manquée une séance prévue déjà passée, et prévue un jour à venir", () => {
    const home = buildHome(
      [
        session({ date: "2026-10-19" }),
        session({ date: "2026-10-20", status: "planned", exercises: [exercise({ sets: [] })] }),
        session({ date: "2026-10-23", status: "planned", title: "Dos", exercises: [exercise({ name: "Rowing barre", pattern: "hpull", muscles: ["dos"], sets: [] })] }),
      ],
      TODAY,
    );
    expect(home.days.find((day) => day.iso === "2026-10-20")?.kind).toBe("missed");
    expect(home.days.find((day) => day.iso === "2026-10-23")?.kind).toBe("planned");
    expect(home.days.find((day) => day.iso === "2026-10-22")?.kind).toBe("rest");
    expect(home.sessions).toMatchObject({ done: 1, total: 3 });
    expect(home.heat.streak).toBe(0);
  });

  it("ne célèbre pas un record à charge et répétitions égales", () => {
    const same = [
      session({ date: "2026-10-15" }),
      session({ date: "2026-10-19" }),
    ];
    expect(trueRecords(same)).toEqual([]);
    expect(buildHome(same, TODAY).record).toBeNull();
    const reps = [
      session({ date: "2026-10-15" }),
      session({ date: "2026-10-19", exercises: [exercise({ sets: [set({ loadKg: 80, reps: 7 })] })] }),
    ];
    expect(buildHome(reps, TODAY).record).toMatchObject({ loadKg: 80, reps: 7 });
    const heavier = [
      session({ date: "2026-10-01", exercises: [exercise({ sets: [set({ loadKg: 80, reps: 6 })] })] }),
      session({ date: "2026-10-19", exercises: [exercise({ sets: [set({ loadKg: 82.5, reps: 6 })] })] }),
    ];
    expect(buildHome(heavier, TODAY).record).toMatchObject({ loadKg: 82.5, reps: 6 });
    const old = [
      session({ date: "2026-09-01", exercises: [exercise({ sets: [set({ loadKg: 70, reps: 5 })] })] }),
      session({ date: "2026-09-15", exercises: [exercise({ sets: [set({ loadKg: 82.5, reps: 6 })] })] }),
    ];
    expect(buildHome(old, TODAY).record).toBeNull();
  });

  it("ne trace le squat qu’à partir de trois séances, et ne met pas de pourcentage accusateur", () => {
    const one = buildHome([
      session({
        date: "2026-10-21",
        title: "Jambes",
        exercises: [exercise({ name: "Squat barre", pattern: "squat", muscles: ["quadriceps"], sets: [set({ loadKg: 100, reps: 5 })] })],
      }),
    ], TODAY);
    expect(one.squat?.curve).toBe(false);
    expect(one.squat?.caption).toBe("une séance notée");
    expect(one.squat?.delta).toBeNull();
    const three = [0, 1, 2].map((index) => session({
      date: `2026-10-${10 + index * 3}`,
      title: "Jambes",
      id: `sq-${index}`,
      exercises: [exercise({ name: "Squat barre", pattern: "squat", muscles: ["quadriceps"], sets: [set({ loadKg: 100, reps: 5 })] })],
    }));
    const curved = buildHome(three, TODAY);
    expect(curved.squat?.curve).toBe(true);
    expect(JSON.stringify(curved.volume)).not.toMatch(/%|−/);
    expect(curved.volume).not.toHaveProperty("percent");
  });

  it("présente une séance partielle comme un plancher, et compte les deux mains", () => {
    const home = buildHome([
      session({
        date: "2026-10-19",
        closed: "partial",
        exercises: [exercise({
          unit: "kg/main",
          sets: [set({ loadKg: 20, reps: 10, unit: "kg/main" })],
        })],
      }),
    ], TODAY);
    expect(home.volume.floor).toBe(true);
    expect(home.volume.text).toMatch(/notées/);
    expect(home.volume.kg).toBe(400);
    expect(home.volume.aria).toMatch(/pas le total/);
  });

  it("aligne la phrase sur trois réussites, et laisse le plan de Chef sport passer devant", () => {
    const history = [14, 7, 1].map((days) => session({
      date: `2026-10-${String(days).padStart(2, "0")}`,
      id: `h-${days}`,
    }));
    const planned = session({
      date: "2026-10-23",
      status: "planned",
      id: "next",
      exercises: [exercise({ sets: [] })],
    });
    const home = buildHome([...history, planned], TODAY);
    expect(home.cycle?.pips).toEqual(["full", "full", "full", "light"]);
    expect(home.insight).toMatch(/Trois/);
    expect(home.insight).not.toMatch(/Quatre|quatre/);
    expect(home.next?.label).toMatch(/Poussée/);
    const coach = session({
      date: "2026-10-23",
      status: "planned",
      id: "coach",
      source: "coach",
      coachNote: "Semaine en déload, on reste léger.",
      exercises: [exercise({ sets: [], note: "Contrôler la descente." })],
    });
    const held = buildHome([...history, coach], TODAY);
    expect(held.cycle).toBeNull();
    expect(held.insight).toMatch(/Chef sport/);
  });

  it("compte la poussée, le tirage, et les séries de la semaine civile", () => {
    const home = buildHome([
      session({ date: "2026-10-19", title: "Poussée" }),
      session({
        date: "2026-10-21",
        title: "Dos",
        exercises: [exercise({ name: "Rowing barre", pattern: "hpull", muscles: ["dos", "biceps"], sets: [set({ loadKg: 70, reps: 8 }), set({ loadKg: 70, reps: 8 })] })],
      }),
    ], TODAY);
    expect(home.balance).toMatchObject({ push: 3, pull: 2, upper: 5 });
    expect(home.muscles.map((item) => item.label)).toContain("Pectoraux");
    expect(home.muscles.length).toBeLessThanOrEqual(4);
    expect(home.bench?.curve).toBe(false);
  });

  it("met le record devant, et une séance en cours dans la ligne du bas", () => {
    const home = buildHome([
      session({ date: "2026-10-08", exercises: [exercise({ sets: [set({ loadKg: 80, reps: 6 })] })] }),
      session({ date: "2026-10-19", exercises: [exercise({ sets: [set({ loadKg: 82.5, reps: 6 })] })] }),
      session({ date: "2026-10-22", status: "active", title: "Upper B", exercises: [exercise({ sets: [] })] }),
    ], TODAY);
    expect(home.record?.loadKg).toBe(82.5);
    expect(home.bench).toBeNull();
    expect(home.next?.label).toBe("Upper B en cours →");
    expect(home.insight).toMatch(/Record de charge/);
  });

  it("ne prolonge pas la série de semaines avant le carnet, et ignore une série isolée dans la moyenne", () => {
    const lone = session({
      date: "2026-09-24",
      exercises: [exercise({ sets: [set({ loadKg: 60, reps: 5 })] })],
    });
    const heavy = session({
      date: "2026-10-21",
      title: "Jambes",
      exercises: [exercise({
        name: "Squat barre",
        pattern: "squat",
        muscles: ["quadriceps"],
        sets: Array.from({ length: 8 }, () => set({ loadKg: 100, reps: 5 })),
      })],
    });
    const home = buildHome([lone, heavy], TODAY);
    expect(home.heat.streak).toBeLessThan(8);
    expect(home.heat.aria).not.toMatch(/52/);
    expect(home.volume.baselineText).not.toMatch(/moy\./);
    expect(home.insight).not.toMatch(/Quatre|quatre/);
  });

  it("n’invente pas de série pour un carnet vide", () => {
    const home = buildHome([], TODAY);
    expect(home.empty).toBe(true);
    expect(home.sessions).toMatchObject({ done: 0, total: 0, extra: 0, ratio: 0 });
    expect(home.heat.rows).toHaveLength(8);
    expect(home.heat.streak).toBe(0);
    expect(home.heat.aria).toBe("Aucune semaine tenue.");
    expect(home.record).toBeNull();
    expect(home.balance).toBeNull();
    expect(home.next).toBeNull();
  });
});

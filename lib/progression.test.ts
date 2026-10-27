import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adjustmentSummary,
  applySuggestion,
  buildAdjustments,
  formatLoadDelta,
  keepsCoachPlan,
  loadProgression,
  reapplyAdjustment,
  revertAdjustment,
  saveProgression,
  setDelta,
  silenceProgression,
  programPreview,
  startOffer,
  startWithProgression,
  suggestForExercise,
  suggestionsForSession,
} from "./progression";
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
    note: partial.note,
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
  it("ne monte pas une séance prévue dure si l’effort n’a pas été noté", () => {
    const history = [doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 6 })] }))];
    const suggestion = suggestForExercise(exercise(), history, "today");
    expect(suggestion?.loadKg).toBe(80);
    expect(suggestion?.reason).toMatch(/effort n’est pas noté/);
  });

  it("propose un seul choix de charge pour toute la séance", () => {
    const history = [doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 6, rpe: 8 })] }))];
    const planned = doneSession("2026-10-24", exercise(), { id: "today", status: "planned" });
    const offer = startOffer(planned, history);
    expect(offer).toMatchObject({ kind: "choice", upLabel: "Commencer à 82,5 kg", keepLabel: "Garder 80 kg" });
  });

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

  it("ne transforme pas une charge inconnue en poids du corps", () => {
    const history = [doneSession("2026-10-01", exercise({
      sets: [set({ loadKg: null, reps: 8, rpe: 7 })],
    }))];
    const planned = exercise({ planned: { sets: 3, reps: 8, loadKg: null, restSec: 90, rpe: null } });
    const suggestion = suggestForExercise(planned, history);
    expect(suggestion?.loadKg).toBeNull();
    expect(suggestion?.reps).toBe(8);
    expect(suggestion?.changesPlan).toBe(false);
    expect(suggestion?.reason).toMatch(/Charge inconnue/);
    expect(suggestion?.reason).not.toMatch(/Poids du corps/);
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

describe("ajustement groupé", () => {
  function plannedDay(): Session {
    return {
      id: "today",
      date: "2026-10-22",
      title: "Poussée",
      status: "planned",
      source: "manual",
      exercises: [
        exercise({
          id: "a",
          sets: [
            set({ id: "w", loadKg: 60, reps: 8, warmup: true, done: false }),
            set({ id: "n", loadKg: 80, reps: null, done: false }),
            set({ id: "done", loadKg: 80, reps: 6, done: true }),
          ],
        }),
        exercise({
          id: "b",
          name: "Écarté poulie",
          stepKg: 2.5,
          planned: { sets: 3, reps: 12, loadKg: 15, restSec: 90, rpe: 8 },
          sets: [set({ id: "f", loadKg: 15, reps: null, done: false })],
        }),
      ],
    };
  }

  function history(): Session[] {
    return [
      doneSession("2026-10-01", exercise({ sets: [set({ loadKg: 80, reps: 6, rpe: 8 })] })),
      doneSession("2026-10-01", exercise({
        name: "Écarté poulie",
        stepKg: 2.5,
        planned: { sets: 3, reps: 12, loadKg: 15, restSec: 90, rpe: 8 },
        sets: [set({ loadKg: 15, reps: 12, rpe: 8 })],
      }), { id: "fly" }),
    ];
  }

  it("applique les charges au démarrage et ne les réapplique pas", () => {
    const started = startWithProgression(plannedDay(), history(), null);
    expect(started.record?.choice).toBe("pending");
    expect(adjustmentSummary(started.record?.items.length ?? 0)).toBe("2 exercices ajustés");
    expect(adjustmentSummary(1)).toBe("1 exercice ajusté");
    expect(started.session.exercises[0].planned.loadKg).toBe(82.5);
    expect(started.session.exercises[0].sets[0].loadKg).toBe(60);
    expect(started.session.exercises[0].sets[1].loadKg).toBe(82.5);
    expect(started.session.exercises[0].sets[2].loadKg).toBe(80);
    expect(started.session.exercises[1].planned.loadKg).toBe(17.5);
    expect(formatLoadDelta(2.5)).toBe("↑ +2,5 kg");
    expect(formatLoadDelta(-2.5)).toBe("↓ −2,5 kg");
    const again = startWithProgression({ ...started.session, status: "planned" }, history(), started.record);
    expect(again.session.exercises[0].planned.loadKg).toBe(82.5);
    expect(again.session.exercises[1].planned.loadKg).toBe(17.5);
  });

  it("affiche l’écart sur la série et un tap revient au plan", () => {
    const started = startWithProgression(plannedDay(), history(), null);
    const fly = started.record?.items.find((item) => item.exerciseId === "b");
    const row = started.session.exercises[1].sets[0];
    expect(setDelta(fly, row)?.text).toBe("↑ +2,5 kg");
    const reverted = revertAdjustment(started.session, fly!);
    expect(reverted.exercises[1].planned.loadKg).toBe(15);
    expect(reverted.exercises[1].sets[0].loadKg).toBe(15);
    expect(reverted.exercises[0].planned.loadKg).toBe(82.5);
    const back = reapplyAdjustment(reverted, fly!);
    expect(back.exercises[1].planned.loadKg).toBe(17.5);
    expect(back.exercises[1].sets[0].loadKg).toBe(17.5);
  });

  it("ignore tout le lot et se souvient du choix", () => {
    const started = startWithProgression(plannedDay(), history(), null);
    const ignored = (started.record?.items ?? []).reduce((current, item) => revertAdjustment(current, item), started.session);
    expect(ignored.exercises.map((item) => item.planned.loadKg)).toEqual([80, 15]);
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    saveProgression("today", { choice: "ignored", items: [] }, store);
    expect(loadProgression("today", store)?.choice).toBe("ignored");
    expect(loadProgression("autre", store)).toBeNull();
    expect(buildAdjustments(plannedDay(), history())).toHaveLength(2);
  });
});

describe("plan de reprise", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function coachDay(partial: Partial<Session> = {}, ex: Partial<ExerciseLog> = {}): Session {
    return {
      id: "sun",
      date: "2026-10-25",
      title: "Upper B",
      intention: partial.intention ?? "reprise",
      coachNote: partial.coachNote,
      status: "planned",
      source: partial.source ?? "coach",
      exercises: [
        exercise({
          id: "bench",
          name: "Développé couché barre",
          planned: { sets: 3, reps: 8, loadKg: 52.5, restSec: 180, rpe: 8 },
          sets: [set({ id: "n", loadKg: 52.5, reps: null, done: false })],
          ...ex,
        }),
      ],
    };
  }

  function heavyHistory(): Session[] {
    return [
      doneSession("2026-10-18", exercise({
        name: "Développé couché barre",
        sets: [set({ loadKg: 60, reps: 8, rpe: 9 })],
      })),
    ];
  }

  it("cite la charge du plan à côté d’un « Gardez »", () => {
    const suggestion = suggestForExercise(coachDay().exercises[0], heavyHistory(), "sun");
    expect(suggestion?.loadKg).toBe(60);
    expect(suggestion?.changesPlan).toBe(true);
    expect(suggestion?.reason).toMatch(/Gardez 60 kg/);
    expect(suggestion?.reason).toMatch(/Le plan est à 52,5 kg/);
  });

  it("garde le plan de Chef sport quand la séance est une reprise", () => {
    const session = coachDay({ coachNote: "Retour léger, récupération, on peut reprendre doucement." });
    expect(keepsCoachPlan(session)).toBe(true);
    expect(keepsCoachPlan(coachDay({ intention: "Reprise" }))).toBe(true);
    expect(keepsCoachPlan(coachDay({ intention: "hypertrophie", coachNote: "Semaine en déload." }))).toBe(true);
    expect(keepsCoachPlan(coachDay({ intention: "hypertrophie" }, { note: "Contrôler la descente." }))).toBe(true);
    expect(keepsCoachPlan(coachDay({ intention: "hypertrophie", coachNote: "Banc légèrement incliné." }))).toBe(false);
    expect(keepsCoachPlan(coachDay({ source: "manual", intention: "reprise" }))).toBe(false);
    const started = startWithProgression(session, heavyHistory(), null);
    expect(started.session.exercises[0].planned.loadKg).toBe(52.5);
    expect(started.session.exercises[0].sets[0].loadKg).toBe(52.5);
    expect(started.record?.mode).toBe("hold");
    expect(started.record?.items[0].active).toBe(false);
    expect(started.record?.items[0].toLoadKg).toBe(60);
    const again = startWithProgression(started.session, heavyHistory(), started.record);
    expect(again.session.exercises[0].planned.loadKg).toBe(52.5);
  });

  it("applique les hausses une semaine normale, et retient Ignorer après fermeture", () => {
    const normal = coachDay({ intention: "hypertrophie", coachNote: "Semaine habituelle." });
    const history = [
      doneSession("2026-10-18", exercise({
        name: "Développé couché barre",
        sets: [set({ loadKg: 52.5, reps: 8, rpe: 8 })],
      })),
    ];
    const started = startWithProgression(normal, history, null);
    expect(started.record?.mode).toBe("applied");
    expect(started.session.exercises[0].planned.loadKg).toBe(55);
    expect(silenceProgression(started.record!).choice).toBe("kept");
    expect(silenceProgression({ choice: "pending", mode: "hold", items: [] }).choice).toBe("ignored");

    const local = new Map<string, string>();
    const sessionStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => {
        local.set(key, value);
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
    });
    saveProgression("sun", { choice: "ignored", mode: "hold", items: [] });
    expect(loadProgression("sun")?.choice).toBe("ignored");
    expect(sessionStore.size).toBe(0);
  });
});

describe("suite sur plusieurs séances", () => {
  function bench(date: string, load: number, reps: number, plannedReps = reps) {
    return doneSession(date, exercise({
      planned: { sets: 4, reps: plannedReps, loadKg: load, restSec: 180, rpe: 8 },
      sets: [set({ loadKg: load, reps, rpe: 8 }), set({ loadKg: load, reps, rpe: 8 })],
    }), { id: date });
  }

  it("ajoute des répétitions après la hausse, sans confirmer exercice par exercice", () => {
    const history = [bench("2026-10-01", 80, 6)];
    const planned = doneSession("2026-10-24", exercise(), { id: "today", status: "planned" });
    const preview = programPreview(planned.exercises[0], history, { skipSessionId: "today" });
    expect(preview?.sentence).toBe("On monte la charge, puis les répétitions dans la fourchette, avec un allègement après deux échecs ou trois réussites.");
    expect(preview?.upcoming.map((step) => step.label)).toEqual(["82,5 kg × 6", "82,5 kg × 7", "82,5 kg × 8"]);
    expect(startOffer(planned, history)).toMatchObject({
      kind: "choice",
      upLabel: "Commencer à 82,5 kg",
      keepLabel: "Garder 80 kg",
    });
  });

  it("allège après deux séances sans l’objectif, en un seul choix", () => {
    const history = [bench("2026-10-08", 80, 4, 6), bench("2026-10-01", 80, 4, 6)];
    const planned = doneSession("2026-10-24", exercise(), { id: "today", status: "planned" });
    const suggestion = suggestForExercise(planned.exercises[0], history, "today");
    expect(suggestion?.loadKg).toBe(72.5);
    expect(suggestion?.reason).toMatch(/Deux séances sans l’objectif/);
    expect(startOffer(planned, history)).toMatchObject({
      kind: "choice",
      upLabel: "Commencer à 72,5 kg",
      keepLabel: "Garder 80 kg",
    });
    const preview = programPreview(planned.exercises[0], history, { skipSessionId: "today" });
    expect(preview?.sentence).toMatch(/on allège une fois/);
    expect(preview?.upcoming[0].label).toBe("72,5 kg × 6");
    expect(preview?.upcoming[1].label).toBe("80 kg × 6");
  });

  it("prévoit un allègement après trois séances réussies, sans revenir à une charge plus ancienne", () => {
    const history = [bench("2026-10-15", 85, 6), bench("2026-10-08", 82.5, 6), bench("2026-10-01", 80, 6)];
    const planned = doneSession("2026-10-24", exercise({
      planned: { sets: 4, reps: 6, loadKg: 85, restSec: 180, rpe: 8 },
    }), { id: "today", status: "planned" });
    const suggestion = suggestForExercise(planned.exercises[0], history, "today");
    expect(suggestion?.loadKg).toBe(77.5);
    expect(suggestion?.reason).toMatch(/Trois séances réussies/);
    expect(suggestion?.loadKg).toBeLessThan(85);
    const heavyThenLight = [
      bench("2026-10-15", 80, 6),
      bench("2026-10-08", 90, 6),
      bench("2026-10-01", 100, 6),
    ];
    const today = doneSession("2026-10-24", exercise(), { id: "today", status: "planned" });
    expect(suggestForExercise(today.exercises[0], heavyThenLight, "today")?.loadKg).toBe(82.5);
  });

  it("ne modifie pas un plan de Chef sport en montrant la suite", () => {
    const history = [bench("2026-10-01", 80, 6)];
    const planned = doneSession("2026-10-24", exercise(), { id: "today", status: "planned", source: "coach" });
    const before = JSON.stringify(planned);
    const preview = programPreview(planned.exercises[0], history, { coachPlan: true, skipSessionId: "today" });
    expect(JSON.stringify(planned)).toBe(before);
    expect(preview?.sentence).toMatch(/Chef sport reste prioritaire/);
    expect(preview?.upcoming[0].label).toBe("82,5 kg × 6");
    expect(planned.exercises[0].planned.loadKg).toBe(80);
    expect(startOffer(planned, history).kind).toBe("choice");
  });
});

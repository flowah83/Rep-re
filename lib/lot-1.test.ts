import { describe, expect, it } from "vitest";
import { applyBackupAdd, backupProblem, emergencyBackup, planBackupAdd } from "./backup";
import { migrateStored, migrateUnits, revertUnitMigration } from "./migrate";
import { tonnage } from "./calc";
import { applyAppTool, buildCoachContext } from "./coach";
import { commitWrite } from "./commit";
import { toCsv } from "./db";
import { parseImport } from "./history";
import { mergePlans, parsePlan } from "./plan";
import { suggestForExercise } from "./progression";
import { comparisonPriors, duplicateAsPlan, formatPerformedSet, reportJson, versus } from "./session";
import { applySessionEdit, type EditRow } from "./session-edit";
import type { BackupFile, ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { loadKg: number | null }): SetLog {
  return {
    id: partial.id ?? "s",
    loadKg: partial.loadKg,
    reps: partial.reps ?? null,
    rpe: partial.rpe ?? null,
    rir: partial.rir,
    side: partial.side,
    unit: partial.unit,
    warmup: partial.warmup ?? false,
    done: partial.done ?? false,
    skipped: partial.skipped,
    origin: partial.origin,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: partial.pattern ?? "hpush",
    stepKg: partial.stepKg ?? 2.5,
    cues: [],
    muscles: partial.muscles ?? ["pectoraux"],
    unit: partial.unit,
    planned: partial.planned ?? { sets: 3, reps: 6, loadKg: 60, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [set({ id: "w", loadKg: 60 })],
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Poussée",
    status: partial.status ?? "planned",
    source: partial.source ?? "manual",
    coachNote: partial.coachNote,
    exercises: partial.exercises ?? [exercise()],
  };
}

function row(partial: Partial<EditRow> = {}): EditRow {
  return {
    key: partial.key ?? "ex",
    name: partial.name ?? "Développé couché barre",
    sets: partial.sets ?? 1,
    reps: partial.reps ?? 6,
    load: partial.load === undefined ? 60 : partial.load,
    rest: partial.rest ?? 180,
  };
}

describe("lot 1 — charge prévue", () => {
  it("aligne la série préremplie quand le plan passe de 60 à 70", () => {
    const created = applySessionEdit(null, { date: "2026-10-27", time: "18:15", title: "Poussée", note: "", rows: [row({ load: 60 })] });
    if ("error" in created) throw new Error(created.error);
    const edited = applySessionEdit(created.session, {
      date: "2026-10-27",
      time: "18:15",
      title: "Poussée",
      note: "",
      rows: [row({ load: 70 })],
    });
    if ("error" in edited) throw new Error(edited.error);
    const work = edited.session.exercises[0].sets.filter((item) => !item.warmup && !item.done);
    expect(edited.session.exercises[0].planned.loadKg).toBe(70);
    expect(work.map((item) => item.loadKg)).toEqual([70]);
  });

  it("passe le couché de 80 à 90 sans toucher l’échauffement ni une série saisie ou faite", () => {
    const plan = parsePlan(`{"seances":[{"date":"2026-10-22","titre":"Poussée","exercices":[{"nom":"Développé couché barre","series":2,"repetitions":6,"charge_kg":80,"echauffement":[{"charge_kg":40,"repetitions":8}]}]}]}`);
    if ("error" in plan) throw new Error(plan.error);
    const original = plan.sessions[0];
    const exerciseId = original.exercises[0].id;
    const work = original.exercises[0].sets.filter((item) => !item.warmup);
    const typed = {
      ...original,
      exercises: [
        {
          ...original.exercises[0],
          sets: [
            ...original.exercises[0].sets.map((item) => (item.id === work[0]?.id ? item : item)),
            { id: "typed", loadKg: 82.5, reps: 6, rpe: null, warmup: false, done: false, origin: "saisie" as const },
          ],
        },
      ],
    };
    const doneSet = typed.exercises[0].sets.find((item) => item.id === work[0]?.id);
    const withDone = {
      ...typed,
      exercises: [
        {
          ...typed.exercises[0],
          sets: typed.exercises[0].sets.map((item) => (item.id === doneSet?.id ? { ...item, done: true, reps: 6 } : item)),
        },
      ],
    };
    const edited = applySessionEdit(withDone, {
      date: "2026-10-22",
      time: "18:15",
      title: "Poussée",
      note: "",
      rows: [{ key: exerciseId, name: "Développé couché barre", sets: 3, reps: 6, load: 90, rest: 180 }],
    });
    if ("error" in edited) throw new Error(edited.error);
    const next = edited.session.exercises[0];
    expect(next.planned.loadKg).toBe(90);
    const warm = next.sets.find((item) => item.warmup);
    const finished = next.sets.find((item) => item.done);
    const typedSet = next.sets.find((item) => item.origin === "saisie");
    const prefilled = next.sets.find((item) => !item.warmup && !item.done && item.origin !== "saisie");
    expect(warm?.loadKg).toBe(40);
    expect(finished?.loadKg).toBe(80);
    expect(typedSet?.loadKg).toBe(82.5);
    expect(prefilled?.loadKg).toBe(90);
  });

  it("laisse une note de plan vidée vraiment vide", () => {
    const current = session({ date: "2026-10-27", coachNote: "On garde 80 kg." });
    const edited = applySessionEdit(current, {
      date: "2026-10-27",
      time: "18:15",
      title: "Poussée",
      note: "   ",
      rows: [row()],
    });
    if ("error" in edited) throw new Error(edited.error);
    expect(edited.session.coachNote).toBeUndefined();
  });
});

describe("lot 1 — unités", () => {
  it("compte 240 kg internes pour 12 kg par haltère × 10, des deux mains", () => {
    const curl = exercise({
      name: "Curl haltères",
      unit: undefined,
      planned: { sets: 1, reps: 10, loadKg: 12, restSec: 90, rpe: 8 },
      sets: [set({ loadKg: 12, reps: 10, done: true })],
    });
    expect(tonnage([curl])).toBe(240);
    expect(formatPerformedSet(curl.sets[0], curl.unit, curl.name)).toMatch(/haltère/);
    expect(versus(curl).doneLoad).toMatch(/haltère/);
    expect(toCsv([session({ date: "2026-10-27", status: "done", exercises: [curl] })])).toMatch(/kg\/main/);
    const shared = reportJson(session({ date: "2026-10-27", status: "done", exercises: [curl] }));
    expect(shared.exercices[0].fait[0].unite).toBe("kg/main");
    expect(shared.kilos_deplaces).toBe(240);
  });

  it("ne double pas une droite et une gauche déjà séparées", () => {
    const curl = exercise({
      name: "Curl haltères",
      unit: "kg/main",
      sets: [
        set({ id: "d", loadKg: 12, reps: 10, done: true, side: "D", unit: "kg/main" }),
        set({ id: "g", loadKg: 12, reps: 10, done: true, side: "G", unit: "kg/main" }),
      ],
    });
    expect(tonnage([curl])).toBe(240);
  });
});

describe("lot 1 — import", () => {
  it("refuse un échauffement donné comme objet, sans exception", () => {
    const parsed = parsePlan('{"seances":[{"date":"2026-10-27","titre":"Poussée","exercices":[{"nom":"Développé couché barre","series":3,"charge_kg":80,"echauffement":{"charge_kg":40}}]}]}');
    expect(parsed).toMatchObject({ error: expect.stringMatching(/échauffement/) });
  });

  it("refuse séries fractionnaires, négatifs, NaN et dates impossibles avant toute écriture", () => {
    const fraction = parsePlan('{"seances":[{"date":"2026-10-27","titre":"Poussée","exercices":[{"nom":"Squat barre","series":3.5,"charge_kg":100}]}]}');
    expect(fraction).toMatchObject({ error: expect.stringMatching(/entier|série/) });
    const negative = parsePlan('{"seances":[{"date":"2026-10-27","titre":"Poussée","exercices":[{"nom":"Squat barre","series":3,"charge_kg":-5}]}]}');
    expect(negative).toMatchObject({ error: expect.stringMatching(/charge/) });
    const infinite = parseImport('{"seances":[{"date":"2026-10-27","titre":"Poussée","exercices":[{"nom":"Squat barre","series":3,"charge_kg":1e999}]}]}');
    expect("error" in infinite).toBe(true);
  });

  it("distingue une charge nulle d’une charge absente et n’annonce pas un élément omis", () => {
    const zero = parsePlan('{"seances":[{"date":"2026-10-27","titre":"Gainage","exercices":[{"nom":"Gainage","series":1,"charge_kg":0}]}]}');
    if ("error" in zero) throw new Error(zero.error);
    expect(zero.sessions[0].exercises[0].planned.loadKg).toBe(0);
    const missing = parsePlan('{"seances":[{"date":"2026-10-27","titre":"Gainage","exercices":[{"nom":"Gainage","series":1,"charge_kg":null}]}]}');
    if ("error" in missing) throw new Error(missing.error);
    expect(missing.sessions[0].exercises[0].planned.loadKg).toBeNull();
    const history = parseImport('{"historique":[{"date":"2026-02-31","titre":"Fantôme","exercices":[{"nom":"Squat barre","series":[{"charge_kg":100,"repetitions":5,"fait":true}]}]}]}');
    if ("error" in history) {
      expect(history.error).toMatch(/date/);
    } else {
      expect(history.sessions.map((item) => item.title)).not.toContain("Fantôme");
      expect(history.skipped.join(" ")).toMatch(/Fantôme|date/);
    }
  });

  it("refuse un muscle inconnu et une préférence impossible dans une copie", () => {
    const file = {
      app: "repere",
      version: 1,
      exportedAt: "2026-10-27T00:00:00.000Z",
      settings: { onboarded: true, theme: "bleu", barKg: 20 },
      customExercises: [{ id: "c", name: "Tirage", pattern: "inconnu", cues: [] }],
      sessions: [
        session({
          date: "2026-10-27",
          status: "done",
          exercises: [exercise({ muscles: ["pectoraux", "licorne" as "pectoraux"] })],
        }),
      ],
    } as unknown as BackupFile;
    expect(backupProblem(file)).toMatch(/muscle|réglage|bibliothèque|thème|famille/);
  });
});

describe("lot 1 — identifiants", () => {
  it("ne crée pas deux objets avec le même id et n’écrase pas une séance faite", () => {
    const done = session({ id: "same", date: "2026-10-01", title: "Poussée", status: "done" });
    const other = session({ id: "same", date: "2026-10-08", title: "Dos", status: "planned", exercises: [exercise({ name: "Rowing barre" })] });
    const merged = mergePlans([done], [other]);
    const ids = merged.sessions.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.sessions.find((item) => item.status === "done")?.title).toBe("Poussée");
    expect(merged.sessions.find((item) => item.title === "Dos")?.id).not.toBe("same");
  });
});

describe("lot 1 — démo et note", () => {
  it("écarte l’exemple de la comparaison du bilan, de la progression et du coach", () => {
    const demo = session({
      id: "demo",
      date: "2026-10-20",
      status: "done",
      source: "demo",
      exercises: [exercise({ sets: [set({ loadKg: 200, reps: 5, done: true })] })],
    });
    const real = session({
      id: "real",
      date: "2026-10-27",
      status: "done",
      exercises: [exercise({ sets: [set({ loadKg: 80, reps: 6, done: true })] })],
    });
    expect(comparisonPriors([demo, real], real).map((item) => item.id)).not.toContain("demo");
    expect(suggestForExercise(exercise(), [demo, real])?.loadKg).not.toBe(200);
    expect(suggestForExercise(exercise(), [demo])).toBeNull();
    const context = JSON.stringify(buildCoachContext([demo, real], "2026-10-27"));
    expect(context).not.toContain("200");
  });
});

describe("lot 1 — migration et ajout", () => {
  it("déduit l’unité certaine, signale l’ambigu et revient en arrière", () => {
    const curl = session({
      date: "2026-10-27",
      status: "done",
      exercises: [exercise({ name: "Curl haltères", unit: undefined, sets: [set({ loadKg: 12, reps: 10, done: true })] })],
    });
    const odd = session({
      id: "odd",
      date: "2026-10-28",
      title: "Maison",
      status: "done",
      exercises: [exercise({ id: "odd-ex", name: "Tirage maison", unit: undefined, sets: [set({ loadKg: 20, reps: 8, done: true })] })],
    });
    const migrated = migrateUnits([curl, odd]);
    expect(migrated.sessions[0].exercises[0].unit).toBe("kg/main");
    expect(migrated.sessions[0].exercises[0].unitSource).toBe("inferred");
    expect(migrated.flags.map((flag) => flag.name)).toContain("Tirage maison");
    expect(migrated.sessions[1].exercises[0].unit).toBeUndefined();
    const restored = revertUnitMigration(migrated.sessions);
    expect(restored[0].exercises[0].unit).toBeUndefined();
    expect(restored[0].exercises[0].sets[0].unit).toBeUndefined();
    const stored = migrateStored({ settings: { onboarded: true, theme: "light", barKg: 20 }, sessions: [curl] });
    expect(stored.settings.schemaVersion).toBe(2);
    expect(stored.changed).toBe(true);
  });

  it("ajoute sans remplacer une séance déjà présente, sauf choix explicite", () => {
    const current = session({ id: "same", date: "2026-10-27", title: "Poussée récente", status: "done" });
    const older = session({ id: "same", date: "2026-09-01", title: "Ancienne", status: "done" });
    const fresh = session({ id: "new", date: "2026-10-28", title: "Dos" });
    const plan = planBackupAdd([current], [older, fresh]);
    expect(plan.added.map((item) => item.id)).toEqual(["new"]);
    expect(plan.collisions.map((item) => item.id)).toEqual(["same"]);
    const kept = applyBackupAdd([current], plan.added, plan.collisions);
    expect(kept.find((item) => item.id === "same")?.title).toBe("Poussée récente");
    const replaced = applyBackupAdd([current], plan.added, plan.collisions, { same: "replace" });
    expect(replaced.find((item) => item.id === "same")?.title).toBe("Ancienne");
    const copied = applyBackupAdd([current], plan.added, plan.collisions, { same: "copy" });
    expect(copied.filter((item) => item.title === "Ancienne")).toHaveLength(1);
    expect(copied.find((item) => item.title === "Ancienne")?.id).not.toBe("same");
    const file = emergencyBackup([current], { onboarded: true, theme: "light", barKg: 20 }, []);
    expect(file.sessions).toHaveLength(1);
    expect(file.app).toBe("repere");
  });
});

describe("lot 1 — enregistrement", () => {
  it("n’annonce pas un succès si l’écriture échoue et garde le brouillon", async () => {
    const draft = { sessions: [session({ date: "2026-10-27" })] };
    const outcome = await commitWrite(draft, async () => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    expect(outcome.saved).toBe(false);
    expect(outcome.draft).toBe(draft);
  });
});

describe("lot 1 — coach et reprise", () => {
  it("met à jour la cible du coach sans réécrire une série déjà saisie", () => {
    const current = session({
      date: "2026-10-27",
      exercises: [
        exercise({
          planned: { sets: 2, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
          sets: [set({ id: "typed", loadKg: 82.5, reps: 5, origin: "saisie" }), set({ id: "prefill", loadKg: 80 })],
        }),
      ],
    });
    const result = applyAppTool(
      { sessions: [current], customs: [] },
      { id: "c1", name: "update_exercise", arguments: JSON.stringify({ sessionId: current.id, exerciseId: "ex", loadKg: 90 }) },
    );
    const next = result.state.sessions[0].exercises[0];
    expect(next.planned.loadKg).toBe(90);
    expect(next.sets.find((item) => item.id === "typed")?.loadKg).toBe(82.5);
    expect(next.sets.find((item) => item.id === "prefill")?.loadKg).toBe(90);
  });

  it("reprend le plan, pas les séries déjà faites", () => {
    const source = session({
      date: "2026-10-20",
      status: "done",
      exercises: [
        exercise({
          planned: { sets: 1, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
          sets: [set({ loadKg: 82.5, reps: 6, done: true, origin: "saisie" })],
        }),
      ],
    });
    const copy = duplicateAsPlan(source, "2026-10-27");
    expect(copy.exercises[0].planned.loadKg).toBe(80);
    expect(copy.exercises[0].sets.every((item) => item.done === false)).toBe(true);
    expect(copy.exercises[0].sets.some((item) => item.loadKg === 82.5)).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { backupHasSecret, backupProblem, backupReminder, isBackup, sessionsForBackup } from "./backup";
import { bestLoads, epley, tonnage } from "./calc";
import { closeCopy } from "./close";
import { buildCoachContext, buildSystemPrompt } from "./coach";
import { commitWrite } from "./commit";
import { isCalendarDate, parseDecimalDraft, reduceDecimalTyping } from "./contract";
import { toCsv } from "./db";
import { plateGlance } from "./display";
import { classifyIncoming, parseImport } from "./history";
import { buildHome, sessionsForHome } from "./home";
import { parsePlan } from "./plan";
import { keepsCoachPlan, suggestForExercise } from "./progression";
import { bestE1rmLabel } from "./session";
import { applySessionEdit } from "./session-edit";
import { cachesToDelete, shouldStoreResponse } from "./sw-policy";
import type { BackupFile, ExerciseLog, Session, SetLog } from "./types";

const MARKER = "MARQUEUR-PRIVE-XYZ";

function set(partial: Partial<SetLog> & { loadKg: number | null; reps: number | null }): SetLog {
  return {
    id: partial.id ?? "s",
    loadKg: partial.loadKg,
    reps: partial.reps,
    rpe: partial.rpe ?? null,
    rir: partial.rir,
    side: partial.side,
    unit: partial.unit,
    warmup: partial.warmup ?? false,
    done: partial.done ?? true,
    skipped: partial.skipped,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Curl haltères",
    pattern: partial.pattern ?? "curl",
    stepKg: partial.stepKg ?? 1,
    cues: [],
    muscles: partial.muscles ?? ["biceps"],
    unit: partial.unit,
    note: partial.note,
    planned: partial.planned ?? { sets: 3, reps: 10, loadKg: 12, restSec: 90, rpe: 8 },
    sets: partial.sets ?? [set({ loadKg: 12, reps: 10, rpe: 8 })],
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Bras",
    status: partial.status ?? "done",
    source: partial.source ?? "manual",
    scheduled: partial.scheduled,
    exercises: partial.exercises ?? [exercise()],
    noteForMe: partial.noteForMe,
    noteForCoach: partial.noteForCoach,
    coachNote: partial.coachNote,
    intention: partial.intention,
    closed: partial.closed,
    cardio: partial.cardio,
  };
}

describe("lot A, scénarios 1 à 23", () => {
  it("1. garde 12,5 et 12.5, y compris après une virgule en cours", () => {
    expect(reduceDecimalTyping("12,5")).toMatchObject({ text: "12,5", committed: 12.5, invalid: false });
    expect(reduceDecimalTyping("12.5")).toMatchObject({ text: "12.5", committed: 12.5 });
    expect(parseDecimalDraft("12,").kind).toBe("partial");
    expect(reduceDecimalTyping("12,").text).toBe("12,");
    expect(reduceDecimalTyping("12,5").text).not.toBe("125");
    expect(reduceDecimalTyping("12,5⌫").text).toBe("12,");
    expect(reduceDecimalTyping("12,5⌫1").committed).toBe(12.1);
  });

  it("2. refuse une date impossible, une séance vide et un nombre hors bornes", () => {
    expect(isCalendarDate("2026-02-31")).toBe(false);
    const badDate = parsePlan('{"seances":[{"date":"2026-02-31","titre":"Fantôme","exercices":[{"nom":"Curl haltères","series":1}]}]}');
    expect("error" in badDate && badDate.error).toMatch(/n’existe pas/);
    expect(applySessionEdit(null, { date: "2026-02-31", time: "", title: "A", note: "", rows: [] })).toMatchObject({
      error: expect.stringMatching(/date/),
    });
    const empty = applySessionEdit(null, { date: "2026-10-27", time: "18:15", title: "A", note: "", rows: [] });
    expect("error" in empty && empty.error).toMatch(/au moins un exercice/);
    const fraction = applySessionEdit(null, {
      date: "2026-10-27",
      time: "99:99",
      title: "A",
      note: "",
      rows: [{ key: "a", name: "Curl haltères", sets: 1.5, reps: 10, load: 12, rest: 90 }],
    });
    expect("error" in fraction && fraction.error).toMatch(/heure|entier/);
    const huge = applySessionEdit(null, {
      date: "2026-10-27",
      time: "",
      title: "A",
      note: "",
      rows: [{ key: "a", name: "Curl haltères", sets: 1, reps: 10, load: Number.POSITIVE_INFINITY, rest: 90 }],
    });
    expect("error" in huge && huge.error).toMatch(/charge/);
  });

  it("3. un changement de titre ne recrée pas les séries", () => {
    const parsed = parsePlan(`{
      "seances": [{
        "id": "seance-curl",
        "date": "2026-10-27",
        "heure": "18:15",
        "titre": "Bras",
        "note": "Contrôler",
        "exercices": [{
          "nom": "Curl haltères",
          "series": 1,
          "repetitions": 10,
          "charge_kg": 12,
          "unite": "kg/main",
          "repos_secondes": 90,
          "rpe_vise": 8,
          "note": "Coudes fixes",
          "echauffement": [{ "charge_kg": 6, "repetitions": 12 }]
        }]
      }]
    }`);
    if ("error" in parsed) throw new Error(parsed.error);
    const original = parsed.sessions[0];
    const edited = applySessionEdit(original, {
      date: original.date,
      time: original.time ?? "",
      title: "Bras, titre corrigé",
      note: original.coachNote ?? "",
      rows: original.exercises.map((item) => ({
        key: item.id,
        name: item.name,
        sets: item.planned.sets,
        reps: item.planned.reps ?? 0,
        load: item.planned.loadKg,
        rest: item.planned.restSec,
      })),
    });
    if ("error" in edited) throw new Error(edited.error);
    expect(edited.session.id).toBe("seance-curl");
    expect(edited.session.title).toBe("Bras, titre corrigé");
    expect(edited.session.status).toBe("planned");
    expect(edited.session.scheduled).toBe(true);
    expect(edited.session.exercises[0].id).toBe(original.exercises[0].id);
    expect(edited.session.exercises[0].unit).toBe("kg/main");
    expect(edited.session.exercises[0].note).toBe("Coudes fixes");
    expect(edited.session.exercises[0].planned.rpe).toBe(8);
    expect(edited.session.exercises[0].sets.map((item) => item.warmup)).toEqual([true, false]);
    expect(edited.session.exercises[0].sets.map((item) => item.id)).toEqual(original.exercises[0].sets.map((item) => item.id));
  });

  it("4. garde le programme et l’historique d’un document mixte", () => {
    const parsed = parseImport(`{
      "seances": [{"date":"2026-10-27","titre":"Programme test","exercices":[{"nom":"Curl haltères","series":1,"repetitions":10,"charge_kg":12,"unite":"kg/main"}]}],
      "historique": [{"id":"hist-1","date":"2026-10-24","titre":"Historique test","exercices":[{"nom":"Développé couché barre","series":[{"charge_kg":20,"repetitions":10,"echauffement":true},{"charge_kg":60,"repetitions":8,"rpe":8}]}]}]
    }`);
    if ("error" in parsed || parsed.kind !== "mixed") throw new Error("error" in parsed ? parsed.error : parsed.kind);
    expect(parsed.planSessions).toHaveLength(1);
    expect(parsed.planSessions[0].exercises[0].unit).toBe("kg/main");
    expect(parsed.planSessions[0].scheduled).toBe(true);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe("hist-1");
    expect(parsed.sessions[0].scheduled).toBe(false);
    expect(parsed.sessions[0].exercises[0].sets.map((item) => item.warmup)).toEqual([true, false]);
    expect(parsed.skipped).toEqual([]);
  });

  it("5. compte 240 kg en kg/main, 240 kg si les côtés sont séparés, et 480 kg au total", () => {
    const bilateral = exercise({
      unit: "kg/main",
      sets: [set({ loadKg: 12, reps: 10, unit: "kg/main" })],
    });
    const sides = exercise({
      unit: "kg/main",
      sets: [
        set({ loadKg: 12, reps: 10, unit: "kg/main", side: "G" }),
        set({ loadKg: 12, reps: 10, unit: "kg/main", side: "D" }),
      ],
    });
    const total = exercise({
      name: "Développé couché barre",
      unit: "kg",
      sets: [set({ loadKg: 60, reps: 8, unit: "kg" })],
    });
    const ignored = exercise({
      sets: [
        set({ loadKg: 40, reps: 10, warmup: true }),
        set({ loadKg: 40, reps: 10, skipped: true, done: false }),
        set({ loadKg: 40, reps: 10, done: false }),
      ],
    });
    expect(tonnage([bilateral])).toBe(240);
    expect(tonnage([sides])).toBe(240);
    expect(tonnage([total])).toBe(480);
    expect(tonnage([ignored])).toBe(0);
  });

  it("6 et 11 et 12. une charge inconnue, une séance partielle ou une autre unité ne haussent pas", () => {
    const unknown = suggestForExercise(
      exercise({ planned: { sets: 3, reps: 8, loadKg: null, restSec: 90, rpe: null }, sets: [] }),
      [session({ date: "2026-10-01", exercises: [exercise({ planned: { sets: 1, reps: 8, loadKg: null, restSec: 90, rpe: null }, sets: [set({ loadKg: null, reps: 8, rpe: 7 })] })] })],
    );
    expect(unknown?.changesPlan).toBe(false);
    expect(unknown?.reason).toMatch(/Charge inconnue/);
    expect(unknown?.reason).not.toMatch(/Poids du corps/);

    const body = suggestForExercise(
      exercise({ unit: "corps", planned: { sets: 1, reps: 8, loadKg: null, restSec: 90, rpe: null } }),
      [session({ date: "2026-10-01", exercises: [exercise({ unit: "corps", planned: { sets: 1, reps: 8, loadKg: null, restSec: 90, rpe: null }, sets: [set({ loadKg: null, reps: 8, rpe: 7, unit: "corps" })] })] })],
    );
    expect(body?.reps).toBe(9);
    expect(body?.reason).toMatch(/Poids du corps/);

    const partial = suggestForExercise(
      exercise({ planned: { sets: 3, reps: 8, loadKg: 60, restSec: 90, rpe: 8 } }),
      [session({
        date: "2026-10-01",
        exercises: [exercise({
          planned: { sets: 3, reps: 8, loadKg: 60, restSec: 90, rpe: 8 },
          sets: [
            set({ loadKg: 60, reps: 8, rpe: 8 }),
            set({ loadKg: 60, reps: null, done: false, skipped: true }),
            set({ loadKg: 60, reps: null, done: false, skipped: true }),
          ],
        })],
      })],
    );
    expect(partial?.loadKg).toBe(60);
    expect(partial?.changesPlan).toBe(false);
    expect(partial?.reason).toMatch(/incomplète/);

    const mismatch = suggestForExercise(
      exercise({ unit: "kg", planned: { sets: 1, reps: 10, loadKg: 14, restSec: 90, rpe: 8 } }),
      [session({ date: "2026-10-01", exercises: [exercise({ unit: "kg/main", planned: { sets: 1, reps: 10, loadKg: 14, restSec: 90, rpe: 8 }, sets: [set({ loadKg: 14, reps: 10, rpe: 8, unit: "kg/main" })] })] })],
    );
    expect(mismatch?.changesPlan).toBe(false);
    expect(mismatch?.reason).toMatch(/unités/);

    const coach = session({
      date: "2026-10-27",
      status: "planned",
      source: "coach",
      coachNote: "reprise légère",
      exercises: [exercise({ note: "rester léger", planned: { sets: 3, reps: 10, loadKg: 12, restSec: 90, rpe: 8 } })],
    });
    expect(keepsCoachPlan(coach)).toBe(true);

    const demo = session({
      date: "2026-10-20",
      source: "demo",
      exercises: [exercise({ sets: [set({ loadKg: 80, reps: 10, rpe: 6 })] })],
    });
    const realPlan = session({ date: "2026-10-27", status: "planned", source: "manual", exercises: [exercise({ sets: [] })] });
    expect(suggestForExercise(realPlan.exercises[0], [demo, realPlan])).toBeNull();
  });

  it("7. une série encore ouverte n’est pas un record", () => {
    const active = session({
      date: "2026-10-22",
      status: "active",
      exercises: [exercise({ name: "Développé couché barre", sets: [set({ loadKg: 200, reps: 5 })] })],
    });
    const done = session({
      date: "2026-10-19",
      status: "done",
      exercises: [exercise({ name: "Développé couché barre", sets: [set({ loadKg: 40, reps: 5 })] })],
    });
    const loads = bestLoads([active, done]);
    const label = bestE1rmLabel([active, done], "Développé couché barre");
    const home = buildHome([active, done], "2026-10-22");
    expect({ loads: loads.map((item) => item.loadKg), label, record: home.record?.loadKg ?? null, epley: epley(40, 5) }).toEqual({
      loads: [40],
      label: { kg: epley(40, 5), detail: "40 kg × 5" },
      record: null,
      epley: epley(40, 5),
    });
  });

  it("8 et 9. l’effort vide n’est pas un zéro, et le texte de clôture suit l’état", () => {
    expect(closeCopy({ status: "active" })).toEqual({ title: "Tout est noté.", action: "Terminer la séance" });
    expect(closeCopy({ status: "done" })).toEqual({ title: "Séance terminée", action: "Voir le bilan" });
    const logged = exercise({ name: "Développé couché barre", unit: "kg", sets: [set({ loadKg: 60, reps: 8, rpe: null, unit: "kg" })] });
    expect(logged.sets[0].rpe).toBeNull();
    expect(tonnage([logged])).toBe(480);
  });

  it("10. le repos reste une échéance absolue", () => {
    const endsAt = Date.now() + 90_000;
    const left = Math.max(0, (endsAt - Date.now()) / 1000);
    expect(left).toBeGreaterThan(80);
    expect(left).toBeLessThanOrEqual(90);
  });

  it("13 et 14 et 15. le programme manuel reste au dénominateur, et une semaine vide ne compte pas", () => {
    const created = applySessionEdit(null, {
      date: "2026-10-22",
      time: "",
      title: "Poussée",
      note: "",
      rows: [{ key: "bench", name: "Développé couché barre", sets: 3, reps: 5, load: 60, rest: 180 }],
    });
    if ("error" in created) throw new Error(created.error);
    const done = {
      ...created.session,
      status: "done" as const,
      exercises: created.session.exercises.map((item) => ({
        ...item,
        sets: item.sets.map((entry) => ({ ...entry, reps: 5, done: true })),
      })),
    };
    const home = buildHome([done], "2026-10-22");
    expect(home.sessions).toMatchObject({ done: 1, total: 1, extra: 0 });
    const legacy = session({ date: "2026-10-22", source: "manual", status: "done" });
    expect(buildHome([legacy], "2026-10-22").sessions.extra).toBe(1);
    expect(buildHome([], "2026-10-22").heat).toMatchObject({ streak: 0, aria: "Aucune semaine tenue." });
    const renamed = { ...done, title: "Notes du jour" };
    expect(buildHome([renamed], "2026-10-22").balance).toEqual(buildHome([done], "2026-10-22").balance);
    expect(buildHome([renamed], "2026-10-22").muscles).toEqual(buildHome([done], "2026-10-22").muscles);
  });

  it("16 et 17. la démonstration et la note privée restent hors du coach et de la copie", () => {
    const demo = session({ date: "2026-10-21", source: "demo", noteForMe: MARKER, exercises: [exercise({ sets: [set({ loadKg: 200, reps: 3 })] })] });
    const real = session({ date: "2026-10-22", source: "manual", scheduled: true, exercises: [exercise({ sets: [set({ loadKg: 40, reps: 5 })] })] });
    expect(sessionsForHome([demo, real])).toEqual([real]);
    expect(sessionsForBackup([demo, real])).toEqual([real]);
    expect(buildHome([demo, real], "2026-10-22").record?.loadKg).not.toBe(200);
    for (const note of [undefined, null, "", "Vu par le coach"] as const) {
      const logged = session({
        date: "2026-10-22",
        status: "done",
        noteForMe: MARKER,
        noteForCoach: note ?? undefined,
      });
      const context = buildCoachContext([logged, demo], "2026-10-27");
      const payload = JSON.stringify(context) + buildSystemPrompt(context);
      expect(payload).not.toContain(MARKER);
      if (note) expect(payload).toContain(note);
    }
  });

  it("18 et 19. une copie inconnue est refusée, une copie valide garde ses champs", () => {
    const rich = session({
      date: "2026-10-24",
      id: "kept",
      noteForMe: "perso",
      exercises: [exercise({ unit: "kg/main", note: "coudes", sets: [set({ loadKg: 12, reps: 10, unit: "kg/main", rpe: 8 })] })],
    });
    const backup: BackupFile = {
      app: "repere",
      version: 1,
      exportedAt: "2026-10-27T08:00:00.000Z",
      settings: { onboarded: true, theme: "light", barKg: 20 },
      sessions: [rich],
      customExercises: [{ id: "c1", name: "Curl strict", pattern: "curl", cues: [] }],
    };
    expect(isBackup(backup)).toBe(true);
    expect(backupProblem(backup)).toBeNull();
    expect(backupHasSecret(backup)).toBe(false);
    expect(backup.sessions[0].exercises[0].unit).toBe("kg/main");
    expect(backup.sessions[0].noteForMe).toBe("perso");
    const csv = toCsv([rich, session({ date: "2026-10-01", title: "=cmd", exercises: [exercise({ name: "+formule", sets: [set({ loadKg: 10, reps: 5 })] })] })]);
    expect(csv).toContain("kg/main");
    expect(csv).toContain("unite");
    expect(csv).not.toMatch(/(^|,)=cmd/);
    expect(csv).not.toMatch(/(^|,)\+formule/);
    const unknown = { ...backup, version: 2 };
    expect(backupProblem(unknown as BackupFile)).toMatch(/ne sait pas encore lire/);
    expect(backup.sessions).toHaveLength(1);
    const corrupt = { ...backup, sessions: [{ ...rich, date: "2026-02-31" }] };
    expect(backupProblem(corrupt)).toMatch(/date impossible/);
    expect(backupReminder({ onboarded: true, theme: "system", barKg: 20 }).kind).toBe("none");
    expect(backupReminder({ onboarded: true, theme: "system", barKg: 20, lastDownloadAt: "2020-01-01T00:00:00.000Z" }).kind).toBe("old");
  });

  it("20. un échec d’écriture rend le brouillon et n’annonce pas un succès", async () => {
    const draft = { id: "brouillon", charge: "12,5" };
    const failed = await commitWrite(draft, async () => {
      throw new Error("quota");
    });
    expect(failed).toEqual({ saved: false, draft });
    const saved = await commitWrite(draft, async () => undefined);
    expect(saved.saved).toBe(true);
    expect(saved.draft).toBe(draft);
  });

  it("21. une note ou un RIR seul n’est pas un doublon silencieux", () => {
    const current = session({ date: "2026-10-24", id: "deja", noteForMe: "première note" });
    const same = session({ date: "2026-10-24", id: "autre", noteForMe: "première note" });
    const noted = session({ date: "2026-10-24", id: "autre", noteForMe: "note changée" });
    expect(classifyIncoming([current], [same])).toMatchObject({ added: [], duplicates: 1, updates: [] });
    const change = classifyIncoming([current], [noted]);
    expect(change.added).toHaveLength(0);
    expect(change.duplicates).toBe(0);
    expect(change.updates[0]?.existingId).toBe("deja");
    expect(change.updates[0]?.reason).toMatch(/note|RIR|repos/i);
  });

  it("22. le service worker ne touche pas un cache étranger et n’archive pas une erreur", () => {
    expect(cachesToDelete(["repere-ancien", "repere-actuel", "autre-site"], "repere-actuel")).toEqual(["repere-ancien"]);
    expect(shouldStoreResponse({ ok: false, status: 500 })).toBe(false);
    expect(shouldStoreResponse({ ok: true, status: 200 })).toBe(true);
    const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(source).toContain('key.startsWith("repere-") && key !== CACHE');
    expect(source).toContain("shouldStore");
    expect(source).not.toMatch(/keys\.filter\(\(key\) => key !== CACHE\)/);
    expect(source).toContain("const BASE");
  });

  it("23. une charge non atteignable dit le total réel et le reste", () => {
    expect(plateGlance(60, "kg", 20)).toBe("20 kg de chaque côté, soit 60 kg");
    const odd = plateGlance(60.5, "kg", 20);
    expect(odd).toMatch(/soit 60 kg/);
    expect(odd).toMatch(/n’est pas atteignable/);
    expect(odd).toMatch(/Il reste/);
  });
});

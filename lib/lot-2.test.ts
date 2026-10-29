import { describe, expect, it, vi } from "vitest";
import { settleApply } from "./calendar-apply";
import { buildCoachContext, buildSystemPrompt, calendarReadContent, fitCoachContext } from "./coach";
import { coachPhase, requestCoachStream, saveCoachConfig } from "./coach-store";
import { suggestForExercise } from "./progression";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> & { loadKg: number | null; reps: number | null }): SetLog {
  return {
    id: partial.id ?? "s",
    loadKg: partial.loadKg,
    reps: partial.reps,
    rpe: partial.rpe ?? null,
    rir: partial.rir,
    unit: partial.unit,
    warmup: false,
    done: partial.done ?? true,
    skipped: partial.skipped,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux"],
    unit: partial.unit,
    planned: partial.planned ?? { sets: 3, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [],
  };
}

function done(date: string, ex: ExerciseLog): Session {
  return { id: date, date, title: "Poussée", status: "done", source: "manual", exercises: [ex] };
}

describe("lot 2 progression", () => {
  it("ne dit pas que toutes les séries ont été faciles s’il manque des efforts", () => {
    const history = [
      done("2026-10-01", exercise({
        sets: [set({ loadKg: 80, reps: 6, rpe: 6 }), set({ loadKg: 80, reps: 6 }), set({ loadKg: 80, reps: 6 })],
      })),
    ];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.reason ?? "").not.toMatch(/Toutes les séries ont été faciles/);
  });

  it("ne valide pas trois séries prévues avec une seule ligne notée", () => {
    const history = [
      done("2026-10-01", exercise({
        planned: { sets: 3, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
        sets: [set({ loadKg: 80, reps: 6, rpe: 8 })],
      })),
    ];
    const suggestion = suggestForExercise(exercise(), history);
    expect(suggestion?.reason).toMatch(/incomplète/);
    expect(suggestion?.loadKg).toBe(80);
    expect(suggestion?.changesPlan).toBe(false);
  });

  it("monte d’abord les répétitions, puis la charge, comme la règle affichée", () => {
    const history = [
      done("2026-10-01", exercise({
        sets: [set({ loadKg: 80, reps: 6, rpe: 8 }), set({ loadKg: 80, reps: 6, rpe: 8 }), set({ loadKg: 80, reps: 6, rpe: 8 })],
      })),
    ];
    const suggestion = suggestForExercise(exercise({ planned: { sets: 3, reps: 6, loadKg: 80, restSec: 180, rpe: 8 } }), history);
    expect(suggestion?.loadKg).toBe(80);
    expect(suggestion?.reps).toBe(7);
    expect(suggestion?.reason).toMatch(/répétition/);
    expect(suggestion?.reason).toMatch(/2026-10-01|1 octobre/);
  });
});

describe("lot 2 coach", () => {
  it("nomme la configuration et la vérification seulement si elle a réussi", () => {
    expect(coachPhase({ configured: false, verified: false, busy: false, down: false }).label).toBe("Non configuré");
    expect(coachPhase({ configured: true, verified: false, busy: false, down: false }).label).toBe("Configuration présente");
    expect(coachPhase({ configured: true, verified: true, busy: false, down: false }).label).toBe("Vérification réussie");
    expect(coachPhase({ configured: true, verified: true, busy: true, down: false }).label).toBe("Réponse en cours");
    expect(coachPhase({ configured: true, verified: true, busy: false, down: true }).label).toBe("Indisponible");
  });

  it("dit que le code authentifie sans entrer dans le contexte", () => {
    const prompt = buildSystemPrompt({ aujourd_hui: "2026-10-29", seances_recentes: [], plan: [] });
    expect(prompt).toMatch(/code secret/);
    expect(prompt).toMatch(/pas dans le contexte|n’est pas dans le contexte/);
    const marker = "NOTE-POUR-MOI-SEULE";
    const context = buildCoachContext([
      {
        id: "s",
        date: "2026-10-20",
        title: "Bras",
        status: "done",
        source: "manual",
        noteForMe: marker,
        noteForCoach: "À dire au coach",
        exercises: [exercise({ name: "Curl haltères", sets: [set({ loadKg: 12, reps: 10, unit: "kg/main" })] })],
      },
    ], "2026-10-29");
    const json = JSON.stringify(context);
    expect(json).not.toContain(marker);
    expect(json).toContain("À dire au coach");
    expect(json).toContain("kg/main");
  });

  it("signale une omission même sans carte d’action, et un JSON encore valide", () => {
    const huge = { aujourd_hui: "2026-10-29", seances_recentes: [], plan: [], memo: "x".repeat(20000) };
    const fitted = fitCoachContext(huge as never);
    expect(fitted.omitted).toBeTruthy();
    expect(() => JSON.parse(JSON.stringify(fitted.context))).not.toThrow();
    const prompt = buildSystemPrompt(huge);
    expect(prompt).toContain("CONTEXTE");
    expect(prompt).toContain(fitted.omitted ?? "omis");
  });

  it("dit réponse non reçue sans rappeler /coach", async () => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    saveCoachConfig({ url: "https://repere-coach.repere-flo.workers.dev", token: "secret" });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach")) return new Promise<Response>(() => undefined);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"ready":true}\n\n'));
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    await expect(requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, inactivityMs: 30 })).rejects.toThrow(/Réponse non reçue/);
    expect(fetchImpl.mock.calls.map((call) => String(call[0])).some((url) => url.endsWith("/coach"))).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("lot 2 résultats", () => {
  it("ne dit pas que rien n’est écrit quand une écriture a réussi", () => {
    const settled = settleApply(
      [
        { scope: "calendar", ok: true },
        { scope: "calendar", ok: false },
      ],
      true,
    );
    expect(settled.kind).toBe("partial");
    expect(settled.headline).not.toMatch(/n’a été écrit|n'a été écrit/);
  });

  it("ne présente pas un créneau comme certainement libre et dit les autres calendriers inconnus", () => {
    const open = JSON.parse(calendarReadContent({ events: [], recurrenceIncomplete: true })) as { creneaux_libres: boolean; raison?: string };
    expect(open.creneaux_libres).toBe(false);
    expect(open.raison).toMatch(/autres calendriers/);
    const read = JSON.parse(calendarReadContent({ events: [], recurrenceIncomplete: false })) as { creneaux_libres: boolean; raison?: string };
    expect(read.creneaux_libres).toBe(false);
    expect(read.raison).toMatch(/autres calendriers/);
  });
});

import { describe, expect, it } from "vitest";
import { calendarObjectName, settleApply } from "./calendar-apply";
import {
  CALENDAR_NAME,
  CONTEXT_BUDGET,
  buildCoachContext,
  buildSystemPrompt,
  calendarBodyForTool,
  calendarReadContent,
  fitCoachContext,
  type ToolCall,
} from "./coach";
import { DEFAULT_COACH_URL, coachPhase, coachUrlIssue, normalizeCoachUrl } from "./coach-store";
import type { ExerciseLog, Session, SetLog } from "./types";

function set(partial: Partial<SetLog> = {}): SetLog {
  return { id: partial.id ?? "s", loadKg: partial.loadKg ?? 80, reps: partial.reps ?? 5, rpe: null, warmup: false, done: partial.done ?? true };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: ["pectoraux"],
    planned: partial.planned ?? { sets: 3, reps: 5, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [set()],
    note: partial.note,
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Poussée",
    status: partial.status ?? "done",
    source: partial.source ?? "manual",
    coachNote: partial.coachNote,
    noteForCoach: partial.noteForCoach,
    noteForMe: partial.noteForMe,
    exercises: partial.exercises ?? [exercise()],
  };
}

function call(name: string, args: Record<string, unknown>, id = "call-jeudi"): ToolCall {
  return { id, name, arguments: JSON.stringify(args) };
}

describe("lot C", () => {
  it("n’enregistre pas une adresse http publique", () => {
    expect(coachUrlIssue("http://coach.exemple.fr")).toMatch(/https/);
    expect(coachUrlIssue("http://localhost:8787")).toBeNull();
    expect(normalizeCoachUrl("http://coach.exemple.fr/secret")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(normalizeCoachUrl("https://coach.exemple.fr/chemin?token=secret")).toBe("https://coach.exemple.fr/chemin");
  });

  it("nomme les quatre états du coach", () => {
    expect(coachPhase({ configured: false, busy: false, down: true })).toEqual({ phase: "non-configure", label: "Non configuré" });
    expect(coachPhase({ configured: true, busy: true, down: false }).label).toBe("Réponse en cours");
    expect(coachPhase({ configured: true, busy: false, down: true }).label).toBe("Indisponible");
    expect(coachPhase({ configured: true, busy: false, down: false }).label).toBe("Configuration présente");
  });

  it("laisse de côté les séances anciennes sans couper le contexte", () => {
    const marker = "NOTE-PRIVEE-XYZ";
    const sessions = Array.from({ length: 24 }, (_, index) =>
      session({
        date: `2025-01-${String(index + 1).padStart(2, "0")}`,
        id: `old-${index}`,
        noteForCoach: "charge tenue ".repeat(200),
        noteForMe: marker,
      }),
    );
    sessions.push(session({ date: "2026-10-20", id: "recent", status: "done", noteForMe: marker }));
    const context = buildCoachContext(sessions, "2026-10-27");
    const fitted = fitCoachContext(context, 2500);
    expect(JSON.stringify(fitted.context).length).toBeLessThanOrEqual(2500);
    expect(fitted.omitted).toMatch(/notes pour vous/);
    expect(JSON.stringify(fitted.context)).not.toContain(marker);
    const prompt = buildSystemPrompt(context);
    const json = prompt.split("CONTEXTE\n")[1]?.split("\nFIN_CONTEXTE")[0] ?? "";
    expect(json.length).toBeLessThanOrEqual(CONTEXT_BUDGET);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(prompt).toContain(fitted.omitted ? "notes pour vous" : CALENDAR_NAME);
    expect(prompt).not.toContain(marker);
    const missed = session({ date: "2026-01-02", status: "planned", id: "missed" });
    expect(buildCoachContext([missed], "2026-10-27").plan).toHaveLength(0);
  });

  it("refuse de déplacer un événement marqué et garde la même clé", () => {
    const blocked = calendarBodyForTool(call("delete_event", { uid: "1", previousTitle: "🏋️ Poussée" }));
    expect(blocked.ok).toBe(false);
    const moved = calendarBodyForTool(call("update_event", { uid: "1", title: "Poussée", previousTitle: "🏃 Footing", start: "2026-10-29T18:00", end: "2026-10-29T19:00" }));
    expect(moved.ok).toBe(false);
    const created = calendarBodyForTool(call("create_event", { title: "Poussée", start: "2026-10-29T18:00", end: "2026-10-29T19:00" }, "seance-jeudi"));
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.body.idempotencyKey).toBe("seance-jeudi");
    expect(calendarObjectName("seance-jeudi")).toBe(calendarObjectName("seance-jeudi"));
    expect(calendarObjectName("seance-jeudi")).toBe("seance-jeudi");
  });

  it("ne dit pas qu’un créneau est libre si les répétitions sont incomplètes", () => {
    const text = calendarReadContent({ events: [], recurrenceIncomplete: true });
    expect(text).toContain(CALENDAR_NAME);
    expect(text).toContain("Aucun créneau");
    expect(JSON.parse(text).creneaux_libres).toBe(false);
  });

  it("distingue le conflit, la moitié réussie et le réessai idempotent", () => {
    expect(settleApply([{ scope: "phone", ok: true }, { scope: "calendar", ok: false }], true)).toMatchObject({
      kind: "partial",
      headline: "Une moitié a réussi.",
    });
    expect(settleApply([{ scope: "phone", ok: true }, { scope: "calendar", ok: false, conflict: true }], true).kind).toBe("conflict");
    expect(settleApply([{ scope: "phone", ok: true }, { scope: "calendar", ok: true }], true).headline).toBe("C’est noté.");
    expect(settleApply([], false).headline).toBe("On garde le plan.");
    const again = calendarObjectName("seance-jeudi");
    expect(calendarObjectName("seance-jeudi")).toBe(again);
  });
});

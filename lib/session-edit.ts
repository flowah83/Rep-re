import { exerciseFromPlan } from "./plan";
import type { CustomExercise, ExerciseLog, Session } from "./types";
import { isCalendarDate, isClock } from "./contract";
import { uid } from "./utils";

export type EditRow = {
  key: string;
  name: string;
  sets: number;
  reps: number;
  load: number | null;
  rest: number;
};

export function applySessionEdit(
  existing: Session | null,
  input: { date: string; time: string; title: string; note: string; rows: EditRow[] },
  customs: CustomExercise[] = [],
): { session: Session } | { error: string } {
  if (!isCalendarDate(input.date)) return { error: "Cette date n’existe pas." };
  if (!isClock(input.time)) return { error: "L’heure doit être au format 18:15." };
  const title = input.title.trim();
  if (!title) return { error: "Donnez un nom à la séance." };
  if (input.rows.length === 0) return { error: "Une séance a besoin d’au moins un exercice." };
  if (input.rows.some((row) => !row.name.trim())) return { error: "Chaque exercice a besoin d’un nom." };
  for (const row of input.rows) {
    if (!Number.isInteger(row.sets) || row.sets < 1 || row.sets > 40) return { error: `« ${row.name} » : le nombre de séries doit être un entier.` };
    if (!Number.isInteger(row.reps) || row.reps < 0 || row.reps > 200) return { error: `« ${row.name} » : les répétitions doivent être un entier.` };
    if (row.load != null && (!Number.isFinite(row.load) || row.load < 0 || row.load > 1000)) return { error: `« ${row.name} » : la charge n’est pas valide.` };
    if (!Number.isFinite(row.rest) || row.rest < 0 || row.rest > 3600) return { error: `« ${row.name} » : le repos n’est pas valide.` };
  }

  const exercises = input.rows.map((row) => mergeRow(existing, row, customs));
  const status = existing?.status === "done" ? "done" : existing?.status === "active" ? "active" : "planned";
  return {
    session: {
      id: existing?.id ?? uid(),
      date: input.date,
      time: input.time.trim() || undefined,
      title,
      coachNote: input.note.trim() || existing?.coachNote,
      intention: existing?.intention,
      noteForMe: existing?.noteForMe,
      noteForCoach: existing?.noteForCoach,
      status,
      startedAt: existing?.startedAt,
      endedAt: existing?.endedAt,
      source: existing?.source ?? "manual",
      scheduled: existing?.scheduled ?? true,
      restEndsAt: existing?.restEndsAt,
      exercises,
      cardio: existing?.cardio,
      durationMin: existing?.durationMin,
      closed: existing?.closed,
    },
  };
}

function mergeRow(existing: Session | null, row: EditRow, customs: CustomExercise[]): ExerciseLog {
  const previous = existing?.exercises.find((exercise) => exercise.id === row.key);
  if (!previous) {
    const created = exerciseFromPlan(
      {
        nom: row.name.trim(),
        series: row.sets,
        repetitions: row.reps,
        charge_kg: row.load,
        repos_secondes: row.rest,
      },
      customs,
    );
    return { ...created, id: row.key };
  }
  const warmups = previous.sets.filter((set) => set.warmup);
  const work = previous.sets.filter((set) => !set.warmup);
  const nextWork = work.slice(0, row.sets).map((set) => ({ ...set }));
  while (nextWork.length < row.sets) {
    nextWork.push({
      id: uid(),
      loadKg: row.load,
      reps: null,
      rpe: null,
      warmup: false,
      done: false,
      unit: previous.unit ?? null,
    });
  }
  return {
    ...previous,
    name: row.name.trim(),
    planned: {
      ...previous.planned,
      sets: row.sets,
      reps: row.reps,
      loadKg: row.load,
      restSec: row.rest,
    },
    sets: [...warmups.map((set) => ({ ...set })), ...nextWork],
  };
}

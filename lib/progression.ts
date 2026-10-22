import { isHardSet } from "./calc";
import { normalizeExerciseKey } from "./exercises";
import type { ExerciseLog, Session, SetLog } from "./types";
import { formatKg } from "./utils";

export type Suggestion = {
  exerciseId: string;
  name: string;
  loadKg: number | null;
  reps: number | null;
  unit: string | null;
  reason: string;
  /** Vrai quand la charge ou les répétitions diffèrent du plan actuel. */
  changesPlan: boolean;
};

/**
 * Double progression, uniquement à partir des séries récentes.
 * On augmente la charge quand toutes les séries de travail ont atteint
 * l’objectif de répétitions sans effort maximal. Sinon on garde la charge,
 * ou on la baisse si les répétitions manquent et que l’effort était maximal
 * (RIR 0 ou RPE ≥ 9,5). Le RPE et le RIR ne servent que lorsqu’ils sont notés.
 */
export function suggestionsForSession(session: Session, history: Session[]): Suggestion[] {
  if (session.cardio) return [];
  return session.exercises
    .map((exercise) => suggestForExercise(exercise, history, session.id))
    .filter((item): item is Suggestion => item != null);
}

export function suggestForExercise(exercise: ExerciseLog, history: Session[], skipSessionId?: string): Suggestion | null {
  const recent = latestPerformance(exercise.name, history, skipSessionId);
  if (!recent) return null;
  const working = recent.sets.filter((set) => isHardSet(set) && set.reps != null);
  if (!working.length) return null;

  const step = exercise.stepKg > 0 ? exercise.stepKg : 2.5;
  const loads = working.map((set) => set.loadKg).filter((load): load is number => load != null && Number.isFinite(load));
  const targetReps = exercise.planned.reps != null && exercise.planned.reps > 0 ? exercise.planned.reps : null;

  if (!loads.length) return bodyweightSuggestion(exercise, working, targetReps);

  const load = modeLoad(loads);
  const atLoad = working.filter((set) => set.loadKg != null && Math.abs(set.loadKg - load) < 0.051);
  const scored = atLoad.length ? atLoad : working.filter((set) => set.loadKg != null);
  const minReps = Math.min(...scored.map((set) => set.reps ?? 0));
  const target = targetReps ?? minReps;
  const hit = minReps >= target;
  const effort = effortOf(scored);
  const unit = exercise.unit ?? scored.find((set) => set.unit)?.unit ?? null;

  let nextLoad = load;
  let reason: string;
  if (hit && !effort.blocksIncrease) {
    nextLoad = snap(load + step, step);
    const shown = formatLoad(nextLoad, unit);
    reason = effort.easy
      ? `Toutes les séries ont été faciles. Suggestion : ${shown} × ${target}.`
      : `Objectif de répétitions atteint. Suggestion : ${shown} × ${target}.`;
  } else if (!hit && effort.grind) {
    nextLoad = snap(Math.max(0, load - step), step);
    if (nextLoad >= load - 0.01) nextLoad = snap(Math.max(0, load - step), step);
    reason = `Répétitions manquées et effort maximal. Suggestion : ${formatLoad(nextLoad, unit)} × ${target}.`;
  } else if (hit && effort.blocksIncrease) {
    reason = `Répétitions atteintes, mais l’effort était maximal. Gardez ${formatLoad(load, unit)} × ${target}.`;
  } else {
    reason = `La dernière fois, les répétitions n’y étaient pas toutes. Gardez ${formatLoad(load, unit)} et visez ${target}.`;
  }

  return pack(exercise, nextLoad, target, unit, reason);
}

export function applySuggestion(session: Session, suggestion: Suggestion): Session {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (exercise.id !== suggestion.exerciseId) return exercise;
      return {
        ...exercise,
        planned: { ...exercise.planned, loadKg: suggestion.loadKg, reps: suggestion.reps },
        sets: exercise.sets.map((set) => (set.done || set.warmup ? set : { ...set, loadKg: suggestion.loadKg })),
      };
    }),
  };
}

function bodyweightSuggestion(exercise: ExerciseLog, working: SetLog[], targetReps: number | null): Suggestion {
  const minReps = Math.min(...working.map((set) => set.reps ?? 0));
  const target = targetReps ?? minReps;
  const hit = minReps >= target;
  const effort = effortOf(working);
  let reps = target;
  let reason: string;
  if (hit && !effort.blocksIncrease) {
    reps = target + 1;
    reason = `Poids du corps. Suggestion : ${reps} répétitions.`;
  } else if (!hit && effort.grind) {
    reps = Math.max(1, minReps);
    reason = `Effort maximal. Restez à ${reps} répétitions.`;
  } else if (hit) {
    reason = `Poids du corps, effort maximal. Visez ${reps} répétitions.`;
  } else {
    reason = `Poids du corps. Visez ${reps} répétitions.`;
  }
  return pack(exercise, null, reps, exercise.unit ?? null, reason);
}

function pack(exercise: ExerciseLog, loadKg: number | null, reps: number | null, unit: string | null, reason: string): Suggestion {
  const sameLoad = loadKg == null ? exercise.planned.loadKg == null : exercise.planned.loadKg != null && Math.abs(exercise.planned.loadKg - loadKg) < 0.011;
  const sameReps = exercise.planned.reps === reps;
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    loadKg,
    reps,
    unit,
    reason,
    changesPlan: !sameLoad || !sameReps,
  };
}

function latestPerformance(name: string, history: Session[], skipSessionId?: string): ExerciseLog | null {
  const key = normalizeExerciseKey(name);
  const sessions = history
    .filter((session) => session.id !== skipSessionId && !session.cardio && session.status !== "planned")
    .filter((session) => session.exercises.some((exercise) => normalizeExerciseKey(exercise.name) === key && exercise.sets.some(isHardSet)))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.endedAt ?? "").localeCompare(a.endedAt ?? "");
    });
  const session = sessions[0];
  if (!session) return null;
  return session.exercises.find((exercise) => normalizeExerciseKey(exercise.name) === key && exercise.sets.some(isHardSet)) ?? null;
}

function effortOf(sets: SetLog[]): { blocksIncrease: boolean; grind: boolean; easy: boolean } {
  const rirs = sets.map((set) => set.rir).filter((value): value is number => value != null && Number.isFinite(value));
  const rpes = sets.map((set) => set.rpe).filter((value): value is number => value != null && Number.isFinite(value));
  const minRir = rirs.length ? Math.min(...rirs) : null;
  const maxRpe = rpes.length ? Math.max(...rpes) : null;
  const grind = (minRir != null && minRir <= 0) || (maxRpe != null && maxRpe >= 9.5);
  const blocksIncrease = grind || (minRir != null && minRir <= 0) || (maxRpe != null && maxRpe >= 9);
  const easy =
    !blocksIncrease &&
    ((minRir != null && minRir >= 2 && (maxRpe == null || maxRpe <= 8)) || (minRir == null && maxRpe != null && maxRpe <= 7));
  return { blocksIncrease, grind, easy };
}

function modeLoad(loads: number[]): number {
  const counts = new Map<number, number>();
  for (const load of loads) {
    const key = Math.round(load * 100) / 100;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = Math.round(loads[0] * 100) / 100;
  let count = 0;
  for (const [load, n] of counts) {
    if (n > count || (n === count && load > best)) {
      best = load;
      count = n;
    }
  }
  return best;
}

function snap(value: number, step: number): number {
  if (!(step > 0)) return Math.round(value * 100) / 100;
  return Math.round((Math.round(value / step) * step) * 100) / 100;
}

function formatLoad(load: number, unit: string | null): string {
  if (unit === "kg/main") return `${formatKg(load)} kg/main`;
  if (unit === "kg/jambe") return `${formatKg(load)} kg/jambe`;
  return `${formatKg(load)} kg`;
}

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

export type Adjustment = {
  exerciseId: string;
  name: string;
  fromLoadKg: number | null;
  toLoadKg: number | null;
  fromReps: number | null;
  toReps: number | null;
  unit: string | null;
  reason: string;
  active: boolean;
};

export type ProgressionRecord = {
  choice: "pending" | "accepted" | "ignored";
  items: Adjustment[];
};

/** Suggestions qui changent vraiment le plan, prêtes à être appliquées d’un bloc. */
export function buildAdjustments(session: Session, history: Session[]): Adjustment[] {
  return suggestionsForSession(session, history)
    .filter((item) => item.changesPlan)
    .map((item) => {
      const exercise = session.exercises.find((current) => current.id === item.exerciseId);
      return {
        exerciseId: item.exerciseId,
        name: item.name,
        fromLoadKg: exercise?.planned.loadKg ?? null,
        toLoadKg: item.loadKg,
        fromReps: exercise?.planned.reps ?? null,
        toReps: item.reps,
        unit: item.unit,
        reason: item.reason,
        active: true,
      };
    });
}

export function applyAdjustments(session: Session, items: Adjustment[]): Session {
  return items.filter((item) => item.active).reduce((current, item) => applySuggestion(current, suggestionFrom(item, true)), session);
}

export function revertAdjustment(session: Session, item: Adjustment): Session {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (exercise.id !== item.exerciseId) return exercise;
      return {
        ...exercise,
        planned: { ...exercise.planned, loadKg: item.fromLoadKg, reps: item.fromReps },
        sets: exercise.sets.map((set) => {
          if (set.done || set.warmup) return set;
          if (!sameLoad(set.loadKg, item.toLoadKg)) return set;
          return { ...set, loadKg: item.fromLoadKg };
        }),
      };
    }),
  };
}

export function reapplyAdjustment(session: Session, item: Adjustment): Session {
  return applySuggestion(session, suggestionFrom({ ...item, active: true }, true));
}

/**
 * Au démarrage d’une séance planifiée, les charges ajustées deviennent le plan.
 * Un choix déjà mémorisé n’est pas rejoué.
 */
export function startWithProgression(
  session: Session,
  history: Session[],
  existing: ProgressionRecord | null,
): { session: Session; record: ProgressionRecord | null } {
  if (session.status !== "planned" || existing) return { session, record: existing };
  const items = buildAdjustments(session, history);
  if (!items.length) return { session, record: null };
  return { session: applyAdjustments(session, items), record: { choice: "pending", items } };
}

export function adjustmentSummary(count: number): string {
  if (count === 1) return "1 exercice ajusté";
  return `${count} exercices ajustés`;
}

export function activeAdjustmentCount(record: ProgressionRecord | null): number {
  if (!record || record.choice !== "pending") return 0;
  return record.items.filter((item) => item.active).length;
}

export function formatLoadDelta(deltaKg: number): string | null {
  if (!Number.isFinite(deltaKg) || Math.abs(deltaKg) < 0.01) return null;
  const arrow = deltaKg > 0 ? "↑" : "↓";
  const sign = deltaKg > 0 ? "+" : "−";
  return `${arrow} ${sign}${formatKg(Math.abs(deltaKg))} kg`;
}

export function setDelta(
  item: Adjustment | undefined,
  set: SetLog,
): { place: "load" | "reps"; text: string } | null {
  if (!item?.active || set.warmup) return null;
  const loadText =
    item.fromLoadKg != null && item.toLoadKg != null && sameLoad(set.loadKg, item.toLoadKg)
      ? formatLoadDelta(item.toLoadKg - item.fromLoadKg)
      : null;
  if (loadText) return { place: "load", text: loadText };
  if (item.fromLoadKg == null && item.toLoadKg == null && item.fromReps != null && item.toReps != null && item.fromReps !== item.toReps) {
    const delta = item.toReps - item.fromReps;
    const arrow = delta > 0 ? "↑" : "↓";
    const sign = delta > 0 ? "+" : "−";
    return { place: "reps", text: `${arrow} ${sign}${Math.abs(delta)}` };
  }
  return null;
}

const PROGRESSION_KEY = "repere-progression-batch";

type KeyValueStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function loadProgression(sessionId: string, store: KeyValueStore | null = browserStore()): ProgressionRecord | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PROGRESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = (parsed as Record<string, unknown>)[sessionId];
    if (!isRecord(record)) return null;
    return record;
  } catch {
    return null;
  }
}

export function saveProgression(sessionId: string, record: ProgressionRecord, store: KeyValueStore | null = browserStore()) {
  if (!store) return;
  try {
    const raw = store.getItem(PROGRESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const all = parsed && typeof parsed === "object" ? { ...(parsed as Record<string, unknown>) } : {};
    all[sessionId] = record;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 40))) delete all[key];
    store.setItem(PROGRESSION_KEY, JSON.stringify(all));
  } catch {
    /* stockage privé */
  }
}

function suggestionFrom(item: Adjustment, changesPlan: boolean): Suggestion {
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    loadKg: item.toLoadKg,
    reps: item.toReps,
    unit: item.unit,
    reason: item.reason,
    changesPlan,
  };
}

function sameLoad(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left == null && right == null;
  return Math.abs(left - right) < 0.051;
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is ProgressionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as ProgressionRecord;
  return (record.choice === "pending" || record.choice === "accepted" || record.choice === "ignored") && Array.isArray(record.items);
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

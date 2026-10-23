import type { ExerciseLog, Muscle, Session, SetLog } from "./types";

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Estimation d’Epley. Uniquement pour 1 à 10 répétitions. */
export function epley(loadKg: number, reps: number): number | null {
  if (!Number.isFinite(loadKg) || !Number.isFinite(reps)) return null;
  if (loadKg <= 0) return null;
  if (reps < 1 || reps > 10) return null;
  return round1(loadKg * (1 + reps / 30));
}

export function isHardSet(set: SetLog): boolean {
  return set.done && !set.warmup && (set.reps ?? 0) > 0;
}

export function hardSetCount(exercises: ExerciseLog[]): number {
  return exercises.reduce((n, ex) => n + ex.sets.filter(isHardSet).length, 0);
}

/** Une charge « kg/main » est celle d’une seule main : le volume compte les deux. */
export function loadFactor(unit: string | null | undefined): number {
  return unit === "kg/main" ? 2 : 1;
}

/** Kilos déplacés : charge écrite × répétitions, séries dures seulement. null n’est pas zéro. */
export function tonnage(exercises: ExerciseLog[]): number {
  let total = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (!isHardSet(set) || set.loadKg == null || set.reps == null) continue;
      total += set.loadKg * set.reps * loadFactor(set.unit ?? ex.unit);
    }
  }
  return round1(total);
}

export function muscleTotals(
  sessions: Session[],
  fromIso: string,
  toIso: string,
): Record<Muscle, number> {
  const totals = emptyMuscles();
  for (const session of sessions) {
    if (session.cardio || session.status === "planned") continue;
    if (session.date < fromIso || session.date > toIso) continue;
    for (const ex of session.exercises) {
      const n = ex.sets.filter(isHardSet).length;
      if (!n) continue;
      for (const muscle of ex.muscles) totals[muscle] += n;
    }
  }
  return totals;
}

export function emptyMuscles(): Record<Muscle, number> {
  return {
    pectoraux: 0,
    epaules: 0,
    triceps: 0,
    biceps: 0,
    dos: 0,
    quadriceps: 0,
    ischios: 0,
    fessiers: 0,
    mollets: 0,
    abdos: 0,
  };
}

export type E1Point = {
  date: string;
  dayEstimate: number;
  bestSoFar: number;
};

/**
 * Meilleure estimation du jour, puis record tenu jusqu’ici.
 * Une séance légère ne fait pas baisser la courbe.
 */
export function e1rmSeries(
  samples: { date: string; loadKg: number; reps: number }[],
): E1Point[] {
  const byDate = new Map<string, number>();
  for (const sample of samples) {
    const est = epley(sample.loadKg, sample.reps);
    if (est == null) continue;
    byDate.set(sample.date, Math.max(byDate.get(sample.date) ?? 0, est));
  }
  const dates = [...byDate.keys()].sort();
  let best = 0;
  const points: E1Point[] = [];
  for (const date of dates) {
    const dayEstimate = byDate.get(date) ?? 0;
    best = Math.max(best, dayEstimate);
    points.push({ date, dayEstimate, bestSoFar: round1(best) });
  }
  return points;
}

export function samplesForExercise(sessions: Session[], name: string) {
  const samples: { date: string; loadKg: number; reps: number }[] = [];
  for (const session of sessions) {
    if (session.cardio || session.status === "planned") continue;
    for (const ex of session.exercises) {
      if (ex.name !== name) continue;
      for (const set of ex.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null) continue;
        samples.push({ date: session.date, loadKg: set.loadKg, reps: set.reps });
      }
    }
  }
  return samples;
}

export type Plate = { kg: number; count: number };

const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

export function platesPerSide(
  targetKg: number,
  barKg: number,
): { plates: Plate[]; perSide: number; remainder: number } {
  const perSideRaw = (targetKg - barKg) / 2;
  if (perSideRaw < 0) return { plates: [], perSide: 0, remainder: perSideRaw };
  let left = Math.round(perSideRaw * 100) / 100;
  const plates: Plate[] = [];
  for (const kg of PLATE_SIZES) {
    const count = Math.floor((left + 1e-6) / kg);
    if (count > 0) {
      plates.push({ kg, count });
      left = Math.round((left - count * kg) * 100) / 100;
    }
  }
  return { plates, perSide: Math.round(perSideRaw * 100) / 100, remainder: left };
}

export type BestLoad = {
  name: string;
  loadKg: number;
  reps: number;
  date: string;
  unit?: string | null;
};

export function bestLoads(sessions: Session[]): BestLoad[] {
  const map = new Map<string, BestLoad>();
  for (const session of sessions) {
    if (session.cardio || session.status === "planned") continue;
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null || set.loadKg <= 0) continue;
        const prev = map.get(ex.name);
        if (!prev || set.loadKg > prev.loadKg || (set.loadKg === prev.loadKg && session.date > prev.date)) {
          map.set(ex.name, { name: ex.name, loadKg: set.loadKg, reps: set.reps, date: session.date, unit: set.unit ?? ex.unit ?? null });
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.loadKg - a.loadKg || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

import { epley, hardSetCount, isHardSet, tonnage } from "./calc";
import { unitPhrase } from "./display";
import type { ExerciseLog, Session, SetLog } from "./types";
import { canonicalUnit, resolvedUnit } from "./unit";
import { formatKg, formatLong, uid } from "./utils";

export function blankExercise(partial: Omit<ExerciseLog, "id" | "sets"> & { sets?: SetLog[] }): ExerciseLog {
  const sets = partial.sets ?? buildSets(partial.planned.sets, partial.planned.loadKg, false);
  return { ...partial, id: uid(), sets };
}

export function buildSets(count: number, loadKg: number | null, warmup: boolean): SetLog[] {
  return Array.from({ length: count }, () => ({
    id: uid(),
    loadKg,
    reps: null,
    rpe: null,
    warmup,
    done: false,
    origin: "plan",
  }));
}

export function setSettled(set: SetLog): boolean {
  return set.done || set.skipped === true;
}

export function nextUndone(ex: ExerciseLog): SetLog | undefined {
  return ex.sets.find((set) => !setSettled(set));
}

export function sessionFullyLogged(session: Session): boolean {
  return session.exercises.length > 0 && session.exercises.every((exercise) => exercise.sets.length > 0 && exercise.sets.every(setSettled));
}

export function firstOpenSlot(session: Session): { exercise: ExerciseLog; set: SetLog } | null {
  for (const exercise of session.exercises) {
    const set = exercise.sets.find((item) => !setSettled(item));
    if (set) return { exercise, set };
  }
  return null;
}

export function skipSet(session: Session, exerciseId: string, setId: string): Session {
  return { ...patchSet(session, exerciseId, setId, { skipped: true, done: false }), restEndsAt: null };
}

export function noteSetRpe(session: Session, exerciseId: string, setId: string, rpe: number): Session {
  return patchSet(session, exerciseId, setId, { rpe });
}

export function patchSet(session: Session, exerciseId: string, setId: string, patch: Partial<SetLog>): Session {
  const touches = (["loadKg", "reps", "rpe", "rir", "done", "skipped"] as const).some((key) => key in patch);
  return {
    ...session,
    exercises: session.exercises.map((ex) =>
      ex.id !== exerciseId
        ? ex
        : {
            ...ex,
            sets: ex.sets.map((s) => {
              if (s.id !== setId) return s;
              const next = { ...s, ...patch };
              if (touches && patch.origin == null) next.origin = "saisie";
              return next;
            }),
          },
    ),
  };
}

export function stepValue(current: number | null, delta: number, fallback: number, min = 0): number {
  const base = current == null ? fallback : current;
  return Math.max(min, Math.round((base + delta) * 100) / 100);
}

export function cycleRpe(current: number | null): number | null {
  if (current == null) return 6;
  if (current >= 10) return null;
  return current + 1;
}

export function completeSet(session: Session, exerciseId: string, setId: string): Session {
  const ex = session.exercises.find((e) => e.id === exerciseId);
  const set = ex?.sets.find((s) => s.id === setId);
  if (!ex || !set) return session;
  const reps = set.reps != null ? set.reps : ex.planned.reps != null ? ex.planned.reps : null;
  const loadKg = set.loadKg != null ? set.loadKg : ex.planned.loadKg != null ? ex.planned.loadKg : null;
  const done = !set.done;
  let next = patchSet(session, exerciseId, setId, {
    done,
    skipped: done ? false : set.skipped,
    reps: done ? reps : set.reps,
    loadKg,
    rpe: set.rpe,
  });
  const moreOpen = next.exercises.some((item) => item.sets.some((entry) => !setSettled(entry)));
  if (done && !set.warmup && ex.planned.restSec > 0 && moreOpen) {
    next = { ...next, restEndsAt: Date.now() + ex.planned.restSec * 1000 };
  } else {
    next = { ...next, restEndsAt: null };
  }
  return next;
}

/** Séances déjà faites auxquelles comparer un bilan. L’exemple ne sert pas de référence à une vraie séance. */
export function comparisonPriors(all: Session[], session: Session): Session[] {
  const pool = session.source === "demo" ? all.filter((item) => item.source === "demo") : all.filter((item) => item.source !== "demo");
  return pool.filter((item) => item.id !== session.id && item.status === "done" && item.date <= session.date);
}

export function startSession(session: Session): Session {
  return {
    ...session,
    status: "active",
    startedAt: session.startedAt ?? new Date().toISOString(),
  };
}

export function finishSession(session: Session): Session {
  return {
    ...session,
    status: "done",
    endedAt: new Date().toISOString(),
    restEndsAt: null,
  };
}

export type CompareKind = "tenu" | "presque" | "au-dessus" | "charge-inedite" | "en-dessous" | "vide";

export function compareExercise(
  ex: ExerciseLog,
  prior: Session[],
): { kind: CompareKind; line: string } {
  const work = ex.sets.filter(isHardSet);
  if (work.length === 0) return { kind: "vide", line: "Pas encore noté." };
  const repsList = work.map((s) => s.reps ?? 0);
  const knownLoads = work.map((s) => s.loadKg).filter((load): load is number => load != null);
  const maxLoad = knownLoads.length ? Math.max(...knownLoads) : null;
  if (maxLoad == null) {
    const rpes = work.map((s) => s.rpe).filter((r): r is number => r != null);
    const rpeText = rpes.length ? ` RPE ${rpes.join(", ")}.` : "";
    return { kind: "tenu", line: `Fait ${repsList.join(", ")}, charge non notée.${rpeText}` };
  }
  const loads = work.map((s) => s.loadKg);
  const plannedLoad = ex.planned.loadKg;
  const plannedReps = ex.planned.reps;
  const repsText = repsList.join(", ");
  const rpes = work.map((s) => s.rpe).filter((r): r is number => r != null);
  const rpeText = rpes.length ? ` RPE ${rpes.join(", ")}.` : "";

  const unit = resolvedUnit(work[0], ex);
  const seenBefore = prior.some((session) =>
    session.exercises.some(
      (other) =>
        other.name === ex.name &&
        other.sets.some(
          (s) => isHardSet(s) && s.loadKg != null && resolvedUnit(s, other) === unit && s.loadKg >= maxLoad - 0.01,
        ),
    ),
  );

  if (plannedLoad != null && maxLoad > plannedLoad + 0.01) {
    const kind: CompareKind = seenBefore ? "au-dessus" : "charge-inedite";
    return {
      kind,
      line: `Prévu ${formatKg(plannedLoad)} kg. Fait ${formatKg(maxLoad)} kg × ${repsText}.${rpeText}`,
    };
  }

  const meets =
    plannedReps == null ||
    work.every((s, i) => (s.reps ?? 0) >= plannedReps && (plannedLoad == null || (loads[i] != null && loads[i] >= plannedLoad - 0.01)));
  if (meets) {
    return {
      kind: "tenu",
      line: plannedLoad != null ? `Tenu : ${formatKg(plannedLoad)} kg × ${repsText}.${rpeText}` : `Fait ${repsText}.${rpeText}`,
    };
  }
  const close =
    plannedReps != null && work.every((s) => (s.reps ?? 0) >= plannedReps - 1);
  if (close) {
    return {
      kind: "presque",
      line: `Prévu ${plannedReps} répétitions. Fait ${repsText}.${rpeText}`,
    };
  }
  return {
    kind: "en-dessous",
    line: `Prévu ${plannedReps ?? "—"} répétitions. Fait ${repsText}.${rpeText}`,
  };
}

function workLine(count: number): string {
  if (count <= 0) return "Aucune série de travail.";
  if (count === 1) return "1 série de travail.";
  return `${count} séries de travail.`;
}

export function summaryText(session: Session, prior: Session[]): string {
  const minutes = session.startedAt
    ? Math.max(1, Math.round(((session.endedAt ? Date.parse(session.endedAt) : Date.now()) - Date.parse(session.startedAt)) / 60000))
    : null;
  const lines = [
    `${formatLong(session.date)} — ${session.title}, faite.`,
    session.cardio
      ? cardioLine(session)
      : `${minutes ? `${minutes} min. ` : ""}${workLine(hardSetCount(session.exercises))}`,
  ];
  for (const ex of session.exercises) {
    if (ex.detailUnknown) {
      lines.push(`${ex.name} : le détail des séries n’a pas été noté.`);
      continue;
    }
    const done = ex.sets.filter((set) => set.done && !set.warmup);
    if (!done.length) continue;
    const bits = done.map((set) => formatPerformedSet(set, ex.unit, ex.name)).join(", ");
    const cmp = compareExercise(ex, prior);
    lines.push(`${ex.name} : ${bits}. ${cmp.line}`);
  }
  if (session.noteForCoach?.trim()) lines.push(`Note : ${session.noteForCoach.trim()}`);
  return lines.join("\n");
}

export function reportJson(session: Session) {
  const minutes = session.startedAt
    ? Math.max(1, Math.round(((session.endedAt ? Date.parse(session.endedAt) : Date.now()) - Date.parse(session.startedAt)) / 60000))
    : null;
  return {
    date: session.date,
    titre: session.title,
    terminee: session.status === "done",
    duree_min: minutes,
    series_dures: hardSetCount(session.exercises),
    kilos_deplaces: tonnage(session.exercises),
    note_pour_le_coach: session.noteForCoach ?? "",
    exercices: session.exercises.map((ex) => ({
      nom: ex.name,
      prevu: {
        series: ex.planned.sets,
        repetitions: ex.planned.reps,
        charge_kg: ex.planned.loadKg,
      },
      fait: ex.sets
        .filter((s) => s.done)
        .map((s) => ({
          charge_kg: s.loadKg,
          repetitions: s.reps,
          rpe: s.rpe,
          rir: s.rir ?? null,
          cote: s.side ?? null,
          unite: resolvedUnit(s, ex),
          echauffement: s.warmup,
        })),
    })),
  };
}

export function lastPerformance(sessions: Session[], name: string, beforeId?: string, unit?: string): string | null {
  const found = latestWork(sessions, name, beforeId, unit);
  return found?.line ?? null;
}

export function latestWork(
  sessions: Session[],
  name: string,
  beforeId?: string,
  unit?: string,
): { date: string; line: string; unit: string } | null {
  const want = unit == null ? null : canonicalUnit(unit);
  const usable = sessions.filter((session) => session.source !== "demo");
  const done = usable
    .filter((s) => s.id !== beforeId && !s.cardio && s.status === "done")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const session of done) {
    const ex = session.exercises.find((e) => e.name === name);
    if (!ex) continue;
    const work = ex.sets.filter((set) => isHardSet(set) && (want == null || resolvedUnit(set, ex) === want));
    if (!work.length) continue;
    return { date: session.date, line: work.map((set) => formatPerformedSet(set, ex.unit, ex.name)).join(", "), unit: resolvedUnit(work[0], ex) };
  }
  return null;
}

export function bestE1rmLabel(sessions: Session[], name: string, unit?: string): { kg: number; detail: string } | null {
  const want = unit == null ? null : canonicalUnit(unit);
  let best: { kg: number; load: number; reps: number; date: string } | null = null;
  for (const session of sessions) {
    if (session.cardio || session.status !== "done") continue;
    for (const ex of session.exercises) {
      if (ex.name !== name) continue;
      for (const set of ex.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null) continue;
        if (want && resolvedUnit(set, ex) !== want) continue;
        const est = epley(set.loadKg, set.reps);
        if (est == null) continue;
        if (!best || est > best.kg) best = { kg: est, load: set.loadKg, reps: set.reps, date: session.date };
      }
    }
  }
  if (!best) return null;
  return { kg: best.kg, detail: `${formatKg(best.load)} kg × ${best.reps}` };
}

export function sessionEffort(session: Session): { minutes: number | null; done: number; left: number; partial: boolean } {
  const minutes =
    session.startedAt && session.endedAt
      ? Math.max(1, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000))
      : session.durationMin != null
        ? Math.max(1, Math.round(session.durationMin))
        : null;
  const done = hardSetCount(session.exercises);
  let left = 0;
  for (const exercise of session.exercises) {
    left += exercise.sets.filter((set) => !set.warmup && !set.done).length;
  }
  return { minutes, done, left, partial: session.closed === "partial" || (session.status === "done" && left > 0) };
}

export function versus(exercise: ExerciseLog): { plannedLoad: string; plannedSets: string; doneLoad: string; doneDetail: string } {
  const phrase = unitPhrase(resolvedUnit({ unit: exercise.unit }, exercise));
  const plannedLoad =
    exercise.planned.loadKg != null
      ? `${formatKg(exercise.planned.loadKg)} ${phrase} × ${exercise.planned.reps ?? "—"}`
      : exercise.planned.reps != null
        ? `${exercise.planned.reps} répétitions`
        : "Sans cible";
  const plannedSets = exercise.planned.sets <= 1 ? "1 série" : `${exercise.planned.sets} séries`;
  const work = exercise.sets.filter(isHardSet);
  if (!work.length) return { plannedLoad, plannedSets, doneLoad: "Pas fait", doneDetail: "0 série" };
  const top = work.reduce((best, set) => ((set.loadKg ?? -1) > (best.loadKg ?? -1) ? set : best));
  const donePhrase = unitPhrase(resolvedUnit(top, exercise));
  const doneLoad = top.loadKg == null ? `${top.reps ?? "—"} répétitions` : `${formatKg(top.loadKg)} ${donePhrase} × ${top.reps ?? "—"}`;
  const effort = top.rpe != null ? `effort ${formatKg(top.rpe)}` : null;
  const count = work.length <= 1 ? "1 série" : `${work.length} séries`;
  return { plannedLoad, plannedSets, doneLoad, doneDetail: [count, effort].filter(Boolean).join(" · ") };
}

/** Nouveau plan : mêmes exercices et mêmes cibles, aucune série déjà réalisée. */
export function duplicateAsPlan(session: Session, date: string): Session {
  return {
    id: uid(),
    date,
    title: session.title,
    intention: session.intention,
    status: "planned",
    source: "manual",
    scheduled: true,
    coachNote: session.coachNote,
    cardio: session.cardio
      ? { ...session.cardio, durationMin: null, distanceKm: null, rpe: null, pace: null, hrAvg: null, hrMax: null, elevationM: null, kcal: null }
      : undefined,
    exercises: session.exercises.map((exercise) => {
      const count = Math.max(1, exercise.planned.sets || exercise.sets.filter((set) => !set.warmup).length);
      return { ...exercise, id: uid(), sets: buildSets(count, null, false) };
    }),
  };
}

export function formatPerformedSet(set: SetLog, exerciseUnit?: string | null, exerciseName?: string): string {
  const unit = resolvedUnit(set, { unit: exerciseUnit, name: exerciseName });
  const side = set.side ? `${set.side} ` : "";
  const load = formatLoad(set.loadKg, unit);
  const reps = set.reps == null ? "—" : String(set.reps);
  const extra: string[] = [];
  if (set.rpe != null) extra.push(`RPE ${formatKg(set.rpe)}`);
  if (set.rir != null) extra.push(`RIR ${formatKg(set.rir)}`);
  if (set.restRealSec != null) extra.push(`repos ${Math.round(set.restRealSec)} s`);
  return `${side}${load} × ${reps}${extra.length ? ` (${extra.join(", ")})` : ""}`;
}

function formatLoad(load: number | null, unit: string | null): string {
  if (load == null) {
    if (unit && /pdc/i.test(unit)) return "PDC";
    return "—";
  }
  if (unit === "kg/main") return `${formatKg(load)} kg par haltère`;
  if (unit === "kg/jambe") return `${formatKg(load)} kg par jambe`;
  if (unit && /pdc/i.test(unit)) return `${formatKg(load)} kg`;
  return `${formatKg(load)} kg`;
}

function cardioLine(session: Session): string {
  const cardio = session.cardio;
  if (!cardio) return "";
  const bits = [cardio.sport];
  if (cardio.durationMin != null) bits.push(`${Math.round(cardio.durationMin)} min`);
  if (cardio.distanceKm != null) bits.push(`${formatKg(cardio.distanceKm)} km`);
  return bits.join(", ");
}

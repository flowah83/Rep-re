import { countsForProgress, e1rmSeries, epley, hardSetCount, heaviestSet, isHardSet, muscleTotals, samplesForExercise, tonnage } from "./calc";
import { unitOfExercise } from "./display";
import { canonicalUnit, recordKey, resolvedUnit } from "./unit";
import { MUSCLE_LABEL } from "./exercises";
import { keepsCoachPlan, movementCycle, programPreview } from "./progression";
import type { ExerciseLog, Muscle, Session } from "./types";
import { addDays, formatKg, mondayOf, parseISODate, stripAccents, weekdayLetter } from "./utils";

export type DayKind = "done" | "active" | "missed" | "planned" | "rest";

export type DayMark = {
  iso: string;
  letter: string;
  number: number;
  kind: DayKind;
  today: boolean;
};

export type LiftView = {
  name: string;
  short: string;
  kg: number | null;
  points: number[];
  sessions: number;
  curve: boolean;
  /** Pourcentage du record tenu sur 4 semaines. Jamais négatif. Null si l’historique ne le porte pas. */
  delta: number | null;
  caption: string;
  /** Plus lourde série de travail réellement notée, à côté du max estimé. */
  bestSet: { loadKg: number; reps: number } | null;
  aria: string;
};

export type RecordView = {
  name: string;
  short: string;
  loadKg: number;
  reps: number;
  e1rm: number | null;
  date: string;
  unit: string;
  points: number[];
  aria: string;
};

export type HomeModel = {
  empty: boolean;
  days: DayMark[];
  sessions: { done: number; total: number; extra: number; ratio: number; aria: string };
  volume: {
    kg: number;
    text: string;
    floor: boolean;
    baselineText: string;
    /** 0 à 1 pour l’anneau. Null : pas d’arc (semaine légère sans repère, ou rien à comparer). */
    ratio: number | null;
    aria: string;
  };
  bench: LiftView | null;
  squat: LiftView | null;
  record: RecordView | null;
  muscles: { label: string; sets: number }[];
  balance: { push: number; pull: number; upper: number; lower: number } | null;
  heat: { streak: number; rows: { level: number; kind: "done" | "missed" | "planned" | "rest"; today: boolean }[][]; aria: string };
  cycle: { pips: ("full" | "light" | "miss")[]; line: string; aria: string } | null;
  insight: string;
  next: { label: string; date: string } | null;
};

/** Les séances d’exemple sortent dès qu’un vrai carnet existe. */
export function sessionsForHome(sessions: Session[]): Session[] {
  const real = sessions.some((session) => session.source !== "demo");
  return real ? sessions.filter((session) => session.source !== "demo") : sessions;
}

export function buildHome(all: Session[], today: string): HomeModel {
  const sessions = sessionsForHome(all);
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const days = weekDays(sessions, monday, today);
  const empty = sessions.length === 0;
  const adherence = weekAdherence(sessions, monday, sunday);
  const volume = weekVolume(sessions, monday);
  const bench = liftView(sessions, today, isBench, "Couché");
  const squat = liftView(sessions, today, isSquat, "Squat");
  const record = recentRecord(sessions, today);
  const focus = focusExercise(sessions, today);
  const coachHeld = Boolean(focus.session && keepsCoachPlan(focus.session));
  const cycle = coachHeld ? null : cycleView(focus.exercise, sessions, focus.session?.id ?? undefined);
  const muscles = muscleBars(sessions, monday, sunday);
  const balance = balanceOf(sessions, monday, sunday);
  const heat = heatOf(sessions, monday, today);
  const insight = insightOf({ record, coachHeld, cycle, focus, sessions });
  const next = nextLine(sessions, today);
  if (cycle) applyLightWeek(volume, sessions, monday);
  return {
    empty,
    days,
    sessions: adherence,
    volume,
    bench: record && isBench(record.name) ? null : bench,
    squat: record && isSquat(record.name) ? null : squat,
    record,
    muscles,
    balance,
    heat,
    cycle,
    insight,
    next,
  };
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) return `${formatKg(Math.round(kg / 100) / 10)} t`;
  return `${formatKg(Math.round(kg))} kg`;
}

function weekDays(sessions: Session[], monday: string, today: string): DayMark[] {
  return Array.from({ length: 7 }, (_, index) => {
    const iso = addDays(monday, index);
    const list = sessions.filter((session) => session.date === iso);
    let kind: DayKind = "rest";
    if (list.some((session) => session.status === "active")) kind = "active";
    else if (list.some((session) => session.status === "done")) kind = "done";
    else if (list.some((session) => session.status === "planned" && iso < today)) kind = "missed";
    else if (list.some((session) => session.status === "planned")) kind = "planned";
    return { iso, letter: weekdayLetter(iso), number: parseISODate(iso).getDate(), kind, today: iso === today };
  });
}

function isExtra(session: Session): boolean {
  if (session.scheduled === true) return false;
  if (session.scheduled === false) return true;
  return session.source === "manual" && session.status === "done";
}

function weekAdherence(sessions: Session[], monday: string, sunday: string) {
  const week = sessions.filter((session) => session.date >= monday && session.date <= sunday && !session.cardio);
  const extra = week.filter(isExtra).length;
  const scheduled = week.filter((session) => !isExtra(session));
  const done = scheduled.filter((session) => session.status === "done").length;
  const total = scheduled.length;
  const ratio = total > 0 ? done / total : 0;
  const aria = total > 0 ? `${done} séance${done > 1 ? "s" : ""} sur ${total}.` : extra > 0 ? `${extra} séance${extra > 1 ? "s" : ""} notée${extra > 1 ? "s" : ""}, hors du plan.` : "Aucune séance prévue cette semaine.";
  return { done, total, extra, ratio, aria };
}

function weekKg(sessions: Session[], monday: string): { kg: number; floor: boolean; sets: number } {
  const sunday = addDays(monday, 6);
  const list = sessions.filter((session) => countsForProgress(session) && session.date >= monday && session.date <= sunday);
  const kg = Math.round(list.reduce((sum, session) => sum + tonnage(session.exercises), 0) * 10) / 10;
  const sets = list.reduce((sum, session) => sum + hardSetCount(session.exercises), 0);
  return { kg, floor: list.some((session) => session.closed === "partial"), sets };
}

function weekVolume(sessions: Session[], monday: string) {
  const current = weekKg(sessions, monday);
  const samples: number[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const prior = weekKg(sessions, addDays(monday, -7 * index));
    if (prior.sets >= 4) samples.push(prior.kg);
  }
  const baseline = samples.length ? Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10 : null;
  const ratio = baseline != null && baseline > 0 ? Math.min(1, current.kg / baseline) : null;
  const baselineText = samples.length >= 2 && baseline != null ? `moy. ${formatVolume(baseline)}` : samples.length === 1 && baseline != null ? `sem. préc. ${formatVolume(baseline)}` : "";
  const text = `${formatVolume(current.kg)}${current.floor ? " notées" : ""}`;
  return {
    kg: current.kg,
    text,
    floor: current.floor,
    baselineText,
    ratio,
    aria: volumeAria(current.kg, current.floor, baseline, baselineText),
  };
}

/** En semaine légère, l’anneau se compare aux semaines déjà légères, pas à la moyenne lourde. */
function applyLightWeek(volume: HomeModel["volume"], sessions: Session[], monday: string) {
  const samples: number[] = [];
  for (let index = 1; index <= 12; index += 1) {
    const prior = weekKg(sessions, addDays(monday, -7 * index));
    if (prior.sets >= 4) samples.push(prior.kg);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const light = samples.filter((kg) => median > 0 && kg < median * 0.7);
  if (!light.length) {
    volume.ratio = null;
    volume.baselineText = "semaine légère";
    volume.aria = volumeAria(volume.kg, volume.floor, null, "semaine légère");
    return;
  }
  const baseline = Math.round((light.reduce((a, b) => a + b, 0) / light.length) * 10) / 10;
  volume.baselineText = `légère ${formatVolume(baseline)}`;
  volume.ratio = baseline > 0 ? Math.min(1, volume.kg / baseline) : null;
  volume.aria = volumeAria(volume.kg, volume.floor, baseline, volume.baselineText);
}

function spokenVolume(kg: number): string {
  if (kg >= 1000) return `${formatKg(Math.round(kg / 100) / 10)} tonnes`;
  return `${formatKg(Math.round(kg))} kilogrammes`;
}

function volumeAria(kg: number, floor: boolean, baseline: number | null, baselineText: string): string {
  const main = floor ? `Volume noté ${spokenVolume(kg)}, séance incomplète, ce n’est pas le total.` : `Volume ${spokenVolume(kg)}.`;
  if (baselineText === "semaine légère") return `${main} Semaine légère.`;
  if (baselineText.startsWith("légère") && baseline != null) return `${main} Semaine légère, ${spokenVolume(baseline)}.`;
  if (baselineText.startsWith("sem.") && baseline != null) return `${main} Semaine précédente, ${spokenVolume(baseline)}.`;
  if (baseline != null && baselineText.startsWith("moy.")) return `${main} Moyenne ${spokenVolume(baseline)}.`;
  return main;
}

function isBench(name: string): boolean {
  const key = stripAccents(name);
  return key.includes("couche") || key.includes("bench");
}

function isSquat(name: string): boolean {
  return stripAccents(name).includes("squat");
}

function shortLift(name: string, fallback: string): string {
  if (isBench(name)) return "Couché";
  if (isSquat(name)) return "Squat";
  return fallback || name.split(" ").slice(0, 2).join(" ");
}

function liftView(sessions: Session[], today: string, match: (name: string) => boolean, fallback: string): LiftView | null {
  const name = exerciseName(sessions, match);
  if (!name) return null;
  const dates = new Set<string>();
  for (const session of sessions) {
    if (!countsForProgress(session)) continue;
    if (session.exercises.some((exercise) => match(exercise.name) && exercise.sets.some(isHardSet))) dates.add(session.date);
  }
  const series = e1rmSeries(samplesForExercise(sessions, name, canonicalUnit(unitOfExercise({ name }) ?? "kg")));
  const kg = series.length ? series[series.length - 1].bestSoFar : null;
  const curve = series.length >= 3;
  const cutoff = addDays(today, -28);
  const then = [...series].reverse().find((point) => point.date <= cutoff);
  let delta: number | null = null;
  if (curve && then && then.bestSoFar > 0 && series.length) {
    const last = series[series.length - 1].bestSoFar;
    delta = Math.max(0, Math.round(((last - then.bestSoFar) / then.bestSoFar) * 100));
  }
  const caption = liftCaption(dates.size, curve, delta);
  const short = shortLift(name, fallback);
  const held = heaviestSet(sessions, name);
  const bestSet = held ? { loadKg: held.loadKg, reps: held.reps } : null;
  const view: LiftView = { name, short, kg, points: series.slice(-8).map((point) => point.bestSoFar), sessions: dates.size, curve, delta, caption, bestSet, aria: "" };
  view.aria = liftAria(view);
  return view;
}

function liftCaption(sessions: number, curve: boolean, delta: number | null): string {
  if (!curve) {
    if (sessions <= 1) return "une séance notée";
    if (sessions === 2) return "deux séances notées";
    return `${sessions} séances notées`;
  }
  if (delta != null && delta > 0) return `+${delta} % · 4 sem.`;
  if (delta === 0) return "stable";
  return sessions === 1 ? "une séance notée" : `${sessions} séances`;
}

function liftAria(view: LiftView): string {
  const bits = [view.short];
  bits.push(view.kg == null ? "pas encore de max estimé" : `max estimé ${formatKg(view.kg)} kilogrammes`);
  if (view.bestSet) bits.push(`meilleure série ${formatKg(view.bestSet.loadKg)} fois ${view.bestSet.reps}`);
  if (view.curve && view.delta != null && view.delta > 0) bits.push(`plus ${view.delta} % en quatre semaines`);
  else if (view.caption) bits.push(view.caption);
  return `${bits.join(", ")}.`;
}

function exerciseName(sessions: Session[], match: (name: string) => boolean): string | null {
  for (const session of [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    for (const exercise of session.exercises) {
      if (match(exercise.name)) return exercise.name;
    }
  }
  return null;
}

type RecordHit = { name: string; loadKg: number; reps: number; date: string; unit: string };

/** Un record exige une charge plus lourde, ou plus de répétitions à charge égale, dans la même unité. */
export function trueRecords(sessions: Session[]): RecordHit[] {
  const best = new Map<string, { loadKg: number; reps: number }>();
  const hits: RecordHit[] = [];
  const ordered = [...sessions].filter(countsForProgress).sort((a, b) => a.date.localeCompare(b.date) || (a.endedAt ?? "").localeCompare(b.endedAt ?? ""));
  for (const session of ordered) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null || set.loadKg <= 0) continue;
        const unit = resolvedUnit(set, exercise);
        const key = recordKey(exercise.name, unit);
        const prev = best.get(key);
        const heavier = !prev || set.loadKg > prev.loadKg + 0.01;
        const moreReps = Boolean(prev) && Math.abs(set.loadKg - (prev?.loadKg ?? 0)) <= 0.01 && set.reps > (prev?.reps ?? 0);
        if (!prev) {
          best.set(key, { loadKg: set.loadKg, reps: set.reps });
          continue;
        }
        if (heavier) {
          best.set(key, { loadKg: set.loadKg, reps: set.reps });
          hits.push({ name: exercise.name, loadKg: set.loadKg, reps: set.reps, date: session.date, unit });
        } else if (moreReps) {
          best.set(key, { loadKg: set.loadKg, reps: set.reps });
          hits.push({ name: exercise.name, loadKg: set.loadKg, reps: set.reps, date: session.date, unit });
        }
      }
    }
  }
  return hits;
}

function recentRecord(sessions: Session[], today: string): RecordView | null {
  const start = addDays(mondayOf(today), -7);
  const hits = trueRecords(sessions).filter((hit) => hit.date >= start && hit.date <= today);
  if (!hits.length) return null;
  hits.sort((a, b) => b.date.localeCompare(a.date) || Number(isBench(b.name)) - Number(isBench(a.name)) || b.loadKg - a.loadKg);
  const hit = hits[0];
  const series = e1rmSeries(samplesForExercise(sessions, hit.name, hit.unit));
  const point = [...series].reverse().find((item) => item.date <= hit.date);
  const e1rm = epley(hit.loadKg, hit.reps) ?? point?.bestSoFar ?? null;
  const short = shortLift(hit.name, hit.name);
  const aria = `${formatKg(hit.loadKg)} kilogrammes fois ${hit.reps} à ${short.toLowerCase()}.${e1rm != null ? ` Max estimé ${formatKg(e1rm)} kilogrammes.` : ""}`;
  return { ...hit, short, e1rm, points: series.slice(-8).map((item) => item.bestSoFar), aria };
}

function muscleBars(sessions: Session[], monday: string, sunday: string) {
  const totals = muscleTotals(sessions, monday, sunday);
  return (Object.keys(totals) as Muscle[])
    .map((muscle) => ({ label: MUSCLE_LABEL[muscle], sets: totals[muscle] }))
    .filter((item) => item.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 4);
}

function balanceOf(sessions: Session[], monday: string, sunday: string) {
  let push = 0;
  let pull = 0;
  let upper = 0;
  let lower = 0;
    const lowerPatterns = new Set(["squat", "hinge", "lunge", "calf"]);
  const upperPatterns = new Set(["hpush", "hpull", "vpush", "vpull", "curl", "tricep", "lateral"]);
  for (const session of sessions) {
    if (!countsForProgress(session) || session.date < monday || session.date > sunday) continue;
    for (const exercise of session.exercises) {
      const count = exercise.sets.filter(isHardSet).length;
      if (exercise.pattern === "hpush" || exercise.pattern === "vpush") push += count;
      if (exercise.pattern === "hpull" || exercise.pattern === "vpull") pull += count;
      if (lowerPatterns.has(exercise.pattern)) lower += count;
      else if (upperPatterns.has(exercise.pattern)) upper += count;
    }
  }
  if (push + pull + upper + lower === 0) return null;
  return { push, pull, upper, lower };
}

function heatOf(sessions: Session[], monday: string, today: string) {
  const rows: HomeModel["heat"]["rows"] = [];
  for (let week = 7; week >= 0; week -= 1) {
    const start = addDays(monday, -7 * week);
    const cells = Array.from({ length: 7 }, (_, day) => {
      const iso = addDays(start, day);
      const list = sessions.filter((session) => session.date === iso);
      const trained = list.filter(countsForProgress);
      const sets = trained.reduce((sum, session) => sum + hardSetCount(session.exercises), 0);
      let kind: "done" | "missed" | "planned" | "rest" = "rest";
      if (trained.length) kind = "done";
      else if (list.some((session) => session.status === "planned" && iso < today)) kind = "missed";
      else if (list.some((session) => session.status === "planned" || session.status === "active")) kind = "planned";
      return { level: heatLevel(sets), kind, today: iso === today };
    });
    rows.push(cells);
  }
  if (sessions.length === 0) return { streak: 0, rows, aria: "Aucune semaine tenue." };
  const earliest = sessions.reduce((min, session) => (session.date < min ? session.date : min), today);
  let streak = 0;
  for (let week = 0; week < 52; week += 1) {
    const start = addDays(monday, -7 * week);
    const end = addDays(start, 6);
    if (end < earliest) break;
    const missed = sessions.some((session) => session.status === "planned" && session.date >= start && session.date <= end && session.date < today);
    const finished = sessions.some((session) => session.status === "done" && session.date >= start && session.date <= end);
    if (missed || !finished) break;
    streak += 1;
  }
  if (streak === 0) return { streak: 0, rows, aria: "Aucune semaine tenue." };
  return { streak, rows, aria: `${streak} semaine${streak > 1 ? "s" : ""} tenue${streak > 1 ? "s" : ""}.` };
}

function heatLevel(sets: number): number {
  if (sets <= 0) return 0;
  if (sets < 8) return 1;
  if (sets < 12) return 2;
  if (sets < 16) return 3;
  return 4;
}

function focusExercise(sessions: Session[], today: string): { session: Session | null; exercise: ExerciseLog | null } {
  const upcoming = sessions
    .filter((session) => !session.cardio && (session.status === "planned" || session.status === "active") && session.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  for (const session of upcoming) {
    const bench = session.exercises.find((exercise) => isBench(exercise.name));
    if (bench) return { session, exercise: bench };
  }
  if (upcoming[0]?.exercises[0]) return { session: upcoming[0], exercise: upcoming[0].exercises[0] };
  for (const session of [...sessions].filter(countsForProgress).sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const bench = session.exercises.find((exercise) => isBench(exercise.name) && exercise.sets.some(isHardSet));
    if (bench) return { session: null, exercise: bench };
  }
  return { session: null, exercise: null };
}

function cycleView(exercise: ExerciseLog | null, sessions: Session[], skipId?: string): HomeModel["cycle"] {
  if (!exercise) return null;
  const cycle = movementCycle(exercise, sessions, skipId);
  if (!cycle.block || cycle.loadKg == null || cycle.deloadKg == null) return null;
  const pips: ("full" | "light" | "miss")[] = cycle.block === "stall" ? ["miss", "miss", "light", "full"] : ["full", "full", "full", "light"];
  const short = shortLift(exercise.name, exercise.name);
  const line = `${short} ${formatKg(cycle.deloadKg)} kg, puis retour à ${formatKg(cycle.loadKg)}.`;
  const aria = cycle.block === "stall" ? `Semaine légère. ${line}` : `Trois séances, puis une légère. ${line}`;
  return { pips, line, aria };
}

function insightOf(input: {
  record: RecordView | null;
  coachHeld: boolean;
  cycle: HomeModel["cycle"];
  focus: { session: Session | null; exercise: ExerciseLog | null };
  sessions: Session[];
}): string {
  const { record, coachHeld, cycle, focus, sessions } = input;
  if (coachHeld) return "Le plan de Chef sport reste prioritaire.";
  if (record && focus.exercise) {
    const preview = programPreview(focus.exercise, sessions, { skipSessionId: focus.session?.id });
    const next = aheadOfPlan(focus.exercise, preview);
    if (next) return `Record de charge. La suite est ${next}.`;
    return "Record de charge.";
  }
  if (cycle && cycle.pips[0] === "miss") return "Deux séances sans l’objectif. On allège, puis on reprend.";
  if (cycle) return "Trois séances réussies. On allège une fois, puis on reprend.";
  if (focus.exercise) {
    const preview = programPreview(focus.exercise, sessions, { coachPlan: false, skipSessionId: focus.session?.id });
    const next = aheadOfPlan(focus.exercise, preview);
    if (next) return `Le palier d’après au ${shortLift(focus.exercise.name, focus.exercise.name).toLowerCase()} est ${next}.`;
  }
  return "La semaine est là. La séance se lance dans Aujourd’hui.";
}

function aheadOfPlan(exercise: ExerciseLog, preview: { upcoming: { loadKg: number | null; reps: number; label: string }[] } | null): string | null {
  if (!preview) return null;
  const plannedLoad = exercise.planned.loadKg;
  const plannedReps = exercise.planned.reps;
  const step = preview.upcoming.find((item) => {
    const sameLoad = plannedLoad == null ? item.loadKg == null : item.loadKg != null && Math.abs(item.loadKg - plannedLoad) < 0.05;
    return !(sameLoad && item.reps === plannedReps);
  });
  return step ? compactStep(step.label) : null;
}

function compactStep(label: string): string {
  return label.replace(" kg ×", " ×");
}

function nextLine(sessions: Session[], today: string): { label: string; date: string } | null {
  const active = sessions.find((session) => session.status === "active");
  if (active) return { label: `${active.title} en cours →`, date: active.date };
  const next = sessions
    .filter((session) => session.status === "planned" && session.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0];
  if (!next) return null;
  const when = next.date === today ? "aujourd’hui" : weekdayName(next.date);
  return { label: `Prochaine séance : ${next.title} ${when} →`, date: next.date };
}

function weekdayName(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(parseISODate(iso));
}

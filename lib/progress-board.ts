import { countsForProgress, heaviestSet, isHardSet } from "./calc";
import { unitPhrase } from "./display";
import { resolvedUnit } from "./unit";
import type { Session } from "./types";
import { formatKg, parseISODate } from "./utils";

export type PerformedSet = { loadKg: number; reps: number; rpe: number | null };

export type ComparableSession = {
  date: string;
  title: string;
  sets: PerformedSet[];
  best: PerformedSet;
  noted: number;
  efforts: number[];
  badge: string;
};

export type BoardPoint = { date: string; loadKg: number; reps: number };

/** Une séance plus légère reste un point. Ce n’est pas la courbe du record cumulé. */
export function sessionPoints(rows: ComparableSession[]): BoardPoint[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, loadKg: row.best.loadKg, reps: row.best.reps }));
}

export function comparableSessions(sessions: Session[], name: string, unit: string | undefined, from: string, to: string): ComparableSession[] {
  const rows: Omit<ComparableSession, "badge">[] = [];
  for (const session of sessions) {
    if (!countsForProgress(session) || session.date < from || session.date > to) continue;
    const sets: PerformedSet[] = [];
    for (const exercise of session.exercises) {
      if (exercise.name !== name) continue;
      for (const set of exercise.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null || set.loadKg <= 0) continue;
        if (unit && resolvedUnit(set, exercise) !== unit) continue;
        sets.push({ loadKg: set.loadKg, reps: set.reps, rpe: set.rpe });
      }
    }
    if (!sets.length) continue;
    const best = sets.reduce((top, set) => (set.loadKg > top.loadKg || (set.loadKg === top.loadKg && set.reps > top.reps) ? set : top));
    const efforts = sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe != null);
    rows.push({ date: session.date, title: session.title, sets, best, noted: sets.length, efforts });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const record = heaviestSet(sessions, name, unit);
  const marked = rows.map((row, index) => {
    const previous = rows[index - 1] ?? null;
    return { ...row, badge: sessionBadge(row, previous, record) };
  });
  return marked.sort((a, b) => b.date.localeCompare(a.date));
}

export function sessionBadge(
  row: { date: string; best: PerformedSet },
  previous: { best: PerformedSet } | null,
  record: { loadKg: number; reps: number; date: string } | null,
): string {
  if (record && row.date === record.date && Math.abs(row.best.loadKg - record.loadKg) < 0.05 && row.best.reps === record.reps) return "record";
  if (previous && row.best.reps > previous.best.reps && row.best.loadKg <= previous.best.loadKg + 0.05) {
    const delta = row.best.reps - previous.best.reps;
    return delta === 1 ? "+1 rép." : `+${delta} rép.`;
  }
  return "—";
}

/** Une baisse de charge entre deux séances comparables n’est pas présentée comme un recul. */
export function dipSentence(rows: ComparableSession[]): string {
  const base = "Chaque point est une série vraiment faite.";
  if (rows.length < 2) return `${base} Une séance plus légère n’est pas un recul.`;
  const latest = rows[0];
  const heavier = rows.slice(1).find((row) => row.best.loadKg > latest.best.loadKg + 0.01);
  if (!heavier) return `${base} Une séance plus légère n’est pas un recul.`;
  const same = latest.sets.every((set) => Math.abs(set.loadKg - latest.best.loadKg) < 0.05);
  const moreReps = latest.best.reps > heavier.best.reps;
  const count = latest.noted <= 1 ? "1 série" : `${latest.noted} séries`;
  const body = same
    ? `${count} à ${formatKg(latest.best.loadKg)} kg${moreReps ? ", plus de répétitions avec moins de charge" : ""}`
    : `la série la plus lourde est ${formatKg(latest.best.loadKg)} kg × ${latest.best.reps}`;
  return `${base} Le ${longDay(latest.date)} : ${body}. Ce n’est pas un recul.`;
}

export function setsLine(sets: PerformedSet[], unit: string | undefined): string {
  const phrase = unitPhrase(unit);
  const same = sets.every((set) => Math.abs(set.loadKg - sets[0].loadKg) < 0.05);
  if (same) return `${formatKg(sets[0].loadKg)} ${phrase} × ${sets.map((set) => set.reps).join(" · ")}`;
  return sets.map((set) => `${formatKg(set.loadKg)} ${phrase} × ${set.reps}`).join(" · ");
}

export function effortLine(row: ComparableSession): string {
  const count = row.noted <= 1 ? "1 série" : `${row.noted} séries`;
  if (!row.efforts.length) return count;
  const low = Math.min(...row.efforts);
  const high = Math.max(...row.efforts);
  const effort = low === high ? `effort ${formatKg(low)}` : `effort ${formatKg(low)} à ${formatKg(high)}`;
  return `${count} · ${effort}`;
}

function longDay(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(parseISODate(iso));
}

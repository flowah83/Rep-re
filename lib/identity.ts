import { sessionsForHome } from "./home";
import { unitPhrase } from "./display";
import type { Session } from "./types";
import { resolvedUnit } from "./unit";
import { addDays, formatKg, mondayOf, parseISODate, stripAccents } from "./utils";

export const PRESENTATION = "Retrouvez vos charges. Notez votre séance. Voyez ce qui progresse.";

export function installHelp(userAgent: string): string {
  const ios = /iPhone|iPad|iPod/.test(userAgent);
  const safari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium/.test(userAgent);
  if (ios && safari) return "Dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».";
  if (ios) return "Dans le menu du navigateur, touchez Ajouter à l’écran d’accueil.";
  if (/Android/i.test(userAgent)) return "Dans le menu du navigateur, touchez Installer l’application, ou Ajouter à l’écran d’accueil.";
  return "Dans le menu du navigateur, choisissez Installer Repère.";
}

/** Une seule proposition, après une séance réelle notée, tant qu’elle n’est pas écartée ni déjà installée. */
export function shouldOfferInstall(input: {
  sessions: Pick<Session, "status" | "source">[];
  dismissed: boolean;
  standalone: boolean;
}): boolean {
  if (input.dismissed || input.standalone) return false;
  return input.sessions.some((session) => session.status === "done" && session.source !== "demo");
}

export type DayRepere = { kicker: "Mon repère du jour"; last: string; action: string };

/** Ligne intérieure de la carte du jour. Rien si ce n’est pas la séance à lancer ou à reprendre. */
export function dayRepere(session: Session, history: Session[], today: string): DayRepere | null {
  if (session.status !== "active" && session.status !== "planned") return null;
  if (session.status === "planned" && session.date !== today) return null;
  const prior = lastComparable(session, history);
  const last = prior ? comparableLine(prior) : "Pas encore de séance comparable.";
  const action = session.status === "active" ? "Reprendre la séance." : "Commencer.";
  return { kicker: "Mon repère du jour", last, action };
}

export type Keepsake = { title: "Ce que je retiens"; facts: string[] };

/** Bilan factuel. Une séance partielle est dite, sans en faire une faute. */
export function keepsake(session: Session): Keepsake {
  const noted = hardNoted(session);
  const open = session.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => !set.warmup && !set.done && !set.skipped).length,
    0,
  );
  const partial = session.closed === "partial" || open > 0;
  const facts: string[] = [];
  if (session.cardio && noted === 0) {
    facts.push(partial ? "Séance partielle. Ce qui est noté reste." : "La séance est notée.");
  } else if (partial) {
    facts.push(noted === 0 ? "Rien n’a été noté. La séance peut rester partielle." : `${series(noted)} notée${noted > 1 ? "s" : ""}. La séance est partielle, et elle compte.`);
  } else {
    facts.push(`${series(noted)} notée${noted > 1 ? "s" : ""}.`);
  }
  const detail = firstNoted(session);
  if (detail) facts.push(detail);
  return { title: "Ce que je retiens", facts };
}

export type WeeklyCap = { title: "Mon cap"; synthesis: string; proposal: string };

/** Synthèse de la semaine en cours, et une seule suite. Le repos n’est pas un trou. */
export function weeklyCap(sessions: Session[], today: string): WeeklyCap {
  const pool = sessionsForHome(sessions);
  const start = mondayOf(today);
  const end = addDays(start, 6);
  const done = pool.filter((session) => session.status === "done" && session.date >= start && session.date <= end && session.date <= today);
  const partial = done.filter((session) => session.closed === "partial");
  const next = pool
    .filter((session) => (session.status === "planned" || session.status === "active") && session.date >= today && session.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0];
  let synthesis: string;
  if (done.length === 0) synthesis = "Aucune séance notée cette semaine. Le repos n’est pas un trou.";
  else if (partial.length === done.length) {
    synthesis = done.length === 1 ? "Une séance partielle cette semaine. Elle compte." : `${done.length} séances notées, partielles. Elles comptent.`;
  } else if (partial.length) {
    synthesis = `${done.length} séances notées, dont ${partial.length} partielle${partial.length > 1 ? "s" : ""}.`;
  } else {
    synthesis = done.length === 1 ? "Une séance notée cette semaine." : `${done.length} séances notées cette semaine.`;
  }
  let proposal: string;
  if (!next) proposal = "Rien d’autre à proposer pour cette semaine.";
  else if (next.status === "active") proposal = `${next.title} est en cours.`;
  else proposal = `La prochaine est ${next.title}, ${next.date === today ? "aujourd’hui" : weekday(next.date)}.`;
  return { title: "Mon cap", synthesis, proposal };
}

function lastComparable(session: Session, history: Session[]): Session | null {
  const pool = sessionsForHome(history);
  const found = pool
    .filter((item) => item.id !== session.id && item.status === "done" && item.date <= session.date && sharesWork(session, item))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return found[0] ?? null;
}

function sharesWork(current: Session, prior: Session): boolean {
  if (stripAccents(current.title) === stripAccents(prior.title)) return true;
  const names = new Set(current.exercises.map((exercise) => stripAccents(exercise.name)));
  return prior.exercises.some((exercise) => names.has(stripAccents(exercise.name)));
}

function comparableLine(session: Session): string {
  const when = dayMonth(session.date);
  const noted = hardNoted(session);
  const open = session.exercises.some((exercise) => exercise.sets.some((set) => !set.warmup && !set.done && !set.skipped));
  if (session.closed === "partial" || open) {
    return `La dernière ${session.title}, le ${when}, est partielle : ${series(noted)} notée${noted > 1 ? "s" : ""}.`;
  }
  const detail = firstNoted(session);
  if (!detail) return `La dernière ${session.title}, le ${when}.`;
  return `La dernière ${session.title}, le ${when} : ${detail}.`;
}

function firstNoted(session: Session): string | null {
  for (const exercise of session.exercises) {
    const done = exercise.sets.filter((set) => set.done && !set.warmup && set.loadKg != null && set.reps != null);
    if (!done.length) continue;
    const best = done.reduce((top, set) => ((set.loadKg ?? 0) > (top.loadKg ?? 0) ? set : top));
    const unit = unitPhrase(resolvedUnit(best, exercise));
    return `${exercise.name}, ${formatKg(best.loadKg ?? 0)} ${unit} × ${best.reps}`;
  }
  return null;
}

function hardNoted(session: Session): number {
  return session.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.done && !set.warmup).length, 0);
}

function series(count: number): string {
  return count <= 1 ? `${count} série` : `${count} séries`;
}

function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(parseISODate(iso));
}

function weekday(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(parseISODate(iso));
}

import type { ExerciseLog, Session } from "./types";
import { cardioSummary, formatMinutes } from "./history";
import { formatKg, formatRestLabel, stripAccents } from "./utils";

export type HistFilter = "all" | "upper" | "lower" | "cardio" | "other";

export function unitPhrase(unit?: string | null): string {
  if (unit === "kg/main") return "kg par haltère";
  if (unit === "kg/jambe") return "kg par jambe";
  if (unit === "corps" || unit === "poids du corps") return "poids du corps";
  return "kg";
}

/** Haltères : la charge est celle d’une main, même si l’ancien plan n’a pas écrit l’unité. */
export function unitOfExercise(exercise: { unit?: string | null; name?: string }): string | null {
  if (exercise.unit) return exercise.unit;
  if (stripAccents(exercise.name ?? "").includes("haltere")) return "kg/main";
  return null;
}

export function seriesWord(count: number): string {
  return count <= 1 ? "1 série" : `${count} séries`;
}

/** Ligne de plan lisible : pas de « repos 0 s », et « 1 série » au singulier. */
export function describePlan(exercise: ExerciseLog, session?: Session): string {
  if (exercise.detailUnknown) return "séries non détaillées";
  if (session?.cardio && (session.exercises?.length ?? 1) <= 1) return cardioSummary(session.cardio);
  const { sets, reps, loadKg, restSec } = exercise.planned;
  const bits: string[] = [];
  if (loadKg != null) bits.push(`${formatKg(loadKg)} ${unitPhrase(unitOfExercise(exercise))}`);
  if (reps != null) bits.push(`${sets} × ${reps}`);
  else bits.push(seriesWord(sets));
  if (restSec > 0) bits.push(`repos ${formatRestLabel(restSec)}`);
  else if (session?.cardio) return cardioSummary(session.cardio);
  else if (session?.durationMin != null) bits.push(formatMinutes(session.durationMin));
  return bits.join(" · ");
}

export function historyBucket(session: Pick<Session, "title" | "cardio">): HistFilter {
  if (session.cardio) return "cardio";
  const value = stripAccents(session.title);
  if (value.includes("course") || value.includes("velo") || value.includes("natation") || value.includes("cardio")) return "cardio";
  if (value.includes("lower") || value.includes("jambe") || value.includes("squat")) return "lower";
  if (value.includes("upper") || value.includes("pouss") || value.includes("dos") || value.includes("tirage")) return "upper";
  return "other";
}

export function coachErrorText(message: string): string {
  if (/souffle/i.test(message) || /pas encore activé/i.test(message)) return message;
  if (/https?:|joignable|401|refus|illisible|adresse utilisée/i.test(message)) {
    return "L’adresse ou le code ne répond pas. Ouvrez Réglages, rubrique Coach.";
  }
  const stripped = message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return stripped || "Le coach n’a pas pu répondre. Ouvrez Réglages, rubrique Coach.";
}

import type { ExerciseLog, Session } from "./types";
import { platesPerSide } from "./calc";
import { CATALOG } from "./exercises";
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
  const key = stripAccents(exercise.name ?? "");
  if (key.includes("haltere")) return "kg/main";
  const catalog = CATALOG.find((item) => stripAccents(item.name) === key);
  if (catalog?.equipment === "halteres") return "kg/main";
  if (catalog?.equipment === "corps") return "corps";
  return null;
}

/** Disques d’une barre. Le total réel et le reste sont dits, sans remplacer la cible en silence. */
export function plateGlance(loadKg: number | null, unit: string | null | undefined, barKg: number): string | null {
  if (loadKg == null) return null;
  if (unit === "kg/main" || unit === "kg/jambe" || unit === "corps" || unit === "poids du corps") return null;
  const result = platesPerSide(loadKg, barKg);
  if (result.perSide < 0) return `La charge est plus légère que la barre de ${formatKg(barKg)} kg.`;
  const placed = Math.round((result.perSide - Math.max(0, result.remainder)) * 100) / 100;
  const exact = Math.round((barKg + placed * 2) * 100) / 100;
  if (result.plates.length === 0) {
    return `${formatKg(loadKg)} kg n’est pas atteignable avec ces disques. La barre seule fait ${formatKg(barKg)} kg.`;
  }
  const bits = result.plates.flatMap((plate) => Array.from({ length: plate.count }, () => formatKg(plate.kg)));
  const line = `${bits.join(" + ")} kg de chaque côté, soit ${formatKg(exact)} kg`;
  if (result.remainder > 0.05) {
    return `${line}. Il reste ${formatKg(result.remainder)} kg de chaque côté : ${formatKg(loadKg)} kg n’est pas atteignable avec ces disques.`;
  }
  return line;
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

/** Durée estimée : le temps de chaque série, plus les repos entre elles. Une course garde sa durée. */
export function estimateMinutes(session: Session): number {
  if (session.cardio?.durationMin != null && isMostlyCardio(session)) return Math.max(1, Math.round(session.cardio.durationMin));
  const noted = isMostlyCardio(session) || enduranceShaped(session) ? minutesMentioned(session) : null;
  if (noted != null) return noted;
  let seconds = 0;
  for (const exercise of session.exercises) {
    const count = exercise.sets.length > 0 ? exercise.sets.length : Math.max(0, exercise.planned.sets);
    if (count <= 0) continue;
    const rest = Math.max(0, exercise.planned.restSec);
    seconds += count * 45 + Math.max(0, count - 1) * rest;
  }
  if (session.cardio?.durationMin != null) seconds += session.cardio.durationMin * 60;
  if (seconds <= 0 && session.durationMin != null) return Math.max(1, Math.round(session.durationMin));
  return Math.max(1, Math.round(seconds / 60));
}

/** Ce que l’on peut dire d’une course : champs notés, sinon une durée écrite dans la note. */
export function runFacts(session: Session): { duration: string | null; distance: string | null; pace: string | null } {
  const cardio = session.cardio;
  if (cardio && (cardio.durationMin != null || cardio.distanceKm != null || cardio.pace)) {
    return {
      duration: cardio.durationMin != null ? formatMinutes(cardio.durationMin) : null,
      distance: cardio.distanceKm != null ? `${formatKg(cardio.distanceKm)} km` : null,
      pace: cardio.pace,
    };
  }
  const text = [session.coachNote, ...session.exercises.map((exercise) => exercise.note)].filter(Boolean).join(" ");
  const range = text.match(/(\d+)\s*[–-]\s*(\d+)\s*min/);
  const one = text.match(/(\d+)\s*min/);
  return {
    duration: range ? `${range[1]}–${range[2]} min` : one ? `${one[1]} min` : null,
    distance: null,
    pace: null,
  };
}

function minutesMentioned(session: Session): number | null {
  const facts = runFacts(session);
  if (!facts.duration) return null;
  const range = facts.duration.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  const one = facts.duration.match(/(\d+)/);
  return one ? Number(one[1]) : null;
}

function isMostlyCardio(session: Session): boolean {
  return session.exercises.every((exercise) => exercise.planned.loadKg == null && exercise.planned.restSec === 0);
}

/** Course, nage ou lignes droites : aucune charge, aucune répétition comptée. */
function enduranceShaped(session: Session): boolean {
  return session.exercises.length > 0 && session.exercises.every((exercise) => exercise.planned.loadKg == null && exercise.planned.reps == null);
}

export function coachErrorText(message: string): string {
  if (/souffle/i.test(message) || /pas encore activé/i.test(message)) return message;
  if (/https?:|joignable|401|refus|illisible|adresse utilisée/i.test(message)) {
    return "L’adresse ou le code ne répond pas. Ouvrez Réglages, rubrique Connexions.";
  }
  const stripped = message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return stripped || "Le coach n’a pas pu répondre. Ouvrez Réglages, rubrique Connexions.";
}

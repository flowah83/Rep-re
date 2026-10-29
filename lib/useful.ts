import { CATALOG, type CatalogExercise } from "./exercises";
import type { CardioLog, Session } from "./types";
import { uid } from "./utils";

export type Gear = CatalogExercise["equipment"];

export const GEAR: Gear[] = ["barre", "halteres", "poulie", "machine", "corps"];

export const GEAR_LABEL: Record<Gear, string> = {
  barre: "Barre",
  halteres: "Haltères",
  poulie: "Poulie",
  machine: "Machine",
  corps: "Poids du corps",
};

export type SessionTemplate = {
  id: string;
  title: string;
  exercises: { name: string; sets: number; reps: number; loadKg: number | null; restSec: number }[];
};

/** Absent ou vide : tout le matériel reste proposé. Rien ne disparaît tout seul. */
export function gearAllows(equipment: Gear, selected: Gear[] | undefined | null): boolean {
  if (!selected || selected.length === 0 || selected.length >= GEAR.length) return true;
  return selected.includes(equipment);
}

export function toggleGear(selected: Gear[] | undefined | null, gear: Gear): Gear[] | undefined {
  const current = !selected || selected.length === 0 || selected.length >= GEAR.length ? [...GEAR] : [...selected];
  const next = current.includes(gear) ? current.filter((item) => item !== gear) : [...current, gear];
  if (next.length === 0 || next.length >= GEAR.length) return undefined;
  return GEAR.filter((item) => next.includes(item));
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = items.slice();
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

/** Même geste, autre matériel disponible. Rien si le matériel actuel convient, ou s’il n’y a pas d’autre choix. */
export function substituteExercise(name: string, selected: Gear[] | undefined | null, catalog: CatalogExercise[] = CATALOG): { name: string; reason: string } | null {
  const key = name.trim().toLowerCase();
  const current = catalog.find((item) => item.name.toLowerCase() === key);
  if (!current || gearAllows(current.equipment, selected)) return null;
  const other = catalog.find((item) => item.pattern === current.pattern && item.id !== current.id && gearAllows(item.equipment, selected));
  if (!other) return null;
  return {
    name: other.name,
    reason: `Sans ${GEAR_LABEL[current.equipment].toLowerCase()}. ${other.name} reprend le même geste.`,
  };
}

export function templateFromSession(session: Session): SessionTemplate {
  return {
    id: uid(),
    title: session.title.trim() || "Séance",
    exercises: session.exercises
      .filter((exercise) => exercise.name.trim())
      .map((exercise) => ({
        name: exercise.name,
        sets: Math.max(1, exercise.planned.sets || exercise.sets.filter((set) => !set.warmup).length || 1),
        reps: exercise.planned.reps ?? exercise.sets.find((set) => set.reps != null)?.reps ?? 8,
        loadKg: exercise.planned.loadKg,
        restSec: exercise.planned.restSec ?? 90,
      })),
  };
}

export function rememberTemplate(existing: SessionTemplate[] | undefined, next: SessionTemplate): SessionTemplate[] {
  const title = next.title.trim().toLowerCase();
  const kept = (existing ?? []).filter((item) => item.title.trim().toLowerCase() !== title);
  return [next, ...kept].slice(0, 8);
}

export function readTemplates(value: unknown): SessionTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as SessionTemplate;
    if (typeof row.id !== "string" || typeof row.title !== "string" || !Array.isArray(row.exercises)) return [];
    const exercises = row.exercises.flatMap((exercise) => {
      if (!exercise || typeof exercise.name !== "string" || !exercise.name.trim()) return [];
      return [{
        name: exercise.name,
        sets: finite(exercise.sets, 1, 40) ?? 3,
        reps: finite(exercise.reps, 1, 100) ?? 8,
        loadKg: exercise.loadKg == null ? null : finite(exercise.loadKg, 0, 500),
        restSec: finite(exercise.restSec, 0, 600) ?? 90,
      }];
    });
    if (!exercises.length) return [];
    return [{ id: row.id, title: row.title, exercises }];
  });
}

export type SportKind = "course" | "natation";

export function sportPace(kind: SportKind, distance: number, durationMin: number): string | null {
  if (!(distance > 0) || !(durationMin > 0)) return null;
  const seconds = kind === "course" ? (durationMin * 60) / distance : (durationMin * 60) / (distance / 100);
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  const unit = kind === "course" ? "km" : "100 m";
  return `${minutes}:${String(rest).padStart(2, "0")} / ${unit}`;
}

/** Indicateur du sport, sans note de forme. */
export function sportIndicator(cardio: CardioLog): string {
  const kind = sportKind(cardio.sport);
  const bits: string[] = [];
  if (cardio.durationMin != null) bits.push(`${formatFr(cardio.durationMin)} min`);
  if (kind === "natation" && cardio.distanceKm != null) bits.push(`${formatFr(Math.round(cardio.distanceKm * 1000))} m`);
  else if (cardio.distanceKm != null) bits.push(`${formatFr(cardio.distanceKm)} km`);
  const pace = kind && cardio.distanceKm != null && cardio.durationMin != null
    ? sportPace(kind, kind === "natation" ? cardio.distanceKm * 1000 : cardio.distanceKm, cardio.durationMin)
    : cardio.pace;
  if (pace) bits.push(pace);
  if (cardio.rpe != null) bits.push(`ressenti ${formatFr(cardio.rpe)}`);
  return bits.join(" · ") || cardio.sport;
}

export function buildSportSession(input: {
  kind: SportKind;
  date: string;
  durationMin: number | null;
  distance: number | null;
  rpe: number | null;
}): { session: Session } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "La date n’est pas lisible." };
  if (input.durationMin == null || input.durationMin <= 0) return { error: "Indiquez une durée, par exemple 30 min." };
  if (input.distance == null || input.distance <= 0) {
    return { error: input.kind === "natation" ? "Indiquez une distance, par exemple 1500 m." : "Indiquez une distance, par exemple 5 km." };
  }
  if (input.rpe == null || input.rpe < 1 || input.rpe > 10) return { error: "Le ressenti va de 1 à 10." };
  const distanceKm = input.kind === "natation" ? Math.round(input.distance) / 1000 : input.distance;
  const pace = sportPace(input.kind, input.distance, input.durationMin);
  const title = input.kind === "course" ? "Course" : "Natation";
  const cardio: CardioLog = {
    sport: title,
    durationMin: input.durationMin,
    distanceKm,
    rpe: input.rpe,
    pace,
    hrAvg: null,
    hrMax: null,
    elevationM: null,
    kcal: null,
  };
  return {
    session: {
      id: uid(),
      date: input.date,
      title,
      status: "done",
      source: "manual",
      closed: "full",
      exercises: [],
      cardio,
      durationMin: input.durationMin,
    },
  };
}

function sportKind(sport: string): SportKind | null {
  const key = sport.trim().toLowerCase();
  if (key.includes("natation") || key.includes("nage")) return "natation";
  if (key.includes("course") || key.includes("running")) return "course";
  return null;
}

function finite(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function formatFr(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

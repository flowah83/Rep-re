import type { ExerciseLog, Session, SetLog, Settings } from "./types";
import { canonicalUnit, inferredUnit, isKnownUnit } from "./unit";

export const SCHEMA_VERSION = 2;

export type UnitFlag = { sessionId: string; exerciseId: string; name: string; reason: string };

function setUnits(exercise: ExerciseLog): string[] {
  const values = exercise.sets.map((set) => (set.unit ? canonicalUnit(set.unit) : "")).filter(Boolean);
  return [...new Set(values)];
}

function conflicts(exercise: ExerciseLog): string | null {
  if (exercise.unit && !isKnownUnit(exercise.unit)) return "Unité inconnue, laissée telle quelle.";
  const written = setUnits(exercise);
  if (written.length > 1) return "Les séries n’ont pas la même unité. Rien n’a été converti.";
  if (exercise.unit && written.length === 1 && canonicalUnit(exercise.unit) !== written[0]) {
    return "L’unité de l’exercice et celle des séries ne concordent pas. Rien n’a été converti.";
  }
  if (!exercise.unit && !inferredUnit(exercise) && written.length === 0) return "Unité absente et nom ambigu. Rien n’a été converti.";
  return null;
}

function withInferred(exercise: ExerciseLog): ExerciseLog {
  const nextUnit = inferredUnit(exercise);
  if (!nextUnit) return exercise;
  return {
    ...exercise,
    unit: nextUnit,
    unitSource: "inferred",
    sets: exercise.sets.map((set) => (set.unit ? set : { ...set, unit: nextUnit, unitSource: "inferred" as const })),
  };
}

export function migrateUnits(sessions: Session[]): { sessions: Session[]; flags: UnitFlag[]; changed: boolean } {
  let changed = false;
  const flags: UnitFlag[] = [];
  const next = sessions.map((session) => {
    let sessionChanged = false;
    const exercises = session.exercises.map((exercise) => {
      const reason = conflicts(exercise);
      if (reason) {
        flags.push({ sessionId: session.id, exerciseId: exercise.id, name: exercise.name, reason });
        return exercise;
      }
      if (exercise.unit || exercise.unitSource === "inferred") return exercise;
      const filled = withInferred(exercise);
      if (filled === exercise) return exercise;
      sessionChanged = true;
      return filled;
    });
    if (!sessionChanged) return session;
    changed = true;
    return { ...session, exercises };
  });
  return { sessions: next, flags, changed };
}

export function revertUnitMigration(sessions: Session[]): Session[] {
  return sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => revertExercise(exercise)),
  }));
}

function revertExercise(exercise: ExerciseLog): ExerciseLog {
  const sets = exercise.sets.map((set) => revertSet(set));
  if (exercise.unitSource !== "inferred") return { ...exercise, sets };
  const next = { ...exercise, sets };
  delete next.unit;
  delete next.unitSource;
  return next;
}

function revertSet(set: SetLog): SetLog {
  if (set.unitSource !== "inferred") return set;
  const next = { ...set };
  delete next.unit;
  delete next.unitSource;
  return next;
}

export function migrateStored(state: { settings: Settings; sessions: Session[] }): {
  settings: Settings;
  sessions: Session[];
  changed: boolean;
  flags: UnitFlag[];
} {
  const migrated = migrateUnits(state.sessions);
  const version = state.settings.schemaVersion ?? 1;
  return {
    settings: { ...state.settings, schemaVersion: SCHEMA_VERSION },
    sessions: migrated.sessions,
    changed: version < SCHEMA_VERSION || migrated.changed,
    flags: migrated.flags,
  };
}

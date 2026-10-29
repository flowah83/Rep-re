import { isCalendarDate, MAX_EXERCISES, MAX_SESSIONS, MAX_SETS, TEXT_LIMIT } from "./contract";
import { PATTERN_LABEL, MUSCLE_LABEL } from "./exercises";
import type { BackupFile, CustomExercise, Session, Settings } from "./types";
import { uid } from "./utils";

export const INSTALL_LINE = "L’icône sur l’écran d’accueil ne copie pas le carnet. Une copie, c’est un fichier téléchargé.";
export const UNSAVED_LABEL = "Modifications non enregistrées";

export function isBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== "object") return false;
  const value = data as BackupFile;
  return value.app === "repere" && typeof value.version === "number" && Array.isArray(value.sessions) && value.settings != null;
}

/** Refuse une copie douteuse avant toute écriture. Les champs inconnus restent dans l’objet d’origine. */
export function backupProblem(data: BackupFile): string | null {
  if (data.version !== 1) return "Cette copie vient d’une version que cette application ne sait pas encore lire. Rien n’a été remplacé.";
  if (!data.settings || typeof data.settings !== "object") return "Cette copie n’a pas de réglages. Rien n’a été remplacé.";
  if (!Array.isArray(data.customExercises)) return "Cette copie n’a pas de bibliothèque. Rien n’a été remplacé.";
  if (data.sessions.length > MAX_SESSIONS) return "Cette copie a trop de séances. Rien n’a été remplacé.";
  const theme = data.settings.theme;
  if (theme != null && theme !== "light" && theme !== "dark" && theme !== "system") {
    return "Le thème de cette copie n’est pas reconnu. Rien n’a été remplacé.";
  }
  for (const custom of data.customExercises) {
    if (!custom || typeof custom.id !== "string" || typeof custom.name !== "string" || !custom.name.trim()) {
      return "Cette copie a un exercice de bibliothèque illisible. Rien n’a été remplacé.";
    }
    if (!(custom.pattern in PATTERN_LABEL)) return "Cette copie a une famille d’exercice inconnue. Rien n’a été remplacé.";
    if (!Array.isArray(custom.cues)) return "Cette copie a des repères illisibles. Rien n’a été remplacé.";
  }
  const seen = new Set<string>();
  for (const session of data.sessions) {
    const problem = sessionProblem(session);
    if (problem) return problem;
    if (seen.has(session.id)) return "Cette copie répète une séance. Rien n’a été remplacé.";
    seen.add(session.id);
  }
  if (data.settings.barKg != null && (!Number.isFinite(data.settings.barKg) || data.settings.barKg < 0 || data.settings.barKg > 80)) {
    return "Le poids de barre de cette copie n’est pas valide. Rien n’a été remplacé.";
  }
  return null;
}

function sessionProblem(session: Session): string | null {
  if (!session || typeof session.id !== "string" || !session.id.trim()) return "Cette copie a une séance sans identifiant. Rien n’a été remplacé.";
  if (typeof session.title !== "string" || !session.title.trim()) return "Cette copie a une séance sans nom. Rien n’a été remplacé.";
  if (!isCalendarDate(session.date)) return "Cette copie a une date impossible. Rien n’a été remplacé.";
  if (session.status !== "planned" && session.status !== "active" && session.status !== "done") {
    return "Cette copie a un statut de séance inconnu. Rien n’a été remplacé.";
  }
  if (!Array.isArray(session.exercises)) return "Cette copie a une séance sans exercices. Rien n’a été remplacé.";
  if (session.exercises.length > MAX_EXERCISES) return "Cette copie a trop d’exercices. Rien n’a été remplacé.";
  for (const exercise of session.exercises) {
    if (!exercise || typeof exercise.id !== "string" || typeof exercise.name !== "string") {
      return "Cette copie a un exercice illisible. Rien n’a été remplacé.";
    }
    if (!Array.isArray(exercise.sets) || !exercise.planned) return "Cette copie a un exercice incomplet. Rien n’a été remplacé.";
    if (exercise.sets.length > MAX_SETS) return "Cette copie a trop de séries. Rien n’a été remplacé.";
    if (exercise.muscles != null) {
      if (!Array.isArray(exercise.muscles)) return "Cette copie a des muscles illisibles. Rien n’a été remplacé.";
      for (const muscle of exercise.muscles) {
        if (!(muscle in MUSCLE_LABEL)) return "Cette copie a un muscle inconnu. Rien n’a été remplacé.";
      }
    }
    const plannedSets = exercise.planned.sets;
    if (typeof plannedSets !== "number" || !Number.isInteger(plannedSets) || plannedSets < 0) {
      return "Cette copie a un nombre de séries impossible. Rien n’a été remplacé.";
    }
    for (const set of exercise.sets) {
      if (!set || typeof set.id !== "string") return "Cette copie a une série illisible. Rien n’a été remplacé.";
      for (const value of [set.loadKg, set.reps, set.rpe, set.rir]) {
        if (value != null && (typeof value !== "number" || !Number.isFinite(value))) {
          return "Cette copie a un nombre impossible. Rien n’a été remplacé.";
        }
        if (typeof value === "number" && value < 0) return "Cette copie a une charge ou une répétition négative. Rien n’a été remplacé.";
      }
    }
  }
  if ((session.noteForMe?.length ?? 0) > TEXT_LIMIT || (session.noteForCoach?.length ?? 0) > TEXT_LIMIT || (session.coachNote?.length ?? 0) > TEXT_LIMIT) {
    return "Une note de cette copie est trop longue. Rien n’a été remplacé.";
  }
  return null;
}

export function backupHasSecret(data: BackupFile): boolean {
  return Boolean(data.coachToken);
}

export function settingsTheme(settings: Settings): Settings["theme"] {
  return settings.theme === "light" || settings.theme === "dark" || settings.theme === "system" ? settings.theme : "system";
}

/** Le téléchargement n’est pas une copie confirmée. */
export function backupReminder(settings: Settings, now = Date.now()): { kind: "none" | "old" | "recent"; text: string } {
  const stamp = settings.lastDownloadAt ?? settings.lastBackupAt;
  if (!stamp || Number.isNaN(Date.parse(stamp))) {
    return { kind: "none", text: "Aucune copie n’a été téléchargée." };
  }
  const old = now - Date.parse(stamp) > 7 * 86400000;
  if (old) {
    return { kind: "old", text: "Le dernier téléchargement date de plus d’une semaine. Il ne prouve pas que le fichier est encore là." };
  }
  return { kind: "recent", text: "Un téléchargement a été lancé récemment. Il ne prouve pas que le fichier est encore là." };
}

export function sessionsForBackup<T extends { source?: string }>(sessions: T[]): T[] {
  return sessions.filter((session) => session.source !== "demo");
}

export type IdChoice = "keep" | "replace" | "copy";

export type BackupCollision = { id: string; existing: Session; incoming: Session; choice: IdChoice };

export function planBackupAdd(existing: Session[], incoming: Session[]): { added: Session[]; collisions: BackupCollision[] } {
  const byId = new Map(existing.map((session) => [session.id, session]));
  const seen = new Set(byId.keys());
  const added: Session[] = [];
  const collisions: BackupCollision[] = [];
  for (const session of incoming) {
    if (session.source === "demo") continue;
    const current = byId.get(session.id);
    if (!current) {
      const copy = seen.has(session.id) ? { ...session, id: uid() } : session;
      seen.add(copy.id);
      added.push(copy);
      continue;
    }
    if (JSON.stringify(current) === JSON.stringify(session)) continue;
    collisions.push({ id: session.id, existing: current, incoming: session, choice: "keep" });
  }
  return { added, collisions };
}

export function applyBackupAdd(existing: Session[], added: Session[], collisions: BackupCollision[], choices: Record<string, IdChoice> = {}): Session[] {
  const next = existing.map((session) => ({ ...session }));
  const index = new Map(next.map((session, at) => [session.id, at]));
  for (const session of added) {
    if (index.has(session.id)) continue;
    index.set(session.id, next.length);
    next.push(session);
  }
  for (const collision of collisions) {
    const choice = choices[collision.id] ?? "keep";
    if (choice === "replace") {
      const at = index.get(collision.id);
      if (at != null) next[at] = collision.incoming;
    } else if (choice === "copy") {
      let id = uid();
      while (index.has(id)) id = uid();
      index.set(id, next.length);
      next.push({ ...collision.incoming, id });
    }
  }
  return next;
}

export function copyLog<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function emergencyBackup(sessions: Session[], settings: Settings, customs: CustomExercise[]): BackupFile {
  return {
    app: "repere",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    sessions: sessionsForBackup(sessions),
    customExercises: customs,
  };
}

import { isCalendarDate, TEXT_LIMIT } from "./contract";
import type { BackupFile, Session, Settings } from "./types";

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
  for (const exercise of session.exercises) {
    if (!exercise || typeof exercise.id !== "string" || typeof exercise.name !== "string") {
      return "Cette copie a un exercice illisible. Rien n’a été remplacé.";
    }
    if (!Array.isArray(exercise.sets) || !exercise.planned) return "Cette copie a un exercice incomplet. Rien n’a été remplacé.";
    for (const set of exercise.sets) {
      if (!set || typeof set.id !== "string") return "Cette copie a une série illisible. Rien n’a été remplacé.";
      for (const value of [set.loadKg, set.reps, set.rpe, set.rir]) {
        if (value != null && (typeof value !== "number" || !Number.isFinite(value))) {
          return "Cette copie a un nombre impossible. Rien n’a été remplacé.";
        }
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

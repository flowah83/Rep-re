import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BackupFile, CustomExercise, Session, Settings } from "./types";

type Schema = DBSchema & {
  sessions: { key: string; value: Session };
  customs: { key: string; value: CustomExercise };
  meta: { key: string; value: Settings };
};

const DEFAULTS: Settings = { onboarded: false, theme: "system", barKg: 20 };

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>("repere", 1, {
      upgrade(database) {
        database.createObjectStore("sessions", { keyPath: "id" });
        database.createObjectStore("customs", { keyPath: "id" });
        database.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

export async function loadState(): Promise<{ settings: Settings; sessions: Session[]; customs: CustomExercise[] }> {
  const database = await db();
  const [settings, sessions, customs] = await Promise.all([
    database.get("meta", "settings"),
    database.getAll("sessions"),
    database.getAll("customs"),
  ]);
  return { settings: settings ?? DEFAULTS, sessions, customs };
}

export async function saveSettings(settings: Settings) {
  const database = await db();
  await database.put("meta", settings, "settings");
}

export async function saveSession(session: Session) {
  const database = await db();
  await database.put("sessions", session);
}

export async function deleteSession(id: string) {
  const database = await db();
  await database.delete("sessions", id);
}

export async function saveCustom(ex: CustomExercise) {
  const database = await db();
  await database.put("customs", ex);
}

/** Une seule transaction : tout est écrit, ou rien ne l’est. */
export async function putMany(sessions: Session[], customs: CustomExercise[]) {
  const database = await db();
  const tx = database.transaction(["sessions", "customs"], "readwrite");
  for (const session of sessions) await tx.objectStore("sessions").put(session);
  for (const custom of customs) await tx.objectStore("customs").put(custom);
  await tx.done;
}

export async function replaceAll(backup: BackupFile) {
  const database = await db();
  const tx = database.transaction(["sessions", "customs", "meta"], "readwrite");
  await tx.objectStore("sessions").clear();
  await tx.objectStore("customs").clear();
  for (const session of backup.sessions) await tx.objectStore("sessions").put(session);
  for (const custom of backup.customExercises) await tx.objectStore("customs").put(custom);
  await tx.objectStore("meta").put(backup.settings, "settings");
  await tx.done;
}

export function toCsv(sessions: Session[]): string {
  const rows = ["date,titre,exercice,serie,charge_kg,repetitions,rpe,echauffement,unite,cote"];
  for (const session of sessions) {
    session.exercises.forEach((ex) => {
      ex.sets.forEach((set, index) => {
        if (!set.done) return;
        rows.push(
          [
            csvCell(session.date),
            csvCell(session.title),
            csvCell(ex.name),
            csvCell(index + 1),
            csvCell(set.loadKg),
            csvCell(set.reps),
            csvCell(set.rpe),
            csvCell(set.warmup ? "oui" : "non"),
            csvCell(set.unit ?? ex.unit),
            csvCell(set.side),
          ].join(","),
        );
      });
    });
  }
  return rows.join("\n");
}

function csvCell(value: string | number | null | undefined) {
  if (value == null) return "";
  const raw = String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n]/.test(safe) || safe.startsWith("'")) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

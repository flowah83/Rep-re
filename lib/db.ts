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
  const rows = ["date,titre,exercice,serie,charge_kg,repetitions,rpe,echauffement"];
  for (const session of sessions) {
    session.exercises.forEach((ex) => {
      ex.sets.forEach((set, index) => {
        if (!set.done) return;
        rows.push(
          [
            session.date,
            csv(session.title),
            csv(ex.name),
            String(index + 1),
            set.loadKg ?? "",
            set.reps ?? "",
            set.rpe ?? "",
            set.warmup ? "oui" : "non",
          ].join(","),
        );
      });
    });
  }
  return rows.join("\n");
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

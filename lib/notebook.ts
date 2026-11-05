import type { CustomExercise, Session } from "./types";

export type NotebookWrite =
  | { op: "delete-session"; id: string }
  | { op: "put-session"; session: Session }
  | { op: "put-custom"; custom: CustomExercise };

/** Toutes les écritures d’un remplacement de carnet, à jouer dans une seule transaction. */
export function notebookWrites(
  previous: Session[],
  nextSessions: Session[],
  currentCustoms: CustomExercise[],
  nextCustoms?: CustomExercise[],
): NotebookWrite[] {
  const writes: NotebookWrite[] = [];
  const nextIds = new Set(nextSessions.map((session) => session.id));
  for (const session of previous) {
    if (!nextIds.has(session.id)) writes.push({ op: "delete-session", id: session.id });
  }
  const previousJson = new Map(previous.map((session) => [session.id, JSON.stringify(session)]));
  for (const session of nextSessions) {
    if (previousJson.get(session.id) !== JSON.stringify(session)) writes.push({ op: "put-session", session });
  }
  if (nextCustoms) {
    for (const custom of nextCustoms) {
      const known = currentCustoms.find((item) => item.id === custom.id);
      if (!known || known.name !== custom.name || known.pattern !== custom.pattern) writes.push({ op: "put-custom", custom });
    }
  }
  return writes;
}

export interface NotebookTx {
  apply(write: NotebookWrite): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

/** Si une écriture échoue, rien n’est confirmé. */
export async function applyNotebookWrites(writes: NotebookWrite[], tx: NotebookTx): Promise<void> {
  try {
    for (const write of writes) await tx.apply(write);
    await tx.commit();
  } catch (error) {
    try {
      await tx.abort();
    } catch {
      /* la transaction est déjà annulée */
    }
    throw error;
  }
}

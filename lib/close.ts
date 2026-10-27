import type { Session } from "./types";

/** Le texte suit l’état réellement enregistré. Tant que la séance est ouverte, elle n’est pas « terminée ». */
export function closeCopy(session: Pick<Session, "status">): { title: string; action: string } {
  if (session.status === "done") return { title: "Séance terminée", action: "Voir le bilan" };
  return { title: "Tout est noté.", action: "Terminer la séance" };
}

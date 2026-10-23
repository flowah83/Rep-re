import type { Session } from "./types";

const KEY = "repere-plan-snapshot";

function read(): Record<string, Session> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, Session>;
  } catch {
    return {};
  }
}

/** Garde le plan d’avant le départ, pour pouvoir le remettre sans toucher à la base. */
export function rememberPlan(session: Session) {
  try {
    const all = read();
    if (all[session.id]) return;
    all[session.id] = session;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* stockage privé */
  }
}

export function recallPlan(id: string): Session | null {
  return read()[id] ?? null;
}

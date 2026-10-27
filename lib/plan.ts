import { decodeText, encodeText } from "./codec";
import { isCalendarDate, isClock, normalizeUnit } from "./contract";
import { customFromMatch, resolveExercise } from "./exercises";
import type { CustomExercise, ExerciseLog, Session, SetLog } from "./types";
import { finiteOrNull, uid } from "./utils";

export function mergePlans(current: Session[], incoming: Session[]): { sessions: Session[]; touched: Session[] } {
  const next = current.map((session) => ({ ...session }));
  const touched: Session[] = [];
  for (const item of incoming) {
    const index = next.findIndex((session) => session.date === item.date && session.title === item.title);
    if (index === -1) {
      next.push(item);
      touched.push(item);
    } else if (next[index].status === "planned") {
      const replaced = { ...item, id: next[index].id };
      next[index] = replaced;
      touched.push(replaced);
    }
  }
  return { sessions: next, touched };
}

export type PlanExercise = {
  nom: string;
  series?: number;
  repetitions?: number | null;
  charge_kg?: number | null;
  repos_secondes?: number;
  rpe_vise?: number | null;
  note?: string;
  unite?: string;
  echauffement?: { charge_kg?: number; repetitions?: number }[];
};

export type PlanSession = {
  date?: string;
  heure?: string;
  titre?: string;
  intention?: string;
  note?: string;
  exercices?: PlanExercise[];
};

export type PlanFile = {
  semaine?: string;
  seances?: PlanSession[];
};

export function parsePlan(
  raw: string,
  customs: CustomExercise[] = [],
): { sessions: Session[]; customs: CustomExercise[] } | { error: string } {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!text) return { error: "Le texte est vide. Collez le plan de Chef sport." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "Ce texte n’est pas un plan lisible. Il doit être au format convenu avec Chef sport." };
  }
  const sessions = extractSessions(data);
  if (!sessions) {
    return { error: "Il manque la liste « seances ». Chef sport doit envoyer la semaine, ou une séance avec sa date." };
  }
  if (sessions.length === 0) return { error: "Le plan ne contient aucune séance." };
  const built: Session[] = [];
  const created: CustomExercise[] = [];
  for (const [index, item] of sessions.entries()) {
    if (!item || typeof item !== "object") {
      return { error: `La séance ${index + 1} est illisible.` };
    }
    const date = typeof item.date === "string" ? item.date : "";
    const title = typeof item.titre === "string" && item.titre.trim() ? item.titre.trim() : "Séance";
    if (!isCalendarDate(date)) {
      return { error: `« ${title} » : cette date n’existe pas.` };
    }
    const time = typeof item.heure === "string" ? item.heure.trim() : "";
    if (time && !isClock(time)) return { error: `« ${title} » : l’heure n’est pas réelle.` };
    if (!Array.isArray(item.exercices) || item.exercices.length === 0) {
      return { error: `« ${title} » n’a pas d’exercices.` };
    }
    const exercises: ExerciseLog[] = [];
    for (const ex of item.exercices) {
      if (!ex || typeof ex.nom !== "string" || !ex.nom.trim()) {
        return { error: `Un exercice de « ${title} » n’a pas de nom.` };
      }
      const setsN = Number(ex.series ?? 0);
      if (!Number.isFinite(setsN) || setsN < 1) {
        return { error: `« ${ex.nom} » n’a pas de nombre de séries.` };
      }
      exercises.push(exerciseFromPlan(ex, customs, created));
    }
    const stableId = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    built.push({
      id: stableId || uid(),
      date,
      time: time || undefined,
      title,
      intention: typeof item.intention === "string" ? item.intention : undefined,
      coachNote: typeof item.note === "string" ? item.note : undefined,
      status: "planned",
      source: "coach",
      scheduled: true,
      exercises,
    });
  }
  return { sessions: built, customs: created };
}

function extractSessions(data: unknown): PlanSession[] | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as PlanFile & PlanSession;
  if (Array.isArray(obj.seances)) return obj.seances;
  if (Array.isArray(obj.exercices) && typeof obj.date === "string") return [obj];
  return null;
}

export function exerciseFromPlan(ex: PlanExercise, customs: CustomExercise[] = [], created: CustomExercise[] = []): ExerciseLog {
  const known = [...customs, ...created];
  const meta = resolveExercise(ex.nom, known);
  if (!meta.matched && !known.some((item) => item.name === meta.name)) created.push(customFromMatch(ex.nom, meta));
  const setsN = Math.max(1, Math.round(Number(ex.series ?? 1)));
  const reps = finiteOrNull(ex.repetitions);
  const load = finiteOrNull(ex.charge_kg);
  const rest = finiteOrNull(ex.repos_secondes) ?? defaultRest(meta.pattern);
  const rpe = finiteOrNull(ex.rpe_vise);
  const unit = normalizeUnit(ex.unite);
  const sets: SetLog[] = [];
  for (const warm of ex.echauffement ?? []) {
    sets.push({
      id: uid(),
      loadKg: finiteOrNull(warm.charge_kg),
      reps: finiteOrNull(warm.repetitions),
      rpe: null,
      unit,
      warmup: true,
      done: false,
    });
  }
  for (let i = 0; i < setsN; i++) {
    sets.push({
      id: uid(),
      loadKg: load,
      reps: null,
      rpe: null,
      unit,
      warmup: false,
      done: false,
    });
  }
  return {
    id: uid(),
    name: meta.name,
    pattern: meta.pattern,
    stepKg: meta.stepKg,
    cues: meta.cues,
    muscles: meta.muscles,
    note: ex.note,
    unit,
    planned: {
      sets: setsN,
      reps: Number.isFinite(reps as number) ? reps : null,
      loadKg: load,
      restSec: rest,
      rpe,
    },
    sets,
  };
}

export function defaultRest(pattern: string): number {
  if (pattern === "squat" || pattern === "hinge" || pattern === "hpush" || pattern === "vpush") return 180;
  return 90;
}

export function encodePlan(json: string): string {
  return encodeText(json);
}

export function decodePlan(token: string): string {
  return decodeText(token);
}

export function planFromLocation(href: string): string | null {
  const url = new URL(href, "https://repere.local");
  const fromQuery = url.searchParams.get("plan");
  if (fromQuery) return safeDecode(fromQuery);
  const hash = url.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const fromHash = params.get("plan");
  if (fromHash) return safeDecode(fromHash);
  return null;
}

function safeDecode(token: string): string | null {
  try {
    return decodePlan(token);
  } catch {
    return null;
  }
}

export const EXAMPLE_PLAN = `{
  "semaine": "2026-10-19",
  "seances": [
    {
      "date": "2026-10-22",
      "heure": "18:15",
      "titre": "Poussée",
      "intention": "hypertrophie",
      "note": "On garde le couché à 80 kg. Si les quatre séries passent à 6, on montera à 82,5 kg.",
      "exercices": [
        {
          "nom": "Développé couché barre",
          "series": 4,
          "repetitions": 6,
          "charge_kg": 80,
          "repos_secondes": 180,
          "rpe_vise": 8,
          "echauffement": [{ "charge_kg": 60, "repetitions": 8 }]
        },
        {
          "nom": "Élévations latérales",
          "series": 3,
          "repetitions": 15,
          "charge_kg": 10,
          "repos_secondes": 75,
          "rpe_vise": 8
        }
      ]
    }
  ]
}`;

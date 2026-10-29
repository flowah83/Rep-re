import { decodeText, encodeText } from "./codec";
import { isCalendarDate, isClock, MAX_EXERCISES, MAX_SESSIONS, MAX_SETS, normalizeUnit, readStoredNumber } from "./contract";
import { customFromMatch, resolveExercise } from "./exercises";
import type { CustomExercise, ExerciseLog, Session, SetLog } from "./types";
import { unambiguousUnit } from "./unit";
import { finiteOrNull, uid } from "./utils";

export function mergePlans(current: Session[], incoming: Session[]): { sessions: Session[]; touched: Session[]; conflicts: { id: string; reason: string }[] } {
  const next = current.map((session) => ({ ...session }));
  const touched: Session[] = [];
  const conflicts: { id: string; reason: string }[] = [];
  const used = new Set(next.map((session) => session.id));
  for (const item of incoming) {
    const index = next.findIndex((session) => session.date === item.date && session.title === item.title);
    if (index === -1) {
      let session = item;
      if (used.has(item.id)) {
        const holder = next.find((known) => known.id === item.id);
        conflicts.push({
          id: item.id,
          reason: holder?.status === "done" ? "Séance déjà notée. Rien n’est écrasé." : "Identifiant déjà utilisé. La séance est importée comme copie.",
        });
        session = { ...item, id: freshId(used) };
      }
      used.add(session.id);
      next.push(session);
      touched.push(session);
    } else if (next[index].status === "planned") {
      const replaced = { ...item, id: next[index].id };
      next[index] = replaced;
      touched.push(replaced);
    } else {
      conflicts.push({ id: next[index].id, reason: "Cette séance est déjà notée. Le plan ne l’écrase pas." });
    }
  }
  return { sessions: next, touched, conflicts };
}

function freshId(used: Set<string>): string {
  let id = uid();
  while (used.has(id)) id = uid();
  return id;
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
  if (sessions.length > MAX_SESSIONS) return { error: "Ce plan a trop de séances. Rien n’a été ajouté." };
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
    if (item.exercices.length > MAX_EXERCISES) return { error: `« ${title} » a trop d’exercices. Rien n’a été ajouté.` };
    const exercises: ExerciseLog[] = [];
    for (const ex of item.exercices) {
      if (!ex || typeof ex.nom !== "string" || !ex.nom.trim()) {
        return { error: `Un exercice de « ${title} » n’a pas de nom.` };
      }
      const setsN = Number(ex.series ?? 0);
      if (!Number.isInteger(setsN) || setsN < 1 || setsN > MAX_SETS) {
        return { error: `« ${title} », « ${ex.nom} » : le nombre de séries doit être un entier.` };
      }
      if (ex.echauffement != null && !Array.isArray(ex.echauffement)) {
        return { error: `« ${title} », « ${ex.nom} » : l’échauffement doit être une liste, pas un objet.` };
      }
      const load = readStoredNumber(ex.charge_kg);
      if (!load.ok || (load.value != null && load.value < 0)) {
        return { error: `« ${title} », « ${ex.nom} » : la charge n’est pas valide.` };
      }
      const reps = readStoredNumber(ex.repetitions);
      if (!reps.ok || (reps.value != null && reps.value < 0)) {
        return { error: `« ${title} », « ${ex.nom} » : les répétitions ne sont pas valides.` };
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
  const written = normalizeUnit(ex.unite);
  const inferred = written ? null : unambiguousUnit({ name: meta.name });
  const unit = written ?? inferred;
  const unitSource = !written && inferred ? ("inferred" as const) : undefined;
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
      origin: "plan",
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
      origin: "plan",
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
    unitSource,
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

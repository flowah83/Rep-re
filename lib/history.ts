import { decodeImportToken } from "./codec";
import { customFromMatch, normalizeExerciseKey, resolveExercise } from "./exercises";
import { parsePlan } from "./plan";
import type { CardioLog, CustomExercise, ExerciseLog, Session, SetLog } from "./types";
import { finiteOrNull, formatLong, mondayOf, parseISODate, uid } from "./utils";

export type HistoryDraft = {
  sessions: Session[];
  recognized: string[];
  created: CustomExercise[];
};

export type ParsedImport =
  | { error: string }
  | { kind: "plan"; sessions: Session[]; customs: CustomExercise[] }
  | { kind: "history"; sessions: Session[]; customs: CustomExercise[]; recognized: string[] };

export type ImportPreview = {
  kind: "plan" | "history";
  toAdd: Session[];
  duplicates: number;
  recognized: string[];
  created: CustomExercise[];
  from: string | null;
  to: string | null;
  planSessions: Session[];
};

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function stripFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

/** Une série sous forme de tableau, c’est du passé. Un nombre, c’est un plan. */
export function detectImportKind(data: unknown): "history" | "plan" | "unknown" {
  if (!isObject(data)) return "unknown";
  if (Array.isArray(data.historique)) return "history";
  const list = sessionList(data);
  if (!list) return "unknown";
  for (const item of list) {
    if (!isObject(item)) continue;
    if (isObject(item.cardio)) return "history";
    const exercises = Array.isArray(item.exercices) ? item.exercices : [];
    for (const exercise of exercises) {
      if (!isObject(exercise)) continue;
      if (Array.isArray(exercise.series) || exercise.detail_series_inconnu === true) return "history";
    }
  }
  return list.length ? "plan" : "unknown";
}

function sessionList(data: Loose): unknown[] | null {
  if (Array.isArray(data.historique)) return data.historique;
  if (Array.isArray(data.seances)) return data.seances;
  if (Array.isArray(data.exercices) && typeof data.date === "string") return [data];
  return null;
}

export function parseImport(raw: string, customs: CustomExercise[] = []): ParsedImport {
  const text = stripFence(raw);
  if (!text) return { error: "Le texte est vide." };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "Ce texte n’est pas un JSON lisible." };
  }
  const kind = detectImportKind(data);
  if (kind === "history") return parseHistoryData(data, customs);
  if (kind === "plan") {
    const parsed = parsePlan(text, customs);
    if ("error" in parsed) return parsed;
    return { kind: "plan", sessions: parsed.sessions, customs: parsed.customs };
  }
  return { error: "Il manque « seances » ou « historique »." };
}

function parseHistoryData(data: unknown, customs: CustomExercise[]): ParsedImport {
  if (!isObject(data)) return { error: "L’historique est illisible." };
  const list = sessionList(data);
  if (!list) return { error: "Il manque la liste des séances." };
  if (list.length === 0) return { error: "L’historique ne contient aucune séance." };
  const known = customs.map((item) => ({ ...item }));
  const created: CustomExercise[] = [];
  const recognized = new Set<string>();
  const sessions: Session[] = [];
  for (const item of list) {
    const built = sessionFromHistory(item, known, created, recognized);
    if (built) sessions.push(built);
  }
  if (sessions.length === 0) return { error: "Aucune séance n’a de date au format année-mois-jour." };
  return { kind: "history", sessions, customs: created, recognized: [...recognized] };
}

function keyOf(name: string): string {
  return normalizeExerciseKey(name);
}

function adopt(name: string, known: CustomExercise[], created: CustomExercise[], recognized: Set<string>) {
  const match = resolveExercise(name, known);
  if (match.catalogId) {
    recognized.add(match.name);
    return match;
  }
  if (match.matched) {
    const createdHere = created.some((item) => normalizeExerciseKey(item.name) === keyOf(name));
    if (!createdHere) recognized.add(match.name);
    return match;
  }
  const custom = customFromMatch(name, match);
  if (!known.some((item) => item.id === custom.id)) {
    known.push(custom);
    created.push(custom);
  }
  return resolveExercise(name, known);
}

function sessionFromHistory(
  item: unknown,
  known: CustomExercise[],
  created: CustomExercise[],
  recognized: Set<string>,
): Session | null {
  if (!isObject(item)) return null;
  const date = text(item.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const title = text(item.titre) || text(item.title) || "Séance";
  const note = text(item.notes) || text(item.note);
  const cardio = cardioFrom(item.cardio);
  const exercises: ExerciseLog[] = [];
  if (Array.isArray(item.exercices)) {
    for (const exercise of item.exercices) {
      const built = exerciseFromHistory(exercise, known, created, recognized);
      if (built) exercises.push(built);
    }
  }
  const durationMin = finiteOrNull(item.duree_min);
  return {
    id: uid(),
    date,
    title,
    noteForMe: note || undefined,
    status: "done",
    source: "manual",
    exercises,
    cardio: cardio ?? undefined,
    durationMin: durationMin ?? cardio?.durationMin ?? undefined,
  };
}

function exerciseFromHistory(
  item: unknown,
  known: CustomExercise[],
  created: CustomExercise[],
  recognized: Set<string>,
): ExerciseLog | null {
  if (!isObject(item)) return null;
  const name = text(item.nom) || text(item.name);
  if (!name) return null;
  const match = adopt(name, known, created, recognized);
  const unit = unitOf(item.unite);
  const detailUnknown = item.detail_series_inconnu === true && (!Array.isArray(item.series) || item.series.length === 0);
  const sets: SetLog[] = [];
  if (Array.isArray(item.series)) {
    for (const set of item.series) {
      const built = setFromHistory(set, unit);
      if (built) sets.push(built);
    }
  }
  const note = text(item.notes) || text(item.note);
  const knownLoads = sets.map((set) => set.loadKg).filter((load): load is number => load != null);
  const knownReps = sets.map((set) => set.reps).filter((reps): reps is number => reps != null);
  const knownRpe = sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe != null);
  return {
    id: uid(),
    name: match.name,
    pattern: match.pattern,
    stepKg: match.stepKg,
    cues: match.cues,
    muscles: match.muscles,
    note: note || undefined,
    unit,
    detailUnknown: detailUnknown && sets.length === 0,
    planned: {
      sets: sets.length,
      reps: knownReps[0] ?? null,
      loadKg: knownLoads[0] ?? null,
      restSec: 120,
      rpe: knownRpe[0] ?? null,
    },
    sets,
  };
}

function setFromHistory(item: unknown, exerciseUnit: string | null): SetLog | null {
  if (!isObject(item)) return null;
  const side = text(item.cote);
  return {
    id: uid(),
    loadKg: finiteOrNull(item.charge_kg),
    reps: finiteOrNull(item.repetitions),
    rpe: finiteOrNull(item.rpe),
    rir: finiteOrNull(item.rir),
    side: side === "D" || side === "G" ? side : null,
    unit: unitOf(item.unite) ?? exerciseUnit,
    restRealSec: finiteOrNull(item.repos_reel_s),
    precision: text(item.precision) || null,
    warmup: false,
    done: true,
  };
}

function unitOf(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === "kg/main" || key.includes("par main")) return "kg/main";
  if (key === "kg/jambe" || key.includes("par jambe")) return "kg/jambe";
  if (key === "kg") return "kg";
  if (key.includes("pdc") || key.includes("poids du corps")) return raw;
  return raw;
}

function cardioFrom(value: unknown): CardioLog | null {
  if (!isObject(value)) return null;
  const sport = text(value.sport) || "Cardio";
  const label = text(value.type_seance);
  return {
    sport,
    label: label || undefined,
    durationMin: finiteOrNull(value.duree_min),
    distanceKm: finiteOrNull(value.distance_km),
    rpe: finiteOrNull(value.rpe_seance),
    pace: text(value.allure_source_km) || text(value.allure_calculee_km) || null,
    hrAvg: finiteOrNull(value.fc_moy),
    hrMax: finiteOrNull(value.fc_max),
    elevationM: finiteOrNull(value.d_plus_m),
    kcal: finiteOrNull(value.energie_active_kcal),
  };
}

export function historySignature(session: Session): string {
  return JSON.stringify({
    date: session.date,
    title: normalizeExerciseKey(session.title),
    cardio: session.cardio
      ? [session.cardio.sport, session.cardio.durationMin, session.cardio.distanceKm]
      : null,
    exercises: session.exercises.map((exercise) => ({
      name: normalizeExerciseKey(exercise.name),
      unknown: Boolean(exercise.detailUnknown),
      sets: exercise.sets.map((set) => [
        set.warmup ? 1 : 0,
        set.loadKg,
        set.reps,
        set.rpe,
        set.side ?? null,
        set.unit ?? null,
      ]),
    })),
  });
}

export function withoutDuplicates(existing: Session[], incoming: Session[]): { added: Session[]; duplicates: number } {
  const seen = new Set(existing.map(historySignature));
  const added: Session[] = [];
  let duplicates = 0;
  for (const session of incoming) {
    const key = historySignature(session);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    added.push(session);
  }
  return { added, duplicates };
}

export function previewImport(parsed: Exclude<ParsedImport, { error: string }>, existing: Session[]): ImportPreview {
  if (parsed.kind === "plan") {
    const dates = parsed.sessions.map((session) => session.date).sort();
    const createdNames = new Set(parsed.customs.map((item) => item.name));
    const recognized = new Set<string>();
    for (const session of parsed.sessions) {
      for (const exercise of session.exercises) {
        if (!createdNames.has(exercise.name)) recognized.add(exercise.name);
      }
    }
    return {
      kind: "plan",
      toAdd: [],
      duplicates: 0,
      recognized: [...recognized],
      created: parsed.customs,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      planSessions: parsed.sessions,
    };
  }
  const { added, duplicates } = withoutDuplicates(existing, parsed.sessions);
  const dates = parsed.sessions.map((session) => session.date).sort();
  return {
    kind: "history",
    toAdd: added,
    duplicates,
    recognized: parsed.recognized,
    created: parsed.customs,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    planSessions: [],
  };
}

export function importSummary(preview: ImportPreview): string[] {
  const count = preview.kind === "history" ? preview.toAdd.length + preview.duplicates : preview.planSessions.length;
  const fresh = preview.kind === "history" ? preview.toAdd.length : preview.planSessions.length;
  const lines: string[] = [];
  const period = preview.from && preview.to ? periodPhrase(preview.from, preview.to) : "";
  lines.push(`${countLabel(count)}${period ? `, ${period}` : ""}.`);
  if (preview.kind === "history" && preview.duplicates > 0 && fresh !== count) {
    lines.push(
      fresh === 0
        ? "Tout est déjà dans le carnet."
        : `${countLabel(fresh)} à ajouter. ${countLabel(preview.duplicates)} déjà présente${preview.duplicates > 1 ? "s" : ""}.`,
    );
  }
  const recognized = preview.recognized.length;
  const created = preview.created.length;
  const bits: string[] = [];
  if (recognized) bits.push(recognized === 1 ? "1 exercice reconnu" : `${recognized} exercices reconnus`);
  if (created) {
    const names = preview.created.map((item) => item.name).join(", ");
    bits.push(created === 1 ? `1 exercice créé (${names})` : `${created} exercices créés (${names})`);
  }
  if (bits.length) lines.push(`${bits.join(", ")}.`);
  if (preview.kind === "plan") lines.push("Ces séances restent à faire.");
  else lines.push("Les séances passées seront marquées comme terminées.");
  return lines;
}

function countLabel(count: number): string {
  return count === 1 ? "1 séance" : `${count} séances`;
}

function periodPhrase(from: string, to: string): string {
  if (from === to) return formatLong(from);
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `du ${fmt.format(parseISODate(from))} au ${fmt.format(parseISODate(to))}`;
}

export function cardioSummary(cardio: CardioLog): string {
  const bits: string[] = [];
  if (cardio.label) bits.push(cardio.label);
  if (cardio.durationMin != null) bits.push(formatMinutes(cardio.durationMin));
  if (cardio.distanceKm != null) bits.push(`${formatNumber(cardio.distanceKm)} km`);
  if (cardio.pace) bits.push(`allure ${cardio.pace}`);
  if (cardio.rpe != null) bits.push(`RPE ${formatNumber(cardio.rpe)}`);
  if (cardio.hrAvg != null) bits.push(`FC ${formatNumber(cardio.hrAvg)}`);
  if (cardio.elevationM != null) bits.push(`D+ ${formatNumber(cardio.elevationM)} m`);
  return bits.join(" · ") || cardio.sport;
}

export function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes - hours * 60);
    return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
  }
  const rounded = Math.round(minutes * 10) / 10;
  return `${formatNumber(rounded)} min`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

/** Plus récent d’abord. L’heure départage deux séances du même jour. */
export function compareSessionsNewestFirst(a: { date: string; time?: string }, b: { date: string; time?: string }): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.time ?? "").localeCompare(a.time ?? "");
}

/** La prochaine d’abord. L’heure la plus tôt départage deux séances du même jour. */
export function compareSessionsSoonestFirst(a: { date: string; time?: string }, b: { date: string; time?: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.time ?? "").localeCompare(b.time ?? "");
}

/** Prévue, ou datée après aujourd’hui : elle ne va pas dans la liste principale. */
export function isUpcomingSession(session: { status: string; date: string }, today: string): boolean {
  return session.status === "planned" || session.date > today;
}

/** Passé : plus récent d’abord. À venir : la plus proche d’abord. */
export function splitCarnet<T extends { date: string; time?: string; status: string }>(sessions: T[], today: string): { past: T[]; upcoming: T[] } {
  const past: T[] = [];
  const upcoming: T[] = [];
  for (const session of sessions) {
    if (isUpcomingSession(session, today)) upcoming.push(session);
    else past.push(session);
  }
  past.sort(compareSessionsNewestFirst);
  upcoming.sort(compareSessionsSoonestFirst);
  return { past, upcoming };
}

function groupByWeek<T extends { date: string; time?: string }>(sorted: T[]): { week: string; sessions: T[] }[] {
  const weeks = new Map<string, T[]>();
  for (const session of sorted) {
    const key = mondayOf(session.date);
    const list = weeks.get(key);
    if (list) list.push(session);
    else weeks.set(key, [session]);
  }
  return [...weeks.entries()].map(([week, items]) => ({ week, sessions: items }));
}

/** Semaine la plus récente d’abord, et dans chaque semaine la séance la plus récente d’abord. */
export function groupSessionsNewestWeekFirst<T extends { date: string; time?: string }>(sessions: T[]): { week: string; sessions: T[] }[] {
  return groupByWeek([...sessions].sort(compareSessionsNewestFirst)).sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0));
}

/** Semaine la plus proche d’abord, et dans chaque semaine la séance la plus proche d’abord. */
export function groupSessionsSoonestWeekFirst<T extends { date: string; time?: string }>(sessions: T[]): { week: string; sessions: T[] }[] {
  return groupByWeek([...sessions].sort(compareSessionsSoonestFirst));
}

export async function textFromLocation(href: string): Promise<{ text: string | null; failed: boolean }> {
  const url = new URL(href, "https://repere.local");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const token = hash.get("historique") ?? url.searchParams.get("historique") ?? hash.get("plan") ?? url.searchParams.get("plan");
  if (!token) return { text: null, failed: false };
  const text = await decodeImportToken(token);
  return { text, failed: text == null };
}

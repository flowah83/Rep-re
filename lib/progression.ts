import { isHardSet } from "./calc";
import { normalizeExerciseKey } from "./exercises";
import type { ExerciseLog, Session, SetLog } from "./types";
import { formatKg, stripAccents } from "./utils";

export type Suggestion = {
  exerciseId: string;
  name: string;
  loadKg: number | null;
  reps: number | null;
  unit: string | null;
  reason: string;
  /** Vrai quand la charge ou les répétitions diffèrent du plan actuel. */
  changesPlan: boolean;
};

/**
 * Double progression, uniquement à partir des séries récentes.
 * On augmente la charge quand toutes les séries de travail ont atteint
 * l’objectif de répétitions sans effort maximal. Sinon on garde la charge,
 * ou on la baisse si les répétitions manquent et que l’effort était maximal
 * (RIR 0 ou RPE ≥ 9,5). Le RPE et le RIR ne servent que lorsqu’ils sont notés.
 */
export function suggestionsForSession(session: Session, history: Session[]): Suggestion[] {
  if (session.cardio) return [];
  return session.exercises
    .map((exercise) => suggestForExercise(exercise, history, session.id))
    .filter((item): item is Suggestion => item != null);
}

export function suggestForExercise(exercise: ExerciseLog, history: Session[], skipSessionId?: string): Suggestion | null {
  const recent = latestPerformance(exercise.name, history, skipSessionId);
  if (!recent) return null;
  if (loggedIsPartial(recent)) return abstain(exercise, "Séance incomplète. Pas de hausse.");
  const working = recent.sets.filter((set) => isHardSet(set) && set.reps != null);
  if (!working.length) return null;

  const step = exercise.stepKg > 0 ? exercise.stepKg : 2.5;
  const loads = working.map((set) => set.loadKg).filter((load): load is number => load != null && Number.isFinite(load));
  const targetReps = exercise.planned.reps != null && exercise.planned.reps > 0 ? exercise.planned.reps : null;
  const histUnit = recent.unit ?? working.find((set) => set.unit)?.unit ?? null;
  const planUnit = exercise.unit ?? null;
  if (histUnit && planUnit && histUnit !== planUnit) return abstain(exercise, "Les unités ne sont pas les mêmes. Pas de hausse.");

  if (!loads.length) {
    const unit = planUnit ?? histUnit;
    if (unit === "corps" || unit === "poids du corps") return bodyweightSuggestion(exercise, working, targetReps);
    return abstain(exercise, "Charge inconnue. Pas de hausse.");
  }

  const load = modeLoad(loads);
  const atLoad = working.filter((set) => set.loadKg != null && Math.abs(set.loadKg - load) < 0.051);
  const scored = atLoad.length ? atLoad : working.filter((set) => set.loadKg != null);
  const minReps = Math.min(...scored.map((set) => set.reps ?? 0));
  const target = targetReps ?? minReps;
  const hit = minReps >= target;
  const effort = effortOf(scored);
  const unit = exercise.unit ?? scored.find((set) => set.unit)?.unit ?? null;
  const notedEffort = scored.length > 0 && scored.every((set) => set.rpe != null || set.rir != null);
  const plannedHard = (exercise.planned.rpe ?? 0) >= 8;
  const block = trainingBlock(exercise, history, skipSessionId);
  const floor = target;
  const ceiling = floor <= 5 ? floor : floor + 2;
  const when = recentDate(exercise.name, history, skipSessionId);

  let nextLoad = load;
  let nextReps = target;
  let reason: string;
  if (block === "stall") {
    nextLoad = deloadLoad(load, step);
    reason = `Deux séances sans l’objectif. Suggestion : ${formatLoad(nextLoad, unit)} × ${target}.`;
  } else if (block === "cadence" && hit && !effort.blocksIncrease && !(plannedHard && !notedEffort)) {
    nextLoad = deloadLoad(load, step);
    reason = `Trois séances réussies. Suggestion : ${formatLoad(nextLoad, unit)} × ${target}.`;
  } else if (hit && minReps < ceiling && !effort.blocksIncrease && !(plannedHard && !notedEffort)) {
    nextReps = minReps + 1;
    reason = `On monte d’abord les répétitions. ${when} : ${minReps} répétitions. Suggestion : ${formatLoad(load, unit)} × ${nextReps}.`;
  } else if (hit && !effort.blocksIncrease && !(plannedHard && !notedEffort)) {
    nextLoad = snap(load + step, step);
    nextReps = floor;
    const shown = formatLoad(nextLoad, unit);
    reason = effort.easy
      ? `Toutes les séries ont été faciles. Suggestion : ${shown} × ${nextReps}.`
      : `La fourchette de répétitions est atteinte. Suggestion : ${shown} × ${nextReps}.`;
  } else if (!hit && effort.grind) {
    nextLoad = snap(Math.max(0, load - step), step);
    if (nextLoad >= load - 0.01) nextLoad = snap(Math.max(0, load - step), step);
    reason = `Répétitions manquées et effort maximal. Suggestion : ${formatLoad(nextLoad, unit)} × ${target}.`;
  } else if (hit && plannedHard && !notedEffort) {
    reason = `Objectif atteint, mais l’effort n’est pas noté. On garde ${formatLoad(load, unit)} × ${target}.`;
  } else if (hit && effort.blocksIncrease) {
    reason = `Répétitions atteintes, mais l’effort était maximal. Gardez ${formatLoad(load, unit)} × ${target}.`;
  } else {
    reason = `La dernière fois, les répétitions n’y étaient pas toutes. Gardez ${formatLoad(load, unit)} et visez ${target}.`;
  }

  return pack(exercise, nextLoad, nextReps, unit, mentionPlan(exercise, unit, reason));
}

export function applySuggestion(session: Session, suggestion: Suggestion): Session {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (exercise.id !== suggestion.exerciseId) return exercise;
      return {
        ...exercise,
        planned: { ...exercise.planned, loadKg: suggestion.loadKg, reps: suggestion.reps },
        sets: exercise.sets.map((set) => (set.done || set.warmup ? set : { ...set, loadKg: suggestion.loadKg })),
      };
    }),
  };
}

export type Adjustment = {
  exerciseId: string;
  name: string;
  fromLoadKg: number | null;
  toLoadKg: number | null;
  fromReps: number | null;
  toReps: number | null;
  unit: string | null;
  reason: string;
  active: boolean;
};

export type ProgressionChoice = "pending" | "kept" | "reverted" | "ignored" | "accepted";
export type ProgressionMode = "applied" | "hold";

export type ProgressionRecord = {
  choice: ProgressionChoice;
  /** `hold` : le plan de Chef sport reste en place. `applied` : les hausses sont déjà écrites. */
  mode?: ProgressionMode;
  items: Adjustment[];
};

const RECOVERY_WORD = /\b(reprise|reprises|deload|leger|legere|legers|legeres|recuperation|reprendre)\b/;

/** Plan de Chef sport à charge écrite, qu’il ne faut pas dépasser tout seul. */
export function keepsCoachPlan(session: Session): boolean {
  if (session.source !== "coach") return false;
  if (!session.exercises.some((exercise) => exercise.planned.loadKg != null)) return false;
  if (session.exercises.some((exercise) => Boolean(exercise.note?.trim()))) return true;
  const text = [session.intention, session.coachNote, session.noteForMe, session.noteForCoach].filter(Boolean).join(" ");
  return RECOVERY_WORD.test(stripAccents(text));
}

/** Suggestions qui changent vraiment le plan, prêtes à être appliquées d’un bloc. */
export function buildAdjustments(session: Session, history: Session[]): Adjustment[] {
  return suggestionsForSession(session, history)
    .filter((item) => item.changesPlan)
    .map((item) => {
      const exercise = session.exercises.find((current) => current.id === item.exerciseId);
      return {
        exerciseId: item.exerciseId,
        name: item.name,
        fromLoadKg: exercise?.planned.loadKg ?? null,
        toLoadKg: item.loadKg,
        fromReps: exercise?.planned.reps ?? null,
        toReps: item.reps,
        unit: item.unit,
        reason: item.reason,
        active: true,
      };
    });
}

export function applyAdjustments(session: Session, items: Adjustment[]): Session {
  return items.filter((item) => item.active).reduce((current, item) => applySuggestion(current, suggestionFrom(item, true)), session);
}

export function revertAdjustment(session: Session, item: Adjustment): Session {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (exercise.id !== item.exerciseId) return exercise;
      return {
        ...exercise,
        planned: { ...exercise.planned, loadKg: item.fromLoadKg, reps: item.fromReps },
        sets: exercise.sets.map((set) => {
          if (set.done || set.warmup) return set;
          if (!sameLoad(set.loadKg, item.toLoadKg)) return set;
          return { ...set, loadKg: item.fromLoadKg };
        }),
      };
    }),
  };
}

export function reapplyAdjustment(session: Session, item: Adjustment): Session {
  return applySuggestion(session, suggestionFrom({ ...item, active: true }, true));
}

/**
 * Au démarrage d’une séance planifiée, les charges ajustées deviennent le plan.
 * Un choix déjà mémorisé n’est pas rejoué.
 */
export function startWithProgression(
  session: Session,
  history: Session[],
  existing: ProgressionRecord | null,
): { session: Session; record: ProgressionRecord | null } {
  if (session.status !== "planned" || existing) return { session, record: existing };
  const items = buildAdjustments(session, history);
  if (!items.length) return { session, record: null };
  if (keepsCoachPlan(session)) {
    const increases = items.filter(isIncrease).map((item) => ({ ...item, active: false }));
    if (!increases.length) return { session, record: null };
    return { session, record: { choice: "pending", mode: "hold", items: increases } };
  }
  return { session: applyAdjustments(session, items), record: { choice: "pending", mode: "applied", items } };
}

function isIncrease(item: Adjustment): boolean {
  if (item.fromLoadKg != null && item.toLoadKg != null) return item.toLoadKg > item.fromLoadKg + 0.01;
  if (item.fromLoadKg == null && item.toLoadKg == null && item.fromReps != null && item.toReps != null) return item.toReps > item.fromReps;
  return false;
}

export function adjustmentSummary(count: number): string {
  if (count === 1) return "1 exercice ajusté";
  return `${count} exercices ajustés`;
}

export function activeAdjustmentCount(record: ProgressionRecord | null): number {
  if (!record || record.choice !== "pending") return 0;
  return record.items.filter((item) => item.active).length;
}

export function formatLoadDelta(deltaKg: number): string | null {
  if (!Number.isFinite(deltaKg) || Math.abs(deltaKg) < 0.01) return null;
  const arrow = deltaKg > 0 ? "↑" : "↓";
  const sign = deltaKg > 0 ? "+" : "−";
  return `${arrow} ${sign}${formatKg(Math.abs(deltaKg))} kg`;
}

export function setDelta(
  item: Adjustment | undefined,
  set: SetLog,
): { place: "load" | "reps"; text: string } | null {
  if (!item?.active || set.warmup) return null;
  const loadText =
    item.fromLoadKg != null && item.toLoadKg != null && sameLoad(set.loadKg, item.toLoadKg)
      ? formatLoadDelta(item.toLoadKg - item.fromLoadKg)
      : null;
  if (loadText) return { place: "load", text: loadText };
  if (item.fromLoadKg == null && item.toLoadKg == null && item.fromReps != null && item.toReps != null && item.fromReps !== item.toReps) {
    const delta = item.toReps - item.fromReps;
    const arrow = delta > 0 ? "↑" : "↓";
    const sign = delta > 0 ? "+" : "−";
    return { place: "reps", text: `${arrow} ${sign}${Math.abs(delta)}` };
  }
  return null;
}

const PROGRESSION_KEY = "repere-progression-batch";

type KeyValueStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function loadProgression(sessionId: string, store: KeyValueStore | null = browserStore()): ProgressionRecord | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PROGRESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = (parsed as Record<string, unknown>)[sessionId];
    if (!isRecord(record)) return null;
    return record;
  } catch {
    return null;
  }
}

export function saveProgression(sessionId: string, record: ProgressionRecord, store: KeyValueStore | null = browserStore()) {
  if (!store) return;
  try {
    const raw = store.getItem(PROGRESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const all = parsed && typeof parsed === "object" ? { ...(parsed as Record<string, unknown>) } : {};
    all[sessionId] = record;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 40))) delete all[key];
    store.setItem(PROGRESSION_KEY, JSON.stringify(all));
  } catch {
    /* stockage privé */
  }
}

function suggestionFrom(item: Adjustment, changesPlan: boolean): Suggestion {
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    loadKg: item.toLoadKg,
    reps: item.toReps,
    unit: item.unit,
    reason: item.reason,
    changesPlan,
  };
}

function sameLoad(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left == null && right == null;
  return Math.abs(left - right) < 0.051;
}

const ASK_KEY = "repere-progression-ask";

/** La question n’est posée que pendant l’ouverture qui vient de démarrer la séance. */
export function markProgressionAsk(sessionId: string) {
  try {
    sessionStorage.setItem(ASK_KEY, sessionId);
  } catch {
    /* stockage privé */
  }
}

export function progressionAskOpen(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(ASK_KEY) === sessionId;
  } catch {
    return false;
  }
}

export function clearProgressionAsk(sessionId: string) {
  try {
    if (sessionStorage.getItem(ASK_KEY) === sessionId) sessionStorage.removeItem(ASK_KEY);
  } catch {
    /* stockage privé */
  }
}

export type StartOffer =
  | { kind: "plain" }
  | { kind: "hold" }
  | { kind: "choice"; upLabel: string; keepLabel: string; summary: string };

/** Un seul choix pour toute la séance, avant que la charge change. */
export function startOffer(session: Session, history: Session[]): StartOffer {
  if (session.status !== "planned") return { kind: "plain" };
  if (keepsCoachPlan(session)) return { kind: "hold" };
  const existing = loadProgression(session.id);
  if (existing && existing.choice !== "pending") return { kind: "plain" };
  const items = buildAdjustments(session, history).filter(proposalMoved);
  if (!items.length) return { kind: "plain" };
  const first = items[0];
  const loadChanged = first.fromLoadKg != null && first.toLoadKg != null && Math.abs(first.toLoadKg - first.fromLoadKg) > 0.01;
  const repsChanged = first.fromReps != null && first.toReps != null && first.fromReps !== first.toReps;
  if (items.length === 1 && repsChanged && !loadChanged) {
    return {
      kind: "choice",
      upLabel: `Commencer à ${first.toReps} répétitions`,
      keepLabel: "Garder le plan",
      summary: `${first.name} peut passer de ${first.fromReps} à ${first.toReps} répétitions, sans changer la charge. ${PROGRAM_SENTENCE}`,
    };
  }
  if (items.length === 1 && first.fromLoadKg != null && first.toLoadKg != null) {
    const lighter = first.toLoadKg + 0.01 < first.fromLoadKg;
    return {
      kind: "choice",
      upLabel: `Commencer à ${formatKg(first.toLoadKg)} kg`,
      keepLabel: `Garder ${formatKg(first.fromLoadKg)} kg`,
      summary: lighter
        ? `${first.name} peut passer de ${formatKg(first.fromLoadKg)} à ${formatKg(first.toLoadKg)} kg, pour alléger. Un seul choix pour toute la séance.`
        : `${first.name} peut passer de ${formatKg(first.fromLoadKg)} à ${formatKg(first.toLoadKg)} kg. Un seul choix pour toute la séance.`,
    };
  }
  const lighter = items.some((item) => item.fromLoadKg != null && item.toLoadKg != null && item.toLoadKg + 0.01 < item.fromLoadKg);
  return {
    kind: "choice",
    upLabel: lighter ? "Commencer avec l’ajustement" : "Commencer avec les hausses",
    keepLabel: "Garder le plan",
    summary: lighter
      ? "Les charges peuvent changer. Un seul choix pour toute la séance."
      : `${items.length} charges peuvent monter. Un seul choix pour toute la séance.`,
  };
}

export type ProgramStep = { loadKg: number | null; reps: number; label: string };

export type ProgramPreview = {
  sentence: string;
  upcoming: ProgramStep[];
};

const PROGRAM_SENTENCE = "Règle de Repère : on monte d’abord les répétitions dans la fourchette, puis la charge. L’allègement après deux échecs ou trois réussites est une proposition, pas une obligation.";
const COACH_SENTENCE = "Le plan de Chef sport reste prioritaire, et cette suite ne le remplace pas.";
const STALL_SENTENCE = "Règle de Repère : deux séances sans l’objectif, une charge plus légère est proposée une fois. Ce n’est pas une obligation.";
const CADENCE_SENTENCE = "Règle de Repère : après trois séances réussies à charge stable, une séance plus légère est proposée. Ce n’est pas une loi.";

/** Suite lisible, sans écrire dans le carnet ni toucher un plan de Chef sport. */
export function programPreview(
  exercise: ExerciseLog,
  history: Session[],
  options: { coachPlan?: boolean; skipSessionId?: string } = {},
): ProgramPreview | null {
  const suggestion = suggestForExercise(exercise, history, options.skipSessionId);
  if (!suggestion) return null;
  const reps = suggestion.reps;
  if (reps == null || reps <= 0) return null;
  const step = exercise.stepKg > 0 ? exercise.stepKg : 2.5;
  const floor = exercise.planned.reps != null && exercise.planned.reps > 0 ? exercise.planned.reps : reps;
  const top = floor <= 5 ? floor : floor + 2;
  const block = trainingBlock(exercise, history, options.skipSessionId);
  const unit = exercise.unit ?? null;
  let load = suggestion?.loadKg ?? exercise.planned.loadKg;
  const upcoming: ProgramStep[] = [programStep(load, reps, unit)];
  if (block && exercise.planned.loadKg != null) {
    const back = exercise.planned.loadKg;
    upcoming.push(programStep(back, reps, unit));
    const third = advanceProgram(back, reps, floor, top, step);
    upcoming.push(programStep(third.loadKg, third.reps, unit));
  } else {
    let cursorReps = reps;
    for (let index = 0; index < 2; index += 1) {
      const next = advanceProgram(load, cursorReps, floor, top, step);
      load = next.loadKg;
      cursorReps = next.reps;
      upcoming.push(programStep(load, cursorReps, unit));
    }
  }
  const sentence = options.coachPlan ? COACH_SENTENCE : block === "stall" ? STALL_SENTENCE : block === "cadence" ? CADENCE_SENTENCE : PROGRAM_SENTENCE;
  return { sentence, upcoming };
}

function proposalMoved(item: Adjustment): boolean {
  if (item.fromLoadKg != null && item.toLoadKg != null && Math.abs(item.toLoadKg - item.fromLoadKg) > 0.01) return true;
  return item.fromReps != null && item.toReps != null && item.fromReps !== item.toReps;
}

function programStep(loadKg: number | null, reps: number, unit: string | null): ProgramStep {
  const label = loadKg == null ? `poids du corps × ${reps}` : `${formatLoad(loadKg, unit)} × ${reps}`;
  return { loadKg, reps, label };
}

function advanceProgram(loadKg: number | null, reps: number, target: number, top: number, step: number): { loadKg: number | null; reps: number } {
  if (loadKg == null) return { loadKg: null, reps: reps + 1 };
  if (reps < top) return { loadKg, reps: reps + 1 };
  return { loadKg: snap(loadKg + step, step), reps: target };
}

export function readProgressionRaw(): string | null {
  try {
    return localStorage.getItem(PROGRESSION_KEY);
  } catch {
    return null;
  }
}

export function writeProgressionRaw(raw: unknown) {
  if (typeof raw !== "string" || !raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(parsed));
  } catch {
    /* stockage privé */
  }
}

export function silenceProgression(record: ProgressionRecord): ProgressionRecord {
  if (record.choice !== "pending") return record;
  return { ...record, choice: record.mode === "hold" ? "ignored" : "kept" };
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is ProgressionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as ProgressionRecord;
  const choice = record.choice;
  const known = choice === "pending" || choice === "kept" || choice === "reverted" || choice === "ignored" || choice === "accepted";
  return known && Array.isArray(record.items);
}

function loggedIsPartial(logged: ExerciseLog): boolean {
  const doneHard = logged.sets.filter(isHardSet).length;
  if (logged.sets.some((set) => set.skipped)) return true;
  if (logged.planned.sets > doneHard) return true;
  return logged.sets.some((set) => !set.warmup && !set.done && !set.skipped);
}

function abstain(exercise: ExerciseLog, reason: string): Suggestion {
  return pack(exercise, exercise.planned.loadKg, exercise.planned.reps, exercise.unit ?? null, reason);
}

function usableHistory(history: Session[]): Session[] {
  return history.filter((session) => session.source !== "demo");
}

function mentionPlan(exercise: ExerciseLog, unit: string | null, reason: string): string {
  if (exercise.planned.loadKg == null) return reason;
  return `${reason} Le plan est à ${formatLoad(exercise.planned.loadKg, exercise.unit ?? unit)}.`;
}

function bodyweightSuggestion(exercise: ExerciseLog, working: SetLog[], targetReps: number | null): Suggestion {
  const minReps = Math.min(...working.map((set) => set.reps ?? 0));
  const target = targetReps ?? minReps;
  const hit = minReps >= target;
  const effort = effortOf(working);
  let reps = target;
  let reason: string;
  if (hit && !effort.blocksIncrease) {
    reps = target + 1;
    reason = `Poids du corps. Suggestion : ${reps} répétitions.`;
  } else if (!hit && effort.grind) {
    reps = Math.max(1, minReps);
    reason = `Effort maximal. Restez à ${reps} répétitions.`;
  } else if (hit) {
    reason = `Poids du corps, effort maximal. Visez ${reps} répétitions.`;
  } else {
    reason = `Poids du corps. Visez ${reps} répétitions.`;
  }
  return pack(exercise, null, reps, exercise.unit ?? null, mentionPlan(exercise, exercise.unit ?? null, reason));
}

function pack(exercise: ExerciseLog, loadKg: number | null, reps: number | null, unit: string | null, reason: string): Suggestion {
  const sameLoad = loadKg == null ? exercise.planned.loadKg == null : exercise.planned.loadKg != null && Math.abs(exercise.planned.loadKg - loadKg) < 0.011;
  const sameReps = exercise.planned.reps === reps;
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    loadKg,
    reps,
    unit,
    reason,
    changesPlan: !sameLoad || !sameReps,
  };
}

const DELOAD_EVERY = 3;

/** Où en est le mouvement : deux échecs, trois réussites stables, ou rien de spécial. */
export function movementCycle(
  exercise: ExerciseLog,
  history: Session[],
  skipSessionId?: string,
): { block: "stall" | "cadence" | null; loadKg: number | null; deloadKg: number | null } {
  const block = trainingBlock(exercise, history, skipSessionId);
  const recent = latestPerformance(exercise.name, history, skipSessionId);
  const working = recent?.sets.filter((set) => isHardSet(set) && set.loadKg != null) ?? [];
  const loads = working.map((set) => set.loadKg).filter((load): load is number => load != null && Number.isFinite(load));
  const loadKg = loads.length ? modeLoad(loads) : (exercise.planned.loadKg ?? null);
  const step = exercise.stepKg > 0 ? exercise.stepKg : 2.5;
  return { block, loadKg, deloadKg: loadKg == null ? null : deloadLoad(loadKg, step) };
}

function trainingBlock(exercise: ExerciseLog, history: Session[], skipSessionId?: string): "stall" | "cadence" | null {
  const recent = recentOutcomes(exercise, history, skipSessionId);
  if (recent.length >= 2 && recent.slice(0, 2).every((item) => !item.hit)) return "stall";
  const step = exercise.stepKg > 0 ? exercise.stepKg : 2.5;
  if (recent.length >= DELOAD_EVERY && recent.slice(0, DELOAD_EVERY).every((item) => item.hit) && steadyBlock(recent.slice(0, DELOAD_EVERY), step)) {
    return "cadence";
  }
  return null;
}

function recentOutcomes(exercise: ExerciseLog, history: Session[], skipSessionId?: string): { loadKg: number | null; hit: boolean }[] {
  const key = normalizeExerciseKey(exercise.name);
  const target = exercise.planned.reps != null && exercise.planned.reps > 0 ? exercise.planned.reps : null;
  return usableHistory(history)
    .filter((session) => session.id !== skipSessionId && !session.cardio && session.status === "done")
    .filter((session) => session.exercises.some((item) => normalizeExerciseKey(item.name) === key && item.sets.some(isHardSet)))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.endedAt ?? "").localeCompare(a.endedAt ?? "");
    })
    .slice(0, DELOAD_EVERY)
    .map((session) => {
      const logged = session.exercises.find((item) => normalizeExerciseKey(item.name) === key && item.sets.some(isHardSet));
      const working = logged?.sets.filter((set) => isHardSet(set) && set.reps != null) ?? [];
      const loads = working.map((set) => set.loadKg).filter((value): value is number => value != null && Number.isFinite(value));
      const loadKg = loads.length ? modeLoad(loads) : null;
      const atLoad = loadKg == null ? working : working.filter((set) => set.loadKg != null && Math.abs(set.loadKg - loadKg) < 0.051);
      const scored = atLoad.length ? atLoad : working;
      const minReps = scored.length ? Math.min(...scored.map((set) => set.reps ?? 0)) : 0;
      const ownTarget = logged?.planned.reps != null && logged.planned.reps > 0 ? logged.planned.reps : null;
      const goal = ownTarget ?? target ?? minReps;
      return { loadKg, hit: minReps >= goal };
    });
}

function steadyBlock(outcomes: { loadKg: number | null }[], step: number): boolean {
  const loads = outcomes.map((item) => item.loadKg);
  if (loads.some((load) => load == null)) return false;
  const newest = loads[0] as number;
  return loads.every((load) => {
    const value = load as number;
    return value <= newest + step * 0.51 && value >= newest - step * 3;
  });
}

function deloadLoad(load: number, step: number): number {
  const bySteps = snap(Math.max(0, load - step * 2), step);
  const byRatio = snap(Math.max(0, load * 0.9), step);
  return Math.min(bySteps, byRatio);
}

function latestPerformance(name: string, history: Session[], skipSessionId?: string): ExerciseLog | null {
  const key = normalizeExerciseKey(name);
  const sessions = usableHistory(history)
    .filter((session) => session.id !== skipSessionId && !session.cardio && session.status === "done")
    .filter((session) => session.exercises.some((exercise) => normalizeExerciseKey(exercise.name) === key && exercise.sets.some(isHardSet)))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.endedAt ?? "").localeCompare(a.endedAt ?? "");
    });
  const session = sessions[0];
  if (!session) return null;
  return session.exercises.find((exercise) => normalizeExerciseKey(exercise.name) === key && exercise.sets.some(isHardSet)) ?? null;
}

function effortOf(sets: SetLog[]): { blocksIncrease: boolean; grind: boolean; easy: boolean } {
  const rirs = sets.map((set) => set.rir).filter((value): value is number => value != null && Number.isFinite(value));
  const rpes = sets.map((set) => set.rpe).filter((value): value is number => value != null && Number.isFinite(value));
  const minRir = rirs.length ? Math.min(...rirs) : null;
  const maxRpe = rpes.length ? Math.max(...rpes) : null;
  const grind = (minRir != null && minRir <= 0) || (maxRpe != null && maxRpe >= 9.5);
  const blocksIncrease = grind || (minRir != null && minRir <= 0) || (maxRpe != null && maxRpe >= 9);
  const easy = sets.length > 0 && sets.every((set) => effortNotedEasy(set));
  return { blocksIncrease, grind, easy };
}

function effortNotedEasy(set: SetLog): boolean {
  if (set.rpe == null && set.rir == null) return false;
  if (set.rir != null && set.rir < 2) return false;
  if (set.rpe != null && set.rpe > 7) return false;
  return true;
}

function recentDate(name: string, history: Session[], skipSessionId?: string): string {
  const key = normalizeExerciseKey(name);
  const session = usableHistory(history)
    .filter((item) => item.id !== skipSessionId && item.status === "done")
    .filter((item) => item.exercises.some((exercise) => normalizeExerciseKey(exercise.name) === key && exercise.sets.some(isHardSet)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!session) return "La dernière séance";
  return `Le ${session.date}`;
}

function modeLoad(loads: number[]): number {
  const counts = new Map<number, number>();
  for (const load of loads) {
    const key = Math.round(load * 100) / 100;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = Math.round(loads[0] * 100) / 100;
  let count = 0;
  for (const [load, n] of counts) {
    if (n > count || (n === count && load > best)) {
      best = load;
      count = n;
    }
  }
  return best;
}

function snap(value: number, step: number): number {
  if (!(step > 0)) return Math.round(value * 100) / 100;
  return Math.round((Math.round(value / step) * step) * 100) / 100;
}

function formatLoad(load: number, unit: string | null): string {
  if (unit === "kg/main") return `${formatKg(load)} kg/main`;
  if (unit === "kg/jambe") return `${formatKg(load)} kg/jambe`;
  return `${formatKg(load)} kg`;
}

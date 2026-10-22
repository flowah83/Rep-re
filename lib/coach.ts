import { bestE1rmLabel, formatPerformedSet } from "./session";
import { exerciseFromPlan } from "./plan";
import type { CustomExercise, ExerciseLog, Session, SetLog } from "./types";
import { finiteOrNull, formatLong, uid } from "./utils";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
  /** Signature renvoyée par Gemini, à recopier au tour suivant. */
  thoughtSignature?: string;
};

export type CoachContext = ReturnType<typeof buildCoachContext>;

const CHEF_MARKS = ["🏋️", "🏃", "🏊"];

export function isChefSportTitle(title: string): boolean {
  const trimmed = title.trim();
  return CHEF_MARKS.some((mark) => trimmed.startsWith(mark));
}

export function appendCoachNotices(summary: string, notices: string[]): string {
  const lines = notices.map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return summary;
  return `${summary}\n\nModifications du calendrier de Chef sport :\n${lines.map((line) => `• ${line}`).join("\n")}`;
}

export function chefSportNotice(name: string, args: Record<string, unknown>, knownTitle = ""): string | null {
  if (name !== "update_event" && name !== "delete_event") return null;
  const previous = text(args.previousTitle, 180) || knownTitle.trim();
  const next = text(args.title, 180);
  if (!isChefSportTitle(previous) && !isChefSportTitle(next)) return null;
  const label = previous || next;
  if (name === "delete_event") return `Le coach a supprimé « ${label} » du calendrier.`;
  const when = localDateTime(args.start);
  return when ? `Le coach a modifié « ${label} » (${when.replace("T", " ")}).` : `Le coach a modifié « ${label} ».`;
}

export const TOOLS = [
  tool("create_session", "Créer une séance prévue dans Repère.", {
    date: { type: "string", description: "Date AAAA-MM-JJ" },
    title: { type: "string" },
    time: { type: "string", description: "Heure HH:MM, facultative" },
    intention: { type: "string" },
    coachNote: { type: "string", description: "Note de Chef sport, s’il y en a une" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sets: { type: "number" },
          reps: { type: "number" },
          loadKg: { type: "number" },
          restSec: { type: "number" },
          rpe: { type: "number" },
        },
        required: ["name"],
      },
    },
  }, ["date", "title"]),
  tool("update_session", "Modifier, déplacer ou renommer une séance existante.", {
    id: { type: "string" },
    date: { type: "string" },
    time: { type: "string" },
    title: { type: "string" },
    intention: { type: "string" },
    coachNote: { type: "string" },
    noteForMe: { type: "string" },
  }, ["id"]),
  tool("delete_session", "Supprimer une séance.", { id: { type: "string" } }, ["id"]),
  tool("add_exercise", "Ajouter un exercice à une séance.", {
    sessionId: { type: "string" },
    name: { type: "string" },
    sets: { type: "number" },
    reps: { type: "number" },
    loadKg: { type: "number" },
    restSec: { type: "number" },
    rpe: { type: "number" },
    unit: { type: "string" },
  }, ["sessionId", "name"]),
  tool("update_exercise", "Modifier les séries, la charge ou les répétitions prévues d’un exercice.", {
    sessionId: { type: "string" },
    exerciseId: { type: "string" },
    name: { type: "string" },
    sets: { type: "number" },
    reps: { type: "number" },
    loadKg: { type: "number" },
    restSec: { type: "number" },
    rpe: { type: "number" },
    note: { type: "string" },
  }, ["sessionId", "exerciseId"]),
  tool("remove_exercise", "Retirer un exercice d’une séance.", {
    sessionId: { type: "string" },
    exerciseId: { type: "string" },
  }, ["sessionId", "exerciseId"]),
  tool("update_set", "Ajouter, modifier ou supprimer une série, y compris une série déjà notée.", {
    sessionId: { type: "string" },
    exerciseId: { type: "string" },
    setId: { type: "string" },
    op: { type: "string", description: "edit, add ou remove" },
    loadKg: { type: "number" },
    reps: { type: "number" },
    rpe: { type: "number" },
    rir: { type: "number" },
    warmup: { type: "boolean" },
    done: { type: "boolean" },
  }, ["sessionId", "exerciseId"]),
  tool("list_events", "Lire le calendrier iCloud Calendrier Flo. Une garde dure 24 h et contient « Garde » dans le titre.", {
    start: { type: "string", description: "AAAA-MM-JJ" },
    end: { type: "string", description: "AAAA-MM-JJ" },
  }, ["start", "end"]),
  tool("create_event", "Créer un événement dans Calendrier Flo, à l’heure de Paris.", {
    title: { type: "string" },
    start: { type: "string", description: "AAAA-MM-JJTHH:MM" },
    end: { type: "string", description: "AAAA-MM-JJTHH:MM" },
    notes: { type: "string" },
  }, ["title", "start", "end"]),
  tool("update_event", "Modifier un événement. Si le titre commence par 🏋️, 🏃 ou 🏊, c’est un événement de Chef sport : recopier l’ancien titre dans previousTitle.", {
    uid: { type: "string" },
    href: { type: "string" },
    etag: { type: "string" },
    previousTitle: { type: "string" },
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    notes: { type: "string" },
  }, ["uid"]),
  tool("delete_event", "Supprimer un événement. Recopier le titre dans previousTitle.", {
    uid: { type: "string" },
    href: { type: "string" },
    etag: { type: "string" },
    previousTitle: { type: "string" },
  }, ["uid"]),
];

const WRITE_TOOLS = new Set([
  "create_session",
  "update_session",
  "delete_session",
  "add_exercise",
  "update_exercise",
  "remove_exercise",
  "update_set",
  "create_event",
  "update_event",
  "delete_event",
]);

const READ_TOOLS = new Set(["list_events"]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function partitionToolCalls(calls: ToolCall[]): { reads: ToolCall[]; writes: ToolCall[]; unknown: ToolCall[] } {
  const reads: ToolCall[] = [];
  const writes: ToolCall[] = [];
  const unknown: ToolCall[] = [];
  for (const call of calls) {
    if (READ_TOOLS.has(call.name)) reads.push(call);
    else if (WRITE_TOOLS.has(call.name)) writes.push(call);
    else unknown.push(call);
  }
  return { reads, writes, unknown };
}

export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function describeAction(call: ToolCall, sessions: Session[]): { summary: string; chefSport: boolean } {
  const args = parseToolArgs(call.arguments);
  const session = findSession(sessions, text(args.sessionId) || text(args.id));
  const exercise = session ? findExercise(session, text(args.exerciseId)) : undefined;
  const chef = chefSportNotice(call.name, args) != null;
  switch (call.name) {
    case "create_session":
      return { summary: `Créer la séance « ${text(args.title, 80) || "Sans titre"} » le ${labelDate(text(args.date))}.`, chefSport: false };
    case "update_session":
      return {
        summary: session
          ? `Modifier « ${session.title} »${text(args.date) ? ` : date ${labelDate(text(args.date))}` : ""}${text(args.title) ? ` : titre « ${text(args.title, 80)} »` : ""}.`
          : "Modifier une séance.",
        chefSport: false,
      };
    case "delete_session":
      return { summary: session ? `Supprimer la séance « ${session.title} » du ${labelDate(session.date)}.` : "Supprimer une séance.", chefSport: false };
    case "add_exercise":
      return {
        summary: `Ajouter ${text(args.name, 80) || "un exercice"}${session ? ` à « ${session.title} »` : ""} : ${planBits(args)}.`,
        chefSport: false,
      };
    case "update_exercise":
      return {
        summary: `Modifier ${exercise?.name ?? "un exercice"}${session ? ` dans « ${session.title} »` : ""} : ${planBits(args)}.`,
        chefSport: false,
      };
    case "remove_exercise":
      return { summary: `Retirer ${exercise?.name ?? "un exercice"}${session ? ` de « ${session.title} »` : ""}.`, chefSport: false };
    case "update_set": {
      const op = text(args.op) || "edit";
      const name = exercise?.name ?? "un exercice";
      if (op === "add") return { summary: `Ajouter une série à ${name}.`, chefSport: false };
      if (op === "remove") return { summary: `Retirer une série de ${name}.`, chefSport: false };
      return { summary: `Modifier une série de ${name}${bitsOfSet(args)}.`, chefSport: false };
    }
    case "create_event":
      return { summary: `Ajouter « ${text(args.title, 80)} » au calendrier, du ${labelWhen(text(args.start))} au ${labelWhen(text(args.end))}.`, chefSport: false };
    case "update_event":
      return {
        summary: `Modifier l’événement « ${text(args.previousTitle, 80) || text(args.title, 80) || "sans titre"} » dans le calendrier.`,
        chefSport: chef,
      };
    case "delete_event":
      return {
        summary: `Supprimer l’événement « ${text(args.previousTitle, 80) || "sans titre"} » du calendrier.`,
        chefSport: chef,
      };
    default:
      return { summary: "Action inconnue.", chefSport: false };
  }
}

export type AppState = { sessions: Session[]; customs: CustomExercise[] };

export function applyAppTool(state: AppState, call: ToolCall): { state: AppState; summary: string; error?: string } {
  if (call.name === "list_events" || call.name === "create_event" || call.name === "update_event" || call.name === "delete_event") {
    return { state, summary: "", error: "Le calendrier se met à jour à part, après confirmation." };
  }
  const args = parseToolArgs(call.arguments);
  try {
    switch (call.name) {
      case "create_session":
        return createSession(state, args);
      case "update_session":
        return updateSession(state, args);
      case "delete_session":
        return deleteSessionTool(state, args);
      case "add_exercise":
        return addExercise(state, args);
      case "update_exercise":
        return updateExercise(state, args);
      case "remove_exercise":
        return removeExercise(state, args);
      case "update_set":
        return updateSet(state, args);
      default:
        return { state, summary: "", error: "Action inconnue." };
    }
  } catch {
    return { state, summary: "", error: "Cette modification n’a pas pu être préparée." };
  }
}

export function calendarBodyForTool(call: ToolCall): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const args = parseToolArgs(call.arguments);
  if (call.name === "list_events") {
    const start = isoDate(args.start);
    const end = isoDate(args.end);
    if (!start || !end) return { ok: false, error: "Il manque les dates du calendrier." };
    return { ok: true, body: { action: "list", start, end } };
  }
  if (call.name === "create_event" || call.name === "update_event") {
    const title = text(args.title, 180);
    const start = localDateTime(args.start);
    const end = localDateTime(args.end);
    if (!title || !start || !end) return { ok: false, error: "Le titre et les horaires de l’événement sont incomplets." };
    const body: Record<string, unknown> = {
      action: call.name === "create_event" ? "create" : "update",
      title,
      start,
      end,
      notes: text(args.notes, 500),
    };
    if (call.name === "update_event") {
      const uidValue = text(args.uid, 200);
      if (!uidValue) return { ok: false, error: "Il manque l’identifiant de l’événement." };
      body.uid = uidValue;
      body.href = text(args.href, 400);
      body.etag = text(args.etag, 200);
    }
    return { ok: true, body };
  }
  if (call.name === "delete_event") {
    const uidValue = text(args.uid, 200);
    if (!uidValue) return { ok: false, error: "Il manque l’identifiant de l’événement." };
    return { ok: true, body: { action: "delete", uid: uidValue, href: text(args.href, 400), etag: text(args.etag, 200) } };
  }
  return { ok: false, error: "Ce n’est pas une action de calendrier." };
}

export function buildCoachContext(sessions: Session[], today: string) {
  const done = sessions
    .filter((session) => session.status !== "planned" && !session.cardio)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const planned = sessions
    .filter((session) => session.status === "planned" || session.status === "active")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time ?? "").localeCompare(b.time ?? "")));
  const names = [...new Set(done.flatMap((session) => session.exercises.map((exercise) => exercise.name)))];
  const records = names
    .map((name) => {
      const best = bestE1rmLabel(sessions, name);
      return best ? { exercice: name, max_estime_kg: best.kg, detail: best.detail } : null;
    })
    .filter((item): item is { exercice: string; max_estime_kg: number; detail: string } => item != null)
    .sort((a, b) => b.max_estime_kg - a.max_estime_kg)
    .slice(0, 15);
  return {
    aujourd_hui: today,
    fuseau: "Europe/Paris",
    records,
    plan: planned.slice(0, 16).map(compactPlan),
    seances_recentes: done.slice(0, 8).map(compactDone),
    cardio_recent: sessions
      .filter((session) => session.cardio && session.status !== "planned")
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6)
      .map((session) => ({
        id: session.id,
        date: session.date,
        titre: session.title,
        sport: session.cardio?.sport ?? "",
        minutes: session.cardio?.durationMin ?? null,
        km: session.cardio?.distanceKm ?? null,
      })),
  };
}

export function buildSystemPrompt(context: unknown): string {
  const json = JSON.stringify(context ?? {}).slice(0, 12000);
  return [
    "Tu es le coach dans l’application Repère, pour Florian. Tu le vouvoies, en français, avec des phrases courtes.",
    "Chef sport reste l’entraîneur principal. Tu l’aides, tu ne le remplaces pas.",
    "Tu réponds seulement avec les données du contexte et du calendrier. Tu n’inventes ni charge, ni répétition, ni séance.",
    "Une valeur null est inconnue, ce n’est pas zéro. kg/main est le poids d’une seule main.",
    "Le fuseau est Europe/Paris, les heures sont sur 24 h.",
    "Une garde est un service de 24 h : le titre contient « Garde ». Tu en tiens compte avant de proposer une séance, et tu évites une grosse séance ce jour-là.",
    "Les événements dont le titre commence par 🏋️, 🏃 ou 🏊 appartiennent à Chef sport. Si tu en modifies un, recopie l’ancien titre dans previousTitle.",
    "Pour changer l’application ou le calendrier, tu utilises un outil. Rien n’est appliqué tant que Florian n’a pas confirmé. Tu peux lire le calendrier sans confirmation.",
    "Avant de créer ou déplacer une séance, liste le calendrier de la période.",
    "Contexte :",
    json,
  ].join("\n");
}

export function openAiPayload(model: string, context: unknown, messages: unknown): Record<string, unknown> {
  return {
    model: model || "gpt-4o-mini",
    temperature: 0.3,
    messages: [{ role: "system", content: buildSystemPrompt(context) }, ...sanitizeMessages(messages)],
    tools: TOOLS,
    tool_choice: "auto",
  };
}

export function sanitizeMessages(messages: unknown): Record<string, unknown>[] {
  if (!Array.isArray(messages)) return [];
  const kept: Record<string, unknown>[] = [];
  for (const item of messages.slice(-30)) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    const role = message.role;
    if (role !== "user" && role !== "assistant" && role !== "tool") continue;
    const content = typeof message.content === "string" ? message.content.slice(0, 8000) : "";
    const next: Record<string, unknown> = { role, content };
    if (role === "assistant" && Array.isArray(message.tool_calls)) next.tool_calls = message.tool_calls.slice(0, 8);
    if (role === "tool" && typeof message.tool_call_id === "string") next.tool_call_id = message.tool_call_id.slice(0, 80);
    kept.push(next);
  }
  return kept;
}

function createSession(state: AppState, args: Record<string, unknown>) {
  const date = isoDate(args.date);
  const title = text(args.title, 80);
  if (!date || !title) return { state, summary: "", error: "La date ou le titre de la séance manque." };
  const customs = [...state.customs];
  const created: CustomExercise[] = [];
  const exercises = Array.isArray(args.exercises) ? args.exercises.slice(0, 12).map((item) => exerciseFromArgs(item, customs, created)) : [];
  const session: Session = {
    id: uid(),
    date,
    time: clock(args.time) ?? undefined,
    title,
    intention: text(args.intention, 80) || undefined,
    coachNote: text(args.coachNote, 400) || undefined,
    noteForMe: "Ajoutée avec le coach.",
    status: "planned",
    source: "manual",
    exercises,
  };
  return {
    state: { sessions: [...state.sessions, session], customs: [...customs, ...created.filter((item) => !customs.some((known) => known.id === item.id))] },
    summary: `Séance « ${title} » créée le ${labelDate(date)}.`,
  };
}

function updateSession(state: AppState, args: Record<string, unknown>) {
  const id = text(args.id, 80);
  const current = state.sessions.find((session) => session.id === id);
  if (!current) return { state, summary: "", error: "Séance introuvable." };
  const date = has(args, "date") ? isoDate(args.date) : current.date;
  if (!date) return { state, summary: "", error: "La date n’est pas valide." };
  const title = has(args, "title") ? text(args.title, 80) : current.title;
  if (!title) return { state, summary: "", error: "Le titre est vide." };
  const next: Session = {
    ...current,
    date,
    title,
    time: has(args, "time") ? clock(args.time) ?? undefined : current.time,
    intention: has(args, "intention") ? text(args.intention, 80) || undefined : current.intention,
    coachNote: has(args, "coachNote") ? text(args.coachNote, 400) || undefined : current.coachNote,
    noteForMe: has(args, "noteForMe") ? text(args.noteForMe, 400) || undefined : current.noteForMe,
  };
  return { state: replaceSession(state, next), summary: `Séance « ${next.title} » mise à jour.` };
}

function deleteSessionTool(state: AppState, args: Record<string, unknown>) {
  const id = text(args.id, 80);
  const current = state.sessions.find((session) => session.id === id);
  if (!current) return { state, summary: "", error: "Séance introuvable." };
  return {
    state: { ...state, sessions: state.sessions.filter((session) => session.id !== id) },
    summary: `Séance « ${current.title} » supprimée.`,
  };
}

function addExercise(state: AppState, args: Record<string, unknown>) {
  const current = state.sessions.find((session) => session.id === text(args.sessionId, 80));
  if (!current) return { state, summary: "", error: "Séance introuvable." };
  const name = text(args.name, 80);
  if (!name) return { state, summary: "", error: "Le nom de l’exercice manque." };
  const customs = [...state.customs];
  const created: CustomExercise[] = [];
  const exercise = exerciseFromArgs(args, customs, created);
  const next = { ...current, exercises: [...current.exercises, exercise] };
  return {
    state: { sessions: replaceSession(state, next).sessions, customs: mergeCustoms(customs, created) },
    summary: `${exercise.name} ajouté à « ${current.title} ».`,
  };
}

function updateExercise(state: AppState, args: Record<string, unknown>) {
  const current = state.sessions.find((session) => session.id === text(args.sessionId, 80));
  const exercise = current ? findExercise(current, text(args.exerciseId, 80)) : undefined;
  if (!current || !exercise) return { state, summary: "", error: "Exercice introuvable." };
  const load = optionalNumber(args, "loadKg");
  const reps = optionalNumber(args, "reps");
  const rest = optionalNumber(args, "restSec");
  const rpe = optionalNumber(args, "rpe");
  const setsN = optionalNumber(args, "sets");
  let sets = exercise.sets;
  if (setsN.present && setsN.value != null) {
    const target = Math.max(1, Math.min(20, Math.round(setsN.value)));
    const warm = sets.filter((set) => set.warmup);
    let work = sets.filter((set) => !set.warmup);
    if (target > work.length) {
      const loadKg = load.present ? load.value : exercise.planned.loadKg;
      work = work.concat(Array.from({ length: target - work.length }, () => blankSet(loadKg)));
    } else if (target < work.length) {
      const doneCount = work.filter((set) => set.done).length;
      work = work.slice(0, Math.max(target, doneCount));
    }
    sets = [...warm, ...work];
  }
  const plannedLoad = load.present ? load.value : exercise.planned.loadKg;
  const nextExercise: ExerciseLog = {
    ...exercise,
    name: has(args, "name") && text(args.name, 80) ? text(args.name, 80) : exercise.name,
    note: has(args, "note") ? text(args.note, 200) || undefined : exercise.note,
    planned: {
      ...exercise.planned,
      sets: sets.filter((set) => !set.warmup).length,
      reps: reps.present ? reps.value : exercise.planned.reps,
      loadKg: plannedLoad,
      restSec: rest.present && rest.value != null ? rest.value : exercise.planned.restSec,
      rpe: rpe.present ? rpe.value : exercise.planned.rpe,
    },
    sets: sets.map((set) => (set.done || set.warmup || !load.present ? set : { ...set, loadKg: plannedLoad })),
  };
  const next = { ...current, exercises: current.exercises.map((item) => (item.id === exercise.id ? nextExercise : item)) };
  return { state: replaceSession(state, next), summary: `${nextExercise.name} mis à jour.` };
}

function removeExercise(state: AppState, args: Record<string, unknown>) {
  const current = state.sessions.find((session) => session.id === text(args.sessionId, 80));
  const exercise = current ? findExercise(current, text(args.exerciseId, 80)) : undefined;
  if (!current || !exercise) return { state, summary: "", error: "Exercice introuvable." };
  const next = { ...current, exercises: current.exercises.filter((item) => item.id !== exercise.id) };
  return { state: replaceSession(state, next), summary: `${exercise.name} retiré de « ${current.title} ».` };
}

function updateSet(state: AppState, args: Record<string, unknown>) {
  const current = state.sessions.find((session) => session.id === text(args.sessionId, 80));
  const exercise = current ? findExercise(current, text(args.exerciseId, 80)) : undefined;
  if (!current || !exercise) return { state, summary: "", error: "Exercice introuvable." };
  const op = text(args.op) || "edit";
  let sets = exercise.sets;
  if (op === "add") {
    const load = optionalNumber(args, "loadKg");
    sets = [...sets, { ...blankSet(load.present ? load.value : exercise.planned.loadKg), reps: optionalNumber(args, "reps").value, done: args.done === true }];
  } else if (op === "remove") {
    const target = locateSet(sets, args);
    if (!target) return { state, summary: "", error: "Série introuvable." };
    sets = sets.filter((set) => set.id !== target.id);
  } else {
    const target = locateSet(sets, args);
    if (!target) return { state, summary: "", error: "Série introuvable." };
    sets = sets.map((set) => (set.id === target.id ? patchLoggedSet(set, args) : set));
  }
  const nextExercise = { ...exercise, sets, planned: { ...exercise.planned, sets: sets.filter((set) => !set.warmup).length } };
  const next = { ...current, exercises: current.exercises.map((item) => (item.id === exercise.id ? nextExercise : item)) };
  return { state: replaceSession(state, next), summary: `Série de ${exercise.name} mise à jour.` };
}

function patchLoggedSet(set: SetLog, args: Record<string, unknown>): SetLog {
  const next = { ...set };
  for (const key of ["loadKg", "reps", "rpe", "rir"] as const) {
    if (!has(args, key)) continue;
    next[key] = finiteOrNull(args[key]);
  }
  if (has(args, "warmup")) next.warmup = args.warmup === true;
  if (has(args, "done")) next.done = args.done === true;
  return next;
}

function locateSet(sets: SetLog[], args: Record<string, unknown>): SetLog | undefined {
  const id = text(args.setId, 80);
  if (id) return sets.find((set) => set.id === id);
  return undefined;
}

function exerciseFromArgs(item: unknown, customs: CustomExercise[], created: CustomExercise[]): ExerciseLog {
  const args = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const exercise = exerciseFromPlan(
    {
      nom: text(args.name, 80) || "Exercice",
      series: finiteOrNull(args.sets) ?? 3,
      repetitions: finiteOrNull(args.reps),
      charge_kg: finiteOrNull(args.loadKg),
      repos_secondes: finiteOrNull(args.restSec) ?? undefined,
      rpe_vise: finiteOrNull(args.rpe),
    },
    customs,
    created,
  );
  const unit = text(args.unit, 40);
  return unit ? { ...exercise, unit } : exercise;
}

function blankSet(loadKg: number | null): SetLog {
  return { id: uid(), loadKg, reps: null, rpe: null, warmup: false, done: false };
}

function compactPlan(session: Session) {
  return {
    id: session.id,
    date: session.date,
    heure: session.time ?? null,
    titre: session.title,
    intention: session.intention ?? null,
    note_chef_sport: session.coachNote ?? null,
    statut: session.status,
    exercices: session.exercises.slice(0, 12).map((exercise) => ({
      id: exercise.id,
      nom: exercise.name,
      series: exercise.planned.sets,
      repetitions: exercise.planned.reps,
      charge_kg: exercise.planned.loadKg,
      repos_s: exercise.planned.restSec,
      rpe: exercise.planned.rpe,
      unite: exercise.unit ?? null,
    })),
  };
}

function compactDone(session: Session) {
  return {
    id: session.id,
    date: session.date,
    titre: session.title,
    note: session.noteForCoach ?? session.noteForMe ?? null,
    exercices: session.exercises.slice(0, 8).map((exercise) => ({
      nom: exercise.name,
      fait: exercise.detailUnknown
        ? "détail inconnu"
        : exercise.sets
            .filter((set) => set.done)
            .slice(0, 8)
            .map((set) => formatPerformedSet(set, exercise.unit))
            .join(", "),
    })),
  };
}

function replaceSession(state: AppState, session: Session): AppState {
  return { ...state, sessions: state.sessions.map((item) => (item.id === session.id ? session : item)) };
}

function mergeCustoms(current: CustomExercise[], created: CustomExercise[]): CustomExercise[] {
  const next = [...current];
  for (const item of created) {
    if (!next.some((known) => known.id === item.id)) next.push(item);
  }
  return next;
}

function findSession(sessions: Session[], id: string): Session | undefined {
  return id ? sessions.find((session) => session.id === id) : undefined;
}

function findExercise(session: Session, id: string): ExerciseLog | undefined {
  return id ? session.exercises.find((exercise) => exercise.id === id) : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): { present: boolean; value: number | null } {
  if (!has(args, key)) return { present: false, value: null };
  return { present: true, value: finiteOrNull(args[key]) };
}

function has(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function clock(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return value;
}

export function localDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
  if (!match || !isoDate(match[1]) || !clock(match[2])) return null;
  return `${match[1]}T${match[2]}`;
}

function labelDate(value: string): string {
  if (!isoDate(value)) return value || "date inconnue";
  return formatLong(value);
}

function labelWhen(value: string): string {
  const parsed = localDateTime(value);
  if (!parsed) return "horaire incomplet";
  return parsed.replace("T", " ");
}

function planBits(args: Record<string, unknown>): string {
  const sets = finiteOrNull(args.sets);
  const reps = finiteOrNull(args.reps);
  const load = finiteOrNull(args.loadKg);
  const bits = [
    sets != null && reps != null ? `${sets} × ${reps}` : sets != null ? `${sets} séries` : "",
    load != null ? `${load} kg` : "",
  ].filter(Boolean);
  return bits.join(" · ") || "détail à préciser";
}

function bitsOfSet(args: Record<string, unknown>): string {
  const load = has(args, "loadKg") ? finiteOrNull(args.loadKg) : undefined;
  const reps = has(args, "reps") ? finiteOrNull(args.reps) : undefined;
  if (load === undefined && reps === undefined) return "";
  const loadText = load == null ? "charge inchangée" : `${load} kg`;
  const repsText = reps == null ? "répétitions inchangées" : `${reps} répétitions`;
  return ` (${loadText}, ${repsText})`;
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false },
    },
  };
}

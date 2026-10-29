import {
  buildAiCall,
  coachFailure,
  foldGeminiChunk,
  messageFromGeminiBody,
  modelChain,
  takeJsonValues,
  modelName,
  providerName,
  readAiMessage,
  retryableStreamStatus,
  shouldTryNextModel,
  streamUrl,
  type AiCall,
  type AiEnv,
  type StreamFold,
} from "./ai";
import { calendarObjectName } from "../../lib/calendar-apply";
import { isChefSportTitle, peelContextEcho, visibleCoachText } from "../../lib/coach";
import {
  basicHeader,
  buildIcs,
  deleteCall,
  extractHref,
  listRecurrenceIncomplete,
  parisDayToUtc,
  parseCalendarList,
  parseEvents,
  patchIcs,
  propfindCall,
  putCall,
  reportCall,
  resolveHref,
  scheduleIssue,
  masterEvent,
  summaryOf,
  type HttpCall,
} from "./caldav";

export type Env = AiEnv & {
  ICLOUD_APP_PASSWORD?: string;
  APP_TOKEN?: string;
  CALDAV_HOST?: string;
  CALDAV_USER?: string;
  CALENDAR_NAME?: string;
  ALLOWED_ORIGIN?: string;
  /** Délai d’un essai, en millisecondes. 45 secondes si absent. */
  STREAM_DEADLINE_MS?: string;
};

const cache = { calendarUrl: "" };

export function resetCalendarCache() {
  cache.calendarUrl = "";
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function handleRequest(request: Request, env: Env, fetchImpl: FetchLike = fetch): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGIN || "https://flowah83.github.io";
  if (origin && origin !== allowed) return json({ error: "Origine refusée." }, 403);
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin, allowed);
  if (request.method !== "POST") return cors(json({ error: "Méthode refusée." }, 405), origin, allowed);
  const denied = await authorize(request, env);
  if (denied) return cors(denied, origin, allowed);
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return cors(json({ error: "La requête est trop longue." }, 413), origin, allowed);
  const limited = noteCoachUsage(request);
  if (limited) return cors(limited, origin, allowed);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (path.endsWith("/health")) return cors(json({ ok: true }, 200), origin, allowed);
    if (path.endsWith("/coach/stream")) return cors(await coachStream(request, env, fetchImpl), origin, allowed);
    if (path.endsWith("/coach")) return cors(await coach(request, env, fetchImpl), origin, allowed);
    if (path.endsWith("/calendar")) return cors(await calendar(request, env, fetchImpl), origin, allowed);
    return cors(json({ error: "Adresse inconnue." }, 404), origin, allowed);
  } catch {
    return cors(json({ error: "Le service n’a pas pu répondre." }, 500), origin, allowed);
  }
}

const MODEL_ATTEMPT_MS = 15_000;
const COACH_BUDGET_MS = 40_000;

/** Délai d’un essai. Court dans les tests, 15 s sinon, pour laisser la place au modèle suivant. */
function attemptLimit(env: Env): number {
  const value = Number(env.STREAM_DEADLINE_MS);
  if (Number.isFinite(value) && value >= 20 && value < 1_000) return value;
  return MODEL_ATTEMPT_MS;
}

/** Sous le délai du téléphone (45 s). Les essais courts des tests gardent toute la chaîne. */
function coachBudget(env: Env): number {
  const attempt = attemptLimit(env);
  if (attempt < 1_000) return attempt * 6;
  return COACH_BUDGET_MS;
}

async function coachStream(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  const body = await readJson(request);
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  const clock = { started: Date.now(), budget: coachBudget(env), attempt: attemptLimit(env) };
  const stream = new ReadableStream({
    async start(controller) {
      const push = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(payload)));
        } catch {
          /* le client est déjà parti */
        }
      };
      push({ ready: true });
      const beat = setInterval(() => push({ ready: true }), 5000);
      try {
        const message = await answerForStream(env, body, fetchImpl, push, upstream.signal, clock);
        if (upstream.signal.aborted) return;
        push({ message });
        controller.close();
      } catch (caught) {
        if (upstream.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "Le coach n’a pas pu répondre.";
        push({ error: message });
        try {
          controller.close();
        } catch {
          /* déjà clos */
        }
      } finally {
        clearInterval(beat);
      }
    },
    cancel() {
      upstream.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

type AttemptClock = { started: number; budget: number; attempt: number };

function timeLeft(clock: AttemptClock): number {
  return clock.budget - (Date.now() - clock.started);
}

async function answerForStream(
  env: Env,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
  push: (payload: unknown) => void,
  parent: AbortSignal,
  clock: AttemptClock,
) {
  const provider = providerName(env.AI_PROVIDER);
  if (provider !== "gemini") return plainMessage(env, body, fetchImpl, push, parent, timeLeft(clock));
  const models = modelChain(env);
  let lastStatus = 504;
  for (const model of models) {
    if (parent.aborted) throw new Error("annulé");
    const ms = Math.min(clock.attempt, timeLeft(clock));
    if (ms < 20) break;
    const call = buildAiCall({ ...env, AI_MODEL: model }, body.context ?? {}, body.messages);
    if ("error" in call) throw new Error(call.error);
    const streamed = await tryGeminiStream(call, fetchImpl, push, parent, ms);
    if (streamed.ok) return streamed.message;
    lastStatus = streamed.status;
    if (!retryableStreamStatus(lastStatus)) break;
  }
  const left = timeLeft(clock);
  if (left < 20) throw new Error("Le coach n’a pas pu répondre. Réessayez dans un moment.");
  return plainMessage(env, body, fetchImpl, push, parent, Math.min(clock.attempt, left), lastStatus);
}

async function tryGeminiStream(
  call: AiCall,
  fetchImpl: FetchLike,
  push: (payload: unknown) => void,
  parent: AbortSignal,
  deadline: number,
): Promise<{ ok: true; message: { role: "assistant"; content: string; tool_calls: StreamFold["calls"] } } | { ok: false; status: number }> {
  const attempt = new AbortController();
  const onParent = () => attempt.abort();
  if (parent.aborted) attempt.abort();
  else parent.addEventListener("abort", onParent);
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => attempt.abort(), deadline);
  try {
    const response = await fetchImpl(streamUrl(call), { method: "POST", headers: call.headers, body: call.body, signal: attempt.signal });
    clearTimeout(timer);
    timer = undefined;
    if (!response.ok || !response.body) return { ok: false, status: response.status || 502 };
    const type = response.headers.get("content-type") ?? "";
    let sent = false;
    const relay = (payload: unknown) => {
      if (payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string" && (payload as { text: string }).text) {
        sent = true;
      }
      push(payload);
    };
    const folded = await readModelBody(response.body, type, relay, () => (sent ? quietAfterText(deadline) : deadline));
    const visible = visibleCoachText(folded.state.text);
    if ((folded.timedOut || folded.failed) && !visible && folded.state.calls.length === 0) {
      attempt.abort();
      return { ok: false, status: folded.timedOut ? 504 : 502 };
    }
    return { ok: true, message: { role: "assistant", content: visible, tool_calls: folded.state.calls } };
  } catch (caught) {
    if (parent.aborted) throw caught;
    return { ok: false, status: 504 };
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onParent);
  }
}

/** Après le premier texte visible, on ne change plus de modèle : on laisse le flux finir. */
function quietAfterText(attempt: number): number {
  if (attempt < 1_000) return attempt * 8;
  return 25_000;
}

/**
 * Relaye chaque morceau dès qu’il est lisible.
 * Le SSE Gemini et le tableau JSON (streamGenerateContent) partent au fil de l’eau,
 * sans attendre la fin de la réponse.
 */
async function readModelBody(
  body: ReadableStream<Uint8Array>,
  contentType: string,
  push: (payload: unknown) => void,
  quietMs: () => number,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let mode: "sse" | "json" = contentType.includes("text/event-stream") ? "sse" : "json";
  let state: StreamFold = { text: "", calls: [] };
  let failed = false;
  while (true) {
    const reading = reader.read();
    const step = await raceRead(reading, quietMs());
    if (step === "timeout") {
      reading.catch(() => undefined);
      await reader.cancel().catch(() => undefined);
      return { timedOut: true, state, failed };
    }
    if (step.done) break;
    if (step.value) pending += decoder.decode(step.value, { stream: true });
    if (!contentType.includes("text/event-stream") && mode === "json" && pending.trimStart().startsWith("data:")) mode = "sse";
    if (mode === "sse") {
      let cut = pending.indexOf("\n");
      while (cut >= 0) {
        const line = pending.slice(0, cut).trim();
        pending = pending.slice(cut + 1);
        state = consumeGeminiLine(state, line, push);
        cut = pending.indexOf("\n");
      }
    } else {
      const taken = takeJsonValues(pending);
      pending = taken.rest;
      for (const value of taken.values) {
        if (isGeminiError(value)) failed = true;
        state = publishChunk(state, value, push);
      }
    }
  }
  pending += decoder.decode();
  if (mode === "sse") {
    if (pending.trim()) state = consumeGeminiLine(state, pending.trim(), push);
  } else if (pending.trim()) {
    const taken = takeJsonValues(pending);
    for (const value of taken.values) state = publishChunk(state, value, push);
    if (!taken.values.length) {
      const whole = messageFromGeminiBody(pending);
      if (whole?.content) push({ text: whole.content });
      if (whole) state = { text: whole.content, calls: whole.tool_calls };
    }
  }
  return { timedOut: false, state, failed };
}

function publishChunk(state: StreamFold, value: unknown, push: (payload: unknown) => void): StreamFold {
  const next = foldGeminiChunk(state, value);
  const shown = peelContextEcho(next.text, false);
  const previous = peelContextEcho(state.text, false);
  if (shown.visible && shown.visible !== previous.visible) push({ text: shown.visible });
  return next;
}

function isGeminiError(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "error" in value && !("candidates" in value));
}

async function raceRead(reading: Promise<ReadableStreamReadResult<Uint8Array>>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    return await Promise.race([reading, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function plainMessage(
  env: Env,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
  push: (payload: unknown) => void,
  parent: AbortSignal,
  deadline: number,
  lastStatus = 502,
) {
  let once: Response;
  try {
    once = await withDeadline(deadline, parent, (signal) =>
      coach(
        new Request("https://coach.local/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        env,
        (url, init) => fetchImpl(url, { ...init, signal }),
      ),
    );
  } catch (caught) {
    if (parent.aborted) throw caught;
    throw new Error("Le coach n’a pas pu répondre. Réessayez dans un moment.");
  }
  const data = (await once.json().catch(() => ({}))) as { message?: { role?: string; content?: string; tool_calls?: StreamFold["calls"] }; error?: string };
  if (!once.ok) throw new Error(data.error || coachFailure(once.status || lastStatus, once.status === 429 || lastStatus === 429).error);
  if (data.message?.content) push({ text: data.message.content });
  return data.message ?? { role: "assistant", content: "" };
}

async function withDeadline<T>(ms: number, parent: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const attempt = new AbortController();
  const onParent = () => attempt.abort();
  if (parent.aborted) attempt.abort();
  else parent.addEventListener("abort", onParent);
  const timer = setTimeout(() => attempt.abort(), ms);
  try {
    return await run(attempt.signal);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onParent);
  }
}

function consumeGeminiLine(state: StreamFold, line: string, push: (payload: unknown) => void): StreamFold {
  if (!line.startsWith("data:")) return state;
  const raw = line.slice(5).trim();
  if (!raw || raw === "[DONE]") return state;
  try {
    return publishChunk(state, JSON.parse(raw) as unknown, push);
  } catch {
    return state;
  }
}

/** Un commentaire large force Safari iOS à rendre le flux, au lieu d’attendre la fin. */
function encodeSse(payload: unknown): string {
  return `:${" ".repeat(2048)}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function coach(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  const body = await readJson(request);
  const provider = providerName(env.AI_PROVIDER);
  const models = provider === "gemini" ? modelChain(env) : [modelName(env)];
  const clock = { started: Date.now(), budget: coachBudget(env), attempt: attemptLimit(env) };
  let lastStatus = 502;
  for (let index = 0; index < models.length; index++) {
    const ms = Math.min(clock.attempt, timeLeft(clock));
    if (ms < 20) break;
    const call = buildAiCall({ ...env, AI_MODEL: models[index] }, body.context ?? {}, body.messages);
    if ("error" in call) return json({ error: call.error }, call.status);
    let response: Response;
    const attempt = new AbortController();
    const timer = setTimeout(() => attempt.abort(), ms);
    try {
      response = await fetchImpl(call.url, { method: "POST", headers: call.headers, body: call.body, signal: attempt.signal });
    } catch {
      lastStatus = 504;
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) {
      const data = (await response.json()) as unknown;
      return json({ message: readAiMessage(provider, data) }, 200);
    }
    lastStatus = response.status;
    if (!shouldTryNextModel(lastStatus) && lastStatus < 500) break;
  }
  if (lastStatus === 504) return json({ error: "Le coach n’a pas pu répondre. Réessayez dans un moment." }, 502);
  const failure = coachFailure(lastStatus, provider === "gemini" && shouldTryNextModel(lastStatus));
  return json({ error: failure.error }, failure.status);
}

async function calendar(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  if (!env.ICLOUD_APP_PASSWORD || !env.CALDAV_USER || !env.CALENDAR_NAME) {
    return json({ error: "Le calendrier n’est pas encore activé." }, 503);
  }
  const body = await readJson(request);
  const action = typeof body.action === "string" ? body.action : "";
  const givenHref = text(body.href);
  if (givenHref && /^https?:\/\//i.test(givenHref) && !isIcloudHost(givenHref)) {
    return json({ error: "Adresse de calendrier refusée." }, 400);
  }
  const auth = basicHeader(env.CALDAV_USER, env.ICLOUD_APP_PASSWORD);
  if (action === "create" || action === "update") {
    const start = text(body.start);
    const end = text(body.end);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end)) {
      const timing = scheduleIssue(start, end);
      if (timing) return json({ error: timing }, 400);
    }
  }
  const calendarUrl = await findCalendar(env, auth, fetchImpl);
  if (action === "list") {
    const start = typeof body.start === "string" ? body.start : "";
    const end = typeof body.end === "string" ? body.end : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return json({ error: "Il manque les dates." }, 400);
    }
    const report = reportCall(calendarUrl, parisDayToUtc(start), parisDayToUtc(end, true), auth);
    const xml = await send(report, fetchImpl);
    return json({ events: parseEvents(xml), recurrenceIncomplete: listRecurrenceIncomplete(xml), calendar: (env.CALENDAR_NAME || "").trim() }, 200);
  }
  if (action === "create" || action === "update") {
    const title = text(body.title);
    const start = text(body.start);
    const end = text(body.end);
    if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end)) {
      return json({ error: "L’événement est incomplet." }, 400);
    }
    const timing = scheduleIssue(start, end);
    if (timing) return json({ error: timing }, 400);
    const uid = action === "update" && text(body.uid) ? text(body.uid) : calendarObjectName(text(body.idempotencyKey) || crypto.randomUUID());
    const href = action === "create" ? `${calendarUrl}${uid}.ics` : text(body.href) || `${calendarUrl}${uid}.ics`;
    const target = guardedHref(calendarUrl, href);
    if (!target) return json({ error: "Adresse de calendrier refusée." }, 400);
    if (action === "update") {
      const current = await readEvent(target, auth, fetchImpl);
      if (!current.ok) return current.response;
      const blocked = chefBlocked(text(body.title), text(body.previousTitle), current.summary);
      if (blocked) return blocked;
      const clientEtag = normalizeEtag(text(body.etag));
      const remoteEtag = normalizeEtag(current.etag);
      if (body.refresh !== true && clientEtag && remoteEtag && clientEtag !== remoteEtag) {
        return json({ error: "Le calendrier a changé entre-temps. Rien n’a été écrasé.", conflict: true }, 409);
      }
      if (body.refresh === true && body.confirm !== true) {
        const remote = masterEvent(current.ics);
        const same = remote.title === title && remote.start === start && remote.end === end;
        if (!same) {
          return json(
            {
              error: "Le calendrier a une autre version. Relisez-la avant de décider.",
              conflict: true,
              current: { title: remote.title, start: remote.start, end: remote.end, etag: current.etag },
            },
            409,
          );
        }
      }
      const ics = patchIcs(current.ics, { title, start, end, notes: text(body.notes) ? text(body.notes) : undefined });
      const call = putCall(target, ics, auth, body.refresh === true ? current.etag : text(body.etag) || current.etag);
      const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, body: call.body, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) return json({ error: "Adresse de calendrier refusée." }, 400);
      if (response.status === 412) return json({ error: "Le calendrier a changé entre-temps. Rien n’a été écrasé.", conflict: true }, 409);
      if (!response.ok && response.status !== 201 && response.status !== 204) return json({ error: "Le calendrier a refusé l’événement." }, 502);
      return json({ ok: true, uid, href: call.url }, 200);
    }
    const ics = buildIcs({ uid, title, start, end, notes: text(body.notes) });
    const prior = await fetchImpl(target, { method: "GET", headers: { Authorization: auth }, redirect: "manual" });
    if (prior.status === 200) {
      const raw = await prior.text();
      if (raw.includes("BEGIN:VEVENT")) {
        const remote = masterEvent(raw);
        if (remote.title === title && remote.start === start && remote.end === end) return json({ ok: true, uid, href: target, replayed: true }, 200);
        return json(
          { error: "Cet événement a changé depuis. Rien n’a été écrasé.", conflict: true, current: { title: remote.title, start: remote.start, end: remote.end } },
          409,
        );
      }
    }
    const call = putCall(target, ics, auth, "");
    const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, body: call.body, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) return json({ error: "Adresse de calendrier refusée." }, 400);
    if (!response.ok && response.status !== 201 && response.status !== 204) return json({ error: "Le calendrier a refusé l’événement." }, 502);
    return json({ ok: true, uid, href: call.url }, 200);
  }
  if (action === "delete") {
    const href = text(body.href);
    const uid = text(body.uid);
    if (!href && !uid) return json({ error: "Il manque l’événement." }, 400);
    const target = guardedHref(calendarUrl, href || `${calendarUrl}${uid}.ics`);
    if (!target) return json({ error: "Adresse de calendrier refusée." }, 400);
    const current = await readEvent(target, auth, fetchImpl);
    if (!current.ok) {
      if (current.missing) return json({ ok: true }, 200);
      return current.response;
    }
    const blocked = chefBlocked(text(body.title), text(body.previousTitle), current.summary);
    if (blocked) return blocked;
    const call = deleteCall(target, auth, text(body.etag) || current.etag);
    const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) return json({ error: "Adresse de calendrier refusée." }, 400);
    if (response.status === 412) return json({ error: "Le calendrier a changé entre-temps. Rien n’a été écrasé.", conflict: true }, 409);
    if (!response.ok && response.status !== 204 && response.status !== 404) return json({ error: "Le calendrier n’a pas supprimé l’événement." }, 502);
    return json({ ok: true }, 200);
  }
  return json({ error: "Action de calendrier inconnue." }, 400);
}

function chefBlocked(title: string, previous: string, summary: string): Response | null {
  if (isChefSportTitle(title) || isChefSportTitle(previous) || isChefSportTitle(summary)) {
    return json({ error: "Les événements 🏋️, 🏃 et 🏊 ne sont ni déplacés ni supprimés." }, 403);
  }
  return null;
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

async function readEvent(
  target: string,
  auth: string,
  fetchImpl: FetchLike,
): Promise<{ ok: true; ics: string; etag: string; summary: string } | { ok: false; missing: boolean; response: Response }> {
  const response = await fetchImpl(target, { method: "GET", headers: { Authorization: auth }, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, missing: false, response: json({ error: "Adresse de calendrier refusée." }, 400) };
  }
  if (response.status === 404) {
    return { ok: false, missing: true, response: json({ error: "L’événement n’est plus dans le calendrier. Rien n’a été écrit." }, 404) };
  }
  if (!response.ok) {
    return { ok: false, missing: false, response: json({ error: "Le calendrier n’a pas pu être relu. Rien n’a été écrasé." }, 502) };
  }
  const ics = await response.text();
  return { ok: true, ics, etag: response.headers.get("ETag") ?? "", summary: summaryOf(ics) };
}

async function findCalendar(env: Env, auth: string, fetchImpl: FetchLike): Promise<string> {
  if (cache.calendarUrl) return cache.calendarUrl;
  const host = (env.CALDAV_HOST || "https://caldav.icloud.com").replace(/\/+$/, "");
  if (!isIcloudHost(host)) throw new Error("host");
  const principalXml = await send(propfindCall(`${host}/`, 0, "principal", auth), fetchImpl);
  const principal = extractHref(principalXml, "current-user-principal");
  if (!principal) throw new Error("principal");
  const homeXml = await send(propfindCall(resolveHref(host, principal), 0, "home", auth), fetchImpl);
  const home = extractHref(homeXml, "calendar-home-set");
  if (!home) throw new Error("home");
  const homeUrl = resolveHref(host, home);
  const listXml = await send(propfindCall(homeUrl, 1, "list", auth), fetchImpl);
  const wanted = (env.CALENDAR_NAME || "").trim();
  const match = parseCalendarList(listXml).find((item) => item.name === wanted);
  if (!match) throw new Error("calendar");
  const found = guardedHref(homeUrl, match.href);
  if (!found) throw new Error("host");
  cache.calendarUrl = found.endsWith("/") ? found : `${found}/`;
  return cache.calendarUrl;
}

function guardedHref(base: string, href: string): string | null {
  try {
    const resolved = resolveHref(base, href);
    if (!isIcloudHost(resolved)) return null;
    const root = base.endsWith("/") ? base : `${base}/`;
    return resolved.startsWith(root) ? resolved : null;
  } catch {
    return null;
  }
}

function isIcloudHost(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "icloud.com" || host.endsWith(".icloud.com");
  } catch {
    return false;
  }
}

async function send(call: HttpCall, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, body: call.body, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) throw new Error("redirect");
  if (!response.ok && response.status !== 207) throw new Error(String(response.status));
  return response.text();
}

const MAX_REQUEST_BYTES = 48_000;
const COACH_HOURLY_CAP = 30;
const coachUsage = new Map<string, { start: number; count: number }>();

export function resetCoachUsage() {
  coachUsage.clear();
}

function noteCoachUsage(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  if (!path.endsWith("/coach") && !path.endsWith("/coach/stream")) return null;
  const token = bearer(request);
  if (!token) return null;
  let hash = 0;
  for (const char of token) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const key = String(hash);
  const now = Date.now();
  const row = coachUsage.get(key);
  if (!row || now - row.start > 60 * 60 * 1000) {
    coachUsage.set(key, { start: now, count: 1 });
    return null;
  }
  row.count += 1;
  if (row.count > COACH_HOURLY_CAP) return json({ error: "Le coach souffle un peu, réessayez dans une minute." }, 429);
  return null;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BYTES) throw new Error("trop long");
    const value = raw ? (JSON.parse(raw) as unknown) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch (caught) {
    if (caught instanceof Error && caught.message === "trop long") throw caught;
    return {};
  }
}

function bearer(request: Request): string {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

const authFailures = new Map<string, { count: number; until: number }>();

export function resetAuthGuard() {
  authFailures.clear();
}

async function authorize(request: Request, env: Env): Promise<Response | null> {
  const key = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";
  const now = Date.now();
  const row = authFailures.get(key);
  if (row && row.until > now) return json({ error: "Trop d’essais. Réessayez dans un quart d’heure." }, 429);
  const allowed = await safeEqual(bearer(request), env.APP_TOKEN || "");
  if (allowed) {
    authFailures.delete(key);
    return null;
  }
  const count = (row && row.until > now ? row.count : row?.count ?? 0) + 1;
  authFailures.set(key, { count, until: count >= 5 ? now + 15 * 60 * 1000 : 0 });
  return json({ error: "Accès refusé." }, 401);
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(left)), crypto.subtle.digest("SHA-256", encoder.encode(right))]);
  const leftBytes = new Uint8Array(a);
  const rightBytes = new Uint8Array(b);
  let diff = leftBytes.length === rightBytes.length ? 0 : 1;
  for (let index = 0; index < leftBytes.length; index += 1) diff |= leftBytes[index] ^ rightBytes[index];
  return diff === 0 && Boolean(left) && Boolean(right);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function cors(response: Response, origin: string | null, allowed: string): Response {
  const headers = new Headers(response.headers);
  if (origin === allowed) {
    headers.set("Access-Control-Allow-Origin", allowed);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(response.body, { status: response.status, headers });
}

const worker = {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env, fetch);
  },
};

export default worker;

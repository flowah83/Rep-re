import {
  buildAiCall,
  coachFailure,
  foldGeminiChunk,
  messageFromGeminiBody,
  modelChain,
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
import {
  basicHeader,
  buildIcs,
  deleteCall,
  extractHref,
  parisDayToUtc,
  parseCalendarList,
  parseEvents,
  propfindCall,
  putCall,
  reportCall,
  resolveHref,
  type HttpCall,
} from "./caldav";

export type Env = AiEnv & {
  ICLOUD_APP_PASSWORD?: string;
  APP_TOKEN?: string;
  CALDAV_HOST?: string;
  CALDAV_USER?: string;
  CALENDAR_NAME?: string;
  ALLOWED_ORIGIN?: string;
  /** Délai d’un essai de flux, en millisecondes. 20 secondes si absent. */
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
  if (!safeEqual(bearer(request), env.APP_TOKEN || "")) return cors(json({ error: "Accès refusé." }, 401), origin, allowed);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (path.endsWith("/coach/stream")) return cors(await coachStream(request, env, fetchImpl), origin, allowed);
    if (path.endsWith("/coach")) return cors(await coach(request, env, fetchImpl), origin, allowed);
    if (path.endsWith("/calendar")) return cors(await calendar(request, env, fetchImpl), origin, allowed);
    return cors(json({ error: "Adresse inconnue." }, 404), origin, allowed);
  } catch {
    return cors(json({ error: "Le service n’a pas pu répondre." }, 500), origin, allowed);
  }
}

const DEFAULT_STREAM_DEADLINE_MS = 20_000;

function streamDeadline(env: Env): number {
  const value = Number(env.STREAM_DEADLINE_MS);
  if (Number.isFinite(value) && value >= 20 && value <= 60_000) return value;
  return DEFAULT_STREAM_DEADLINE_MS;
}

async function coachStream(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  const body = await readJson(request);
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  const deadline = streamDeadline(env);
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
        const message = await answerForStream(env, body, fetchImpl, push, upstream.signal, deadline);
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

async function answerForStream(
  env: Env,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
  push: (payload: unknown) => void,
  parent: AbortSignal,
  deadline: number,
) {
  const provider = providerName(env.AI_PROVIDER);
  if (provider !== "gemini") return plainMessage(env, body, fetchImpl, push, parent, deadline);
  const models = modelChain(env);
  let lastStatus = 504;
  for (const model of models) {
    if (parent.aborted) throw new Error("annulé");
    const call = buildAiCall({ ...env, AI_MODEL: model }, body.context ?? {}, body.messages);
    if ("error" in call) throw new Error(call.error);
    const streamed = await tryGeminiStream(call, fetchImpl, push, parent, deadline);
    if (streamed.ok) return streamed.message;
    lastStatus = streamed.status;
    if (!retryableStreamStatus(lastStatus)) break;
  }
  return plainMessage(env, body, fetchImpl, push, parent, deadline, lastStatus);
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
    if (!type.includes("text/event-stream")) {
      const message = messageFromGeminiBody(await response.text());
      if (!message) return { ok: false, status: 502 };
      if (message.content) push({ text: message.content });
      return { ok: true, message };
    }
    const folded = await readGeminiSse(response.body, push, deadline);
    if (folded.timedOut) {
      attempt.abort();
      if (!folded.state.text && folded.state.calls.length === 0) return { ok: false, status: 504 };
    }
    return { ok: true, message: { role: "assistant", content: folded.state.text, tool_calls: folded.state.calls } };
  } catch (caught) {
    if (parent.aborted) throw caught;
    return { ok: false, status: 504 };
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onParent);
  }
}

async function readGeminiSse(body: ReadableStream<Uint8Array>, push: (payload: unknown) => void, deadline: number) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let state: StreamFold = { text: "", calls: [] };
  while (true) {
    const reading = reader.read();
    const step = await raceRead(reading, deadline);
    if (step === "timeout") {
      reading.catch(() => undefined);
      await reader.cancel().catch(() => undefined);
      return { timedOut: true, state };
    }
    if (step.done) break;
    if (step.value) pending += decoder.decode(step.value, { stream: true });
    let cut = pending.indexOf("\n");
    while (cut >= 0) {
      const line = pending.slice(0, cut).trim();
      pending = pending.slice(cut + 1);
      state = consumeGeminiLine(state, line, push);
      cut = pending.indexOf("\n");
    }
  }
  if (pending.trim()) state = consumeGeminiLine(state, pending.trim(), push);
  return { timedOut: false, state };
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
    const next = foldGeminiChunk(state, JSON.parse(raw) as unknown);
    if (next.text !== state.text) push({ text: next.text });
    return next;
  } catch {
    return state;
  }
}

function encodeSse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function coach(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  const body = await readJson(request);
  const provider = providerName(env.AI_PROVIDER);
  const models = provider === "gemini" ? modelChain(env) : [modelName(env)];
  let lastStatus = 502;
  for (let index = 0; index < models.length; index++) {
    const call = buildAiCall({ ...env, AI_MODEL: models[index] }, body.context ?? {}, body.messages);
    if ("error" in call) return json({ error: call.error }, call.status);
    const response = await fetchImpl(call.url, { method: "POST", headers: call.headers, body: call.body });
    if (response.ok) {
      const data = (await response.json()) as unknown;
      return json({ message: readAiMessage(provider, data) }, 200);
    }
    lastStatus = response.status;
    if (!shouldTryNextModel(lastStatus) || index === models.length - 1) break;
  }
  const failure = coachFailure(lastStatus, provider === "gemini" && shouldTryNextModel(lastStatus));
  return json({ error: failure.error }, failure.status);
}

async function calendar(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  if (!env.ICLOUD_APP_PASSWORD) return json({ error: "Le calendrier n’est pas encore activé." }, 503);
  const body = await readJson(request);
  const action = typeof body.action === "string" ? body.action : "";
  const auth = basicHeader(env.CALDAV_USER || "florian.lemen@icloud.com", env.ICLOUD_APP_PASSWORD);
  const calendarUrl = await findCalendar(env, auth, fetchImpl);
  if (action === "list") {
    const start = typeof body.start === "string" ? body.start : "";
    const end = typeof body.end === "string" ? body.end : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return json({ error: "Il manque les dates." }, 400);
    }
    const report = reportCall(calendarUrl, parisDayToUtc(start), parisDayToUtc(end, true), auth);
    const xml = await send(report, fetchImpl);
    return json({ events: parseEvents(xml) }, 200);
  }
  if (action === "create" || action === "update") {
    const title = text(body.title);
    const start = text(body.start);
    const end = text(body.end);
    if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end)) {
      return json({ error: "L’événement est incomplet." }, 400);
    }
    const uid = action === "update" && text(body.uid) ? text(body.uid) : crypto.randomUUID();
    const href = text(body.href) || `${calendarUrl}${uid}.ics`;
    const ics = buildIcs({ uid, title, start, end, notes: text(body.notes) });
    const call = putCall(resolveHref(calendarUrl, href), ics, auth, text(body.etag));
    const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, body: call.body });
    if (!response.ok && response.status !== 201 && response.status !== 204) return json({ error: "Le calendrier a refusé l’événement." }, 502);
    return json({ ok: true, uid, href: call.url }, 200);
  }
  if (action === "delete") {
    const href = text(body.href);
    const uid = text(body.uid);
    if (!href && !uid) return json({ error: "Il manque l’événement." }, 400);
    const call = deleteCall(resolveHref(calendarUrl, href || `${calendarUrl}${uid}.ics`), auth, text(body.etag));
    const response = await fetchImpl(call.url, { method: call.method, headers: call.headers });
    if (!response.ok && response.status !== 204 && response.status !== 404) return json({ error: "Le calendrier n’a pas supprimé l’événement." }, 502);
    return json({ ok: true }, 200);
  }
  return json({ error: "Action de calendrier inconnue." }, 400);
}

async function findCalendar(env: Env, auth: string, fetchImpl: FetchLike): Promise<string> {
  if (cache.calendarUrl) return cache.calendarUrl;
  const host = (env.CALDAV_HOST || "https://caldav.icloud.com").replace(/\/+$/, "");
  const principalXml = await send(propfindCall(`${host}/`, 0, "principal", auth), fetchImpl);
  const principal = extractHref(principalXml, "current-user-principal");
  if (!principal) throw new Error("principal");
  const homeXml = await send(propfindCall(resolveHref(host, principal), 0, "home", auth), fetchImpl);
  const home = extractHref(homeXml, "calendar-home-set");
  if (!home) throw new Error("home");
  const homeUrl = resolveHref(host, home);
  const listXml = await send(propfindCall(homeUrl, 1, "list", auth), fetchImpl);
  const wanted = (env.CALENDAR_NAME || "Calendrier Flo").trim();
  const match = parseCalendarList(listXml).find((item) => item.name === wanted);
  if (!match) throw new Error("calendar");
  cache.calendarUrl = resolveHref(homeUrl, match.href);
  if (!cache.calendarUrl.endsWith("/")) cache.calendarUrl += "/";
  return cache.calendarUrl;
}

async function send(call: HttpCall, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(call.url, { method: call.method, headers: call.headers, body: call.body });
  if (!response.ok && response.status !== 207) throw new Error(String(response.status));
  return response.text();
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

function bearer(request: Request): string {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
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

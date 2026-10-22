import { buildAiCall, coachFailure, providerName, readAiMessage, type AiEnv } from "./ai";
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
    if (path.endsWith("/coach")) return cors(await coach(request, env, fetchImpl), origin, allowed);
    if (path.endsWith("/calendar")) return cors(await calendar(request, env, fetchImpl), origin, allowed);
    return cors(json({ error: "Adresse inconnue." }, 404), origin, allowed);
  } catch {
    return cors(json({ error: "Le service n’a pas pu répondre." }, 500), origin, allowed);
  }
}

async function coach(request: Request, env: Env, fetchImpl: FetchLike): Promise<Response> {
  const body = await readJson(request);
  const call = buildAiCall(env, body.context ?? {}, body.messages);
  if ("error" in call) return json({ error: call.error }, call.status);
  const response = await fetchImpl(call.url, { method: "POST", headers: call.headers, body: call.body });
  if (!response.ok) {
    const failure = coachFailure(response.status);
    return json({ error: failure.error }, failure.status);
  }
  const data = (await response.json()) as unknown;
  return json({ message: readAiMessage(providerName(env.AI_PROVIDER), data) }, 200);
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

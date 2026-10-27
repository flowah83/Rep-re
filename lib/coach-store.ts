const URL_KEY = "repere-coach-url";
const TOKEN_KEY = "repere-coach-token";
const CHAT_KEY = "repere-coach-messages";
const NOTICE_KEY = "repere-coach-notices";
const MEMO_KEY = "repere-coach-memo";

export const DEFAULT_COACH_URL = "https://repere-coach.repere-flo.workers.dev";

export type CoachConfig = { url: string; token: string };

export type CoachProbe = { ok: boolean; message: string; url: string };

function isLocalDevHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** Une adresse http publique n’est pas enregistrée. localhost reste l’exception de développement. */
export function coachUrlIssue(raw: string | null | undefined): string | null {
  const compact = (raw ?? "").replace(/\s+/g, "");
  if (!compact) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(compact) ? compact : "";
  if (!withScheme) return null;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol === "http:" && !isLocalDevHost(url.hostname)) {
    return "Cette adresse n’est pas en https. Elle n’est pas enregistrée. Une adresse locale n’est acceptée qu’en développement.";
  }
  return null;
}

export function normalizeCoachUrl(raw: string | null | undefined): string {
  const compact = (raw ?? "").replace(/\s+/g, "");
  if (!compact) return DEFAULT_COACH_URL;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(compact) ? compact : `https://${compact}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return DEFAULT_COACH_URL;
  }
  const localHttp = url.protocol === "http:" && isLocalDevHost(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || !url.hostname) return DEFAULT_COACH_URL;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

export function maskSecret(token: string | null | undefined): string {
  const clean = (token ?? "").trim();
  if (!clean) return "";
  return `•••• ${clean.slice(-4)}`;
}

export type CoachPhase = "non-configure" | "pret" | "en-cours" | "indisponible";

export function coachPhase(input: { configured: boolean; busy: boolean; down: boolean }): { phase: CoachPhase; label: string } {
  if (!input.configured) return { phase: "non-configure", label: "Non configuré" };
  if (input.busy) return { phase: "en-cours", label: "Réponse en cours" };
  if (input.down) return { phase: "indisponible", label: "Indisponible" };
  return { phase: "pret", label: "Prêt" };
}

export function normalizeCoachToken(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export type StoredTurn = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { id: string; name: string; arguments: string; thoughtSignature?: string }[];
  toolCallId?: string;
  pending?: boolean;
  omitted?: string;
  card?: "partial" | "conflict";
  retryCalls?: { id: string; name: string; arguments: string; thoughtSignature?: string }[];
};

type Notice = { id: string; line: string; sent: boolean };

export function loadCoachConfig(): CoachConfig {
  try {
    return {
      url: normalizeCoachUrl(localStorage.getItem(URL_KEY)),
      token: normalizeCoachToken(localStorage.getItem(TOKEN_KEY)),
    };
  } catch {
    return { url: DEFAULT_COACH_URL, token: "" };
  }
}

export function saveCoachConfig(config: CoachConfig) {
  try {
    localStorage.setItem(URL_KEY, normalizeCoachUrl(config.url));
    localStorage.setItem(TOKEN_KEY, normalizeCoachToken(config.token));
  } catch {
    /* stockage privé */
  }
}

export function coachIsReady(config = loadCoachConfig()): boolean {
  return Boolean(normalizeCoachToken(config.token));
}

export async function testCoachConnection(
  config: { url: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CoachProbe> {
  const url = normalizeCoachUrl(config.url);
  const token = normalizeCoachToken(config.token);
  if (!token) return { ok: false, url, message: "Indiquez le code secret, puis réessayez." };
  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    });
    if (response.status === 401) return { ok: false, url, message: "Code refusé (401)." };
    if (response.status === 429) return { ok: false, url, message: "Trop d’essais. Réessayez dans un moment." };
    if (response.ok) return { ok: true, url, message: "Connexion OK." };
    if (response.status === 404) return { ok: false, url, message: "Cette adresse ne répond pas." };
    return { ok: false, url, message: `Le service a répondu ${response.status}.` };
  } catch {
    return { ok: false, url, message: `Serveur injoignable. Adresse utilisée : ${url}` };
  }
}

export async function requestCoach(
  path: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const config = loadCoachConfig();
  const url = normalizeCoachUrl(config.url);
  const token = normalizeCoachToken(config.token);
  if (!token) throw new Error("Le coach n’est pas encore activé.");
  const target = `${url}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") throw caught;
    throw new Error(`Le coach n’est pas joignable. Adresse utilisée : ${url}`);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("La réponse du coach est illisible.");
  }
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : "Le coach n’a pas pu répondre.";
    const error = new Error(message) as Error & { conflict?: boolean };
    if (data.conflict === true) error.conflict = true;
    throw error;
  }
  return data;
}

export function loadCoachMemo(): string {
  try {
    const raw = localStorage.getItem(MEMO_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return "";
    return parsed.filter((line): line is string => typeof line === "string").slice(-8).join("\n");
  } catch {
    return "";
  }
}

export function rememberCoachLine(line: string) {
  const clean = line.replace(/\s+/g, " ").trim();
  if (!clean) return;
  try {
    const raw = localStorage.getItem(MEMO_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const lines = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    const next = [...lines, clean].slice(-8);
    localStorage.setItem(MEMO_KEY, JSON.stringify(next));
  } catch {
    /* stockage privé */
  }
}

/** Safari sur iPhone ne livre souvent le flux qu’à la fin. Couper à 12 s basculait vers /coach, qui peut rester sans réponse. */
export const STREAM_QUIET_MS = 45_000;
const COACH_FALLBACK_MS = 20_000;

export async function requestCoachStream(
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
  options?: { fetchImpl?: typeof fetch; firstByteMs?: number; inactivityMs?: number },
): Promise<Record<string, unknown>> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const firstByteMs = options?.firstByteMs ?? STREAM_QUIET_MS;
  const inactivityMs = options?.inactivityMs ?? STREAM_QUIET_MS;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const config = loadCoachConfig();
  const url = normalizeCoachUrl(config.url);
  const token = normalizeCoachToken(config.token);
  if (!token) throw new Error("Le coach n’est pas encore activé.");
  const fallback = async () => {
    try {
      return await requestCoach("/coach", body, withTimeout(fetchImpl, COACH_FALLBACK_MS, signal));
    } catch (caught) {
      if (signal?.aborted) throw caught;
      if (caught instanceof Error && caught.name === "AbortError") throw new Error("Le coach n’a pas pu répondre.");
      throw caught;
    }
  };
  const target = `${url}/coach/stream`;
  const killer = new AbortController();
  const onUserAbort = () => killer.abort();
  signal?.addEventListener("abort", onUserAbort);
  let response: Response;
  const timer = setTimeout(() => killer.abort(), firstByteMs);
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: killer.signal,
    });
  } catch (caught) {
    if (signal?.aborted) throw caught;
    if (caught instanceof Error && caught.name === "AbortError") throw new Error("Le coach n’a pas pu répondre.");
    throw new Error(`Le coach n’est pas joignable. Adresse utilisée : ${url}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onUserAbort);
  }
  if (response.status === 404) return fallback();
  const type = response.headers.get("content-type") ?? "";
  if (response.ok && type.includes("text/event-stream") && !response.body) {
    return finishSse(await response.text(), onText);
  }
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new Error("Le coach n’a pas pu répondre.");
    }
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Le coach n’a pas pu répondre.");
    return data;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let message: Record<string, unknown> | null = null;
  let accumulated = "";
  let stop = false;
  const userAbort = aborted(signal);
  const take = (chunk: string) => {
    const applied = applySse(`${buffer}${chunk}`, onText);
    buffer = applied.rest;
    accumulated = applied.accumulated || accumulated;
    if (applied.message) message = applied.message;
    if (applied.error) {
      if (!accumulated) throw new Error(applied.error);
      stop = true;
    }
  };
  try {
    while (!stop) {
      const reading = reader.read();
      let idle: ReturnType<typeof setTimeout> | undefined;
      const step = await Promise.race([
        reading,
        new Promise<"timeout">((resolve) => {
          idle = setTimeout(() => resolve("timeout"), inactivityMs);
        }),
        userAbort,
      ]);
      clearTimeout(idle);
      if (step === "aborted" || signal?.aborted) {
        reading.catch(() => undefined);
        await stopReader(reader);
        throw new DOMException("Aborted", "AbortError");
      }
      if (step === "timeout") {
        reading.catch(() => undefined);
        await stopReader(reader);
        break;
      }
      const bytes = step.value ? decoder.decode(step.value, { stream: !step.done }) : "";
      if (step.done) {
        take(`${bytes}${decoder.decode()}`);
        if (buffer.trim()) take("\n\n");
        break;
      }
      take(bytes);
    }
  } catch (caught) {
    if (signal?.aborted) throw caught;
    if (caught instanceof Error && /souffle|429/.test(caught.message)) throw caught;
    if (!accumulated && !message) throw caught instanceof Error ? caught : new Error("Le coach n’a pas pu répondre.");
  }
  if (message) return { message };
  if (accumulated) return { message: { role: "assistant", content: accumulated } };
  throw new Error("Le coach n’a pas pu répondre.");
}

function finishSse(raw: string, onText: (text: string) => void): Record<string, unknown> {
  const applied = applySse(`${raw}\n\n`, onText);
  if (applied.error && !applied.accumulated) throw new Error(applied.error);
  if (applied.message) return { message: applied.message };
  if (applied.accumulated) return { message: { role: "assistant", content: applied.accumulated } };
  throw new Error("Le coach n’a pas pu répondre.");
}

function applySse(buffer: string, onText: (text: string) => void): {
  rest: string;
  accumulated: string;
  message: Record<string, unknown> | null;
  error: string | null;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  let accumulated = "";
  let message: Record<string, unknown> | null = null;
  let error: string | null = null;
  for (const part of parts) {
    const line = part.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof data.error === "string") error = data.error;
    if (typeof data.text === "string") {
      accumulated = data.text;
      onText(data.text);
    }
    if (data.message && typeof data.message === "object") message = data.message as Record<string, unknown>;
  }
  return { rest, accumulated, message, error };
}

async function stopReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  await Promise.race([reader.cancel().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 300))]);
}

function aborted(signal?: AbortSignal): Promise<"aborted"> {
  return new Promise((resolve) => {
    if (!signal) return;
    if (signal.aborted) {
      resolve("aborted");
      return;
    }
    signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
}

function withTimeout(fetchImpl: typeof fetch, ms: number, signal?: AbortSignal): typeof fetch {
  return (input, init) => {
    const killer = new AbortController();
    const timer = setTimeout(() => killer.abort(), ms);
    const onAbort = () => killer.abort();
    signal?.addEventListener("abort", onAbort);
    return fetchImpl(input, { ...init, signal: killer.signal }).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  };
}

export function loadCoachChat(): StoredTurn[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTurn).slice(-40);
  } catch {
    return [];
  }
}

export function saveCoachChat(turns: StoredTurn[]) {
  try {
    const trimmed = turns.slice(-40);
    localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed));
  } catch {
    /* stockage privé */
  }
}

export function recordCoachNotice(line: string) {
  const notices = readNotices();
  notices.push({ id: `${Date.now()}`, line, sent: false });
  writeNotices(notices.slice(-30));
}

export function pendingCoachNoticeLines(): string[] {
  return readNotices().filter((notice) => !notice.sent).map((notice) => notice.line);
}

export function markCoachNoticesSent() {
  writeNotices(readNotices().map((notice) => ({ ...notice, sent: true })));
}

function readNotices(): Notice[] {
  try {
    const raw = localStorage.getItem(NOTICE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Notice => Boolean(item && typeof item === "object" && typeof (item as Notice).line === "string"));
  } catch {
    return [];
  }
}

function writeNotices(notices: Notice[]) {
  try {
    localStorage.setItem(NOTICE_KEY, JSON.stringify(notices));
  } catch {
    /* stockage privé */
  }
}

function isTurn(value: unknown): value is StoredTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as StoredTurn;
  return (turn.role === "user" || turn.role === "assistant" || turn.role === "tool") && typeof turn.content === "string" && typeof turn.id === "string";
}

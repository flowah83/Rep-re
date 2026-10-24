const URL_KEY = "repere-coach-url";
const TOKEN_KEY = "repere-coach-token";
const CHAT_KEY = "repere-coach-messages";
const NOTICE_KEY = "repere-coach-notices";
const MEMO_KEY = "repere-coach-memo";

export const DEFAULT_COACH_URL = "https://repere-coach.repere-flo.workers.dev";

export type CoachConfig = { url: string; token: string };

export type CoachProbe = { ok: boolean; message: string; url: string };

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
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return DEFAULT_COACH_URL;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}${url.search}${url.hash}`;
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
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    });
    if (response.status === 401) return { ok: false, url, message: "Code refusé (401)." };
    if (response.ok || response.status === 404) return { ok: true, url, message: "Connexion OK." };
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
  } catch {
    throw new Error(`Le coach n’est pas joignable. Adresse utilisée : ${url}`);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("La réponse du coach est illisible.");
  }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Le coach n’a pas pu répondre.");
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

export async function requestCoachStream(
  body: unknown,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const config = loadCoachConfig();
  const url = normalizeCoachUrl(config.url);
  const token = normalizeCoachToken(config.token);
  if (!token) throw new Error("Le coach n’est pas encore activé.");
  const target = `${url}/coach/stream`;
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (caught) {
    if (signal?.aborted) throw caught;
    return requestCoach("/coach", body);
  }
  if (response.status === 404 || response.status === 502 || response.status === 503) return requestCoach("/coach", body);
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      if (!response.ok) throw new Error("Le coach n’a pas pu répondre.");
      return requestCoach("/coach", body);
    }
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Le coach n’a pas pu répondre.");
    return data;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let message: Record<string, unknown> | null = null;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    buffer += decoder.decode(step.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof data.error === "string") throw new Error(data.error);
      if (typeof data.text === "string") onText(data.text);
      if (data.message && typeof data.message === "object") message = data.message as Record<string, unknown>;
    }
  }
  if (!message) throw new Error("Le coach n’a pas pu répondre.");
  return { message };
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

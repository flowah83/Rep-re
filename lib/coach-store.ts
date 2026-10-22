const URL_KEY = "repere-coach-url";
const TOKEN_KEY = "repere-coach-token";
const CHAT_KEY = "repere-coach-messages";
const NOTICE_KEY = "repere-coach-notices";

export type CoachConfig = { url: string; token: string };

export type StoredTurn = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  toolCallId?: string;
  pending?: boolean;
};

type Notice = { id: string; line: string; sent: boolean };

export function loadCoachConfig(): CoachConfig {
  try {
    return {
      url: localStorage.getItem(URL_KEY)?.trim() ?? "",
      token: localStorage.getItem(TOKEN_KEY)?.trim() ?? "",
    };
  } catch {
    return { url: "", token: "" };
  }
}

export function saveCoachConfig(config: CoachConfig) {
  try {
    localStorage.setItem(URL_KEY, config.url.trim());
    localStorage.setItem(TOKEN_KEY, config.token.trim());
  } catch {
    /* stockage privé */
  }
}

export function coachIsReady(config = loadCoachConfig()): boolean {
  return Boolean(config.url && config.token);
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

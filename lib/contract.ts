/** Saisie décimale française : le texte reste le texte tant que le nombre n’est pas fini. */

export type DecimalDraft =
  | { kind: "empty" }
  | { kind: "partial" }
  | { kind: "number"; value: number }
  | { kind: "invalid"; message: string };

const DECIMAL_SHAPE = /^-?\d*(?:[.,]\d*)?$/;

export function parseDecimalDraft(raw: string, options?: { integer?: boolean; min?: number; max?: number }): DecimalDraft {
  const text = raw.trim().replace(/\s/g, "");
  if (!text) return { kind: "empty" };
  if (!DECIMAL_SHAPE.test(text) || (text.match(/[.,]/g) ?? []).length > 1) {
    return { kind: "invalid", message: "Ce n’est pas un nombre." };
  }
  const integer = options?.integer === true;
  if (integer && /[.,]/.test(text)) {
    return { kind: "invalid", message: "Il faut un nombre entier." };
  }
  if (text === "-" || text === "," || text === "." || text.endsWith(",") || text.endsWith(".")) {
    return { kind: "partial" };
  }
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return { kind: "invalid", message: "Ce n’est pas un nombre." };
  if (options?.min != null && value < options.min) return { kind: "invalid", message: `Minimum ${options.min}.` };
  if (options?.max != null && value > options.max) return { kind: "invalid", message: `Maximum ${options.max}.` };
  return { kind: "number", value };
}

/** Rejoue une frappe. Une virgule en cours ne devient jamais un autre nombre. */
export function reduceDecimalTyping(keys: string, options?: { integer?: boolean }): { text: string; committed: number | null; invalid: boolean } {
  let text = "";
  let committed: number | null = null;
  let invalid = false;
  for (const key of keys) {
    const next = key === "⌫" ? text.slice(0, -1) : text + key;
    const parsed = parseDecimalDraft(next, options);
    if (parsed.kind === "invalid") {
      invalid = true;
      continue;
    }
    invalid = false;
    text = next;
    committed = parsed.kind === "number" ? parsed.value : committed;
  }
  return { text, committed, invalid };
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isClock(value: string): boolean {
  if (!value) return true;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export const TEXT_LIMIT = 4000;
export const IMPORT_LIMIT = 2_000_000;
export const MAX_SESSIONS = 500;
export const MAX_EXERCISES = 40;
export const MAX_SETS = 60;

/** null reste inconnu. 0 reste 0. Un nombre impossible n’est pas converti en silence. */
export function readStoredNumber(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (typeof value === "string") {
    const numeric = Number(value.replace(",", ".").trim());
    return Number.isFinite(numeric) ? { ok: true, value: numeric } : { ok: false };
  }
  return { ok: false };
}

/** Même lecture partout : écran, volume, import, export. Une chaîne inconnue reste telle quelle. */
export function normalizeUnit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const key = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (key === "kg/main" || key.includes("par main") || key.includes("par haltere")) return "kg/main";
  if (key === "kg/jambe" || key.includes("par jambe")) return "kg/jambe";
  if (key === "kg") return "kg";
  if (key === "corps" || key.includes("pdc") || key.includes("poids du corps")) return "corps";
  if (key === "ajoute" || key === "lest" || key.includes("poids ajoute")) return "ajoute";
  if (key === "assistance" || key.includes("assiste")) return "assistance";
  return raw;
}

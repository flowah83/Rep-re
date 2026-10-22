import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + days);
  return localDate(dt);
}

export function formatLong(iso: string): string {
  const raw = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseISODate(iso));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatKg(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatRestLabel(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} s`;
  if (r === 0) return m === 1 ? "1 min" : `${m} min`;
  return `${m} min ${r}`;
}

export function formatDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  return `${min} min`;
}

export function mondayOf(iso: string): string {
  const dt = parseISODate(iso);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return localDate(dt);
}

export function weekdayLetter(iso: string): string {
  return ["D", "L", "M", "M", "J", "V", "S"][parseISODate(iso).getDay()];
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

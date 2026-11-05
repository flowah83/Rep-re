import { parseDecimalDraft } from "./contract";
import type { ExerciseLog, SetLog } from "./types";
import { formatKg } from "./utils";

/** Brouillon indépendant pour la charge et les répétitions. `undefined` = valeur de la série. */
export type FieldDraft = { loadKg?: number; reps?: number };

export function shownLoad(set: { loadKg: number | null }, planned: number | null, draft: FieldDraft): number | null {
  if (draft.loadKg !== undefined) return draft.loadKg;
  return set.loadKg ?? planned;
}

export function shownReps(set: { reps: number | null }, planned: number | null, draft: FieldDraft): number | null {
  if (draft.reps !== undefined) return draft.reps;
  return set.reps ?? planned;
}

/** Ce qui sera noté : les deux champs, même si un seul vient d’être touché. */
export function loggedPair(
  set: { loadKg: number | null; reps: number | null },
  planned: { loadKg: number | null; reps: number | null },
  draft: FieldDraft,
): { loadKg: number | null; reps: number | null } {
  return {
    loadKg: shownLoad(set, planned.loadKg, draft),
    reps: shownReps(set, planned.reps, draft),
  };
}

export function stepField(value: number | null, direction: number, step: number): number {
  const base = value == null ? 0 : value;
  return Math.max(0, Math.round((base + direction * step) * 100) / 100);
}

export function followingOpenWork(exercise: ExerciseLog, fromSetId: string): SetLog[] {
  const from = exercise.sets.findIndex((set) => set.id === fromSetId);
  if (from < 0) return [];
  return exercise.sets.slice(from + 1).filter((set) => !set.warmup && !set.done && !set.skipped);
}

/** Une seule question, seulement si une série de travail suivante est encore ouverte. */
export function keepPrompt(exercise: ExerciseLog, fromSetId: string, loadKg: number | null): string | null {
  if (loadKg == null) return null;
  const set = exercise.sets.find((item) => item.id === fromSetId);
  if (!set || set.warmup) return null;
  const later = followingOpenWork(exercise, fromSetId);
  if (!later.length) return null;
  const already = later.every((item) => item.loadKg != null && Math.abs(item.loadKg - loadKg) < 0.001);
  if (already) return null;
  return `Garder ${formatKg(loadKg)} kg pour les séries suivantes ?`;
}

export function loadGap(value: number | null, planned: number | null): string | null {
  if (value == null || planned == null) return null;
  const delta = Math.round((value - planned) * 100) / 100;
  if (Math.abs(delta) < 0.001) return null;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatKg(Math.abs(delta))} kg par rapport au plan`;
}

export function repsGap(value: number | null, planned: number | null): string | null {
  if (value == null || planned == null) return null;
  const delta = Math.round(value - planned);
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)} par rapport au plan`;
}

export function workIndex(exercise: ExerciseLog, set: SetLog): number {
  return exercise.sets.filter((item) => !item.warmup).indexOf(set) + 1;
}

export function chipOpensCorrection(set: SetLog): boolean {
  return set.done === true;
}

export const PAD_MAX = 1000;

export type PadDecision = { action: "apply"; value: number } | { action: "dismiss" } | { action: "reject"; message: string };

/** Vide : on ferme sans écrire. Au-dessus de 1 000, ou nombre inachevé : on reste, et on le dit. */
export function acceptPadDraft(raw: string, options?: { integer?: boolean }): PadDecision {
  const parsed = parseDecimalDraft(raw, { integer: options?.integer === true, min: 0, max: PAD_MAX });
  if (parsed.kind === "number") return { action: "apply", value: parsed.value };
  if (parsed.kind === "empty") return { action: "dismiss" };
  if (parsed.kind === "invalid" && parsed.message.startsWith("Maximum")) return { action: "reject", message: "1 000 est le maximum." };
  if (parsed.kind === "invalid") return { action: "reject", message: parsed.message };
  return { action: "reject", message: "Ce n’est pas un nombre." };
}

/** Les répétitions n’ont pas de virgule. Cinq signes au plus, pour pouvoir atteindre le plafond et le dire. */
export function typePadKey(value: string, key: string, integer = false): string {
  if (key === "⌫") return value.slice(0, -1);
  if (integer && (key === "," || key === ".")) return value;
  if (key === "," && value.includes(",")) return value;
  if (value.replace(/[,.-]/g, "").length >= 5) return value;
  return `${value}${key}`;
}

export function padConfirmLabel(value: string, unit: string): string {
  return `Valider · ${value || "0"} ${unit}`;
}

export function padKeys(integer: boolean): string[] {
  return integer ? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] : ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
}

/** Échap ferme. Tab boucle dans le pavé. `index` vaut -1 quand le focus est encore sur le cadre. */
export function padKeyAction(key: string, shift: boolean, index: number, count: number): "close" | "default" | number {
  if (key === "Escape") return "close";
  if (key !== "Tab" || count === 0) return "default";
  if (index < 0) return shift ? count - 1 : 0;
  if (shift && index === 0) return count - 1;
  if (!shift && index === count - 1) return 0;
  return "default";
}

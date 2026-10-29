import { CATALOG } from "./exercises";
import { stripAccents } from "./utils";

/** Une même charge n’a qu’une identité : total, par main, par jambe, corps, lest ou assistance. */
export function canonicalUnit(unit: string | null | undefined): string {
  const value = (unit ?? "").trim().toLowerCase();
  if (!value || value === "kg" || value === "kg total") return "kg";
  if (value === "kg/main" || value === "par main" || value === "par haltere" || value === "par haltère") return "kg/main";
  if (value === "kg/jambe" || value === "par jambe") return "kg/jambe";
  if (value === "corps" || value === "pdc" || value === "poids du corps" || value === "poids de corps") return "corps";
  if (value === "ajoute" || value === "lest" || value === "poids ajoute") return "ajoute";
  if (value === "assistance" || value === "assiste") return "assistance";
  return value;
}

const KNOWN_UNITS = new Set(["kg", "kg/main", "kg/jambe", "corps", "ajoute", "assistance"]);

export function isKnownUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return KNOWN_UNITS.has(canonicalUnit(unit));
}

/** Unité certaine d’après le nom ou le catalogue. null si ce n’est pas tranché. */
export function unambiguousUnit(exercise: { name?: string; unit?: string | null }): string | null {
  if (exercise.unit && isKnownUnit(exercise.unit)) return canonicalUnit(exercise.unit);
  return inferredUnit(exercise);
}

/** Déduction seulement quand aucune unité n’est écrite. */
export function inferredUnit(exercise: { name?: string; unit?: string | null }): string | null {
  if (exercise.unit) return null;
  const key = stripAccents(exercise.name ?? "");
  if (!key) return null;
  if (key.includes("haltere")) return "kg/main";
  const catalog = CATALOG.find((item) => stripAccents(item.name) === key);
  if (!catalog) return null;
  if (catalog.equipment === "halteres") return "kg/main";
  if (catalog.equipment === "corps") return "corps";
  if (catalog.equipment === "barre" || catalog.equipment === "poulie" || catalog.equipment === "machine") return "kg";
  return null;
}

/** L’unité écrite sur la série gagne. Sinon celle de l’exercice, sinon le nom (haltère, poids du corps). */
export function resolvedUnit(set: { unit?: string | null }, exercise: { unit?: string | null; name?: string }): string {
  if (set.unit) return canonicalUnit(set.unit);
  if (exercise.unit) return canonicalUnit(exercise.unit);
  const key = stripAccents(exercise.name ?? "");
  if (key.includes("haltere")) return "kg/main";
  const catalog = CATALOG.find((item) => stripAccents(item.name) === key);
  if (catalog?.equipment === "halteres") return "kg/main";
  if (catalog?.equipment === "corps") return "corps";
  return "kg";
}

export function recordKey(name: string, unit: string): string {
  return `${name}\u0000${canonicalUnit(unit)}`;
}

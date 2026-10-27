import { CATALOG } from "./exercises";
import { stripAccents } from "./utils";

/** Une même charge n’a qu’une identité : kg total, par main, par jambe, ou poids du corps. */
export function canonicalUnit(unit: string | null | undefined): string {
  const value = (unit ?? "").trim().toLowerCase();
  if (!value || value === "kg" || value === "kg total") return "kg";
  if (value === "kg/main" || value === "par main" || value === "par haltere" || value === "par haltère") return "kg/main";
  if (value === "kg/jambe" || value === "par jambe") return "kg/jambe";
  if (value === "corps" || value === "pdc" || value === "poids du corps" || value === "poids de corps") return "corps";
  return value;
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

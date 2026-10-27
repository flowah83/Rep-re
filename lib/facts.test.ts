import { describe, expect, it } from "vitest";
import { FACTS, factBody, factForDate, factKind } from "./facts";
import { addDays } from "./utils";

describe("le saviez-vous", () => {
  it("propose au moins 60 faits distincts", () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(FACTS).size).toBe(FACTS.length);
    expect(FACTS.some((fact) => factKind(fact) === "regle")).toBe(true);
    expect(FACTS.some((fact) => factKind(fact) === "source")).toBe(true);
    expect(FACTS.some((fact) => factKind(fact) === "proposition")).toBe(true);
    expect(factBody(FACTS.find((fact) => fact.includes("trois séances")) ?? "")).not.toMatch(/obligatoire pour tous|loi/);
    for (const fact of FACTS) {
      expect(fact.length).toBeGreaterThan(20);
      expect(fact).not.toMatch(/vous devriez|consultez|médicament|diagnos/i);
    }
  });

  it("change chaque jour et ne se répète qu’après un tour complet", () => {
    const start = "2026-01-01";
    const seen = new Set<string>();
    for (let index = 0; index < FACTS.length; index += 1) {
      seen.add(factForDate(addDays(start, index)));
    }
    expect(seen.size).toBe(FACTS.length);
    expect(factForDate(start)).not.toBe(factForDate(addDays(start, 1)));
    expect(factForDate(start)).toBe(factForDate(addDays(start, FACTS.length)));
    expect(factForDate(start, 1)).toBe(factForDate(addDays(start, 1)));
  });
});

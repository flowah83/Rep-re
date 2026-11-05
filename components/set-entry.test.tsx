import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
import { NumberPad, SetChips, StepperCard } from "./set-entry";
import { acceptPadDraft, chipOpensCorrection, keepPrompt, loggedPair, padConfirmLabel, padKeyAction, padKeys, shownLoad, shownReps, stepField, typePadKey, type FieldDraft } from "@/lib/set-entry";
import { stepFor } from "@/lib/session";
import type { ExerciseLog, SetLog } from "@/lib/types";

const planned = { loadKg: 80, reps: 6 };
const set = { loadKg: 80, reps: null as number | null };

describe("saisie d’une série", () => {
  it("garde la charge quand on change ensuite les répétitions", () => {
    let draft: FieldDraft = {};
    draft = { ...draft, loadKg: stepField(shownLoad(set, planned.loadKg, draft), -2, stepFor({ stepKg: 2.5, name: "Développé couché barre" })) };
    expect(loggedPair(set, planned, draft)).toEqual({ loadKg: 75, reps: 6 });
    draft = { ...draft, reps: stepField(shownReps(set, planned.reps, draft), -1, 1) };
    expect(loggedPair(set, planned, draft)).toEqual({ loadKg: 75, reps: 5 });
  });

  it("avance de 2,5 kg à la barre, de 1 kg aux haltères, et ne passe pas sous 0", () => {
    expect(stepField(80, 1, stepFor({ stepKg: 2.5, name: "Squat barre" }))).toBe(82.5);
    expect(stepField(20, 1, stepFor({ stepKg: 1, unit: "kg/main", name: "Élévations haltères" }))).toBe(21);
    expect(stepField(0, -1, 2.5)).toBe(0);
    expect(stepField(1, -1, 2.5)).toBe(0);
  });

  it("revenir au plan remet la charge prévue", () => {
    const draft: FieldDraft = { loadKg: 75, reps: 5 };
    const back = { ...draft, loadKg: planned.loadKg ?? undefined };
    expect(loggedPair(set, planned, back)).toEqual({ loadKg: 80, reps: 5 });
    const html = renderToStaticMarkup(
      <StepperCard
        kind="load"
        label="Charge"
        value={75}
        planned={80}
        unit="kg · barre"
        stepLabel="± 2,5 kg"
        onStep={() => undefined}
        onOpen={() => undefined}
        onRevert={() => undefined}
      />,
    );
    expect(html).toContain("Revenir à 80");
    expect(html).toContain("−5 kg par rapport au plan");
    expect(html).toContain("data-testid=\"as-planned\"");
  });

  it("ouvre la correction depuis une pastille déjà faite", () => {
    const done: SetLog = { id: "a", loadKg: 77.5, reps: 5, rpe: null, warmup: false, done: true };
    const open: SetLog = { id: "b", loadKg: 80, reps: null, rpe: null, warmup: false, done: false };
    expect(chipOpensCorrection(done)).toBe(true);
    expect(chipOpensCorrection(open)).toBe(false);
    const exercise: ExerciseLog = {
      id: "e",
      name: "Développé couché barre",
      pattern: "hpush",
      stepKg: 2.5,
      cues: [],
      muscles: [],
      planned: { sets: 2, reps: 6, loadKg: 80, restSec: 120, rpe: 8 },
      sets: [done, open],
    };
    const html = renderToStaticMarkup(<SetChips exercise={exercise} currentId="b" onCorrect={() => undefined} />);
    expect(html).toContain("Corriger Série 1");
    expect(html).toContain("en cours");
    expect(html).toContain("set-chip-a");
  });

  it("garde la charge suivante avec le libellé du matériel", () => {
    const exercise: ExerciseLog = {
      id: "e",
      name: "Écarté poulie",
      pattern: "hpush",
      stepKg: 2.5,
      cues: [],
      muscles: [],
      unit: "kg",
      planned: { sets: 3, reps: 12, loadKg: 15, restSec: 90, rpe: 8 },
      sets: [
        { id: "a", loadKg: 15, reps: 12, rpe: null, warmup: false, done: true },
        { id: "b", loadKg: 15, reps: null, rpe: null, warmup: false, done: false },
      ],
    };
    expect(keepPrompt(exercise, "a", 12.5, { label: "kg · poulie" })).toBe("Garder 12,5 kg · poulie pour les séries suivantes ?");
    expect(exercise.sets[1].loadKg).toBe(15);
    expect(exercise.unit).toBe("kg");
  });

  it("refuse un pavé au-dessus de 1 000 et les répétitions à virgule", () => {
    expect(acceptPadDraft("82,5")).toEqual({ action: "apply", value: 82.5 });
    expect(acceptPadDraft("1000")).toEqual({ action: "apply", value: 1000 });
    expect(acceptPadDraft("1001")).toEqual({ action: "reject", message: "1 000 est le maximum." });
    expect(acceptPadDraft("1000,5")).toEqual({ action: "reject", message: "1 000 est le maximum." });
    expect(acceptPadDraft("12,")).toEqual({ action: "reject", message: "Ce n’est pas un nombre." });
    expect(acceptPadDraft("")).toEqual({ action: "dismiss" });
    expect(acceptPadDraft("6", { integer: true })).toEqual({ action: "apply", value: 6 });
    expect(acceptPadDraft("6,5", { integer: true })).toEqual({ action: "reject", message: "Il faut un nombre entier." });
    expect(typePadKey("6", ",", true)).toBe("6");
    expect(typePadKey("8", "2", false)).toBe("82");
    expect(typePadKey("82,5", "⌫", false)).toBe("82,");
    expect(padKeys(true)).not.toContain(",");
    expect(padKeys(false)).toContain(",");
    expect(padConfirmLabel("6", "répétitions")).toBe("Valider · 6 répétitions");
    expect(padConfirmLabel("", "kg · barre")).toBe("Valider · 0 kg · barre");
    expect(padKeyAction("Escape", false, 2, 8)).toBe("close");
    expect(padKeyAction("Tab", false, 7, 8)).toBe(0);
    expect(padKeyAction("Tab", true, 0, 8)).toBe(7);
    expect(padKeyAction("Tab", false, -1, 8)).toBe(0);
    expect(padKeyAction("Tab", false, 2, 8)).toBe("default");
    const reps = renderToStaticMarkup(
      <NumberPad title="Répétitions" hint="Pas de 1" value="6" unit="répétitions" step={1} integer onChange={() => undefined} onClose={() => undefined} />,
    );
    expect(reps).toContain("number-pad-scrim");
    expect(reps).toContain("Valider · 6 répétitions");
    expect(reps).not.toContain("OK ·");
    expect(reps).not.toContain(">,<");
    const load = renderToStaticMarkup(
      <NumberPad title="Charge" hint="Pas de 2,5 kg" value="82,5" unit="kg · barre" step={2.5} onChange={() => undefined} onClose={() => undefined} />,
    );
    expect(load).toContain("Valider · 82,5 kg · barre");
    expect(load).toContain(">,<");
    for (const unit of ["kg · barre", "kg par haltère", "kg · poulie", "kg · machine"]) {
      const html = renderToStaticMarkup(
        <NumberPad title="Charge" hint="Pas" value="15" unit={unit} step={2.5} onChange={() => undefined} onClose={() => undefined} />,
      );
      expect(html).toContain(`Valider · 15 ${unit}`);
    }
  });

  it("garde un écart cuivré lisible en clair et en sombre", () => {
    const light = vars(css, ":root,\nhtml.light");
    const dark = vars(css, "html.dark");
    expect(ratio(light["--copper"], light["--bg-elev"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark["--copper"], dark["--bg-elev"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light["--ink"], light["--bg"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark["--ink"], dark["--bg"])).toBeGreaterThanOrEqual(4.5);
  });
});

function vars(source: string, header: string): Record<string, string> {
  const start = source.indexOf(header);
  const body = source.slice(start, source.indexOf("}", start));
  const found: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) found[match[1]] = match[2].trim();
  return found;
}

function ratio(ink: string, background: string): number {
  const lighter = Math.max(luma(ink), luma(background));
  const darker = Math.min(luma(ink), luma(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luma(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

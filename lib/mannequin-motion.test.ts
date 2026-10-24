import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motionForExercise, muscleRoles } from "./mannequin-motion";
import type { Pattern } from "./types";

function namesOf(file: string): string[] {
  const data = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as {
    seances: { exercices?: { nom: string }[] }[];
  };
  return [...new Set(data.seances.flatMap((session) => (session.exercices ?? []).map((exercise) => exercise.nom)))];
}

describe("mouvements du mannequin", () => {
  it("sépare les trois gestes validés", () => {
    expect(motionForExercise("Squat barre", "squat").id).toBe("squat");
    expect(motionForExercise("Développé couché barre", "hpush").id).toBe("bench");
    expect(motionForExercise("Tractions", "vpull").id).toBe("pullup");
    expect(motionForExercise("Tirage vertical", "vpull").id).toBe("pulldown");
    expect(motionForExercise("dc", "hpush").id).toBe("bench");
    expect(motionForExercise("Back squat", "squat").id).toBe("squat");
  });

  it("donne un geste propre à chaque nom de l’historique et du plan", () => {
    const names = [...namesOf("../fixtures/historique.json"), ...namesOf("../fixtures/plan.json")];
    const quiet = names.filter((name) => motionForExercise(name, "hpush").fallback === "quiet").sort((a, b) => a.localeCompare(b, "fr"));
    const pattern = names.filter((name) => motionForExercise(name, "hinge").fallback === "pattern");
    expect(quiet).toEqual([
      "Course à pied facile",
      "Course à pied Z2",
      "Lignes droites",
      "Mini-WOD AMRAP (option)",
      "Natation facile",
    ]);
    expect(pattern).toEqual([]);
  });

  it("ne confond pas les variantes qui se ressemblent", () => {
    expect(motionForExercise("Leg curl", "hinge").id).toBe("legcurl");
    expect(motionForExercise("Ischios machine (flexion des jambes)", "hinge").id).toBe("legcurl");
    expect(motionForExercise("Hip thrust machine", "hinge").id).toBe("hipthrust");
    expect(motionForExercise("Split squat bulgare", "lunge").id).toBe("split");
    expect(motionForExercise("Fentes bulgares haltères", "lunge").id).toBe("split");
    expect(motionForExercise("Fente statique", "lunge").id).toBe("lunge");
    expect(motionForExercise("Développé incliné barre", "hpush")).toMatchObject({ id: "incline", tool: "bar" });
    expect(motionForExercise("Développé incliné haltères", "hpush")).toMatchObject({ id: "incline", tool: "dumbbell" });
    expect(motionForExercise("Extension triceps corde", "tricep").id).toBe("pushdown");
    expect(motionForExercise("Extension triceps corde au-dessus tête", "tricep")).toMatchObject({ id: "overhead-ext", tool: "cable" });
    expect(motionForExercise("Extension triceps haltère au-dessus tête", "tricep").id).toBe("overhead-ext");
    expect(motionForExercise("Curl incliné haltères", "curl").id).toBe("incline-curl");
    expect(motionForExercise("Curl poulie", "curl")).toMatchObject({ id: "curl", tool: "cable" });
    expect(motionForExercise("Oiseau haltères poitrine appuyée", "lateral").id).toBe("reverse-fly");
    expect(motionForExercise("Row poitrine appuyée machine", "hpull").id).toBe("chest-row");
    expect(motionForExercise("Row poulie assis", "hpull").id).toBe("seated-row");
    expect(motionForExercise("Rowing machine", "hpull").id).toBe("seated-row");
    expect(motionForExercise("Rowing", "hpull").id).toBe("row");
    expect(motionForExercise("Crunch poulie", "core").id).toBe("crunch");
    expect(motionForExercise("Dead bug", "core").id).toBe("deadbug");
    expect(motionForExercise("Mollets à la presse à cuisses", "calf").id).toBe("calf-press");
    expect(motionForExercise("Mollets machine", "calf").id).toBe("calf");
    expect(motionForExercise("Soulevé de terre", "hinge").id).toBe("deadlift");
    expect(motionForExercise("Soulevé de terre roumain", "hinge").id).toBe("rdl");
  });

  it("retombe sur la famille seulement pour un nom inconnu", () => {
    expect(motionForExercise("Geste maison", "hpull")).toMatchObject({ id: "row", fallback: "pattern" });
    expect(motionForExercise("Pompes", "hpush" satisfies Pattern).fallback).toBe("pattern");
  });

  it("marque le premier muscle plus fort que les autres", () => {
    expect(muscleRoles(["quadriceps", "fessiers"])).toEqual({ primary: [4], secondary: [5] });
    expect(muscleRoles(["dos", "biceps"])).toEqual({ primary: [3, 9], secondary: [6] });
  });
});

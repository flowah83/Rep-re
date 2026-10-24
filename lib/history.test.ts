import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeImportToken, encodeGzip, encodeText } from "./codec";
import { bestLoads, muscleTotals, samplesForExercise, tonnage } from "./calc";
import { explainMatch, resolveExercise } from "./exercises";
import { compareSessionsNewestFirst, groupSessionsNewestWeekFirst, groupSessionsSoonestWeekFirst, historySignature, importSummary, parseImport, previewImport, splitCarnet, withoutDuplicates } from "./history";

const historyFile = readFileSync(new URL("../fixtures/historique.json", import.meta.url), "utf8");
const planFile = readFileSync(new URL("../fixtures/plan.json", import.meta.url), "utf8");

function namesOf(raw: string): string[] {
  const data = JSON.parse(raw) as { seances: { exercices?: { nom: string }[] }[] };
  return [...new Set(data.seances.flatMap((session) => (session.exercices ?? []).map((exercise) => exercise.nom)))];
}

describe("rapprochement des noms", () => {
  it("ne confond plus les noms qui se recouvrent", () => {
    expect(resolveExercise("Leg curl").name).toBe("Leg curl");
    expect(resolveExercise("Curl incliné haltères").name).toBe("Curl incliné haltères");
    expect(resolveExercise("Split squat bulgare").name).toBe("Split squat bulgare");
    expect(resolveExercise("Leg curl").matched).toBe(false);
    expect(resolveExercise("Curl incliné haltères").catalogId).toBeNull();
    expect(resolveExercise("Split squat bulgare").catalogId).toBeNull();
  });

  it("reconnaît le catalogue, les synonymes et les accents", () => {
    expect(resolveExercise("Développé couché barre").name).toBe("Développé couché barre");
    expect(resolveExercise("dc").name).toBe("Développé couché barre");
    expect(resolveExercise("bench").name).toBe("Développé couché barre");
    expect(resolveExercise("Back squat").name).toBe("Squat barre");
    expect(resolveExercise("Romanian deadlift").name).toBe("Soulevé de terre roumain");
    expect(resolveExercise("Élévations latérales").muscles).toContain("epaules");
  });

  it("liste les rapprochements douteux des deux fichiers, sans les accepter", () => {
    const doubtful = new Set<string>();
    for (const name of [...namesOf(historyFile), ...namesOf(planFile)]) {
      const match = explainMatch(name);
      if (match.matched && match.via === "tokens") {
        throw new Error(`Rapprochement flou accepté : ${name} → ${match.name} (${match.score})`);
      }
      if (!match.matched && match.doubtful) doubtful.add(`${name} → ${match.near} (${match.score.toFixed(2)})`);
    }
    expect([...doubtful].sort((a, b) => a.localeCompare(b, "fr"))).toEqual([
      "Crunch poulie → Écarté poulie (0.50)",
      "Curl incliné haltères → Curl haltères (0.80)",
      "Curl marteau haltères → Curl haltères (0.80)",
      "Curl poulie → Écarté poulie (0.50)",
      "Développé incliné barre → Développé couché barre (0.67)",
      "Extension triceps corde → Extension triceps poulie (0.67)",
      "Extension triceps corde au-dessus tête → Extension triceps poulie (0.50)",
      "Extension triceps haltère au-dessus tête → Extension triceps poulie (0.50)",
      "Fente statique → Fentes haltères (0.50)",
      "Fentes bulgares haltères → Fentes haltères (0.80)",
      "Leg curl → Curl haltères (0.50)",
      "Mollets à la presse à cuisses → Presse à cuisses (0.80)",
      "Mollets machine → Mollets debout (0.50)",
      "Oiseau haltères poitrine appuyée → Oiseau haltères (0.67)",
      "Oiseau poulie → Écarté poulie (0.50)",
      "Row poulie assis → Écarté poulie (0.40)",
      "Rowing → Rowing barre (0.67)",
      "Rowing machine → Rowing barre (0.50)",
      "Split squat bulgare → Squat barre (0.40)",
      "Tirage vertical prise neutre → Tirage vertical (0.67)",
      "Tirage vertical prise non précisée → Tirage vertical (0.57)",
      "Tirage vertical prise serrée → Tirage vertical (0.67)",
    ]);
  });
});

describe("historique réel", () => {
  const parsed = parseImport(historyFile, []);
  if ("error" in parsed || parsed.kind !== "history") throw new Error("error" in parsed ? parsed.error : "mauvais type");

  it("lit les 37 séances terminées", () => {
    expect(parsed.sessions).toHaveLength(37);
    expect(parsed.sessions.every((session) => session.status === "done")).toBe(true);
    const preview = previewImport(parsed, []);
    expect(importSummary(preview)[0].startsWith("37 séances")).toBe(true);
  });

  it("garde les valeurs nulles et le détail inconnu", () => {
    const squat = parsed.sessions
      .flatMap((session) => session.exercises)
      .find((exercise) => exercise.name === "Squat barre" && exercise.sets.some((set) => set.loadKg == null && set.reps === 5));
    expect(squat?.sets[0].loadKg).toBeNull();
    expect(squat?.sets[0].loadKg).not.toBe(0);
    const unknown = parsed.sessions.flatMap((session) => session.exercises).filter((exercise) => exercise.detailUnknown);
    expect(unknown).toHaveLength(3);
    expect(unknown.every((exercise) => exercise.sets.length === 0)).toBe(true);
  });

  it("compte une charge par main deux fois, et laisse le cardio hors des records", () => {
    const split = parsed.sessions
      .flatMap((session) => session.exercises)
      .find((exercise) => exercise.name === "Split squat bulgare" && exercise.sets[0]?.loadKg === 8);
    expect(split?.unit).toBe("kg/main");
    expect(split && tonnage([split])).toBe(8 * 7 * 2 + 8 * 6 * 2 + 6 * 7 * 2);
    const cardio = parsed.sessions.filter((session) => session.cardio);
    expect(cardio).toHaveLength(14);
    expect(bestLoads(cardio)).toEqual([]);
    expect(muscleTotals(cardio, "2026-07-01", "2026-10-31").quadriceps).toBe(0);
    expect(samplesForExercise(parsed.sessions, "Squat barre").some((sample) => sample.loadKg === 0)).toBe(false);
    expect(samplesForExercise(parsed.sessions, "Squat barre").length).toBeGreaterThan(0);
  });

  it("n’ajoute pas deux fois le même fichier", () => {
    const again = parseImport(historyFile, parsed.customs);
    if ("error" in again || again.kind !== "history") throw new Error("relecture");
    const preview = previewImport(again, parsed.sessions);
    expect(preview.toAdd).toHaveLength(0);
    expect(preview.duplicates).toBe(37);
    const doubled = withoutDuplicates([], [...parsed.sessions, ...parsed.sessions]);
    expect(doubled.added).toHaveLength(37);
    expect(doubled.duplicates).toBe(37);
    expect(historySignature(parsed.sessions[0])).toBe(historySignature(again.sessions[0]));
  });
});

describe("plan des deux semaines", () => {
  it("importe 14 séances, course et natation comprises", () => {
    const parsed = parseImport(planFile, []);
    if ("error" in parsed || parsed.kind !== "plan") throw new Error("error" in parsed ? parsed.error : "mauvais type");
    expect(parsed.sessions).toHaveLength(14);
    expect(parsed.sessions.every((session) => session.status === "planned")).toBe(true);
    const names = parsed.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name));
    expect(names).toContain("Course à pied Z2");
    expect(names).toContain("Natation facile");
    expect(names.filter((name) => name === "Course à pied Z2")).toHaveLength(3);
    const crunch = parsed.sessions.flatMap((session) => session.exercises).find((exercise) => exercise.name === "Crunch poulie");
    expect(crunch?.planned.loadKg).toBeNull();
    expect(importSummary(previewImport(parsed, []))[0].startsWith("14 séances")).toBe(true);
  });
});

describe("lien gzip", () => {
  it("fait l’aller-retour d’un historique compressé", async () => {
    const json = JSON.stringify({
      historique: [{ date: "2026-09-14", titre: "Poussée", exercices: [{ nom: "DC", series: [{ charge_kg: 80, repetitions: 6, rpe: 8 }] }] }],
    });
    const token = await encodeGzip(json);
    expect(token.startsWith("gz.")).toBe(true);
    expect(token).not.toMatch(/[+/=]/);
    expect(await decodeImportToken(token)).toBe(json);
    const parsed = parseImport(json, []);
    if ("error" in parsed || parsed.kind !== "history") throw new Error("parse");
    expect(parsed.sessions[0].exercises[0].name).toBe("Développé couché barre");
    expect(parsed.sessions[0].exercises[0].sets[0]).toMatchObject({ loadKg: 80, reps: 6, rpe: 8, done: true });
    expect(encodeText("ok")).not.toMatch(/[+/=]/);
  });

  it("met la séance et la semaine les plus récentes en tête du carnet", () => {
    const rows = [
      { date: "2026-07-06", time: "18:00" },
      { date: "2026-10-24", time: "09:00" },
      { date: "2026-10-22", time: "19:00" },
      { date: "2026-10-24", time: "18:30" },
      { date: "2026-09-02" },
    ];
    expect([...rows].sort(compareSessionsNewestFirst).map((row) => `${row.date} ${row.time ?? ""}`.trim())).toEqual([
      "2026-10-24 18:30",
      "2026-10-24 09:00",
      "2026-10-22 19:00",
      "2026-09-02",
      "2026-07-06 18:00",
    ]);
    const groups = groupSessionsNewestWeekFirst(rows);
    expect(groups.map((group) => group.week)).toEqual(["2026-10-19", "2026-08-31", "2026-07-06"]);
    expect(groups[0].sessions.map((row) => row.date)).toEqual(["2026-10-24", "2026-10-24", "2026-10-22"]);
  });

  it("range les prévues et les dates futures à part, du plus proche au plus lointain", () => {
    const today = "2026-10-24";
    const rows = [
      { id: "done-22", date: "2026-10-22", time: "19:00", status: "done" },
      { id: "done-morning", date: "2026-10-24", time: "09:00", status: "done" },
      { id: "active-today", date: "2026-10-24", time: "18:30", status: "active" },
      { id: "older", date: "2026-09-02", time: "18:00", status: "done" },
      { id: "overdue", date: "2026-10-20", time: "18:00", status: "planned" },
      { id: "today-plan", date: "2026-10-24", time: "18:15", status: "planned" },
      { id: "future-done", date: "2026-11-01", time: "10:00", status: "done" },
      { id: "nov-8", date: "2026-11-08", time: "18:00", status: "planned" },
      { id: "nov-6-late", date: "2026-11-06", time: "19:00", status: "planned" },
      { id: "nov-6", date: "2026-11-06", time: "07:00", status: "planned" },
    ];
    const { past, upcoming } = splitCarnet(rows, today);
    expect(past.map((row) => row.id)).toEqual(["active-today", "done-morning", "done-22", "older"]);
    expect(upcoming.map((row) => row.id)).toEqual(["overdue", "today-plan", "future-done", "nov-6", "nov-6-late", "nov-8"]);
    expect(groupSessionsNewestWeekFirst(past).map((group) => group.week)).toEqual(["2026-10-19", "2026-08-31"]);
    const ahead = groupSessionsSoonestWeekFirst(upcoming);
    expect(ahead.map((group) => group.week)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(ahead[0].sessions.map((row) => row.id)).toEqual(["overdue", "today-plan"]);
    expect(ahead[2].sessions.map((row) => row.id)).toEqual(["nov-6", "nov-6-late", "nov-8"]);
  });

  it("refuse un lien d’import trop gros", async () => {
    expect(await decodeImportToken(`gz.${"a".repeat(2_000_001)}`)).toBeNull();
  });

  it("compresse le fichier réel et le relit", async () => {
    const token = await encodeGzip(historyFile);
    const back = await decodeImportToken(token);
    expect(back).toBe(historyFile);
    expect(token.length).toBeLessThan(historyFile.length);
  });
});

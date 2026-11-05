import { describe, expect, it } from "vitest";
import { applyNotebookWrites, notebookWrites, type NotebookTx, type NotebookWrite } from "./notebook";
import { msUntilNextMidnight, rollDay } from "./utils";
import type { CustomExercise, Session } from "./types";

function session(id: string, title = id): Session {
  return {
    id,
    date: "2026-11-05",
    title,
    status: "planned",
    source: "manual",
    exercises: [],
  };
}

function custom(id: string, name: string): CustomExercise {
  return { id, name, pattern: "hpush", cues: [] };
}

describe("carnet du coach", () => {
  it("rassemble suppressions et ajouts dans une seule liste", () => {
    const previous = [session("a", "Poussée"), session("b", "Dos")];
    const next = [{ ...session("b", "Dos modifié") }, session("c", "Jambes")];
    const writes = notebookWrites(previous, next, [custom("x", "Curl")], [custom("x", "Curl haltères")]);
    expect(writes.map((write) => write.op)).toEqual(["delete-session", "put-session", "put-session", "put-custom"]);
    expect(writes[0]).toMatchObject({ id: "a" });
  });

  it("n’écrit rien si le carnet est identique", () => {
    const same = [session("a")];
    expect(notebookWrites(same, same, [], [])).toEqual([]);
  });

  it("annule toute la transaction si une écriture échoue", async () => {
    const writes = notebookWrites([session("a")], [session("b")], [], []);
    const applied: NotebookWrite[] = [];
    let committed = false;
    let aborted = false;
    const tx: NotebookTx = {
      async apply(write) {
        if (write.op === "put-session") throw new Error("disque");
        applied.push(write);
      },
      async commit() {
        committed = true;
      },
      async abort() {
        aborted = true;
        applied.length = 0;
      },
    };
    await expect(applyNotebookWrites(writes, tx)).rejects.toThrow("disque");
    expect(committed).toBe(false);
    expect(aborted).toBe(true);
    expect(applied).toEqual([]);
  });

  it("confirme seulement quand toutes les écritures ont réussi", async () => {
    const writes = notebookWrites([session("a")], [session("b")], [], []);
    const applied: string[] = [];
    const tx: NotebookTx = {
      async apply(write) {
        applied.push(write.op);
      },
      async commit() {
        applied.push("commit");
      },
      async abort() {
        applied.push("abort");
      },
    };
    await applyNotebookWrites(writes, tx);
    expect(applied).toEqual(["delete-session", "put-session", "commit"]);
  });
});

describe("minuit", () => {
  it("passe au jour suivant et suit le jour ouvert, pas un autre jour", () => {
    const after = new Date(2026, 10, 6, 0, 5);
    expect(rollDay("2026-11-05", after, "2026-11-05")).toEqual({ today: "2026-11-06", selectedDate: "2026-11-06" });
    expect(rollDay("2026-11-05", after, "2026-11-03")).toEqual({ today: "2026-11-06", selectedDate: "2026-11-03" });
    expect(rollDay("2026-11-05", new Date(2026, 10, 5, 23, 50), "2026-11-05")).toEqual({
      today: "2026-11-05",
      selectedDate: "2026-11-05",
    });
  });

  it("réveille l’application avant le prochain minuit local", () => {
    const wait = msUntilNextMidnight(new Date(2026, 10, 5, 23, 50));
    expect(wait).toBeGreaterThan(9 * 60 * 1000);
    expect(wait).toBeLessThan(11 * 60 * 1000);
  });
});

import { describe, expect, it } from "vitest";
import { dayRepere, installHelp, keepsake, PRESENTATION, shouldOfferInstall, weeklyCap } from "./identity";
import type { ExerciseLog, Session, SetLog } from "./types";

const BANNED = /bravo|félicit|record|tonnage|cycle|en retard|faute/i;

function set(partial: Partial<SetLog> & { id: string }): SetLog {
  return {
    id: partial.id,
    loadKg: partial.loadKg === undefined ? 80 : partial.loadKg,
    reps: partial.reps === undefined ? 6 : partial.reps,
    rpe: partial.rpe ?? 8,
    warmup: partial.warmup ?? false,
    done: partial.done ?? true,
    skipped: partial.skipped,
  };
}

function exercise(partial: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    id: partial.id ?? "ex",
    name: partial.name ?? "Développé couché barre",
    pattern: partial.pattern ?? "hpush",
    stepKg: 2.5,
    cues: [],
    muscles: partial.muscles ?? ["pectoraux"],
    planned: partial.planned ?? { sets: 3, reps: 6, loadKg: 80, restSec: 180, rpe: 8 },
    sets: partial.sets ?? [set({ id: "s" })],
  };
}

function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: partial.id ?? partial.date,
    date: partial.date,
    title: partial.title ?? "Poussée",
    status: partial.status ?? "done",
    source: partial.source ?? "manual",
    closed: partial.closed,
    time: partial.time,
    exercises: partial.exercises ?? [exercise()],
  };
}

describe("installation", () => {
  it("attend une séance réelle notée, une seule fois", () => {
    expect(shouldOfferInstall({ sessions: [], dismissed: false, standalone: false })).toBe(false);
    expect(shouldOfferInstall({ sessions: [session({ date: "2026-10-01", source: "demo" })], dismissed: false, standalone: false })).toBe(false);
    expect(shouldOfferInstall({ sessions: [session({ date: "2026-10-01", status: "planned" })], dismissed: false, standalone: false })).toBe(false);
    expect(shouldOfferInstall({ sessions: [session({ date: "2026-10-01", status: "active" })], dismissed: false, standalone: false })).toBe(false);
    const done = [session({ date: "2026-10-01", status: "done", closed: "partial" })];
    expect(shouldOfferInstall({ sessions: done, dismissed: false, standalone: false })).toBe(true);
    expect(shouldOfferInstall({ sessions: done, dismissed: true, standalone: false })).toBe(false);
    expect(shouldOfferInstall({ sessions: done, dismissed: false, standalone: true })).toBe(false);
  });

  it("donne le geste Safari sur iPhone, et un autre ailleurs", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(installHelp(iphone)).toMatch(/Partager, puis « Sur l’écran d’accueil »/);
    expect(installHelp(iphone.replace("Safari", "CriOS"))).not.toMatch(/Safari/);
    expect(installHelp("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile")).toMatch(/Installer l’application/);
  });
});

describe("moments", () => {
  it("pose le repère du jour dans la carte à lancer, pas sur un autre jour", () => {
    const prior = session({
      date: "2026-10-15",
      exercises: [exercise({ sets: [set({ id: "a", loadKg: 80, reps: 6 })] })],
    });
    const today = session({ id: "today", date: "2026-10-29", status: "planned", exercises: [exercise({ sets: [] })] });
    const later = session({ id: "later", date: "2026-10-30", status: "planned" });
    const live = dayRepere(today, [prior, today], "2026-10-29");
    expect(live?.kicker).toBe("Mon repère du jour");
    expect(live?.last).toMatch(/15 octobre/);
    expect(live?.last).toMatch(/80 kg × 6/);
    expect(live?.action).toBe("Commencer.");
    expect(dayRepere(later, [prior], "2026-10-29")).toBeNull();
    expect(dayRepere({ ...today, status: "active" }, [prior], "2026-10-29")?.action).toBe("Reprendre la séance.");
    expect(JSON.stringify(live)).not.toMatch(BANNED);
  });

  it("dit une séance partielle sans en faire une faute", () => {
    const partial = session({
      date: "2026-10-22",
      closed: "partial",
      exercises: [exercise({ sets: [set({ id: "a", done: true }), set({ id: "b", done: false })] })],
    });
    const today = session({ id: "today", date: "2026-10-29", status: "planned", exercises: [exercise({ sets: [] })] });
    const line = dayRepere(today, [partial], "2026-10-29");
    expect(line?.last).toMatch(/partielle/);
    expect(line?.last).not.toMatch(BANNED);
    const kept = keepsake(partial);
    expect(kept.title).toBe("Ce que je retiens");
    expect(kept.facts.join(" ")).toMatch(/partielle/);
    expect(kept.facts.join(" ")).toMatch(/compte/);
    expect(kept.facts.join(" ")).not.toMatch(BANNED);
  });

  it("résume la semaine et propose une seule suite", () => {
    const empty = weeklyCap([], "2026-10-29");
    expect(empty.title).toBe("Mon cap");
    expect(empty.synthesis).toMatch(/repos/);
    expect(empty.proposal).toMatch(/Rien d’autre/);
    const week = weeklyCap(
      [
        session({ date: "2026-10-26", closed: "full" }),
        session({ date: "2026-10-27", closed: "partial", id: "p" }),
        session({ date: "2026-10-30", status: "planned", id: "next", title: "Dos", time: "18:00" }),
      ],
      "2026-10-29",
    );
    expect(week.synthesis).toMatch(/2 séances notées/);
    expect(week.synthesis).toMatch(/partielle/);
    expect(week.proposal).toBe("La prochaine est Dos, vendredi.");
    expect(`${week.synthesis} ${week.proposal}`).not.toMatch(BANNED);
    expect(PRESENTATION).toBe("Retrouvez vos charges. Notez votre séance. Voyez ce qui progresse.");
  });
});

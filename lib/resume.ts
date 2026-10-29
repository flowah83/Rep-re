import { unitOfExercise, unitPhrase } from "./display";
import { firstOpenSlot, setSettled } from "./session";
import type { Session } from "./types";
import { formatKg } from "./utils";

export type ResumeDot = "done" | "now" | "todo";

export type ResumeGlance = {
  sinceMin: number | null;
  status: string;
  nextLine: string | null;
  target: string | null;
  noted: number;
  total: number;
  saved: string;
  dots: ResumeDot[];
  after: string | null;
};

/** Ce que la carte « Reprendre la séance » affiche, sans second bouton Reprendre. */
export function resumeGlance(session: Session, now = Date.now()): ResumeGlance {
  const flat = session.exercises.flatMap((exercise) => exercise.sets);
  const noted = flat.filter((set) => set.done).length;
  const total = flat.length;
  const open = firstOpenSlot(session);
  let sinceMin: number | null = null;
  if (session.startedAt) {
    const ms = now - Date.parse(session.startedAt);
    if (Number.isFinite(ms)) sinceMin = Math.max(0, Math.round(ms / 60000));
  }
  const status = sinceMin == null ? "En cours" : sinceMin < 1 ? "En cours · depuis moins d’une minute" : `En cours · depuis ${sinceMin} min`;
  const dots: ResumeDot[] = flat.map((set) => {
    if (setSettled(set)) return "done";
    if (open && set.id === open.set.id) return "now";
    return "todo";
  });
  if (!open) {
    return {
      sinceMin,
      status,
      nextLine: "Toutes les séries sont notées.",
      target: null,
      noted,
      total,
      saved: savedLine(noted, total),
      dots,
      after: null,
    };
  }
  const work = open.exercise.sets.filter((set) => !set.warmup);
  const workIndex = Math.max(1, work.findIndex((set) => set.id === open.set.id) + 1);
  const series = open.set.warmup ? "échauffement" : `série ${workIndex} sur ${Math.max(work.length, 1)}`;
  const load = open.set.loadKg ?? open.exercise.planned.loadKg;
  const reps = open.set.reps ?? open.exercise.planned.reps;
  const unit = unitPhrase(unitOfExercise(open.exercise));
  const target = load != null && reps != null ? `${formatKg(load)} ${unit} × ${reps} visés` : null;
  const index = session.exercises.findIndex((exercise) => exercise.id === open.exercise.id);
  const following = session.exercises[index + 1];
  const after = following
    ? `${following.name} · ${following.planned.sets} × ${following.planned.reps ?? "—"}`
    : null;
  return {
    sinceMin,
    status,
    nextLine: `Ensuite : ${open.exercise.name.toLowerCase()}, ${series}`,
    target,
    noted,
    total,
    saved: savedLine(noted, total),
    dots,
    after,
  };
}

function savedLine(noted: number, total: number): string {
  const series = noted <= 1 ? `${noted} série notée` : `${noted} séries notées`;
  return `${series} sur ${total}. Tout est déjà enregistré.`;
}

"use client";

import { Fragment } from "react";
import { useApp } from "@/components/app-context";
import { estimateMinutes, runFacts, seriesWord, unitOfExercise, unitPhrase } from "@/lib/display";
import { cardioSummary } from "@/lib/history";
import { StartActions } from "@/components/start-actions";
import { buildAdjustments, keepsCoachPlan, loadProgression, type Adjustment } from "@/lib/progression";
import type { ExerciseLog, Session } from "@/lib/types";
import { formatKg, formatLong, formatRestLabel } from "@/lib/utils";

export function PreviewScreen({ id }: { id: string }) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  if (!session) return null;
  const minutes = estimateMinutes(session);
  const held = planIsHeld(session);
  const adjustments = adjustmentsFor(session, app.sessions);
  const runLike =
    session.exercises.length > 0 &&
    session.exercises.every((exercise) => exercise.planned.loadKg == null && exercise.planned.reps == null && exercise.planned.restSec === 0);
  const willApply =
    !held && session.status === "planned" && session.exercises.some((exercise) => suggestionLoad(exercise.planned.loadKg, adjustments.get(exercise.id)) != null);

  return (
    <div className="overlay">
      <div className="overlay-in preview-screen" data-screen="preview">
        <div className="preview-top">
          <button type="button" className="navline" data-testid="close-preview" onClick={() => app.closeOverlay()}>
            ‹ Retour
          </button>
        </div>
        <div className="preview-body">
          <p className="eyebrow">Aperçu</p>
          <h1>{session.title}</h1>
          <p className="meta">
            {formatLong(session.date)}
            {session.time ? ` · ${session.time}` : ""}
            {` · environ ${minutes} min`}
          </p>
          {session.intention ? <p className="meta">{capitalize(session.intention)}</p> : null}
          {session.coachNote?.trim() ? (
            <div className="holdnote">
              <p>
                <b>Note de Chef sport.</b>
              </p>
              <p>{session.coachNote.trim()}</p>
            </div>
          ) : null}
          <p className="fine">Vous lisez le plan. Rien n’est modifié tant que vous ne commencez pas.</p>
          {willApply ? <p className="fine">Le choix se fait en bas : une charge pour toute la séance, ou le plan.</p> : null}
          {session.cardio || runLike ? (
            <section className="preview-ex">
              <h2>{session.cardio?.sport ?? session.exercises[0]?.name ?? "Course"}</h2>
              <RunDetails session={session} />
              {runLike
                ? session.exercises.map((exercise) => (
                    <Fragment key={exercise.id}>
                      {exercise.planned.rpe != null ? <p className="num">RPE visé {formatKg(exercise.planned.rpe)}</p> : null}
                      {exercise.note?.trim() ? <p className="preview-warn">{exercise.note.trim()}</p> : null}
                    </Fragment>
                  ))
                : null}
            </section>
          ) : null}
          {runLike
            ? null
            : session.exercises.map((exercise, index) => (
                <ExerciseRow key={exercise.id} index={index + 1} exercise={exercise} adjustment={adjustments.get(exercise.id)} held={held} />
              ))}
        </div>
        <div className="preview-foot">
          <StartActions session={session} place="preview" primary />
        </div>
      </div>
    </div>
  );
}

function ExerciseRow({
  index,
  exercise,
  adjustment,
  held,
}: {
  index: number;
  exercise: ExerciseLog;
  adjustment?: Adjustment;
  held: boolean;
}) {
  const unit = unitPhrase(unitOfExercise(exercise));
  const planLoad = exercise.planned.loadKg;
  const suggested = suggestionLoad(planLoad, adjustment);
  const warmups = exercise.sets.filter((set) => set.warmup).length;
  const work = exercise.planned.sets;
  const reps = exercise.planned.reps;
  const bare = planLoad == null && reps == null && exercise.planned.restSec === 0;
  return (
    <section className="preview-ex">
      <h2>
        <span className="num">{index}.</span> {exercise.name}
      </h2>
      {exercise.detailUnknown ? (
        <p>Séries non détaillées.</p>
      ) : bare ? null : (
        <p className="num">
          {warmups > 0 ? `${warmups === 1 ? "1 échauffement" : `${warmups} échauffements`}, puis ` : ""}
          {reps != null ? `${work} × ${reps}` : seriesWord(work)}
        </p>
      )}
      {planLoad != null ? (
        <p>
          <span className="preview-k">Plan</span> <b className="num">{formatKg(planLoad)} {unit}</b>
        </p>
      ) : null}
      {suggested != null ? (
        <p>
          <span className="preview-k">{held ? "Suggestion non retenue" : "Suggestion"}</span>{" "}
          <b className="num">{formatKg(suggested)} {unit}</b>
        </p>
      ) : null}
      {exercise.planned.restSec > 0 ? <p className="num">Repos {formatRestLabel(exercise.planned.restSec)}</p> : null}
      {exercise.planned.rpe != null ? <p className="num">RPE visé {formatKg(exercise.planned.rpe)}</p> : null}
      {exercise.note?.trim() ? <p className="preview-warn">{exercise.note.trim()}</p> : null}
    </section>
  );
}

function RunDetails({ session }: { session: Session }) {
  const facts = runFacts(session);
  if (!facts.duration && !facts.distance && !facts.pace) {
    return session.cardio ? <p>{cardioSummary(session.cardio)}</p> : null;
  }
  return (
    <>
      {facts.distance ? (
        <p>
          <span className="preview-k">Distance</span> <b className="num">{facts.distance}</b>
        </p>
      ) : null}
      {facts.duration ? (
        <p>
          <span className="preview-k">Durée</span> <b className="num">{facts.duration}</b>
        </p>
      ) : null}
      {facts.pace ? (
        <p>
          <span className="preview-k">Allure</span> <b className="num">{facts.pace}</b>
        </p>
      ) : null}
    </>
  );
}

function suggestionLoad(plan: number | null, adjustment?: Adjustment): number | null {
  if (!adjustment || adjustment.toLoadKg == null) return null;
  const target = adjustment.toLoadKg;
  const base = plan ?? adjustment.fromLoadKg;
  if (base != null && Math.abs(base - target) < 0.011) return null;
  return target;
}

function adjustmentsFor(session: Session, sessions: Session[]): Map<string, Adjustment> {
  const saved = loadProgression(session.id);
  const items = saved?.items?.length ? saved.items : buildAdjustments(session, sessions);
  return new Map(items.map((item) => [item.exerciseId, item]));
}

function planIsHeld(session: Session): boolean {
  const saved = loadProgression(session.id);
  if (saved?.mode === "hold" || saved?.choice === "reverted" || saved?.choice === "ignored") return true;
  if (saved?.mode === "applied") return false;
  return keepsCoachPlan(session);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

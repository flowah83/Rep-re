"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { appendCoachNotices } from "@/lib/coach";
import { markCoachNoticesSent, pendingCoachNoticeLines } from "@/lib/coach-store";
import { cardioSummary } from "@/lib/history";
import { compareExercise, comparisonPriors, formatPerformedSet, reportJson, sessionEffort, summaryText, versus, type CompareKind } from "@/lib/session";
import { formatDuration, formatLong } from "@/lib/utils";

export function BilanScreen({ id }: { id: string }) {
  const app = useApp();
  const [, refreshNotices] = useState(0);
  const session = app.sessions.find((item) => item.id === id);
  const fresh = app.overlay?.kind === "bilan" && app.overlay.fresh === true;
  if (!session) return null;
  const prior = comparisonPriors(app.sessions, session);
  const rows = session.exercises.map((exercise) => ({ exercise, ...compareExercise(exercise, prior) }));
  const text = appendCoachNotices(summaryText(session, prior), pendingCoachNoticeLines());
  const effort = sessionEffort(session);
  const minutes = effort.minutes != null ? formatDuration(effort.minutes * 60000) : "—";

  const share = async () => {
    const fresh = appendCoachNotices(summaryText(session, prior), pendingCoachNoticeLines());
    const file = new File([JSON.stringify(reportJson(session), null, 2)], `repere-${session.date}.json`, { type: "application/json" });
    try {
      if (navigator.share) {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: `Repère — ${session.title}`, text: fresh, files: [file] });
        else await navigator.share({ title: `Repère — ${session.title}`, text: fresh });
        markCoachNoticesSent();
        refreshNotices((value) => value + 1);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(fresh);
      markCoachNoticesSent();
      refreshNotices((value) => value + 1);
      app.flash("Texte copié. Vous pouvez le coller à Chef sport.");
    } catch {
      app.flash("Le partage n’est pas disponible sur cet appareil. Le texte reste affiché pour le copier.");
    }
  };

  return (
    <div className="overlay">
      <div className="overlay-in pad-screen bilan" data-screen="bilan">
        <button type="button" className="navline" data-testid="close-bilan" onClick={app.closeOverlay}>
          ‹ Retour
        </button>
        {fresh ? (
          <div className="check" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M5 11.5 9 15.5 17 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : null}
        <h1>{fresh ? "C’est noté." : session.title}</h1>
        <p className="sub">
          {formatLong(session.date)}
          {fresh ? ` · ${session.title}` : ""}
        </p>
        {effort.partial ? (
          <p className="partial" data-testid="bilan-partial">
            Séance partielle. Elle n’est pas comptée comme une séance complète.
          </p>
        ) : null}
        <div className="stats">
          <div className="stat">
            <b className="num">{minutes}</b>
            <span>durée</span>
          </div>
          <div className="stat">
            <b className="num">{effort.done}</b>
            <span>{effort.done <= 1 ? "série dure" : "séries dures"}</span>
          </div>
          <div className="stat">
            <b className="num">{effort.left}</b>
            <span>{effort.left <= 1 ? "laissée" : "laissées"}</span>
          </div>
        </div>
        {session.cardio ? (
          <div className="compare">
            <h3>{session.cardio.sport}</h3>
            <p>{cardioSummary(session.cardio)}</p>
          </div>
        ) : null}
        {session.exercises.some((exercise) => exercise.detailUnknown || exercise.unit || exercise.sets.some((set) => set.unit || set.rir != null || set.side)) ? (
          <div className="compare">
            <h3>Séries notées</h3>
            {session.exercises.map((exercise) => (
              <div className="cmp" key={exercise.id}>
                <div className="r1">
                  <b>{exercise.name}</b>
                </div>
                <p>
                  {exercise.detailUnknown
                    ? "séries non détaillées"
                    : exercise.sets.filter((set) => set.done && !set.warmup).map((set) => formatPerformedSet(set, exercise.unit, exercise.name)).join(", ") || "séries non détaillées"}
                </p>
              </div>
            ))}
            {session.exercises.some((exercise) => exercise.unit === "kg/main" || exercise.sets.some((set) => set.unit === "kg/main")) ? (
              <p className="fine">Une charge en kg/main est celle d’une seule main. Les kilos déplacés comptent les deux.</p>
            ) : null}
          </div>
        ) : null}
        {session.cardio || rows.length === 0 ? null : (
        <div className="compare" data-testid="bilan-versus">
          <h3>Prévu et réalisé</h3>
          {rows.map((row) => {
            const sides = versus(row.exercise);
            return (
              <div className="cmp" key={row.exercise.id}>
                <div className="r1">
                  <b>{row.exercise.name}</b>
                  <Badge kind={row.kind} />
                </div>
                <div className="vs">
                  <div>
                    <div className="k">Prévu</div>
                    <div className="v num">{sides.plannedLoad}</div>
                    <div className="s">{sides.plannedSets}</div>
                  </div>
                  <div>
                    <div className="k">Réalisé</div>
                    <div className="v num">{sides.doneLoad}</div>
                    <div className="s">{sides.doneDetail}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        <label className="fieldlabel" htmlFor="coach-note">
          Mot pour Chef sport
        </label>
        <textarea
          id="coach-note"
          className="area"
          value={session.noteForCoach ?? ""}
          placeholder="Facultatif. Seulement si vous voulez lui dire quelque chose."
          onChange={(event) =>
            void app.updateSession(session.id, (current) => ({ ...current, noteForCoach: event.target.value }))
          }
        />
        <label className="fieldlabel" htmlFor="me-note">
          Note pour vous
        </label>
        <textarea
          id="me-note"
          className="area"
          value={session.noteForMe ?? ""}
          placeholder="Elle reste ici. Elle n’est pas dans le message."
          onChange={(event) => void app.updateSession(session.id, (current) => ({ ...current, noteForMe: event.target.value }))}
        />
        <div className="letter">
          <div className="who">Texte à envoyer</div>
          <pre>{text}</pre>
        </div>
        <p className="fine">Relisez ce texte. Rien ne part tant que vous n’appuyez pas sur le bouton.</p>
        <button type="button" className="btn" data-testid="share-coach" onClick={() => void share()}>
          Envoyer à Chef sport
        </button>
        <button type="button" className="btn ghost" data-testid="keep-local" onClick={app.closeOverlay}>
          Garder seulement ici
        </button>
        <button type="button" className="btn ghost" onClick={() => app.openSession(session.id)}>
          Corriger une série
        </button>
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: CompareKind }) {
  const map: Record<CompareKind, [string, string]> = {
    tenu: ["ok", "Tenu"],
    presque: ["mid", "Presque"],
    "au-dessus": ["mid", "Au-dessus"],
    "charge-inedite": ["pr", "Charge inédite"],
    "en-dessous": ["mid", "En dessous"],
    vide: ["mid", "Pas fait"],
  };
  const [tone, label] = map[kind];
  return <span className={`badge ${tone}`}>{label}</span>;
}

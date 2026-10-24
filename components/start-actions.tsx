"use client";

import { useApp } from "@/components/app-context";
import { programPreview, startOffer } from "@/lib/progression";
import type { Session } from "@/lib/types";

export function StartActions({
  session,
  place,
  primary = false,
  allowEdit = true,
}: {
  session: Session;
  place: "card" | "preview";
  primary?: boolean;
  allowEdit?: boolean;
}) {
  const app = useApp();
  const offer = startOffer(session, app.sessions);
  const lead = session.exercises.find((exercise) => exercise.planned.reps != null || exercise.planned.loadKg != null);
  const preview = place === "card" && primary && session.status === "planned" && lead
    ? programPreview(lead, app.sessions, { coachPlan: session.source === "coach", skipSessionId: session.id })
    : null;
  const startId = place === "preview" ? "preview-start" : primary ? "start-session" : undefined;

  const begin = (apply: boolean) => {
    app.setSelectedDate(session.date);
    void app.beginSession(session, apply);
  };

  if (session.status === "done") {
    if (place === "preview") {
      return (
        <button type="button" className="btn" data-testid={startId} onClick={() => app.closeOverlay()}>
          Fermer
        </button>
      );
    }
    return (
      <button type="button" className="btn" data-testid={startId} onClick={() => app.openBilan(session.id)}>
        Voir le bilan
      </button>
    );
  }

  if (session.status === "active") {
    return (
      <button type="button" className="btn" data-testid={startId} onClick={() => app.openSession(session.id)}>
        Reprendre
      </button>
    );
  }

  return (
    <div className="start-actions">
      {offer.kind === "choice" ? (
        <p className="fine" data-testid="plan-rise">
          {offer.summary}
        </p>
      ) : null}
      {preview ? (
        <div className="program" data-testid="program-preview">
          <p>{preview.sentence}</p>
          <p className="program-k">Prochaines séances</p>
          <ol>
            {preview.upcoming.map((step, index) => (
              <li key={`${step.label}-${index}`}>{step.label}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <button type="button" className="btn" data-testid={startId} onClick={() => begin(offer.kind === "choice")}>
        {offer.kind === "choice" ? offer.upLabel : "Commencer"}
      </button>
      {offer.kind === "choice" ? (
        <button type="button" className="linkish" data-testid="keep-plan" onClick={() => begin(false)}>
          {offer.keepLabel}
        </button>
      ) : null}
      {place === "card" ? (
        <div className="linkrow">
          <button type="button" className="linkish" data-testid={primary ? "open-preview" : undefined} onClick={() => app.openPreview(session.id)}>
            Voir la séance
          </button>
          {allowEdit ? (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                app.setEditId(session.id);
                app.setSheet("edit");
              }}
            >
              Modifier
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

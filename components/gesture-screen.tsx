"use client";

import { useApp } from "@/components/app-context";
import { Mannequin } from "@/components/mannequin";
import { isHardSet } from "@/lib/calc";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { bestE1rmLabel, formatPerformedSet } from "@/lib/session";
import { formatKg, formatLong } from "@/lib/utils";

export function GestureScreen({ sessionId, exerciseId }: { sessionId: string; exerciseId: string }) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === sessionId);
  const exercise = session?.exercises.find((item) => item.id === exerciseId);
  if (!session || !exercise) return null;
  const best = bestE1rmLabel(app.sessions, exercise.name);
  const recent = app.sessions
    .filter((item) => !item.cardio && item.status !== "planned" && item.id !== session.id)
    .flatMap((item) => {
      const match = item.exercises.find((entry) => entry.name === exercise.name);
      if (!match) return [];
      const work = match.sets.filter(isHardSet);
      if (!work.length) return [];
      return [{ date: item.date, line: work.map((set) => formatPerformedSet(set, match.unit)).join(", ") }];
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  return (
    <div className="overlay">
      <div className="overlay-in pad-screen" data-screen="gesture">
        <button type="button" className="navline" onClick={() => app.openSession(session.id)}>
          Séance
        </button>
        <div className="fiche-title">
          <h1>{exercise.name}</h1>
          <p>
            {best ? (
              <span className="num">
                Record estimé {formatKg(best.kg)} kg · {best.detail}
              </span>
            ) : (
              "Pas encore de record estimé. Il se calcule entre 1 et 10 répétitions."
            )}
          </p>
        </div>
        <Mannequin name={exercise.name} pattern={exercise.pattern} muscles={exercise.muscles} />
        <section className="block">
          <h3>Muscles</h3>
          <div className="muscles">
            {exercise.muscles.map((muscle, index) => (
              <span key={muscle}>{index === 0 ? <strong>{MUSCLE_LABEL[muscle]}</strong> : MUSCLE_LABEL[muscle]}</span>
            ))}
          </div>
        </section>
        <section className="block">
          <h3>À garder en tête</h3>
          <ul className="cues">
            {exercise.cues.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ul>
        </section>
        <section className="block">
          <h3>Dernières fois</h3>
          {recent.length === 0 ? (
            <p className="fine">Rien de noté pour l’instant. La première séance servira de repère.</p>
          ) : (
            <div className="histmini">
              {recent.map((item) => (
                <div className="line" key={item.date}>
                  <span>{formatLong(item.date)}</span>
                  <b className="num">{item.line}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

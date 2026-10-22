"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { ProgressionBlock } from "@/components/progression-block";
import { lastPerformance, completeSet, cycleRpe, patchSet } from "@/lib/session";
import type { ExerciseLog, Session, SetLog } from "@/lib/types";
import { formatClock, formatKg, uid } from "@/lib/utils";

export function SessionScreen({ id }: { id: string }) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  if (!session) return null;
  const exercise =
    session.exercises.find((item) => item.id === exerciseId) ??
    session.exercises.find((item) => item.sets.some((set) => !set.done)) ??
    session.exercises[0];
  const previous = lastPerformance(app.sessions, exercise.name, session.id);
  const work = exercise.sets.filter((set) => !set.warmup);
  const doneWork = work.filter((set) => set.done).length;

  const change = (updater: (current: Session) => Session) => void app.updateSession(session.id, updater);
  const nextPending = session.exercises.find((item) => item.sets.some((set) => !set.done));

  return (
    <div className="overlay">
      <div className="overlay-in session-screen" data-screen="session">
        <button type="button" className="navline" data-testid="close-session" onClick={app.closeOverlay}>
          Aujourd’hui
        </button>
        <div className="sesshead">
          <div>
            <div className="eyebrow num">
              <Elapsed from={session.startedAt} /> écoulées · série {Math.min(work.length, doneWork + (doneWork < work.length ? 1 : 0))} sur {work.length}
            </div>
            <h1>{session.title}</h1>
          </div>
          <button
            type="button"
            className="linkend"
            data-testid="finish-session"
            onClick={() => {
              void app
                .updateSession(session.id, (current) => ({
                  ...current,
                  status: "done",
                  endedAt: new Date().toISOString(),
                  restEndsAt: null,
                }))
                .then(() => app.openBilan(session.id));
            }}
          >
            Terminer
          </button>
        </div>
        <div className="exswitch">
          {session.exercises.map((item) => (
            <button type="button" key={item.id} className={item.id === exercise.id ? "on" : ""} onClick={() => setExerciseId(item.id)}>
              {short(item.name)}
            </button>
          ))}
        </div>
        <section className="exblock">
          <div className="row">
            <h2>{exercise.name}</h2>
            <button type="button" className="pill" data-testid="open-gesture" onClick={() => app.openGesture(session.id, exercise.id)}>
              Le geste
            </button>
          </div>
          <p className="last num">{previous ? `La dernière fois · ${previous}` : "Pas encore d’historique pour ce geste."}</p>
        </section>
        <div className="sets">
          <ProgressionBlock session={session} exerciseId={exercise.id} />
          <div className="sethead">
            <span>Série</span>
            <span>kg</span>
            <span>Reps</span>
            <span>RPE</span>
            <span />
          </div>
          {exercise.sets.map((set, index) => (
            <SetRow
              key={set.id}
              set={set}
              index={index}
              exercise={exercise}
              active={set.id === exercise.sets.find((item) => !item.done)?.id}
              onPatch={(patch) => change((current) => patchSet(current, exercise.id, set.id, patch))}
              onToggle={() => change((current) => completeSet(current, exercise.id, set.id))}
            />
          ))}
        </div>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            const added: SetLog = {
              id: uid(),
              loadKg: exercise.planned.loadKg,
              reps: null,
              rpe: null,
              warmup: false,
              done: false,
            };
            change((current) => ({
              ...current,
              exercises: current.exercises.map((item) => (item.id === exercise.id ? { ...item, sets: [...item.sets, added] } : item)),
            }));
          }}
        >
          Ajouter une série
        </button>
        {session.restEndsAt ? (
          <RestCard
            endsAt={session.restEndsAt}
            total={exercise.planned.restSec}
            subtitle={restSubtitle(nextPending)}
            onShift={(delta) =>
              change((current) => ({ ...current, restEndsAt: Math.max(Date.now(), (current.restEndsAt ?? Date.now()) + delta) }))
            }
            onSkip={() => change((current) => ({ ...current, restEndsAt: null }))}
          />
        ) : (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              app.setPlatesKg(exercise.planned.loadKg ?? app.settings.barKg);
              app.setSheet("plates");
            }}
          >
            Calculer les disques
          </button>
        )}
      </div>
    </div>
  );
}

function SetRow({
  set,
  index,
  exercise,
  active,
  onPatch,
  onToggle,
}: {
  set: SetLog;
  index: number;
  exercise: ExerciseLog;
  active: boolean;
  onPatch: (patch: Partial<SetLog>) => void;
  onToggle: () => void;
}) {
  const workIndex = exercise.sets.slice(0, index + 1).filter((item) => !item.warmup).length;
  const label = set.warmup ? "éch." : String(workIndex);
  return (
    <div className={`set${set.warmup ? " warm" : ""}${set.done ? " done" : ""}${active ? " next" : ""}`}>
      <span className="idx num">{label}</span>
      {active ? (
        <Stepper
          value={set.loadKg}
          display={set.loadKg == null ? "—" : formatKg(set.loadKg)}
          onStep={(delta) => onPatch({ loadKg: bump(set.loadKg, delta, exercise.planned.loadKg ?? 0, exercise.stepKg || 1) })}
        />
      ) : (
        <span className={`val num${active ? " target" : ""}`}>{set.loadKg == null ? "—" : formatKg(set.loadKg)}</span>
      )}
      {active ? (
        <Stepper
          value={set.reps}
          display={set.reps == null ? "—" : String(set.reps)}
          onStep={(delta) => onPatch({ reps: bump(set.reps, delta, exercise.planned.reps ?? 0, 1) })}
        />
      ) : (
        <span className="val num">{set.reps == null ? "—" : set.reps}</span>
      )}
      {set.warmup ? (
        <span className="val num">—</span>
      ) : active ? (
        <button type="button" className="rpebtn num" onClick={() => onPatch({ rpe: cycleRpe(set.rpe) })}>
          {set.rpe ?? "—"}
        </button>
      ) : (
        <span className="val num">{set.rpe ?? "—"}</span>
      )}
      <button type="button" className="tick" aria-label={set.done ? "Annuler la série" : "Valider la série"} data-testid={active ? "complete-set" : undefined} onClick={onToggle}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.2 6.2 4.7 8.7 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function Stepper({ display, onStep }: { value: number | null; display: string; onStep: (delta: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="Diminuer" onClick={() => onStep(-1)}>
        −
      </button>
      <b className="num">{display}</b>
      <button type="button" aria-label="Augmenter" onClick={() => onStep(1)}>
        +
      </button>
    </span>
  );
}

function bump(current: number | null, direction: number, fallback: number, step: number) {
  if (step === 0) return current ?? 0;
  if (current == null) return Math.max(0, fallback + (direction < 0 ? -step : 0));
  return Math.max(0, Math.round((current + direction * step) * 100) / 100);
}

function RestCard({
  endsAt,
  total,
  subtitle,
  onShift,
  onSkip,
}: {
  endsAt: number;
  total: number;
  subtitle: string;
  onShift: (deltaMs: number) => void;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [endsAt]);
  useEffect(() => {
    if (now < endsAt || fired.current === endsAt) return;
    fired.current = endsAt;
    if (typeof navigator.vibrate === "function") navigator.vibrate([120, 60, 120]);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Repos terminé", { body: "Vous pouvez enchaîner la série suivante." });
      } catch {
        /* notification indisponible */
      }
    }
  }, [now, endsAt]);
  const left = Math.max(0, (endsAt - now) / 1000);
  const ratio = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <section className="rest" data-testid="rest-timer">
      <div className="label">Repos</div>
      <div className="big num">{formatClock(left)}</div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="sub">{subtitle}</p>
      <div className="restacts">
        <button type="button" onClick={() => onShift(-30000)}>
          −30 s
        </button>
        <button type="button" onClick={() => onShift(30000)}>
          +30 s
        </button>
        <button type="button" className="pass" onClick={onSkip}>
          Passer
        </button>
      </div>
    </section>
  );
}

function Elapsed({ from }: { from?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!from) return <span>0:00</span>;
  return <span>{formatClock((now - Date.parse(from)) / 1000)}</span>;
}

function restSubtitle(exercise?: ExerciseLog) {
  if (!exercise) return "C’était la dernière série.";
  const next = exercise.sets.find((set) => !set.done);
  if (!next) return `Puis ${exercise.name}.`;
  if (next.warmup) return `Puis échauffement · ${exercise.name}.`;
  const number = exercise.sets.filter((set) => !set.warmup).indexOf(next) + 1;
  const load = next.loadKg ?? exercise.planned.loadKg;
  return `Puis série ${number} · ${exercise.name} · ${load != null ? `${formatKg(load)} kg` : "charge libre"}`;
}

function short(name: string) {
  return name.replace("Développé ", "").replace("barre", "").replace("haltères", "").trim();
}

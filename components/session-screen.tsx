"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { unitOfExercise, unitPhrase } from "@/lib/display";
import {
  loadProgression,
  reapplyAdjustment,
  revertAdjustment,
  saveProgression,
  setDelta,
  type ProgressionRecord,
} from "@/lib/progression";
import { recallPlan } from "@/lib/snapshot";
import { lastPerformance, completeSet, patchSet } from "@/lib/session";
import type { ExerciseLog, Session, SetLog } from "@/lib/types";
import { formatClock, formatKg } from "@/lib/utils";

export function SessionScreen({ id }: { id: string }) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [record, setRecord] = useState<ProgressionRecord | null>(() => loadProgression(id));
  const [menu, setMenu] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const [editing, setEditing] = useState<null | "load" | "reps">(null);
  const [draft, setDraft] = useState("");
  const [warmNote, setWarmNote] = useState(false);
  const persist = (next: ProgressionRecord) => {
    saveProgression(id, next);
    setRecord(next);
  };
  if (!session) return null;
  const correcting = session.status === "done";
  const exercise =
    session.exercises.find((item) => item.id === exerciseId) ??
    session.exercises.find((item) => item.sets.some((set) => !set.done)) ??
    session.exercises[0];
  if (!exercise) return null;
  const current = exercise.sets.find((set) => !set.done) ?? exercise.sets[exercise.sets.length - 1];
  if (!current) return null;
  const previous = lastPerformance(app.sessions, exercise.name, session.id);
  const work = exercise.sets.filter((set) => !set.warmup);
  const workIndex = current.warmup ? 0 : Math.max(1, work.indexOf(current) + 1);
  const shownLoad = editing === "load" && draft !== "" ? readNumber(draft) : (current.loadKg ?? exercise.planned.loadKg);
  const shownReps = editing === "reps" && draft !== "" ? readNumber(draft) : (current.reps ?? exercise.planned.reps);
  const lastDone = [...exercise.sets].reverse().find((set) => set.done);
  const delta = setDelta(record?.items.find((item) => item.exerciseId === exercise.id), current);
  const cueLines = exercise.cues.filter((line) => line.trim());
  const cue = cueLines.length > 1 ? cueLines[1] : (cueLines[0] ?? "");

  const change = (updater: (currentSession: Session) => Session) => void app.updateSession(session.id, updater);

  const openEdit = (field: "load" | "reps") => {
    setEditing(field);
    const value = field === "load" ? (current.loadKg ?? exercise.planned.loadKg) : (current.reps ?? exercise.planned.reps);
    setDraft(value == null ? "" : String(value).replace(".", ","));
  };

  const stepEdit = (direction: number) => {
    const step = editing === "reps" ? 1 : exercise.stepKg || 2.5;
    const base = editing === "reps" ? shownReps : shownLoad;
    const next = Math.max(0, Math.round(((base ?? 0) + direction * step) * 100) / 100);
    setDraft(String(next).replace(".", ","));
  };

  const commit = () => {
    const loadKg = shownLoad;
    const reps = shownReps;
    if (current.done) {
      change((item) => patchSet(item, exercise.id, current.id, { loadKg, reps }));
      return;
    }
    const warmup = current.warmup;
    change((item) => completeSet(patchSet(item, exercise.id, current.id, { loadKg, reps }), exercise.id, current.id));
    setWarmNote(warmup);
    setEditing(null);
  };

  const undo = (set: SetLog) => {
    change((item) => completeSet(item, exercise.id, set.id));
    setWarmNote(false);
  };

  const revertExercise = () => {
    const item = record?.items.find((entry) => entry.exerciseId === exercise.id && entry.active);
    if (!item || !record) return;
    void app.updateSession(id, (currentSession) => revertAdjustment(currentSession, item));
    persist({ ...record, items: record.items.map((entry) => (entry.exerciseId === exercise.id ? { ...entry, active: false } : entry)) });
  };

  const revertPlan = () => {
    if (!record) return;
    const active = record.items.filter((item) => item.active);
    void app.updateSession(id, (currentSession) => active.reduce((next, item) => revertAdjustment(next, item), currentSession));
    persist({ ...record, choice: "reverted", items: record.items.map((item) => ({ ...item, active: false })) });
    setMenu(false);
  };

  const jump = (nextId: string) => {
    setExerciseId(nextId);
    setEditing(null);
    setMenu(false);
    setWarmNote(false);
  };

  const closeFull = () => {
    void app
      .updateSession(session.id, (currentSession) => ({
        ...currentSession,
        status: "done",
        closed: "full",
        endedAt: new Date().toISOString(),
        restEndsAt: null,
      }))
      .then(() => app.openBilan(session.id, true));
  };

  const keepLogged = () => {
    void app
      .updateSession(session.id, (currentSession) => ({
        ...currentSession,
        status: "done",
        closed: "partial",
        endedAt: new Date().toISOString(),
        restEndsAt: null,
      }))
      .then(() => app.openBilan(session.id, true));
  };

  const erase = () => {
    const snap = recallPlan(session.id);
    const restored = snap
      ? { ...snap, status: "planned" as const, startedAt: undefined, endedAt: undefined, restEndsAt: null, closed: undefined }
      : blankOut(session, record);
    void app.updateSession(session.id, () => restored).then(() => {
      if (record) persist({ ...record, choice: "reverted", items: record.items.map((item) => ({ ...item, active: false })) });
      app.closeOverlay();
      app.flash("Le plan est remis. Rien n’a été gardé.");
    });
  };

  const logged = loggedLine(session);
  const hasLogged = session.exercises.some((item) => item.sets.some((set) => set.done));

  return (
    <div className="overlay">
      <div className="overlay-in session-screen" data-screen="session">
        <div className="sessbar">
          <button type="button" className="navline" data-testid="close-session" onClick={() => app.closeOverlay()}>
            ‹ Séance
          </button>
          {correcting ? (
            <button type="button" className="linkend" onClick={() => app.closeOverlay()}>
              Fermer
            </button>
          ) : (
            <button type="button" className="linkend" data-testid="abandon-session" onClick={() => { setMenu(false); setAbandon(true); }}>
              Abandonner
            </button>
          )}
        </div>
        <div className="sesshead">
          <div>
            <h1>{exercise.name}</h1>
          </div>
          <button type="button" className="iconbtn text" aria-label="Plus d’actions" data-testid="session-menu" onClick={() => setMenu((value) => !value)}>
            ···
          </button>
        </div>
        <p className="eyebrow num">
          {session.title}
          {session.startedAt ? <> · <Elapsed from={session.startedAt} /></> : null}
          {work.length ? ` · série ${Math.min(workIndex || 1, work.length)} sur ${work.length}` : ""}
        </p>
        <p className="last num">{previous ? `La dernière fois · ${previous}` : "Pas encore d’historique pour ce geste."}</p>
        {exercise.note ? <p className="exnote">{exercise.note}</p> : null}
        {current.warmup ? <p className="warmline">Échauffement</p> : null}
        {menu ? (
          <div className="menu" role="menu">
            {session.exercises.map((item) => (
              <button type="button" key={item.id} onClick={() => jump(item.id)}>
                {item.name}
              </button>
            ))}
            {record?.items.some((item) => item.active) ? (
              <button type="button" data-testid="progression-revert-plan" onClick={revertPlan}>
                Revenir au plan
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                app.setPlatesKg(shownLoad ?? app.settings.barKg);
                app.setSheet("plates");
                setMenu(false);
              }}
            >
              Calculer les disques
            </button>
            <button type="button" data-testid="open-gesture" onClick={() => app.openGesture(session.id, exercise.id)}>
              Le geste
            </button>
            {correcting ? null : (
              <button type="button" onClick={() => { setMenu(false); setCloseAsk(true); }}>
                Clore la séance
              </button>
            )}
          </div>
        ) : null}
        <div className="sessbody">
          <div className="bigpair">
            <button type="button" className="bigcard" data-testid="edit-load" onClick={() => openEdit("load")}>
              <span>Charge</span>
              <b className="num">{shownLoad == null ? "—" : formatKg(shownLoad)}</b>
              <small>{unitPhrase(unitOfExercise(exercise))}</small>
              {delta?.place === "load" ? (
                <small>
                  <span className="delta" data-testid="progression-delta" onClick={(event) => { event.stopPropagation(); revertExercise(); }}>
                    {delta.text}
                  </span>
                </small>
              ) : null}
            </button>
            <button type="button" className="bigcard" data-testid="edit-reps" onClick={() => openEdit("reps")}>
              <span>Reps</span>
              <b className="num">{shownReps == null ? "—" : shownReps}</b>
              <small>{shownReps != null && shownReps === exercise.planned.reps ? "comme le plan" : "répétitions"}</small>
            </button>
          </div>
          {editing ? (
            <div className="nudges">
              <button type="button" aria-label="Diminuer" onClick={() => stepEdit(-1)}>
                −
              </button>
              <input
                inputMode="decimal"
                aria-label={editing === "load" ? "Charge" : "Répétitions"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="button" aria-label="Augmenter" onClick={() => stepEdit(1)}>
                +
              </button>
            </div>
          ) : null}
          <button type="button" className="btn" data-testid="complete-set" onClick={commit}>
            {current.done ? "Enregistrer" : "C’est fait"}
          </button>
          {lastDone ? (
            <button type="button" className="undoline" data-testid="undo-set" onClick={() => undo(lastDone)}>
              {undoLabel(exercise, lastDone)}
            </button>
          ) : null}
          {warmNote ? <p className="exnote">Échauffement noté.</p> : null}
          {cue ? <p className="cue">{cue}</p> : null}
          {record?.mode !== "hold" && record?.items.some((item) => item.exerciseId === exercise.id && !item.active && item.fromLoadKg != null) ? (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                const item = record.items.find((entry) => entry.exerciseId === exercise.id && !entry.active);
                if (!item) return;
                void app.updateSession(id, (currentSession) => reapplyAdjustment(currentSession, item));
                persist({ ...record, items: record.items.map((entry) => (entry.exerciseId === exercise.id ? { ...entry, active: true } : entry)) });
              }}
            >
              Remettre la hausse
            </button>
          ) : null}
        </div>
        {session.restEndsAt && !correcting ? (
          <RestBand
            endsAt={session.restEndsAt}
            subtitle={restSubtitle(session.exercises.find((item) => item.sets.some((set) => !set.done)) ?? exercise)}
            onSkip={() => change((item) => ({ ...item, restEndsAt: null }))}
          />
        ) : null}
      </div>
      {abandon ? (
        <div className="dimsheet" role="dialog" aria-modal="true" aria-label="Abandonner cette séance" data-testid="abandon-sheet">
          <div className="dimcard">
            <div className="grab" />
            <h2>Abandonner cette séance ?</h2>
            <p>{logged}</p>
            <p className="fine">Rien ne part vers Chef sport.</p>
            <button type="button" className="btn" data-testid="abandon-continue" onClick={() => setAbandon(false)}>
              Continuer la séance
            </button>
            {hasLogged ? (
              <button type="button" className="btn ghost" data-testid="abandon-keep" onClick={keepLogged}>
                Garder la série, ranger le reste
              </button>
            ) : null}
            <button type="button" className="undoline" data-testid="abandon-erase" onClick={erase}>
              Tout effacer et remettre le plan
            </button>
          </div>
        </div>
      ) : null}
      {closeAsk ? (
        <div className="dimsheet" role="dialog" aria-modal="true" aria-label="Clore la séance">
          <div className="dimcard">
            <div className="grab" />
            <h2>Clore la séance ?</h2>
            <p>Les exercices non notés resteront vides.</p>
            <button type="button" className="btn" data-testid="finish-session" onClick={closeFull}>
              Clore
            </button>
            <button type="button" className="btn ghost" onClick={() => setCloseAsk(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function blankOut(session: Session, record: ProgressionRecord | null): Session {
  let next = session;
  if (record) {
    for (const item of record.items) next = revertAdjustment(next, item);
  }
  return {
    ...next,
    status: "planned",
    startedAt: undefined,
    endedAt: undefined,
    restEndsAt: null,
    closed: undefined,
    exercises: next.exercises.map((exercise) => ({
      ...exercise,
      planned: exercise.planned,
      sets: exercise.sets.map((set) => ({ ...set, done: false, reps: set.warmup ? set.reps : null, rpe: null })),
    })),
  };
}

function loggedLine(session: Session): string {
  const done = session.exercises.flatMap((exercise) =>
    exercise.sets.filter((set) => set.done && !set.warmup).map((set) => ({ exercise, set })),
  );
  if (!done.length) return "Aucune série n’est encore notée.";
  const first = done[0];
  const load = first.set.loadKg == null ? "charge libre" : `${formatKg(first.set.loadKg)} ${unitPhrase(first.set.unit ?? unitOfExercise(first.exercise))}`;
  const bit = `${shortName(first.exercise.name)}, ${load} × ${first.set.reps ?? "—"}`;
  if (done.length === 1) return `Une série est déjà notée : ${bit}.`;
  return `${done.length} séries sont déjà notées, dont ${bit}.`;
}

function undoLabel(exercise: ExerciseLog, set: SetLog): string {
  if (set.warmup) return "Annuler l’échauffement";
  const number = exercise.sets.filter((item) => !item.warmup).indexOf(set) + 1;
  const load = set.loadKg == null ? "charge libre" : `${formatKg(set.loadKg)} ${unitPhrase(set.unit ?? unitOfExercise(exercise))}`;
  const reps = set.reps == null ? "—" : String(set.reps);
  return `Annuler la série ${number} · ${load} × ${reps}`;
}

function shortName(name: string) {
  return name.replace(/^Développé\s+/i, "").toLowerCase();
}

function readNumber(value: string): number | null {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function RestBand({ endsAt, subtitle, onSkip }: { endsAt: number; subtitle: string; onSkip: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [endsAt]);
  useEffect(() => {
    if (now < endsAt || fired.current === endsAt) return;
    fired.current = endsAt;
    chime();
  }, [now, endsAt]);
  const left = Math.max(0, (endsAt - now) / 1000);
  return (
    <section className="restband" data-testid="rest-timer">
      <div>
        <b className="num">{formatClock(left)}</b>
        <p>{subtitle}</p>
      </div>
      <button type="button" className="pass" onClick={onSkip}>
        Passer
      </button>
    </section>
  );
}

function chime() {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate([80, 40, 80]);
  } catch {
    /* vibration indisponible */
  }
  try {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = 740;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    osc.stop(context.currentTime + 0.4);
    window.setTimeout(() => void context.close(), 600);
  } catch {
    /* son indisponible */
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Repos terminé", { body: "Vous pouvez enchaîner la série suivante." });
    } catch {
      /* notification indisponible */
    }
  }
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
  if (next.warmup) return "Puis l’échauffement.";
  const number = exercise.sets.filter((set) => !set.warmup).indexOf(next) + 1;
  const load = next.loadKg ?? exercise.planned.loadKg;
  return `Puis série ${number}${load != null ? ` · ${formatKg(load)} ${unitPhrase(next.unit ?? unitOfExercise(exercise))}` : ""}`;
}

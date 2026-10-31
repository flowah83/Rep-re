"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { CoachFace } from "@/components/coach-face";
import { plateGlance, unitOfExercise, unitPhrase } from "@/lib/display";
import { resolvedUnit } from "@/lib/unit";
import { playChime, unlockChime } from "@/lib/chime";
import {
  loadProgression,
  reapplyAdjustment,
  revertAdjustment,
  saveProgression,
  setDelta,
  type ProgressionRecord,
} from "@/lib/progression";
import { recallPlan } from "@/lib/snapshot";
import { closeCopy } from "@/lib/close";
import { parseDecimalDraft } from "@/lib/contract";
import { KeepCard, NumberPad, SetChips, StepperCard } from "@/components/set-entry";
import { keepPrompt, loggedPair, stepField, type FieldDraft } from "@/lib/set-entry";
import { carryLoadForward, lastPerformance, completeSet, firstOpenSlot, noteSetRpe, patchSet, sessionFullyLogged, setSettled, skipSet, stepFor } from "@/lib/session";
import type { ExerciseLog, Session, SetLog } from "@/lib/types";
import { formatClock, formatKg } from "@/lib/utils";

export function SessionScreen({ id }: { id: string }) {
  const app = useApp();
  const session = app.sessions.find((item) => item.id === id);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [record, setRecord] = useState<ProgressionRecord | null>(() => loadProgression(id));
  const [menu, setMenu] = useState(false);
  const [list, setList] = useState(false);
  const [review, setReview] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const [entry, setEntry] = useState<{ setId: string } & FieldDraft>({ setId: "" });
  const [pad, setPad] = useState<null | "load" | "reps">(null);
  const [padTarget, setPadTarget] = useState<"main" | "fix">("main");
  const [padText, setPadText] = useState("");
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [fix, setFix] = useState<{ setId: string } & FieldDraft>({ setId: "" });
  const [keep, setKeep] = useState<{ exerciseId: string; fromSetId: string; loadKg: number } | null>(null);
  const [warmNote, setWarmNote] = useState(false);
  const [wakeFail, setWakeFail] = useState(false);
  const [wakeTry, setWakeTry] = useState(0);
  const [closing, setClosing] = useState(false);
  const persist = (next: ProgressionRecord) => {
    saveProgression(id, next);
    setRecord(next);
  };
  const correcting = session?.status === "done";
  const finished = Boolean(session && session.status === "active" && sessionFullyLogged(session) && !review);
  const slot = session ? firstOpenSlot(session) : null;
  const exercise = session
    ? ((exerciseId ? session.exercises.find((item) => item.id === exerciseId) : null) ??
      (review || correcting ? session.exercises[0] : slot?.exercise) ??
      session.exercises[0])
    : undefined;
  const current = exercise
    ? (exercise.sets.find((set) => !setSettled(set)) ?? exercise.sets[exercise.sets.length - 1])
    : undefined;
  const focusSetter = useRef(app.setSportFocus);
  focusSetter.current = app.setSportFocus;
  useEffect(() => {
    if (!session) return;
    focusSetter.current(
      exercise && current ? { sessionId: session.id, exerciseId: exercise.id, setId: current.id } : { sessionId: session.id },
    );
    return () => focusSetter.current(null);
  }, [session, exercise, current]);
  useEffect(() => {
    if (!("wakeLock" in navigator)) {
      setWakeFail(true);
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!stopped) setWakeFail(false);
      } catch {
        if (!stopped) setWakeFail(true);
      }
    };
    void request();
    const onVis = () => {
      if (!stopped && document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [wakeTry]);
  if (!session) return null;
  if (!exercise && !finished) return null;

  const change = (updater: (currentSession: Session) => Session) => void app.updateSession(session.id, updater);

  const corrected = exercise && correctId ? exercise.sets.find((set) => set.id === correctId && set.done) : undefined;
  const mainDraft = current && entry.setId === current.id ? entry : {};
  const fixDraft = corrected && fix.setId === corrected.id ? fix : {};
  const mainPair = exercise && current ? loggedPair(current, exercise.planned, mainDraft) : { loadKg: null, reps: null };
  const fixPair = exercise && corrected ? loggedPair(corrected, exercise.planned, fixDraft) : null;
  const shownLoad = mainPair.loadKg;
  const shownReps = mainPair.reps;

  const writeDraft = (target: "main" | "fix", field: "loadKg" | "reps", value: number) => {
    const setId = target === "fix" ? corrected?.id : current?.id;
    if (!setId) return;
    if (target === "fix") {
      setFix((prev) => ({ ...prev, setId, [field]: value }));
      return;
    }
    setEntry((prev) => ({ ...(prev.setId === setId ? prev : { setId }), setId, [field]: value }));
  };

  const stepFieldOf = (target: "main" | "fix", field: "load" | "reps", direction: number) => {
    if (!exercise) return;
    const step = field === "reps" ? 1 : stepFor(exercise);
    const source = target === "fix" ? fixPair : mainPair;
    const base = field === "reps" ? source?.reps ?? null : source?.loadKg ?? null;
    writeDraft(target, field === "reps" ? "reps" : "loadKg", stepField(base, direction, step));
  };

  const openPad = (target: "main" | "fix", field: "load" | "reps") => {
    const source = target === "fix" ? fixPair : mainPair;
    const value = field === "load" ? source?.loadKg : source?.reps;
    setPad(field);
    setPadTarget(target);
    setPadText(value == null ? "" : String(value).replace(".", ","));
  };

  const acceptPad = () => {
    if (!pad) return;
    const parsed = readNumber(padText);
    if (parsed != null) writeDraft(padTarget, pad === "load" ? "loadKg" : "reps", parsed);
    setPad(null);
  };

  const commitValues = (set: SetLog, loadKg: number | null, reps: number | null) => {
    if (!exercise) return;
    unlockChime();
    if (set.done) {
      change((item) => patchSet(item, exercise.id, set.id, { loadKg, reps, origin: "saisie" }));
      setCorrectId(null);
      setPad(null);
      return;
    }
    const prompt = keepPrompt(exercise, set.id, loadKg);
    change((item) => completeSet(patchSet(item, exercise.id, set.id, { loadKg, reps }), exercise.id, set.id));
    setWarmNote(set.warmup);
    setEntry({ setId: "" });
    setPad(null);
    setExerciseId(null);
    setReview(false);
    if (prompt && loadKg != null) setKeep({ exerciseId: exercise.id, fromSetId: set.id, loadKg });
  };

  const commit = () => {
    if (current) commitValues(current, shownLoad, shownReps);
  };

  const commitFix = () => {
    if (corrected && fixPair) commitValues(corrected, fixPair.loadKg, fixPair.reps);
  };

  const revertField = (target: "main" | "fix", field: "load" | "reps") => {
    if (!exercise) return;
    const planned = field === "load" ? exercise.planned.loadKg : exercise.planned.reps;
    if (planned == null) return;
    writeDraft(target, field === "load" ? "loadKg" : "reps", planned);
  };

  const answerKeep = (yes: boolean) => {
    if (keep && yes) change((item) => carryLoadForward(item, keep.exerciseId, keep.fromSetId, keep.loadKg));
    setKeep(null);
  };

  const undo = (set: SetLog) => {
    if (!exercise) return;
    change((item) => completeSet(item, exercise.id, set.id));
    setWarmNote(false);
  };

  const revertExercise = () => {
    if (!exercise) return;
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
    setReview(true);
    setEntry({ setId: "" });
    setCorrectId(null);
    setPad(null);
    setMenu(false);
    setList(false);
    setWarmNote(false);
  };

  const closeFull = () => {
    if (closing) return;
    if (session.status === "done") {
      app.openBilan(session.id, false);
      return;
    }
    setClosing(true);
    const next = {
      ...session,
      status: "done" as const,
      closed: "full" as const,
      endedAt: new Date().toISOString(),
      restEndsAt: null,
    };
    void app
      .saveSession(next, "confirmed")
      .then(() => app.openBilan(next.id, true))
      .catch(() => setClosing(false));
  };

  const keepLogged = () => {
    if (closing) return;
    setClosing(true);
    const next = {
      ...session,
      status: "done" as const,
      closed: "partial" as const,
      endedAt: new Date().toISOString(),
      restEndsAt: null,
    };
    void app
      .saveSession(next, "confirmed")
      .then(() => app.openBilan(next.id, true))
      .catch(() => setClosing(false));
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
  const resting = Boolean(session.restEndsAt) && !correcting && !finished;
  const nextExercise = exercise ? session.exercises[session.exercises.findIndex((item) => item.id === exercise.id) + 1] : undefined;
  const handoff = exercise && resting ? transitionLine(session, exercise) : null;

  return (
    <div className={`overlay sport-mode${resting ? " resting" : ""}`}>
      <div className="overlay-in session-screen" data-screen="session" data-testid="session-screen">
        <div className="sessbar">
          <button type="button" className="navline" data-testid="close-session" onClick={() => app.closeOverlay()}>
            {correcting ? "Fermer" : "Quitter"}
          </button>
          <button type="button" className="coach-mini" data-testid="session-coach" aria-label="Ouvrir le coach" onClick={() => app.setCoachOpen(true)}>
            <CoachFace />
          </button>
          {correcting ? null : (
            <button type="button" className="linkend" data-testid="abandon-session" onClick={() => { setMenu(false); setAbandon(true); }}>
              Abandonner
            </button>
          )}
        </div>
        {finished ? (
          <EndScreen
            session={session}
            closing={closing}
            onBilan={closeFull}
            onReview={() => { setReview(true); setExerciseId(session.exercises[0]?.id ?? null); }}
            onRpe={(rpe) => {
              const last = lastDoneWork(session);
              if (!last) return;
              change((item) => noteSetRpe(item, last.exercise.id, last.set.id, rpe));
            }}
          />
        ) : exercise && current ? (
          <ActiveSet
            session={session}
            exercise={exercise}
            current={current}
            record={record}
            list={list}
            menu={menu}
            warmNote={warmNote}
            resting={resting}
            wakeFail={wakeFail}
            shownLoad={shownLoad}
            shownReps={shownReps}
            corrected={corrected}
            fixLoad={fixPair?.loadKg ?? null}
            fixReps={fixPair?.reps ?? null}
            keepText={keep && keep.exerciseId === exercise.id ? `Garder ${formatKg(keep.loadKg)} kg pour les séries suivantes ?` : null}
            pad={pad}
            padText={padText}
            nextName={handoff ? undefined : nextExercise?.name}
            handoff={handoff}
            barKg={app.settings.barKg}
            onCrumb={() => { setList((value) => !value); setMenu(false); }}
            onMenu={() => { setMenu((value) => !value); setList(false); }}
            onJump={jump}
            onSkip={() => {
              if (!current || current.done) return;
              change((item) => skipSet(item, exercise.id, current.id));
              setEntry({ setId: "" });
              setList(false);
              setExerciseId(null);
              setReview(false);
            }}
            onStep={stepFieldOf}
            onOpenPad={openPad}
            onPadText={setPadText}
            onAcceptPad={acceptPad}
            onClosePad={() => setPad(null)}
            onCommit={commit}
            onCommitFix={commitFix}
            onRevertField={revertField}
            onCorrect={(set) => {
              setCorrectId(set.id);
              setFix({
                setId: set.id,
                loadKg: set.loadKg ?? exercise.planned.loadKg ?? undefined,
                reps: set.reps ?? exercise.planned.reps ?? undefined,
              });
              setPad(null);
            }}
            onUndo={undo}
            onKeep={answerKeep}
            onRevertExercise={revertExercise}
            onRevertPlan={revertPlan}
            onPlates={() => {
              app.setPlatesKg(shownLoad ?? app.settings.barKg);
              app.setSheet("plates");
              setMenu(false);
            }}
            onGesture={() => app.openGesture(session.id, exercise.id)}
            onCloseAsk={() => { setMenu(false); setCloseAsk(true); }}
            onRpe={(rpe) => {
              const last = lastDoneWork(session);
              if (!last) return;
              change((item) => noteSetRpe(item, last.exercise.id, last.set.id, rpe));
            }}
            onSkipRest={() => change((item) => ({ ...item, restEndsAt: null }))}
            onWake={() => setWakeTry((value) => value + 1)}
            correcting={correcting}
            delta={setDelta(record?.items.find((item) => item.exerciseId === exercise.id), current)}
            previous={lastPerformance(app.sessions, exercise.name, session.id, resolvedUnit({ unit: exercise.unit }, exercise))}
            onReapply={() => {
              if (!record) return;
              const item = record.items.find((entry) => entry.exerciseId === exercise.id && !entry.active);
              if (!item) return;
              void app.updateSession(id, (currentSession) => reapplyAdjustment(currentSession, item));
              persist({ ...record, items: record.items.map((entry) => (entry.exerciseId === exercise.id ? { ...entry, active: true } : entry)) });
            }}
          />
        ) : null}
      </div>
      {abandon ? (
        <div className="dimsheet sport-mode" role="dialog" aria-modal="true" aria-label="Abandonner cette séance" data-testid="abandon-sheet">
          <div className="dimcard">
            <div className="grab" />
            <h2>Abandonner cette séance ?</h2>
            <p>{logged}</p>
            <p className="fine">Ce texte reste ici. Il part seulement si vous l’envoyez depuis le bilan.</p>
            <button type="button" className="btn" data-testid="abandon-continue" onClick={() => setAbandon(false)}>
              Continuer la séance
            </button>
            {hasLogged ? (
              <button type="button" className="btn ghost" data-testid="abandon-keep" onClick={keepLogged}>
                Garder ce qui est noté{emptySets(session) ? `, ${emptySets(session)} série${emptySets(session) === 1 ? "" : "s"} resteront vides` : ""}
              </button>
            ) : null}
            <button type="button" className="undoline" data-testid="abandon-erase" onClick={erase}>
              Tout effacer et remettre le plan
            </button>
          </div>
        </div>
      ) : null}
      {closeAsk ? (
        <div className="dimsheet sport-mode" role="dialog" aria-modal="true" aria-label="Clore la séance">
          <div className="dimcard">
            <div className="grab" />
            <h2>Clore la séance ?</h2>
            <p>Les exercices non notés resteront vides.</p>
            <button type="button" className="btn" data-testid="close-confirm" onClick={closeFull}>
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

function ActiveSet({
  session,
  exercise,
  current,
  record,
  list,
  menu,
  warmNote,
  resting,
  wakeFail,
  shownLoad,
  shownReps,
  corrected,
  fixLoad,
  fixReps,
  keepText,
  pad,
  padText,
  nextName,
  handoff,
  barKg,
  onCrumb,
  onMenu,
  onJump,
  onSkip,
  onStep,
  onOpenPad,
  onPadText,
  onAcceptPad,
  onClosePad,
  onCommit,
  onCommitFix,
  onRevertField,
  onCorrect,
  onUndo,
  onKeep,
  onRevertExercise,
  onRevertPlan,
  onPlates,
  onGesture,
  onCloseAsk,
  onRpe,
  onSkipRest,
  onWake,
  correcting,
  delta,
  previous,
  onReapply,
}: {
  session: Session;
  exercise: ExerciseLog;
  current: SetLog;
  record: ProgressionRecord | null;
  list: boolean;
  menu: boolean;
  warmNote: boolean;
  resting: boolean;
  wakeFail: boolean;
  shownLoad: number | null;
  shownReps: number | null;
  corrected?: SetLog;
  fixLoad: number | null;
  fixReps: number | null;
  keepText: string | null;
  pad: null | "load" | "reps";
  padText: string;
  nextName?: string;
  handoff: string | null;
  barKg: number;
  onCrumb: () => void;
  onMenu: () => void;
  onJump: (id: string) => void;
  onSkip: () => void;
  onStep: (target: "main" | "fix", field: "load" | "reps", direction: number) => void;
  onOpenPad: (target: "main" | "fix", field: "load" | "reps") => void;
  onPadText: (value: string) => void;
  onAcceptPad: () => void;
  onClosePad: () => void;
  onCommit: () => void;
  onCommitFix: () => void;
  onRevertField: (target: "main" | "fix", field: "load" | "reps") => void;
  onCorrect: (set: SetLog) => void;
  onUndo: (set: SetLog) => void;
  onKeep: (yes: boolean) => void;
  onRevertExercise: () => void;
  onRevertPlan: () => void;
  onPlates: () => void;
  onGesture: () => void;
  onCloseAsk: () => void;
  onRpe: (rpe: number) => void;
  onSkipRest: () => void;
  onWake: () => void;
  correcting: boolean;
  delta: ReturnType<typeof setDelta>;
  previous: string | null;
  onReapply: () => void;
}) {
  const index = Math.max(1, session.exercises.findIndex((item) => item.id === exercise.id) + 1);
  const work = exercise.sets.filter((set) => !set.warmup);
  const workIndex = current.warmup ? 0 : Math.max(1, work.indexOf(current) + 1);
  const seriesLabel = current.warmup && !current.done ? "Échauffement" : `Série ${Math.min(workIndex || 1, work.length)} sur ${work.length}`;
  const crumbLabel = `Exercice ${index} sur ${session.exercises.length}, ${seriesLabel}`;
  const plates = plateGlance(shownLoad, unitOfExercise(exercise), barKg);
  const doneWork = lastDoneWork(session);
  return (
    <>
      <button type="button" className="crumb" data-testid="session-crumb" aria-label={crumbLabel} onClick={onCrumb}>
        <span className="segs" aria-hidden="true">
          {session.exercises.map((item, itemIndex) => {
            const state = item.sets.every(setSettled) ? "done" : item.id === exercise.id ? "now" : "";
            return <i key={item.id} className={state} data-seg={itemIndex + 1} />;
          })}
        </span>
        <span>Exercice {index} sur {session.exercises.length}</span>
        <span className="num">{seriesLabel}</span>
        {session.startedAt ? <Elapsed from={session.startedAt} /> : <span className="num">0:00</span>}
      </button>
      {handoff ? <p className="puis">{handoff}</p> : nextName ? <p className="puis">Puis {nextName.toLowerCase()}</p> : null}
      {wakeFail ? (
        <button type="button" className="wakehint" data-testid="wake-fail" onClick={onWake}>
          L’écran peut s’éteindre. Touchez pour réessayer.
        </button>
      ) : null}
      <div className="sesshead">
        <h1>{exercise.name}</h1>
        <button type="button" className="iconbtn text" aria-label="Plus d’actions" data-testid="session-menu" onClick={onMenu}>
          ···
        </button>
      </div>
      <SetChips exercise={exercise} currentId={current.id} onCorrect={onCorrect} />
      {list ? (
        <div className="menu listmenu" role="menu" data-testid="exercise-list">
          {session.exercises.map((item) => (
            <button type="button" role="menuitem" key={item.id} onClick={() => onJump(item.id)}>
              {item.sets.every(setSettled) ? "✓ " : ""}
              {item.name}
            </button>
          ))}
          {current.done ? null : (
            <button type="button" role="menuitem" data-testid="skip-set" onClick={onSkip}>
              Passer cette série
            </button>
          )}
        </div>
      ) : null}
      {menu ? (
        <div className="menu" role="menu">
          {record?.items.some((item) => item.active) ? (
            <button type="button" role="menuitem" data-testid="progression-revert-plan" onClick={onRevertPlan}>
              Revenir au plan
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={onPlates}>
            Calculer les disques
          </button>
          {previous ? (
            <p className="menunote">La dernière fois · {previous}</p>
          ) : null}
          {exercise.planned.loadKg != null || exercise.planned.reps != null ? (
            <p className="menunote">
              Cible · {exercise.planned.loadKg != null ? `${formatKg(exercise.planned.loadKg)} ${unitPhrase(unitOfExercise(exercise))}` : "sans charge"} × {exercise.planned.reps ?? "—"}
              {exercise.planned.rpe != null ? ` · RPE ${formatKg(exercise.planned.rpe)}` : ""}
            </p>
          ) : null}
          <button type="button" role="menuitem" data-testid="open-gesture" onClick={onGesture}>
            L’exercice
          </button>
          {correcting ? null : (
            <button type="button" role="menuitem" onClick={onCloseAsk}>
              Clore la séance
            </button>
          )}
        </div>
      ) : null}
      <div className="sessbody">
        {keepText ? <KeepCard prompt={keepText} onNo={() => onKeep(false)} onYes={() => onKeep(true)} /> : null}
        {delta?.place === "load" ? (
          <button type="button" className="delta" data-testid="progression-delta" onClick={onRevertExercise}>
            {delta.text}
          </button>
        ) : null}
        <StepperCard
          kind="load"
          label="Charge"
          value={shownLoad}
          planned={current.warmup ? current.loadKg : exercise.planned.loadKg}
          unit={gearUnit(exercise)}
          stepLabel={`± ${formatKg(stepFor(exercise))} kg`}
          aside={resting ? null : shortPlates(plates)}
          onStep={(direction) => onStep("main", "load", direction)}
          onOpen={() => onOpenPad("main", "load")}
          onRevert={() => onRevertField("main", "load")}
        />
        <StepperCard
          kind="reps"
          label="Répétitions"
          value={shownReps}
          planned={current.warmup ? current.reps : exercise.planned.reps}
          unit="répétitions"
          stepLabel="± 1"
          onStep={(direction) => onStep("main", "reps", direction)}
          onOpen={() => onOpenPad("main", "reps")}
          onRevert={() => onRevertField("main", "reps")}
        />
        <div className="thumb">
          <button type="button" className="btn" data-testid="complete-set" onClick={onCommit}>
            <b>{current.warmup ? "Valider l’échauffement" : `Valider la série ${Math.max(1, workIndex || 1)}`}</b>
            <small>{shownLoad == null ? "sans charge" : `${formatKg(shownLoad)} kg`} × {shownReps ?? "—"}</small>
          </button>
          {current.done ? null : (
            <button type="button" className="undoline" data-testid="skip-set-inline" onClick={onSkip}>
              Passer cette série
            </button>
          )}
        </div>
        {warmNote && !resting ? <p className="exnote">Échauffement noté.</p> : null}
        {reviewBack(record, exercise) ? (
          <button type="button" className="linkish" onClick={onReapply}>
            Remettre la hausse
          </button>
        ) : null}
      </div>
      {corrected ? (
        <div className="dimsheet" role="dialog" aria-modal="true" aria-label={`Corriger la série ${workIndexOf(exercise, corrected)}`} data-testid="correct-sheet">
          <div className="dimcard correctcard">
            <h2>Corriger la série {workIndexOf(exercise, corrected)}</h2>
            <p className="fine">Notée {corrected.loadKg == null ? "sans charge" : `${formatKg(corrected.loadKg)} kg`} × {corrected.reps ?? "—"}</p>
            <StepperCard
              kind="load"
              label="Charge"
              value={fixLoad}
              planned={corrected.warmup ? corrected.loadKg : exercise.planned.loadKg}
              unit={gearUnit(exercise)}
              stepLabel={`± ${formatKg(stepFor(exercise))} kg`}
              onStep={(direction) => onStep("fix", "load", direction)}
              onOpen={() => onOpenPad("fix", "load")}
              onRevert={() => onRevertField("fix", "load")}
            />
            <StepperCard
              kind="reps"
              label="Répétitions"
              value={fixReps}
              planned={corrected.warmup ? corrected.reps : exercise.planned.reps}
              unit="répétitions"
              stepLabel="± 1"
              onStep={(direction) => onStep("fix", "reps", direction)}
              onOpen={() => onOpenPad("fix", "reps")}
              onRevert={() => onRevertField("fix", "reps")}
            />
            <button type="button" className="btn" data-testid="save-correction" onClick={onCommitFix}>
              Enregistrer la correction
            </button>
            <button type="button" className="undoline" data-testid="undo-set" onClick={() => onUndo(corrected)}>
              Annuler cette série
            </button>
          </div>
        </div>
      ) : null}
      {pad ? (
        <NumberPad
          title={pad === "load" ? "Charge" : "Répétitions"}
          hint={pad === "load" ? `Pas de ${formatKg(stepFor(exercise))} kg` : "Pas de 1"}
          value={padText}
          unit={pad === "load" ? gearUnit(exercise) : "répétitions"}
          step={pad === "load" ? stepFor(exercise) : 1}
          onChange={onPadText}
          onClose={(accepted) => (accepted ? onAcceptPad() : onClosePad())}
        />
      ) : null}
      {resting && session.restEndsAt ? (
        <RestBand
          endsAt={session.restEndsAt}
          line={handoff ?? restCaption(exercise, current)}
          plates={null}
          rpe={doneWork?.set.rpe ?? null}
          onRpe={onRpe}
          onSkip={onSkipRest}
        />
      ) : doneWork ? (
        <EffortRow rpe={doneWork.set.rpe} onRpe={onRpe} />
      ) : null}
    </>
  );
}

function reviewBack(record: ProgressionRecord | null, exercise: ExerciseLog) {
  return record?.mode !== "hold" && record?.items.some((item) => item.exerciseId === exercise.id && !item.active && item.fromLoadKg != null);
}

function EndScreen({
  session,
  closing,
  onBilan,
  onReview,
  onRpe,
}: {
  session: Session;
  closing: boolean;
  onBilan: () => void;
  onReview: () => void;
  onRpe: (rpe: number) => void;
}) {
  const copy = closeCopy(session);
  const last = lastDoneWork(session);
  return (
    <div className="sport-end" data-testid="session-end">
      <p className="eyebrow">{session.title}</p>
      <h1>{copy.title}</h1>
      {session.startedAt ? <p className="meta num"><Elapsed from={session.startedAt} /></p> : null}
      <ul>
        {session.exercises.map((exercise) => (
          <li key={exercise.id}>{exercise.name}</li>
        ))}
      </ul>
      {last ? <EffortRow rpe={last.set.rpe} onRpe={onRpe} /> : null}
      <button type="button" className="btn" data-testid="finish-session" onClick={onBilan} disabled={closing}>
        {copy.action}
      </button>
      <button type="button" className="btn ghost" data-testid="review-session" onClick={onReview}>
        Corriger une série
      </button>
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
      sets: exercise.sets.map((set) => ({ ...set, done: false, skipped: false, reps: set.warmup ? set.reps : null, rpe: null })),
    })),
  };
}

function emptySets(session: Session): number {
  return session.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => !set.done && !set.skipped && !set.warmup).length, 0);
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

function gearUnit(exercise: ExerciseLog): string {
  const unit = unitOfExercise(exercise);
  if (unit === "kg/main") return "kg/main";
  if (unit === "kg/jambe") return "kg/jambe";
  if (unit === "corps" || unit === "poids du corps") return "kg";
  return "kg · barre";
}

function workIndexOf(exercise: ExerciseLog, set: SetLog): number {
  const work = exercise.sets.filter((item) => !item.warmup);
  const index = work.indexOf(set);
  return Math.max(1, index + 1);
}

function shortPlates(glance: string | null): string | null {
  if (!glance) return null;
  const match = glance.match(/^(.+?) kg de chaque côté/);
  return match ? `${match[1]} de chaque côté` : null;
}

function restCaption(exercise: ExerciseLog, current: SetLog): string {
  if (current.warmup) return "Repos · échauffement";
  const number = workIndexOf(exercise, current);
  const load = current.loadKg ?? exercise.planned.loadKg;
  return `Puis la série ${number}${load != null ? ` · ${formatKg(load)} kg` : ""}`;
}

function shortName(name: string) {
  return name.replace(/^Développé\s+/i, "");
}

function readNumber(value: string): number | null {
  const parsed = parseDecimalDraft(value, { min: 0, max: 1000 });
  return parsed.kind === "number" ? parsed.value : null;
}

function lastDoneWork(session: Session): { exercise: ExerciseLog; set: SetLog } | null {
  let found: { exercise: ExerciseLog; set: SetLog } | null = null;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.done && !set.warmup) found = { exercise, set };
    }
  }
  return found;
}

function transitionLine(session: Session, exercise: ExerciseLog): string | null {
  const index = session.exercises.findIndex((item) => item.id === exercise.id);
  if (index <= 0) return null;
  const anyWorkDone = exercise.sets.some((set) => !set.warmup && set.done);
  if (anyWorkDone) return null;
  const previous = session.exercises[index - 1];
  if (!previous.sets.some((set) => set.done)) return null;
  const open = exercise.sets.find((set) => !setSettled(set));
  const load = open?.loadKg ?? exercise.planned.loadKg;
  const unit = unitPhrase(open?.unit ?? unitOfExercise(exercise));
  return `${shortName(previous.name)} terminé. Puis ${shortName(exercise.name).toLowerCase()}${load != null ? ` · ${formatKg(load)} ${unit}` : ""}`;
}

function RestBand({
  endsAt,
  line,
  rpe,
  onRpe,
  onSkip,
}: {
  endsAt: number;
  line: string;
  plates: string | null;
  rpe: number | null;
  onRpe: (rpe: number) => void;
  onSkip: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    const onVis = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [endsAt]);
  useEffect(() => {
    if (now < endsAt || fired.current === endsAt) return;
    fired.current = endsAt;
    playChime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Repos terminé", { body: "Vous pouvez enchaîner la série suivante." });
      } catch {
        /* notification indisponible */
      }
    }
  }, [now, endsAt]);
  const left = Math.max(0, (endsAt - now) / 1000);
  return (
    <section className="restband" data-testid="rest-timer" aria-live="polite">
      <div className="resttop">
        <b className="num">{formatClock(left)}</b>
        <p>{line}</p>
        <button type="button" className="pass" onClick={onSkip}>
          Passer
        </button>
      </div>
      <EffortRow rpe={rpe} onRpe={onRpe} help={false} />
    </section>
  );
}

function EffortRow({ rpe, onRpe, help = true }: { rpe: number | null; onRpe: (rpe: number) => void; help?: boolean }) {
  return (
    <div className="rperow" data-testid="effort-row">
      <span>Effort</span>
      {[6, 7, 8, 9, 10].map((value) => (
        <button type="button" key={value} className={rpe === value ? "on" : ""} onClick={() => onRpe(value)} aria-label={`Effort ${value}`}>
          {value}
        </button>
      ))}
      {help && rpe == null ? <p className="fine">6 facile, 10 maximal.</p> : null}
    </div>
  );
}

function Elapsed({ from }: { from?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!from) return <span className="num">0:00</span>;
  return <span className="num">{formatClock((now - Date.parse(from)) / 1000)}</span>;
}

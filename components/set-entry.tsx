"use client";

import React from "react";
import type { ExerciseLog, SetLog } from "@/lib/types";
import { loadGap, repsGap, workIndex } from "@/lib/set-entry";
import { formatKg } from "@/lib/utils";

export function SetChips({
  exercise,
  currentId,
  onCorrect,
}: {
  exercise: ExerciseLog;
  currentId: string;
  onCorrect: (set: SetLog) => void;
}) {
  let work = 0;
  return (
    <div className="setchips" data-testid="set-chips">
      {exercise.sets.map((set) => {
        if (!set.warmup) work += 1;
        const current = set.id === currentId && !set.done;
        const label = set.warmup ? "Échauff." : `Série ${work}`;
        const detail = set.done
          ? `${set.loadKg == null ? "—" : formatKg(set.loadKg)} × ${set.reps ?? "—"}`
          : current
            ? "en cours"
            : set.loadKg != null && set.reps != null
              ? `${formatKg(set.loadKg)} × ${set.reps}`
              : "";
        return (
          <button
            type="button"
            key={set.id}
            className={`setchip${set.done ? " done" : ""}${current ? " now" : ""}`}
            data-testid={`set-chip-${set.id}`}
            aria-label={set.done ? `Corriger ${label}` : label}
            onClick={() => {
              if (set.done) onCorrect(set);
            }}
          >
            <b>{label}</b>
            {detail ? <small>{detail}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

export function StepperCard({
  kind,
  label,
  value,
  planned,
  unit,
  stepLabel,
  aside,
  onStep,
  onOpen,
  onRevert,
}: {
  kind: "load" | "reps";
  label: string;
  value: number | null;
  planned: number | null;
  unit: string;
  stepLabel: string;
  aside?: string | null;
  onStep: (direction: number) => void;
  onOpen: () => void;
  onRevert: () => void;
}) {
  const gap = kind === "load" ? loadGap(value, planned) : repsGap(value, planned);
  const shown = value == null ? "—" : kind === "load" ? formatKg(value) : String(value);
  return (
    <section className={`stepcard${gap ? " offplan" : ""}`} data-testid={kind === "load" ? "edit-load" : "edit-reps"}>
      <header>
        <span>{label}</span>
        {planned != null ? <small className="num">Prévu {kind === "load" ? `${formatKg(planned)} kg` : planned}</small> : null}
      </header>
      <div className="steprow">
        <button type="button" aria-label="Diminuer" data-testid={`${kind}-minus`} onClick={() => onStep(-1)}>
          −
        </button>
        <button type="button" className="stepvalue num" data-testid={`${kind}-value`} aria-label={kind === "load" ? "Saisir la charge" : "Saisir les répétitions"} onClick={onOpen}>
          <b>{shown}</b>
          <small>{unit}</small>
        </button>
        <button type="button" aria-label="Augmenter" data-testid={`${kind}-plus`} onClick={() => onStep(1)}>
          +
        </button>
      </div>
      <footer>
        {gap ? (
          <>
            <em data-testid={`${kind}-gap`}>{gap}</em>
            <button type="button" className="revert" data-testid={kind === "load" ? "as-planned" : "reps-revert"} onClick={onRevert}>
              Revenir à {planned == null ? "—" : kind === "load" ? formatKg(planned) : planned}
            </button>
          </>
        ) : (
          <span className="quiet">
            Comme prévu · {stepLabel}
            {aside ? <span className="aside">{aside}</span> : null}
          </span>
        )}
      </footer>
    </section>
  );
}

export function KeepCard({
  prompt,
  onNo,
  onYes,
}: {
  prompt: string;
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <div className="keepcard" data-testid="keep-load">
      <p>{prompt}</p>
      <div>
        <button type="button" data-testid="keep-no" onClick={onNo}>
          Non
        </button>
        <button type="button" className="yes" data-testid="keep-yes" onClick={onYes}>
          Garder
        </button>
      </div>
    </div>
  );
}

export function NumberPad({
  title,
  hint,
  value,
  unit,
  step,
  onChange,
  onClose,
}: {
  title: string;
  hint: string;
  value: string;
  unit: string;
  step: number;
  onChange: (next: string) => void;
  onClose: (accepted: boolean) => void;
}) {
  const nudge = (times: number) => {
    const current = Number(value.replace(",", ".")) || 0;
    const next = Math.max(0, Math.round((current + times * step) * 100) / 100);
    onChange(String(next).replace(".", ","));
  };
  const press = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "," && value.includes(",")) return;
    if (value.replace(",", "").length >= 5) return;
    onChange(`${value}${key}`);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
  return (
    <div className="numpad" role="dialog" aria-modal="true" aria-label={title} data-testid="number-pad">
      <header>
        <b>{title}</b>
        <small>{hint}</small>
      </header>
      <p className="padread num">
        <b>{value || "0"}</b>
        <span>{unit}</span>
      </p>
      <div className="padjumps">
        {[-2, -1, 1, 2].map((times) => (
          <button type="button" key={times} onClick={() => nudge(times)}>
            {times > 0 ? `+${times}` : times}
          </button>
        ))}
      </div>
      <div className="padkeys">
        {keys.map((key) => (
          <button type="button" key={key} aria-label={key === "⌫" ? "Effacer" : key} onClick={() => press(key)}>
            {key}
          </button>
        ))}
      </div>
      <button type="button" className="btn" data-testid="pad-ok" onClick={() => onClose(true)}>
        OK · {value || "0"} {unit}
      </button>
    </div>
  );
}

export function seriesTitle(exercise: ExerciseLog, set: SetLog): string {
  if (set.warmup) return "l’échauffement";
  const index = workIndex(exercise, set);
  const total = exercise.sets.filter((item) => !item.warmup).length;
  return `la série ${Math.max(1, index)} sur ${total}`;
}

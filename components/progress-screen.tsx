"use client";

import { useState } from "react";
import { useApp, type RangeKey } from "@/components/app-context";
import { SettingsButton } from "@/components/settings-button";
import { BodyMap, E1Chart, heatFill } from "@/components/chart";
import { bestLoads, bestReps, countsForProgress, e1rmSeries, heaviestSet, isHardSet, muscleTotals, samplesForExercise, type E1Point } from "@/lib/calc";
import { cardioSummary } from "@/lib/history";
import { unitPhrase } from "@/lib/display";
import { recordKey, resolvedUnit } from "@/lib/unit";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { bestE1rmLabel } from "@/lib/session";
import type { Muscle, Session } from "@/lib/types";
import { sessionsForHome } from "@/lib/home";
import { addDays, formatKg, formatLong, parseISODate } from "@/lib/utils";

const RANGES: { id: RangeKey; label: string }[] = [
  { id: 28, label: "4 sem" },
  { id: 84, label: "12 sem" },
  { id: 365, label: "1 an" },
];

export function ProgressScreen() {
  const app = useApp();
  const sessions = sessionsForHome(app.sessions);
  const options = recordOptions(sessions);
  const [choice, setChoice] = useState<string | null>(null);
  const selected =
    options.find((option) => option.key === choice) ??
    options.find((option) => option.name === app.progressName) ??
    options.find((option) => option.name === "Développé couché barre" && option.unit === "kg") ??
    options[0];
  const name = selected?.name ?? "";
  const unit = selected?.unit;
  const series = e1rmSeries(samplesForExercise(sessions, name, unit));
  const from = addDays(app.today, -app.range);
  const plotted = plot(series, from, app.today);
  const best = name ? bestE1rmLabel(sessions, name, unit) : null;
  const prior = [...series].reverse().find((point) => point.date < from);
  const inside = series.filter((point) => point.date >= from && point.date <= app.today);
  const start = prior?.bestSoFar ?? inside[0]?.bestSoFar ?? null;
  const end = inside.length ? inside[inside.length - 1].bestSoFar : (prior?.bestSoFar ?? null);
  const delta = start != null && end != null ? Math.round((end - start) * 10) / 10 : null;
  const totals = muscleTotals(sessions, addDays(app.today, -6), app.today);
  const fill = (muscle: Muscle) => heatFill(totals[muscle]);
  const records = bestLoads(sessions).slice(0, 4);
  const held = name ? heaviestSet(sessions, name, unit) : null;
  const repsRecord = name ? bestReps(sessions, name, unit) : null;
  const lastRun = [...sessions]
    .filter((session) => session.status === "done" && session.cardio)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const sentence = recordSentence(sessions, app.today);
  const lastGym = lastStrengthDate(sessions);

  return (
    <div className="screen" data-screen="progress">
      <div className="toprow">
        <div>
          <div className="eyebrow">Record</div>
          <h1 className="title">{name || "Progrès"}</h1>
        </div>
        <SettingsButton />
      </div>
      {sessions.some((session) => session.source === "demo") ? (
        <p className="quiet" data-testid="demo-stats">Ces chiffres viennent de la démonstration.</p>
      ) : null}
      {options.length === 0 ? (
        <article className="card">
          <div className="empty">
            <h2>Pas encore de courbe.</h2>
            <p>Terminez une séance, avec une charge et des répétitions. Le record apparaîtra ici, avec le nom de l’exercice.</p>
          </div>
        </article>
      ) : (
        <>
          <label className="fieldlabel" htmlFor="mouvement">
            Mouvement
          </label>
          <select
            id="mouvement"
            className="select"
            value={selected?.key ?? ""}
            onChange={(event) => {
              const next = options.find((option) => option.key === event.target.value);
              if (!next) return;
              setChoice(next.key);
              app.setProgressName(next.name);
            }}
          >
            {options.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          {unit && unit !== "kg" ? <p className="fine">Unité : {unitPhrase(unit)}. Elle n’est pas mélangée avec les kg totaux.</p> : null}
          <article className="card record-card" data-testid="record-load">
            <div className="kicker">Record de charge</div>
            <h2 className="num">{held ? `${formatKg(held.loadKg)} ${unitPhrase(held.unit)} × ${held.reps}` : "—"}</h2>
            <p className="meta">{held ? formatLong(held.date) : "Pas encore de série de travail."}</p>
          </article>
          <article className="card record-card" data-testid="record-reps">
            <div className="kicker">Record de répétitions</div>
            <h2 className="num">{repsRecord ? `${repsRecord.reps} répétitions` : "—"}</h2>
            <p className="meta">
              {repsRecord ? `à ${formatKg(repsRecord.loadKg)} ${unitPhrase(repsRecord.unit)} · ${formatLong(repsRecord.date)}` : "Pas encore noté."}
            </p>
          </article>
          <article className="card record-card" data-testid="record-epley">
            <div className="kicker">Estimation Epley</div>
            <h2 className="num">{best ? `${formatKg(Math.round(best.kg))} kg` : "—"}</h2>
            <p className="meta">
              {best
                ? `${best.detail}. Arrondie au kilo. De 1 à 10 répétitions. Ce n’est pas une garantie.`
                : "Pas d’estimation hors de 1 à 10 répétitions."}
            </p>
          </article>
          <div className="segment">
            {RANGES.map((item) => (
              <button key={item.id} type="button" className={app.range === item.id ? "on" : ""} aria-pressed={app.range === item.id} data-testid={`range-${item.id}`} onClick={() => app.setRange(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="section-label">
            Courbe de record <span>{delta != null && delta > 0 ? `+${formatKg(delta)} kg sur la période` : "période sélectionnée"}</span>
          </div>
          {sentence ? <p className="callout">{sentence}</p> : null}
          <E1Chart points={plotted} from={from} to={app.today} />
        </>
      )}
      <div className="section-label">
        Muscles <span>7 derniers jours · séries dures</span>
      </div>
      <div className="heat">
        <div className="heatrow">
          <div className="fig">
            <BodyMap side="front" fill={fill} />
            <em>Devant</em>
          </div>
          <div className="fig">
            <BodyMap side="back" fill={fill} />
            <em>Dos</em>
          </div>
        </div>
        <div className="legend">
          <span>0</span>
          <i className="scale" />
          <span>16+</span>
        </div>
      </div>
      <p className="callout">{callout(totals, lastGym)}</p>
      <p className="fine">Les couleurs comptent des séries dures notées. Elles ne disent pas si un muscle a récupéré.</p>
      {lastRun?.cardio ? (
        <p className="fine">
          Dernier {lastRun.cardio.sport.toLowerCase()} · {formatLong(lastRun.date)} · {cardioSummary(lastRun.cardio)}
        </p>
      ) : null}
      <div className="section-label">
        Records <span>une carte par exercice et par unité</span>
      </div>
      {records.length === 0 ? (
        <p className="fine">Les records s’affichent après une série de travail notée.</p>
      ) : (
        <div className="prchips">
          {records.map((record) => (
            <button
              type="button"
              key={recordKey(record.name, record.unit ?? "kg")}
              onClick={() => {
                setChoice(recordKey(record.name, record.unit ?? "kg"));
                app.setProgressName(record.name);
                app.setTab("progress");
              }}
            >
              <b>
                {record.name}
                {record.unit && record.unit !== "kg" ? ` · ${unitPhrase(record.unit)}` : ""}
              </b>
              <span className="num">
                {formatKg(record.loadKg)} {unitPhrase(record.unit)} × {record.reps} · {shortDate(record.date)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function recordOptions(sessions: Session[]): { key: string; name: string; unit: string; label: string }[] {
  const map = new Map<string, { key: string; name: string; unit: string; label: string }>();
  for (const session of sessions) {
    if (!countsForProgress(session)) continue;
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null) continue;
        const unit = resolvedUnit(set, exercise);
        const key = recordKey(exercise.name, unit);
        if (map.has(key)) continue;
        const phrase = unit === "kg" ? "" : ` · ${unitPhrase(unit)}`;
        map.set(key, { key, name: exercise.name, unit, label: `${exercise.name}${phrase}` });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

function plot(series: E1Point[], from: string, today: string) {
  const prior = [...series].reverse().find((point) => point.date < from);
  const inside = series.filter((point) => point.date >= from && point.date <= today);
  const points: (E1Point & { synthetic?: boolean; gapDays?: number })[] = [];
  if (prior) points.push({ ...prior, date: from, synthetic: true });
  for (const point of inside) {
    const previousDate = points.length === 0 ? point.date : points[points.length - 1].synthetic && prior ? prior.date : points[points.length - 1].date;
    points.push({ ...point, gapDays: daysBetween(previousDate, point.date) });
  }
  const last = points[points.length - 1];
  if (last && last.date < today) {
    const anchor = last.synthetic && prior ? prior.date : last.date;
    points.push({ ...last, date: today, synthetic: true, gapDays: daysBetween(anchor, today) });
  }
  return points;
}

function daysBetween(a: string, b: string) {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

function callout(totals: Record<Muscle, number>, lastGym: string | null) {
  const values = Object.values(totals);
  if (values.every((count) => count === 0)) {
    return lastGym ? `Dernier travail de salle : ${formatLong(lastGym)}.` : "Pas encore de travail de salle noté.";
  }
  const low = (Object.keys(totals) as Muscle[]).filter((muscle) => totals[muscle] > 0 && totals[muscle] < 8);
  const quiet = (Object.keys(totals) as Muscle[]).filter((muscle) => totals[muscle] === 0);
  const lowText = low.length
    ? `Moins de 8 séries dures notées : ${low.map((muscle) => `${MUSCLE_LABEL[muscle].toLowerCase()} (${totals[muscle]})`).join(", ")}. Ce compte ne dit pas si le muscle a récupéré.`
    : "Muscles notés cette semaine. Le nombre de séries n’est pas une mesure de récupération.";
  if (!quiet.length || quiet.length > 4) return lowText;
  return `${lowText} Sans série : ${quiet.map((muscle) => MUSCLE_LABEL[muscle].toLowerCase()).join(", ")}.`;
}

function lastStrengthDate(sessions: Session[]): string | null {
  const dates = sessions
    .filter((session) => session.status === "done" && !session.cardio && session.exercises.some((exercise) => exercise.sets.some((set) => isHardSet(set))))
    .map((session) => session.date)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function recordSentence(sessions: Session[], today: string): string | null {
  for (const session of sessions.filter((item) => item.date === today && item.status === "done")) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!isHardSet(set) || set.loadKg == null || set.reps == null || set.loadKg <= 0) continue;
        const priorLoads: number[] = [];
        for (const other of sessions) {
          if (other.date >= session.date) continue;
          for (const item of other.exercises) {
            if (item.name !== exercise.name) continue;
            for (const prior of item.sets) {
              if (isHardSet(prior) && prior.loadKg != null) priorLoads.push(prior.loadKg);
            }
          }
        }
        if (priorLoads.length && Math.max(...priorLoads) < set.loadKg - 0.01) {
          return `${formatKg(set.loadKg)} ${unitPhrase(set.unit ?? exercise.unit)} × ${set.reps} à ${exercise.name.toLowerCase()}, au-dessus de vos séries notées.`;
        }
      }
    }
  }
  return null;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(parseISODate(iso));
}

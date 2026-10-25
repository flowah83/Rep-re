"use client";

import { useApp, type RangeKey } from "@/components/app-context";
import { SettingsButton } from "@/components/settings-button";
import { BodyMap, E1Chart, heatFill } from "@/components/chart";
import { bestLoads, e1rmSeries, heaviestSet, isHardSet, muscleTotals, samplesForExercise, type E1Point } from "@/lib/calc";
import { cardioSummary } from "@/lib/history";
import { unitPhrase } from "@/lib/display";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { bestE1rmLabel } from "@/lib/session";
import type { Muscle, Session } from "@/lib/types";
import { addDays, formatKg, formatLong, parseISODate } from "@/lib/utils";

const RANGES: { id: RangeKey; label: string }[] = [
  { id: 28, label: "4 sem" },
  { id: 84, label: "12 sem" },
  { id: 365, label: "1 an" },
];

export function ProgressScreen() {
  const app = useApp();
  const names = [...new Set(app.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name)))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const name = app.progressName && names.includes(app.progressName)
    ? app.progressName
    : names.includes("Développé couché barre")
      ? "Développé couché barre"
      : (names[0] ?? "");
  const series = e1rmSeries(samplesForExercise(app.sessions, name));
  const from = addDays(app.today, -app.range);
  const plotted = plot(series, from, app.today);
  const best = name ? bestE1rmLabel(app.sessions, name) : null;
  const prior = [...series].reverse().find((point) => point.date < from);
  const inside = series.filter((point) => point.date >= from && point.date <= app.today);
  const start = prior?.bestSoFar ?? inside[0]?.bestSoFar ?? null;
  const end = inside.length ? inside[inside.length - 1].bestSoFar : (prior?.bestSoFar ?? null);
  const delta = start != null && end != null ? Math.round((end - start) * 10) / 10 : null;
  const totals = muscleTotals(app.sessions, addDays(app.today, -6), app.today);
  const fill = (muscle: Muscle) => heatFill(totals[muscle]);
  const records = bestLoads(app.sessions).slice(0, 3);
  const held = name ? heaviestSet(app.sessions, name) : null;
  const lastRun = [...app.sessions]
    .filter((session) => session.status === "done" && session.cardio)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const sentence = recordSentence(app.sessions, app.today);
  const lastGym = lastStrengthDate(app.sessions);

  return (
    <div className="screen" data-screen="progress">
      <div className="toprow">
        <div>
          <div className="eyebrow">Record estimé</div>
          <h1 className="title">Progrès</h1>
        </div>
        <SettingsButton />
      </div>
      {names.length === 0 ? (
        <article className="card">
          <div className="empty">
            <h2>Pas encore de courbe.</h2>
            <p>Terminez une séance, avec une charge et des répétitions. Le record estimé apparaîtra ici, sur de vraies dates.</p>
          </div>
        </article>
      ) : (
        <>
          <label className="fieldlabel" htmlFor="mouvement">
            Mouvement
          </label>
          <select id="mouvement" className="select" value={name} onChange={(event) => app.setProgressName(event.target.value)}>
            {names.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <div className="segment">
            {RANGES.map((item) => (
              <button key={item.id} type="button" className={app.range === item.id ? "on" : ""} aria-pressed={app.range === item.id} data-testid={`range-${item.id}`} onClick={() => app.setRange(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="hero">
            <div>
              <p className="who">Meilleure estimation tenue</p>
              <p className="kg num">
                {best ? formatKg(best.kg) : held && held.reps > 10 ? formatKg(held.loadKg) : "—"}
                <small>{best ? "kg" : held && held.reps > 10 ? `kg × ${held.reps}` : "kg"}</small>
              </p>
            </div>
            <div className="delta">
              {delta == null ? (
                "En attente"
              ) : delta > 0 ? (
                <>
                  <b className="num">+{formatKg(delta)} kg</b>
                  sur la période
                </>
              ) : (
                <>
                  <b>Record tenu</b>
                  sur la période
                </>
              )}
            </div>
          </div>
          {sentence ? <p className="callout">{sentence}</p> : null}
          {!best && held && held.reps > 10 ? (
            <p className="fine">Pas d’estimation au-delà de 10 répétitions. Charge tenue : {formatKg(held.loadKg)} kg × {held.reps}.</p>
          ) : null}
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
      {lastRun?.cardio ? (
        <p className="fine">
          Dernière course · {formatLong(lastRun.date)} · {cardioSummary(lastRun.cardio)}
        </p>
      ) : null}
      <div className="section-label">
        Records <span>les trois plus lourdes</span>
      </div>
      {records.length === 0 ? (
        <p className="fine">Les records s’affichent après une série de travail notée.</p>
      ) : (
        <div className="prchips">
          {records.map((record) => (
            <button
              type="button"
              key={record.name}
              onClick={() => {
                app.setProgressName(record.name);
                app.setTab("progress");
              }}
            >
              <b className="num">
                {formatKg(record.loadKg)} kg × {record.reps}
                {record.unit === "kg/main" ? " par haltère" : record.unit === "kg/jambe" ? " par jambe" : ""}
              </b>
              <span>
                {record.name} · {shortDate(record.date)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
    ? `Sous 8 séries dures : ${low.map((muscle) => `${MUSCLE_LABEL[muscle].toLowerCase()} (${totals[muscle]})`).join(", ")}.`
    : "Les muscles sollicités sont dans la zone tranquille.";
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

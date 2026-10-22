"use client";

import { useApp, type RangeKey } from "@/components/app-context";
import { BodyMap, E1Chart, heatFill } from "@/components/chart";
import { bestLoads, e1rmSeries, muscleTotals, samplesForExercise, type E1Point } from "@/lib/calc";
import { MUSCLE_LABEL } from "@/lib/exercises";
import { bestE1rmLabel } from "@/lib/session";
import type { Muscle } from "@/lib/types";
import { addDays, formatKg, parseISODate } from "@/lib/utils";

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

  return (
    <div className="screen" data-screen="progress">
      <div className="eyebrow">Record estimé</div>
      <h1 className="title">Progrès</h1>
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
              <button key={item.id} type="button" className={app.range === item.id ? "on" : ""} data-testid={`range-${item.id}`} onClick={() => app.setRange(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="hero">
            <div>
              <p className="who">Meilleure estimation tenue</p>
              <p className="kg num">
                {best ? formatKg(best.kg) : "—"}
                <small>kg</small>
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
      <p className="callout">{callout(totals)}</p>
      <div className="section-label">
        Records <span>charge la plus lourde</span>
      </div>
      {records.length === 0 ? (
        <p className="fine">Les records s’affichent après une série de travail notée.</p>
      ) : (
        <div className="prchips">
          {records.map((record) => (
            <div key={record.name}>
              <b className="num">{formatKg(record.loadKg)} kg</b>
              <span>
                {record.name} · {shortDate(record.date)}
              </span>
            </div>
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

function callout(totals: Record<Muscle, number>) {
  const values = Object.values(totals);
  if (values.every((count) => count === 0)) return "Aucune série dure sur les sept derniers jours.";
  const low = (Object.keys(totals) as Muscle[]).filter((muscle) => totals[muscle] > 0 && totals[muscle] < 8);
  const quiet = (Object.keys(totals) as Muscle[]).filter((muscle) => totals[muscle] === 0);
  const lowText = low.length
    ? `Sous 8 séries dures : ${low.map((muscle) => `${MUSCLE_LABEL[muscle].toLowerCase()} (${totals[muscle]})`).join(", ")}.`
    : "Les muscles sollicités sont dans la zone tranquille.";
  if (!quiet.length || quiet.length > 4) return lowText;
  return `${lowText} Sans série : ${quiet.map((muscle) => MUSCLE_LABEL[muscle].toLowerCase()).join(", ")}.`;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(parseISODate(iso));
}

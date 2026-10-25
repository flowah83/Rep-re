"use client";

import { useId, useState } from "react";
import { useApp } from "@/components/app-context";
import { CoachFace } from "@/components/coach-face";
import { SettingsButton } from "@/components/settings-button";
import { WeatherChip } from "@/components/weather-chip";
import { factForDate } from "@/lib/facts";
import { buildHome, type DayMark, type HomeModel, type LiftView } from "@/lib/home";
import { formatKg, formatLong } from "@/lib/utils";

export function HomeScreen() {
  const app = useApp();
  const model = buildHome(app.sessions, app.today);
  const openDay = (iso: string) => {
    app.setSelectedDate(iso);
    app.setTab("today");
  };

  return (
    <div className="screen home-screen" data-screen="home">
      <div className="toprow">
        <div>
          <div className="eyebrow">{formatLong(app.today)}</div>
          <h1 className="title">Accueil</h1>
        </div>
        <SettingsButton />
      </div>
      <WeatherChip />
      {model.empty ? <EmptyHome days={model.days} onDay={openDay} /> : <Dashboard model={model} onDay={openDay} />}
      <FactTile today={app.today} />
    </div>
  );
}

function Dashboard({ model, onDay }: { model: HomeModel; onDay: (iso: string) => void }) {
  const app = useApp();
  const openLift = (name: string) => {
    app.setProgressName(name);
    app.setTab("progress");
  };
  const lifts = [model.bench, model.squat].filter((lift): lift is LiftView => lift != null);
  return (
    <div className="home-grid">
      {model.record ? <RecordCard record={model.record} onOpen={() => openLift(model.record?.name ?? "")} /> : null}
      <HeldCard model={model} onDay={onDay} />
      {lifts.map((lift) => (
        <button type="button" key={lift.name} className={`home-card lift${lifts.length === 1 ? " span2" : ""}`} aria-label={lift.aria} onClick={() => openLift(lift.name)}>
          <p className="home-k">{lift.short}</p>
          <p className={`home-num${lift.short === "Squat" ? " sage" : ""}`}>
            {lift.kg == null ? "—" : formatKg(lift.kg)}
            {lift.kg != null ? <small> kg</small> : null}
          </p>
          <p className="home-sub">{lift.caption}</p>
          {lift.curve ? <Sparkline values={lift.points} tone={lift.short === "Squat" ? "sage" : "copper"} /> : <LevelMark />}
        </button>
      ))}
      {model.muscles.length ? (
        <article className="home-card span2" aria-label="Séries dures de la semaine">
          <p className="home-k">Séries</p>
          <ul className="mbars">
            {model.muscles.map((muscle) => (
              <li key={muscle.label}>
                <span>{muscle.label}</span>
                <span className="mtrack" aria-hidden="true">
                  <i style={{ width: `${barWidth(muscle.sets, model.muscles[0].sets)}%` }} />
                </span>
                <b className="num">{muscle.sets}</b>
                <span className="vh">{muscle.label}, {muscle.sets} séries.</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      {model.balance ? <BalanceCard balance={model.balance} /> : null}
      <button type="button" className="home-card span2 insight" data-testid="home-insight" onClick={() => app.setCoachOpen(true)}>
        <CoachFace />
        <span>{model.insight}</span>
      </button>
      {model.next ? (
        <button type="button" className="home-next" data-testid="home-next" onClick={() => onDay(model.next?.date ?? app.today)}>
          {model.next.label}
        </button>
      ) : null}
    </div>
  );
}

function EmptyHome({ days, onDay }: { days: DayMark[]; onDay: (iso: string) => void }) {
  const app = useApp();
  return (
    <article className="card home-empty">
      <div className="ringwrap hero" aria-hidden="true">
        <HeroRing ratio={0} />
      </div>
      <h2>Déposez le plan pour voir la semaine.</h2>
      <WeekStrip days={days} onDay={onDay} />
      <button type="button" className="btn" onClick={() => app.setSheet("import")}>
        Déposer le plan
      </button>
    </article>
  );
}

function HeldCard({ model, onDay }: { model: HomeModel; onDay: (iso: string) => void }) {
  const held = model.sessions.total > 0 ? model.sessions.done : model.sessions.extra;
  const total = model.sessions.total;
  return (
    <article className="home-card span2 held-card" aria-label={`${model.sessions.aria} ${model.heat.aria}`}>
      <div className="held-top">
        <div className="ringwrap hero">
          <HeroRing ratio={model.sessions.ratio} />
        </div>
        <div className="ring-copy">
          <p className="home-k">Séances tenues</p>
          <p className="held-num">
            {held}
            {total > 0 ? <small>/{total}</small> : null}
          </p>
          <p className="home-sub">{total > 0 ? "cette semaine" : "hors du plan"}</p>
        </div>
      </div>
      <WeekStrip days={model.days} onDay={onDay} />
      <div className="held-foot">
        <div>
          <p className="home-num">{model.heat.streak}<small> sem.</small></p>
          <p className="home-sub">d’affilée</p>
        </div>
        <div className="heat" aria-hidden="true">
          {model.heat.rows.map((row, index) => (
            <div className="heat-row" key={index}>
              {row.map((cell, day) => (
                <i key={day} className={`l${cell.kind === "done" ? cell.level : 0}${cell.kind === "missed" ? " miss" : ""}${cell.kind === "planned" ? " plan" : ""}${cell.today ? " today" : ""}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function WeekStrip({ days, onDay }: { days: DayMark[]; onDay: (iso: string) => void }) {
  return (
    <div className="week home-week" aria-label="Semaine">
      {days.map((day) => (
        <button type="button" key={day.iso} className={dayClass(day)} aria-label={dayAria(day)} onClick={() => onDay(day.iso)}>
          <span className="wd">{day.letter}</span>
          <span className="dn num">{day.number}</span>
          <i className="mark" />
        </button>
      ))}
    </div>
  );
}

function HeroRing({ ratio }: { ratio: number }) {
  const r = 42;
  const turn = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <svg className="ringsvg" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--copper)" strokeOpacity="0.16" strokeWidth="13" />
      {clamped > 0 ? (
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--copper)"
          strokeWidth="13"
          strokeLinecap={clamped > 0.985 ? "butt" : "round"}
          strokeDasharray={`${turn * clamped} ${turn}`}
          transform="rotate(-90 60 60)"
        />
      ) : null}
    </svg>
  );
}

function FactTile({ today }: { today: string }) {
  const [shift, setShift] = useState(0);
  const fact = factForDate(today, shift);
  return (
    <button type="button" className="fact" data-testid="home-fact" aria-label={`Le saviez-vous ? ${fact} Toucher pour le fait suivant.`} onClick={() => setShift((value) => value + 1)}>
      <span className="home-k">Le saviez-vous ?</span>
      <span>{fact}</span>
    </button>
  );
}

function RecordCard({ record, onOpen }: { record: NonNullable<HomeModel["record"]>; onOpen: () => void }) {
  return (
    <button type="button" className="home-card span2 record" aria-label={record.aria} onClick={onOpen}>
      <p className="home-k">Record</p>
      <p className="home-num sage">
        {formatKg(record.loadKg)}
        <small> × {record.reps}</small>
      </p>
      {record.e1rm != null ? <p className="home-sub">{formatKg(record.e1rm)} kg estimés</p> : null}
      {record.points.length >= 3 ? <Sparkline values={record.points} tone="sage" /> : <LevelMark />}
    </button>
  );
}

function BalanceCard({ balance }: { balance: NonNullable<HomeModel["balance"]> }) {
  return (
    <article className="home-card span2" aria-label={`Poussée ${balance.push} séries, tirage ${balance.pull}. Haut du corps ${balance.upper}, jambes ${balance.lower}.`}>
      <p className="home-k">Équilibre</p>
      {balance.push + balance.pull > 0 ? <Pair left="Poussée" right="Tirage" a={balance.push} b={balance.pull} /> : null}
      {balance.upper + balance.lower > 0 ? <Pair left="Haut" right="Jambes" a={balance.upper} b={balance.lower} sage /> : null}
    </article>
  );
}

function Pair({ left, right, a, b, sage = false }: { left: string; right: string; a: number; b: number; sage?: boolean }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="pair">
      <div>
        <span>{left}</span>
        <b className="num">{a}</b>
        <i className={sage ? "sage" : ""} style={{ width: a === 0 ? "0%" : `${Math.max(8, (a / max) * 100)}%` }} />
      </div>
      <div>
        <span>{right}</span>
        <b className="num">{b}</b>
        <i className={sage ? "" : "sage"} style={{ width: b === 0 ? "0%" : `${Math.max(8, (b / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: "copper" | "sage" }) {
  const raw = useId().replace(/:/g, "");
  const color = tone === "sage" ? "var(--sage)" : "var(--copper)";
  if (values.length < 2) return <LevelMark />;
  const geo = sparkGeometry(values, 160, 40);
  const last = geo.pts[geo.pts.length - 1];
  return (
    <svg className="spark" viewBox="0 0 160 40" aria-hidden="true">
      <line x1="4" x2="156" y1="12" y2="12" stroke="var(--line)" />
      <line x1="4" x2="156" y1="28" y2="28" stroke="var(--line)" />
      <path d={geo.area} fill={`url(#${raw})`} />
      <path d={geo.line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} />
      <defs>
        <linearGradient id={raw} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LevelMark() {
  return (
    <svg className="spark" viewBox="0 0 160 40" aria-hidden="true">
      <line x1="8" x2="152" y1="24" y2="24" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="24" r="3.2" fill="var(--copper)" />
    </svg>
  );
}

function sparkGeometry(values: number[], width: number, height: number) {
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  let line = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let index = 0; index < pts.length - 1; index += 1) {
    const p0 = pts[index - 1] ?? pts[index];
    const p1 = pts[index];
    const p2 = pts[index + 1];
    const p3 = pts[index + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${height} L ${pts[0][0].toFixed(1)} ${height} Z`;
  return { line, area, pts };
}

function barWidth(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(8, Math.round((value / max) * 100));
}

function dayClass(day: DayMark): string {
  const kind = day.kind === "done" ? " done" : day.kind === "planned" ? " plan" : day.kind === "missed" ? " missed" : day.kind === "active" ? " live" : "";
  return `day${day.today ? " today" : ""}${kind}`;
}

function dayAria(day: DayMark): string {
  const state = day.kind === "done" ? "faite" : day.kind === "missed" ? "manquée" : day.kind === "planned" ? "prévue" : day.kind === "active" ? "en cours" : "repos";
  return `${formatLong(day.iso)}, ${state}. Ouvre Aujourd’hui.`;
}

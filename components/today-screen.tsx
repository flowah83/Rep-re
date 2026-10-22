"use client";

import { useApp } from "@/components/app-context";
import type { Session } from "@/lib/types";
import { addDays, formatKg, formatRestLabel, mondayOf, parseISODate, weekdayLetter } from "@/lib/utils";

export function TodayScreen() {
  const app = useApp();
  const monday = mondayOf(app.today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const visible = app.sessions
    .filter((session) => session.date === app.selectedDate)
    .sort((a, b) => rank(a) - rank(b) || (a.time ?? "").localeCompare(b.time ?? ""));
  const hasRealWork = app.sessions.some((session) => session.status !== "planned" && session.source !== "demo");
  const backupOld =
    hasRealWork &&
    (!app.settings.lastBackupAt || Date.now() - Date.parse(app.settings.lastBackupAt) > 7 * 86400000);

  return (
    <div className="screen" data-screen="today">
      <div className="toprow">
        <div>
          <div className="eyebrow">{longDate(app.selectedDate === app.today ? app.today : app.selectedDate)}</div>
          <h1 className="title">{app.selectedDate === app.today ? "Aujourd’hui" : "Ce jour-là"}</h1>
        </div>
        <button type="button" className="iconbtn" aria-label="Réglages" data-testid="open-settings" onClick={() => app.setSheet("settings")}>
          <Gear />
        </button>
      </div>
      <div className="week">
        {days.map((iso) => {
          const list = app.sessions.filter((session) => session.date === iso);
          const done = list.some((session) => session.status === "done" || session.status === "active");
          const plan = list.some((session) => session.status === "planned");
          return (
            <button
              type="button"
              key={iso}
              className={`day${iso === app.today ? " today" : ""}${iso === app.selectedDate ? " selected" : ""}${done ? " done" : plan ? " plan" : ""}`}
              onClick={() => app.setSelectedDate(iso)}
            >
              <span className="wd">{weekdayLetter(iso)}</span>
              <span className="dn num">{parseISODate(iso).getDate()}</span>
              <i className="mark" />
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <article className="card">
          <div className="empty">
            <h2>Aucune séance {app.selectedDate === app.today ? "aujourd’hui" : "ce jour-là"}.</h2>
            <p>Importez le plan de Chef sport, ou créez une séance vous-même. Rien n’est inventé à votre place.</p>
          </div>
          <button type="button" className="btn" onClick={() => app.setSheet("import")}>
            Importer
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              app.setEditId(null);
              app.setSheet("edit");
            }}
          >
            Créer une séance
          </button>
        </article>
      ) : (
        visible.map((session, index) => (
          <article className="card" key={session.id}>
            <SessionCard session={session} primary={index === 0} />
          </article>
        ))
      )}
      {backupOld ? (
        <p className="quiet">La dernière sauvegarde date de plus d’une semaine. Un fichier exporté depuis les réglages vous met à l’abri.</p>
      ) : null}
    </div>
  );
}

function SessionCard({ session, primary }: { session: Session; primary: boolean }) {
  const app = useApp();
  const minutes = Math.round(session.exercises.reduce((sum, exercise) => sum + (exercise.sets.length * exercise.planned.restSec) / 60, 0));
  const action = session.status === "done" ? "Voir le bilan" : session.status === "active" ? "Reprendre" : "Commencer";
  return (
    <>
      <div className="kicker">
        <span>{session.source === "manual" ? "Séance personnelle" : session.status === "done" ? "Séance notée" : "Plan de Chef sport"}</span>
        {session.time ? <span className="num">{session.time}</span> : null}
      </div>
      <h2>{session.title}</h2>
      <p className="meta">
        {session.intention ? `${capitalize(session.intention)} · ` : ""}
        environ {Math.max(30, minutes)} min · {session.exercises.length} exercice{session.exercises.length > 1 ? "s" : ""}
      </p>
      {session.coachNote ? <p className="quote">{session.coachNote}</p> : null}
      {session.exercises.map((exercise) => (
        <div className="ex" key={exercise.id}>
          <div>
            <b>{exercise.name}</b>
            <small className="num">{planLine(exercise.planned.loadKg, exercise.planned.sets, exercise.planned.reps, exercise.planned.restSec)}</small>
          </div>
          {exercise.planned.rpe != null ? <em>RPE {exercise.planned.rpe}</em> : null}
        </div>
      ))}
      <button
        type="button"
        className="btn"
        data-testid={primary ? "start-session" : undefined}
        onClick={() => {
          if (session.status === "done") app.openBilan(session.id);
          else void app.beginSession(session);
        }}
      >
        {action}
      </button>
      {session.status === "planned" ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            app.setEditId(session.id);
            app.setSheet("edit");
          }}
        >
          Modifier
        </button>
      ) : null}
    </>
  );
}

function planLine(load: number | null, sets: number, reps: number | null, rest: number) {
  const loadBit = load != null ? `${formatKg(load)} kg · ` : "";
  const repsBit = reps != null ? `${sets} × ${reps}` : `${sets} séries`;
  return `${loadBit}${repsBit} · repos ${formatRestLabel(rest)}`;
}

function longDate(iso: string) {
  const raw = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso + "T12:00:00"),
  );
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rank(session: Session) {
  if (session.status === "active") return 0;
  if (session.status === "planned") return 1;
  return 2;
}

function Gear() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 5.5h12M3 9h12M3 12.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.5" cy="5.5" r="1.5" fill="var(--bg-elev)" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="9" r="1.5" fill="var(--bg-elev)" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7.5" cy="12.5" r="1.5" fill="var(--bg-elev)" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

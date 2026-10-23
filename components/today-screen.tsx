"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { cardioSummary } from "@/lib/history";
import { describePlan } from "@/lib/display";
import { buildAdjustments, keepsCoachPlan, loadProgression, revertAdjustment, saveProgression, type Adjustment } from "@/lib/progression";
import type { Session } from "@/lib/types";
import { addDays, formatKg, mondayOf, parseISODate, weekdayLetter } from "@/lib/utils";

export function TodayScreen() {
  const app = useApp();
  const monday = mondayOf(app.selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const visible = app.sessions
    .filter((session) => session.date === app.selectedDate)
    .sort((a, b) => rank(a) - rank(b) || (a.time ?? "").localeCompare(b.time ?? ""));
  const active = app.sessions.find((session) => session.status === "active");
  const upcoming = nextSession(app.sessions, app.selectedDate);
  const hasRealWork = app.sessions.some((session) => session.status !== "planned" && session.source !== "demo");
  const importedToday = readImportedOn() === app.today;
  const backupOld =
    hasRealWork &&
    !importedToday &&
    (!app.settings.lastBackupAt || Date.now() - Date.parse(app.settings.lastBackupAt) > 7 * 86400000);
  const showBand = Boolean(active && !visible.some((session) => session.id === active.id));

  return (
    <div className="screen" data-screen="today">
      <div className="toprow">
        <div>
          <div className="eyebrow">{longDate(app.selectedDate === app.today ? app.today : app.selectedDate)}</div>
          <h1 className="title">{app.selectedDate === app.today ? "Aujourd’hui" : "Ce jour-là"}</h1>
        </div>
        <button type="button" className="iconbtn text" aria-label="Réglages" data-testid="open-settings" onClick={() => app.setSheet("settings")}>
          <Gear />
          <span>Réglages</span>
        </button>
      </div>
      <div className="weekrow">
        <button type="button" className="weeknav" aria-label="Semaine précédente" data-testid="week-prev" onClick={() => app.setSelectedDate(addDays(app.selectedDate, -7))}>
          ‹
        </button>
        <div className="week">
          {days.map((iso) => {
            const list = app.sessions.filter((session) => session.date === iso);
            const live = list.some((session) => session.status === "active");
            const done = list.some((session) => session.status === "done");
            const plan = list.some((session) => session.status === "planned");
            const mark = live ? " live" : done ? " done" : plan ? " plan" : "";
            return (
              <button
                type="button"
                key={iso}
                className={`day${iso === app.today ? " today" : ""}${iso === app.selectedDate ? " selected" : ""}${mark}`}
                onClick={() => app.setSelectedDate(iso)}
              >
                <span className="wd">{weekdayLetter(iso)}</span>
                <span className="dn num">{parseISODate(iso).getDate()}</span>
                <i className="mark" />
              </button>
            );
          })}
        </div>
        <button type="button" className="weeknav" aria-label="Semaine suivante" data-testid="week-next" onClick={() => app.setSelectedDate(addDays(app.selectedDate, 7))}>
          ›
        </button>
      </div>
      {showBand && active ? (
        <button type="button" className="liveband" data-testid="resume-band" onClick={() => app.openSession(active.id)}>
          <span>{active.title} en cours</span>
          <span>Reprendre</span>
        </button>
      ) : null}
      {visible.length === 0 && upcoming ? (
        <article className="card">
          <SessionCard session={upcoming} primary upcoming />
        </article>
      ) : visible.length === 0 ? (
        <article className="card">
          <div className="empty">
            {app.sessions.length === 0 ? (
              <>
                <h2>Aucune séance {app.selectedDate === app.today ? "aujourd’hui" : "ce jour-là"}.</h2>
                <p>Importez le plan de Chef sport, ou créez une séance vous-même. Rien n’est inventé à votre place.</p>
              </>
            ) : (
              <>
                <h2>Rien de prévu {app.selectedDate === app.today ? "aujourd’hui" : "ce jour-là"}.</h2>
                <p>Les prochains jours sont libres. Vous pouvez créer une séance, ou importer un plan plus tard.</p>
              </>
            )}
          </div>
          {app.sessions.length === 0 ? (
            <button type="button" className="btn" onClick={() => app.setSheet("import")}>
              Importer
            </button>
          ) : null}
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

function SessionCard({ session, primary, upcoming = false }: { session: Session; primary: boolean; upcoming?: boolean }) {
  const app = useApp();
  const minutes = Math.round(session.exercises.reduce((sum, exercise) => sum + (exercise.sets.length * exercise.planned.restSec) / 60, 0));
  const action = session.status === "done" ? "Voir le bilan" : session.status === "active" ? "Reprendre" : "Commencer";
  const shown = session.exercises.slice(0, 2);
  const rest = session.exercises.slice(2);
  const record = loadProgression(session.id);
  const canRevert =
    session.status === "active" && record?.mode === "applied" && record.items.some((item) => item.active);
  return (
    <>
      <div className="kicker">
        <span>{upcoming ? whenLabel(session) : session.source === "manual" ? "Séance personnelle" : session.status === "done" ? "Séance notée" : "Plan de Chef sport"}</span>
        {!upcoming && session.time ? <span className="num">{session.time}</span> : null}
      </div>
      <h2>{session.title}</h2>
      <p className="meta">
        {session.cardio
          ? cardioSummary(session.cardio)
          : `${session.intention ? `${capitalize(session.intention)} · ` : ""}environ ${Math.max(session.cardio ? 20 : 30, minutes || session.durationMin || 30)} min · ${session.exercises.length} exercice${session.exercises.length > 1 ? "s" : ""}`}
      </p>
      <HoldNote session={session} />
      <RiseNote session={session} />
      {session.cardio ? null : (
        <>
          {shown.map((exercise) => (
            <div className="ex" key={exercise.id}>
              <div>
                <b>{exercise.name}</b>
                <small className="num">{describePlan(exercise, session)}</small>
                {exercise.note ? <small className="exnote">{exercise.note}</small> : null}
              </div>
              {exercise.planned.rpe != null ? <em>RPE {exercise.planned.rpe}</em> : null}
            </div>
          ))}
          {rest.length ? <p className="meta">Puis {rest.map((exercise) => exercise.name.toLowerCase()).join(", ")}.</p> : null}
          {rest.filter((exercise) => exercise.note).map((exercise) => (
            <p className="exnote" key={`${exercise.id}-note`}>
              {exercise.name}. {exercise.note}
            </p>
          ))}
        </>
      )}
      <button
        type="button"
        className="btn"
        data-testid={primary ? "start-session" : undefined}
        onClick={() => {
          if (session.status === "done") app.openBilan(session.id);
          else if (session.status === "active") app.openSession(session.id);
          else {
            app.setSelectedDate(session.date);
            void app.beginSession(session);
          }
        }}
      >
        {action}
      </button>
      {canRevert && record ? (
        <button
          type="button"
          className="btn ghost"
          data-testid="progression-revert-plan"
          onClick={() => {
            const active = record.items.filter((item) => item.active);
            void app.updateSession(session.id, (current) => active.reduce((next, item) => revertAdjustment(next, item), current));
            saveProgression(session.id, { ...record, choice: "reverted", items: record.items.map((item) => ({ ...item, active: false })) });
            app.flash("Le plan de Chef sport est remis.");
          }}
        >
          Revenir au plan
        </button>
      ) : null}
      {session.status === "planned" && !upcoming ? (
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

function HoldNote({ session }: { session: Session }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  if (session.status !== "planned" || !keepsCoachPlan(session)) return null;
  const gaps = buildAdjustments(session, app.sessions).filter(isIncrease);
  const note = session.coachNote?.trim();
  return (
    <div className="holdnote" data-testid="plan-hold">
      <p>
        <b>On garde le plan de Chef sport.</b>
      </p>
      <p>{note ? `${note}${/accepter/i.test(note) ? "" : " Rien à accepter."}` : "Il reste comme Chef sport l’a écrit. Rien à accepter."}</p>
      {gaps.length ? (
        <button type="button" className="linkish" data-testid="plan-gaps" onClick={() => setOpen((value) => !value)}>
          Voir les {gaps.length} écart{gaps.length > 1 ? "s" : ""}
        </button>
      ) : null}
      {open ? (
        <ul className="progression-list">
          {gaps.map((item) => (
            <li key={item.exerciseId}>
              <b>{item.name}</b>
              <p className="shift">
                {item.fromLoadKg != null ? `${formatKg(item.fromLoadKg)} kg` : "le plan"} → {item.toLoadKg != null ? `${formatKg(item.toLoadKg)} kg` : "sans charge"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RiseNote({ session }: { session: Session }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  if (session.status !== "planned" || keepsCoachPlan(session)) return null;
  const existing = loadProgression(session.id);
  if (existing) return null;
  const items = buildAdjustments(session, app.sessions);
  if (!items.length) return null;
  return (
    <div className="holdnote" data-testid="plan-rise">
      <p>
        {items.length === 1 ? "1 charge peut monter quand vous commencez." : `${items.length} charges peuvent monter quand vous commencez.`} Le plan reste tant que vous ne touchez à rien.
      </p>
      <button
        type="button"
        className="linkish"
        data-testid="stay-on-plan"
        onClick={() => {
          saveProgression(session.id, { choice: "reverted", mode: "applied", items: items.map((item) => ({ ...item, active: false })) });
          app.flash("On reste au plan.");
        }}
      >
        Rester au plan
      </button>
      <button type="button" className="linkish" onClick={() => setOpen((value) => !value)}>
        Voir le détail
      </button>
      {open ? (
        <ul className="progression-list">
          {items.map((item) => (
            <li key={item.exerciseId}>
              <b>{item.name}</b>
              <p className="shift">{item.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isIncrease(item: Adjustment): boolean {
  if (item.fromLoadKg != null && item.toLoadKg != null) return item.toLoadKg > item.fromLoadKg + 0.01;
  return false;
}

function nextSession(sessions: Session[], from: string): Session | null {
  return (
    sessions
      .filter((session) => session.status !== "done" && session.date > from)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0] ?? null
  );
}

function whenLabel(session: Session) {
  const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(parseISODate(session.date));
  return `Prochaine séance · ${day}${session.time ? ` ${session.time}` : ""}`;
}

function readImportedOn() {
  try {
    return localStorage.getItem("repere-imported-on");
  } catch {
    return null;
  }
}

function longDate(iso: string) {
  const raw = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + "T12:00:00"));
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

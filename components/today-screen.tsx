"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { SettingsButton } from "@/components/settings-button";
import { cardioSummary } from "@/lib/history";
import { describePlan, estimateMinutes } from "@/lib/display";
import { coachIsReady } from "@/lib/coach-store";
import { StartActions } from "@/components/start-actions";
import { RestPill } from "@/components/rest-pill";
import { buildAdjustments, keepsCoachPlan, loadProgression, revertAdjustment, saveProgression, type Adjustment } from "@/lib/progression";
import type { Session } from "@/lib/types";
import { INSTALL_LINE, backupReminder } from "@/lib/backup";
import { dayRepere, installHelp, shouldOfferInstall } from "@/lib/identity";
import { resumeGlance } from "@/lib/resume";
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
  const reminder = backupReminder(app.settings);
  const showReminder = hasRealWork && !importedToday && reminder.kind !== "recent";
  const showBand = Boolean(active && !visible.some((session) => session.id === active.id));

  return (
    <div className="screen" data-screen="today">
      <div className="toprow">
        <div>
          <div className="eyebrow">{longDate(app.selectedDate === app.today ? app.today : app.selectedDate)}</div>
          <h1 className="title">{app.selectedDate === app.today ? "Aujourd’hui" : "Ce jour-là"}</h1>
        </div>
        <SettingsButton />
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
      {showBand && active ? <ResumeCard session={active} /> : null}
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
      {showReminder ? <p className="quiet" data-testid="backup-reminder">{reminder.text}</p> : null}
      <InstallOffer />
    </div>
  );
}

function SessionCard({ session, primary, upcoming = false }: { session: Session; primary: boolean; upcoming?: boolean }) {
  const app = useApp();
  const minutes = estimateMinutes(session);
  const shown = session.exercises.slice(0, 2);
  const rest = session.exercises.slice(2);
  const record = loadProgression(session.id);
  const canRevert =
    session.status === "active" && record?.mode === "applied" && record.items.some((item) => item.active);
  const repere = dayRepere(session, app.sessions, app.today);
  if (session.status === "active") {
    return (
      <>
        <ResumeBody session={session} repere={repere} />
        {canRevert && record ? <RevertPlan session={session} record={record} /> : null}
      </>
    );
  }
  return (
    <>
      {repere ? <DayRepereLine repere={repere} /> : null}
      <div className="kicker">
        <span>
          {upcoming
            ? whenLabel(session)
            : session.source === "demo"
              ? "Démonstration"
              : session.source === "manual"
                ? "Séance personnelle"
                : session.status === "done"
                  ? "Séance notée"
                  : "Plan de Chef sport"}
        </span>
        {!upcoming && session.time ? <span className="num">{session.time}</span> : null}
      </div>
      <h2>{session.title}</h2>
      <p className="meta">
        {session.cardio
          ? cardioSummary(session.cardio)
          : `${session.intention ? `${capitalize(session.intention)} · ` : ""}environ ${minutes} min · ${session.exercises.length} exercice${session.exercises.length > 1 ? "s" : ""}`}
      </p>
      <HoldNote session={session} />
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
      <StartActions session={session} place="card" primary={primary} allowEdit={!upcoming} />
    </>
  );
}

function ResumeCard({ session }: { session: Session }) {
  const app = useApp();
  const repere = dayRepere(session, app.sessions, app.today);
  return (
    <article className="card resume-card" data-testid="resume-card">
      <ResumeBody session={session} repere={repere} />
    </article>
  );
}

function DayRepereLine({ repere }: { repere: NonNullable<ReturnType<typeof dayRepere>> }) {
  return (
    <p className="day-repere" data-testid="day-repere">
      <span>{repere.kicker}.</span> {repere.last}
    </p>
  );
}

function ResumeBody({ session, repere }: { session: Session; repere: ReturnType<typeof dayRepere> }) {
  const app = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const glance = resumeGlance(session, now);
  return (
    <>
      {repere ? <DayRepereLine repere={repere} /> : null}
      <div className="resume-status">
        <span className="resume-live"><i className="livedot" aria-hidden="true" />{glance.status}</span>
        <RestPill session={session} chip />
      </div>
      <h2>{session.title}</h2>
      {glance.nextLine ? <p className="meta">{glance.nextLine}</p> : null}
      {glance.target ? <p className="resume-target">{glance.target}</p> : null}
      {glance.dots.length ? (
        <div className="dots" aria-hidden="true">
          {glance.dots.map((dot, index) => (
            <i key={`${dot}-${index}`} className={dot} />
          ))}
        </div>
      ) : null}
      <p className="meta">{glance.saved}</p>
      <button type="button" className="btn" data-testid="resume-session" onClick={() => app.openSession(session.id)}>
        Reprendre la séance
      </button>
      {glance.after ? (
        <div className="after-row">
          <span>Après</span>
          <b>{glance.after}</b>
        </div>
      ) : null}
    </>
  );
}

function RevertPlan({ session, record }: { session: Session; record: NonNullable<ReturnType<typeof loadProgression>> }) {
  const app = useApp();
  return (
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
  );
}

function InstallOffer() {
  const app = useApp();
  const [standalone, setStandalone] = useState(false);
  const [help, setHelp] = useState("");
  useEffect(() => {
    const native = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(native || window.matchMedia("(display-mode: standalone)").matches);
    setHelp(installHelp(navigator.userAgent));
  }, []);
  if (!shouldOfferInstall({ sessions: app.sessions, dismissed: app.settings.installDismissed === true, standalone })) return null;
  return (
    <aside className="card install-offer" data-testid="install-offer">
      <p className="eyebrow">Repère</p>
      <h2>Sur l’écran d’accueil</h2>
      <p>{help}</p>
      <p className="fine">{INSTALL_LINE}</p>
      <button type="button" className="btn ghost" data-testid="install-dismiss" onClick={() => void app.updateSettings({ installDismissed: true })}>
        Plus tard
      </button>
    </aside>
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
      <div className="linkrow">
        {gaps.length ? (
          <button type="button" className="linkish" data-testid="plan-gaps" onClick={() => setOpen((value) => !value)}>
            Voir les {gaps.length} écart{gaps.length > 1 ? "s" : ""}
          </button>
        ) : null}
        {coachIsReady() ? (
          <button type="button" className="linkish" data-testid="ask-coach" onClick={() => app.setCoachOpen(true)}>
            Demander au coach
          </button>
        ) : null}
      </div>
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


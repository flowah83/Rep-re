"use client";

import { useEffect, useRef } from "react";
import { AppProvider, useApp, useBoot } from "@/components/app-context";
import { BilanScreen } from "@/components/bilan-screen";
import { GestureScreen } from "@/components/gesture-screen";
import { HistoryScreen } from "@/components/history-screen";
import { ProgressScreen } from "@/components/progress-screen";
import { SessionScreen } from "@/components/session-screen";
import { CoachLayer } from "@/components/coach-panel";
import { ScrollEdge } from "@/components/scroll-edge";
import { Sheets } from "@/components/sheets";
import { PreviewScreen } from "@/components/preview-screen";
import { TodayScreen } from "@/components/today-screen";
import { ImportSummary } from "@/components/sheets";
import { Button } from "@/components/ui/button";

export function RepereApp() {
  const boot = useBoot();
  if (boot.error) {
    return (
      <div className="boot" data-testid="app-ready">
        <div style={{ padding: 24, maxWidth: 420 }}>
          <h1 className="title">Repère</h1>
          <p className="quiet">{boot.error}</p>
        </div>
      </div>
    );
  }
  if (!boot.state) return <div className="boot">Repère</div>;
  return (
    <AppProvider initial={boot.state}>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const app = useApp();
  useOverlayHistory(Boolean(app.overlay), app.closeOverlay);
  const noted = useRef(false);
  useEffect(() => {
    if (noted.current || !app.settings.onboarded || app.overlay) return;
    noted.current = true;
    try {
      const key = "repere-seen-release";
      const seen = localStorage.getItem(key);
      if (!seen && app.sessions.length > 0) app.flash("Repère a été mis à jour.");
      localStorage.setItem(key, "2");
    } catch {
      /* stockage privé */
    }
  }, [app]);
  if (!app.settings.onboarded) return <Onboarding />;
  return (
    <div className="app" data-testid="app-ready">
      <div className="shell" inert={app.overlay || app.sheet ? true : undefined}>
        <div hidden={app.tab !== "today"}>
          <TodayScreen />
        </div>
        <div hidden={app.tab !== "progress"}>
          <ProgressScreen />
        </div>
        <div hidden={app.tab !== "history"}>
          <HistoryScreen />
        </div>
        <nav className="tabbar" aria-label="Sections">
          <button type="button" className={`tab${app.tab === "today" ? " on" : ""}`} data-testid="tab-today" onClick={() => app.setTab("today")}>
            <TodayIcon />
            Aujourd’hui
          </button>
          <button type="button" className={`tab${app.tab === "progress" ? " on" : ""}`} data-testid="tab-progress" onClick={() => app.setTab("progress")}>
            <TrendIcon />
            Progrès
          </button>
          <button type="button" className={`tab${app.tab === "history" ? " on" : ""}`} data-testid="tab-history" onClick={() => app.setTab("history")}>
            <BookIcon />
            Carnet
          </button>
        </nav>
      </div>
      {app.overlay?.kind === "session" ? <SessionScreen key={app.overlay.id} id={app.overlay.id} /> : null}
      {app.overlay?.kind === "gesture" ? <GestureScreen sessionId={app.overlay.sessionId} exerciseId={app.overlay.exerciseId} /> : null}
      {app.overlay?.kind === "bilan" ? <BilanScreen id={app.overlay.id} /> : null}
      {app.overlay?.kind === "preview" ? <PreviewScreen id={app.overlay.id} /> : null}
      <Sheets />
      <CoachLayer />
      <ScrollEdge />
    </div>
  );
}

function Onboarding() {
  const app = useApp();
  return (
    <div className="onboard" data-testid="app-ready">
      <div className="markr" aria-hidden="true">R</div>
      {app.importPreview ? <ImportSummary preview={app.importPreview} /> : <div className="spacer" />}
      <h1>Vos séances restent sur ce téléphone.</h1>
      <p>Collez le plan de Chef sport, ou créez une séance. Rien ne part tout seul.</p>
      <Button data-testid="onboarding-start" onClick={() => void app.finishOnboarding()}>
        Déposer le plan
      </Button>
    </div>
  );
}

function useOverlayHistory(open: boolean, close: () => void) {
  const pushed = useRef(false);
  const fromPop = useRef(false);
  useEffect(() => {
    if (open && !pushed.current) {
      history.pushState({ repereOverlay: 1 }, "");
      pushed.current = true;
    }
    if (!open && pushed.current) {
      pushed.current = false;
      if (!fromPop.current) history.back();
      fromPop.current = false;
    }
  }, [open]);
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      fromPop.current = true;
      pushed.current = false;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [close]);
}

function TodayIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16.5 9 11l3.2 2.4L20 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5.5h5.2A2.8 2.8 0 0 1 15 8.3V19H8.6A1.6 1.6 0 0 0 7 20.6V5.5Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 5.5h-5.2A2.8 2.8 0 0 0 9 8.3V19h6.4A1.6 1.6 0 0 0 17 20.6V5.5Z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

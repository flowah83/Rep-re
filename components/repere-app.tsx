"use client";

import { useEffect, useRef, useState } from "react";
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
import { HomeScreen } from "@/components/home-screen";
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
          <p className="quiet">Rien n’a été effacé depuis ici. Si vous avez un fichier repere-….json, vous pourrez le restaurer dès que le stockage répond.</p>
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
  if (!app.settings.onboarded) return <Onboarding />;
  return (
    <div className="app" data-testid="app-ready">
      {app.unsaved ? (
        <div className="banner" data-testid="unsaved-banner">
          <b>Modifications non enregistrées</b>
          <span>Elles sont encore dans la mémoire de cette page. Le téléphone ne les a pas écrites.</span>
          <div className="outcome-split">
            <button type="button" className="btn" data-testid="unsaved-retry" onClick={() => void app.retryUnsaved()}>
              Réessayer
            </button>
            <button type="button" className="btn ghost" data-testid="unsaved-export" onClick={app.exportEmergency}>
              Exporter maintenant
            </button>
          </div>
        </div>
      ) : null}
      <div className="shell" inert={app.overlay || app.sheet || app.coachOpen ? true : undefined}>
        {app.sessions.some((session) => session.source === "demo") ? (
          <p className="demobadge" data-testid="demo-badge">Démonstration</p>
        ) : null}
        <div hidden={app.tab !== "home"}>
          <HomeScreen />
        </div>
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
          <button type="button" className={`tab${app.tab === "home" ? " on" : ""}`} aria-current={app.tab === "home" ? "page" : undefined} data-testid="tab-home" onClick={() => app.setTab("home")}>
            <HomeIcon />
            Accueil
          </button>
          <button type="button" className={`tab${app.tab === "today" ? " on" : ""}`} aria-current={app.tab === "today" ? "page" : undefined} data-testid="tab-today" onClick={() => app.setTab("today")}>
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
      <UpdateBanner />
      <ScrollEdge />
    </div>
  );
}

function Onboarding() {
  const app = useApp();
  return (
    <div className="onboard" data-testid="app-ready">
      <div className="markr" aria-hidden="true">R</div>
      {app.importPreview ? <ImportSummary preview={app.importPreview} /> : null}
      <h1>Vos séances restent sur ce téléphone.</h1>
      <p>Créez une séance, importez un plan, ou essayez avec un exemple. Rien ne change sans votre accord.</p>
      <div className="spacer" />
      <p className="hint">L’exemple est fictif. Il reste à part de vos vraies séances.</p>
      <Button data-testid="onboarding-create" onClick={() => void app.finishOnboarding("create")}>
        Créer une séance
      </Button>
      <Button variant="ghost" data-testid="onboarding-start" onClick={() => void app.finishOnboarding("import")}>
        Importer un plan
      </Button>
      <Button variant="ghost" data-testid="onboarding-demo" onClick={() => void app.finishOnboarding("demo")}>
        Essayer avec un exemple
      </Button>
    </div>
  );
}

function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const mark = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed" && navigator.serviceWorker.controller) setReady(true);
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) setReady(true);
      });
    };
    const listen = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) setReady(true);
      mark(registration.installing);
      registration.addEventListener("updatefound", () => mark(registration.installing));
    };
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) listen(registration);
    });
    const onChange = () => {
      if (sessionStorage.getItem("repere-reload") === "1") window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <p>Une version plus récente est prête. Les séances restent sur ce téléphone.</p>
      <button
        type="button"
        data-testid="reload-app"
        onClick={() => {
          sessionStorage.setItem("repere-reload", "1");
          void navigator.serviceWorker.getRegistration().then((registration) => {
            registration?.waiting?.postMessage({ type: "repere-reload" });
          });
        }}
      >
        Recharger
      </button>
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

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.8 11.1 12 5l7.2 6.1V19a1.2 1.2 0 0 1-1.2 1.2h-3.8v-5.1H9.8v5.1H6A1.2 1.2 0 0 1 4.8 19v-7.9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
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

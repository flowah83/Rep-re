"use client";

import { useState } from "react";
import { AppProvider, useApp, useBoot } from "@/components/app-context";
import { BilanScreen } from "@/components/bilan-screen";
import { GestureScreen } from "@/components/gesture-screen";
import { HistoryScreen } from "@/components/history-screen";
import { ProgressScreen } from "@/components/progress-screen";
import { SessionScreen } from "@/components/session-screen";
import { Sheets } from "@/components/sheets";
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
      {app.overlay?.kind === "session" ? <SessionScreen id={app.overlay.id} /> : null}
      {app.overlay?.kind === "gesture" ? <GestureScreen sessionId={app.overlay.sessionId} exerciseId={app.overlay.exerciseId} /> : null}
      {app.overlay?.kind === "bilan" ? <BilanScreen id={app.overlay.id} /> : null}
      <Sheets />
    </div>
  );
}

const STEPS = [
  {
    title: "Vos séances restent ici.",
    body: "Repère note les charges sur ce téléphone. Pas de compte, pas de serveur.",
  },
  {
    title: "Chef sport écrit le plan.",
    body: "Vous collez le plan, ou vous ouvrez le lien qu’il vous envoie. L’application ne choisit pas les charges à votre place.",
  },
  {
    title: "Rien ne part tout seul.",
    body: "À la fin, vous relisez le bilan. Vous l’envoyez à Chef sport seulement si vous le décidez.",
  },
];

function Onboarding() {
  const app = useApp();
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="onboard" data-testid="app-ready">
      <div className="markr" aria-hidden="true">R</div>
      {app.importPreview ? <ImportSummary preview={app.importPreview} /> : <div className="spacer" />}
      <h1>{current.title}</h1>
      <p>{current.body}</p>
      <div className="dots" aria-hidden="true">
        {STEPS.map((_, index) => (
          <i key={index} className={index === step ? "on" : ""} />
        ))}
      </div>
      <Button
        data-testid={last ? "onboarding-start" : "onboarding-next"}
        onClick={() => {
          if (last) void app.finishOnboarding();
          else setStep(step + 1);
        }}
      >
        {last ? "Commencer" : "Continuer"}
      </Button>
    </div>
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

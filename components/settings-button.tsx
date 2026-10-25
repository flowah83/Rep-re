"use client";

import { useApp } from "@/components/app-context";

/** Engrenage en haut à droite de chaque écran principal. La météo reste sous le titre. */
export function SettingsButton() {
  const app = useApp();
  return (
    <button type="button" className="iconbtn settings-btn" aria-label="Réglages" data-testid="open-settings" onClick={() => app.setSheet("settings")}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10.1 2.9h3.8l.6 2.1c.6.2 1.2.5 1.7.9l2-.9 2.7 2.7-.9 2c.4.5.7 1.1.9 1.7l2.1.6v3.8l-2.1.6c-.2.6-.5 1.2-.9 1.7l.9 2-2.7 2.7-2-.9c-.5.4-1.1.7-1.7.9l-.6 2.1h-3.8l-.6-2.1a7 7 0 0 1-1.7-.9l-2 .9-2.7-2.7.9-2a7 7 0 0 1-.9-1.7l-2.1-.6V9.3l2.1-.6c.2-.6.5-1.2.9-1.7l-.9-2 2.7-2.7 2 .9c.5-.4 1.1-.7 1.7-.9l.6-2.1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}

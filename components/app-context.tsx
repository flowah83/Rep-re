"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDemo } from "@/lib/demo";
import {
  deleteSession,
  loadState,
  replaceAll,
  saveCustom,
  saveSession as putSession,
  saveSettings,
} from "@/lib/db";
import { importSummary, parseImport, previewImport, textFromLocation, withoutDuplicates, type ImportPreview } from "@/lib/history";
import { mergePlans } from "@/lib/plan";
import type { BackupFile, CustomExercise, Session, Settings } from "@/lib/types";
import { publicBase } from "@/lib/base-path";
import { localDate } from "@/lib/utils";

export type Tab = "today" | "progress" | "history";
export type RangeKey = 28 | 84 | 365;
export type HistFilter = "all" | "push" | "back" | "legs" | "other";
export type Overlay =
  | null
  | { kind: "session"; id: string }
  | { kind: "gesture"; sessionId: string; exerciseId: string }
  | { kind: "bilan"; id: string };
export type SheetName = null | "settings" | "import" | "edit" | "plates" | "library";

type Api = {
  settings: Settings;
  sessions: Session[];
  customs: CustomExercise[];
  today: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  selectedDate: string;
  setSelectedDate: (iso: string) => void;
  overlay: Overlay;
  openSession: (id: string) => void;
  openGesture: (sessionId: string, exerciseId: string) => void;
  openBilan: (id: string) => void;
  closeOverlay: () => void;
  sheet: SheetName;
  setSheet: (sheet: SheetName) => void;
  editId: string | null;
  setEditId: (id: string | null) => void;
  platesKg: number;
  setPlatesKg: (kg: number) => void;
  range: RangeKey;
  setRange: (range: RangeKey) => void;
  filter: HistFilter;
  setFilter: (filter: HistFilter) => void;
  progressName: string;
  setProgressName: (name: string) => void;
  toast: string | null;
  flash: (message: string) => void;
  saveSession: (session: Session) => Promise<void>;
  updateSession: (id: string, updater: (session: Session) => Session) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  replaceSessions: (sessions: Session[], customs?: CustomExercise[]) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  importPlanText: (raw: string) => Promise<string | null>;
  importPreview: ImportPreview | null;
  confirmImport: () => Promise<void>;
  dismissImport: () => void;
  restoreBackup: (backup: BackupFile) => Promise<void>;
  loadDemo: () => Promise<void>;
  clearDemo: () => Promise<void>;
  addCustom: (exercise: CustomExercise) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  pendingPlan: boolean;
  beginSession: (session: Session) => Promise<void>;
};

const Ctx = createContext<Api | null>(null);

export function useApp() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Repère n’est pas prêt.");
  return value;
}

const EMPTY: Settings = { onboarded: false, theme: "system", barKg: 20 };

export function applyTheme(theme: Settings["theme"]) {
  const dark =
    theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
  const color = dark ? "#0E0F12" : "#EFEAE2";
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", color));
  try {
    localStorage.setItem("repere-theme", theme);
  } catch {
    /* stockage privé */
  }
}

export function AppProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: {
    settings: Settings;
    sessions: Session[];
    customs: CustomExercise[];
    pendingPlan: boolean;
    importPreview: ImportPreview | null;
    notice: string | null;
  };
}) {
  const today = localDate();
  const [settings, setSettings] = useState(initial.settings);
  const [sessions, setSessions] = useState(initial.sessions);
  const [customs, setCustoms] = useState(initial.customs);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(today);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sheet, setSheet] = useState<SheetName>(initial.importPreview && initial.settings.onboarded ? "import" : null);
  const [editId, setEditId] = useState<string | null>(null);
  const [platesKg, setPlatesKg] = useState(80);
  const [range, setRange] = useState<RangeKey>(84);
  const [filter, setFilter] = useState<HistFilter>("all");
  const [progressName, setProgressName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState(initial.pendingPlan);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(initial.importPreview);
  const sessionsRef = useRef(sessions);
  const settingsRef = useRef(settings);
  const customsRef = useRef(customs);
  const previewRef = useRef(importPreview);
  sessionsRef.current = sessions;
  settingsRef.current = settings;
  customsRef.current = customs;
  previewRef.current = importPreview;

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  };

  useEffect(() => {
    applyTheme(settings.theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (settingsRef.current.theme === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.theme]);

  useEffect(() => {
    if (initial.notice) flash(initial.notice);
  }, [initial.notice]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      const base = publicBase();
      void navigator.serviceWorker.register(`${base}/sw.js`, { scope: base ? `${base}/` : "/" });
    }
  }, []);

  useEffect(() => {
    const active = sessions.some((session) => session.status === "active");
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* refus du navigateur */
      }
    };
    void request();
    const onVis = () => {
      if (!stopped && document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [sessions]);

  const api = useMemo<Api>(() => {
    const writeSessions = (list: Session[]) => {
      sessionsRef.current = list;
      setSessions(list);
    };
    const saveSession = async (session: Session) => {
      const current = sessionsRef.current;
      const index = current.findIndex((item) => item.id === session.id);
      writeSessions(index === -1 ? [...current, session] : current.map((item) => (item.id === session.id ? session : item)));
      await putSession(session);
    };
    const updateSession = async (id: string, updater: (session: Session) => Session) => {
      const current = sessionsRef.current.find((session) => session.id === id);
      if (!current) return;
      await saveSession(updater(current));
    };
    return {
      settings,
      sessions,
      customs,
      today,
      tab,
      setTab,
      selectedDate,
      setSelectedDate,
      overlay,
      openSession: (id) => setOverlay({ kind: "session", id }),
      openGesture: (sessionId, exerciseId) => setOverlay({ kind: "gesture", sessionId, exerciseId }),
      openBilan: (id) => setOverlay({ kind: "bilan", id }),
      closeOverlay: () => setOverlay(null),
      sheet,
      setSheet,
      editId,
      setEditId,
      platesKg,
      setPlatesKg,
      range,
      setRange,
      filter,
      setFilter,
      progressName,
      setProgressName,
      toast,
      flash,
      saveSession,
      updateSession,
      removeSession: async (id) => {
        sessionsRef.current = sessionsRef.current.filter((session) => session.id !== id);
        setSessions(sessionsRef.current);
        await deleteSession(id);
      },
      replaceSessions: async (nextSessions, nextCustoms) => {
        const previous = sessionsRef.current;
        const ids = new Set(nextSessions.map((session) => session.id));
        for (const session of previous) {
          if (!ids.has(session.id)) await deleteSession(session.id);
        }
        const previousJson = new Map(previous.map((session) => [session.id, JSON.stringify(session)]));
        for (const session of nextSessions) {
          if (previousJson.get(session.id) !== JSON.stringify(session)) await putSession(session);
        }
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
        if (nextCustoms) {
          for (const custom of nextCustoms) {
            const known = customsRef.current.find((item) => item.id === custom.id);
            if (!known || known.name !== custom.name || known.pattern !== custom.pattern) await saveCustom(custom);
          }
          customsRef.current = nextCustoms;
          setCustoms(nextCustoms);
        }
      },
      updateSettings: async (patch) => {
        const next = { ...settingsRef.current, ...patch };
        settingsRef.current = next;
        setSettings(next);
        if (patch.theme) applyTheme(next.theme);
        await saveSettings(next);
      },
      importPlanText: async (raw) => {
        const parsed = parseImport(raw, customsRef.current);
        if ("error" in parsed) return parsed.error;
        const preview = previewImport(parsed, sessionsRef.current);
        previewRef.current = preview;
        setImportPreview(preview);
        try {
          sessionStorage.setItem(PENDING_IMPORT, raw);
        } catch {
          /* stockage privé */
        }
        setSheet("import");
        return null;
      },
      importPreview,
      confirmImport: async () => {
        const preview = previewRef.current;
        if (!preview) return;
        const nextCustoms = [...customsRef.current];
        for (const custom of preview.created) {
          if (!nextCustoms.some((item) => item.id === custom.id)) {
            nextCustoms.push(custom);
            await saveCustom(custom);
          }
        }
        customsRef.current = nextCustoms;
        setCustoms(nextCustoms);
        let nextSessions = sessionsRef.current;
        let addedCount = 0;
        if (preview.kind === "history") {
          const fresh = withoutDuplicates(nextSessions, preview.toAdd).added;
          addedCount = fresh.length;
          nextSessions = [...nextSessions, ...fresh];
          for (const session of fresh) await putSession(session);
        } else {
          const merged = mergePlans(nextSessions, preview.planSessions);
          addedCount = merged.touched.length;
          nextSessions = merged.sessions;
          for (const session of merged.touched) await putSession(session);
        }
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
        if (!settingsRef.current.onboarded) {
          const nextSettings = { ...settingsRef.current, onboarded: true };
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          await saveSettings(nextSettings);
        }
        previewRef.current = null;
        setImportPreview(null);
        setPendingPlan(false);
        setSheet(null);
        try {
          sessionStorage.removeItem(PENDING_IMPORT);
          sessionStorage.removeItem("repere-pending-plan");
        } catch {
          /* stockage privé */
        }
        setTab(preview.kind === "history" ? "history" : "today");
        flash(addedCount === 0 ? "Rien de nouveau à ajouter." : importSummary(preview)[0]);
      },
      dismissImport: () => {
        previewRef.current = null;
        setImportPreview(null);
        setPendingPlan(false);
        try {
          sessionStorage.removeItem(PENDING_IMPORT);
          sessionStorage.removeItem("repere-pending-plan");
        } catch {
          /* stockage privé */
        }
        setSheet(null);
      },
      restoreBackup: async (backup) => {
        await replaceAll(backup);
        setSettings(backup.settings);
        setSessions(backup.sessions);
        setCustoms(backup.customExercises);
        applyTheme(backup.settings.theme);
        flash("Sauvegarde restaurée sur ce téléphone.");
        setSheet(null);
      },
      loadDemo: async () => {
        const demo = buildDemo();
        const kept = sessionsRef.current.filter((session) => session.source !== "demo");
        for (const session of sessionsRef.current) {
          if (session.source === "demo") await deleteSession(session.id);
        }
        for (const session of demo) await putSession(session);
        setSessions([...kept, ...demo]);
        setSelectedDate(localDate());
        setTab("today");
        setSheet(null);
        flash("Exemple fictif ajouté. Vous pouvez l’effacer dans les réglages.");
      },
      clearDemo: async () => {
        const kept = sessionsRef.current.filter((session) => session.source !== "demo");
        for (const session of sessionsRef.current) {
          if (session.source === "demo") await deleteSession(session.id);
        }
        setSessions(kept);
        flash("Exemple effacé. Vos séances à vous sont restées.");
      },
      addCustom: async (exercise) => {
        setCustoms((current) => [...current.filter((item) => item.id !== exercise.id), exercise]);
        await saveCustom(exercise);
        flash("Exercice ajouté à votre bibliothèque.");
      },
      finishOnboarding: async () => {
        const next = { ...settingsRef.current, onboarded: true };
        await saveSettings(next);
        setSettings(next);
        setPendingPlan(false);
        if (previewRef.current) setSheet("import");
      },
      pendingPlan,
      beginSession: async (session) => {
        const next = session.status === "planned" ? { ...session, status: "active" as const, startedAt: session.startedAt ?? new Date().toISOString() } : session;
        await saveSession(next);
        setOverlay({ kind: "session", id: next.id });
      },
    };
  }, [
    settings,
    sessions,
    customs,
    today,
    tab,
    selectedDate,
    overlay,
    sheet,
    editId,
    platesKg,
    range,
    filter,
    progressName,
    toast,
    pendingPlan,
    importPreview,
  ]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {toast ? <div className="toast">{toast}</div> : null}
    </Ctx.Provider>
  );
}

export function useBoot() {
  const [state, setState] = useState<{
    settings: Settings;
    sessions: Session[];
    customs: CustomExercise[];
    pendingPlan: boolean;
    importPreview: ImportPreview | null;
    notice: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const loaded = await loadState();
        if (cancel) return;
        let notice: string | null = null;
        let preview: ImportPreview | null = null;
        const fromUrl = await textFromLocation(window.location.href);
        if (fromUrl.failed) notice = "Ce lien d’import est illisible.";
        let raw = fromUrl.text;
        if (raw) {
          try {
            sessionStorage.setItem(PENDING_IMPORT, raw);
          } catch {
            /* stockage privé */
          }
          clearImportLocation();
        } else {
          try {
            raw = sessionStorage.getItem(PENDING_IMPORT) || sessionStorage.getItem("repere-pending-plan");
          } catch {
            raw = null;
          }
        }
        if (raw) {
          const parsed = parseImport(raw, loaded.customs);
          if ("error" in parsed) notice = parsed.error;
          else preview = previewImport(parsed, loaded.sessions);
        }
        applyTheme(loaded.settings.theme);
        if (!cancel) setState({ ...loaded, pendingPlan: Boolean(preview) && !loaded.settings.onboarded, importPreview: preview, notice });
      } catch {
        if (!cancel) setError("Le carnet de ce navigateur n’est pas accessible.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { state, error, empty: { ...EMPTY, importPreview: null, notice: null, pendingPlan: false } };
}

const PENDING_IMPORT = "repere-pending-import";

function clearImportLocation() {
  const url = new URL(window.location.href);
  url.searchParams.delete("plan");
  url.searchParams.delete("historique");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  hash.delete("plan");
  hash.delete("historique");
  const rest = hash.toString();
  history.replaceState(null, "", `${url.pathname}${url.search}${rest ? `#${rest}` : ""}`);
}

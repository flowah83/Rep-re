"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDemo } from "@/lib/demo";
import {
  deleteSession,
  loadState,
  putMany,
  replaceAll,
  saveCustom,
  saveSession as putSession,
  saveSettings,
} from "@/lib/db";
import { applyBackupAdd, copyLog, emergencyBackup, planBackupAdd, UNSAVED_LABEL, type IdChoice } from "@/lib/backup";
import { commitWrite } from "@/lib/commit";
import { migrateStored } from "@/lib/migrate";
import { importSummary, parseImport, previewImport, textFromLocation, withoutDuplicates, type ImportPreview } from "@/lib/history";
import { mergePlans } from "@/lib/plan";
import type { HistFilter } from "@/lib/display";
import { loadProgression, saveProgression, silenceProgression, startWithProgression, writeProgressionRaw } from "@/lib/progression";
import { importPlanSnapshots, rememberPlan } from "@/lib/snapshot";
import { saveCoachConfig, loadCoachConfig } from "@/lib/coach-store";
import type { BackupFile, CustomExercise, Session, Settings } from "@/lib/types";
import { publicBase } from "@/lib/base-path";
import { duplicateAsPlan } from "@/lib/session";
import { localDate } from "@/lib/utils";

export type Tab = "home" | "today" | "progress" | "history";
export type RangeKey = 28 | 84 | 365;
export type { HistFilter } from "@/lib/display";
export type Overlay =
  | null
  | { kind: "session"; id: string }
  | { kind: "gesture"; sessionId: string; exerciseId: string }
  | { kind: "bilan"; id: string; fresh?: boolean }
  | { kind: "preview"; id: string };
export type SheetName = null | "settings" | "import" | "edit" | "plates" | "library" | "partage" | "calendrier" | "diagnostic" | "course" | "natation";

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
  openBilan: (id: string, fresh?: boolean) => void;
  openPreview: (id: string) => void;
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
  saveSession: (session: Session, mode?: "optimistic" | "confirmed") => Promise<void>;
  mergeBackup: (backup: BackupFile) => Promise<"pending" | "done">;
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
  finishOnboarding: (entry?: "create" | "import" | "demo") => Promise<void>;
  duplicateSession: (id: string) => Promise<void>;
  pendingPlan: boolean;
  beginSession: (session: Session, applySuggestion?: boolean) => Promise<void>;
  coachOpen: boolean;
  setCoachOpen: (open: boolean) => void;
  setSportFocus: (focus: { sessionId: string; exerciseId?: string | null; setId?: string | null } | null) => void;
  readSportFocus: () => { sessionId: string; exerciseId?: string | null; setId?: string | null } | null;
  unsaved: boolean;
  retryUnsaved: () => Promise<void>;
  exportEmergency: () => void;
  backupPlan: { backup: BackupFile; collisions: { id: string; existing: Session; incoming: Session }[] } | null;
  chooseBackupAdd: (choices: Record<string, IdChoice>) => Promise<boolean>;
  dismissBackupAdd: () => void;
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
  const [tab, setTab] = useState<Tab>("home");
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
  const [coachOpen, setCoachOpen] = useState(false);
  const sportFocusRef = useRef<{ sessionId: string; exerciseId?: string | null; setId?: string | null } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(initial.importPreview);
  const [unsaved, setUnsaved] = useState(false);
  const [backupPlan, setBackupPlan] = useState<Api["backupPlan"]>(null);
  const dirtyRef = useRef<Session[]>([]);
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
    const storage = navigator.storage;
    if (storage?.persist) {
      void storage.persist().then((granted) => {
        if (settingsRef.current.storagePersistent === granted) return;
        const next = { ...settingsRef.current, storagePersistent: granted };
        settingsRef.current = next;
        setSettings(next);
        void saveSettings(next);
      }).catch(() => undefined);
    }
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      const base = publicBase();
      void navigator.serviceWorker.register(`${base}/sw.js`, { scope: base ? `${base}/` : "/" });
    }
  }, []);

  useEffect(() => {
    if (overlay) setToast(null);
  }, [overlay]);
  useEffect(() => {
    if (sheet) setToast(null);
  }, [sheet]);

  const api = useMemo<Api>(() => {
    const writeSessions = (list: Session[]) => {
      sessionsRef.current = list;
      setSessions(list);
    };
    const saveSession = async (session: Session, mode: "optimistic" | "confirmed" = "optimistic") => {
      const previous = sessionsRef.current;
      const index = previous.findIndex((item) => item.id === session.id);
      const nextList = index === -1 ? [...previous, session] : previous.map((item) => (item.id === session.id ? session : item));
      if (mode === "optimistic") writeSessions(nextList);
      const outcome = await commitWrite(session, putSession);
      if (!outcome.saved) {
        dirtyRef.current = [...dirtyRef.current.filter((item) => item.id !== session.id), session];
        setUnsaved(true);
        flash(`${UNSAVED_LABEL}. Elles restent à l’écran. Réessayez, ou exportez-les.`);
        throw new Error("pas-enregistre");
      }
      dirtyRef.current = dirtyRef.current.filter((item) => item.id !== session.id);
      if (dirtyRef.current.length === 0) setUnsaved(false);
      if (mode === "confirmed") writeSessions(nextList);
    };
    const updateSession = async (id: string, updater: (session: Session) => Session) => {
      const current = sessionsRef.current.find((session) => session.id === id);
      if (!current) return;
      await saveSession(updater(current));
    };
    const writeBackupAdd = async (
      backup: BackupFile,
      added: Session[],
      collisions: { id: string; existing: Session; incoming: Session; choice: IdChoice }[],
      choices: Record<string, IdChoice>,
    ) => {
      const nextSessions = applyBackupAdd(sessionsRef.current, added, collisions, choices);
      const previous = new Map(sessionsRef.current.map((session) => [session.id, JSON.stringify(session)]));
      const written = nextSessions.filter((session) => previous.get(session.id) !== JSON.stringify(session));
      const customs = [...customsRef.current];
      const created: CustomExercise[] = [];
      for (const custom of backup.customExercises) {
        if (!customs.some((item) => item.id === custom.id)) {
          customs.push(custom);
          created.push(custom);
        }
      }
      try {
        await putMany(written, created);
      } catch {
        setUnsaved(true);
        flash(`${UNSAVED_LABEL}. L’ajout n’a pas été écrit. Le carnet de ce téléphone n’a pas changé.`);
        return false;
      }
      sessionsRef.current = nextSessions;
      customsRef.current = customs;
      setSessions(nextSessions);
      setCustoms(customs);
      setBackupPlan(null);
      flash("Séances ajoutées. Celles déjà présentes ont été conservées, sauf si vous avez choisi autrement.");
      setSheet(null);
      return true;
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
      openBilan: (id, fresh = false) => setOverlay({ kind: "bilan", id, fresh }),
      openPreview: (id) => setOverlay({ kind: "preview", id }),
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
        const createdNow: CustomExercise[] = [];
        for (const custom of preview.created) {
          if (!nextCustoms.some((item) => item.id === custom.id)) {
            nextCustoms.push(custom);
            createdNow.push(custom);
          }
        }
        let nextSessions = sessionsRef.current;
        const written: Session[] = [];
        if (preview.kind === "history" || preview.kind === "mixed") {
          for (const update of preview.updates) {
            const incoming = { ...update.incoming, id: update.existingId };
            nextSessions = nextSessions.map((session) => (session.id === update.existingId ? incoming : session));
            written.push(incoming);
          }
          const fresh = withoutDuplicates(nextSessions, preview.toAdd).added;
          nextSessions = [...nextSessions, ...fresh];
          written.push(...fresh);
        }
        if (preview.kind === "plan" || preview.kind === "mixed") {
          const merged = mergePlans(nextSessions, preview.planSessions);
          nextSessions = merged.sessions;
          written.push(...merged.touched);
        }
        const addedCount = written.length;
        try {
          await putMany(written, createdNow);
        } catch {
          flash("L’import n’a pas été enregistré. Le carnet de ce téléphone n’a pas changé.");
          return;
        }
        customsRef.current = nextCustoms;
        setCustoms(nextCustoms);
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
        setTab(preview.planSessions.length ? "today" : "history");
        try {
          localStorage.setItem("repere-imported-on", localDate());
        } catch {
          /* stockage privé */
        }
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
        const prior = copyLog(sessionsRef.current);
        try {
          await replaceAll(backup);
        } catch {
          sessionsRef.current = prior;
          setSessions(prior);
          setUnsaved(true);
          flash(`${UNSAVED_LABEL}. Le carnet de ce téléphone n’a pas changé. Exportez-le si besoin.`);
          return;
        }
        setSettings(backup.settings);
        settingsRef.current = backup.settings;
        setSessions(backup.sessions);
        sessionsRef.current = backup.sessions;
        setCustoms(backup.customExercises);
        customsRef.current = backup.customExercises;
        applyTheme(backup.settings.theme);
        writeProgressionRaw(backup.progression);
        importPlanSnapshots(backup.planSnapshots);
        if (backup.coachToken) {
          const current = loadCoachConfig();
          saveCoachConfig({ url: current.url, token: backup.coachToken });
        }
        flash("Sauvegarde restaurée sur ce téléphone.");
        setSheet(null);
      },
      mergeBackup: async (backup) => {
        const incomingSessions = backup.sessions.filter((session) => session.source !== "demo");
        const plan = planBackupAdd(sessionsRef.current, incomingSessions);
        if (plan.collisions.length) {
          setBackupPlan({ backup, collisions: plan.collisions });
          return "pending";
        }
        await writeBackupAdd(backup, plan.added, plan.collisions, {});
        return "done";
      },
      chooseBackupAdd: async (choices) => {
        const pending = backupPlan;
        if (!pending) return false;
        const incomingSessions = pending.backup.sessions.filter((session) => session.source !== "demo");
        const plan = planBackupAdd(sessionsRef.current, incomingSessions);
        return writeBackupAdd(pending.backup, plan.added, plan.collisions, choices);
      },
      dismissBackupAdd: () => setBackupPlan(null),
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
      duplicateSession: async (id) => {
        const source = sessionsRef.current.find((session) => session.id === id);
        if (!source) return;
        const copy = duplicateAsPlan(source, localDate());
        await putSession(copy);
        sessionsRef.current = [...sessionsRef.current, copy];
        setSessions(sessionsRef.current);
        setTab("history");
        flash("Plan repris pour aujourd’hui. Les séries déjà faites n’ont pas été copiées.");
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
      finishOnboarding: async (entry = "import") => {
        const next = { ...settingsRef.current, onboarded: true };
        await saveSettings(next);
        setSettings(next);
        setPendingPlan(false);
        if (entry === "create") {
          setEditId(null);
          setSheet("edit");
          return;
        }
        if (entry === "demo") {
          setSheet(null);
          const demo = buildDemo();
          const kept = sessionsRef.current.filter((session) => session.source !== "demo");
          for (const session of sessionsRef.current) {
            if (session.source === "demo") await deleteSession(session.id);
          }
          for (const session of demo) await putSession(session);
          setSessions([...kept, ...demo]);
          setSelectedDate(localDate());
          setTab("today");
          flash("Exemple fictif ajouté. Il reste à part, et vous pouvez l’effacer dans les réglages.");
          return;
        }
        setSheet("import");
      },
      pendingPlan,
      coachOpen,
      setCoachOpen,
      setSportFocus: (focus) => {
        sportFocusRef.current = focus;
      },
      readSportFocus: () => sportFocusRef.current,
      unsaved,
      retryUnsaved: async () => {
        const pending = [...dirtyRef.current];
        for (const session of pending) {
          const outcome = await commitWrite(session, putSession);
          if (!outcome.saved) {
            setUnsaved(true);
            flash(`${UNSAVED_LABEL}. L’écriture n’a pas abouti.`);
            return;
          }
          dirtyRef.current = dirtyRef.current.filter((item) => item.id !== session.id);
        }
        if (dirtyRef.current.length === 0) setUnsaved(false);
      },
      exportEmergency: () => {
        const file = emergencyBackup(sessionsRef.current, settingsRef.current, customsRef.current);
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "repere-urgence.json";
        link.click();
        URL.revokeObjectURL(url);
      },
      backupPlan,
      beginSession: async (session, applySuggestion = false) => {
        if (session.status === "planned") rememberPlan(session);
        const existing = loadProgression(session.id);
        const prepared = startWithProgression(session, sessionsRef.current, existing);
        let next = session;
        if (prepared.record && !existing) {
          if (prepared.record.mode === "applied" && applySuggestion) {
            next = prepared.session;
            saveProgression(session.id, { ...prepared.record, choice: "kept" });
          } else if (prepared.record.mode === "applied") {
            saveProgression(session.id, {
              ...prepared.record,
              choice: "reverted",
              items: prepared.record.items.map((item) => ({ ...item, active: false })),
            });
          } else {
            saveProgression(session.id, silenceProgression(prepared.record));
          }
        } else if (prepared.session !== session && existing?.choice === "kept") {
          next = prepared.session;
        }
        if (next.status === "planned") {
          next = { ...next, status: "active", startedAt: next.startedAt ?? new Date().toISOString() };
        }
        await saveSession(next);
        setOverlay({ kind: "session", id: next.id });
        setToast(null);
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
    coachOpen,
    unsaved,
    backupPlan,
  ]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
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
        const prepared = migrateStored(loaded);
        const sessions = prepared.sessions;
        const settings = prepared.settings;
        const firstMigration = (loaded.settings.schemaVersion ?? 1) < 2;
        let notice: string | null = null;
        if (prepared.changed) {
          try {
            if (prepared.sessions !== loaded.sessions) await putMany(prepared.sessions, []);
            await saveSettings(prepared.settings);
          } catch {
            notice = `${UNSAVED_LABEL}. Le carnet affiché n’est pas encore écrit.`;
          }
        }
        if (firstMigration && prepared.flags.length && !notice) {
          notice = "Certaines charges anciennes n’ont pas d’unité claire. Elles n’ont pas été converties.";
        }
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
          else preview = previewImport(parsed, sessions);
        }
        applyTheme(settings.theme);
        if (!cancel) setState({ settings, sessions, customs: loaded.customs, pendingPlan: Boolean(preview) && !settings.onboarded, importPreview: preview, notice });
      } catch {
        if (!cancel) setError("Le stockage de ce navigateur ne répond pas. Le carnet n’a pas été ouvert.");
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

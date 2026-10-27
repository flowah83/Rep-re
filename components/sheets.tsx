"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { DEFAULT_COACH_URL, loadCoachConfig, normalizeCoachToken, normalizeCoachUrl, saveCoachConfig, testCoachConnection } from "@/lib/coach-store";
import { readProgressionRaw } from "@/lib/progression";
import { exportPlanSnapshots } from "@/lib/snapshot";
import { toCsv } from "@/lib/db";
import { backupProblem, backupReminder, isBackup, sessionsForBackup } from "@/lib/backup";
import { IMPORT_LIMIT, parseDecimalDraft } from "@/lib/contract";
import { CATALOG, PATTERN_LABEL } from "@/lib/exercises";
import { importSummary, type ImportPreview } from "@/lib/history";
import { applySessionEdit } from "@/lib/session-edit";
import { plateGlance } from "@/lib/display";
import { platesPerSide } from "@/lib/calc";
import type { BackupFile, Pattern } from "@/lib/types";
import { withBase } from "@/lib/base-path";
import { formatKg, formatLong, localDate, uid } from "@/lib/utils";

export function Sheets() {
  const app = useApp();
  return (
    <Dialog open={app.sheet !== null} onOpenChange={(open) => { if (!open) app.setSheet(null); }}>
      <DialogContent onClose={() => app.setSheet(null)}>
        {app.sheet === "settings" ? <SettingsSheet /> : null}
        {app.sheet === "import" ? <ImportSheet /> : null}
        {app.sheet === "edit" ? <EditSheet /> : null}
        {app.sheet === "plates" ? <PlatesSheet /> : null}
        {app.sheet === "library" ? <LibrarySheet /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SettingsSheet() {
  const app = useApp();
  const hasDemo = app.sessions.some((session) => session.source === "demo");
  const [askDemo, setAskDemo] = useState(false);
  const [includeCoach, setIncludeCoach] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  return (
    <>
      <DialogTitle asChild><h2>Réglages</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Le carnet est sur ce téléphone. Rien ne change sans votre accord.</p>
      </DialogDescription>
      <h3 className="grouplabel">Préférences</h3>
      <div className="fieldlabel">Thème</div>
      <div className="segment">
        {(["system", "light", "dark"] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            className={app.settings.theme === theme ? "on" : ""}
            data-testid={`theme-${theme}`}
            onClick={() => void app.updateSettings({ theme })}
          >
            {theme === "system" ? "Système" : theme === "light" ? "Clair" : "Sombre"}
          </button>
        ))}
      </div>
      <div className="fieldlabel">Barre à vide</div>
      <div className="choice">
        <Button variant="ghost" onClick={() => void app.updateSettings({ barKg: Math.max(0, app.settings.barKg - 2.5) })}>
          − 2,5 kg
        </Button>
        <Button variant="ghost" onClick={() => void app.updateSettings({ barKg: app.settings.barKg + 2.5 })}>
          + 2,5 kg
        </Button>
      </div>
      <p className="fine">Barre actuelle : {formatKg(app.settings.barKg)} kg. Sert seulement au calcul des disques.</p>
      <Button
        variant="ghost"
        onClick={async () => {
          if (typeof Notification === "undefined") {
            app.flash("Ce navigateur ne propose pas d’alerte à la fin du repos. Le minuteur reste visible.");
            return;
          }
          const permission = await Notification.requestPermission();
          app.flash(permission === "granted" ? "Alerte activée pour la fin du repos." : "Alerte refusée. Le minuteur à l’écran suffit.");
        }}
      >
        Alerte de fin de repos
      </Button>
      <p className="fine">Pour l’installer : dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».</p>
      <h3 className="grouplabel">Données</h3>
      <p className="fine" data-testid="backup-status">
        {backupReminder(app.settings).text}
      </p>
      {app.settings.storagePersistent === false ? (
        <p className="fine">Ce navigateur peut effacer les données peu utilisées. Une copie téléchargée reste le seul filet. Rien n’est garanti pour toujours.</p>
      ) : app.settings.storagePersistent === true ? (
        <p className="fine">Ce navigateur a accepté de garder les données plus longtemps. Ce n’est pas une garantie.</p>
      ) : null}
      <Button onClick={() => app.setSheet("import")}>Importer un plan</Button>
      <Button variant="ghost" onClick={() => { app.setEditId(null); app.setSheet("edit"); }}>
        Créer une séance
      </Button>
      <Button variant="ghost" onClick={() => app.setSheet("library")}>
        Bibliothèque d’exercices
      </Button>
      <label className="fine">
        <input type="checkbox" checked={includeCoach} onChange={(event) => setIncludeCoach(event.target.checked)} /> Inclure le code du coach.
        Il sera écrit en clair dans le fichier.
      </label>
      <Button
        variant="ghost"
        onClick={() => {
          const coach = loadCoachConfig();
          const filename = `repere-${localDate()}.json`;
          const backup: BackupFile = {
            app: "repere",
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: app.settings,
            sessions: sessionsForBackup(app.sessions),
            customExercises: app.customs,
            progression: readProgressionRaw(),
            planSnapshots: exportPlanSnapshots(),
            coachToken: includeCoach && coach.token ? coach.token : null,
          };
          download(filename, JSON.stringify(backup, null, 2), "application/json");
          void app.updateSettings({ lastDownloadAt: backup.exportedAt });
          app.flash(`Téléchargement lancé : ${filename}.`);
        }}
      >
        Enregistrer une copie
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          const filename = `repere-${localDate()}.csv`;
          download(filename, toCsv(sessionsForBackup(app.sessions)), "text/csv");
          app.flash(`Téléchargement lancé : ${filename}.`);
        }}
      >
        Exporter pour un tableur
      </Button>
      <p className="fine">Le tableau ne contient pas les notes, le cardio, ni les réglages. La copie JSON est le fichier à garder.</p>
      <label className="btn ghost" style={{ marginTop: 8 }}>
        Restaurer une copie
        <input
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="backup-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.text().then(async (text) => {
              if (text.length > IMPORT_LIMIT) {
                app.flash("Ce fichier est trop volumineux. Rien n’a été remplacé.");
                return;
              }
              try {
                const data = JSON.parse(text) as unknown;
                if (isBackup(data)) {
                  const problem = backupProblem(data);
                  if (problem) {
                    app.flash(problem);
                    return;
                  }
                  setPendingBackup(data);
                  return;
                }
              } catch {
                app.flash("Ce fichier est illisible.");
                return;
              }
              const error = await app.importPlanText(text);
              if (error) app.flash(error);
            });
          }}
        />
      </label>
      {pendingBackup ? <BackupPreview backup={pendingBackup} onCancel={() => setPendingBackup(null)} /> : null}
      <h3 className="grouplabel">Exemple</h3>
      {askDemo ? (
        <>
          <p className="fine">L’exemple est fictif. Il se range à côté de vos séances, et vous pouvez l’effacer.</p>
          <Button data-testid="demo-toggle" onClick={() => void app.loadDemo().then(() => setAskDemo(false))}>
            Charger l’exemple
          </Button>
          <Button variant="ghost" onClick={() => setAskDemo(false)}>
            Annuler
          </Button>
        </>
      ) : (
        <Button variant="ghost" data-testid="demo-ask" onClick={() => setAskDemo(true)}>
          Charger un exemple fictif
        </Button>
      )}
      {hasDemo ? (
        <Button variant="ghost" data-testid="clear-demo" onClick={() => void app.clearDemo()}>
          Effacer l’exemple fictif
        </Button>
      ) : null}
      <p className="fine">
        Le minuteur peut garder l’écran allumé une fois l’app installée. Sur iPhone, le site ne peut pas vibrer. Le compte à rebours reste le signal fiable.
      </p>
      <h3 className="grouplabel">Connexions</h3>
      <CoachSettings />
      <p className="fine">
        <a href={withBase("/LICENSES.md")}>Licences du corps 3D</a>
      </p>
    </>
  );
}

function CoachSettings() {
  const app = useApp();
  const [url, setUrl] = useState(DEFAULT_COACH_URL);
  const [token, setToken] = useState("");
  const [probe, setProbe] = useState<{ ok: boolean; message: string } | null>(null);
  const [probing, setProbing] = useState(false);
  useEffect(() => {
    const current = loadCoachConfig();
    setUrl(current.url);
    setToken(current.token);
  }, []);
  return (
    <>
      <div className="fieldlabel">Adresse et code</div>
      <p className="fine">
        Collez le code secret, une seule fois sur ce téléphone. Un code long se colle tel quel. L’adresse est déjà remplie. Sans le code, le coach reste éteint. Les
        suggestions de charge marchent quand même. Le coach envoie les séances récentes et peut lire le calendrier.
      </p>
      {token.trim().length > 0 && token.trim().length < 20 ? (
        <p className="fine">Ce code est court. Un code long est plus difficile à deviner. Il se change dans le secret du service, pas ici tout seul.</p>
      ) : null}
      <input
        className="field"
        data-testid="coach-url"
        value={url}
        placeholder="Adresse du service"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setUrl(event.target.value)}
      />
      <input
        className="field"
        data-testid="coach-token"
        type="password"
        value={token}
        placeholder="Code secret"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <Button
        onClick={() => {
          const cleaned = { url: normalizeCoachUrl(url), token: normalizeCoachToken(token) };
          saveCoachConfig(cleaned);
          setUrl(cleaned.url);
          setToken(cleaned.token);
          app.flash(cleaned.token ? "Coach enregistré sur ce téléphone." : "Coach effacé de ce téléphone.");
        }}
      >
        Enregistrer le coach
      </Button>
      <Button
        variant="ghost"
        data-testid="coach-test"
        disabled={probing}
        onClick={() => {
          setProbing(true);
          setProbe(null);
          void testCoachConnection({ url, token })
            .then((result) => setProbe(result))
            .finally(() => setProbing(false));
        }}
      >
        Tester la connexion
      </Button>
      {probe ? (
        <p className={probe.ok ? "fine" : "err"} data-testid="coach-test-result">
          {probe.message}
        </p>
      ) : null}
    </>
  );
}

function ImportSheet() {
  const app = useApp();
  if (app.importPreview) return <ImportConfirm preview={app.importPreview} />;
  return <ImportForm />;
}

export function ImportSummary({ preview }: { preview: ImportPreview }) {
  const app = useApp();
  const lines = importSummary(preview);
  const canSave = preview.toAdd.length > 0 || preview.planSessions.length > 0 || preview.updates.length > 0;
  return (
    <div data-testid="import-summary">
      {lines.map((line) => (
        <p className="lead" key={line}>{line}</p>
      ))}
      {canSave ? <Button onClick={() => void app.confirmImport()}>Ajouter au carnet</Button> : null}
      <Button variant="ghost" onClick={app.dismissImport}>Annuler</Button>
    </div>
  );
}

function ImportConfirm({ preview }: { preview: ImportPreview }) {
  return (
    <>
      <DialogTitle asChild><h2>Ajouter au carnet ?</h2></DialogTitle>
      <ImportSummary preview={preview} />
    </>
  );
}

function ImportForm() {
  const app = useApp();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <DialogTitle asChild><h2>Importer</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">
          Le collage attend un JSON. Un aperçu s’affiche avant l’enregistrement. Un lien #plan= ou #historique= s’ouvre ici, et rien n’est gardé sans votre accord.
        </p>
      </DialogDescription>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder='{ "seances": [ … ] }'
        aria-label="Texte à importer"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {error ? <p className="err">{error}</p> : null}
      <Button
        onClick={async () => {
          const message = await app.importPlanText(text);
          setError(message);
        }}
      >
        Lire
      </Button>
      <label className="btn ghost" style={{ marginTop: 8 }}>
        Choisir un fichier
        <input
          type="file"
          accept="application/json,.json,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.text().then(async (raw) => {
              if (raw.length > IMPORT_LIMIT) {
                setError("Ce fichier est trop volumineux. Rien n’a été ajouté.");
                return;
              }
              try {
                const data = JSON.parse(raw) as unknown;
                if (isBackup(data)) {
                  const problem = backupProblem(data);
                  if (problem) {
                    setError(problem);
                    return;
                  }
                  setError("Cette copie se restaure depuis Réglages, après un aperçu. Rien n’a été remplacé.");
                  return;
                }
              } catch {
                setError("Ce fichier n’est pas lisible.");
                return;
              }
              setText(raw);
              const message = await app.importPlanText(raw);
              setError(message);
            });
          }}
        />
      </label>
    </>
  );
}

function EditSheet() {
  const app = useApp();
  const existing = app.sessions.find((session) => session.id === app.editId) ?? null;
  const [date, setDate] = useState(existing?.date ?? app.selectedDate);
  const [time, setTime] = useState(existing?.time ?? "");
  const [title, setTitle] = useState(existing?.title ?? "Séance");
  const [note, setNote] = useState(existing?.coachNote ?? "");
  const [rows, setRows] = useState<
    { key: string; name: string; sets: number | null; reps: number | null; load: number | null; rest: number | null }[]
  >(() =>
    existing
      ? existing.exercises.map((exercise) => ({
          key: exercise.id,
          name: exercise.name,
          sets: exercise.planned.sets,
          reps: exercise.planned.reps ?? 8,
          load: exercise.planned.loadKg,
          rest: exercise.planned.restSec,
        }))
      : [{ key: uid(), name: "", sets: 3, reps: 8, load: 20, rest: 120 }],
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    const result = applySessionEdit(
      existing,
      {
        date,
        time,
        title,
        note,
        rows: rows.map((row) => ({
          key: row.key,
          name: row.name,
          sets: row.sets ?? Number.NaN,
          reps: row.reps ?? Number.NaN,
          load: row.load,
          rest: row.rest ?? Number.NaN,
        })),
      },
      app.customs,
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    try {
      await app.saveSession(result.session, "confirmed");
    } catch {
      setError("Pas enregistré. Les notes restent à l’écran. Réessayez.");
      return;
    }
    app.setSelectedDate(date);
    app.setSheet(null);
    app.setTab("today");
    app.flash("Séance enregistrée.");
  };

  return (
    <>
      <DialogTitle asChild><h2>{existing ? "Modifier la séance" : "Nouvelle séance"}</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Vous écrivez le plan vous-même. Les charges ne sont pas suggérées.</p>
      </DialogDescription>
      <div className="row2">
        <label className="fieldlabel">
          Date
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="fieldlabel">
          Heure
          <Input value={time} onChange={(event) => setTime(event.target.value)} placeholder="18:15" />
        </label>
      </div>
      <label className="fieldlabel">
        Nom
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="fieldlabel">
        Note
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {rows.map((row, index) => (
        <div className="exedit" key={row.key}>
          <div className="top">
            <b>Exercice {index + 1}</b>
            <button type="button" className="linkish" onClick={() => setRows(rows.filter((item) => item.key !== row.key))}>
              Retirer
            </button>
          </div>
          <Input list="catalogue" value={row.name} placeholder="Nom de l’exercice" onChange={(event) => update(index, { name: event.target.value })} />
          <div className="row2">
            <Num label="Séries" integer value={row.sets} onChange={(sets) => update(index, { sets })} />
            <Num label="Répétitions" integer value={row.reps} onChange={(reps) => update(index, { reps })} />
            <Num label="Charge kg" value={row.load} onChange={(load) => update(index, { load })} />
            <Num label="Repos s" integer value={row.rest} onChange={(rest) => update(index, { rest })} />
          </div>
        </div>
      ))}
      <datalist id="catalogue">
        {CATALOG.map((exercise) => (
          <option key={exercise.id} value={exercise.name} />
        ))}
        {app.customs.map((exercise) => (
          <option key={exercise.id} value={exercise.name} />
        ))}
      </datalist>
      <button type="button" className="linkish" onClick={() => setRows([...rows, { key: uid(), name: "", sets: 3, reps: 8, load: 20, rest: 90 }])}>
        Ajouter un exercice
      </button>
      {error ? <p className="err">{error}</p> : null}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {existing?.status === "planned" ? (
        confirmDelete ? (
          <>
            <p className="fine">Cette séance prévue sera retirée de ce téléphone.</p>
            <Button
              variant="ghost"
              onClick={() => {
                void app.removeSession(existing.id);
                app.setSheet(null);
                app.flash("Séance retirée.");
              }}
            >
              Oui, supprimer
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Supprimer cette séance
          </Button>
        )
      ) : null}
    </>
  );

  function update(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }
}

function Num({
  label,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  integer?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const idle = value == null ? "" : String(value).replace(".", ",");
  return (
    <label className="fieldlabel">
      {label}
      <Input
        inputMode={integer ? "numeric" : "decimal"}
        value={text ?? idle}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = parseDecimalDraft(raw, { integer, min: 0, max: integer ? 400 : 1000 });
          if (parsed.kind === "invalid") return;
          setText(raw);
          if (parsed.kind === "empty") onChange(null);
          if (parsed.kind === "number") onChange(parsed.value);
        }}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

function PlatesSheet() {
  const app = useApp();
  const result = platesPerSide(app.platesKg, app.settings.barKg);
  return (
    <>
      <DialogTitle asChild><h2>Disques</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">
          Barre de {formatKg(app.settings.barKg)} kg. La charge visée est {formatKg(app.platesKg)} kg.
        </p>
      </DialogDescription>
      <div className="choice">
        <Button variant="ghost" onClick={() => app.setPlatesKg(Math.max(0, Math.round((app.platesKg - 2.5) * 100) / 100))}>
          − 2,5
        </Button>
        <Button variant="ghost" onClick={() => app.setPlatesKg(Math.round((app.platesKg + 2.5) * 100) / 100)}>
          + 2,5
        </Button>
      </div>
      {result.perSide < 0 ? (
        <p className="err">La charge est plus légère que la barre.</p>
      ) : (
        <>
          <p className="fine" data-testid="plate-glance">{plateGlance(app.platesKg, "kg", app.settings.barKg)}</p>
          <div className="plates">
            {result.plates.length === 0 ? <span>Aucun disque</span> : result.plates.map((plate) => (
              <span key={plate.kg} className="num">
                {formatKg(plate.kg)} kg × {plate.count}
              </span>
            ))}
          </div>
          {result.remainder > 0.05 ? <p className="fine">Il reste {formatKg(result.remainder)} kg que les disques habituels ne font pas.</p> : null}
        </>
      )}
    </>
  );
}

function LibrarySheet() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState<Pattern>("hpush");
  const [cues, setCues] = useState("");
  const items = useMemo(() => {
    const key = query.trim().toLowerCase();
    const catalog = CATALOG.map((exercise) => ({ name: exercise.name, detail: PATTERN_LABEL[exercise.pattern] }));
    const custom = app.customs.map((exercise) => ({ name: exercise.name, detail: `${PATTERN_LABEL[exercise.pattern]} · à vous` }));
    return [...custom, ...catalog].filter((item) => !key || item.name.toLowerCase().includes(key));
  }, [app.customs, query]);
  return (
    <>
      <DialogTitle asChild><h2>Exercices</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Les exercices de base sont déjà là. Vous pouvez en ajouter un, avec vos repères.</p>
      </DialogDescription>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" aria-label="Rechercher un exercice" />
      <div style={{ maxHeight: 220, overflow: "auto", marginTop: 8 }}>
        {items.map((item) => (
          <div className="listbtn" key={item.name}>
            {item.name}
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
      <div className="fieldlabel">Nouvel exercice</div>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom" aria-label="Nom de l’exercice" />
      <label className="fieldlabel">
        Famille
        <select className="select" value={pattern} onChange={(event) => setPattern(event.target.value as Pattern)}>
          {(Object.keys(PATTERN_LABEL) as Pattern[]).map((key) => (
            <option key={key} value={key}>
              {PATTERN_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <Textarea value={cues} onChange={(event) => setCues(event.target.value)} placeholder="Un repère par ligne" aria-label="Repères" />
      <Button
        onClick={() => {
          if (!name.trim()) return;
          void app.addCustom({
            id: uid(),
            name: name.trim(),
            pattern,
            cues: cues.split("\n").map((line) => line.trim()).filter(Boolean),
          });
          setName("");
          setCues("");
        }}
      >
        Ajouter à la bibliothèque
      </Button>
    </>
  );
}

function BackupPreview({ backup, onCancel }: { backup: BackupFile; onCancel: () => void }) {
  const app = useApp();
  const dates = backup.sessions.map((session) => session.date).filter((date) => typeof date === "string").sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const done = backup.sessions.filter((session) => session.status === "done").length;
  return (
    <div className="holdnote" data-testid="backup-preview">
      <p>
        <b>Ceci remplace le carnet de ce téléphone.</b>
      </p>
      <p>
        {backup.sessions.length} séance{backup.sessions.length > 1 ? "s" : ""}
        {from && to ? `, du ${formatLong(from)} au ${formatLong(to)}` : ""}. {done} déjà notée{done > 1 ? "s" : ""}.
      </p>
      <p>
        {backup.coachToken
          ? "Le code du coach est dans ce fichier. Il remplacera celui de ce téléphone."
          : "Le code du coach n’est pas dans ce fichier. Celui de ce téléphone est conservé."}
      </p>
      <Button
        data-testid="backup-replace"
        onClick={() => {
          void app.restoreBackup(backup).then(onCancel);
        }}
      >
        Remplacer le carnet
      </Button>
      <Button
        variant="ghost"
        data-testid="backup-merge"
        onClick={() => {
          void app.mergeBackup(backup).then(onCancel);
        }}
      >
        Ajouter sans effacer
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Annuler
      </Button>
    </div>
  );
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useApp } from "@/components/app-context";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CALENDAR_NAME } from "@/lib/coach";
import { DEFAULT_COACH_URL, coachUrlIssue, loadCoachConfig, markCoachVerified, maskSecret, normalizeCoachToken, normalizeCoachUrl, saveCoachConfig, testCoachConnection } from "@/lib/coach-store";
import { unambiguousUnit } from "@/lib/unit";
import { readProgressionRaw } from "@/lib/progression";
import { exportPlanSnapshots } from "@/lib/snapshot";
import { toCsv } from "@/lib/db";
import { INSTALL_LINE, backupProblem, isBackup, sessionsForBackup } from "@/lib/backup";
import { IMPORT_LIMIT, parseDecimalDraft } from "@/lib/contract";
import { CATALOG, PATTERN_LABEL } from "@/lib/exercises";
import { importSummary, type ImportPreview } from "@/lib/history";
import { applySessionEdit } from "@/lib/session-edit";
import { plateGlance } from "@/lib/display";
import { platesPerSide } from "@/lib/calc";
import type { BackupFile, Pattern } from "@/lib/types";
import { withBase } from "@/lib/base-path";
import { formatClock, formatKg, formatLong, localDate, uid } from "@/lib/utils";

export function Sheets() {
  const app = useApp();
  return (
    <Dialog open={app.sheet !== null} onOpenChange={(open) => { if (!open) app.setSheet(null); }}>
      <DialogContent onClose={() => app.setSheet(null)}>
        {app.sheet === "settings" ? <SettingsSheet /> : null}
        {app.sheet === "partage" ? <PartageSheet /> : null}
        {app.sheet === "calendrier" ? <CalendarSheet /> : null}
        {app.sheet === "diagnostic" ? <DiagnosticSheet /> : null}
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
      <DialogDescription className="vh">Enregistré sur cet appareil. Dernière copie. Créer une copie.</DialogDescription>
      <section className="backupcard" aria-labelledby="backup-title">
        <div className="backup-head">
          <i className="okdot" aria-hidden="true" />
          <div>
            <h3 id="backup-title">Enregistré sur cet appareil</h3>
            <p className="fine" data-testid="backup-status">Dernière copie : {copieLabel(app.settings.lastDownloadAt)}</p>
          </div>
        </div>
        <div className="backup-actions">
          <Button
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
            Créer une copie
          </Button>
          <label className="btn ghost">
            Restaurer
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
        </div>
        <p className="fine">Une copie est un fichier à garder, par exemple dans Fichiers.</p>
        <label className="fine">
          <input type="checkbox" data-testid="include-coach" checked={includeCoach} onChange={(event) => setIncludeCoach(event.target.checked)} /> Inclure le code du coach.
          Il sera écrit en clair dans le fichier.
        </label>
      </section>
      {pendingBackup ? <BackupPreview backup={pendingBackup} onCancel={() => setPendingBackup(null)} /> : null}
      <h3 className="grouplabel" id="prefs-label">Préférences</h3>
      <section aria-labelledby="prefs-label">
      <div className="prefrow stack">
        <span>Thème</span>
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
      </div>
      <div className="prefrow">
        <div>
          <b>Barre à vide</b>
          <small>Pour le calcul des disques</small>
        </div>
        <div className="stepper">
          <button type="button" aria-label="Diminuer la barre de 2,5 kilogrammes" onClick={() => void app.updateSettings({ barKg: Math.max(0, app.settings.barKg - 2.5) })}>−</button>
          <b className="num">{formatKg(app.settings.barKg)} kg</b>
          <button type="button" aria-label="Augmenter la barre de 2,5 kilogrammes" onClick={() => void app.updateSettings({ barKg: app.settings.barKg + 2.5 })}>+</button>
        </div>
      </div>
      <RestAlert />
      </section>
      <h3 className="grouplabel" id="data-label">Données</h3>
      <section aria-labelledby="data-label">
      <button type="button" className="rowline" onClick={() => app.setSheet("import")}>
        <b>Importer un plan</b>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="rowline" onClick={() => { app.setEditId(null); app.setSheet("edit"); }}>
        <b>Créer une séance</b>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="rowline" onClick={() => app.setSheet("library")}>
        <b>Bibliothèque d’exercices</b>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className="rowline"
        onClick={() => {
          const filename = `repere-${localDate()}.csv`;
          download(filename, toCsv(sessionsForBackup(app.sessions)), "text/csv");
          app.flash(`Téléchargement lancé : ${filename}.`);
        }}
      >
        <b>Exporter pour un tableur</b>
        <span aria-hidden="true">›</span>
      </button>
      <p className="fine">Le tableau ne contient pas les notes, le cardio, ni les réglages. La copie JSON est le fichier à garder.</p>
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
        <button type="button" className="rowline" data-testid="demo-ask" onClick={() => { if (!hasDemo) setAskDemo(true); }}>
          <b>Exemple fictif</b>
          <small>{hasDemo ? "Affiché" : "Masqué"} ›</small>
        </button>
      )}
      {hasDemo && !askDemo ? (
        <Button variant="ghost" data-testid="clear-demo" onClick={() => void app.clearDemo()}>
          Effacer l’exemple fictif
        </Button>
      ) : null}
      </section>
      <h3 className="grouplabel" id="link-label">Connexions</h3>
      <section aria-labelledby="link-label">
      <div className="rowline">
        <b>Météo</b>
      </div>
      <button type="button" className="rowline" data-testid="open-partage" onClick={() => app.setSheet("partage")}>
        <b>Coach</b>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="rowline" data-testid="open-calendrier" onClick={() => app.setSheet("calendrier")}>
        <b>{CALENDAR_NAME}</b>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" className="rowline" data-testid="open-diagnostic" onClick={() => app.setSheet("diagnostic")}>
        <b>Diagnostic</b>
        <span aria-hidden="true">›</span>
      </button>
      <CoachSettings />
      </section>
      <h3 className="grouplabel" id="help-label">Aide</h3>
      <section aria-labelledby="help-label">
      <details className="aide">
        <summary>Ce qui reste ici, ce qui part</summary>
        <StayLeave />
      </details>
      <p className="fine">Pour l’installer : dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». {INSTALL_LINE}</p>
      <p className="fine">
        Le minuteur peut garder l’écran allumé une fois l’app installée. Sur iPhone, le site ne peut pas vibrer. Le compte à rebours reste le signal fiable.
      </p>
      <p className="fine">
        <a href={withBase("/LICENSES.md")}>Licences du corps 3D</a>
      </p>
      </section>
    </>
  );
}

function copieLabel(iso: string | undefined): string {
  if (!iso) return "aucune pour l’instant";
  const long = formatLong(iso.slice(0, 10));
  return long.charAt(0).toLowerCase() + long.slice(1);
}

function RestAlert() {
  const app = useApp();
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);
  return (
    <div className="prefrow">
      <b>Alerte de fin de repos</b>
      <button
        type="button"
        role="switch"
        className={`switch${on ? " on" : ""}`}
        aria-checked={on}
        onClick={() => {
          if (typeof Notification === "undefined") {
            app.flash("Ce navigateur ne propose pas d’alerte à la fin du repos. Le minuteur reste visible.");
            return;
          }
          if (Notification.permission === "granted") {
            setOn(true);
            app.flash("Alerte activée pour la fin du repos.");
            return;
          }
          void Notification.requestPermission().then((permission) => {
            setOn(permission === "granted");
            app.flash(permission === "granted" ? "Alerte activée pour la fin du repos." : "Alerte refusée. Le minuteur à l’écran suffit.");
          });
        }}
      >
        <i />
      </button>
    </div>
  );
}

function StayLeave() {
  const coach = loadCoachConfig();
  const mask = maskSecret(coach.token);
  return (
    <div data-testid="stay-leave">
      <p>Le carnet reste sur ce téléphone. La météo, si elle est affichée, et le coach, si vous lui écrivez, utilisent un service à part. Rien ne change sans votre accord.</p>
      <h3>Météo</h3>
      <p>Lieu approximatif seulement. Aucune séance n’est jointe.</p>
      <h3>Coach</h3>
      <p>Un contexte choisi, seulement quand vous écrivez.</p>
      <h3>{CALENDAR_NAME}</h3>
      <p>Uniquement ce calendrier. Pas les autres.</p>
      <h3>Diagnostic</h3>
      <p>Aucun score. Aucune séance n’est envoyée.</p>
      <p>Seulement si le coach est activé, et seulement quand vous lui écrivez.</p>
      <h3>Envoyé</h3>
      <ul>
        <li>Dernières séances utiles : titre, exercices, charges, répétitions.</li>
        <li>Séances encore prévues.</li>
        <li>Exercice en cours, s’il y en a un.</li>
        <li>Préférences de barre et de repos.</li>
        <li>Mémoire que vous avez autorisée.</li>
      </ul>
      <h3>Jamais envoyé</h3>
      <ul>
        <li>Notes pour vous.</li>
        <li>Code secret.{mask ? ` Ici il reste ${mask}.` : ""} Il authentifie la requête. Il n’entre pas dans le texte du modèle.</li>
        <li>Séances d’exemple.</li>
        <li>Anciennes séances manquées, qui ne sont plus à venir.</li>
      </ul>
      <h3>Service</h3>
      <ul>
        <li>Fournisseur : le modèle contacté par le service du coach. Repère ne choisit pas une autre destination.</li>
        <li>Catégories : séances utiles, charges, répétitions, plan, mémoire que vous avez autorisée. Les notes pour le coach sont nommées comme telles.</li>
        <li>Durée : la conversation reste sur ce téléphone. Repère n’allonge pas la conservation du fournisseur.</li>
      </ul>
      <p>La météo n’emporte rien de cette liste. Désactivé, le coach n’envoie plus rien. Le carnet continue.</p>
    </div>
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
        L’adresse doit être en https. Le code reste sur ce téléphone. Il n’entre ni dans l’adresse, ni dans une copie, sauf si vous cochez vous-même de l’inclure. Sans le
        code, le coach reste éteint. Les suggestions de charge marchent quand même.
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
        onChange={(event) => {
          setUrl(event.target.value);
          setProbe(null);
        }}
      />
      {coachUrlIssue(url) ? (
        <p className="err" data-testid="coach-url-issue">{coachUrlIssue(url)}</p>
      ) : null}
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
          if (coachUrlIssue(url)) return;
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
            .then((result) => {
              setProbe(result);
              if (result.ok) markCoachVerified({ url, token });
            })
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

function PartageSheet() {
  const app = useApp();
  const coach = loadCoachConfig();
  const mask = maskSecret(coach.token);
  return (
    <>
      <button type="button" className="navline" onClick={() => app.setSheet("settings")}>‹ Réglages</button>
      <DialogTitle asChild><h2>Ce qui peut partir</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Seulement si le coach est activé, et seulement quand vous lui écrivez.</p>
      </DialogDescription>
      <div className="card flat">
        <h3>Envoyé</h3>
        <ul>
          <li>Dernières séances utiles : titre, exercices, charges, répétitions.</li>
          <li>Séances encore prévues.</li>
          <li>Exercice en cours, s’il y en a un.</li>
          <li>Préférences de barre et de repos.</li>
          <li>Mémoire que vous avez autorisée.</li>
        </ul>
      </div>
      <div className="card flat">
        <h3>Jamais envoyé</h3>
        <ul>
          <li>Notes pour vous.</li>
          <li>Code secret.{mask ? ` Ici il reste ${mask}.` : ""} Il authentifie la requête. Il n’entre pas dans le texte du modèle.</li>
          <li>Séances d’exemple.</li>
          <li>Anciennes séances manquées, qui ne sont plus à venir.</li>
        </ul>
      </div>
      <div className="card flat" data-testid="coach-privacy">
        <h3>Service</h3>
        <ul>
          <li>Fournisseur : le modèle contacté par le service du coach. Repère ne choisit pas une autre destination.</li>
          <li>Catégories : séances utiles, charges, répétitions, plan, mémoire que vous avez autorisée. Les notes pour le coach sont nommées comme telles.</li>
          <li>Durée : la conversation reste sur ce téléphone. Repère n’allonge pas la conservation du fournisseur.</li>
        </ul>
      </div>
      <p className="fine">La météo n’emporte rien de cette liste. Désactivé, le coach n’envoie plus rien. Le carnet continue.</p>
      <Button
        variant="ghost"
        data-testid="disable-coach"
        onClick={() => {
          saveCoachConfig({ url: coach.url, token: "" });
          app.flash("Coach désactivé. Le carnet continue. Les suggestions de charge aussi.");
          app.setSheet("settings");
        }}
      >
        Désactiver le coach
      </Button>
    </>
  );
}

function CalendarSheet() {
  const app = useApp();
  return (
    <>
      <button type="button" className="navline" onClick={() => app.setSheet("settings")}>‹ Réglages</button>
      <DialogTitle asChild><h2>Calendrier</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Un seul calendrier est lu et modifié. Les autres restent dehors.</p>
      </DialogDescription>
      <div className="card flat">
        <h3>{CALENDAR_NAME}</h3>
        <p>C’est le calendrier nommé pour Repère. Les gardes et le travail qui sont ailleurs ne sont pas lus.</p>
      </div>
      <div className="card flat">
        <h3>Créneaux</h3>
        <p>Si les répétitions n’ont pas toutes été lues, aucun créneau n’est annoncé libre. Un délai ne crée pas un deuxième événement.</p>
      </div>
      <p className="fine">Les événements 🏋️, 🏃 et 🏊 ne sont ni déplacés ni supprimés. L’adresse du calendrier ne contient pas le code.</p>
    </>
  );
}

function DiagnosticSheet() {
  const app = useApp();
  const copy = app.settings.lastDownloadAt ? formatLong(app.settings.lastDownloadAt.slice(0, 10)) : null;
  return (
    <>
      <button type="button" className="navline" onClick={() => app.setSheet("settings")}>‹ Réglages</button>
      <DialogTitle asChild><h2>Diagnostic</h2></DialogTitle>
      <DialogDescription asChild>
        <p className="lead">Aucun score. Aucune séance n’est envoyée depuis cet écran.</p>
      </DialogDescription>
      <div className="rowline"><b>Application</b><small>Repère, sur ce téléphone.</small></div>
      <div className="rowline"><b>Dernière copie</b><small>{copy ? `${copy}, téléchargée ici.` : "Aucune copie téléchargée depuis ce téléphone."}</small></div>
      <div className="rowline">
        <b>Conservation</b>
        <small>Les séances restent sur cet appareil.</small>
      </div>
      <div className="rowline"><b>Notes et charges</b><small>Absentes de cet écran. Elles ne partent pas.</small></div>
      <p className="fine">La fluidité se mesure sur l’iPhone, pas ici.</p>
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
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const issueList = Object.entries(issues);

  const flag = (key: string, field: string, message: string | null) => {
    const id = `${key}:${field}`;
    setIssues((current) => {
      if (!message) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === message) return current;
      return { ...current, [id]: message };
    });
  };

  const save = async () => {
    if (issueList.length) return;
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
          <label className="fieldlabel">
            Exercice
            <Input list="catalogue" aria-label={`Exercice ${index + 1}`} value={row.name} placeholder="Nom de l’exercice" onChange={(event) => update(index, { name: event.target.value })} />
          </label>
          <div className="row2">
            <Num label="Séries" integer where={`séries de l’exercice ${index + 1}`} value={row.sets} onIssue={(message) => flag(row.key, "sets", message)} onChange={(sets) => update(index, { sets })} />
            <Num label="Répétitions" integer where={`répétitions de l’exercice ${index + 1}`} value={row.reps} onIssue={(message) => flag(row.key, "reps", message)} onChange={(reps) => update(index, { reps })} />
            <Num label={chargeField(row.name).label} unit={chargeField(row.name).unit} where={`charge de l’exercice ${index + 1}`} value={row.load} onIssue={(message) => flag(row.key, "load", message)} onChange={(load) => update(index, { load })} />
            <MinutesField where={`repos de l’exercice ${index + 1}`} seconds={row.rest} onIssue={(message) => flag(row.key, "rest", message)} onChange={(rest) => update(index, { rest })} />
          </div>
          {chargeField(row.name).unit === "kg" ? <p className="fine">Barre comprise.</p> : null}
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
      {error ? <p className="err" role="alert">{error}</p> : null}
      <Button onClick={() => void save()}>Enregistrer</Button>
      {issueList.length ? (
        <p className="err" role="alert" data-testid="form-issues">
          {issueList.length === 1 ? `Une case à corriger : ${issueList[0][1]}.` : `${issueList.length} cases à corriger.`}
        </p>
      ) : null}
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
  unit,
  value,
  onChange,
  onIssue,
  where,
  integer = false,
}: {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onIssue?: (message: string | null) => void;
  where: string;
  integer?: boolean;
}) {
  const describedBy = useId();
  const [text, setText] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const idle = value == null ? "" : String(value).replace(".", ",");
  const message = localError;
  return (
    <label className="fieldlabel">
      {label}
      <span className={`withunit${message ? " bad" : ""}`}>
        <Input
          inputMode={integer ? "numeric" : "decimal"}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? describedBy : undefined}
          value={text ?? idle}
          onChange={(event) => {
            const raw = event.target.value;
            const parsed = parseDecimalDraft(raw, { integer, min: 0, max: integer ? 400 : 1000 });
            setText(raw);
            if (parsed.kind === "invalid") {
              const next = integer ? "Un nombre entier, par exemple 3." : "Un nombre, par exemple 80.";
              setLocalError(next);
              onIssue?.(where);
              return;
            }
            setLocalError(null);
            onIssue?.(null);
            if (parsed.kind === "empty") onChange(null);
            if (parsed.kind === "number") onChange(parsed.value);
          }}
          onBlur={() => {
            if (!localError) setText(null);
          }}
        />
        {unit ? <span className="unitsuffix">{unit}</span> : null}
      </span>
      {message ? <span className="err" id={describedBy} role="alert">{message}</span> : null}
    </label>
  );
}

function MinutesField({
  seconds,
  onChange,
  onIssue,
  where,
}: {
  seconds: number | null;
  onChange: (value: number | null) => void;
  onIssue?: (message: string | null) => void;
  where: string;
}) {
  const describedBy = useId();
  const [text, setText] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const idle = seconds == null ? "" : formatClock(seconds);
  return (
    <label className="fieldlabel">
      Repos
      <span className={`withunit${localError ? " bad" : ""}`}>
        <Input
          inputMode="decimal"
          aria-label="Repos"
          aria-invalid={localError ? true : undefined}
          aria-describedby={localError ? describedBy : undefined}
          value={text ?? idle}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            const parsed = parseMinutes(raw);
            if (parsed.kind === "invalid") {
              setLocalError("Un nombre de minutes, par exemple 3.");
              onIssue?.(where);
              return;
            }
            setLocalError(null);
            onIssue?.(null);
            if (parsed.kind === "empty") onChange(null);
            if (parsed.kind === "number") onChange(parsed.seconds);
          }}
          onBlur={() => {
            if (!localError) setText(null);
          }}
        />
        <span className="unitsuffix">min</span>
      </span>
      {localError ? <span className="err" id={describedBy} role="alert">{localError}</span> : null}
    </label>
  );
}

function parseMinutes(raw: string): { kind: "empty" } | { kind: "partial" } | { kind: "number"; seconds: number } | { kind: "invalid" } {
  const text = raw.trim();
  if (!text) return { kind: "empty" };
  const clock = /^(\d{1,3}):(\d{1,2})$/.exec(text);
  if (clock) {
    const minutes = Number(clock[1]);
    const seconds = Number(clock[2]);
    if (seconds > 59) return { kind: "invalid" };
    return { kind: "number", seconds: minutes * 60 + seconds };
  }
  if (text.endsWith(":") || text.endsWith(",") || text.endsWith(".")) return { kind: "partial" };
  const parsed = parseDecimalDraft(text, { min: 0, max: 180 });
  if (parsed.kind === "invalid") return { kind: "invalid" };
  if (parsed.kind !== "number") return { kind: "partial" };
  return { kind: "number", seconds: Math.round(parsed.value * 60) };
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

function chargeField(name: string): { label: string; unit: string } {
  const unit = unambiguousUnit({ name });
  if (unit === "kg/main") return { label: "Charge par haltère", unit: "kg par haltère" };
  if (unit === "kg/jambe") return { label: "Charge par jambe", unit: "kg par jambe" };
  if (unit === "corps" || unit === "poids du corps") return { label: "Lest", unit: "kg" };
  if (unit === "ajoute") return { label: "Lest", unit: "kg" };
  if (unit === "assistance") return { label: "Assistance", unit: "kg" };
  return { label: "Charge totale", unit: "kg" };
}

function BackupPreview({ backup, onCancel }: { backup: BackupFile; onCancel: () => void }) {
  const app = useApp();
  const dates = backup.sessions.map((session) => session.date).filter((date) => typeof date === "string").sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const done = backup.sessions.filter((session) => session.status === "done").length;
  const plan = app.backupPlan;
  const [choices, setChoices] = useState<Record<string, "keep" | "replace" | "copy">>({});
  if (plan) {
    return (
      <div className="holdnote" data-testid="backup-collisions">
        <p>
          <b>Certaines séances existent déjà.</b>
        </p>
        <p className="fine">Par défaut, celles de ce téléphone restent. Vous pouvez remplacer ou importer une copie.</p>
        {plan.collisions.map((collision) => {
          const choice = choices[collision.id] ?? "keep";
          return (
            <div key={collision.id} className="card flat">
              <h3>{collision.existing.title}</h3>
              <p>{collision.existing.date} · ici « {collision.existing.title} », dans le fichier « {collision.incoming.title} ».</p>
              <div className="row2">
                <Button variant={choice === "keep" ? "default" : "ghost"} onClick={() => setChoices({ ...choices, [collision.id]: "keep" })}>
                  Garder
                </Button>
                <Button variant={choice === "replace" ? "default" : "ghost"} onClick={() => setChoices({ ...choices, [collision.id]: "replace" })}>
                  Remplacer
                </Button>
                <Button variant={choice === "copy" ? "default" : "ghost"} onClick={() => setChoices({ ...choices, [collision.id]: "copy" })}>
                  Copie
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          data-testid="backup-collision-confirm"
          onClick={() => {
            void app.chooseBackupAdd(choices).then((saved) => {
              if (saved) onCancel();
            });
          }}
        >
          Continuer
        </Button>
        <Button variant="ghost" onClick={app.dismissBackupAdd}>
          Annuler
        </Button>
      </div>
    );
  }
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
          void app.mergeBackup(backup).then((result) => {
            if (result !== "pending") onCancel();
          });
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

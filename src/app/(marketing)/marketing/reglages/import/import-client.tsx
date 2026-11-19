"use client";
import * as React from "react";
import { CircleAlert, Download, FileUp, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { finishGhlImport, importGhlBatch, startGhlImport, type ImportKind } from "@/lib/actions/marketing-import";
import { CONTACT_COLUMNS, OPPORTUNITY_COLUMNS, parseCsv, readContacts, readOpportunities, suggestStage, type GhlContactRow, type GhlOpportunityRow } from "@/lib/marketing/ghl";
import type { Rejected } from "@/lib/marketing/import-ghl";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_LIGHT, Notice, Panel, SELECT } from "../kit";

type Row = GhlContactRow | GhlOpportunityRow;
interface Loaded { filename: string; rows: Row[]; missing: string[]; found: string[]; stages: string[]; owners: string[] }
interface Report { total: number; created: number; merged: number; rejected: Rejected[]; done: boolean; error?: string }
const BATCH = 100;

function Importer({ kind, title, description, stages, members }: { kind: ImportKind; title: string; description: string; stages: Array<{ key: string; name: string }>; members: Array<{ id: string; name: string }> }) {
  const [file, setFile] = React.useState<Loaded | null>(null);
  const [stageMap, setStageMap] = React.useState<Record<string, string>>({});
  const [ownerMap, setOwnerMap] = React.useState<Record<string, string>>({});
  const [report, setReport] = React.useState<Report | null>(null);
  const [running, setRunning] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const opps = kind === "ghl_opportunites";

  const load = async (f: File) => {
    setReport(null); setReadError(null);
    try {
      const csv = parseCsv(await f.text());
      if (!csv.headers.length || !csv.rows.length) { setFile(null); setReadError("Ce fichier ne contient aucune ligne lisible."); return; }
      const parsed = opps ? readOpportunities(csv) : readContacts(csv);
      const labels = (opps ? OPPORTUNITY_COLUMNS : CONTACT_COLUMNS) as Record<string, readonly string[]>;
      const cols = parsed.columns as Record<string, string | null>;
      const need = opps ? ["stage", "email", "phone", "contact_external_id"] : ["email", "phone", "external_id"];
      const found = Object.entries(cols).filter(([, v]) => v).map(([k]) => labels[k][0]);
      const missing = need.filter((k) => !cols[k]).map((k) => labels[k][0]);
      const rows = parsed.rows as Row[];
      const st = opps ? [...new Set((rows as GhlOpportunityRow[]).map((r) => r.stage).filter((s): s is string => !!s))] : [];
      const ow = opps ? [...new Set((rows as GhlOpportunityRow[]).map((r) => r.assigned).filter((s): s is string => !!s))] : [];
      setStageMap(Object.fromEntries(st.map((s) => [s, suggestStage(s, stages) ?? ""])));
      setOwnerMap(Object.fromEntries(ow.map((o) => [o, members.find((m) => m.name.toLowerCase() === o.toLowerCase())?.id ?? ""])));
      setFile({ filename: f.name, rows, missing, found, stages: st, owners: ow });
    } catch { setFile(null); setReadError("Lecture du fichier impossible. Vérifie qu'il s'agit bien d'un export CSV."); }
  };

  const blocking = !file ? "" : opps && !file.found.includes("Stage") ? "La colonne Stage est introuvable : sans elle, aucune opportunité ne peut être placée dans le pipeline." : file.missing.length === (opps ? 4 : 3) ? "Aucune colonne ne permet d'identifier les contacts (Email, Phone ou identifiant)." : "";
  const unmapped = file ? file.stages.filter((s) => !stageMap[s]).length : 0;

  const start = async () => {
    if (!file) return;
    setRunning(true);
    const mapping = opps ? { stages: stageMap, owners: ownerMap } : undefined;
    const rep: Report = { total: file.rows.length, created: 0, merged: 0, rejected: [], done: false };
    setReport({ ...rep });
    const started = await startGhlImport(kind, file.filename, file.rows.length, mapping);
    if (!started.ok) { setReport({ ...rep, done: true, error: started.error }); setRunning(false); return; }
    for (let i = 0; i < file.rows.length; i += BATCH) {
      const res = await importGhlBatch(started.data.id, kind, file.rows.slice(i, i + BATCH), mapping);
      if (!res.ok) { setReport({ ...rep, done: true, error: `${res.error} L'import s'est arrêté à la ligne ${i + 2}. Tu peux le relancer : ce qui est déjà importé ne sera pas doublé.` }); setRunning(false); return; }
      rep.created += res.data.created; rep.merged += res.data.merged; rep.rejected.push(...res.data.rejected);
      setReport({ ...rep });
    }
    await finishGhlImport(started.data.id);
    setReport({ ...rep, done: true }); setRunning(false);
  };

  const downloadRejected = () => {
    if (!report) return;
    const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [["Ligne", "Élément", "Raison"], ...report.rejected.map((r) => [String(r.line), r.label, r.reason])].map((r) => r.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `rejets-${file?.filename ?? "import"}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const processed = report ? report.created + report.merged + report.rejected.length : 0;

  return (
    <Panel title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} aria-label={`Choisir le fichier : ${title}`} />
          <Button variant="outline" className={BTN_LIGHT} disabled={running} onClick={() => input.current?.click()}><FileUp />{file ? "Changer de fichier" : "Choisir le fichier CSV"}</Button>
          {file ? <span className="text-[14px] text-mk-text"><b className="font-medium text-mk-strong">{file.filename}</b> · {file.rows.length} ligne{file.rows.length > 1 ? "s" : ""}</span> : <span className="text-[14px] text-mk-sub">Rien n&apos;est envoyé tant que tu n&apos;as pas lancé l&apos;import.</span>}
        </div>
        {readError ? <Notice tone="danger" icon={CircleAlert} role="alert">{readError}</Notice> : null}

        {file ? (
          <>
            <p className="text-[13px] text-mk-sub">Colonnes reconnues : {file.found.join(", ") || "aucune"}.{file.missing.length && !blocking ? ` Absentes : ${file.missing.join(", ")}.` : ""}</p>
            {blocking ? <Notice tone="danger" icon={CircleAlert} role="alert">{blocking}</Notice> : null}
            {opps && file.stages.length ? (
              <fieldset className="rounded-[10px] border border-mk-line p-4">
                <legend className="px-1 text-[14px] font-semibold text-mk-strong">Étapes de GHL → étapes de l&apos;app</legend>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {file.stages.map((s) => (
                    <label key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-mk-text sm:flex-nowrap"><span className="min-w-0 flex-1 basis-full truncate sm:basis-auto" title={s}>{s}</span>
                      <NativeSelect value={stageMap[s] ?? ""} onChange={(e) => setStageMap((m) => ({ ...m, [s]: e.target.value }))} className={cn(SELECT, "w-full sm:w-52")} aria-label={`Étape de l'app pour « ${s} »`}><option value="">À choisir</option>{stages.map((st) => <option key={st.key} value={st.key}>{st.name}</option>)}<option value="ignorer">Ne pas importer</option></NativeSelect>
                    </label>
                  ))}
                </div>
                {unmapped ? <p className="mt-3 text-[13px] text-mk-warn">{unmapped} étape{unmapped > 1 ? "s" : ""} sans correspondance : les opportunités concernées seront rejetées, avec la raison.</p> : null}
                <p className="mt-2 text-[13px] text-mk-sub">Une opportunité marquée « won » dans GHL va en Gagné, « lost » ou « abandoned » en Perdu, quelle que soit son étape.</p>
              </fieldset>
            ) : null}
            {opps && file.owners.length ? (
              <fieldset className="rounded-[10px] border border-mk-line p-4">
                <legend className="px-1 text-[14px] font-semibold text-mk-strong">Responsables de GHL → membres de l&apos;équipe</legend>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {file.owners.map((o) => (
                    <label key={o} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-mk-text sm:flex-nowrap"><span className="min-w-0 flex-1 basis-full truncate sm:basis-auto" title={o}>{o}</span>
                      <NativeSelect value={ownerMap[o] ?? ""} onChange={(e) => setOwnerMap((m) => ({ ...m, [o]: e.target.value }))} className={cn(SELECT, "w-full sm:w-52")} aria-label={`Membre pour « ${o} »`}><option value="">Personne</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Button className={cn(BTN, "w-full sm:w-auto")} loading={running} disabled={!!blocking} onClick={start}>{report?.done ? <RotateCcw /> : <Play />}{report?.done ? "Relancer l'import" : "Lancer l'import"}</Button>
          </>
        ) : null}

        {report ? (
          <div className="space-y-4 rounded-[10px] border border-mk-line bg-surface-2 p-4" aria-live="polite">
            {!report.done ? <div><Progress value={report.total ? Math.round((processed / report.total) * 100) : 0} /><p className="mt-2 text-[13px] text-mk-sub">{processed} ligne{processed > 1 ? "s" : ""} traitée{processed > 1 ? "s" : ""} sur {report.total}. Garde cette page ouverte.</p></div> : null}
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
              {([["Créés", report.created], ["Fusionnés", report.merged], ["Rejetés", report.rejected.length]] as const).map(([k, v]) => <div key={k} className="min-w-0 rounded-[10px] border border-mk-line bg-surface px-3 py-2.5 sm:px-4 sm:py-3"><dt className="truncate text-[13px] font-medium text-mk-sub">{k}</dt><dd className="mt-0.5 text-[24px] font-semibold leading-8 text-mk-strong tabular-nums">{v}</dd></div>)}
            </dl>
            {report.error ? <p role="alert" className="text-[14px] text-mk-danger">{report.error}</p> : report.done ? <p className="text-[14px] text-mk-text">Import terminé. « Fusionnés » : la fiche existait déjà (même identifiant, même email ou même téléphone), elle a été complétée sans être doublée.</p> : null}
            {report.rejected.length ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[14px] font-semibold text-mk-strong">Lignes rejetées</span><Button size="sm" variant="ghost" className={BTN_GHOST} onClick={downloadRejected}><Download />Télécharger la liste</Button></div>
                <ul className="max-h-56 overflow-auto rounded-[8px] border border-mk-line bg-surface text-[13px]">
                  {report.rejected.slice(0, 200).map((r, i) => <li key={`${r.line}-${i}`} className="flex gap-3 border-b border-mk-line px-3 py-2 last:border-b-0"><span className="w-16 shrink-0 text-mk-sub tabular-nums">ligne {r.line}</span><span className="min-w-0 flex-1 text-mk-text"><span className="font-medium text-mk-strong">{r.label}</span> : {r.reason}</span></li>)}
                  {report.rejected.length > 200 ? <li className="px-3 py-2 text-mk-sub">… et {report.rejected.length - 200} autres, dans la liste à télécharger.</li> : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function GhlImport({ stages, members }: { stages: Array<{ key: string; name: string }>; members: Array<{ id: string; name: string }> }) {
  return (
    <>
      <Importer kind="ghl_contacts" title="1. Contacts" description="Dédoublonnage par email, puis par téléphone. Étiquettes, source et date de création sont conservées." stages={stages} members={members} />
      <Importer kind="ghl_opportunites" title="2. Opportunités" description="Chaque opportunité devient une affaire, rattachée à son contact (créé s'il manque). Étape, valeur, source, responsable et date de création sont conservés." stages={stages} members={members} />
    </>
  );
}

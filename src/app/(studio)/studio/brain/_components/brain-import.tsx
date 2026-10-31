"use client";
import * as React from "react";
import { ArrowDown, Check, Globe, Import, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { importBrainFromUrl, undoBrainImport, type ImportSummary } from "@/lib/actions/brain-import";
import { useAction } from "@/lib/hooks/use-action";
import { hostOf } from "@/lib/brain/dossier-extras";
import type { BrainImport } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";

const STEPS = ["Lecture du site", "Analyse des pages", "Rédaction des fiches"];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "En cours", tone: "warning" }, done: { label: "Terminé", tone: "success" }, error: { label: "Échec", tone: "danger" }, annule: { label: "Annulé", tone: "outline" },
};

/** Bloc « Importer depuis un site » : saisie de l'URL, progression, résumé et journal des imports. */
export function BrainImportPanel({ clientId, clientName, imports, entryCounts, aiAvailable }: { clientId: string; clientName: string; imports: BrainImport[]; entryCounts: Record<string, number>; aiAvailable: boolean }) {
  const [url, setUrl] = React.useState("");
  const [result, setResult] = React.useState<ImportSummary | null>(null);
  const [step, setStep] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const [undoing, setUndoing] = React.useState<BrainImport | null>(null);
  const { exec, pending } = useAction();
  const { exec: execUndo, pending: undoPending } = useAction();

  // Progression simple côté client : l'action serveur est un seul aller-retour, les étapes suivent le temps écoulé.
  React.useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const id = window.setInterval(() => { const e = Date.now() - started; setStep(e < 2500 ? 0 : e < 7000 ? 1 : 2); }, 400);
    return () => window.clearInterval(id);
  }, [pending]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim(); if (!v) return;
    setResult(null); setStep(0);
    exec(() => importBrainFromUrl(clientId, v), {
      onSuccess: (d) => { setResult(d); setUrl(""); toast.success(`${d.created} fiche${d.created > 1 ? "s" : ""} ajoutée${d.created > 1 ? "s" : ""} au Brain de ${clientName}`); },
    });
  };
  const rows = showAll ? imports : imports.slice(0, 4);

  return (
    <Card className="animate-rise" id="import">
      <CardHeader
        title={<span className="flex items-center gap-2"><Globe className="size-4 text-accent-2" />Importer depuis un site</span>}
        description="Colle l'adresse du site de la marque : l'app lit jusqu'à cinq pages (accueil, à propos, produits, FAQ), crée des fiches, remplit la galerie et propose un dossier de marque."
        action={<Tooltip label={aiAvailable ? "Les fiches sont structurées par un modèle d'IA, puis vérifiées par l'équipe." : "Extraction automatique simple, sans IA. Un administrateur peut activer l'analyse par IA sur l'hébergeur (clé ANTHROPIC_API_KEY)."}>
          <span><Badge tone={aiAvailable ? "accent" : "outline"} className="gap-1">{aiAvailable ? <Sparkles className="size-3" /> : null}{aiAvailable ? "Analyse par IA" : "Lecture simple"}</Badge></span>
        </Tooltip>} />
      <CardBody className="space-y-4">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.marque.fr" inputMode="url" autoComplete="off" spellCheck={false} aria-label="Adresse du site" disabled={pending} className="sm:flex-1" />
          <Button type="submit" loading={pending} disabled={!url.trim()} className="sm:w-auto"><Import />{pending ? "Import en cours…" : "Importer"}</Button>
        </form>
        {!aiAvailable && !pending && !result ? <p className="text-[12.5px] text-muted">Sans IA, l&apos;import repose sur une lecture simple du site : titres, textes, produits et prix. Relis les fiches avant d&apos;écrire les scripts.</p> : null}

        {pending ? (
          <ol className="flex flex-col gap-2 rounded-xl bg-surface-2/70 p-3 text-[13px] sm:flex-row sm:items-center sm:gap-6" aria-live="polite">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2", i > step ? "text-muted-2" : i === step ? "text-fg" : "text-muted")}>
                {i < step ? <Check className="size-4 text-accent-2" /> : i === step ? <Loader2 className="size-4 animate-spin text-accent-2" /> : <span className="inline-block size-4 rounded-full border border-border-strong" />}
                {s}
              </li>
            ))}
          </ol>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="min-w-0 text-[13px]">
              <p className="font-semibold"><Check className="mr-1.5 inline size-4 text-accent-2" />{result.created} fiche{result.created > 1 ? "s" : ""} créée{result.created > 1 ? "s" : ""} depuis {result.pages} page{result.pages > 1 ? "s" : ""} de {hostOf(result.proposal.url)}</p>
              <p className="mt-0.5 text-muted">{result.images ? `${result.images} visuel${result.images > 1 ? "s" : ""} ajouté${result.images > 1 ? "s" : ""} à la galerie · ` : ""}{result.mode === "ia" ? "fiches structurées par IA" : "lecture simple du site"}{result.ai_error ? ` (IA indisponible : ${result.ai_error})` : ""}. Une proposition de dossier t&apos;attend ci-dessous.</p>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => document.getElementById("dossier")?.scrollIntoView({ behavior: "smooth", block: "start" })}><ArrowDown />Voir la proposition</Button>
          </div>
        ) : null}

        {imports.length ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Journal des imports</p>
              {imports.length > 4 ? <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Réduire" : `Tout afficher (${imports.length})`}</Button> : null}
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((imp) => {
                const st = STATUS[imp.status] ?? { label: imp.status, tone: "neutral" as Tone };
                const n = entryCounts[imp.id] ?? 0;
                return (
                  <li key={imp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]">
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    <a href={imp.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 basis-[160px] truncate font-medium hover:text-accent-2" title={imp.url}>{imp.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                    <span className="text-[12px] text-muted tabular">
                      {imp.pages_lues ? `${imp.pages_lues} page${imp.pages_lues > 1 ? "s" : ""} · ` : ""}{n} fiche{n > 1 ? "s" : ""}{imp.tokens_in ? " · IA" : ""} · {fmt.dateTime(imp.created_at)}
                    </span>
                    {imp.status === "done" && n > 0 ? (
                      <Tooltip label="Retirer les fiches de cet import"><Button variant="ghost" size="icon-sm" aria-label="Annuler cet import" onClick={() => setUndoing(imp)}><RotateCcw /></Button></Tooltip>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardBody>
      <ConfirmDialog open={!!undoing} onOpenChange={(o) => !o && setUndoing(null)} title="Annuler cet import ?" description={undoing ? `Les ${entryCounts[undoing.id] ?? 0} fiches créées depuis ${hostOf(undoing.url)} seront supprimées. Les images restent dans la galerie.` : undefined} confirmLabel="Supprimer les fiches" danger loading={undoPending}
        onConfirm={async () => { if (!undoing) return; await execUndo(() => undoBrainImport(clientId, undoing.id), { success: "Import annulé : fiches retirées", onSuccess: () => setUndoing(null) }); }} />
    </Card>
  );
}

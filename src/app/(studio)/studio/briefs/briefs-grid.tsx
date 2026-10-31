"use client";
import * as React from "react";
import Link from "next/link";
import { CheckSquare, Layers, RotateCcw, Square, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import type { ActionResult } from "@/lib/actions/result";
import { archiveBriefs, deleteBriefs, restoreBriefs } from "@/lib/actions/briefs";
import { BRIEF_KIND, type BriefKind, type BriefStatus } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

export interface BriefCardVM {
  id: string; title: string; href: string; clientId: string; clientName: string; clientLogo: string | null;
  kind: BriefKind; status: BriefStatus; position: number | null; scriptVersion: number; conceptCount: number;
  dueDate: string | null; overdue: boolean; assigneeId: string | null; assigneeName: string | null; updatedAt: string;
}

/** Grille des briefs avec sélection en masse (case par carte + barre d'actions) et bouton restaurer dans la corbeille. */
export function BriefsGrid({ briefs, trash }: { briefs: BriefCardVM[]; trash: boolean }) {
  const { exec, pending } = useAction();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Les cartes présentes changent (filtre, mois, corbeille) : on oublie les sélections qui n'existent plus.
  const ids = React.useMemo(() => briefs.map((b) => b.id), [briefs]);
  const [seenIds, setSeenIds] = React.useState(ids);
  if (seenIds !== ids) { setSeenIds(ids); setSelected((prev) => new Set([...prev].filter((id) => ids.includes(id)))); }

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = () => setSelected(new Set());
  const allSelected = briefs.length > 0 && selected.size === briefs.length;
  const count = selected.size;

  const run = <T,>(fn: () => Promise<ActionResult<T>>, success: string) => exec(fn, { success, onSuccess: () => { clear(); setConfirmDelete(false); } });
  const onArchive = () => run(() => archiveBriefs([...selected]), `${count} brief${count > 1 ? "s" : ""} mis à la corbeille.`);
  const onRestore = () => run(() => restoreBriefs([...selected]), `${count} brief${count > 1 ? "s" : ""} restauré${count > 1 ? "s" : ""}.`);
  const onDelete = () => run(() => deleteBriefs([...selected]), `${count} brief${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""} définitivement.`);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => (allSelected ? clear() : setSelected(new Set(ids)))}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-muted transition hover:bg-surface-2 hover:text-fg">
          {allSelected ? <CheckSquare className="size-4 text-accent-2" /> : <Square className="size-4" />}
          {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
        {count ? <span className="text-[12.5px] text-muted">{count} sélectionné{count > 1 ? "s" : ""}</span> : null}
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {briefs.map((b) => {
          const on = selected.has(b.id);
          return (
            <li key={b.id} className={`card group relative flex flex-col gap-3 p-4 transition hover:border-border-strong ${on ? "ring-2 ring-accent/60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => toggle(b.id)} aria-pressed={on} aria-label={on ? `Désélectionner ${b.title}` : `Sélectionner ${b.title}`}
                  className={`relative z-10 -m-1 shrink-0 rounded-md p-1 transition ${on ? "text-accent-2" : "text-muted-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg"}`}>
                  {on ? <CheckSquare className="size-[18px]" /> : <Square className="size-[18px]" />}
                </button>
                <ClientChip name={b.clientName} logo={b.clientLogo} href={`/studio/clients/${b.clientId}`} className="relative z-10" />
                <StatusBadge kind="brief" value={b.status} />
              </div>
              <Link href={b.href} className="min-w-0 after:absolute after:inset-0 after:rounded-lg">
                <h3 className="truncate text-[15px] font-semibold tracking-tight transition group-hover:text-accent-2">{b.title}</h3>
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                <Badge tone="outline">{BRIEF_KIND[b.kind]}</Badge>
                {b.conceptCount > 1 ? <Badge tone="outline" className="gap-1"><Layers className="size-3" aria-hidden />{b.conceptCount} concepts</Badge> : null}
                {b.position ? <span className="tabular">#{String(b.position).padStart(2, "0")}</span> : null}
                <span className="font-mono text-[11px]">script-v{b.scriptVersion}</span>
                {b.dueDate ? <span className={b.overdue ? "font-medium text-danger" : ""}>Échéance {fmt.date(b.dueDate)}</span> : null}
              </div>
              <div className="mt-auto flex items-center justify-between pt-1 text-[12px] text-muted">
                <span className="flex items-center gap-1.5">{b.assigneeId ? <><Avatar name={b.assigneeName ?? "?"} size={18} />{b.assigneeName}</> : "Non assigné"}</span>
                <span>{fmt.relative(b.updatedAt)}</span>
              </div>
              {trash ? (
                <div className="relative z-10">
                  <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => restoreBriefs([b.id]), "Brief restauré · en rédaction.")}><RotateCcw />Restaurer</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {count ? (
        <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border-strong bg-surface/95 px-2 py-2 pl-4 shadow-pop backdrop-blur">
            <span className="text-[13px] font-medium">{count} sélectionné{count > 1 ? "s" : ""}</span>
            <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Effacer la sélection"><X /></Button>
            {trash ? (
              <>
                <Button variant="secondary" size="sm" loading={pending} onClick={onRestore}><RotateCcw />Restaurer</Button>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 />Supprimer définitivement</Button>
              </>
            ) : (
              <Button variant="danger" size="sm" loading={pending} onClick={onArchive}><Trash2 />Mettre à la corbeille</Button>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} loading={pending} danger
        title={`Supprimer définitivement ${count} brief${count > 1 ? "s" : ""} ?`}
        description="Les briefs et leurs concepts seront effacés pour de bon. Cette action est irréversible."
        confirmLabel="Supprimer définitivement" onConfirm={() => { void onDelete(); }} />
    </>
  );
}

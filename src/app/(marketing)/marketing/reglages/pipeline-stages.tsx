"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createStageAction, reorderStagesAction, updateStageAction } from "@/lib/actions/marketing-crm";
import { STAGE_KIND, type Stage, type StageKind } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN_ICON, BTN_LIGHT, INPUT, Panel, Pill, SELECT } from "./kit";

/** Étapes du pipeline « IconFlow — Ventes » : renommer, réordonner, ajouter, retirer une étape ajoutée. */
export function PipelineStages({ stages, counts }: { stages: Stage[]; counts: Record<string, number> }) {
  const { exec, pending } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [fresh, setFresh] = React.useState({ name: "", kind: "ouvert" as StageKind });
  const move = (i: number, d: -1 | 1) => { const ids = stages.map((s) => s.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; exec(() => reorderStagesAction(ids), { success: "Ordre enregistré." }); };
  const rename = (id: string) => exec(() => updateStageAction(id, { name }), { success: "Étape renommée.", onSuccess: () => setEditing(null) });
  // Sur téléphone, quatre boutons de 36 px laissent la place au nom de l'étape.
  const icon = cn(BTN_ICON, "size-9 lg:size-8");
  return (
    <Panel title="Pipeline « IconFlow — Ventes »" description="Les étapes dans l'ordre où elles s'affichent. Les sept étapes d'origine se renomment mais ne se retirent pas : l'app s'appuie dessus (import, rendez-vous, signatures).">
      <ol className="overflow-hidden rounded-[10px] border border-mk-line">
        {stages.map((s, i) => {
          const n = counts[s.id] ?? 0;
          return (
            <li key={s.id} className="flex min-h-14 items-center gap-2 border-b border-mk-line px-3 py-2 transition-colors last:border-b-0 hover:bg-surface-2 sm:gap-3 sm:px-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-mk-chip text-[12.5px] font-semibold text-mk-sub tabular-nums">{i + 1}</span>
              {editing === s.id ? (
                <form className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); rename(s.id); }}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-label="Nom de l'étape" className={cn(INPUT, "min-w-0 flex-1")} />
                  <Button type="submit" size="icon-sm" loading={pending} aria-label="Valider le nom" className="size-10 shrink-0 rounded-[8px] lg:size-9"><Check /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" className={icon} aria-label="Annuler" onClick={() => setEditing(null)}><X /></Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
                      <span className="min-w-0 break-words text-[14px] font-medium text-mk-strong sm:truncate">{s.name}</span>
                      {s.kind !== "ouvert" ? <Pill tone={s.kind === "gagne" ? "success" : "danger"}>{STAGE_KIND[s.kind]}</Pill> : null}
                    </span>
                    <span className="block text-[13px] text-mk-sub tabular-nums sm:ml-auto sm:shrink-0">{n} prospect{n > 1 ? "s" : ""}</span>
                  </div>
                  <span className="flex shrink-0 items-center">
                    <Button size="icon-sm" variant="ghost" className={icon} aria-label={`Renommer « ${s.name} »`} onClick={() => { setEditing(s.id); setName(s.name); }}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" className={icon} aria-label={`Monter « ${s.name} »`} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                    <Button size="icon-sm" variant="ghost" className={icon} aria-label={`Descendre « ${s.name} »`} disabled={pending || i === stages.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                    {!s.is_system ? <Button size="icon-sm" variant="ghost" className={cn(icon, "hover:text-mk-danger")} aria-label={`Retirer « ${s.name} »`} disabled={pending} onClick={() => exec(() => updateStageAction(s.id, { active: false }), { success: "Étape retirée." })}><Trash2 /></Button> : <span className="hidden size-9 shrink-0 sm:block lg:size-8" aria-hidden />}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" onSubmit={(e) => { e.preventDefault(); if (fresh.name.trim()) exec(() => createStageAction(fresh), { success: "Étape ajoutée.", onSuccess: () => setFresh({ name: "", kind: "ouvert" }) }); }}>
        <Input value={fresh.name} onChange={(e) => setFresh((v) => ({ ...v, name: e.target.value }))} placeholder="Nouvelle étape" maxLength={60} aria-label="Nom de la nouvelle étape" className={cn(INPUT, "sm:w-64")} />
        <NativeSelect value={fresh.kind} onChange={(e) => setFresh((v) => ({ ...v, kind: e.target.value as StageKind }))} aria-label="Type de l'étape" className={cn(SELECT, "sm:w-40")}>{(Object.keys(STAGE_KIND) as StageKind[]).map((k) => <option key={k} value={k}>{STAGE_KIND[k]}</option>)}</NativeSelect>
        <Button type="submit" size="sm" variant="outline" className={BTN_LIGHT} loading={pending} disabled={!fresh.name.trim()}><Plus />Ajouter</Button>
      </form>
    </Panel>
  );
}

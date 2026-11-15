"use client";
import * as React from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createStageAction, reorderStagesAction, updateStageAction } from "@/lib/actions/marketing-crm";
import { STAGE_KIND, type Stage, type StageKind } from "@/lib/marketing/types";

/** Étapes du pipeline « IconFlow — Ventes » : renommer, réordonner, ajouter, retirer une étape ajoutée. */
export function PipelineStages({ stages, counts }: { stages: Stage[]; counts: Record<string, number> }) {
  const { exec, pending } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [fresh, setFresh] = React.useState({ name: "", kind: "ouvert" as StageKind });
  const move = (i: number, d: -1 | 1) => { const ids = stages.map((s) => s.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; exec(() => reorderStagesAction(ids), { success: "Ordre enregistré." }); };
  const rename = (id: string) => exec(() => updateStageAction(id, { name }), { success: "Étape renommée.", onSuccess: () => setEditing(null) });
  return (
    <section className="card p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Pipeline « IconFlow — Ventes »</h3>
      <p className="mb-4 text-[12.5px] text-muted">Les étapes dans l&apos;ordre où elles s&apos;affichent. Les sept étapes d&apos;origine se renomment mais ne se retirent pas : les automatisations s&apos;appuient dessus.</p>
      <ol className="divide-y divide-border rounded-xl border border-border">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-[13.5px]">
            <span className="w-5 text-right text-[12px] text-muted tabular">{i + 1}</span>
            {editing === s.id ? (
              <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); rename(s.id); }}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-label="Nom de l'étape" className="h-8" />
                <Button type="submit" size="icon-sm" loading={pending} aria-label="Valider le nom"><Check /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Annuler" onClick={() => setEditing(null)}><X /></Button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="text-[12px] text-muted tabular">{counts[s.id] ?? 0} prospect{(counts[s.id] ?? 0) > 1 ? "s" : ""}</span>
                {s.kind !== "ouvert" ? <Badge tone={s.kind === "gagne" ? "success" : "danger"}>{STAGE_KIND[s.kind]}</Badge> : null}
                <Button size="icon-sm" variant="ghost" aria-label={`Renommer « ${s.name} »`} onClick={() => { setEditing(s.id); setName(s.name); }}><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Monter « ${s.name} »`} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Descendre « ${s.name} »`} disabled={pending || i === stages.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                {!s.is_system ? <Button size="icon-sm" variant="ghost" aria-label={`Retirer « ${s.name} »`} disabled={pending} onClick={() => exec(() => updateStageAction(s.id, { active: false }), { success: "Étape retirée." })}><Trash2 /></Button> : <span className="size-8" aria-hidden />}
              </>
            )}
          </li>
        ))}
      </ol>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (fresh.name.trim()) exec(() => createStageAction(fresh), { success: "Étape ajoutée.", onSuccess: () => setFresh({ name: "", kind: "ouvert" }) }); }}>
        <Input value={fresh.name} onChange={(e) => setFresh((v) => ({ ...v, name: e.target.value }))} placeholder="Nouvelle étape" maxLength={60} aria-label="Nom de la nouvelle étape" className="h-9 w-56" />
        <NativeSelect value={fresh.kind} onChange={(e) => setFresh((v) => ({ ...v, kind: e.target.value as StageKind }))} aria-label="Type de l'étape" className="h-9 w-auto">{(Object.keys(STAGE_KIND) as StageKind[]).map((k) => <option key={k} value={k}>{STAGE_KIND[k]}</option>)}</NativeSelect>
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!fresh.name.trim()}><Plus />Ajouter</Button>
      </form>
    </section>
  );
}

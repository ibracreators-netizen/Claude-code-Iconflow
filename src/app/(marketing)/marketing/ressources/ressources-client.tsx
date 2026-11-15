"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { useAction } from "@/lib/hooks/use-action";
import { createResourceAction, createStepAction, moveStepAction, removeStepAction, toggleStepAction, updateStepAction } from "@/lib/actions/marketing-resources";
import { RESOURCE_KIND, RESOURCE_KINDS, type ResourceKind, type Step } from "@/lib/marketing/resources";
import type { MarketingRole } from "@/lib/marketing/types";

export function NewDocumentButton({ folderId, defaultKind }: { folderId: string; defaultKind: ResourceKind }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<ResourceKind>(defaultKind);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus />Nouveau document</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau document" description="Le document est créé vide : tu l'écris ensuite.">
          <div className="space-y-3">
            <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={160} /></Field>
            <Field label="Type"><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{RESOURCE_KIND[k]}</option>)}</NativeSelect></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!title.trim()} onClick={() => exec(() => createResourceAction({ title, kind, folder_id: folderId }), { refresh: false, onSuccess: (r) => { setOpen(false); router.push(`/marketing/ressources/${r.id}`); } })}>Créer et écrire</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Administrateur : la liste d'étapes d'un rôle (ajouter, renommer, ordonner, relier à un document, retirer). */
export function StepsEditor({ role, steps, docs }: { role: MarketingRole; steps: Step[]; docs: Array<{ id: string; title: string }> }) {
  const { exec, pending } = useAction();
  const [title, setTitle] = React.useState("");
  return (
    <div className="space-y-3">
      {steps.length === 0 ? <p className="text-[13px] text-muted">Aucune étape pour ce rôle. Ajoute la première ci-dessous.</p> : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {steps.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13.5px]">
              <span className="w-5 text-right text-[12px] text-muted tabular">{i + 1}</span>
              <Input defaultValue={s.title} maxLength={200} aria-label={`Intitulé de l'étape ${i + 1}`} className="h-8 min-w-[200px] flex-1" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) void exec(() => updateStepAction(s.id, { title: v }), { success: "Étape renommée." }); }} />
              <NativeSelect aria-label={`Document relié à l'étape ${i + 1}`} value={s.document_id ?? ""} onChange={(e) => exec(() => updateStepAction(s.id, { document_id: e.target.value || null }), { success: "Document relié." })} className="h-8 w-52"><option value="">Aucun document relié</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</NativeSelect>
              <Button size="icon-sm" variant="ghost" aria-label={`Monter l'étape ${i + 1}`} disabled={pending || i === 0} onClick={() => exec(() => moveStepAction(s.id, -1))}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Descendre l'étape ${i + 1}`} disabled={pending || i === steps.length - 1} onClick={() => exec(() => moveStepAction(s.id, 1))}><ArrowDown /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Retirer l'étape ${i + 1}`} disabled={pending} onClick={() => exec(() => removeStepAction(s.id), { success: "Étape retirée." })}><Trash2 /></Button>
            </li>
          ))}
        </ol>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void exec(() => createStepAction({ role, title }), { success: "Étape ajoutée.", onSuccess: () => setTitle("") }); }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle étape" maxLength={200} aria-label="Intitulé de la nouvelle étape" className="h-9 w-80 max-w-full" />
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!title.trim()}><Plus />Ajouter l&apos;étape</Button>
      </form>
    </div>
  );
}

/** Membre : ses étapes d'onboarding, à cocher. */
export function StepChecklist({ steps, done }: { steps: Array<{ id: string; title: string; description: string | null; document_id: string | null }>; done: string[] }) {
  const { exec, pending } = useAction();
  const [local, setLocal] = React.useState(done);
  const [seen, setSeen] = React.useState(done);
  if (seen !== done) { setSeen(done); setLocal(done); }
  if (!steps.length) return <p className="text-[13px] text-muted">Ton parcours d&apos;onboarding n&apos;est pas encore défini. L&apos;administrateur y ajoutera des étapes.</p>;
  const n = steps.filter((s) => local.includes(s.id)).length;
  const toggle = (id: string, on: boolean) => { setLocal((l) => (on ? [...l, id] : l.filter((x) => x !== id))); void exec(() => toggleStepAction(id, on), { refresh: true }); };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><Progress value={Math.round((n / steps.length) * 100)} className="max-w-[320px] flex-1" /><span className="text-[13px] text-fg-2 tabular">{n} sur {steps.length} étape{steps.length > 1 ? "s" : ""}</span></div>
      <ol className="divide-y divide-border rounded-xl border border-border">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3 px-3 py-2.5">
            <input id={`step-${s.id}`} type="checkbox" checked={local.includes(s.id)} disabled={pending} onChange={(e) => toggle(s.id, e.target.checked)} className="mt-1 size-4 accent-[var(--color-accent)]" />
            <div className="min-w-0 flex-1"><label htmlFor={`step-${s.id}`} className={local.includes(s.id) ? "text-[13.5px] text-muted line-through" : "text-[13.5px] font-medium"}>{i + 1}. {s.title}</label>{s.description ? <p className="text-[12.5px] text-muted">{s.description}</p> : null}</div>
            {s.document_id ? <Link href={`/marketing/ressources/${s.document_id}`} className="shrink-0 text-[12.5px] text-accent-2 hover:underline">Ouvrir le document</Link> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { useAction } from "@/lib/hooks/use-action";
import { createResourceAction, createStepAction, moveStepAction, removeStepAction, toggleStepAction, updateStepAction } from "@/lib/actions/marketing-resources";
import { RESOURCE_KIND, RESOURCE_KINDS, type ResourceKind, type Step } from "@/lib/marketing/resources";
import type { MarketingRole } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_ICON, BTN_LIGHT, CHECKBOX, INPUT, KitField, SELECT } from "../reglages/kit";

/** Numéro d'étape dans une pastille grise. */
function StepNumber({ n }: { n: number }) {
  return <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-mk-chip text-[12.5px] font-semibold text-mk-sub tabular-nums">{n}</span>;
}

export function NewDocumentButton({ folderId, defaultKind }: { folderId: string; defaultKind: ResourceKind }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<ResourceKind>(defaultKind);
  return (
    <>
      <Button size="sm" variant="outline" className={BTN_LIGHT} onClick={() => setOpen(true)}><Plus />Nouveau document</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau document" description="Le document est créé vide : tu l'écris ensuite.">
          <div className="space-y-4">
            <KitField label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={160} className={INPUT} /></KitField>
            <KitField label="Type"><NativeSelect value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)} className={SELECT}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{RESOURCE_KIND[k]}</option>)}</NativeSelect></KitField>
          </div>
          <DialogFooter><Button variant="ghost" className={BTN_GHOST} onClick={() => setOpen(false)}>Annuler</Button><Button className={BTN} loading={pending} disabled={!title.trim()} onClick={() => exec(() => createResourceAction({ title, kind, folder_id: folderId }), { refresh: false, onSuccess: (r) => { setOpen(false); router.push(`/marketing/ressources/${r.id}`); } })}>Créer et écrire</Button></DialogFooter>
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
    <div className="space-y-4">
      {steps.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-mk-input px-4 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><ListChecks className="size-5" strokeWidth={1.7} /></span>
          <p className="text-[14px] text-mk-sub">Aucune étape pour ce rôle. Ajoute la première ci-dessous.</p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-[10px] border border-mk-line">
          {steps.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2 border-b border-mk-line px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <StepNumber n={i + 1} />
                <Input defaultValue={s.title} maxLength={200} aria-label={`Intitulé de l'étape ${i + 1}`} className={cn(INPUT, "min-w-0 flex-1")} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) void exec(() => updateStepAction(s.id, { title: v }), { success: "Étape renommée." }); }} />
              </div>
              <div className="flex flex-wrap items-center gap-1 pl-10 sm:flex-nowrap sm:pl-0">
                <NativeSelect aria-label={`Document relié à l'étape ${i + 1}`} value={s.document_id ?? ""} onChange={(e) => exec(() => updateStepAction(s.id, { document_id: e.target.value || null }), { success: "Document relié." })} className={cn(SELECT, "mb-1 w-full sm:mb-0 sm:mr-1 sm:w-56")}><option value="">Aucun document relié</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</NativeSelect>
                <Button size="icon-sm" variant="ghost" className={BTN_ICON} aria-label={`Monter l'étape ${i + 1}`} disabled={pending || i === 0} onClick={() => exec(() => moveStepAction(s.id, -1))}><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" className={BTN_ICON} aria-label={`Descendre l'étape ${i + 1}`} disabled={pending || i === steps.length - 1} onClick={() => exec(() => moveStepAction(s.id, 1))}><ArrowDown /></Button>
                <Button size="icon-sm" variant="ghost" className={cn(BTN_ICON, "hover:text-mk-danger")} aria-label={`Retirer l'étape ${i + 1}`} disabled={pending} onClick={() => exec(() => removeStepAction(s.id), { success: "Étape retirée." })}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void exec(() => createStepAction({ role, title }), { success: "Étape ajoutée.", onSuccess: () => setTitle("") }); }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle étape" maxLength={200} aria-label="Intitulé de la nouvelle étape" className={cn(INPUT, "sm:w-80")} />
        <Button type="submit" size="sm" variant="outline" className={BTN_LIGHT} loading={pending} disabled={!title.trim()}><Plus />Ajouter l&apos;étape</Button>
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
  if (!steps.length) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-mk-input px-4 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><ListChecks className="size-5" strokeWidth={1.7} /></span>
        <p className="text-[14px] text-mk-sub">Ton parcours d&apos;onboarding n&apos;est pas encore défini. L&apos;administrateur y ajoutera des étapes.</p>
      </div>
    );
  }
  const n = steps.filter((s) => local.includes(s.id)).length;
  const toggle = (id: string, on: boolean) => { setLocal((l) => (on ? [...l, id] : l.filter((x) => x !== id))); void exec(() => toggleStepAction(id, on), { refresh: true }); };
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium text-mk-strong">Ta progression</span>
          <span className="text-[13px] text-mk-sub tabular-nums">{n} sur {steps.length} étape{steps.length > 1 ? "s" : ""}</span>
        </div>
        <Progress value={Math.round((n / steps.length) * 100)} />
      </div>
      <ol className="overflow-hidden rounded-[10px] border border-mk-line">
        {steps.map((s, i) => {
          const checked = local.includes(s.id);
          return (
            <li key={s.id} className="flex items-start gap-3 border-b border-mk-line px-4 py-3.5 last:border-b-0">
              <input id={`step-${s.id}`} type="checkbox" checked={checked} disabled={pending} onChange={(e) => toggle(s.id, e.target.checked)} className={cn(CHECKBOX, "mt-0.5")} />
              <div className="flex min-w-0 flex-1 flex-col gap-x-4 gap-y-1 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`step-${s.id}`} className={cn("block text-[14px]", checked ? "text-mk-sub line-through" : "font-medium text-mk-strong")}>{i + 1}. {s.title}</label>
                  {s.description ? <p className="mt-0.5 text-[13px] text-mk-sub">{s.description}</p> : null}
                </div>
                {s.document_id ? <Link href={`/marketing/ressources/${s.document_id}`} className="inline-flex shrink-0 items-center gap-0.5 self-start text-[13px] font-medium text-accent-2 hover:underline">Ouvrir le document<ChevronRight className="size-4" aria-hidden /></Link> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

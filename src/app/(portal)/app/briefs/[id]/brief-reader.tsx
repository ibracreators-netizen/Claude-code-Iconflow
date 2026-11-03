"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Clock, History, MessageSquareWarning, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { cn, fmt } from "@/lib/utils";
import { CONCEPT_STATUS, type ConceptStatus, type ConceptVersion } from "@/lib/data/types";
import { decideConcept, editConcept } from "@/lib/actions/portal";

type Item = { id: string; title: string; status: ConceptStatus; review_comment: string | null; content: Record<string, unknown>; history: ConceptVersion[] };

const TONE: Record<ConceptStatus, "warning" | "success" | "danger"> = { a_valider: "warning", valide: "success", correction: "danger" };
const DOT: Record<ConceptStatus, string> = { a_valider: "bg-warning", valide: "bg-success", correction: "bg-danger" };

const asStr = (v: unknown) => (typeof v === "string" ? v : "");
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : typeof v === "string" && v ? [v] : []);

/**
 * Lecture d'un brief côté client, façon lien partagé : volet des concepts (scripts) + script sélectionné.
 * Par script : statut, validation / demande de correction, et modification directe (version précédente conservée).
 */
export function BriefReaderClient({ brief, items, panels, canReview }: {
  brief: { id: string; kind: string; status: string };
  items: Item[]; panels: React.ReactNode[]; canReview: boolean;
}) {
  const [active, setActive] = React.useState(0);
  const [navOpen, setNavOpen] = React.useState(false);
  const idx = Math.min(active, items.length - 1);
  const current = items[idx];
  const multi = items.length > 1;
  const validatedCount = items.filter((i) => i.status === "valide").length;

  const list = (
    <nav aria-label="Scripts du brief" className="flex flex-col gap-0.5">
      {items.map((c, i) => {
        const on = i === idx;
        return (
          <button key={c.id} type="button" onClick={() => { setActive(i); setNavOpen(false); }} aria-current={on ? "page" : undefined}
            className={cn("flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition", on ? "bg-accent-soft font-semibold text-fg" : "text-fg-2 hover:bg-surface-2")}>
            <span className={cn("mt-1 size-2 shrink-0 rounded-full", DOT[c.status])} title={CONCEPT_STATUS[c.status]} />
            <span className="min-w-0 flex-1 leading-snug">{c.title}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div>
      {canReview ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-2"><span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />Votre relecture est attendue</div>
          <p className="min-w-0 flex-1 text-[13px] text-muted">Relisez chaque script dans le volet. Validez-les un par un, demandez une correction, ou modifiez-les directement. {validatedCount}/{items.length} validé{validatedCount > 1 ? "s" : ""}.</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100dvh-100px)] lg:self-start lg:overflow-y-auto">
          <section className="card p-2">
            <header className="flex items-center justify-between px-2 pb-2 pt-1.5"><h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Scripts</h2><span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-fg-2">{items.length}</span></header>
            {list}
          </section>
        </aside>

        {/* Sélecteur mobile */}
        {multi ? (
          <div className="lg:hidden">
            <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] font-medium">
              <span className={cn("size-2 shrink-0 rounded-full", DOT[current.status])} />
              <span className="min-w-0 flex-1 truncate text-left">{current.title}</span>
              <span className="shrink-0 text-[12px] tabular text-muted">{idx + 1}/{items.length}</span>
              <ChevronDown className={cn("size-4 text-muted transition", navOpen && "rotate-180")} />
            </button>
            {navOpen ? <div className="mt-2 rounded-xl border border-border bg-surface p-1.5">{list}</div> : null}
          </div>
        ) : null}

        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-center gap-3">
            {multi ? <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-semibold text-accent-fg" aria-hidden>{idx + 1}</span> : null}
            <h2 className="min-w-0 flex-1 text-[19px] font-semibold tracking-tight">{current.title}</h2>
            <Badge tone={TONE[current.status]}>{CONCEPT_STATUS[current.status]}</Badge>
          </header>

          {current.status === "correction" && current.review_comment ? (
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-fg-2"><span className="font-medium text-danger">Correction demandée :</span> {current.review_comment}</div>
          ) : null}

          <div className="space-y-4">{panels[idx]}</div>

          {canReview ? <ReviewBar key={current.id} brief={brief} item={current} /> : null}

          {current.history.length ? <VersionHistory versions={current.history} /> : null}
        </div>
      </div>
    </div>
  );
}

function ReviewBar({ brief, item }: { brief: { id: string; kind: string }; item: Item }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [confirm, setConfirm] = React.useState<"valide" | "correction" | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <div className="card flex flex-wrap items-center gap-2 p-4">
      <p className="mr-auto text-[13px] text-muted">{item.status === "valide" ? "Ce script est validé. Vous pouvez encore le modifier si besoin." : "Votre avis sur ce script :"}</p>
      {item.status !== "valide" ? <Button size="sm" onClick={() => setConfirm("valide")} loading={pending}><Check />Valider ce script</Button> : null}
      <Button size="sm" variant="secondary" onClick={() => setConfirm("correction")} disabled={pending}><MessageSquareWarning />Demander une correction</Button>
      {brief.kind === "video" ? <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} disabled={pending}><Pencil />Modifier le script</Button> : null}

      <ConfirmDialog open={confirm === "valide"} onOpenChange={(o) => !o && setConfirm(null)} title="Valider ce script ?" description="En validant, vous donnez votre feu vert sur ce script. Le brief passe « validé » quand tous les scripts le sont." confirmLabel="Je valide" loading={pending}
        onConfirm={async () => { const r = await exec(() => decideConcept(item.id, brief.id, "valide"), { success: "Script validé. Merci !" }); if (r.ok) { setConfirm(null); router.refresh(); } }} />
      <ConfirmDialog open={confirm === "correction"} onOpenChange={(o) => !o && setConfirm(null)} title="Demander une correction" description="Expliquez ce qui doit changer : l'équipe reprend la main et vous propose une nouvelle version." confirmLabel="Envoyer la demande" withComment commentLabel="Ce que vous souhaitez changer" loading={pending}
        onConfirm={async (c) => { const r = await exec(() => decideConcept(item.id, brief.id, "correction", c), { success: "Demande envoyée." }); if (r.ok) { setConfirm(null); router.refresh(); } }} />

      {editOpen ? <ScriptEditDialog brief={brief} item={item} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); router.refresh(); }} /> : null}
    </div>
  );
}

function ScriptEditDialog({ brief, item, onClose, onSaved }: { brief: { id: string }; item: Item; onClose: () => void; onSaved: () => void }) {
  const { exec, pending } = useAction();
  const c = item.content;
  const t = (c.transcription && typeof c.transcription === "object" ? c.transcription : {}) as Record<string, unknown>;
  const [concept, setConcept] = React.useState(asStr(c.concept));
  const [hooks, setHooks] = React.useState<string[]>(asArr(t.hooks ?? t.hook).length ? asArr(t.hooks ?? t.hook) : [""]);
  const [corps, setCorps] = React.useState(asStr(t.corps ?? t.body));
  const [ctas, setCtas] = React.useState<string[]>(asArr(t.ctas ?? t.cta).length ? asArr(t.ctas ?? t.cta) : [""]);
  const [acting, setActing] = React.useState(asStr(c.acting));

  const save = () => {
    const content = { ...c, concept, acting, transcription: { ...t, hooks: hooks.map((x) => x.trim()).filter(Boolean), corps, ctas: ctas.map((x) => x.trim()).filter(Boolean) } };
    exec(() => editConcept(item.id, brief.id, { content }), { success: "Script mis à jour." , onSuccess: onSaved });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title="Modifier le script" description="Vos modifications sont enregistrées et visibles par l'équipe. La version précédente est conservée.">
        <div className="space-y-4">
          <Field label="Le concept"><Textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={3} /></Field>
          <ListField label="Hooks (3 premières secondes)" items={hooks} onChange={setHooks} placeholder="Une accroche…" />
          <Field label="Corps"><Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={5} /></Field>
          <ListField label="Appels à l'action" items={ctas} onChange={setCtas} placeholder="Un CTA…" />
          <Field label="Acting & plans"><Textarea value={acting} onChange={(e) => setActing(e.target.value)} rows={3} /></Field>
          <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={pending}>Enregistrer</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListField({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><span className="text-[12.5px] font-medium text-fg-2">{label}</span><Button size="sm" variant="ghost" onClick={() => onChange([...items, ""])}><Plus />Ajouter</Button></div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} />
          <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 /></Button>
        </div>
      ))}
    </div>
  );
}

function VersionHistory({ versions }: { versions: ConceptVersion[] }) {
  const shown = [...versions].reverse().slice(0, 20);
  return (
    <details className="card p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-fg-2"><History className="size-4 text-muted" />Versions précédentes ({versions.length})</summary>
      <ul className="mt-3 space-y-2">
        {shown.map((v, i) => {
          const c = (v.content ?? {}) as Record<string, unknown>;
          const concept = asStr(c.concept);
          return (
            <li key={i} className="rounded-lg bg-surface-2 p-3 text-[12.5px]">
              <div className="flex items-center gap-2 text-muted"><Clock className="size-3.5" /><time dateTime={v.at}>{fmt.dateTime(v.at)}</time>{v.by_role === "client" ? <Badge tone="outline">Client</Badge> : null}<span className="truncate font-medium text-fg-2">{v.title}</span></div>
              {concept ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-fg-2">{concept}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted-2"><RotateCcw className="size-3" />Pour revenir à une version, modifiez le script en recopiant le texte voulu.</p>
    </details>
  );
}

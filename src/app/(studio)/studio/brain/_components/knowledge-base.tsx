"use client";
import * as React from "react";
import { BookMarked, Copy, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createKnowledge, deleteKnowledge, togglePinKnowledge, updateKnowledge } from "@/lib/actions/brain";
import { useAction } from "@/lib/hooks/use-action";
import { KNOWLEDGE_CATEGORY, SEGMENTS, type ClientSegment, type Knowledge, type KnowledgeCategory } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { Chip, SearchParam, useSetParams } from "./url-controls";

const CATS = Object.keys(KNOWLEDGE_CATEGORY) as KnowledgeCategory[];
const SEGS = ["tous", ...Object.keys(SEGMENTS)] as Array<ClientSegment | "tous">;
const catTone: Record<KnowledgeCategory, "accent" | "info" | "violet" | "warning" | "neutral" | "success" | "danger"> = { angle: "accent", hook: "info", framework: "violet", sop: "neutral", swipe: "warning", insight: "success", objection: "danger", prompt: "violet" };

export function KnowledgeBase({ items, cat, seg, q }: { items: Knowledge[]; cat: string; seg: string; q: string }) {
  const set = useSetParams();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Knowledge | null>(null);
  const [deleting, setDeleting] = React.useState<Knowledge | null>(null);
  const { exec, pending } = useAction();
  const needle = q.trim().toLowerCase();
  const filtered = items.filter((k) => (!cat || k.category === cat) && (!seg || k.segment === seg || k.segment === "tous") && (!needle || `${k.title} ${k.body} ${k.tags.join(" ")}`.toLowerCase().includes(needle)));
  const copy = (k: Knowledge) => { navigator.clipboard?.writeText(k.body).then(() => toast.success("Contenu copié")); exec(() => updateKnowledge(k.id, { uses: k.uses + 1 } as never), { refresh: false }); };

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] animate-rise">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Catégories</p>
        <ul className="space-y-0.5">
          <li><button onClick={() => set({ cat: null })} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition", !cat ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2")}>Tout<span className="text-[12px] tabular text-muted">{items.length}</span></button></li>
          {CATS.map((c) => <li key={c}><button onClick={() => set({ cat: c })} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition", cat === c ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2")}>{KNOWLEDGE_CATEGORY[c]}<span className="text-[12px] tabular text-muted">{items.filter((k) => k.category === c).length}</span></button></li>)}
        </ul>
        <p className="mb-2 mt-5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Segment</p>
        <div className="flex flex-wrap gap-1.5 px-1">{SEGS.map((s) => <Chip key={s} active={(seg || "") === (s === "tous" ? "" : s)} onClick={() => set({ seg: s === "tous" ? null : s })}>{s === "tous" ? "Tous" : SEGMENTS[s as ClientSegment]}</Chip>)}</div>
      </aside>
      <section>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-[17px] font-semibold tracking-tight">{cat ? KNOWLEDGE_CATEGORY[cat as KnowledgeCategory] : "Toute la connaissance"}</h2><p className="text-[13px] text-muted">Angles, hooks, frameworks et process qui ont fait leurs preuves. Partagé par toute l&apos;équipe.</p></div>
          <div className="flex items-center gap-2"><SearchParam placeholder="Rechercher…" defaultValue={q} className="w-full md:w-[220px]" /><Button onClick={() => setOpen(true)}><Plus />Nouvelle fiche</Button></div>
        </div>
        {!filtered.length ? <EmptyState icon={BookMarked} title="Aucune fiche ici" description="Capitalise sur ce qui marche : ajoute un angle, un hook, une SOP." action={<Button onClick={() => setOpen(true)}><Plus />Nouvelle fiche</Button>} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((k) => (
              <article key={k.id} className={cn("group card flex flex-col p-4 transition hover:border-border-strong", k.pinned && "border-accent/30")}>
                <div className="flex items-center gap-2">
                  <Badge tone={catTone[k.category]}>{KNOWLEDGE_CATEGORY[k.category]}</Badge>
                  {k.segment !== "tous" ? <Badge tone="outline">{SEGMENTS[k.segment as ClientSegment]}</Badge> : null}
                  <div className="ml-auto flex items-center">
                    <Tooltip label={k.pinned ? "Désépingler" : "Épingler"}><Button variant="ghost" size="icon-sm" className={cn(k.pinned ? "text-accent-2" : "opacity-0 group-hover:opacity-100")} onClick={() => exec(() => togglePinKnowledge(k.id, !k.pinned))} aria-label="Épingler">{k.pinned ? <Pin className="fill-current" /> : <PinOff />}</Button></Tooltip>
                    <Tooltip label="Copier"><Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => copy(k)} aria-label="Copier"><Copy /></Button></Tooltip>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => setEditing(k)} aria-label="Modifier"><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => setDeleting(k)} aria-label="Supprimer"><Trash2 /></Button>
                  </div>
                </div>
                <h3 className="mt-2.5 text-[15px] font-semibold leading-snug tracking-tight">{k.title}</h3>
                <p className="mt-1.5 line-clamp-5 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">{k.body}</p>
                {k.tags.length ? <div className="mt-3 flex flex-wrap gap-1">{k.tags.map((t) => <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">#{t}</span>)}</div> : null}
                <div className="mt-auto flex items-center gap-3 pt-3 text-[11.5px] text-muted">
                  {k.score !== null ? <span className="flex items-center gap-2"><Progress value={k.score} className="w-16" tone={k.score >= 80 ? "accent" : k.score >= 60 ? "info" : "warning"} /><span className="tabular font-medium text-fg-2">{k.score}</span></span> : null}
                  <span>{k.uses} utilisation{k.uses > 1 ? "s" : ""}</span>
                  <span className="ml-auto">{fmt.relative(k.updated_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <KnowledgeDialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }} item={editing} pending={pending} defaultCat={cat as KnowledgeCategory}
        onSubmit={(v) => editing ? exec(() => updateKnowledge(editing.id, v), { success: "Fiche mise à jour", onSuccess: () => setEditing(null) }) : exec(() => createKnowledge(v), { success: "Fiche ajoutée", onSuccess: () => setOpen(false) })} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Supprimer cette fiche ?" description={deleting?.title} confirmLabel="Supprimer" danger loading={pending} onConfirm={async () => { await exec(() => deleteKnowledge(deleting!.id), { success: "Fiche supprimée", onSuccess: () => setDeleting(null) }); }} />
    </div>
  );
}

function KnowledgeDialog({ open, onOpenChange, item, onSubmit, pending, defaultCat }: { open: boolean; onOpenChange: (o: boolean) => void; item: Knowledge | null; onSubmit: (v: { title: string; category: KnowledgeCategory; body: string; tags: string[]; segment: ClientSegment | "tous"; score: number | null }) => void; pending: boolean; defaultCat?: KnowledgeCategory }) {
  const [title, setTitle] = React.useState(""); const [category, setCategory] = React.useState<KnowledgeCategory>("angle"); const [body, setBody] = React.useState(""); const [tags, setTags] = React.useState(""); const [segment, setSegment] = React.useState<ClientSegment | "tous">("tous"); const [score, setScore] = React.useState(""); const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setTitle(item?.title ?? ""); setCategory(item?.category ?? defaultCat ?? "angle"); setBody(item?.body ?? ""); setTags(item?.tags.join(", ") ?? ""); setSegment(item?.segment ?? "tous"); setScore(item?.score?.toString() ?? ""); setErr(""); } }, [open, item, defaultCat]);
  const submit = () => {
    if (!title.trim() || !body.trim()) { setErr("Titre et contenu sont requis."); return; }
    const sc = score === "" ? null : Math.max(0, Math.min(100, Number(score)));
    onSubmit({ title: title.trim(), category, body: body.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean), segment, score: Number.isNaN(sc) ? null : sc });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={item ? "Modifier la fiche" : "Nouvelle fiche"} description="Ce qui a marché, pourquoi, et comment le réutiliser.">
        <div className="grid gap-4">
          <Field label="Titre" required><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Angle « coût réel sur 10 ans »" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Catégorie"><NativeSelect value={category} onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}>{CATS.map((c) => <option key={c} value={c}>{KNOWLEDGE_CATEGORY[c]}</option>)}</NativeSelect></Field>
            <Field label="Segment"><NativeSelect value={segment} onChange={(e) => setSegment(e.target.value as ClientSegment | "tous")}>{SEGS.map((s) => <option key={s} value={s}>{s === "tous" ? "Tous" : SEGMENTS[s as ClientSegment]}</option>)}</NativeSelect></Field>
            <Field label="Score (0-100)" hint="Perf observée"><Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" /></Field>
          </div>
          <Field label="Contenu" required><Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Le principe, quand l'utiliser, un exemple concret…" /></Field>
          <Field label="Tags" hint="Séparés par des virgules"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="panier élevé, reframe prix" /></Field>
          {err ? <p className="text-[13px] text-danger" role="alert">{err}</p> : null}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button loading={pending} onClick={submit}>{item ? "Enregistrer" : "Ajouter"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

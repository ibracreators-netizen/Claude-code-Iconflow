"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { GripVertical, Lock, StickyNote } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { CLIENT_STATUS, MANAGEMENT_ORDER, MANAGEMENT_STAGE, type Client, type ManagementStage } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { saveManagement } from "@/lib/actions/clients";

export interface PipelineCard { client: Client; stage: ManagementStage; notes: string; revision: number; openBriefs: number; pendingClient: number }

function CardView({ card, onNotes, dragging, handleProps }: { card: PipelineCard; onNotes: () => void; dragging?: boolean; handleProps?: Record<string, unknown> }) {
  const c = card.client;
  return (
    <article className={cn("card group p-3.5 transition", dragging && "rotate-1 shadow-pop ring-1 ring-accent/50")}>
      <div className="flex items-start gap-2.5">
        <button className="-ml-1 mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-2 opacity-0 transition hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing" aria-label={`Déplacer ${c.name}`} {...handleProps}><GripVertical className="size-4" /></button>
        <Avatar name={c.name} src={c.logo_url} size={30} square />
        <div className="min-w-0 flex-1">
          <Link href={`/studio/clients/${c.id}`} className="block truncate text-[13.5px] font-semibold hover:text-accent-2">{c.name}</Link>
          <p className="truncate text-[12px] text-muted">{c.sector ?? "Secteur non renseigné"}</p>
        </div>
        <StatusBadge kind="health" value={c.health} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
        <div><dt className="text-muted">Budget</dt><dd className="font-medium tabular">{fmt.compact(c.monthly_budget)} €</dd></div>
        <div><dt className="text-muted">Briefs</dt><dd className="font-medium tabular">{card.openBriefs}</dd></div>
        <div><dt className="text-muted">Attente client</dt><dd className={cn("font-medium tabular", card.pendingClient && "text-info")}>{card.pendingClient}</dd></div>
      </dl>
      <p className={cn("mt-3 line-clamp-2 text-[12.5px]", card.notes ? "text-fg-2" : "italic text-muted-2")}>{card.notes || "Aucune note agence."}</p>
      <div className="mt-3 flex items-center justify-between">
        {c.status !== "active" ? <Badge tone={c.status === "onboarding" ? "info" : "neutral"}>{CLIENT_STATUS[c.status]}</Badge> : <span />}
        <Button variant="ghost" size="sm" onClick={onNotes}><StickyNote />Notes</Button>
      </div>
    </article>
  );
}

function DraggableCard({ card, onNotes }: { card: PipelineCard; onNotes: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.client.id });
  return <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}><CardView card={card} onNotes={onNotes} handleProps={{ ...attributes, ...listeners }} /></div>;
}

function Column({ stage, cards, onNotes }: { stage: ManagementStage; cards: PipelineCard[]; onNotes: (c: PipelineCard) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} aria-label={MANAGEMENT_STAGE[stage]} className={cn("flex min-h-[320px] flex-col rounded-xl bg-surface-2/50 p-2.5 transition hairline", isOver && "bg-accent-soft ring-1 ring-accent/40")}>
      <header className="mb-2 flex items-center justify-between px-1.5 py-1"><h2 className="text-[13px] font-semibold">{MANAGEMENT_STAGE[stage]}</h2><Badge>{cards.length}</Badge></header>
      <div className="flex-1 space-y-2.5">
        {cards.map((c) => <DraggableCard key={c.client.id} card={c} onNotes={() => onNotes(c)} />)}
        {!cards.length ? <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-[12.5px] text-muted">Aucun client à cette étape</p> : null}
      </div>
    </section>
  );
}

export function PipelineBoard({ cards, statusFilter }: { cards: PipelineCard[]; statusFilter: string }) {
  const router = useRouter(); const pathname = usePathname();
  const { exec, pending } = useAction();
  const [local, setLocal] = useState(cards);
  const [seen, setSeen] = useState(cards);
  if (seen !== cards) { setSeen(cards); setLocal(cards); }
  const [active, setActive] = useState<PipelineCard | null>(null);
  const [notesFor, setNotesFor] = useState<PipelineCard | null>(null);
  const [notes, setNotes] = useState(""); const [stage, setStage] = useState<ManagementStage>("onboarding");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function move(card: PipelineCard, next: ManagementStage) {
    if (card.stage === next) return;
    setLocal((l) => l.map((c) => (c.client.id === card.client.id ? { ...c, stage: next } : c)));
    const res = await exec(() => saveManagement(card.client.id, next, card.notes, card.revision), { success: `${card.client.name} → ${MANAGEMENT_STAGE[next]}` });
    if (!res.ok) setLocal((l) => l.map((c) => (c.client.id === card.client.id ? { ...c, stage: card.stage } : c)));
  }
  const onDragStart = (e: DragStartEvent) => setActive(local.find((c) => c.client.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => { const card = local.find((c) => c.client.id === e.active.id); setActive(null); if (card && e.over && MANAGEMENT_ORDER.includes(e.over.id as ManagementStage)) void move(card, e.over.id as ManagementStage); };
  const openNotes = (c: PipelineCard) => { setNotesFor(c); setNotes(c.notes); setStage(c.stage); };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect value={statusFilter} onChange={(e) => router.replace(e.target.value ? `${pathname}?status=${e.target.value}` : pathname)} className="w-auto min-w-[170px]"><option value="">Tous les statuts client</option>{Object.entries(CLIENT_STATUS).filter(([k]) => k !== "archived").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
        <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Lock className="size-3" />Notes et classement privés à l&apos;agence</span>
      </div>
      {local.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="grid gap-4 md:grid-cols-3">{MANAGEMENT_ORDER.map((s) => <Column key={s} stage={s} cards={local.filter((c) => c.stage === s)} onNotes={openNotes} />)}</div>
          <DragOverlay>{active ? <CardView card={active} onNotes={() => {}} dragging /> : null}</DragOverlay>
        </DndContext>
      ) : <div className="card"><EmptyState title="Aucun client" description="Crée un client pour alimenter le pipeline." /></div>}

      <Dialog open={!!notesFor} onOpenChange={(o) => { if (!o) setNotesFor(null); }}>
        <DialogContent title={`Notes agence · ${notesFor?.client.name ?? ""}`} description="Privées à l'agence. Aucune invitation, aucun email, aucun changement d'accès.">
          <div className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Étape</span><NativeSelect value={stage} onChange={(e) => setStage(e.target.value as ManagementStage)}>{MANAGEMENT_ORDER.map((s) => <option key={s} value={s}>{MANAGEMENT_STAGE[s]}</option>)}</NativeSelect></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Note interne</span><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} maxLength={20000} /></label>
            <DialogFooter><Button variant="ghost" onClick={() => setNotesFor(null)}>Annuler</Button><Button loading={pending} onClick={async () => { if (!notesFor) return; const r = await exec(() => saveManagement(notesFor.client.id, stage, notes, notesFor.revision), { success: "Notes enregistrées" }); if (r.ok) setNotesFor(null); }}>Enregistrer</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

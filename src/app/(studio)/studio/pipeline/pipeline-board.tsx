"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Archive, ArchiveRestore, ExternalLink, GripVertical, Lock, MoreHorizontal, StickyNote, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { CLIENT_STATUS, SEGMENTS, stageLabel, type Client, type ManagementStage, type PipelineStage } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { archiveClient, saveManagement } from "@/lib/actions/clients";
import { DeleteClientDialog } from "../clients/_components/delete-client-dialog";
import { STAGE_DOT } from "../clients/_components/stage-badge";

export interface PipelineCard { client: Client; stage: ManagementStage; notes: string; revision: number; openBriefs: number; pendingClient: number }
interface CardActions { onNotes: (c: PipelineCard) => void; onArchive: (c: PipelineCard) => void; onDelete: ((c: PipelineCard) => void) | null }

/** Les colonnes et les cartes partagent le même DndContext : le préfixe distingue une colonne d'une carte survolée. */
const COLUMN_PREFIX = "col:";

function CardView({ card, actions, dragging, handleProps }: { card: PipelineCard; actions?: CardActions; dragging?: boolean; handleProps?: Record<string, unknown> }) {
  const c = card.client;
  const archived = c.status === "archived";
  const onDelete = actions?.onDelete;
  return (
    <article className={cn("card group p-3.5 transition", dragging && "rotate-1 shadow-pop ring-1 ring-accent/50", archived && "opacity-75")}>
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
      <div className="mt-3 flex items-center justify-between gap-2">
        {c.status === "paused" || archived ? <Badge tone={archived ? "outline" : "neutral"}>Compte {CLIENT_STATUS[c.status].toLowerCase()}</Badge> : <span className="truncate text-[11.5px] text-muted-2">{SEGMENTS[c.segment] ?? "Autre"}</span>}
        {actions ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="sm" onClick={() => actions.onNotes(card)}><StickyNote />Notes</Button>
            <Dropdown>
              <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${c.name}`}><MoreHorizontal /></Button></DropdownTrigger>
              <DropdownContent>
                <DropdownItem onSelect={() => actions.onNotes(card)}><StickyNote />Notes agence</DropdownItem>
                <DropdownItem asChild><Link href={`/studio/clients/${c.id}`}><ExternalLink />Ouvrir la fiche</Link></DropdownItem>
                <DropdownSeparator />
                <DropdownItem onSelect={() => actions.onArchive(card)}>{archived ? <><ArchiveRestore />Restaurer le client</> : <><Archive />Archiver le client</>}</DropdownItem>
                {onDelete ? <DropdownItem danger onSelect={() => onDelete(card)}><Trash2 />Supprimer définitivement</DropdownItem> : null}
              </DropdownContent>
            </Dropdown>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DraggableCard({ card, actions }: { card: PipelineCard; actions: CardActions }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.client.id });
  return <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}><CardView card={card} actions={actions} handleProps={{ ...attributes, ...listeners }} /></div>;
}

function Column({ stage, cards, actions }: { stage: PipelineStage; cards: PipelineCard[]; actions: CardActions }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${stage.key}` });
  return (
    <section ref={setNodeRef} aria-label={stage.label} className={cn("flex min-h-[320px] flex-col rounded-xl bg-surface-2/50 p-2.5 transition hairline", isOver && "bg-accent-soft ring-1 ring-accent/40")}>
      <header className="mb-2 flex items-center justify-between gap-2 px-1.5 py-1">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold"><span className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage.color] ?? STAGE_DOT.neutral)} aria-hidden /><span className="truncate">{stage.label}</span></h2>
        <Badge>{cards.length}</Badge>
      </header>
      <div className="flex-1 space-y-2.5">
        {cards.map((c) => <DraggableCard key={c.client.id} card={c} actions={actions} />)}
        {!cards.length ? <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-[12.5px] text-muted">Aucun client à cette étape</p> : null}
      </div>
    </section>
  );
}

type Saved = { revision: number; notes: string } | null;

export function PipelineBoard({ cards, stages, statusFilter, canDelete }: { cards: PipelineCard[]; stages: PipelineStage[]; statusFilter: string; canDelete: boolean }) {
  const router = useRouter(); const pathname = usePathname();
  const { exec, pending } = useAction();
  const [local, setLocal] = useState(cards);
  const [seen, setSeen] = useState(cards);
  if (seen !== cards) { setSeen(cards); setLocal(cards); }
  const [active, setActive] = useState<PipelineCard | null>(null);
  const [notesFor, setNotesFor] = useState<PipelineCard | null>(null);
  const [notes, setNotes] = useState(""); const [stage, setStage] = useState<ManagementStage>(stages[0]?.key ?? "onboarding");
  const [archiving, setArchiving] = useState<PipelineCard | null>(null);
  const [deleting, setDeleting] = useState<PipelineCard | null>(null);
  // Enregistrements en file par client : un second déplacement immédiat attend la révision renvoyée par le premier.
  // Dès que le serveur renvoie des cartes fraîches (étape supprimée, autre action…), ces révisions mémorisées sont oubliées.
  const chains = useRef(new Map<string, Promise<Saved>>());
  useEffect(() => { chains.current.clear(); }, [cards]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const patch = (id: string, changes: Partial<PipelineCard>) => setLocal((l) => l.map((c) => (c.client.id === id ? { ...c, ...changes } : c)));
  const remove = (id: string) => setLocal((l) => l.filter((c) => c.client.id !== id));

  async function move(card: PipelineCard, next: ManagementStage) {
    if (card.stage === next) return;
    const id = card.client.id;
    patch(id, { stage: next });
    const previous = chains.current.get(id) ?? Promise.resolve<Saved>(null);
    const run = previous.then(async (last) => {
      const res = await exec(() => saveManagement(id, next, last?.notes ?? card.notes, last?.revision ?? card.revision), { success: `${card.client.name} → ${stageLabel(stages, next)}`, refresh: false });
      if (res.ok) { patch(id, { stage: res.data.stage, notes: res.data.notes, revision: res.data.revision }); return { revision: res.data.revision, notes: res.data.notes }; }
      // Échec (fiche modifiée ailleurs, étape supprimée…) : la carte revient et la page se resynchronise.
      patch(id, { stage: card.stage }); router.refresh(); return null;
    });
    chains.current.set(id, run);
    await run;
  }
  const onDragStart = (e: DragStartEvent) => setActive(local.find((c) => c.client.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const card = local.find((c) => c.client.id === e.active.id); setActive(null);
    if (!card || !e.over) return;
    const overId = String(e.over.id);
    // Dépôt sur une colonne, ou sur une carte : on prend alors la colonne qui contient cette carte.
    const target = overId.startsWith(COLUMN_PREFIX) ? overId.slice(COLUMN_PREFIX.length) : local.find((c) => c.client.id === overId)?.stage;
    if (target && stages.some((s) => s.key === target)) void move(card, target);
  };
  const openNotes = (c: PipelineCard) => { setNotesFor(c); setNotes(c.notes); setStage(stages.some((s) => s.key === c.stage) ? c.stage : stages[0]?.key ?? c.stage); };
  async function saveNotes() {
    if (!notesFor) return;
    const current = local.find((c) => c.client.id === notesFor.client.id) ?? notesFor;
    const res = await exec(() => saveManagement(current.client.id, stage, notes, current.revision), { success: "Notes enregistrées", refresh: false });
    if (res.ok) { patch(current.client.id, { stage: res.data.stage, notes: res.data.notes, revision: res.data.revision }); chains.current.delete(current.client.id); setNotesFor(null); }
    else router.refresh();
  }
  async function toggleArchive() {
    if (!archiving) return;
    const archived = archiving.client.status === "archived";
    const res = await exec(() => archiveClient(archiving.client.id, !archived), { success: archived ? `${archiving.client.name} restauré` : `${archiving.client.name} archivé` });
    if (res.ok) { remove(archiving.client.id); setArchiving(null); }
  }
  const actions: CardActions = { onNotes: openNotes, onArchive: setArchiving, onDelete: canDelete ? setDeleting : null };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect value={statusFilter} onChange={(e) => router.replace(e.target.value ? `${pathname}?status=${e.target.value}` : pathname)} className="w-auto min-w-[170px]" aria-label="Filtrer par statut client">
          <option value="">Tous les statuts client</option>
          {Object.entries(CLIENT_STATUS).map(([k, v]) => <option key={k} value={k}>{k === "archived" ? "Archivés" : v}</option>)}
        </NativeSelect>
        <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Lock className="size-3" />Notes et classement privés à l&apos;agence</span>
      </div>
      {!stages.length ? (
        <div className="card"><EmptyState title="Aucune étape dans le pipeline" description="Ajoute une première étape avec « Gérer les étapes »." /></div>
      ) : local.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="grid gap-4 md:grid-flow-col md:auto-cols-[minmax(240px,1fr)] md:overflow-x-auto md:pb-2">
            {stages.map((s) => <Column key={s.key} stage={s} cards={local.filter((c) => c.stage === s.key)} actions={actions} />)}
          </div>
          <DragOverlay>{active ? <CardView card={active} dragging /> : null}</DragOverlay>
        </DndContext>
      ) : <div className="card"><EmptyState title={statusFilter ? "Aucun client avec ce statut" : "Aucun client"} description={statusFilter ? "Change le filtre pour voir les autres clients." : "Crée un client pour alimenter le pipeline."} /></div>}

      <Dialog open={!!notesFor} onOpenChange={(o) => { if (!o) setNotesFor(null); }}>
        <DialogContent title={`Notes agence · ${notesFor?.client.name ?? ""}`} description="Privées à l'agence : le client ne les voit jamais, aucun email n'est envoyé.">
          <div className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Étape</span><NativeSelect value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</NativeSelect></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Note interne</span><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} maxLength={20000} /></label>
            <DialogFooter><Button variant="ghost" onClick={() => setNotesFor(null)}>Annuler</Button><Button loading={pending} onClick={saveNotes}>Enregistrer</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!archiving} onOpenChange={(o) => { if (!o) setArchiving(null); }} loading={pending}
        title={archiving?.client.status === "archived" ? "Restaurer ce client ?" : "Archiver ce client ?"} danger={archiving?.client.status !== "archived"}
        description={archiving?.client.status === "archived" ? `${archiving.client.name} redevient actif et réapparaît dans le pipeline.` : `${archiving?.client.name ?? "Le client"} disparaît des listes actives. Ses données, briefs et fichiers sont conservés. Aucun accès n'est modifié.`}
        confirmLabel={archiving?.client.status === "archived" ? "Restaurer" : "Archiver"} onConfirm={toggleArchive} />

      <DeleteClientDialog client={deleting ? { id: deleting.client.id, name: deleting.client.name } : null} open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }} onDeleted={remove} />
    </>
  );
}

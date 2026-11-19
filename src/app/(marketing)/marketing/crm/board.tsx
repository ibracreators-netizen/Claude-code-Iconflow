"use client";
import * as React from "react";
import Link from "next/link";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, EyeOff, ListChecks, Mail, MoreHorizontal, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { createStageAction, reorderStagesAction, updateProspectAction, updateStageAction } from "@/lib/actions/marketing-crm";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import type { Stage, StageColor } from "@/lib/marketing/types";
import { STAGE_COLORS, stageHex } from "@/lib/marketing/ui";
import { cn, fmt } from "@/lib/utils";
import { amountOf, CardIcons, dealName, money, OwnerBadge, phoneOf, plural, StageDot, type Prefs } from "./shared";

/** Ce qu'on fait sur un prospect depuis la page (les fenêtres sont posées par la vue principale). */
export interface CardActions {
  email: (p: ProspectRow) => void;
  assign: ((p: ProspectRow) => void) | null;
  task: (p: ProspectRow) => void;
  remove: ((ps: ProspectRow[]) => void) | null;
}
/** Cartes affichées par colonne avant « Afficher plus » : la page reste rapide avec des milliers de prospects. */
export const PAGE_CARDS = 50;

/** Menu « ⋯ » d'un prospect : tout ce qu'on fait souvent, sans ouvrir la fiche. */
export function LeadMenu({ p, actions, stages, onMove, className }: { p: ProspectRow; actions: CardActions; stages?: Stage[]; onMove?: (stageId: string) => void; className?: string }) {
  const email = p.contact?.email ?? p.email;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" className={cn("relative z-10 inline-flex size-7 items-center justify-center rounded-[6px] text-mk-icon transition hover:bg-mk-chip hover:text-mk-strong", className)} aria-label={`Actions pour ${dealName(p)}`}><MoreHorizontal className="size-4" /></button>
      </DropdownTrigger>
      <DropdownContent className="w-56">
        <DropdownItem asChild><Link href={`/marketing/crm/${p.id}`}>Ouvrir le prospect</Link></DropdownItem>
        {actions.assign ? <DropdownItem onSelect={() => actions.assign?.(p)}><UserCheck />Attribuer</DropdownItem> : null}
        <DropdownItem disabled={!email || !!p.unsubscribed_at} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45" onSelect={() => actions.email(p)}><Mail />Envoyer un email</DropdownItem>
        <DropdownItem onSelect={() => actions.task(p)}><ListChecks />Ajouter une tâche</DropdownItem>
        {stages && onMove ? (<><DropdownSeparator /><DropdownLabel>Déplacer vers</DropdownLabel>{stages.filter((s) => s.id !== p.stage_id).map((s) => <DropdownItem key={s.id} onSelect={() => onMove(s.id)}><span className="size-2 rounded-full" style={{ background: stageHex(s) }} />{s.name}</DropdownItem>)}</>) : null}
        {actions.remove ? (<><DropdownSeparator /><DropdownItem danger onSelect={() => actions.remove?.([p])}><Trash2 />Supprimer le prospect</DropdownItem></>) : null}
      </DropdownContent>
    </Dropdown>
  );
}

/* ─────────────────────────── Kanban (ordinateur) ─────────────────────────── */

export function Board({ rows, stages, upcoming, memberName, prefs, savePrefs, canManage, actions, today, onMoved }: {
  rows: ProspectRow[]; stages: Stage[]; upcoming: Set<string>; memberName: Record<string, string>; prefs: Prefs; savePrefs: (p: Prefs) => void;
  canManage: boolean; actions: CardActions; today: string; onMoved: () => void;
}) {
  // Déplacement affiché tout de suite ; annulé si l'enregistrement échoue, oublié quand les données reviennent du serveur.
  const [moved, setMoved] = React.useState<Record<string, string>>({});
  const [seen, setSeen] = React.useState(rows);
  if (seen !== rows) { setSeen(rows); setMoved({}); }
  const [active, setActive] = React.useState<ProspectRow | null>(null);
  const [renaming, setRenaming] = React.useState<Stage | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [limits, setLimits] = React.useState<Record<string, number>>({});
  const { exec, pending } = useAction();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const stageOf = (p: ProspectRow) => moved[p.id] ?? p.stage_id ?? "";
  const byId = React.useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const stageName = (id: unknown) => stages.find((s) => s.id === id)?.name ?? "cette colonne";
  const cardName = (id: unknown) => { const p = byId.get(String(id)); return p ? dealName(p) : "La carte"; };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `${cardName(a.id)} attrapé.`,
    onDragOver: ({ active: a, over }) => (over ? `${cardName(a.id)} au-dessus de « ${stageName(over.id)} ».` : `${cardName(a.id)} n'est au-dessus d'aucune colonne.`),
    onDragEnd: ({ active: a, over }) => (over ? `${cardName(a.id)} déposé dans « ${stageName(over.id)} ».` : `${cardName(a.id)} reposé à sa place.`),
    onDragCancel: ({ active: a }) => `Déplacement de ${cardName(a.id)} annulé.`,
  };

  const move = (p: ProspectRow, to: string) => {
    const target = stages.find((s) => s.id === to); if (!target || stageOf(p) === to) return;
    setMoved((m) => ({ ...m, [p.id]: to }));
    exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${target.name} ».`, refresh: false, onSuccess: onMoved })
      .then((res) => { if (!res.ok) setMoved((m) => { const n = { ...m }; delete n[p.id]; return n; }); });
  };
  const onDragStart = (e: DragStartEvent) => setActive(byId.get(String(e.active.id)) ?? null);
  const onDragEnd = (e: DragEndEvent) => { setActive(null); const p = byId.get(String(e.active.id)); if (e.over && p) move(p, String(e.over.id)); };
  const shift = (s: Stage, by: -1 | 1) => { const ids = stages.map((x) => x.id), i = ids.indexOf(s.id), j = i + by; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; exec(() => reorderStagesAction(ids), { success: "Colonnes réordonnées." }); };
  const collapse = (id: string) => savePrefs({ ...prefs, collapsed: prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id] });
  const addColumn = () => { const name = (adding ?? "").trim(); if (!name) return; exec(() => createStageAction({ name }), { success: "Colonne ajoutée.", onSuccess: () => setAdding(null) }); };

  return (
    <>
      <DndContext id="prospects-kanban" sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}
        accessibility={{ announcements, screenReaderInstructions: { draggable: "Pour déplacer un prospect : Espace ou Entrée pour l'attraper, les flèches pour changer de colonne, Espace ou Entrée pour le déposer, Échap pour annuler." } }}>
        <div className="flex h-full gap-3 overflow-x-auto pb-3">
          {stages.map((s, i) => {
            const list = rows.filter((p) => stageOf(p) === s.id);
            return (
              <Column key={s.id} stage={s} rows={list} limit={limits[s.id] ?? PAGE_CARDS} onMore={() => setLimits((l) => ({ ...l, [s.id]: (l[s.id] ?? PAGE_CARDS) + PAGE_CARDS }))}
                collapsed={prefs.collapsed.includes(s.id)} onCollapse={() => collapse(s.id)}
                menu={canManage ? (
                  <Dropdown>
                    <DropdownTrigger asChild><button type="button" className="inline-flex size-7 items-center justify-center rounded-[6px] text-mk-icon transition hover:bg-surface hover:text-mk-strong" aria-label={`Modifier l'étape ${s.name}`}><MoreHorizontal className="size-4" /></button></DropdownTrigger>
                    <DropdownContent className="w-56">
                      <DropdownItem onSelect={() => setRenaming(s)}><Pencil />Renommer</DropdownItem>
                      <DropdownItem disabled={i === 0 || pending} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45" onSelect={() => shift(s, -1)}><ArrowLeft />Déplacer à gauche</DropdownItem>
                      <DropdownItem disabled={i === stages.length - 1 || pending} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45" onSelect={() => shift(s, 1)}><ArrowRight />Déplacer à droite</DropdownItem>
                      <DropdownSeparator /><DropdownLabel>Couleur</DropdownLabel>
                      <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                        {(Object.keys(STAGE_COLORS) as StageColor[]).map((c) => <button key={c} type="button" title={STAGE_COLORS[c].label} aria-label={`Couleur ${STAGE_COLORS[c].label}`} aria-pressed={s.color === c} onClick={() => exec(() => updateStageAction(s.id, { color: c }), { success: "Couleur enregistrée." })} className={cn("size-5 rounded-full ring-offset-2 ring-offset-surface transition hover:scale-110", s.color === c && "ring-2 ring-fg")} style={{ background: STAGE_COLORS[c].hex }} />)}
                      </div>
                      <DropdownSeparator />
                      <DropdownItem danger disabled={s.is_system} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45" onSelect={() => exec(() => updateStageAction(s.id, { active: false }), { success: "Étape retirée." })}><EyeOff />{s.is_system ? "Étape d'origine : non retirable" : "Retirer l'étape"}</DropdownItem>
                    </DropdownContent>
                  </Dropdown>
                ) : null}
                renderCard={(p) => <DraggableCard key={p.id} p={p} upcoming={upcoming.has(p.id)} memberName={memberName} prefs={prefs} today={today} actions={actions} menu={<LeadMenu p={p} actions={actions} stages={stages} onMove={(to) => move(p, to)} />} />} />
            );
          })}
          {canManage ? (
            <section className="w-[300px] shrink-0">
              {adding === null ? (
                <button type="button" onClick={() => setAdding("")} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-mk-input text-[14px] font-medium text-mk-sub transition hover:border-accent hover:text-accent-2"><Plus className="size-4" />Ajouter une étape</button>
              ) : (
                <form className="space-y-2 rounded-[10px] border border-mk-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); addColumn(); }}>
                  <Input autoFocus aria-label="Nom de la nouvelle étape" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Nom de l'étape" maxLength={60} className="h-10 rounded-[8px] border-mk-input" />
                  <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Annuler</Button><Button type="submit" size="sm" loading={pending} disabled={!adding.trim()}>Ajouter</Button></div>
                </form>
              )}
            </section>
          ) : null}
        </div>
        <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <div className="w-[284px] rotate-[1.5deg] cursor-grabbing"><DealCard p={active} upcoming={upcoming.has(active.id)} memberName={memberName} prefs={prefs} today={today} actions={actions} overlay /></div> : null}</DragOverlay>
      </DndContext>
      <RenameDialog stage={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

function Column({ stage, rows, limit, onMore, collapsed, onCollapse, menu, renderCard }: { stage: Stage; rows: ProspectRow[]; limit: number; onMore: () => void; collapsed: boolean; onCollapse: () => void; menu: React.ReactNode; renderCard: (p: ProspectRow) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = rows.reduce((s, r) => s + (amountOf(r) ?? 0), 0);
  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={`${stage.name} (repliée)`} className={cn("flex h-full w-12 shrink-0 flex-col items-center rounded-[10px] bg-surface-2 py-3 transition", isOver && "bg-accent-soft ring-2 ring-accent/40")}>
        <button type="button" onClick={onCollapse} aria-label={`Déplier l'étape ${stage.name}`} title="Déplier" className="flex flex-col items-center gap-3 rounded-md px-1 text-mk-text hover:text-mk-strong">
          <ChevronsRight className="size-4 text-mk-icon" />
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-[12px] font-semibold tabular text-mk-text">{rows.length}</span>
          <span className="flex items-center gap-2 text-[14px] font-semibold [writing-mode:vertical-rl]"><StageDot stage={stage} className="size-2" />{stage.name}</span>
        </button>
      </section>
    );
  }
  const shown = rows.slice(0, limit);
  return (
    <section ref={setNodeRef} aria-label={stage.name} className={cn("flex h-full w-[300px] shrink-0 flex-col rounded-[10px] bg-surface-2 transition", isOver && "bg-accent-soft ring-2 ring-accent/40")}>
      <header className="flex items-start gap-1 px-3 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-mk-strong"><StageDot stage={stage} className="size-2" /><span className="truncate">{stage.name}</span></h3>
          <p className="mt-0.5 text-[13px] text-mk-sub tabular">{plural(rows.length, "prospect")} · {money(total)}</p>
        </div>
        <button type="button" onClick={onCollapse} aria-label={`Replier l'étape ${stage.name}`} title="Replier" className="inline-flex size-7 items-center justify-center rounded-[6px] text-mk-icon transition hover:bg-surface hover:text-mk-strong"><ChevronsLeft className="size-4" /></button>
        {menu}
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {shown.map(renderCard)}
        {rows.length > shown.length ? (
          <li><button type="button" onClick={onMore} className="flex h-9 w-full items-center justify-center rounded-[8px] border border-mk-line bg-surface text-[13px] font-medium text-accent-2 transition hover:border-mk-input">Afficher plus ({rows.length - shown.length})</button></li>
        ) : null}
        {rows.length === 0 ? <li className="flex flex-1 items-center justify-center rounded-[8px] border border-dashed border-mk-input px-3 py-8 text-center text-[13px] text-mk-sub">Aucun prospect · glisse une carte ici</li> : null}
      </ul>
    </section>
  );
}

function DraggableCard(props: { p: ProspectRow; upcoming: boolean; memberName: Record<string, string>; prefs: Prefs; today: string; actions: CardActions; menu: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: props.p.id });
  // Toute la carte se glisse (comme LeadConnector). Au clavier : la carte prend le focus, Espace ou Entrée pour l'attraper.
  const drag = { ...attributes, ...listeners, role: "group", "aria-pressed": undefined, "aria-roledescription": "carte déplaçable", "aria-label": dealName(props.p) };
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <DealCard {...props} dragRef={setActivatorNodeRef} drag={drag} />
    </li>
  );
}

function DealCard({ p, upcoming, memberName, prefs, today, actions, menu, dragRef, drag, overlay }: {
  p: ProspectRow; upcoming: boolean; memberName: Record<string, string>; prefs: Prefs; today: string; actions: CardActions; menu?: React.ReactNode;
  dragRef?: (el: HTMLElement | null) => void; drag?: Record<string, unknown>; overlay?: boolean;
}) {
  const f = prefs.fields, phone = phoneOf(p), email = p.contact?.email ?? p.email, tags = p.contact?.tags ?? [];
  const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(p.created_at.slice(0, 10))) / 86_400_000));
  const owners = [p.setter_id ? `Setter : ${memberName[p.setter_id] ?? "membre"}` : null, p.closer_id ? `Closer : ${memberName[p.closer_id] ?? "membre"}` : null].filter(Boolean).join(" · ");
  const line = (label: string, value: React.ReactNode, title?: string) => (
    <p className="flex min-w-0 gap-1 text-[13px] leading-5"><span className="shrink-0 text-mk-sub">{label} :</span><span className="min-w-0 truncate text-mk-text" title={title}>{value}</span></p>
  );
  return (
    <article ref={dragRef} {...drag} className={cn("rounded-[8px] border border-mk-line bg-surface p-3 shadow-soft outline-offset-2 transition hover:border-mk-input", drag && "cursor-grab active:cursor-grabbing", overlay && "shadow-pop")}>
      <div className="flex items-start gap-2">
        <Link href={`/marketing/crm/${p.id}`} className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-5 text-mk-strong hover:text-accent-2 hover:underline">{dealName(p)}</Link>
        {!f.icons ? menu : null}
        <OwnerBadge p={p} memberName={memberName} onAssign={actions.assign} size={26} />
      </div>
      <div className="mt-1.5 space-y-0.5">
        {f.source ? line("Source", p.source ?? "—", p.source ?? undefined) : null}
        {f.value ? line("Valeur", <span className="tabular">{money(amountOf(p))}</span>) : null}
        {f.company && (p.contact?.company ?? p.marque) ? line("Entreprise", p.contact?.company ?? p.marque) : null}
        {f.phone && phone ? line("Téléphone", <span className="tabular">{phone}</span>) : null}
        {f.email && email ? line("Email", email, email) : null}
        {f.owner && owners ? <p className="truncate text-[13px] leading-5 text-mk-sub">{owners}</p> : null}
        {f.created ? line("Ajouté", days === 0 ? "aujourd'hui" : `le ${fmt.date(p.created_at, { day: "numeric", month: "short" })} (${days} j)`) : null}
        {f.tags && tags.length ? <div className="flex flex-wrap gap-1 pt-1">{tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-mk-chip px-2 py-0.5 text-[11.5px] font-medium text-mk-text">{t}</span>)}</div> : null}
      </div>
      {f.icons ? (
        <div className="mt-2.5 flex items-center border-t border-mk-line pt-2">
          <CardIcons p={p} upcoming={upcoming} onEmail={actions.email} onTask={actions.task} />
          <span className="ml-auto">{menu}</span>
        </div>
      ) : null}
    </article>
  );
}

function RenameDialog({ stage, onClose }: { stage: Stage | null; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [name, setName] = React.useState("");
  const [seen, setSeen] = React.useState<string | null>(null);
  if (stage && seen !== stage.id) { setSeen(stage.id); setName(stage.name); }
  if (!stage && seen !== null) setSeen(null);
  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title="Renommer l'étape" description="Le nom change partout : prospects, liste, fiches et automatisations.">
        <form onSubmit={(e) => { e.preventDefault(); if (stage && name.trim()) exec(() => updateStageAction(stage.id, { name }), { success: "Étape renommée.", onSuccess: onClose }); }}>
          <Field label="Nom"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="submit" loading={pending} disabled={!name.trim()}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

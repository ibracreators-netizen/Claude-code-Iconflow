"use client";
import * as React from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { BriefConcept } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { EditableTitle } from "./editable-title";

export type ConceptRow = Pick<BriefConcept, "id" | "title">;

interface PanelProps {
  items: ConceptRow[]; selectedId: string | null; busy?: boolean;
  onSelect: (id: string) => void; onCreate: () => void; onRename: (id: string, title: string) => void; onReorder: (ids: string[]) => void; onDelete: (id: string) => void;
}

/**
 * Volet des concepts d'un brief (une page par concept).
 *  - `layout="list"`  : colonne (bureau) — renommage en ligne (double-clic ou crayon), suppression, « Nouveau concept ».
 *  - `layout="strip"` : bande horizontale défilable (mobile), sous l'en-tête de l'application.
 * Dans les deux cas, l'ordre se change par glisser-déposer avec la poignée.
 */
export function ConceptsPanel({ layout, items, selectedId, busy, onSelect, onCreate, onRename, onReorder, onDelete }: PanelProps & { layout: "list" | "strip" }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLOListElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map((c) => c.id);
  const strip = layout === "strip";

  // Bande horizontale : le concept sélectionné reste visible.
  React.useEffect(() => {
    if (!strip) return;
    const list = listRef.current;
    if (!list || !selectedId || list.scrollWidth <= list.clientWidth) return;
    const el = list.querySelector<HTMLElement>(`[data-concept="${selectedId}"]`);
    if (el) list.scrollTo({ left: el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [strip, selectedId]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
  };

  const rows = (
    <DndContext id={strip ? "concepts-strip" : "concepts-list"} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={strip ? horizontalListSortingStrategy : verticalListSortingStrategy}>
        <ol ref={listRef} aria-label="Concepts" className={strip ? "flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex flex-col gap-0.5"}>
          {items.map((c, i) => (
            <Row key={c.id} strip={strip} concept={c} index={i} selected={c.id === selectedId} editing={editing === c.id} canDelete={items.length > 1}
              onSelect={() => onSelect(c.id)} onEdit={(on) => setEditing(on ? c.id : null)} onRename={(t) => onRename(c.id, t)} onDelete={() => onDelete(c.id)} />
          ))}
          {strip ? <li className="shrink-0 pl-0.5"><Button variant="secondary" size="icon-sm" className="rounded-full" onClick={onCreate} loading={busy} aria-label="Nouveau concept"><Plus /></Button></li> : null}
        </ol>
      </SortableContext>
    </DndContext>
  );

  if (strip) return <section aria-label="Concepts du brief">{rows}</section>;
  return (
    <section aria-label="Concepts du brief" className="card p-2">
      <header className="flex items-center justify-between px-2 pb-2 pt-1.5">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Concepts<span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-fg-2">{items.length}</span></h2>
      </header>
      {rows}
      <div className="mt-1.5 border-t border-border pt-2">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted hover:text-fg" onClick={onCreate} loading={busy}><Plus />Nouveau concept</Button>
        <p className="px-2 pt-1.5 text-[11px] leading-snug text-muted-2">Glisse la poignée pour réordonner · double-clic pour renommer.</p>
      </div>
    </section>
  );
}

function Row({ strip, concept, index, selected, editing, canDelete, onSelect, onEdit, onRename, onDelete }: {
  strip: boolean; concept: ConceptRow; index: number; selected: boolean; editing: boolean; canDelete: boolean;
  onSelect: () => void; onEdit: (on: boolean) => void; onRename: (title: string) => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: concept.id });
  const number = String(index + 1).padStart(2, "0");
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-2 transition hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${concept.title}`}>
      <GripVertical className="size-4" />
    </button>
  );

  if (strip) {
    return (
      <li ref={setNodeRef} data-concept={concept.id} style={style} aria-current={selected ? "true" : undefined}
        className={cn("flex shrink-0 items-center gap-1 rounded-full border py-1 pl-1.5 pr-3 text-[13px] transition", selected ? "border-accent/40 bg-accent-soft text-fg" : "border-border bg-surface text-fg-2", isDragging && "z-10 opacity-70 shadow-pop")}>
        {handle}
        <span className={cn("font-mono text-[11px]", selected ? "text-accent-2" : "text-muted-2")}>{number}</span>
        <button type="button" onClick={onSelect} className={cn("max-w-[160px] truncate", selected && "font-medium")}>{concept.title}</button>
      </li>
    );
  }

  return (
    <li ref={setNodeRef} data-concept={concept.id} style={style} aria-current={selected ? "true" : undefined}
      className={cn("group flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] transition", selected ? "bg-accent-soft text-fg" : "text-fg-2 hover:bg-surface-2", isDragging && "z-10 bg-surface opacity-80 shadow-pop")}>
      {handle}
      <span className={cn("w-5 shrink-0 text-center font-mono text-[11px]", selected ? "text-accent-2" : "text-muted-2")}>{number}</span>
      <EditableTitle value={concept.title} editing={editing} onEditingChange={onEdit} onCommit={onRename} onClick={onSelect} label={`Titre du concept ${index + 1}`}
        className={cn("flex-1 py-0.5", selected && "font-medium")} inputClassName="flex-1" />
      {!editing ? (
        <span className={cn("shrink-0 items-center group-hover:flex group-focus-within:flex", selected ? "flex" : "hidden")}>
          <Tooltip label="Renommer"><button type="button" onClick={() => onEdit(true)} className="rounded p-1 text-muted transition hover:bg-surface hover:text-fg" aria-label={`Renommer ${concept.title}`}><Pencil className="size-3.5" /></button></Tooltip>
          <Tooltip label={canDelete ? "Supprimer" : "Un brief garde au moins un concept"}>
            <span><button type="button" onClick={onDelete} disabled={!canDelete} className="rounded p-1 text-muted transition hover:bg-surface hover:text-danger disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Supprimer ${concept.title}`}><Trash2 className="size-3.5" /></button></span>
          </Tooltip>
        </span>
      ) : null}
    </li>
  );
}

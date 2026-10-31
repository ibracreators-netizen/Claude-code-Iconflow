"use client";
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { STAGE_COLORS, type PipelineStage, type StageColor } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { deleteStage, reorderStages, saveStage } from "@/lib/actions/clients";
import { STAGE_COLOR_LABEL, STAGE_DOT } from "../clients/_components/stage-badge";

/** Sélecteur de couleur : une pastille par couleur disponible pour une étape. */
function ColorPicker({ value, onChange, name }: { value: StageColor; onChange: (c: StageColor) => void; name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Couleur de ${name}`}>
      {STAGE_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={STAGE_COLOR_LABEL[c]} title={STAGE_COLOR_LABEL[c]} onClick={() => onChange(c)}
          className={cn("flex size-7 items-center justify-center rounded-full transition hover:bg-surface-2", value === c && "ring-2 ring-fg/60")}>
          <span className={cn("size-4 rounded-full", STAGE_DOT[c])} />
        </button>
      ))}
    </div>
  );
}

function StageRow({ stage, count, canDelete, pending, onSave, onDelete }: {
  stage: PipelineStage; count: number; canDelete: boolean; pending: boolean;
  onSave: (label: string, color: StageColor) => Promise<boolean>; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.key });
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState<StageColor>(stage.color);
  const dirty = label.trim() !== stage.label || color !== stage.color;
  const toggle = () => { setEditing((e) => !e); setLabel(stage.label); setColor(stage.color); };
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-lg bg-surface-2/60 hairline", isDragging && "relative z-10 opacity-60 shadow-pop")}>
      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none rounded p-1 text-muted-2 transition hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${stage.label}`}><GripVertical className="size-4" /></button>
        <span className={cn("size-2.5 shrink-0 rounded-full", STAGE_DOT[stage.color] ?? STAGE_DOT.neutral)} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{stage.label}</span>
        <Badge>{count} client{count > 1 ? "s" : ""}</Badge>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Modifier ${stage.label}`} aria-expanded={editing} onClick={toggle}><Pencil className="text-muted" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Supprimer ${stage.label}`} disabled={!canDelete} title={canDelete ? undefined : "Il doit rester au moins une étape"} onClick={onDelete}><Trash2 className="text-muted" /></Button>
      </div>
      {editing ? (
        <form className="space-y-3 border-t border-border px-3 py-3" onSubmit={async (e) => { e.preventDefault(); if (!label.trim()) return; if (await onSave(label.trim(), color)) setEditing(false); }}>
          <Field label="Nom de l'étape"><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoFocus required /></Field>
          <div><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Couleur</span><ColorPicker value={color} onChange={setColor} name={stage.label} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Annuler</Button>
            <Button type="submit" size="sm" disabled={!dirty || !label.trim()} loading={pending}>Enregistrer</Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** Bouton « Gérer les étapes » + volet latéral : ajouter, renommer, colorer, réordonner (glisser-déposer) et supprimer avec report. */
export function ManageStages({ stages, counts }: { stages: PipelineStage[]; counts: Record<string, number> }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(stages);
  const [seen, setSeen] = useState(stages);
  if (seen !== stages) { setSeen(stages); setLocal(stages); }
  const [removing, setRemoving] = useState<PipelineStage | null>(null);
  const [replacement, setReplacement] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<StageColor>("neutral");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = local.findIndex((s) => s.key === e.active.id);
    const to = local.findIndex((s) => s.key === e.over?.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(local, from, to).map((s, i) => ({ ...s, position: i }));
    setLocal(next);
    void exec(() => reorderStages(next.map((s) => s.key)), { success: "Ordre des étapes enregistré" });
  };
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const label = newLabel.trim(); if (!label) return;
    const res = await exec(() => saveStage({ label, color: newColor }), { success: `Étape « ${label} » ajoutée` });
    if (res.ok) { setNewLabel(""); setNewColor("neutral"); }
  }
  const save = (key: string) => async (label: string, color: StageColor) => (await exec(() => saveStage({ key, label, color }), { success: "Étape mise à jour" })).ok;
  async function remove() {
    if (!removing || !replacement) return;
    const res = await exec(() => deleteStage(removing.key, replacement), { success: `Étape « ${removing.label} » supprimée` });
    if (res.ok) setRemoving(null);
  }
  const others = local.filter((s) => s.key !== removing?.key);
  const removingCount = removing ? counts[removing.key] ?? 0 : 0;
  const removingHint = removingCount === 0 ? "Aucun client n'est à cette étape." : removingCount === 1 ? "Le client à cette étape passera dans l'étape que tu choisis." : `Les ${removingCount} clients à cette étape passeront dans l'étape que tu choisis.`;

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}><Settings2 />Gérer les étapes</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" title="Étapes du pipeline" description="Ajoute, renomme, colore et réordonne les étapes en les glissant. Les clients suivent leur étape.">
          <div className="space-y-6">
            {local.length ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={local.map((s) => s.key)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {local.map((s) => (
                      <StageRow key={s.key} stage={s} count={counts[s.key] ?? 0} canDelete={local.length > 1} pending={pending} onSave={save(s.key)}
                        onDelete={() => { setRemoving(s); setReplacement(local.find((x) => x.key !== s.key)?.key ?? ""); }} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-[12.5px] text-muted">Aucune étape pour l&apos;instant. Ajoute la première ci-dessous.</p>}

            <form onSubmit={add} className="space-y-3 rounded-xl border border-dashed border-border-strong p-4">
              <h3 className="text-[13.5px] font-semibold">Nouvelle étape</h3>
              <Field label="Nom"><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex. : Tournage, Montage, Scaling…" maxLength={40} /></Field>
              <div><span className="mb-1.5 block text-[13px] font-medium text-fg-2">Couleur</span><ColorPicker value={newColor} onChange={setNewColor} name="la nouvelle étape" /></div>
              <div className="flex justify-end"><Button type="submit" size="sm" disabled={!newLabel.trim()} loading={pending}><Plus />Ajouter l&apos;étape</Button></div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <DialogContent title={`Supprimer l'étape « ${removing?.label ?? ""} » ?`} description={removingHint}>
          <div className="space-y-4">
            <Field label="Étape de remplacement">
              <NativeSelect value={replacement} onChange={(e) => setReplacement(e.target.value)}>{others.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</NativeSelect>
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRemoving(null)}>Annuler</Button>
              <Button type="button" variant="danger" loading={pending} disabled={!replacement} onClick={remove}><Trash2 />Supprimer l&apos;étape</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

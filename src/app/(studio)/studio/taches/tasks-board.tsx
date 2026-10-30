"use client";
import * as React from "react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckSquare, GripVertical, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { EmptyState, Table, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { createTask, deleteTask, moveTask, updateTask } from "@/lib/actions/tasks";
import { TASK_ORDER, TASK_PRIORITY, TASK_STATUS, type Task, type TaskPriority, type TaskStatus } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { FilterBar, useUrlFlag, useUrlParam } from "../_prod/filter-bar";

type Opt = { id: string; name: string };
interface Props { tasks: Task[]; totalCount: number; clients: Opt[]; profiles: Opt[]; meId: string; today: string }

export function TasksBoard({ tasks, totalCount, clients, profiles, meId, today }: Props) {
  const [view, setView] = useUrlParam("view");
  const [assignee, setAssignee] = useUrlParam("assignee");
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useUrlFlag("new");
  const [composer, setComposerState] = React.useState<TaskStatus | null>(createOpen ? "a_faire" : null);
  const setComposer = (c: TaskStatus | null) => { setComposerState(c); if (!c && createOpen) setCreateOpen(false); };
  const [seenFlag, setSeenFlag] = React.useState(createOpen);
  if (seenFlag !== createOpen) { setSeenFlag(createOpen); if (createOpen && !composer) setComposerState("a_faire"); }
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const profileName = Object.fromEntries(profiles.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl value={view === "liste" ? "liste" : "kanban"} onChange={(v) => setView(v === "kanban" ? "" : v)} options={[{ value: "kanban", label: "Kanban" }, { value: "liste", label: "Liste" }]} />
          <label className="flex items-center gap-2 text-[13px] text-fg-2"><Switch checked={assignee === "me"} onCheckedChange={(c) => setAssignee(c ? "me" : "", true)} />Mes tâches</label>
        </div>
        <FilterBar filters={[
          { param: "assignee", label: "Toute l'équipe", options: profiles.map((p) => ({ value: p.id, label: p.name })) },
          { param: "client", label: "Tous les clients", options: clients.map((c) => ({ value: c.id, label: c.name })) },
        ]}>
          <Button size="sm" onClick={() => setComposer("a_faire")}><Plus />Nouvelle tâche</Button>
        </FilterBar>
      </div>

      {tasks.length === 0 && !composer ? (
        <div className="card"><EmptyState icon={CheckSquare} title={totalCount ? "Aucune tâche avec ces filtres" : "Aucune tâche"} description={totalCount ? "Élargis les filtres ou crée une nouvelle tâche." : "Crée ta première tâche : script à contrôler, montage, relance client…"} action={<Button size="sm" onClick={() => setComposer("a_faire")}><Plus />Nouvelle tâche</Button>} /></div>
      ) : view === "liste" ? (
        <ListView tasks={tasks} clientName={clientName} profileName={profileName} today={today} onOpen={setEditing} composer={composer} setComposer={setComposer} clients={clients} profiles={profiles} meId={meId} />
      ) : (
        <Kanban tasks={tasks} clientName={clientName} profileName={profileName} today={today} onOpen={setEditing} composer={composer} setComposer={setComposer} clients={clients} profiles={profiles} meId={meId} />
      )}

      {editing ? <TaskDialog key={editing.id} task={editing} clients={clients} profiles={profiles} open onOpenChange={(o) => !o && setEditing(null)} /> : null}
    </div>
  );
}

/* ─── Kanban ────────────────────────────────────────────────────────────── */

interface ComposerProps { composer: TaskStatus | null; setComposer: (c: TaskStatus | null) => void; clients: Opt[]; profiles: Opt[]; meId: string }

function Kanban({ tasks, clientName, profileName, today, onOpen, ...composerProps }: { tasks: Task[]; clientName: Record<string, string>; profileName: Record<string, string>; today: string; onOpen: (t: Task) => void } & ComposerProps) {
  const [columns, setColumns] = React.useState<Record<TaskStatus, Task[]>>(() => group(tasks));
  const [seen, setSeen] = React.useState(tasks);
  if (seen !== tasks) { setSeen(tasks); setColumns(group(tasks)); }
  const [active, setActive] = React.useState<Task | null>(null);
  const { exec } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findColumn = (id: string): TaskStatus | undefined => {
    if (TASK_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
    return TASK_ORDER.find((s) => columns[s].some((t) => t.id === id));
  };

  const onDragStart = (e: DragStartEvent) => setActive(tasks.find((t) => t.id === e.active.id) ?? null);
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e; if (!over) return;
    const from = findColumn(String(active.id)), to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const item = cols[from].find((t) => t.id === active.id)!;
      const overIndex = cols[to].findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : cols[to].length;
      return { ...cols, [from]: cols[from].filter((t) => t.id !== active.id), [to]: [...cols[to].slice(0, insertAt), { ...item, status: to }, ...cols[to].slice(insertAt)] };
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e; setActive(null); if (!over) return;
    const col = findColumn(String(over.id)) ?? findColumn(String(active.id)); if (!col) return;
    const list = columns[col];
    const from = list.findIndex((t) => t.id === active.id);
    const to = list.findIndex((t) => t.id === over.id);
    const final = from >= 0 && to >= 0 && from !== to ? arrayMove(list, from, to) : list;
    setColumns((c) => ({ ...c, [col]: final }));
    const index = final.findIndex((t) => t.id === active.id);
    const original = tasks.find((t) => t.id === active.id);
    if (!original) return;
    if (original.status !== col || original.position !== index) exec(() => moveTask(String(active.id), col, index), { success: col === "termine" && original.status !== "termine" ? "Tâche terminée." : undefined });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_ORDER.map((status) => <Column key={status} status={status} tasks={columns[status]} clientName={clientName} profileName={profileName} today={today} onOpen={onOpen} {...composerProps} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <div className="rotate-1 shadow-pop"><TaskCard task={active} clientName={clientName} profileName={profileName} today={today} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function group(tasks: Task[]): Record<TaskStatus, Task[]> {
  return Object.fromEntries(TASK_ORDER.map((s) => [s, tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position)])) as Record<TaskStatus, Task[]>;
}

function Column({ status, tasks, composer, setComposer, clients, profiles, meId, ...rest }: { status: TaskStatus; tasks: Task[]; clientName: Record<string, string>; profileName: Record<string, string>; today: string; onOpen: (t: Task) => void } & ComposerProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dot = { a_faire: "bg-muted-2", en_cours: "bg-accent", revue: "bg-violet", termine: "bg-success" }[status];
  return (
    <section ref={setNodeRef} className={cn("flex min-h-[220px] flex-col rounded-xl border border-border bg-surface-2/50 transition", isOver && "border-accent/50 bg-accent-soft/40")} aria-label={TASK_STATUS[status]}>
      <header className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold"><span className={cn("size-2 rounded-full", dot)} />{TASK_STATUS[status]}<span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-muted">{tasks.length}</span></header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
          {composer === status ? <li><InlineComposer status={status} clients={clients} profiles={profiles} meId={meId} onClose={() => setComposer(null)} /></li> : null}
          {tasks.map((t) => <SortableCard key={t.id} task={t} {...rest} />)}
          {tasks.length === 0 && composer !== status ? <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-[12px] text-muted-2">Glisse une tâche ici</li> : null}
        </ul>
      </SortableContext>
      {composer !== status ? <button type="button" onClick={() => setComposer(status)} className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-surface hover:text-fg"><Plus className="size-3.5" />Ajouter une tâche</button> : null}
    </section>
  );
}

function SortableCard({ task, onOpen, ...rest }: { task: Task; clientName: Record<string, string>; profileName: Record<string, string>; today: string; onOpen: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")}>
      <TaskCard task={task} {...rest} onOpen={onOpen} handle={<button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-muted-2 hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${task.title}`}><GripVertical className="size-4" /></button>} />
    </li>
  );
}

function TaskCard({ task, clientName, profileName, today, onOpen, handle }: { task: Task; clientName: Record<string, string>; profileName: Record<string, string>; today: string; onOpen?: (t: Task) => void; handle?: React.ReactNode }) {
  const late = task.status !== "termine" && task.due_date && task.due_date < today;
  return (
    <article onClick={() => onOpen?.(task)} className={cn("card cursor-pointer space-y-2 p-3 transition hover:border-border-strong", task.status === "termine" && "opacity-70")}>
      <div className="flex items-start gap-1.5">
        {handle}
        <h4 className={cn("min-w-0 flex-1 text-[13.5px] font-medium leading-snug", task.status === "termine" && "line-through text-muted")}>{task.title}</h4>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind="priority" value={task.priority} dot={false} />
        {task.labels.map((l) => <Badge key={l} tone="outline">{l}</Badge>)}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
        <span className="truncate">{task.client_id ? clientName[task.client_id] ?? "" : "Interne"}</span>
        <span className="flex shrink-0 items-center gap-2">
          {task.due_date ? <span className={cn("flex items-center gap-1 tabular", late && "font-medium text-danger")}><CalendarClock className="size-3" />{fmt.date(task.due_date)}</span> : null}
          {task.assignee_id ? <Avatar name={profileName[task.assignee_id] ?? "?"} size={20} /> : null}
        </span>
      </div>
    </article>
  );
}

/* ─── Liste ─────────────────────────────────────────────────────────────── */

function ListView({ tasks, clientName, profileName, today, onOpen, composer, setComposer, clients, profiles, meId }: { tasks: Task[]; clientName: Record<string, string>; profileName: Record<string, string>; today: string; onOpen: (t: Task) => void } & ComposerProps) {
  const sorted = [...tasks].sort((a, b) => TASK_ORDER.indexOf(a.status) - TASK_ORDER.indexOf(b.status) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return (
    <Table>
      <thead><tr><Th>Tâche</Th><Th>Statut</Th><Th>Priorité</Th><Th>Client</Th><Th>Responsable</Th><Th>Échéance</Th></tr></thead>
      <tbody>
        {composer ? <tr><td colSpan={6} className="border-b border-border px-3 py-2"><InlineComposer status={composer} clients={clients} profiles={profiles} meId={meId} onClose={() => setComposer(null)} inline /></td></tr>
          : <tr><td colSpan={6} className="border-b border-border px-3 py-1"><button type="button" onClick={() => setComposer("a_faire")} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-muted transition hover:bg-surface-2 hover:text-fg"><Plus className="size-3.5" />Ajouter une tâche</button></td></tr>}
        {sorted.map((t) => {
          const late = t.status !== "termine" && t.due_date && t.due_date < today;
          return (
            <Tr key={t.id} className="cursor-pointer" onClick={() => onOpen(t)}>
              <Td className="font-medium">{t.title}{t.labels.length ? <span className="ml-2 inline-flex gap-1">{t.labels.map((l) => <Badge key={l} tone="outline">{l}</Badge>)}</span> : null}</Td>
              <Td><StatusBadge kind="task" value={t.status} /></Td>
              <Td><StatusBadge kind="priority" value={t.priority} dot={false} /></Td>
              <Td className="text-muted">{t.client_id ? clientName[t.client_id] : "Interne"}</Td>
              <Td>{t.assignee_id ? <span className="flex items-center gap-2"><Avatar name={profileName[t.assignee_id] ?? "?"} size={20} />{profileName[t.assignee_id]}</span> : <span className="text-muted">—</span>}</Td>
              <Td className={cn("tabular", late && "font-medium text-danger")}>{t.due_date ? fmt.date(t.due_date) : "—"}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/* ─── Saisie en ligne (TickTick / Notion) ───────────────────────────────── */

const compact = "h-8 rounded-[10px] border-transparent bg-surface-2 px-2 text-[12.5px] focus:border-accent/40";

function InlineComposer({ status, clients, profiles, meId, onClose, inline }: { status: TaskStatus; clients: Opt[]; profiles: Opt[]; meId: string; onClose: () => void; inline?: boolean }) {
  const { exec, pending } = useAction();
  const [title, setTitle] = React.useState("");
  const [meta, setMeta] = React.useState({ assignee_id: meId, due_date: "", priority: "normale" as TaskPriority, client_id: "" });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const submit = async () => {
    const t = title.trim(); if (!t) { onClose(); return; }
    const res = await exec(() => createTask({ title: t, status, priority: meta.priority, assignee_id: meta.assignee_id || null, client_id: meta.client_id || null, due_date: meta.due_date || null }), { success: "Tâche ajoutée." });
    if (res.ok) { setTitle(""); inputRef.current?.focus(); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } if (e.key === "Escape") { e.preventDefault(); onClose(); } };
  return (
    <div className={cn("space-y-2 rounded-xl border border-accent/40 bg-surface p-2.5 shadow-soft animate-rise", inline && "border-0 bg-transparent p-0 shadow-none")} onKeyDown={onKey}>
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border-strong" aria-hidden />
        <input ref={inputRef} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom de la tâche… Entrée pour ajouter, Échap pour fermer" maxLength={300} className="h-8 w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-muted-2" aria-label="Nom de la tâche" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-7">
        <NativeSelect aria-label="Responsable" value={meta.assignee_id} onChange={(e) => setMeta({ ...meta, assignee_id: e.target.value })} className={cn(compact, "w-auto min-w-[120px]")}><option value="">Non assigné</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
        <Input type="date" aria-label="Échéance" value={meta.due_date} onChange={(e) => setMeta({ ...meta, due_date: e.target.value })} className={cn(compact, "w-auto")} />
        <NativeSelect aria-label="Priorité" value={meta.priority} onChange={(e) => setMeta({ ...meta, priority: e.target.value as TaskPriority })} className={cn(compact, "w-auto")}>{(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((k) => <option key={k} value={k}>{TASK_PRIORITY[k]}</option>)}</NativeSelect>
        <NativeSelect aria-label="Client" value={meta.client_id} onChange={(e) => setMeta({ ...meta, client_id: e.target.value })} className={cn(compact, "w-auto min-w-[110px]")}><option value="">Interne</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
        <span className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
          <Button type="button" size="sm" loading={pending} onClick={() => void submit()} disabled={!title.trim()}>Ajouter</Button>
        </span>
      </div>
    </div>
  );
}

/* ─── Dialogue d'édition (panneau latéral) ───────────────────────────────── */

function TaskDialog({ task, clients, profiles, meId, open, onOpenChange }: { task?: Task; clients: Opt[]; profiles: Opt[]; meId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { exec, pending } = useAction();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [form, setForm] = React.useState({
    title: task?.title ?? "", description: task?.description ?? "", status: task?.status ?? ("a_faire" as TaskStatus), priority: task?.priority ?? ("normale" as TaskPriority),
    assignee_id: task?.assignee_id ?? meId ?? "", client_id: task?.client_id ?? "", due_date: task?.due_date ?? "", labels: task?.labels.join(", ") ?? "",
  });
  const payload = () => ({ title: form.title.trim(), description: form.description.trim() || null, status: form.status, priority: form.priority, assignee_id: form.assignee_id || null, client_id: form.client_id || null, due_date: form.due_date || null, labels: form.labels.split(",").map((s) => s.trim()).filter(Boolean) });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task) exec(() => updateTask(task.id, payload()), { success: "Tâche mise à jour.", onSuccess: () => onOpenChange(false) });
    else exec(() => createTask(payload()), { success: "Tâche créée.", onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" title={task ? "Modifier la tâche" : "Nouvelle tâche"} description={task ? `Créée ${fmt.relative(task.created_at)}` : "Une tâche claire, un responsable, une échéance."}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titre" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={300} autoFocus required /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statut"><NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>{TASK_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s]}</option>)}</NativeSelect></Field>
            <Field label="Priorité"><NativeSelect value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>{(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((p) => <option key={p} value={p}>{TASK_PRIORITY[p]}</option>)}</NativeSelect></Field>
            <Field label="Responsable"><NativeSelect value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}><option value="">Non assigné</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
            <Field label="Client"><NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}><option value="">Interne</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Échéance"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Étiquettes" hint="Séparées par des virgules"><Input value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} placeholder="script, montage…" /></Field>
          </div>
          <DialogFooter className="justify-between">
            <span>{task ? <Button type="button" variant="ghost" className="text-muted hover:text-danger" onClick={() => setConfirmDelete(true)}><Trash2 />Supprimer</Button> : null}</span>
            <span className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button type="submit" loading={pending}>{task ? "Enregistrer" : "Créer"}</Button></span>
          </DialogFooter>
        </form>
        {task ? <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Supprimer cette tâche ?" description="Cette action est définitive." confirmLabel="Supprimer" danger loading={pending} onConfirm={async () => { await exec(() => deleteTask(task.id), { success: "Tâche supprimée.", onSuccess: () => { setConfirmDelete(false); onOpenChange(false); } }); }} /> : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CalendarCheck, GripVertical, ListChecks, Plus, Search, X } from "lucide-react";
import { SortTh } from "@/components/shared/sort-th";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { useAction } from "@/lib/hooks/use-action";
import { createProspectAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import { CALL_RESULT, OUTCOME, type Member, type Stage } from "@/lib/marketing/types";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import { euro, stageTone } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const nameOf = (p: ProspectRow) => p.contact?.name ?? p.name ?? p.contact?.email ?? p.email ?? "Sans nom";
const pagePath = (v: string | null | undefined) => (v ? v.split("?")[0] : null);

type SortKey = "created" | "name" | "stage" | "value" | "task";
type View = "tableau" | "colonnes";

export function ProspectsView({ rows, stages, members, view, today, timezone, upcomingIds }: {
  rows: ProspectRow[]; stages: Stage[]; members: Member[]; view: View; today: string; timezone: string; upcomingIds: string[];
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [setter, setSetter] = React.useState("");
  const [closer, setCloser] = React.useState("");
  const [source, setSource] = React.useState("");
  const [withTask, setWithTask] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created", dir: -1 });
  const upcoming = React.useMemo(() => new Set(upcomingIds), [upcomingIds]);
  const memberName = React.useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const sources = React.useMemo(() => [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))].sort(), [rows]);
  const stagePos = React.useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.position])), [stages]);

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (stage && r.stage_id !== stage) return false;
      if (setter && (setter === "aucun" ? r.setter_id : r.setter_id !== setter)) return false;
      if (closer && (closer === "aucun" ? r.closer_id : r.closer_id !== closer)) return false;
      if (source && r.source !== source) return false;
      if (withTask && !r.openTasks) return false;
      if (t && ![nameOf(r), r.contact?.email ?? r.email, r.contact?.phone ?? r.phone, r.contact?.company ?? r.marque, r.title].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
      return true;
    });
    const by: Record<SortKey, (a: ProspectRow, b: ProspectRow) => number> = {
      created: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b), "fr"),
      stage: (a, b) => (stagePos[a.stage_id ?? ""] ?? 0) - (stagePos[b.stage_id ?? ""] ?? 0),
      value: (a, b) => (a.value ?? -1) - (b.value ?? -1),
      task: (a, b) => (a.nextTaskDue ?? "9999").localeCompare(b.nextTaskDue ?? "9999"),
    };
    return [...out].sort((a, b) => by[sort.key](a, b) * sort.dir);
  }, [rows, q, stage, setter, closer, source, withTask, sort, stagePos]);

  const active = [stage, setter, closer, source, withTask ? "1" : "", q].filter(Boolean).length;
  const reset = () => { setQ(""); setStage(""); setSetter(""); setCloser(""); setSource(""); setWithTask(false); };
  const total = filtered.reduce((s, r) => s + (r.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={view} onChange={(v) => router.push(v === "colonnes" ? "/marketing/prospects?vue=colonnes" : "/marketing/prospects")} options={[{ value: "tableau", label: "Tableau" }, { value: "colonnes", label: "Colonnes" }]} />
        <label className="relative ml-auto block w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">Rechercher un prospect</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email, téléphone, entreprise" className="pl-9" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view === "tableau" ? (
          <NativeSelect aria-label="Filtrer par étape" value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 w-auto"><option value="">Toutes les étapes</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        ) : null}
        <NativeSelect aria-label="Filtrer par setter" value={setter} onChange={(e) => setSetter(e.target.value)} className="h-9 w-auto"><option value="">Tous les setters</option><option value="aucun">Sans setter</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par closer" value={closer} onChange={(e) => setCloser(e.target.value)} className="h-9 w-auto"><option value="">Tous les closers</option><option value="aucun">Sans closer</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par source" value={source} onChange={(e) => setSource(e.target.value)} className="h-9 w-auto max-w-[220px]"><option value="">Toutes les sources</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</NativeSelect>
        <button type="button" aria-pressed={withTask} onClick={() => setWithTask((v) => !v)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition", withTask ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg")}><ListChecks className="size-3.5" />Avec une tâche à faire</button>
        {active ? <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] text-muted hover:text-fg"><X className="size-3.5" />Effacer</button> : null}
        <span className="ml-auto text-[12.5px] text-muted tabular">{filtered.length} prospect{filtered.length > 1 ? "s" : ""}{total ? ` · ${euro.format(total)}` : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucun prospect ne correspond à ces filtres.</div>
      ) : view === "colonnes" ? (
        <Board rows={filtered} stages={stages} upcoming={upcoming} memberName={memberName} onMoved={() => router.refresh()} />
      ) : (
        <TableView rows={filtered} sort={sort} setSort={setSort} memberName={memberName} upcoming={upcoming} today={today} timezone={timezone} />
      )}
    </div>
  );
}

/* ─────────────────────────── Tableau ─────────────────────────── */

function TableView({ rows, sort, setSort, memberName, upcoming, today, timezone }: {
  rows: ProspectRow[]; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; memberName: Record<string, string>; upcoming: Set<string>; today: string; timezone: string;
}) {
  const fmt = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: timezone }), [timezone]);
  const th = { sort, onSort: setSort, desc: ["created", "value"] as SortKey[] };
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            <SortTh k="name" {...th} className="pl-4">Prospect</SortTh><SortTh k="stage" {...th}>Étape</SortTh><SortTh k="value" {...th} className="text-right">Valeur</SortTh><SortTh {...th}>Source et page d&apos;entrée</SortTh><SortTh {...th}>Setter</SortTh><SortTh {...th}>Closer</SortTh><SortTh {...th}>Appel</SortTh><SortTh k="task" {...th}>Tâches</SortTh><SortTh k="created" {...th} className="pr-4 text-right">Créé le</SortTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id} className="align-top transition hover:bg-surface-2/60">
              <td className="max-w-[230px] px-3 py-3 pl-4">
                <Link href={`/marketing/prospects/${p.id}`} className="flex items-center gap-2.5">
                  <Avatar name={nameOf(p)} size={30} />
                  <span className="min-w-0"><span className="block truncate font-medium text-fg hover:underline">{nameOf(p)}</span><span className="block truncate text-[12px] text-muted">{[p.contact?.company ?? p.marque, p.contact?.email ?? p.email].filter(Boolean).join(" · ") || "—"}</span></span>
                </Link>
              </td>
              <td className="px-3 py-3"><Badge tone={stageTone(p.stage)}>{p.stage?.name ?? "Sans étape"}</Badge>{upcoming.has(p.id) ? <div className="mt-1"><Badge tone="info"><CalendarCheck className="size-3" />RDV à venir</Badge></div> : null}</td>
              <td className="px-3 py-3 text-right tabular">{p.signed_amount != null ? <span title="Montant signé HT" className="font-medium text-fg">{euro.format(p.signed_amount)}</span> : p.value != null ? euro.format(p.value) : <span className="text-muted-2">—</span>}</td>
              <td className="max-w-[210px] px-3 py-3"><div className="truncate text-fg-2">{p.source ?? "—"}</div><div className="truncate text-[12px] text-muted" title={p.landing_page ?? undefined}>{pagePath(p.landing_page) ?? ""}{p.utm?.utm_campaign ? ` · ${p.utm.utm_campaign}` : ""}</div></td>
              <td className="px-3 py-3 text-fg-2">{p.setter_id ? memberName[p.setter_id] ?? "Membre" : <span className="text-muted-2">—</span>}</td>
              <td className="px-3 py-3 text-fg-2">{p.closer_id ? memberName[p.closer_id] ?? "Membre" : <span className="text-muted-2">—</span>}</td>
              <td className="px-3 py-3 text-fg-2">{p.call_result ? CALL_RESULT[p.call_result] : <span className="text-muted-2">—</span>}{p.outcome ? <div className="text-[12px] text-muted">{OUTCOME[p.outcome]}</div> : null}</td>
              <td className="px-3 py-3">{p.openTasks ? <span className={cn("inline-flex items-center gap-1 text-[12.5px]", p.nextTaskDue && p.nextTaskDue.slice(0, 10) <= today ? "font-semibold text-warning" : "text-fg-2")}><ListChecks className="size-3.5" />{p.openTasks}{p.nextTaskDue ? ` · ${fmt.format(new Date(p.nextTaskDue))}` : ""}</span> : <span className="text-muted-2">—</span>}</td>
              <td className="whitespace-nowrap px-3 py-3 pr-4 text-right text-muted tabular">{fmt.format(new Date(p.created_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Colonnes (glisser-déposer) ─────────────────────────── */

function Board({ rows, stages, upcoming, memberName, onMoved }: { rows: ProspectRow[]; stages: Stage[]; upcoming: Set<string>; memberName: Record<string, string>; onMoved: () => void }) {
  const [moved, setMoved] = React.useState<Record<string, string>>({});
  const [seen, setSeen] = React.useState(rows);
  if (seen !== rows) { setSeen(rows); setMoved({}); }
  const [active, setActive] = React.useState<ProspectRow | null>(null);
  const { exec } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const stageOf = (p: ProspectRow) => moved[p.id] ?? p.stage_id ?? "";

  const onDragStart = (e: DragStartEvent) => setActive(rows.find((p) => p.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const to = e.over ? String(e.over.id) : null, p = rows.find((r) => r.id === e.active.id);
    if (!to || !p || stageOf(p) === to) return;
    const target = stages.find((s) => s.id === to); if (!target) return;
    setMoved((m) => ({ ...m, [p.id]: to }));
    exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${target.name} ».`, refresh: false, onSuccess: onMoved }).then((res) => { if (!res.ok) setMoved((m) => { const n = { ...m }; delete n[p.id]; return n; }); });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => <Column key={s.id} stage={s} rows={rows.filter((p) => stageOf(p) === s.id)} upcoming={upcoming} memberName={memberName} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <div className="w-[248px] rotate-1 shadow-pop"><DealCard p={active} upcoming={upcoming} memberName={memberName} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, rows, upcoming, memberName }: { stage: Stage; rows: ProspectRow[]; upcoming: Set<string>; memberName: Record<string, string> }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = rows.reduce((s, r) => s + (r.signed_amount ?? r.value ?? 0), 0);
  return (
    <section ref={setNodeRef} aria-label={stage.name} className={cn("flex min-h-[240px] w-[264px] shrink-0 flex-col rounded-xl border border-border bg-surface-2/50 transition", isOver && "border-accent/50 bg-accent-soft/40")}>
      <header className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><span className={cn("size-2 rounded-full", stage.kind === "gagne" ? "bg-success" : stage.kind === "perdu" ? "bg-danger" : stage.key === "nouveau_lead" ? "bg-muted-2" : "bg-info")} />{stage.name}<span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-muted">{rows.length}</span></div>
        {total ? <div className="mt-0.5 pl-4 text-[11.5px] text-muted tabular">{euro.format(total)}</div> : null}
      </header>
      <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {rows.map((p) => <DraggableCard key={p.id} p={p} upcoming={upcoming} memberName={memberName} />)}
        {rows.length === 0 ? <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-[12px] text-muted-2">Glisse un prospect ici</li> : null}
      </ul>
    </section>
  );
}

function DraggableCard({ p, upcoming, memberName }: { p: ProspectRow; upcoming: Set<string>; memberName: Record<string, string> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <DealCard p={p} upcoming={upcoming} memberName={memberName} handle={<button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-muted-2 hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${nameOf(p)}`}><GripVertical className="size-4" /></button>} />
    </li>
  );
}

function DealCard({ p, upcoming, memberName, handle }: { p: ProspectRow; upcoming: Set<string>; memberName: Record<string, string>; handle?: React.ReactNode }) {
  const owner = p.closer_id ? memberName[p.closer_id] : p.setter_id ? memberName[p.setter_id] : null;
  const amount = p.signed_amount ?? p.value;
  return (
    <article className="card space-y-2 p-3">
      <div className="flex items-start gap-1.5">
        {handle}
        <Link href={`/marketing/prospects/${p.id}`} className="min-w-0 flex-1 text-[13px] font-medium leading-snug hover:underline">{nameOf(p)}</Link>
        {amount != null ? <span className="shrink-0 text-[12px] font-medium tabular text-fg-2">{euro.format(amount)}</span> : null}
      </div>
      <p className="truncate pl-6 text-[11.5px] text-muted">{[p.contact?.company ?? p.marque, p.source].filter(Boolean).join(" · ") || "—"}</p>
      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        {upcoming.has(p.id) ? <Badge tone="info"><CalendarCheck className="size-3" />RDV à venir</Badge> : null}
        {p.openTasks ? <Badge tone="warning"><ListChecks className="size-3" />{p.openTasks} tâche{p.openTasks > 1 ? "s" : ""}</Badge> : null}
        {owner ? <span className="ml-auto truncate text-[11.5px] text-muted">{owner}</span> : null}
      </div>
    </article>
  );
}

/* ─────────────────────────── Nouveau prospect ─────────────────────────── */

export function NewProspectButton({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", email: "", phone: "", company: "", source: "", stage: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const valid = !!(f.name.trim() || f.email.trim() || f.phone.trim());
  const submit = () => exec(() => createProspectAction({ name: f.name, email: f.email, phone: f.phone, company: f.company, source: f.source || "manuel", stage_key: stages.find((s) => s.id === f.stage)?.key ?? null }), {
    success: "Prospect ajouté.", refresh: false,
    onSuccess: (r) => { setOpen(false); setF({ name: "", email: "", phone: "", company: "", source: "", stage: "" }); router.push(`/marketing/prospects/${r.prospectId}`); },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouveau prospect</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau prospect" description="Si un contact existe déjà avec cet email ou ce téléphone, l'affaire lui est rattachée : aucune fiche en double.">
          <div className="space-y-3">
            <Field label="Nom"><Input value={f.name} onChange={set("name")} autoFocus maxLength={160} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} maxLength={254} /></Field>
              <Field label="Téléphone"><Input type="tel" value={f.phone} onChange={set("phone")} maxLength={40} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Entreprise"><Input value={f.company} onChange={set("company")} maxLength={120} /></Field>
              <Field label="Source"><Input value={f.source} onChange={set("source")} maxLength={120} placeholder="manuel" /></Field>
            </div>
            <Field label="Étape"><NativeSelect value={f.stage} onChange={set("stage")}><option value="">Nouveau lead</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button loading={pending} disabled={!valid} onClick={submit}>Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarCheck, Clock3, GripVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { updateProspect } from "@/lib/actions/marketing";
import { PROSPECT_STATUS, type Prospect, type ProspectStatus } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

const fmtDate = (isoStr: string, tz: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: tz }).format(new Date(isoStr));

const PIPELINE_ORDER: ProspectStatus[] = ["nouveau", "relance", "reserve", "converti", "perdu"];
const DOT: Record<ProspectStatus, string> = { nouveau: "bg-muted-2", relance: "bg-warning", reserve: "bg-info", converti: "bg-success", perdu: "bg-danger" };
const tone = (s: ProspectStatus): "success" | "danger" | "info" | "warning" | "neutral" => (s === "converti" ? "success" : s === "perdu" ? "danger" : s === "reserve" ? "info" : s === "relance" ? "warning" : "neutral");
const subtitle = (p: Prospect) => [p.email ?? "sans email", p.marque, p.source].filter(Boolean).join(" · ");
const isDue = (p: Prospect, today: string) => !!p.next_action_at && p.next_action_at.slice(0, 10) <= today && p.status !== "converti" && p.status !== "perdu";

type Sort = "optin" | "next" | "recent";

export function ProspectsBoard({ prospects, view, upcomingIds, today, timezone }: {
  prospects: Prospect[]; view: "liste" | "pipeline"; upcomingIds: string[]; today: string; timezone: string;
}) {
  const router = useRouter();
  const upcoming = React.useMemo(() => new Set(upcomingIds), [upcomingIds]);
  const setView = (v: string) => router.push(v === "pipeline" ? "/marketing/prospects?view=pipeline" : "/marketing/prospects");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SegmentedControl value={view} onChange={setView} options={[{ value: "liste", label: "Liste" }, { value: "pipeline", label: "Pipeline" }]} />
        <span className="text-[12.5px] text-muted">{prospects.length} prospect{prospects.length > 1 ? "s" : ""}</span>
      </div>
      {view === "pipeline"
        ? <Pipeline prospects={prospects} upcoming={upcoming} today={today} onRefresh={() => router.refresh()} />
        : <ListView prospects={prospects} upcoming={upcoming} today={today} timezone={timezone} />}
    </div>
  );
}

/* ─────────────────────────── Liste (triable) ─────────────────────────── */

function ListView({ prospects, upcoming, today, timezone }: { prospects: Prospect[]; upcoming: Set<string>; today: string; timezone: string }) {
  const [sort, setSort] = React.useState<Sort>("optin");
  const [status, setStatus] = React.useState<ProspectStatus | "">("");
  const rows = React.useMemo(() => {
    const filtered = status ? prospects.filter((p) => p.status === status) : prospects;
    const cmp: Record<Sort, (a: Prospect, b: Prospect) => number> = {
      optin: (a, b) => (b.opted_in_at ?? "").localeCompare(a.opted_in_at ?? ""),
      next: (a, b) => (a.next_action_at ?? "9999").localeCompare(b.next_action_at ?? "9999"),
      recent: (a, b) => b.created_at.localeCompare(a.created_at),
    };
    return [...filtered].sort(cmp[sort]);
  }, [prospects, sort, status]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus("")} className={cn("rounded-full px-3 py-1.5 text-[13px] transition", !status ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg")}>Tous</button>
        {PIPELINE_ORDER.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-[13px] transition", status === s ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg")}>{PROSPECT_STATUS[s]}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">Trier
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 w-auto">
            <option value="optin">Opt-in récent</option>
            <option value="next">Prochaine action</option>
            <option value="recent">Ajouté récemment</option>
          </NativeSelect>
        </label>
      </div>
      <div className="card overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((p) => {
            const due = isDue(p, today);
            return (
              <li key={p.id}>
                <Link href={`/marketing/prospects/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <Avatar name={p.name ?? p.email ?? "?"} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{p.name ?? p.email ?? "Prospect"}</p>
                    <p className="truncate text-[12.5px] text-muted">{subtitle(p)}</p>
                  </div>
                  {due ? <Badge tone="warning"><Clock3 className="size-3" />À relancer</Badge> : null}
                  {upcoming.has(p.id) ? <Badge tone="info"><CalendarCheck className="size-3" />RDV</Badge> : null}
                  <span className="hidden w-28 shrink-0 text-right text-[12px] text-muted sm:block">{p.opted_in_at ? `Opt-in ${fmtDate(p.opted_in_at, timezone)}` : "—"}</span>
                  <Badge tone={tone(p.status)}>{PROSPECT_STATUS[p.status]}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/* ─────────────────────────── Pipeline (kanban) ─────────────────────────── */

function group(prospects: Prospect[]): Record<ProspectStatus, Prospect[]> {
  return Object.fromEntries(PIPELINE_ORDER.map((s) => [s, prospects.filter((p) => p.status === s)])) as Record<ProspectStatus, Prospect[]>;
}

function Pipeline({ prospects, upcoming, today, onRefresh }: { prospects: Prospect[]; upcoming: Set<string>; today: string; onRefresh: () => void }) {
  const [columns, setColumns] = React.useState<Record<ProspectStatus, Prospect[]>>(() => group(prospects));
  const [seen, setSeen] = React.useState(prospects);
  if (seen !== prospects) { setSeen(prospects); setColumns(group(prospects)); }
  const [active, setActive] = React.useState<Prospect | null>(null);
  const { exec } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findColumn = (id: string): ProspectStatus | undefined =>
    (PIPELINE_ORDER.includes(id as ProspectStatus) ? (id as ProspectStatus) : PIPELINE_ORDER.find((s) => columns[s].some((p) => p.id === id)));

  const onDragStart = (e: DragStartEvent) => setActive(prospects.find((p) => p.id === e.active.id) ?? null);
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e; if (!over) return;
    const from = findColumn(String(active.id)), to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const item = cols[from].find((p) => p.id === active.id); if (!item) return cols;
      const overIndex = cols[to].findIndex((p) => p.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : cols[to].length;
      return { ...cols, [from]: cols[from].filter((p) => p.id !== active.id), [to]: [...cols[to].slice(0, insertAt), { ...item, status: to }, ...cols[to].slice(insertAt)] };
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e; setActive(null); if (!over) return;
    const col = findColumn(String(over.id)) ?? findColumn(String(active.id)); if (!col) return;
    const original = prospects.find((p) => p.id === active.id); if (!original || original.status === col) return;
    exec(() => updateProspect(String(active.id), { status: col }), { success: `Déplacé vers « ${PROSPECT_STATUS[col]} ».`, refresh: false, onSuccess: onRefresh });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE_ORDER.map((status) => <Column key={status} status={status} prospects={columns[status]} upcoming={upcoming} today={today} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <div className="rotate-1 shadow-pop"><Card prospect={active} upcoming={upcoming} today={today} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, prospects, upcoming, today }: { status: ProspectStatus; prospects: Prospect[]; upcoming: Set<string>; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={cn("flex min-h-[220px] flex-col rounded-xl border border-border bg-surface-2/50 transition", isOver && "border-accent/50 bg-accent-soft/40")} aria-label={PROSPECT_STATUS[status]}>
      <header className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold"><span className={cn("size-2 rounded-full", DOT[status])} />{PROSPECT_STATUS[status]}<span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-muted">{prospects.length}</span></header>
      <SortableContext items={prospects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
          {prospects.map((p) => <SortableCard key={p.id} prospect={p} upcoming={upcoming} today={today} />)}
          {prospects.length === 0 ? <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-[12px] text-muted-2">Glisse un prospect ici</li> : null}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ prospect, upcoming, today }: { prospect: Prospect; upcoming: Set<string>; today: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prospect.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")}>
      <Card prospect={prospect} upcoming={upcoming} today={today} handle={<button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-muted-2 hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${prospect.name ?? prospect.email ?? "le prospect"}`}><GripVertical className="size-4" /></button>} />
    </li>
  );
}

function Card({ prospect, upcoming, today, handle }: { prospect: Prospect; upcoming: Set<string>; today: string; handle?: React.ReactNode }) {
  const due = isDue(prospect, today);
  return (
    <article className={cn("card space-y-2 p-3 transition", due && "ring-1 ring-warning/50")}>
      <div className="flex items-start gap-1.5">
        {handle}
        <Avatar name={prospect.name ?? prospect.email ?? "?"} size={26} />
        <Link href={`/marketing/prospects/${prospect.id}`} className="min-w-0 flex-1 text-[13px] font-medium leading-snug hover:underline">{prospect.name ?? prospect.email ?? "Prospect"}</Link>
      </div>
      <p className="truncate pl-7 text-[11.5px] text-muted">{[prospect.marque, prospect.source].filter(Boolean).join(" · ") || "—"}</p>
      {due || upcoming.has(prospect.id) ? (
        <div className="flex flex-wrap gap-1.5 pl-7">
          {due ? <Badge tone="warning"><Clock3 className="size-3" />À relancer</Badge> : null}
          {upcoming.has(prospect.id) ? <Badge tone="info"><CalendarCheck className="size-3" />RDV à venir</Badge> : null}
        </div>
      ) : null}
    </article>
  );
}

"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarPlus, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { createEvent, deleteEvent } from "@/lib/actions/events";
import { EVENT_KIND, MONTHS_FR, type EventKind } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { useUrlParam } from "../_prod/filter-bar";

export interface PlanItem { id: string; date: string; time?: string; title: string; kind: EventKind; source: "event" | "brief" | "livrable"; clientName?: string; href: string | null; notes: string | null; endsAt: string | null }

const KIND_DOT: Record<EventKind, string> = { tournage: "bg-accent", livraison: "bg-info", appel: "bg-violet", deadline: "bg-danger", interne: "bg-muted-2" };
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function PlanningCalendar({ month, items, clients, selected }: { month: string; items: PlanItem[]; clients: Array<{ id: string; name: string }>; selected?: string }) {
  const [, setDay] = useUrlParam("day");
  const [creating, setCreating] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<PlanItem | null>(null);
  const { exec, pending } = useAction();
  const now = new Date(); const today = iso(now);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = React.useMemo(() => { const map: Record<string, PlanItem[]> = {}; items.forEach((it) => { (map[it.date] ??= []).push(it); }); Object.values(map).forEach((l) => l.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"))); return map; }, [items]);
  const sel = selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected : today;
  const upcoming = items.filter((it) => it.date >= today && it.date <= iso(new Date(now.getTime() + 14 * 86400000))).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/60 text-center text-[11.5px] font-semibold uppercase tracking-wider text-muted">{WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = iso(d); const inMonth = d.getMonth() === m - 1; const list = byDay[key] ?? [];
              return (
                <div key={key} role="button" tabIndex={0} onClick={() => setDay(key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDay(key); } }} className={cn("group relative flex min-h-[84px] cursor-default flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left transition hover:bg-surface-2 sm:min-h-[104px]", (i + 1) % 7 === 0 && "border-r-0", i >= 35 && "border-b-0", !inMonth && "bg-surface-2/30 text-muted-2", key === sel && "bg-accent-soft/50")} aria-label={`${d.getDate()} ${MONTHS_FR[d.getMonth()]}`}>
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] tabular", key === today && "bg-accent font-semibold text-accent-fg")}>{d.getDate()}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setCreating(key); }} className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md bg-surface text-muted opacity-0 shadow-soft ring-1 ring-border transition hover:bg-accent hover:text-accent-fg group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Ajouter un événement le ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`}><Plus className="size-3.5" /></button>
                  <span className="flex w-full flex-col gap-0.5">
                    {list.slice(0, 3).map((it) => <span key={it.id} className="flex items-center gap-1 truncate text-[11px] text-fg-2"><span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[it.kind])} />{it.title}</span>)}
                    {list.length > 3 ? <span className="text-[11px] text-muted">+{list.length - 3}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted">{(Object.keys(EVENT_KIND) as EventKind[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", KIND_DOT[k])} />{EVENT_KIND[k]}</span>)}</div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title={sel === today ? "Aujourd'hui" : fmt.dateLong(sel)} description={`${(byDay[sel] ?? []).length} élément${(byDay[sel] ?? []).length > 1 ? "s" : ""}`} action={<Button size="sm" onClick={() => setCreating(sel)}><CalendarPlus />Ajouter</Button>} />
          <CardBody className="pt-0">
            {(byDay[sel] ?? []).length ? <ul className="space-y-2">{(byDay[sel] ?? []).map((it) => <ItemRow key={it.id} item={it} onDelete={() => setToDelete(it)} />)}</ul> : <p className="py-4 text-center text-[13px] text-muted">Rien de prévu ce jour-là.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Les 14 prochains jours" />
          <CardBody className="pt-0">
            {upcoming.length ? <ul className="space-y-2">{upcoming.slice(0, 12).map((it) => <ItemRow key={it.id} item={it} showDate onDelete={() => setToDelete(it)} />)}</ul> : <EmptyState compact icon={Clock} title="Agenda dégagé" description="Aucun tournage, appel ou deadline dans les deux semaines." />}
          </CardBody>
        </Card>
      </div>

      {creating ? <EventDialog date={creating} clients={clients} onOpenChange={(o) => !o && setCreating(null)} /> : null}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Supprimer cet événement ?" description={toDelete?.title} confirmLabel="Supprimer" danger loading={pending} onConfirm={() => { if (toDelete) exec(() => deleteEvent(toDelete.id), { success: "Événement supprimé.", onSuccess: () => setToDelete(null) }); }} />
    </div>
  );
}

function ItemRow({ item, showDate, onDelete }: { item: PlanItem; showDate?: boolean; onDelete: () => void }) {
  const body = (
    <>
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", KIND_DOT[item.kind])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{item.title}</span>
        <span className="block text-[11.5px] text-muted">{showDate ? `${fmt.date(item.date)} · ` : ""}{item.time ? `${item.time} · ` : ""}{EVENT_KIND[item.kind]}{item.clientName ? ` · ${item.clientName}` : ""}</span>
        {item.notes ? <span className="block truncate text-[11.5px] text-muted-2">{item.notes}</span> : null}
      </span>
    </>
  );
  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
      {item.href ? <Link href={item.href} className="flex min-w-0 flex-1 items-start gap-2.5">{body}</Link> : <span className="flex min-w-0 flex-1 items-start gap-2.5">{body}</span>}
      {item.source === "event" ? <button onClick={onDelete} className="rounded p-1 text-muted-2 opacity-0 transition hover:text-danger group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="size-3.5" /></button> : null}
    </li>
  );
}

function EventDialog({ date, clients, onOpenChange }: { date: string; clients: Array<{ id: string; name: string }>; onOpenChange: (o: boolean) => void }) {
  const { exec, pending } = useAction();
  const [form, setForm] = React.useState({ title: "", kind: "tournage" as EventKind, starts_at: `${date}T10:00`, ends_at: "", client_id: "", notes: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    exec(() => createEvent({ title: form.title.trim(), kind: form.kind, starts_at: new Date(form.starts_at).toISOString(), ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, client_id: form.client_id || null, notes: form.notes.trim() || null }), { success: "Événement ajouté.", onSuccess: () => onOpenChange(false) });
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="Nouvel événement" description="Les tournages, appels et livraisons liés à un client sont visibles dans son espace.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Titre" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><NativeSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EventKind })}>{(Object.keys(EVENT_KIND) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_KIND[k]}</option>)}</NativeSelect></Field>
            <Field label="Client"><NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}><option value="">Interne</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
            <Field label="Début" required><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required /></Field>
            <Field label="Fin"><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button type="submit" loading={pending}>Ajouter</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

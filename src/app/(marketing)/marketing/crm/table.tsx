"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Trash2, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, NativeSelect } from "@/components/ui/input";
import { MkInitials } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { toast } from "sonner";
import { bulkUpdateProspectsAction, updateProspectAction } from "@/lib/actions/marketing-crm";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import type { Member, Stage } from "@/lib/marketing/types";
import { stageHex } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { LeadMenu, type CardActions } from "./board";
import { amountOf, assignable, dealName, money, nameOf, phoneOf, plural, StagePill, type Prefs, type SortKey, type SortState } from "./shared";

const SIZES = [20, 50, 100] as const;
/** Fond de la cellule collée d'une ligne cochée : le même vert léger que la ligne, posé sur du blanc (elle passe au-dessus des autres cellules). */
const STICKY_PICKED = "bg-[linear-gradient(color-mix(in_oklab,var(--accent-soft)_60%,transparent),color-mix(in_oklab,var(--accent-soft)_60%,transparent))]";

/** Liste façon tableau LeadConnector : en-têtes triables, sélection et actions groupées, pagination en bas. */
export function TableView({ rows, stages, members, memberName, prefs, onSort, upcoming, today, timezone, canAssign, actions, resetKey, emptyText }: {
  rows: ProspectRow[]; stages: Stage[]; members: Member[]; memberName: Record<string, string>; prefs: Prefs; onSort: (s: SortState) => void;
  upcoming: Set<string>; today: string; timezone: string; canAssign: boolean; actions: CardActions; resetKey: string; emptyText: string;
}) {
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState<number>(20);
  const [seenKey, setSeenKey] = React.useState(resetKey);
  if (seenKey !== resetKey) { setSeenKey(resetKey); setPage(1); }
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [assigning, setAssigning] = React.useState(false);
  const { exec, pending } = useAction();
  const fmtDay = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: timezone }), [timezone]);
  const fmtShort = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: timezone }), [timezone]);
  const stageById = React.useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const pages = Math.max(1, Math.ceil(rows.length / size)), current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * size, current * size);
  const selected = rows.filter((r) => picked.has(r.id));
  const allOnPage = slice.length > 0 && slice.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setPicked((s) => { const n = new Set(s); for (const r of slice) { if (allOnPage) n.delete(r.id); else n.add(r.id); } return n; });
  const bulk = (patch: { stage_id?: string; setter_id?: string | null; closer_id?: string | null }, done?: () => void) =>
    exec(() => bulkUpdateProspectsAction(selected.map((r) => r.id), patch), { onSuccess: (r) => { setPicked(new Set()); done?.(); toast.success(`${plural(r.done, "prospect")} mis à jour.`); } });
  const c = prefs.columns, sort = prefs.sort;
  const th = (k: SortKey | null, label: string, className?: string, desc?: boolean) => <Th key={label} k={k} sort={sort} onSort={onSort} desc={desc} className={className}>{label}</Th>;

  return (
    <div className="space-y-3">
      {canAssign && selected.length ? (
        <div role="region" aria-label="Actions groupées" className="flex flex-wrap items-center gap-2 rounded-[8px] border border-accent/30 bg-accent-soft px-3 py-2">
          <span className="mr-1 text-[14px] font-semibold text-mk-strong">{plural(selected.length, "sélectionné")}</span>
          <Dropdown>
            <DropdownTrigger asChild><Button size="sm" variant="outline" className="h-8 rounded-[8px] border-mk-input bg-surface" disabled={pending}>Changer d&apos;étape<ChevronDown /></Button></DropdownTrigger>
            <DropdownContent align="start" className="w-56">
              {stages.map((s) => <DropdownItem key={s.id} onSelect={() => bulk({ stage_id: s.id })}><span className="size-2 rounded-full" style={{ background: stageHex(s) }} />{s.name}</DropdownItem>)}
            </DropdownContent>
          </Dropdown>
          <Button size="sm" variant="outline" className="h-8 rounded-[8px] border-mk-input bg-surface" disabled={pending} onClick={() => setAssigning(true)}><UserCheck />Attribuer</Button>
          {actions.remove ? <Button size="sm" variant="outline" className="h-8 rounded-[8px] border-mk-input bg-surface text-mk-danger hover:text-mk-danger" onClick={() => actions.remove?.(selected)}><Trash2 />Supprimer</Button> : null}
          <button type="button" onClick={() => setPicked(new Set())} className="ml-auto inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-mk-text hover:bg-surface"><X className="size-4" />Tout désélectionner</button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[8px] border border-mk-line bg-surface shadow-soft">
        {rows.length === 0 ? (
          <p className="px-4 py-14 text-center text-[14px] text-mk-sub">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[14px]">
              <thead className="border-b border-mk-line bg-bg">
                <tr>
                  {canAssign ? <th scope="col" className="w-11 pl-4"><input type="checkbox" aria-label="Sélectionner les prospects de cette page" checked={allOnPage} onChange={togglePage} className="size-4 rounded accent-[var(--accent)]" /></th> : null}
                  {th("name", "Nom", canAssign ? undefined : "pl-4")}
                  {c.stage ? th("stage", "Étape") : null}
                  {c.value ? th("value", "Valeur", undefined, true) : null}
                  {c.source ? th("source", "Source") : null}
                  {c.setter ? th("setter", "Setter") : null}
                  {c.closer ? th("closer", "Closer") : null}
                  {c.phone ? th(null, "Téléphone") : null}
                  {c.company ? th(null, "Entreprise") : null}
                  {c.tags ? th(null, "Étiquettes") : null}
                  {c.created ? th("created", "Créé le", undefined, true) : null}
                  {c.task ? th("task", "Prochaine tâche") : null}
                  {/* Colonne d'actions collée à droite : le menu « ⋯ » reste visible quand le tableau est plus large que l'écran. */}
                  <th scope="col" className="sticky right-0 w-12 bg-bg pr-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {slice.map((p) => {
                  const stage = (p.stage_id ? stageById.get(p.stage_id) : null) ?? p.stage, late = !!p.nextTaskDue && p.nextTaskDue.slice(0, 10) <= today;
                  const sub = p.contact?.email ?? p.email ?? phoneOf(p);
                  return (
                    <tr key={p.id} className={cn("group/row h-16 border-b border-mk-line transition last:border-b-0 hover:bg-bg", picked.has(p.id) && "bg-accent-soft/60 hover:bg-accent-soft/60")}>
                      {canAssign ? <td className="pl-4"><input type="checkbox" aria-label={`Sélectionner ${dealName(p)}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="size-4 rounded accent-[var(--accent)]" /></td> : null}
                      <td className={cn("max-w-[250px] px-3", !canAssign && "pl-4")}>
                        <Link href={`/marketing/crm/${p.id}`} className="group flex items-center gap-3">
                          <MkInitials name={nameOf(p)} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-mk-strong group-hover:text-accent-2 group-hover:underline">{dealName(p)}</span>
                            <span className="block truncate text-[12.5px] text-mk-sub">{sub ?? "—"}</span>
                          </span>
                        </Link>
                      </td>
                      {c.stage ? <td className="max-w-[190px] px-2.5"><span className="flex items-center gap-1.5"><StagePill stage={stage} />{upcoming.has(p.id) ? <CalendarDays className="size-4 shrink-0 text-mk-success" aria-label="Rendez-vous à venir" /> : null}</span></td> : null}
                      {c.value ? <td className="whitespace-nowrap px-2.5 text-mk-text tabular">{p.signed_amount != null ? <span title="Montant signé HT" className="font-medium text-mk-strong">{money(p.signed_amount)}</span> : money(amountOf(p))}</td> : null}
                      {c.source ? <td className="max-w-[170px] px-2.5"><span className="block truncate text-mk-text" title={p.source ?? undefined}>{p.source ?? "—"}</span></td> : null}
                      {c.setter ? <td className="max-w-[140px] truncate px-2.5 text-mk-text">{p.setter_id ? memberName[p.setter_id] ?? "Membre" : <span className="text-mk-sub">—</span>}</td> : null}
                      {c.closer ? <td className="max-w-[140px] truncate px-2.5 text-mk-text">{p.closer_id ? memberName[p.closer_id] ?? "Membre" : <span className="text-mk-sub">—</span>}</td> : null}
                      {c.phone ? <td className="whitespace-nowrap px-3 text-mk-text tabular">{phoneOf(p) ?? <span className="text-mk-sub">—</span>}</td> : null}
                      {c.company ? <td className="max-w-[180px] truncate px-3 text-mk-text">{p.contact?.company ?? p.marque ?? <span className="text-mk-sub">—</span>}</td> : null}
                      {c.tags ? <td className="max-w-[200px] px-3"><span className="block truncate text-[13px] text-mk-text">{(p.contact?.tags ?? []).join(", ") || <span className="text-mk-sub">—</span>}</span></td> : null}
                      {c.created ? <td className="whitespace-nowrap px-2.5 text-mk-text tabular">{fmtDay.format(new Date(p.created_at))}</td> : null}
                      {c.task ? <td className="whitespace-nowrap px-2.5">{p.openTasks ? <span className={cn("text-[13.5px] tabular", late ? "font-semibold text-mk-warn" : "text-mk-text")}>{p.nextTaskDue ? fmtShort.format(new Date(p.nextTaskDue)) : "Sans date"}{p.openTasks > 1 ? <span className="font-normal text-mk-sub"> · {p.openTasks} tâches</span> : null}</span> : <span className="text-mk-sub">—</span>}</td> : null}
                      <td className={cn("sticky right-0 bg-surface pr-3 text-right transition", picked.has(p.id) ? STICKY_PICKED : "group-hover/row:bg-bg")}><LeadMenu p={p} actions={actions} stages={stages} onMove={(to) => exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${stages.find((s) => s.id === to)?.name ?? "l'étape"} ».` })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-mk-line px-4 py-3 text-[13.5px] text-mk-text">
            <span className="tabular">Page {current} sur {pages} <span className="text-mk-sub">· {plural(rows.length, "prospect")}</span></span>
            <label className="ml-auto flex items-center gap-2 text-mk-sub">Par page
              <NativeSelect value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="h-9 w-[76px] rounded-[8px] border-mk-input text-[14px] text-mk-strong">{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</NativeSelect>
            </label>
            <Button variant="outline" size="sm" className="h-9 rounded-[8px] border-mk-input px-3 text-mk-strong" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft />Précédent</Button>
            <Button variant="outline" size="sm" className="h-9 rounded-[8px] border-mk-input px-3 text-mk-strong" disabled={current >= pages} onClick={() => setPage(current + 1)}>Suivant<ChevronRight /></Button>
          </div>
        ) : null}
      </div>
      <BulkAssignDialog open={assigning} count={selected.length} members={members} pending={pending} onClose={() => setAssigning(false)} onApply={(patch) => bulk(patch, () => setAssigning(false))} />
    </div>
  );
}

function Th({ k, sort, onSort, desc, className, children }: { k: SortKey | null; sort: SortState; onSort: (s: SortState) => void; desc?: boolean; className?: string; children: React.ReactNode }) {
  const active = !!k && sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cn("h-11 whitespace-nowrap px-2.5 text-[12.5px] font-medium text-mk-sub", className)}>
      {k ? (
        <button type="button" onClick={() => onSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : desc ? -1 : 1 })} className={cn("inline-flex items-center gap-1 rounded transition hover:text-mk-strong", active && "text-mk-strong")}>
          {children}{active ? (sort.dir === 1 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />) : <ChevronsUpDown className="size-3.5 opacity-50" />}
        </button>
      ) : children}
    </th>
  );
}

function BulkAssignDialog({ open, count, members, pending, onClose, onApply }: { open: boolean; count: number; members: Member[]; pending: boolean; onClose: () => void; onApply: (patch: { setter_id?: string | null; closer_id?: string | null }) => void }) {
  const [f, setF] = React.useState({ setter: "", closer: "" });
  const people = assignable(members);
  const apply = () => {
    const patch: { setter_id?: string | null; closer_id?: string | null } = {};
    if (f.setter) patch.setter_id = f.setter === "aucun" ? null : f.setter;
    if (f.closer) patch.closer_id = f.closer === "aucun" ? null : f.closer;
    onApply(patch);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setF({ setter: "", closer: "" }); } }}>
      <DialogContent title={`Attribuer ${plural(count, "prospect")}`} description="Le setter prend contact et pose le rendez-vous. Le closer tient l'appel.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Setter"><NativeSelect value={f.setter} onChange={(e) => setF((v) => ({ ...v, setter: e.target.value }))}><option value="">Inchangé</option><option value="aucun">Retirer le setter</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
          <Field label="Closer"><NativeSelect value={f.closer} onChange={(e) => setF((v) => ({ ...v, closer: e.target.value }))}><option value="">Inchangé</option><option value="aucun">Retirer le closer</option>{people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></Field>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={pending} disabled={!f.setter && !f.closer} onClick={apply}>Appliquer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

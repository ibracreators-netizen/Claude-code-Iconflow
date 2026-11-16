"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { ArrowLeft, ArrowRight, CalendarCheck, ChevronsLeftRight, EyeOff, GripVertical, ListChecks, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, SlidersHorizontal, Trash2, UserCheck, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SortTh } from "@/components/shared/sort-th";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownCheckItem, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/tabs";
import { useAction } from "@/lib/hooks/use-action";
import { bulkUpdateProspectsAction, createProspectAction, createStageAction, deleteProspectsAction, reorderStagesAction, updateProspectAction, updateStageAction } from "@/lib/actions/marketing-crm";
import { CALL_RESULT, OUTCOME, type Member, type Stage, type StageColor } from "@/lib/marketing/types";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import { euro, STAGE_COLORS, stageHex, stageTone } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";
import { AssignDialog, EmailDialog, TaskDialog, type LeadRef, type MailContext } from "./lead-dialogs";

const nameOf = (p: ProspectRow) => p.contact?.name ?? p.name ?? p.contact?.email ?? p.email ?? "Sans nom";
const pagePath = (v: string | null | undefined) => (v ? v.split("?")[0] : null);
const refOf = (p: ProspectRow): LeadRef => ({ id: p.id, name: nameOf(p), email: p.contact?.email ?? p.email ?? null, company: p.contact?.company ?? p.marque ?? null, setter_id: p.setter_id ?? null, closer_id: p.closer_id ?? null, unsubscribed: !!p.unsubscribed_at });

type SortKey = "created" | "name" | "stage" | "value" | "task";
export type CrmView = "kanban" | "liste";

/* ─────────────────────────── Préférences d'affichage du kanban (par navigateur) ─────────────────────────── */

const FIELDS = { value: "Valeur de l'affaire", company: "Entreprise", source: "Source", owner: "Setter et closer", phone: "Téléphone", tags: "Étiquettes", age: "Ancienneté", task: "Tâches et rendez-vous" } as const;
type FieldKey = keyof typeof FIELDS;
type CardSort = "recent" | "ancien" | "valeur" | "tache";
const CARD_SORT: Record<CardSort, string> = { recent: "Plus récents en haut", ancien: "Plus anciens en haut", valeur: "Plus grosse valeur en haut", tache: "Tâche la plus proche en haut" };
interface Prefs { fields: Record<FieldKey, boolean>; sort: CardSort; collapsed: string[] }
const DEFAULT_PREFS: Prefs = { fields: { value: true, company: true, source: true, owner: true, phone: false, tags: false, age: false, task: true }, sort: "recent", collapsed: [] };
const PREFS_KEY = "iconflow-crm-kanban", PREFS_EVENT = "iconflow-crm-kanban-change";
const readPrefs = (): string => { try { return window.localStorage.getItem(PREFS_KEY) ?? ""; } catch { return ""; } };
const parsePrefs = (raw: string): Prefs => { try { const p = JSON.parse(raw) as Partial<Prefs>; return { fields: { ...DEFAULT_PREFS.fields, ...(p.fields ?? {}) }, sort: p.sort && p.sort in CARD_SORT ? p.sort : "recent", collapsed: Array.isArray(p.collapsed) ? p.collapsed.map(String) : [] }; } catch { return DEFAULT_PREFS; } };
const subscribePrefs = (cb: () => void) => { window.addEventListener(PREFS_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener("storage", cb); }; };
/** Réglages d'affichage gardés dans ce navigateur : le kanban reste utilisable même si le stockage est bloqué. */
function usePrefs(): [Prefs, (next: Prefs) => void] {
  const raw = React.useSyncExternalStore(subscribePrefs, readPrefs, () => "");
  const prefs = React.useMemo(() => parsePrefs(raw), [raw]);
  const save = React.useCallback((next: Prefs) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ } window.dispatchEvent(new Event(PREFS_EVENT)); }, []);
  return [prefs, save];
}

/* ─────────────────────────── Vue principale ─────────────────────────── */

export function CrmView({ rows, stages, members, view, today, timezone, upcomingIds, me, canAssign, canManage, mail }: {
  rows: ProspectRow[]; stages: Stage[]; members: Member[]; view: CrmView; today: string; timezone: string; upcomingIds: string[];
  me: string; canAssign: boolean; canManage: boolean; mail: MailContext;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [setter, setSetter] = React.useState("");
  const [closer, setCloser] = React.useState("");
  const [source, setSource] = React.useState("");
  const [withTask, setWithTask] = React.useState(false);
  const [mine, setMine] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created", dir: -1 });
  const [prefs, savePrefs] = usePrefs();
  const [emailFor, setEmailFor] = React.useState<LeadRef | null>(null);
  const [assignFor, setAssignFor] = React.useState<LeadRef | null>(null);
  const [taskFor, setTaskFor] = React.useState<LeadRef | null>(null);
  const [removing, setRemoving] = React.useState<LeadRef[] | null>(null);
  const { exec: execRemove, pending: removePending } = useAction();
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
      if (mine && r.setter_id !== me && r.closer_id !== me) return false;
      if (t && ![nameOf(r), r.contact?.email ?? r.email, r.contact?.phone ?? r.phone, r.contact?.company ?? r.marque, r.title, ...(r.contact?.tags ?? [])].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
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
  }, [rows, q, stage, setter, closer, source, withTask, mine, me, sort, stagePos]);

  const active = [stage, setter, closer, source, withTask ? "1" : "", mine ? "1" : "", q].filter(Boolean).length;
  const reset = () => { setQ(""); setStage(""); setSetter(""); setCloser(""); setSource(""); setWithTask(false); setMine(false); };
  const total = filtered.reduce((s, r) => s + (r.signed_amount ?? r.value ?? 0), 0);
  const chip = (on: boolean) => cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition", on ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");
  // Supprimer est réservé aux membres de l'agence (ceux qui attribuent) : un commercial passe un lead en « Perdu ».
  const actions: CardActions = { email: setEmailFor, assign: canAssign ? setAssignFor : null, task: setTaskFor, remove: canAssign ? (leads) => setRemoving(leads) : null };
  const confirmRemove = () => { if (removing) void execRemove(() => deleteProspectsAction(removing.map((l) => l.id)), { success: removing.length > 1 ? `${removing.length} leads supprimés.` : "Lead supprimé.", onSuccess: () => setRemoving(null) }); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={view} onChange={(v) => router.push(v === "liste" ? "/marketing/crm?vue=liste" : "/marketing/crm")} options={[{ value: "kanban", label: "Kanban" }, { value: "liste", label: "Liste" }]} />
        <Link href="/marketing/crm?vue=contacts" className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3 text-[13px] text-muted transition hover:text-fg">Contacts</Link>
        {view === "kanban" ? (
          <Dropdown>
            <DropdownTrigger asChild><Button variant="secondary" size="sm" className="hidden lg:inline-flex"><SlidersHorizontal />Personnaliser</Button></DropdownTrigger>
            <DropdownContent align="start" className="w-64">
              <DropdownLabel>Sur chaque carte</DropdownLabel>
              {(Object.keys(FIELDS) as FieldKey[]).map((k) => <DropdownCheckItem key={k} checked={prefs.fields[k]} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => savePrefs({ ...prefs, fields: { ...prefs.fields, [k]: !!v } })}>{FIELDS[k]}</DropdownCheckItem>)}
              <DropdownSeparator />
              <DropdownLabel>Ordre dans les colonnes</DropdownLabel>
              {(Object.keys(CARD_SORT) as CardSort[]).map((k) => <DropdownCheckItem key={k} checked={prefs.sort === k} onCheckedChange={() => savePrefs({ ...prefs, sort: k })}>{CARD_SORT[k]}</DropdownCheckItem>)}
              {prefs.collapsed.length ? <><DropdownSeparator /><DropdownItem onSelect={() => savePrefs({ ...prefs, collapsed: [] })}><ChevronsLeftRight />Déplier toutes les colonnes</DropdownItem></> : null}
            </DropdownContent>
          </Dropdown>
        ) : null}
        <label className="relative ml-auto block w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">Rechercher un lead</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email, téléphone, entreprise" className="pl-9" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view === "liste" ? (
          <NativeSelect aria-label="Filtrer par étape" value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 w-auto"><option value="">Toutes les étapes</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        ) : null}
        <NativeSelect aria-label="Filtrer par setter" value={setter} onChange={(e) => setSetter(e.target.value)} className="hidden h-9 w-auto lg:block"><option value="">Tous les setters</option><option value="aucun">Sans setter</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par closer" value={closer} onChange={(e) => setCloser(e.target.value)} className="hidden h-9 w-auto lg:block"><option value="">Tous les closers</option><option value="aucun">Sans closer</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
        <NativeSelect aria-label="Filtrer par source" value={source} onChange={(e) => setSource(e.target.value)} className="hidden h-9 w-auto max-w-[220px] lg:block"><option value="">Toutes les sources</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</NativeSelect>
        <button type="button" aria-pressed={mine} onClick={() => setMine((v) => !v)} className={chip(mine)}><UserCheck className="size-3.5" />Mes leads</button>
        <button type="button" aria-pressed={withTask} onClick={() => setWithTask((v) => !v)} className={chip(withTask)}><ListChecks className="size-3.5" />Avec une tâche à faire</button>
        {active ? <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] text-muted hover:text-fg"><X className="size-3.5" />Effacer</button> : null}
        <span className="ml-auto text-[12.5px] text-muted tabular">{filtered.length} lead{filtered.length > 1 ? "s" : ""}{total ? ` · ${euro.format(total)}` : ""}</span>
      </div>

      {view === "kanban" ? (
        <>
          <div className="hidden lg:block"><Board rows={filtered} stages={stages} upcoming={upcoming} memberName={memberName} prefs={prefs} savePrefs={savePrefs} canManage={canManage} actions={actions} today={today} onMoved={() => router.refresh()} /></div>
          <div className="lg:hidden"><MobileBoard rows={filtered} stages={stages} upcoming={upcoming} memberName={memberName} prefs={prefs} actions={actions} today={today} onMoved={() => router.refresh()} /></div>
        </>
      ) : filtered.length === 0 ? (
        <div className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucun lead ne correspond à ces filtres.</div>
      ) : (
        <TableView rows={filtered} stages={stages} members={members} sort={sort} setSort={setSort} memberName={memberName} upcoming={upcoming} today={today} timezone={timezone} canAssign={canAssign} actions={actions} />
      )}
      <EmailDialog lead={emailFor} mail={mail} onClose={() => setEmailFor(null)} />
      <AssignDialog lead={assignFor} members={members} onClose={() => setAssignFor(null)} />
      <TaskDialog lead={taskFor} members={members} canAssign={canAssign} me={me} onClose={() => setTaskFor(null)} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} loading={removePending} danger
        title={removing && removing.length > 1 ? `Supprimer ${removing.length} leads ?` : `Supprimer ${removing?.[0]?.name ?? "ce lead"} ?`}
        description="Le lead disparaît avec son historique, ses tâches et ses rendez-vous. Sa fiche contact aussi, si elle n'a pas d'autre affaire. C'est définitif."
        confirmLabel="Supprimer" onConfirm={confirmRemove} />
    </div>
  );
}

interface CardActions { email: (l: LeadRef) => void; assign: ((l: LeadRef) => void) | null; task: (l: LeadRef) => void; remove: ((l: LeadRef[]) => void) | null }

/** Menu d'actions d'un lead : tout ce qu'on fait le plus souvent, sans ouvrir la fiche. */
function LeadMenu({ p, actions, stages, onMove }: { p: ProspectRow; actions: CardActions; stages?: Stage[]; onMove?: (stageId: string) => void }) {
  const lead = refOf(p);
  return (
    <Dropdown>
      <DropdownTrigger asChild><button type="button" className="rounded p-0.5 text-muted-2 transition hover:bg-surface-2 hover:text-fg" aria-label={`Actions pour ${lead.name}`}><MoreHorizontal className="size-4" /></button></DropdownTrigger>
      <DropdownContent className="w-56">
        <DropdownItem asChild><Link href={`/marketing/crm/${p.id}`}>Ouvrir la fiche</Link></DropdownItem>
        {actions.assign ? <DropdownItem onSelect={() => actions.assign?.(lead)}><UserCheck />Attribuer</DropdownItem> : null}
        <DropdownItem disabled={!lead.email || lead.unsubscribed} onSelect={() => actions.email(lead)}><Mail />Envoyer un email</DropdownItem>
        <DropdownItem onSelect={() => actions.task(lead)}><ListChecks />Ajouter une tâche</DropdownItem>
        {stages && onMove ? (<><DropdownSeparator /><DropdownLabel>Déplacer vers</DropdownLabel>{stages.filter((s) => s.id !== p.stage_id).map((s) => <DropdownItem key={s.id} onSelect={() => onMove(s.id)}><span className="size-2 rounded-full" style={{ background: stageHex(s) }} />{s.name}</DropdownItem>)}</>) : null}
        {actions.remove ? (<><DropdownSeparator /><DropdownItem danger onSelect={() => actions.remove?.([lead])}><Trash2 />Supprimer le lead</DropdownItem></>) : null}
      </DropdownContent>
    </Dropdown>
  );
}

/* ─────────────────────────── Liste ─────────────────────────── */

function TableView({ rows, stages, members, sort, setSort, memberName, upcoming, today, timezone, canAssign, actions }: {
  rows: ProspectRow[]; stages: Stage[]; members: Member[]; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; memberName: Record<string, string>; upcoming: Set<string>; today: string; timezone: string; canAssign: boolean; actions: CardActions;
}) {
  const fmt = React.useMemo(() => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: timezone }), [timezone]);
  const th = { sort, onSort: setSort, desc: ["created", "value"] as SortKey[] };
  const { exec, pending } = useAction();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [bulk, setBulk] = React.useState({ stage: "", setter: "", closer: "" });
  const visible = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = visible.length === rows.length && rows.length > 0;
  const apply = () => {
    const patch: { stage_id?: string; setter_id?: string | null; closer_id?: string | null } = {};
    if (bulk.stage) patch.stage_id = bulk.stage;
    if (bulk.setter) patch.setter_id = bulk.setter === "aucun" ? null : bulk.setter;
    if (bulk.closer) patch.closer_id = bulk.closer === "aucun" ? null : bulk.closer;
    exec(() => bulkUpdateProspectsAction(visible, patch), { onSuccess: (r) => { setPicked(new Set()); setBulk({ stage: "", setter: "", closer: "" }); window.alert(`${r.done} lead${r.done > 1 ? "s" : ""} mis à jour.`); } });
  };
  return (
    <div className="space-y-3">
      {canAssign && visible.length ? (
        <div className="card flex flex-wrap items-center gap-2 border-accent/40 p-3" role="region" aria-label="Actions groupées">
          <span className="text-[13px] font-medium">{visible.length} sélectionné{visible.length > 1 ? "s" : ""}</span>
          <NativeSelect aria-label="Changer l'étape" value={bulk.stage} onChange={(e) => setBulk((v) => ({ ...v, stage: e.target.value }))} className="h-9 w-auto"><option value="">Étape : inchangée</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          <NativeSelect aria-label="Changer le setter" value={bulk.setter} onChange={(e) => setBulk((v) => ({ ...v, setter: e.target.value }))} className="h-9 w-auto"><option value="">Setter : inchangé</option><option value="aucun">Retirer le setter</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
          <NativeSelect aria-label="Changer le closer" value={bulk.closer} onChange={(e) => setBulk((v) => ({ ...v, closer: e.target.value }))} className="h-9 w-auto"><option value="">Closer : inchangé</option><option value="aucun">Retirer le closer</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect>
          <Button size="sm" loading={pending} disabled={!bulk.stage && !bulk.setter && !bulk.closer} onClick={apply}>Appliquer</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Tout désélectionner</Button>
          {actions.remove ? <Button size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => actions.remove?.(rows.filter((r) => picked.has(r.id)).map(refOf))}><Trash2 />Supprimer</Button> : null}
        </div>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
              {canAssign ? <th className="w-10 py-2.5 pl-4"><input type="checkbox" aria-label="Tout sélectionner" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-[var(--accent)]" /></th> : null}
              <SortTh k="name" {...th} className={canAssign ? undefined : "pl-4"}>Lead</SortTh><SortTh k="stage" {...th}>Étape</SortTh><SortTh k="value" {...th} className="text-right">Valeur</SortTh><SortTh {...th}>Source et page d&apos;entrée</SortTh><SortTh {...th}>Setter</SortTh><SortTh {...th}>Closer</SortTh><SortTh {...th}>Appel</SortTh><SortTh k="task" {...th}>Tâches</SortTh><SortTh k="created" {...th} className="text-right">Créé le</SortTh><th className="w-10 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.id} className={cn("align-top transition hover:bg-surface-2/60", picked.has(p.id) && "bg-accent-soft/40")}>
                {canAssign ? <td className="py-3 pl-4"><input type="checkbox" aria-label={`Sélectionner ${nameOf(p)}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="mt-1.5 size-4 accent-[var(--accent)]" /></td> : null}
                <td className={cn("max-w-[230px] px-3 py-3", !canAssign && "pl-4")}>
                  <Link href={`/marketing/crm/${p.id}`} className="flex items-center gap-2.5">
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
                <td className="whitespace-nowrap px-3 py-3 text-right text-muted tabular">{fmt.format(new Date(p.created_at))}</td>
                <td className="py-3 pr-3 text-right"><LeadMenu p={p} actions={actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── Kanban (glisser-déposer, colonnes modifiables) ─────────────────────────── */

function Board({ rows, stages, upcoming, memberName, prefs, savePrefs, canManage, actions, today, onMoved }: {
  rows: ProspectRow[]; stages: Stage[]; upcoming: Set<string>; memberName: Record<string, string>; prefs: Prefs; savePrefs: (p: Prefs) => void; canManage: boolean; actions: CardActions; today: string; onMoved: () => void;
}) {
  const [moved, setMoved] = React.useState<Record<string, string>>({});
  const [seen, setSeen] = React.useState(rows);
  if (seen !== rows) { setSeen(rows); setMoved({}); }
  const [active, setActive] = React.useState<ProspectRow | null>(null);
  const [renaming, setRenaming] = React.useState<Stage | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);
  const { exec, pending } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const stageOf = (p: ProspectRow) => moved[p.id] ?? p.stage_id ?? "";
  const order: Record<CardSort, (a: ProspectRow, b: ProspectRow) => number> = {
    recent: (a, b) => b.created_at.localeCompare(a.created_at), ancien: (a, b) => a.created_at.localeCompare(b.created_at),
    valeur: (a, b) => (b.signed_amount ?? b.value ?? -1) - (a.signed_amount ?? a.value ?? -1), tache: (a, b) => (a.nextTaskDue ?? "9999").localeCompare(b.nextTaskDue ?? "9999"),
  };

  const move = (p: ProspectRow, to: string) => {
    const target = stages.find((s) => s.id === to); if (!target || stageOf(p) === to) return;
    setMoved((m) => ({ ...m, [p.id]: to }));
    exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${target.name} ».`, refresh: false, onSuccess: onMoved }).then((res) => { if (!res.ok) setMoved((m) => { const n = { ...m }; delete n[p.id]; return n; }); });
  };
  const onDragStart = (e: DragStartEvent) => setActive(rows.find((p) => p.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => { setActive(null); const p = rows.find((r) => r.id === e.active.id); if (e.over && p) move(p, String(e.over.id)); };
  const shift = (s: Stage, by: -1 | 1) => { const ids = stages.map((x) => x.id), i = ids.indexOf(s.id), j = i + by; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; exec(() => reorderStagesAction(ids), { success: "Colonnes réordonnées." }); };
  const collapse = (id: string) => savePrefs({ ...prefs, collapsed: prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id] });
  const addColumn = () => { const name = (adding ?? "").trim(); if (!name) return; exec(() => createStageAction({ name }), { success: "Colonne ajoutée.", onSuccess: () => setAdding(null) }); };

  return (
    <>
      <DndContext id="crm-kanban" sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s, i) => (
            <Column key={s.id} stage={s} rows={rows.filter((p) => stageOf(p) === s.id).sort(order[prefs.sort])} collapsed={prefs.collapsed.includes(s.id)} onCollapse={() => collapse(s.id)}
              menu={canManage ? (
                <Dropdown>
                  <DropdownTrigger asChild><button type="button" className="rounded p-0.5 text-muted-2 transition hover:bg-surface-3 hover:text-fg" aria-label={`Modifier la colonne ${s.name}`}><MoreHorizontal className="size-4" /></button></DropdownTrigger>
                  <DropdownContent className="w-56">
                    <DropdownItem onSelect={() => setRenaming(s)}><Pencil />Renommer</DropdownItem>
                    <DropdownItem disabled={i === 0 || pending} onSelect={() => shift(s, -1)}><ArrowLeft />Déplacer à gauche</DropdownItem>
                    <DropdownItem disabled={i === stages.length - 1 || pending} onSelect={() => shift(s, 1)}><ArrowRight />Déplacer à droite</DropdownItem>
                    <DropdownSeparator /><DropdownLabel>Couleur</DropdownLabel>
                    <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                      {(Object.keys(STAGE_COLORS) as StageColor[]).map((c) => <button key={c} type="button" title={STAGE_COLORS[c].label} aria-label={`Couleur ${STAGE_COLORS[c].label}`} aria-pressed={s.color === c} onClick={() => exec(() => updateStageAction(s.id, { color: c }), { success: "Couleur enregistrée." })} className={cn("size-5 rounded-full ring-offset-2 ring-offset-surface transition hover:scale-110", s.color === c && "ring-2 ring-fg")} style={{ background: STAGE_COLORS[c].hex }} />)}
                    </div>
                    <DropdownSeparator />
                    <DropdownItem danger disabled={s.is_system} onSelect={() => exec(() => updateStageAction(s.id, { active: false }), { success: "Colonne retirée." })}><EyeOff />{s.is_system ? "Colonne d'origine : non retirable" : "Retirer la colonne"}</DropdownItem>
                  </DropdownContent>
                </Dropdown>
              ) : null}
              renderCard={(p) => <DraggableCard key={p.id} p={p} upcoming={upcoming} memberName={memberName} prefs={prefs} today={today} menu={<LeadMenu p={p} actions={actions} stages={stages} onMove={(to) => move(p, to)} />} />} />
          ))}
          {canManage ? (
            <section className="w-[264px] shrink-0">
              {adding === null ? (
                <button type="button" onClick={() => setAdding("")} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[13px] text-muted transition hover:border-accent/50 hover:text-fg"><Plus className="size-4" />Ajouter une colonne</button>
              ) : (
                <form className="card space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); addColumn(); }}>
                  <Input autoFocus aria-label="Nom de la nouvelle colonne" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Nom de la colonne" maxLength={60} />
                  <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Annuler</Button><Button type="submit" size="sm" loading={pending} disabled={!adding.trim()}>Ajouter</Button></div>
                </form>
              )}
            </section>
          ) : null}
        </div>
        <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <div className="w-[248px] rotate-1 shadow-pop"><DealCard p={active} upcoming={upcoming} memberName={memberName} prefs={prefs} today={today} /></div> : null}</DragOverlay>
      </DndContext>
      <RenameDialog stage={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

/* ─────────────────────────── Kanban sur téléphone : une étape à la fois ─────────────────────────── */

/** Les étapes en pastilles, les leads de l'étape choisie en liste, et sur chaque carte : appeler, écrire, changer d'étape. */
function MobileBoard({ rows, stages, upcoming, memberName, prefs, actions, today, onMoved }: {
  rows: ProspectRow[]; stages: Stage[]; upcoming: Set<string>; memberName: Record<string, string>; prefs: Prefs; actions: CardActions; today: string; onMoved: () => void;
}) {
  const { exec, pending } = useAction();
  const count = (id: string) => rows.filter((p) => p.stage_id === id).length;
  const [picked, setPicked] = React.useState<string | null>(null);
  const current = stages.find((s) => s.id === picked) ?? stages.find((s) => count(s.id) > 0) ?? stages[0];
  if (!current) return <p className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucune étape dans le pipeline.</p>;
  const order: Record<CardSort, (a: ProspectRow, b: ProspectRow) => number> = {
    recent: (a, b) => b.created_at.localeCompare(a.created_at), ancien: (a, b) => a.created_at.localeCompare(b.created_at),
    valeur: (a, b) => (b.signed_amount ?? b.value ?? -1) - (a.signed_amount ?? a.value ?? -1), tache: (a, b) => (a.nextTaskDue ?? "9999").localeCompare(b.nextTaskDue ?? "9999"),
  };
  const list = rows.filter((p) => p.stage_id === current.id).sort(order[prefs.sort]);
  const total = list.reduce((s, r) => s + (r.signed_amount ?? r.value ?? 0), 0);
  const move = (p: ProspectRow, to: string) => { const target = stages.find((s) => s.id === to); if (target && to !== p.stage_id) exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${target.name} ».`, refresh: false, onSuccess: onMoved }); };
  const act = "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 text-[13px] font-medium text-fg-2 transition active:bg-surface-3 disabled:opacity-40";
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Étapes du pipeline">
        {stages.map((s) => {
          const on = s.id === current.id;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => setPicked(s.id)} className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition", on ? "border-transparent bg-accent-soft text-accent-2" : "border-border bg-surface text-fg-2")}>
              <span className="size-2 rounded-full" style={{ background: stageHex(s) }} />{s.name}<span className={cn("rounded-full px-1.5 text-[11px] tabular", on ? "bg-surface text-accent-2" : "bg-surface-2 text-muted")}>{count(s.id)}</span>
            </button>
          );
        })}
      </div>
      <p className="px-1 text-[12.5px] text-muted tabular">{list.length} lead{list.length > 1 ? "s" : ""} en « {current.name} »{total ? ` · ${euro.format(total)}` : ""}</p>
      {list.length === 0 ? <p className="card px-4 py-10 text-center text-[13.5px] text-muted">Aucun lead à cette étape.</p> : (
        <ul className="space-y-2.5">
          {list.map((p) => {
            const lead = refOf(p), phone = p.contact?.phone ?? p.phone, amount = p.signed_amount ?? p.value;
            const late = !!p.nextTaskDue && p.nextTaskDue.slice(0, 10) <= today;
            const owners = [p.setter_id ? `S · ${memberName[p.setter_id] ?? "Membre"}` : null, p.closer_id ? `C · ${memberName[p.closer_id] ?? "Membre"}` : null].filter(Boolean).join(" · ");
            return (
              <li key={p.id} className="card p-3.5" style={{ borderLeftColor: stageHex(current), borderLeftWidth: 4 }}>
                <div className="flex items-start gap-3">
                  <Avatar name={lead.name} size={38} />
                  <Link href={`/marketing/crm/${p.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{lead.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{[lead.company, p.source].filter(Boolean).join(" · ") || lead.email || "—"}</span>
                  </Link>
                  {amount != null ? <span className="shrink-0 text-[13.5px] font-semibold tabular">{euro.format(amount)}</span> : null}
                  <LeadMenu p={p} actions={actions} />
                </div>
                {upcoming.has(p.id) || p.openTasks || owners ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[50px]">
                    {upcoming.has(p.id) ? <Badge tone="info"><CalendarCheck className="size-3" />RDV à venir</Badge> : null}
                    {p.openTasks ? <Badge tone={late ? "warning" : "neutral"}><ListChecks className="size-3" />{p.openTasks} tâche{p.openTasks > 1 ? "s" : ""}</Badge> : null}
                    {owners ? <span className="truncate text-[11.5px] text-muted">{owners}</span> : null}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  {phone ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className={cn(act, "bg-accent text-accent-fg active:bg-accent")} aria-label={`Appeler ${lead.name}`}><Phone className="size-4" />Appeler</a> : <span className={cn(act, "opacity-40")} aria-hidden><Phone className="size-4" />Appeler</span>}
                  <button type="button" className={cn(act, "bg-info/15 text-info active:bg-info/25")} disabled={!lead.email || lead.unsubscribed} onClick={() => actions.email(lead)}><Mail className="size-4" />Écrire</button>
                  <NativeSelect aria-label={`Changer l'étape de ${lead.name}`} value={p.stage_id ?? ""} disabled={pending} onChange={(e) => move(p, e.target.value)} className="h-10 flex-[1.3] rounded-xl">{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
      <DialogContent title="Renommer la colonne" description="Le nom change partout : kanban, liste, fiches et automatisations.">
        <form onSubmit={(e) => { e.preventDefault(); if (stage && name.trim()) exec(() => updateStageAction(stage.id, { name }), { success: "Colonne renommée.", onSuccess: onClose }); }}>
          <Field label="Nom"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="submit" loading={pending} disabled={!name.trim()}>Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Column({ stage, rows, collapsed, onCollapse, menu, renderCard }: { stage: Stage; rows: ProspectRow[]; collapsed: boolean; onCollapse: () => void; menu: React.ReactNode; renderCard: (p: ProspectRow) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = rows.reduce((s, r) => s + (r.signed_amount ?? r.value ?? 0), 0);
  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={stage.name} className={cn("flex min-h-[240px] w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-surface-2/50 py-2.5 transition", isOver && "border-accent/50 bg-accent-soft/40")}>
        <button type="button" onClick={onCollapse} aria-label={`Déplier la colonne ${stage.name}`} className="flex flex-col items-center gap-2 text-muted hover:text-fg">
          <span className="size-2 rounded-full" style={{ background: stageHex(stage) }} />
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular">{rows.length}</span>
          <span className="text-[12.5px] font-semibold [writing-mode:vertical-rl]">{stage.name}</span>
        </button>
      </section>
    );
  }
  return (
    <section ref={setNodeRef} aria-label={stage.name} className={cn("flex min-h-[240px] w-[264px] shrink-0 flex-col rounded-xl border border-border bg-surface-2/50 transition", isOver && "border-accent/50 bg-accent-soft/40")} style={{ borderTopColor: stageHex(stage), borderTopWidth: 3 }}>
      <header className="px-3 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-2 shrink-0 rounded-full" style={{ background: stageHex(stage) }} /><span className="min-w-0 truncate">{stage.name}</span>
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular text-muted">{rows.length}</span>
          <span className="ml-auto flex items-center gap-0.5">
            <button type="button" onClick={onCollapse} aria-label={`Replier la colonne ${stage.name}`} className="rounded p-0.5 text-muted-2 transition hover:bg-surface-3 hover:text-fg"><ChevronsLeftRight className="size-4" /></button>
            {menu}
          </span>
        </div>
        {total ? <div className="mt-0.5 pl-4 text-[11.5px] text-muted tabular">{euro.format(total)}</div> : null}
      </header>
      <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {rows.map(renderCard)}
        {rows.length === 0 ? <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-[12px] text-muted-2">Glisse un lead ici</li> : null}
      </ul>
    </section>
  );
}

function DraggableCard({ p, upcoming, memberName, prefs, today, menu }: { p: ProspectRow; upcoming: Set<string>; memberName: Record<string, string>; prefs: Prefs; today: string; menu: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <DealCard p={p} upcoming={upcoming} memberName={memberName} prefs={prefs} today={today} menu={menu} handle={<button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-muted-2 hover:text-fg active:cursor-grabbing" aria-label={`Déplacer ${nameOf(p)}`}><GripVertical className="size-4" /></button>} />
    </li>
  );
}

function DealCard({ p, upcoming, memberName, prefs, today, handle, menu }: { p: ProspectRow; upcoming: Set<string>; memberName: Record<string, string>; prefs: Prefs; today: string; handle?: React.ReactNode; menu?: React.ReactNode }) {
  const f = prefs.fields, amount = p.signed_amount ?? p.value;
  const sub = [f.company ? p.contact?.company ?? p.marque : null, f.source ? p.source : null].filter(Boolean).join(" · ");
  const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(p.created_at.slice(0, 10))) / 86_400_000));
  const owners = [p.setter_id ? `S · ${memberName[p.setter_id] ?? "Membre"}` : null, p.closer_id ? `C · ${memberName[p.closer_id] ?? "Membre"}` : null].filter(Boolean) as string[];
  const tags = p.contact?.tags ?? [], phone = p.contact?.phone ?? p.phone;
  const late = !!p.nextTaskDue && p.nextTaskDue.slice(0, 10) <= today;
  return (
    <article className="card space-y-2 p-3">
      <div className="flex items-start gap-1.5">
        {handle}
        <Link href={`/marketing/crm/${p.id}`} className="min-w-0 flex-1 text-[13px] font-medium leading-snug hover:underline">{nameOf(p)}</Link>
        {f.value && amount != null ? <span className="shrink-0 text-[12px] font-medium tabular text-fg-2">{euro.format(amount)}</span> : null}
        {menu}
      </div>
      {sub ? <p className="truncate pl-6 text-[11.5px] text-muted">{sub}</p> : null}
      {f.phone && phone ? <p className="truncate pl-6 text-[11.5px] text-fg-2 tabular">{phone}</p> : null}
      {f.tags && tags.length ? <div className="flex flex-wrap gap-1 pl-6">{tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted">{t}</span>)}</div> : null}
      {(f.task && (upcoming.has(p.id) || p.openTasks)) || (f.owner && owners.length) || f.age ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          {f.task && upcoming.has(p.id) ? <Badge tone="info"><CalendarCheck className="size-3" />RDV à venir</Badge> : null}
          {f.task && p.openTasks ? <Badge tone={late ? "warning" : "neutral"}><ListChecks className="size-3" />{p.openTasks} tâche{p.openTasks > 1 ? "s" : ""}</Badge> : null}
          {f.age ? <span className="text-[11px] text-muted-2 tabular">{days === 0 ? "aujourd'hui" : `${days} j`}</span> : null}
          {f.owner && owners.length ? <span className="ml-auto truncate text-[11px] text-muted">{owners.join(" · ")}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

/* ─────────────────────────── Nouveau lead ─────────────────────────── */

export function NewLeadButton({ stages, autoOpen }: { stages: Stage[]; autoOpen?: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [open, setOpen] = React.useState(!!autoOpen);
  const [f, setF] = React.useState({ name: "", email: "", phone: "", company: "", source: "", stage: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const valid = !!(f.name.trim() || f.email.trim() || f.phone.trim());
  const submit = () => exec(() => createProspectAction({ name: f.name, email: f.email, phone: f.phone, company: f.company, source: f.source || "manuel", stage_key: stages.find((s) => s.id === f.stage)?.key ?? null }), {
    success: "Lead ajouté.", refresh: false,
    onSuccess: (r) => { setOpen(false); setF({ name: "", email: "", phone: "", company: "", source: "", stage: "" }); router.push(`/marketing/crm/${r.prospectId}`); },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />Nouveau lead</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau lead" description="Si un contact existe déjà avec cet email ou ce téléphone, l'affaire lui est rattachée : aucune fiche en double.">
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

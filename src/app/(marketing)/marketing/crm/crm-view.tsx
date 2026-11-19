"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, ChevronDown, ChevronsLeftRight, Download, FileDown, KanbanSquare, List, ListFilter, MoreVertical, Plus, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownCheckItem, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { MkEmpty, MkSearchField } from "@/components/marketing/ui";
import { MkSegmented } from "@/components/marketing/segmented";
import { useAction } from "@/lib/hooks/use-action";
import { deleteProspectsAction } from "@/lib/actions/marketing-crm";
import type { Member, Stage } from "@/lib/marketing/types";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import { cn } from "@/lib/utils";
import { AssignDialog, EmailDialog, TaskDialog, type LeadRef, type MailContext } from "./lead-dialogs";
import { Board, type CardActions } from "./board";
import { columnId, MobileBoard, MobileList } from "./mobile-board";
import { TableView } from "./table";
import { activeFilters, FilterFields, matcher, NO_FILTERS, type Filters } from "./filters";
import { CARD_FIELDS, comparator, DEFAULT_PREFS, PIPELINE, plural, refOf, samePreset, Sheet, SheetOption, SORT_PRESETS, SORT_SHORT, StageDot, TABLE_COLUMNS, usePrefs, nameOf, type CardField, type SortState, type TableColumn } from "./shared";

export type CrmView = "kanban" | "liste";

/**
 * Page « Prospects » (ex-CRM), au style des Opportunités de LeadConnector.
 * Ordinateur : pipeline, nombre, vues kanban / liste, onglets, filtres avancés, tri, recherche, champs affichés.
 * Téléphone : recherche, pastilles (pipeline, filtres, tri) et colonnes qui défilent de côté.
 */
export function CrmView({ rows, stages, members, today, timezone, upcomingIds, me, canAssign, canManage, canImport, canExport, mail }: {
  rows: ProspectRow[]; stages: Stage[]; members: Member[]; today: string; timezone: string; upcomingIds: string[];
  me: string; canAssign: boolean; canManage: boolean; canImport: boolean; canExport: boolean; mail: MailContext;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const vue = params.get("vue");
  const view: CrmView = vue === "liste" || vue === "tableau" ? "liste" : "kanban";
  // La vue se change sans recharger les données : l'adresse suit (?vue=liste), le retour arrière aussi.
  const setView = (v: CrmView) => {
    if (v === view) return;
    const next = new URLSearchParams(params.toString());
    if (v === "liste") next.set("vue", "liste"); else next.delete("vue");
    const qs = next.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const [f, setF] = React.useState<Filters>(NO_FILTERS);
  const set = React.useCallback((patch: Partial<Filters>) => setF((v) => ({ ...v, ...patch })), []);
  const [prefs, savePrefs] = usePrefs();
  const [sheet, setSheet] = React.useState<null | "pipeline" | "filtres" | "tri">(null);
  const [drawer, setDrawer] = React.useState<null | "filtres" | "champs">(null);
  const [emailFor, setEmailFor] = React.useState<LeadRef | null>(null);
  const [assignFor, setAssignFor] = React.useState<LeadRef | null>(null);
  const [taskFor, setTaskFor] = React.useState<LeadRef | null>(null);
  const [removing, setRemoving] = React.useState<ProspectRow[] | null>(null);
  const { exec: execRemove, pending: removePending } = useAction();

  const upcoming = React.useMemo(() => new Set(upcomingIds), [upcomingIds]);
  const memberName = React.useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.name])), [members]);
  const sources = React.useMemo(() => [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "fr")), [rows]);
  const stagePos = React.useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.position])), [stages]);
  const dayOf = React.useMemo(() => { const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }); return (iso: string) => fmt.format(new Date(iso)); }, [timezone]);

  const filtered = React.useMemo(() => {
    const ok = matcher(f, { me, stage: view === "liste", today, dayOf, text: (r) => [nameOf(r), r.title, r.contact?.email ?? r.email, r.contact?.phone ?? r.phone, r.contact?.company ?? r.marque, r.source, ...(r.contact?.tags ?? [])] });
    return rows.filter(ok).sort(comparator(prefs.sort, { stagePos, memberName }));
  }, [rows, f, me, view, today, dayOf, prefs.sort, stagePos, memberName]);

  const nFilters = activeFilters(f, { stage: view === "liste" });
  const nFiltersMobile = activeFilters(f, { stage: view === "liste", withMine: true });
  const clear = () => setF((v) => ({ ...NO_FILTERS, q: v.q, mine: v.mine }));
  const setSort = (sort: SortState) => savePrefs({ ...prefs, sort });
  const resetKey = JSON.stringify([f, prefs.sort]);

  const lead = (p: ProspectRow) => refOf(p);
  // Supprimer est réservé aux membres de l'agence (ceux qui attribuent) : un commercial passe un prospect en « Perdu ».
  const actions: CardActions = {
    email: (p) => setEmailFor(lead(p)), task: (p) => setTaskFor(lead(p)),
    assign: canAssign ? (p) => setAssignFor(lead(p)) : null, remove: canAssign ? (ps) => setRemoving(ps) : null,
  };
  const confirmRemove = () => { if (removing) void execRemove(() => deleteProspectsAction(removing.map((l) => l.id)), { success: removing.length > 1 ? `${removing.length} prospects supprimés.` : "Prospect supprimé.", onSuccess: () => setRemoving(null) }); };
  const onMoved = React.useCallback(() => router.refresh(), [router]);

  const countFor = (stageId: string) => filtered.filter((r) => r.stage_id === stageId).length;
  // État vide honnête : rien du tout (pas encore de prospect) n'est pas la même chose que « rien avec ces filtres ».
  const emptyText = rows.length ? "Aucun prospect ne correspond à ces filtres." : canAssign ? "Aucun prospect pour l'instant. Les leads du site arrivent ici tout seuls ; tu peux aussi en ajouter un." : "Aucun prospect ne t'est attribué pour l'instant.";
  const jumpTo = (stageId: string) => {
    setSheet(null);
    if (view !== "kanban") setView("kanban");
    window.setTimeout(() => document.getElementById(columnId(stageId))?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" }), 220);
  };
  const pill = (on: boolean) => cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition [&_svg]:size-4",
    on ? "border-accent bg-accent-soft text-accent-2" : "border-mk-input bg-surface text-mk-strong hover:bg-bg");
  const viewBtn = (v: CrmView) => cn("inline-flex h-full w-9 items-center justify-center rounded-[6px] transition [&_svg]:size-[18px]", view === v ? "bg-accent-soft text-accent-2" : "text-mk-icon hover:bg-bg hover:text-mk-strong");

  return (
    <div className="space-y-3 lg:space-y-0">
      {/* ─── Ordinateur : barre d'outils façon « Opportunités » ─── */}
      <div className="hidden lg:block">
        <div className="flex items-center gap-3">
          <Dropdown>
            <DropdownTrigger asChild>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-mk-input bg-surface px-3.5 text-[14px] font-semibold text-mk-strong shadow-soft transition hover:bg-bg">{PIPELINE}<ChevronDown className="size-4 text-mk-icon" /></button>
            </DropdownTrigger>
            <DropdownContent align="start" className="w-64">
              <DropdownLabel>Pipelines</DropdownLabel>
              <DropdownCheckItem checked onSelect={(e) => e.preventDefault()}>{PIPELINE}</DropdownCheckItem>
              {canManage ? <><DropdownSeparator /><DropdownItem asChild><Link href="/marketing/reglages"><Settings2 />Gérer les étapes</Link></DropdownItem></> : null}
            </DropdownContent>
          </Dropdown>
          <span className="inline-flex h-7 items-center rounded-full bg-mk-chip px-3 text-[13px] font-medium text-mk-text tabular" aria-live="polite">{plural(filtered.length, "prospect")}</span>
          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label="Affichage" className="inline-flex h-10 items-center gap-0.5 rounded-[8px] border border-mk-input bg-surface p-[3px]">
              <Tooltip label="Vue kanban"><button type="button" aria-pressed={view === "kanban"} aria-label="Vue kanban" onClick={() => setView("kanban")} className={viewBtn("kanban")}><KanbanSquare strokeWidth={1.8} /></button></Tooltip>
              <Tooltip label="Vue liste"><button type="button" aria-pressed={view === "liste"} aria-label="Vue liste" onClick={() => setView("liste")} className={viewBtn("liste")}><List strokeWidth={1.8} /></button></Tooltip>
            </div>
            {canImport ? <Link href="/marketing/reglages/import" className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-mk-input bg-surface px-3.5 text-[14px] font-medium text-mk-strong shadow-soft transition hover:bg-bg"><Download className="size-4 text-mk-icon" />Importer</Link> : null}
            <Link href="/marketing/crm/nouveau" className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110"><Plus className="size-4" strokeWidth={2.2} />Ajouter un prospect</Link>
            <Dropdown>
              <DropdownTrigger asChild><button type="button" aria-label="Plus d'actions" className="inline-flex size-10 items-center justify-center rounded-[8px] border border-mk-input bg-surface text-mk-icon shadow-soft transition hover:bg-bg hover:text-mk-strong"><MoreVertical className="size-[18px]" /></button></DropdownTrigger>
              <DropdownContent className="w-60">
                {canExport ? <DropdownItem asChild><a href="/api/marketing/export?quoi=prospects"><FileDown />Exporter en CSV</a></DropdownItem> : null}
                <DropdownItem onSelect={() => setDrawer("champs")}><SlidersHorizontal />Personnaliser les cartes</DropdownItem>
                <DropdownItem disabled={!prefs.collapsed.length} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45" onSelect={() => savePrefs({ ...prefs, collapsed: [] })}><ChevronsLeftRight />Déplier toutes les colonnes</DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </div>

        <div role="tablist" aria-label="Prospects" className="mt-3 flex items-center gap-6 border-b border-mk-line">
          {([[false, "Prospects actifs"], [true, "Mes prospects"]] as const).map(([mine, label]) => (
            <button key={label} type="button" role="tab" aria-selected={f.mine === mine} aria-controls="prospects-vue" onClick={() => set({ mine })}
              className={cn("-mb-px h-11 border-b-2 text-[14px] font-medium transition", f.mine === mine ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong")}>{label}</button>
          ))}
        </div>

        <div className="my-3 flex items-center gap-2">
          <button type="button" onClick={() => setDrawer("filtres")} className={pill(nFilters > 0)}><ListFilter />Filtres avancés{nFilters ? ` (${nFilters})` : ""}</button>
          <Dropdown>
            <DropdownTrigger asChild><button type="button" className={pill(false)}><ArrowDownUp />Trier (1)</button></DropdownTrigger>
            <DropdownContent align="start" className="w-64">
              <DropdownLabel>Trier par</DropdownLabel>
              {SORT_PRESETS.map((s) => <DropdownCheckItem key={s.id} checked={samePreset(prefs.sort, s.sort)} onCheckedChange={() => setSort(s.sort)}>{s.label}</DropdownCheckItem>)}
              {!SORT_PRESETS.some((s) => samePreset(prefs.sort, s.sort)) ? <DropdownCheckItem checked onSelect={(e) => e.preventDefault()}>{SORT_SHORT[prefs.sort.key]} ({prefs.sort.dir === 1 ? "croissant" : "décroissant"})</DropdownCheckItem> : null}
            </DropdownContent>
          </Dropdown>
          <label className="relative ml-1 block w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden />
            <span className="sr-only">Rechercher des prospects</span>
            <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Rechercher des prospects"
              className="h-9 w-full rounded-[8px] border border-mk-input bg-surface pl-9 pr-3 text-[14px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
          {nFilters || f.q ? <button type="button" onClick={() => setF((v) => ({ ...NO_FILTERS, mine: v.mine }))} className="inline-flex h-9 items-center gap-1 rounded-[8px] px-2.5 text-[14px] font-medium text-mk-sub transition hover:text-mk-strong"><X className="size-4" />Effacer</button> : null}
          <button type="button" onClick={() => setDrawer("champs")} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[14px] font-medium text-accent-2 transition hover:bg-accent-soft"><Settings2 className="size-4" />Gérer les champs</button>
        </div>
      </div>

      {/* ─── Téléphone : recherche et pastilles ─── */}
      <div className="space-y-3 lg:hidden">
        <MkSearchField icon={Search} value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Rechercher des prospects" aria-label="Rechercher des prospects" />
        <div role="group" aria-label="Pipeline, filtres et tri" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setSheet("pipeline")} className={pill(false)}>{PIPELINE}<ChevronDown /></button>
          <button type="button" onClick={() => setSheet("filtres")} className={pill(nFiltersMobile > 0)}>Filtres{nFiltersMobile ? ` (${nFiltersMobile})` : ""}<ChevronDown /></button>
          <button type="button" onClick={() => setSheet("tri")} className={pill(false)}><ArrowDownUp />{SORT_SHORT[prefs.sort.key]}</button>
        </div>
      </div>

      {/* ─── Le pipeline ─── */}
      <div id="prospects-vue">
        {view === "kanban" && !rows.length ? <MkEmpty className="mb-3">{emptyText}</MkEmpty> : null}
        {view === "kanban" ? (
          <>
            <div className="hidden lg:block lg:h-[calc(100dvh-292px)] lg:min-h-[440px]"><Board rows={filtered} stages={stages} upcoming={upcoming} memberName={memberName} prefs={prefs} savePrefs={savePrefs} canManage={canManage} actions={actions} today={today} onMoved={onMoved} /></div>
            <div className="lg:hidden"><MobileBoard rows={filtered} stages={stages} upcoming={upcoming} memberName={memberName} actions={actions} onMoved={onMoved} /></div>
          </>
        ) : (
          <>
            <div className="hidden lg:block"><TableView rows={filtered} stages={stages} members={members} memberName={memberName} prefs={prefs} onSort={setSort} upcoming={upcoming} today={today} timezone={timezone} canAssign={canAssign} actions={actions} resetKey={resetKey} emptyText={emptyText} /></div>
            <div className="lg:hidden"><MobileList key={resetKey} rows={filtered} stages={stages} emptyText={emptyText} /></div>
          </>
        )}
      </div>

      {/* ─── Feuilles du bas (téléphone) ─── */}
      <Sheet open={sheet === "pipeline"} onOpenChange={(o) => setSheet(o ? "pipeline" : null)} title="Pipeline">
        <div role="radiogroup" aria-label="Pipelines"><SheetOption selected onSelect={() => setSheet(null)} leading={<KanbanSquare className="size-5 text-mk-icon" strokeWidth={1.8} />} label={PIPELINE} /></div>
        <p className="px-3 pb-1 pt-3 text-[14px] font-semibold text-mk-sub">Étapes</p>
        {stages.map((s) => <SheetOption key={s.id} role="button" onSelect={() => jumpTo(s.id)} leading={<StageDot stage={s} className="size-3" />} label={s.name} meta={countFor(s.id)} />)}
        <div className="px-3 pb-2 pt-4"><MkSegmented label="Affichage" value={view} onChange={(v) => { setView(v); setSheet(null); }} options={[{ value: "kanban", label: "Colonnes" }, { value: "liste", label: "Liste" }]} /></div>
        {canManage ? <Link href="/marketing/reglages" onClick={() => setSheet(null)} className="mx-3 mt-1 flex h-12 items-center justify-center gap-2 rounded-[10px] border border-mk-input text-[15px] font-medium text-mk-strong"><Settings2 className="size-5 text-mk-icon" />Gérer les étapes</Link> : null}
      </Sheet>
      <Sheet open={sheet === "filtres"} onOpenChange={(o) => setSheet(o ? "filtres" : null)} title="Filtres"
        footer={<><button type="button" onClick={() => setF((v) => ({ ...NO_FILTERS, q: v.q }))} className="h-12 flex-1 rounded-[10px] border border-mk-input text-[16px] font-semibold text-mk-strong">Effacer</button><button type="button" onClick={() => setSheet(null)} className="h-12 flex-[1.4] rounded-[10px] bg-accent text-[16px] font-semibold text-accent-fg">Voir {plural(filtered.length, "prospect")}</button></>}>
        <div className="px-3 pb-2"><FilterFields f={f} set={set} members={members} sources={sources} stages={stages} showStage={view === "liste"} showMine big /></div>
      </Sheet>
      <Sheet open={sheet === "tri"} onOpenChange={(o) => setSheet(o ? "tri" : null)} title="Trier par">
        <div role="radiogroup" aria-label="Trier par">
          {SORT_PRESETS.map((s) => <SheetOption key={s.id} selected={samePreset(prefs.sort, s.sort)} onSelect={() => { setSort(s.sort); setSheet(null); }} label={s.label} />)}
        </div>
      </Sheet>

      {/* ─── Volets de droite (ordinateur) ─── */}
      <Dialog open={drawer === "filtres"} onOpenChange={(o) => setDrawer(o ? "filtres" : null)}>
        <DialogContent side="right" className="max-w-[420px]" title="Filtres avancés" description="Les prospects affichés suivent ces filtres tout de suite.">
          <FilterFields f={f} set={set} members={members} sources={sources} stages={stages} showStage={view === "liste"} showMine={false} />
          <div className="mt-6 flex items-center gap-2 border-t border-mk-line pt-4">
            <Button variant="ghost" onClick={clear} disabled={!nFilters}>Effacer les filtres</Button>
            <Button className="ml-auto rounded-[8px]" onClick={() => setDrawer(null)}>Voir {plural(filtered.length, "prospect")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={drawer === "champs"} onOpenChange={(o) => setDrawer(o ? "champs" : null)}>
        <DialogContent side="right" className="max-w-[420px]" title="Gérer les champs" description="Ce que tu vois sur les cartes et dans la liste. Gardé dans ce navigateur.">
          <FieldToggles title="Sur les cartes (vue kanban)" labels={CARD_FIELDS} values={prefs.fields} onChange={(k, v) => savePrefs({ ...prefs, fields: { ...prefs.fields, [k as CardField]: v } })} />
          <FieldToggles title="Colonnes de la liste" labels={TABLE_COLUMNS} values={prefs.columns} onChange={(k, v) => savePrefs({ ...prefs, columns: { ...prefs.columns, [k as TableColumn]: v } })} />
          <div className="mt-6 border-t border-mk-line pt-4"><Button variant="ghost" onClick={() => savePrefs({ ...DEFAULT_PREFS, sort: prefs.sort, collapsed: prefs.collapsed })}>Rétablir l&apos;affichage par défaut</Button></div>
        </DialogContent>
      </Dialog>

      <EmailDialog lead={emailFor} mail={mail} onClose={() => setEmailFor(null)} />
      <AssignDialog lead={assignFor} members={members} onClose={() => setAssignFor(null)} />
      <TaskDialog lead={taskFor} members={members} canAssign={canAssign} me={me} onClose={() => setTaskFor(null)} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} loading={removePending} danger
        title={removing && removing.length > 1 ? `Supprimer ${removing.length} prospects ?` : `Supprimer ${removing?.[0] ? nameOf(removing[0]) : "ce prospect"} ?`}
        description="Le prospect disparaît avec son historique, ses tâches et ses rendez-vous. Sa fiche contact aussi, si elle n'a pas d'autre affaire. C'est définitif."
        confirmLabel="Supprimer" onConfirm={confirmRemove} />
    </div>
  );
}

function FieldToggles({ title, labels, values, onChange }: { title: string; labels: Record<string, string>; values: Record<string, boolean>; onChange: (k: string, v: boolean) => void }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 text-[13px] font-semibold text-mk-sub">{title}</h3>
      <ul className="divide-y divide-mk-line">
        {Object.entries(labels).map(([k, label]) => (
          <li key={k}><label className="flex min-h-11 items-center justify-between gap-4 text-[14px] font-medium text-mk-text"><span>{label}</span><Switch checked={!!values[k]} onCheckedChange={(v) => onChange(k, v)} /></label></li>
        ))}
      </ul>
    </section>
  );
}

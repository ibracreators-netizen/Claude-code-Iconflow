"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import * as Sheet from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, EllipsisVertical, ListFilter, LoaderCircle, Mail, Phone, Search, SquareCheck, Tag, Trash2, Upload, UserPlus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownCheckItem, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { MkSearchField } from "@/components/marketing/ui";
import { useAction } from "@/lib/hooks/use-action";
import { contactFacetsAction, deleteContactsAction, moreContactsAction, tagContactsAction } from "@/lib/actions/marketing-contacts";
import type { ContactFacets, ContactListRow, ContactQuery, ContactSort } from "@/lib/marketing/contacts-server";
import { cn } from "@/lib/utils";
import { agoLabel, ContactAvatar, contactName, createdLabel, TagPill } from "./contact-ui";

/* ─────────────────────────── Adresse de la page (filtres, tri, pagination) ─────────────────────────── */

const defaultDir = (s: ContactSort) => (s === "nom" ? "asc" : "desc");
export function contactSearch(q: ContactQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.tag) p.set("etiquette", q.tag);
  if (q.source) p.set("source", q.source);
  if (q.prospect) p.set("prospect", q.prospect);
  if (q.from) p.set("du", q.from);
  if (q.to) p.set("au", q.to);
  if (q.sort !== "cree") p.set("tri", q.sort);
  if (q.dir !== defaultDir(q.sort)) p.set("sens", q.dir);
  if (q.page > 1) p.set("page", String(q.page));
  if (q.size !== 20) p.set("taille", String(q.size));
  return p.toString();
}
const filterCount = (q: ContactQuery) => [q.tag, q.source, q.prospect, q.from || q.to].filter(Boolean).length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/* ─────────────────────────── Colonnes affichées (mémorisées dans ce navigateur) ─────────────────────────── */

const COLUMNS = [
  { key: "nom", label: "Nom" }, { key: "telephone", label: "Téléphone" }, { key: "email", label: "E-mail" }, { key: "entreprise", label: "Nom de l'entreprise" },
  { key: "cree", label: "Créé" }, { key: "activite", label: "Dernière activité" }, { key: "etiquettes", label: "Étiquettes" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
/** Largeurs fixes (px) ; le nom et l'e-mail se partagent la place qui reste. */
const COL_WIDTH: Partial<Record<ColumnKey, number>> = { telephone: 168, entreprise: 114, cree: 144, activite: 142, etiquettes: 136 };
const SORTABLE: Partial<Record<ColumnKey, ContactSort>> = { nom: "nom", cree: "cree", activite: "activite" };
const COLS_KEY = "iconflow-contacts-colonnes", COLS_EVENT = "iconflow-contacts-colonnes-change";
const readCols = () => { try { return window.localStorage.getItem(COLS_KEY) ?? ""; } catch { return ""; } };
const subscribeCols = (cb: () => void) => { window.addEventListener(COLS_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(COLS_EVENT, cb); window.removeEventListener("storage", cb); }; };
function useHiddenColumns(): [Set<ColumnKey>, (key: ColumnKey, hidden: boolean) => void] {
  const raw = React.useSyncExternalStore(subscribeCols, readCols, () => "");
  const hidden = React.useMemo(() => { try { const v = JSON.parse(raw); return new Set<ColumnKey>(Array.isArray(v) ? v.filter((k) => k !== "nom") : []); } catch { return new Set<ColumnKey>(); } }, [raw]);
  const set = React.useCallback((key: ColumnKey, h: boolean) => {
    const next = new Set(hidden); if (h) next.add(key); else next.delete(key);
    try { window.localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* stockage indisponible : réglage pour cette visite seulement */ }
    window.dispatchEvent(new Event(COLS_EVENT));
  }, [hidden]);
  return [hidden, set];
}

/* ─────────────────────────── Vue ─────────────────────────── */

export interface ContactsViewProps { rows: ContactListRow[]; total: number; query: ContactQuery; timezone: string; now: string; admin: boolean }

export function ContactsView(props: ContactsViewProps) {
  const { query } = props;
  const router = useRouter(), pathname = usePathname();
  const [pending, startTransition] = React.useTransition();
  const go = React.useCallback((patch: Partial<ContactQuery>, opts: { replace?: boolean } = {}) => {
    const s = contactSearch({ ...query, page: 1, ...patch });
    const url = s ? `${pathname}?${s}` : pathname;
    startTransition(() => { if (opts.replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: !!patch.page }); });
  }, [query, pathname, router]);

  // Recherche : envoyée au serveur après une courte pause dans la frappe.
  const [text, setText] = React.useState(query.q);
  const [sent, setSent] = React.useState({ seen: query.q, pushed: query.q });
  if (query.q !== sent.seen) { setSent({ seen: query.q, pushed: sent.pushed }); if (query.q !== sent.pushed) setText(query.q); }
  React.useEffect(() => {
    const v = text.replace(/\s+/g, " ").trim();
    if (v === query.q) return;
    const t = window.setTimeout(() => { setSent((s) => ({ ...s, pushed: v })); go({ q: v }, { replace: true }); }, 350);
    return () => window.clearTimeout(t);
  }, [text, query.q, go]);

  // Choix des filtres : lus à la demande (ouverture d'un filtre), puis gardés.
  const [facets, setFacets] = React.useState<ContactFacets | null>(null);
  const [facetsState, setFacetsState] = React.useState<"idle" | "loading" | "ready">("idle");
  const loadFacets = React.useCallback(() => {
    if (facetsState !== "idle") return;
    setFacetsState("loading");
    contactFacetsAction().then((r) => { if (r.ok) { setFacets(r.data); setFacetsState("ready"); } else { setFacetsState("idle"); toast.error(r.error); } });
  }, [facetsState]);
  const staleFacets = React.useCallback(() => { setFacets(null); setFacetsState("idle"); }, []);

  const shared = { ...props, go, pending, text, setText, facets, loadFacets, staleFacets };
  return (
    <>
      <DesktopContacts {...shared} />
      <PhoneContacts {...shared} />
    </>
  );
}
type Shared = ContactsViewProps & {
  go: (patch: Partial<ContactQuery>, opts?: { replace?: boolean }) => void; pending: boolean; text: string; setText: (v: string) => void;
  facets: ContactFacets | null; loadFacets: () => void; staleFacets: () => void;
};

/** Sélection de lignes, remise à zéro quand la liste affichée change (recherche, filtre, page). */
function useSelection(scope: string) {
  const [state, setState] = React.useState<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });
  const ids = state.scope === scope ? state.ids : new Set<string>();
  const set = (next: Set<string>) => setState({ scope, ids: next });
  return { ids, set, toggle: (id: string) => { const n = new Set(ids); if (n.has(id)) n.delete(id); else n.add(id); set(n); }, clear: () => set(new Set()) };
}

/** Actions groupées : ajouter une étiquette, supprimer (administrateur, contacts sans prospect). */
function useBulk({ admin, facets, loadFacets, staleFacets }: Pick<Shared, "admin" | "facets" | "loadFacets" | "staleFacets">, onDone: (removed?: string[]) => void) {
  const { exec, pending } = useAction();
  const [tagFor, setTagFor] = React.useState<string[] | null>(null);
  const [tag, setTag] = React.useState("");
  const [removeFor, setRemoveFor] = React.useState<string[] | null>(null);
  const listId = React.useId(), formId = React.useId(), inputId = React.useId();
  const askTag = (ids: string[]) => { if (!ids.length) return; loadFacets(); setTag(""); setTagFor(ids); };
  const askRemove = (rows: ContactListRow[]) => {
    if (!rows.length) return;
    const linked = rows.filter((r) => r.deals > 0).length;
    if (linked) {
      toast.error(rows.length === 1 ? "Ce contact a un prospect : supprime d'abord le prospect (page Prospects), puis le contact."
        : `${plural(linked, "contact")} sur ${rows.length} ${linked > 1 ? "ont" : "a"} un prospect : retire-les de la sélection, ou supprime d'abord leurs prospects.`);
      return;
    }
    setRemoveFor(rows.map((r) => r.id));
  };
  const dialogs = (
    <>
      <Dialog open={!!tagFor} onOpenChange={(o) => { if (!o) setTagFor(null); }}>
        <DialogContent title="Ajouter une étiquette" description={tagFor ? `Elle sera ajoutée à ${plural(tagFor.length, "contact")} sélectionné${tagFor.length > 1 ? "s" : ""}.` : undefined}>
          <form id={formId} onSubmit={(e) => {
            e.preventDefault(); if (!tagFor || !tag.trim()) return;
            exec(() => tagContactsAction(tagFor, tag), { onSuccess: (r) => {
              const many = r.count > 1;
              toast.success(r.done ? `${many ? "Étiquettes" : "Étiquette"} « ${r.tag} » ${many ? "ajoutées" : "ajoutée"} à ${plural(r.done, "contact")}.` : `Ces contacts avaient déjà ${many ? "les étiquettes" : "l'étiquette"} « ${r.tag} ».`);
              setTagFor(null); staleFacets(); onDone();
            } });
          }}>
            <label htmlFor={inputId} className="mb-1.5 block text-[14px] font-medium text-mk-text">Étiquette</label>
            <input id={inputId} autoFocus value={tag} onChange={(e) => setTag(e.target.value)} maxLength={120} list={listId} placeholder="Ex. : webinar, chaud"
              className="h-11 w-full rounded-lg border border-mk-input bg-surface px-3 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 lg:h-10 lg:text-[14px]" />
            <datalist id={listId}>{(facets?.tags ?? []).map((t) => <option key={t.name} value={t.name} />)}</datalist>
          </form>
          <DialogFooter><Button variant="ghost" onClick={() => setTagFor(null)}>Annuler</Button><Button type="submit" form={formId} loading={pending} disabled={!tag.trim()}><Tag />Ajouter</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {admin ? (
        <ConfirmDialog open={!!removeFor} onOpenChange={(o) => { if (!o) setRemoveFor(null); }} danger loading={pending} confirmLabel="Supprimer"
          title={removeFor && removeFor.length > 1 ? `Supprimer ${removeFor.length} contacts ?` : "Supprimer ce contact ?"}
          description="C'est définitif : la fiche disparaît de la liste. Seuls les contacts sans prospect peuvent être supprimés."
          onConfirm={() => { const ids = removeFor ?? []; return exec(() => deleteContactsAction(ids), { onSuccess: (r) => { toast.success(r.done > 1 ? `${r.done} contacts supprimés.` : "Contact supprimé."); setRemoveFor(null); staleFacets(); onDone(ids); } }).then(() => undefined); }} />
      ) : null}
    </>
  );
  return { askTag, askRemove, dialogs };
}

/* ─────────────────────────── Ordinateur : tableau LeadConnector ─────────────────────────── */

const PILL = "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-mk-input bg-surface px-3.5 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip data-[state=open]:bg-mk-chip [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-mk-icon";
const ICON_BTN = "inline-flex size-9 items-center justify-center rounded-lg border border-mk-input bg-surface text-mk-icon transition hover:bg-mk-chip hover:text-mk-strong data-[state=open]:bg-mk-chip [&_svg]:size-[18px]";
const SORTS: Array<{ sort: ContactSort; dir: "asc" | "desc"; label: string }> = [
  { sort: "cree", dir: "desc", label: "Date de création : récents d'abord" }, { sort: "cree", dir: "asc", label: "Date de création : anciens d'abord" },
  { sort: "nom", dir: "asc", label: "Nom : de A à Z" }, { sort: "nom", dir: "desc", label: "Nom : de Z à A" },
  { sort: "activite", dir: "desc", label: "Dernière activité : récente d'abord" }, { sort: "activite", dir: "asc", label: "Dernière activité : ancienne d'abord" },
];

function DesktopContacts(s: Shared) {
  const { rows, total, query, admin, go, pending } = s;
  const [hidden, setHidden] = useHiddenColumns();
  const scope = contactSearch(query);
  const sel = useSelection(scope);
  const bulk = useBulk(s, () => sel.clear());
  const show = (k: ColumnKey) => !hidden.has(k);
  const pages = Math.max(1, Math.ceil(total / query.size));
  const selectedRows = rows.filter((r) => sel.ids.has(r.id));
  const allChecked = rows.length > 0 && selectedRows.length === rows.length;
  const nFilters = filterCount(query);

  const visible = COLUMNS.filter((c) => show(c.key));
  const minWidth = 44 + visible.reduce((n, c) => n + (COL_WIDTH[c.key] ?? 180), 0);
  const cell = (k: ColumnKey, c: ContactListRow, name: string): React.ReactNode => {
    switch (k) {
      case "nom": return (
        <Link href={`/marketing/contacts/${c.id}`} className="group/name flex min-w-0 items-center gap-3">
          <ContactAvatar contact={c} seed={c.id} size={32} />
          <span title={name} className="truncate font-semibold text-mk-strong transition group-hover/name:text-accent-2">{name}</span>
        </Link>
      );
      case "telephone": return c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex max-w-full items-center gap-2 whitespace-nowrap hover:text-accent-2"><Phone className="size-4 shrink-0 text-mk-sub" strokeWidth={1.8} /><span className="truncate">{c.phone}</span></a> : null;
      case "email": return c.email ? <a href={`mailto:${c.email}`} title={c.email} className="flex min-w-0 items-center gap-2 hover:text-accent-2"><Mail className="size-4 shrink-0 text-mk-sub" strokeWidth={1.8} /><span className="truncate">{c.email}</span></a> : null;
      case "entreprise": return c.company ? <span title={c.company} className="block truncate">{c.company}</span> : null;
      case "cree": return <span className="whitespace-nowrap">{createdLabel(c.created_at, s.timezone)}</span>;
      case "activite": return <span className="whitespace-nowrap">{agoLabel(c.last_activity_at, s.now)}</span>;
      case "etiquettes": {
        // Autant d'étiquettes que la colonne en contient (deux au plus), puis « +N ».
        let room = (COL_WIDTH.etiquettes ?? 140) - 26, shown = 0;
        for (const t of c.tags.slice(0, 2)) { const w = Math.min(140, t.length * 6.6 + 20) + 6, rest = c.tags.length - shown - 1; if (w + (rest ? 34 : 0) > room && shown) break; room -= w; shown++; }
        return <span className="flex items-center gap-1.5 overflow-hidden" title={c.tags.join(", ") || undefined}>{c.tags.slice(0, shown).map((t) => <TagPill key={t}>{t}</TagPill>)}{c.tags.length > shown ? <TagPill className="shrink-0 text-mk-sub">+{c.tags.length - shown}</TagPill> : null}</span>;
      }
    }
  };

  return (
    <div className="hidden lg:block">
      {/* En-tête : titre, onglet « Tous », actions */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[24px] font-semibold leading-8 text-mk-strong">Contacts</h1>
        <div className="flex items-center gap-2">
          <Tooltip label="Ajouter un contact"><Link href="/marketing/contacts/nouveau" aria-label="Ajouter un contact" className={ICON_BTN}><UserPlus /></Link></Tooltip>
          {admin ? <Link href="/marketing/reglages/import" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110 [&_svg]:size-4"><Upload />Importer</Link> : null}
          {admin ? (
            <Dropdown>
              <DropdownTrigger asChild><button type="button" aria-label="Plus d'actions" className={ICON_BTN}><EllipsisVertical /></button></DropdownTrigger>
              <DropdownContent className="min-w-[200px]"><DropdownItem asChild><a href="/api/marketing/export?quoi=contacts"><Download />Exporter en CSV</a></DropdownItem></DropdownContent>
            </Dropdown>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex gap-6 border-b border-mk-line">
        <span aria-current="page" className="-mb-px border-b-2 border-accent pb-2.5 pt-1 text-[14px] font-medium text-accent-2">Tous</span>
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 py-4">
        <FiltersPopover {...s} count={nFilters} />
        <Dropdown>
          <DropdownTrigger asChild><button type="button" className={PILL}><ArrowUpDown />Trier</button></DropdownTrigger>
          <DropdownContent align="start" className="min-w-[280px]">
            <DropdownLabel>Trier les contacts</DropdownLabel>
            {SORTS.map((o) => {
              const on = query.sort === o.sort && query.dir === o.dir;
              return <DropdownItem key={o.sort + o.dir} onSelect={() => go({ sort: o.sort, dir: o.dir })} className={cn("pl-2", on && "font-medium text-accent-2")}><Check className={cn(on ? "!text-accent-2" : "opacity-0")} />{o.label}</DropdownItem>;
            })}
          </DropdownContent>
        </Dropdown>
        <span className="inline-flex h-7 items-center rounded-full bg-mk-chip px-3 text-[13px] font-medium text-mk-text tabular">{plural(total, "Contact")}</span>
        {nFilters || query.q ? <button type="button" onClick={() => { s.setText(""); go({ q: "", tag: "", source: "", prospect: "", from: "", to: "" }); }} className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-accent-2 hover:underline"><X className="size-3.5" />Tout effacer</button> : null}
        <div className="ml-auto flex items-center gap-2">
          <Dropdown>
            <DropdownTrigger asChild><button type="button" className={PILL}><Columns3 />Colonnes ({COLUMNS.length - hidden.size})</button></DropdownTrigger>
            <DropdownContent className="min-w-[220px]">
              <DropdownLabel>Colonnes affichées</DropdownLabel>
              {COLUMNS.map((c) => <DropdownCheckItem key={c.key} checked={show(c.key)} disabled={c.key === "nom"} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setHidden(c.key, !v)} className="data-[disabled]:cursor-default data-[disabled]:opacity-55">{c.label}</DropdownCheckItem>)}
            </DropdownContent>
          </Dropdown>
          <label className="relative block w-[280px]">
            <span className="sr-only">Rechercher des contacts</span>
            {pending && s.text.trim() !== query.q ? <LoaderCircle className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-mk-sub" /> : <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mk-sub" />}
            <input type="search" value={s.text} onChange={(e) => s.setText(e.target.value)} placeholder="Rechercher des contacts"
              className="h-9 w-full rounded-lg border border-mk-input bg-surface pl-9 pr-3 text-[14px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        </div>
      </div>

      {/* Actions groupées */}
      {selectedRows.length ? (
        <div className="mb-3 flex h-12 items-center gap-1 rounded-xl border border-accent/25 bg-accent-soft px-3">
          <span className="pr-2 text-[14px] font-semibold text-accent-2">{plural(selectedRows.length, "contact sélectionné", "contacts sélectionnés")}</span>
          <span className="mx-1 h-5 w-px bg-accent/20" aria-hidden />
          <button type="button" onClick={() => bulk.askTag(selectedRows.map((r) => r.id))} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-mk-text transition hover:bg-surface [&_svg]:size-4"><Tag />Ajouter une étiquette</button>
          {admin ? <button type="button" onClick={() => bulk.askRemove(selectedRows)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-mk-danger transition hover:bg-surface [&_svg]:size-4"><Trash2 />Supprimer</button> : null}
          <button type="button" onClick={sel.clear} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-mk-sub transition hover:bg-surface hover:text-mk-strong [&_svg]:size-4"><X />Désélectionner</button>
        </div>
      ) : null}

      {/* Tableau */}
      <div className={cn("overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft transition-opacity", pending && "opacity-60")}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-[14px]" style={{ minWidth }}>
            <colgroup><col style={{ width: 44 }} />{visible.map((c) => <col key={c.key} style={COL_WIDTH[c.key] ? { width: COL_WIDTH[c.key] } : undefined} />)}</colgroup>
            <thead className="bg-mk-agenda">
              <tr>
                <th scope="col" className="h-11 border-b border-mk-line pl-4 pr-0">
                  <Checkbox label="Tout sélectionner sur cette page" checked={allChecked} mixed={!allChecked && selectedRows.length > 0} disabled={!rows.length} onChange={() => sel.set(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
                {visible.map((col) => {
                  const sort = SORTABLE[col.key], active = !!sort && query.sort === sort;
                  return (
                    <th key={col.key} scope="col" aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined} className="h-11 truncate border-b border-mk-line px-2.5 text-left text-[13px] font-medium text-mk-sub last:pr-4">
                      {sort ? (
                        <button type="button" onClick={() => go({ sort, dir: active ? (query.dir === "asc" ? "desc" : "asc") : defaultDir(sort) })} className="group/th inline-flex items-center gap-1.5 transition hover:text-mk-strong">
                          {col.label}
                          {active ? (query.dir === "asc" ? <ArrowUp className="size-3.5 shrink-0 text-mk-strong" /> : <ArrowDown className="size-3.5 shrink-0 text-mk-strong" />) : <ArrowUpDown className="hidden size-3.5 shrink-0 opacity-60 group-hover/th:inline" />}
                        </button>
                      ) : col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const on = sel.ids.has(c.id), name = contactName(c);
                return (
                  <tr key={c.id} className={cn("h-[60px] border-b border-mk-line transition-colors last:border-b-0", on ? "bg-accent-soft/60" : "hover:bg-mk-agenda")}>
                    <td className="pl-4 pr-0"><Checkbox label={`Sélectionner ${name}`} checked={on} onChange={() => sel.toggle(c.id)} /></td>
                    {visible.map((col) => <td key={col.key} className="overflow-hidden px-2.5 text-mk-text last:pr-4">{cell(col.key, c, name)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length ? <EmptyList query={query} total={total} onClear={() => { s.setText(""); go({ q: "", tag: "", source: "", prospect: "", from: "", to: "" }); }} onFirst={() => go({ page: 1 })} /> : null}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-4 border-t border-mk-line px-4 py-3">
          <span className="text-[14px] text-mk-sub">Page <b className="font-semibold text-mk-strong tabular">{query.page}</b> sur <b className="font-semibold text-mk-strong tabular">{pages}</b></span>
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Contacts par page</span>
              <select value={query.size} onChange={(e) => go({ size: Number(e.target.value) })} className="h-9 appearance-none rounded-lg border border-mk-input bg-surface pl-3 pr-8 text-[14px] font-medium text-mk-text outline-none transition focus:border-accent">
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-mk-icon" />
            </label>
            <button type="button" disabled={query.page <= 1} onClick={() => go({ page: query.page - 1 })} className="inline-flex h-9 items-center gap-1 rounded-lg border border-mk-input bg-surface px-3 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4"><ChevronLeft />Précédent</button>
            {pageList(query.page, pages).map((p, i) => p === 0
              ? <span key={`gap${i}`} className="px-1 text-mk-sub">…</span>
              : <button key={p} type="button" aria-current={p === query.page ? "page" : undefined} onClick={() => go({ page: p })}
                  className={cn("inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-[14px] font-medium tabular transition", p === query.page ? "bg-accent-soft text-accent-2" : "text-mk-text hover:bg-mk-chip")}>{p}</button>)}
            <button type="button" disabled={query.page >= pages} onClick={() => go({ page: query.page + 1 })} className="inline-flex h-9 items-center gap-1 rounded-lg border border-mk-input bg-surface px-3 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4">Suivant<ChevronRight /></button>
          </div>
        </div>
      </div>
      {bulk.dialogs}
    </div>
  );
}

/** Numéros de page affichés : tous s'il y en a peu, sinon le début, la fin et les voisins de la page courante (0 = « … »). */
function pageList(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: number[] = [];
  [...keep].sort((a, b) => a - b).forEach((p, i, arr) => { if (i && p - arr[i - 1] > 1) out.push(0); out.push(p); });
  return out;
}

function Checkbox({ checked, mixed, onChange, label, disabled }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} className="size-4 cursor-pointer rounded border-mk-input align-middle accent-[var(--color-accent)] disabled:cursor-default" />;
}

function EmptyList({ query, total, onClear, onFirst }: { query: ContactQuery; total: number; onClear: () => void; onFirst: () => void }) {
  const filtered = !!(query.q || filterCount(query));
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><UserPlus className="size-6" strokeWidth={1.7} /></span>
      {total > 0 ? (
        <><p className="mt-3 text-[16px] font-semibold text-mk-strong">Cette page est vide</p><button type="button" onClick={onFirst} className="mt-2 text-[14px] font-medium text-accent-2 hover:underline">Revenir à la première page</button></>
      ) : filtered ? (
        <><p className="mt-3 text-[16px] font-semibold text-mk-strong">Aucun contact ne correspond</p><p className="mt-1 text-[14px] text-mk-sub">Essaie une autre recherche ou retire un filtre.</p><button type="button" onClick={onClear} className="mt-3 text-[14px] font-medium text-accent-2 hover:underline">Tout effacer</button></>
      ) : (
        <><p className="mt-3 text-[16px] font-semibold text-mk-strong">Aucun contact pour l&apos;instant</p><p className="mt-1 max-w-sm text-[14px] text-mk-sub">Un contact est créé tout seul à l&apos;arrivée d&apos;un lead. Tu peux aussi en ajouter un à la main.</p>
          <Link href="/marketing/contacts/nouveau" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition hover:brightness-110 [&_svg]:size-4"><UserPlus />Ajouter un contact</Link></>
      )}
    </div>
  );
}

/** Filtres (ordinateur) : étiquette, source, avec ou sans prospect, créé entre deux dates. */
function FiltersPopover({ query, go, facets, loadFacets, count }: Shared & { count: number }) {
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState({ tag: query.tag, source: query.source, prospect: query.prospect, from: query.from, to: query.to });
  const field = "h-10 w-full rounded-lg border border-mk-input bg-surface px-3 text-[14px] text-mk-strong outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const loading = !facets;
  const options = (list: Array<{ name: string; count: number }> | undefined, current: string) => {
    const all = list ?? [];
    return [...(current && !all.some((o) => o.name === current) ? [{ name: current, count: -1 }] : []), ...all];
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) { loadFacets(); setD({ tag: query.tag, source: query.source, prospect: query.prospect, from: query.from, to: query.to }); } }}>
      <Popover.Trigger asChild>
        <button type="button" onPointerEnter={loadFacets} className={cn(PILL, count && "border-accent/50 text-accent-2 [&_svg]:text-accent-2")}><ListFilter />Filtres{count ? <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{count}</span> : null}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={8} className="z-50 w-[360px] rounded-xl border border-mk-line bg-surface p-4 shadow-pop animate-fade-in">
          <form onSubmit={(e) => { e.preventDefault(); setOpen(false); go({ tag: d.tag, source: d.source, prospect: d.prospect, from: d.from, to: d.to && d.from && d.to < d.from ? d.from : d.to }); }} className="space-y-4">
            <p className="text-[16px] font-semibold text-mk-strong">Filtres</p>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-mk-text">Étiquette</span>
              <span className="relative block">
                <select value={d.tag} onChange={(e) => setD({ ...d, tag: e.target.value })} className={cn(field, "appearance-none pr-9")}>
                  <option value="">Toutes les étiquettes</option>
                  {options(facets?.tags, d.tag).map((t) => <option key={t.name} value={t.name}>{t.name}{t.count >= 0 ? ` (${t.count})` : ""}</option>)}
                  {loading ? <option disabled>Chargement…</option> : null}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mk-icon" />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-mk-text">Source</span>
              <span className="relative block">
                <select value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} className={cn(field, "appearance-none pr-9")}>
                  <option value="">Toutes les sources</option>
                  {options(facets?.sources, d.source).map((t) => <option key={t.name} value={t.name}>{t.name}{t.count >= 0 ? ` (${t.count})` : ""}</option>)}
                  {loading ? <option disabled>Chargement…</option> : null}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mk-icon" />
              </span>
            </label>
            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-medium text-mk-text">Prospect</legend>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-mk-chip p-1">
                {([["", "Tous"], ["avec", "Avec"], ["sans", "Sans"]] as const).map(([v, l]) => (
                  <button key={v || "tous"} type="button" aria-pressed={d.prospect === v} onClick={() => setD({ ...d, prospect: v })}
                    className={cn("h-8 rounded-md text-[13px] font-medium transition", d.prospect === v ? "bg-surface text-mk-strong shadow-soft" : "text-mk-sub hover:text-mk-strong")}>{l}{v ? " prospect" : ""}</button>
                ))}
              </div>
            </fieldset>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-mk-text">Créé entre</span>
              <div className="flex items-center gap-2">
                <input type="date" aria-label="Créé à partir du" value={d.from} max={d.to || undefined} onChange={(e) => setD({ ...d, from: e.target.value })} className={field} />
                <span className="text-[13px] text-mk-sub">et</span>
                <input type="date" aria-label="Créé jusqu'au" value={d.to} min={d.from || undefined} onChange={(e) => setD({ ...d, to: e.target.value })} className={field} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-mk-line pt-3">
              <button type="button" onClick={() => setD({ tag: "", source: "", prospect: "", from: "", to: "" })} className="text-[14px] font-medium text-mk-sub hover:text-mk-strong">Effacer</button>
              <button type="submit" className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition hover:brightness-110">Appliquer</button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ─────────────────────────── Téléphone : liste LeadConnector ─────────────────────────── */

function PhoneContacts(s: Shared) {
  const { rows, total, query, admin, go, facets, loadFacets } = s;
  const scope = contactSearch(query);
  const offset = (query.page - 1) * query.size;
  // Lignes ajoutées par « Charger plus » : valables tant que la recherche et les filtres ne changent pas.
  const [extra, setExtra] = React.useState<{ scope: string; rows: ContactListRow[] }>({ scope, rows: [] });
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const sel = useSelection(scope);
  const bulk = useBulk(s, (removed) => { if (removed?.length) setGone((g) => new Set([...g, ...removed])); sel.clear(); setSelecting(false); });
  const appended = extra.scope === scope ? extra.rows : [];
  const seen = new Set<string>();
  const list = [...rows, ...appended].filter((r) => !gone.has(r.id) && !seen.has(r.id) && seen.add(r.id));
  // Fiches réellement affichées (sans celles supprimées ni les doublons) : après une suppression, la suite repart au bon rang.
  const loaded = list.length;
  const more = offset + loaded < total;
  const loadMore = () => {
    setLoading(true);
    moreContactsAction(scope, offset + loaded).then((r) => {
      setLoading(false);
      if (r.ok) setExtra({ scope, rows: [...appended, ...r.data.rows] }); else toast.error(r.error);
    });
  };
  const selected = list.filter((r) => sel.ids.has(r.id));
  const listLabel = query.tag ? query.tag : query.prospect === "avec" ? "Avec un prospect" : query.prospect === "sans" ? "Sans prospect" : "Tous les contacts";
  const pick = (patch: Partial<ContactQuery>) => { setSheet(false); go({ tag: "", prospect: "", ...patch }); };

  return (
    <div className="lg:hidden">
      {selecting ? (
        <div className="sticky top-16 z-20 -mx-4 flex h-[60px] items-center gap-1 bg-surface px-2.5">
          <button type="button" onClick={() => { setSelecting(false); sel.clear(); }} aria-label="Quitter la sélection" className="inline-flex size-11 items-center justify-center rounded-full text-mk-icon active:bg-mk-chip"><X className="size-6" strokeWidth={1.8} /></button>
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-mk-strong">{selected.length ? plural(selected.length, "sélectionné") : "Sélection"}</span>
          <button type="button" onClick={() => sel.set(selected.length === list.length ? new Set() : new Set(list.map((r) => r.id)))} className="h-10 rounded-full px-3 text-[15px] font-semibold text-accent-2 active:bg-mk-chip">{selected.length === list.length && list.length ? "Aucun" : "Tout"}</button>
          <button type="button" disabled={!selected.length} onClick={() => bulk.askTag(selected.map((r) => r.id))} aria-label="Ajouter une étiquette" className="inline-flex size-11 items-center justify-center rounded-full text-mk-icon active:bg-mk-chip disabled:opacity-35"><Tag className="size-[22px]" strokeWidth={1.8} /></button>
          {admin ? <button type="button" disabled={!selected.length} onClick={() => bulk.askRemove(selected)} aria-label="Supprimer" className="inline-flex size-11 items-center justify-center rounded-full text-mk-danger active:bg-mk-chip disabled:opacity-35"><Trash2 className="size-[22px]" strokeWidth={1.8} /></button> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <MkSearchField icon={Search} value={s.text} onChange={(e) => s.setText(e.target.value)} placeholder="Recherchez par nom, numéro ou e-mail" aria-label="Rechercher des contacts" className="min-w-0 flex-1" />
          <button type="button" onClick={() => setSelecting(true)} aria-label="Sélectionner des contacts" className="inline-flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-mk-input bg-surface text-mk-icon transition active:bg-mk-chip"><SquareCheck className="size-[22px]" strokeWidth={1.7} /></button>
        </div>
      )}

      <button type="button" onClick={() => { loadFacets(); setSheet(true); }} className="mt-3.5 inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-mk-teal-soft px-3.5 text-[14px] font-semibold text-mk-teal">
        <span className="truncate">{listLabel}</span><span className="tabular">{total}</span><ChevronDown className="size-4 shrink-0" strokeWidth={2.2} />
      </button>

      {list.length ? (
        <ul className={cn("-mx-4 mt-2 transition-opacity", s.pending && "opacity-60")} aria-label="Contacts">
          {list.map((c) => {
            const on = sel.ids.has(c.id), name = contactName(c);
            const body = (
              <>
                {selecting ? <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition", on ? "border-accent bg-accent text-accent-fg" : "border-mk-input")}>{on ? <Check className="size-4" strokeWidth={3} /> : null}</span> : null}
                <ContactAvatar contact={c} seed={c.id} size={44} className="text-[15px]" />
                <span className="min-w-0 flex-1 border-b border-mk-line py-3 pr-1">
                  <span className="block truncate text-[16px] font-semibold text-mk-strong">{name}</span>
                  {c.email && c.email !== name ? <span className="mt-0.5 block truncate text-[14px] text-mk-sub">{c.email}</span> : null}
                  {c.phone && c.phone !== name ? <span className="mt-0.5 block truncate text-[14px] text-mk-sub tabular">{c.phone}</span> : null}
                </span>
              </>
            );
            const cls = cn("flex min-h-[72px] items-center gap-3.5 pl-4 pr-3 transition active:bg-mk-chip", on && "bg-accent-soft/60");
            return (
              <li key={c.id}>
                {selecting ? <button type="button" onClick={() => sel.toggle(c.id)} aria-pressed={on} className={cn(cls, "w-full text-left")}>{body}</button> : <Link href={`/marketing/contacts/${c.id}`} className={cls}>{body}</Link>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center px-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><UserPlus className="size-7" strokeWidth={1.6} /></span>
          <p className="mt-3 text-[17px] font-semibold text-mk-strong">{query.q || filterCount(query) ? "Aucun contact ne correspond" : "Aucun contact pour l'instant"}</p>
          <p className="mt-1 text-[15px] text-mk-sub">{query.q || filterCount(query) ? "Essaie un autre nom, numéro ou e-mail." : "Touche + pour ajouter ton premier contact."}</p>
        </div>
      )}
      {more ? (
        <button type="button" onClick={loadMore} disabled={loading} className="mb-14 mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-mk-input bg-surface text-[15px] font-semibold text-mk-text transition active:bg-mk-chip disabled:opacity-60">
          {loading ? <><LoaderCircle className="size-5 animate-spin" />Chargement…</> : <>Charger plus <span className="font-normal text-mk-sub">({total - offset - loaded} de plus)</span></>}
        </button>
      ) : list.length ? <p className="mb-14 mt-4 text-center text-[13px] text-mk-sub">{plural(total, "contact")}</p> : null}

      {/* Feuille du bas : quelle liste afficher */}
      <Sheet.Root open={sheet} onOpenChange={setSheet}>
        <Sheet.Portal>
          <Sheet.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-fade-in lg:hidden" />
          <Sheet.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[20px] bg-surface pb-[max(env(safe-area-inset-bottom),12px)] shadow-pop focus:outline-none data-[state=open]:animate-rise lg:hidden">
            <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-mk-input" aria-hidden />
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <Sheet.Title className="text-[19px] font-semibold text-mk-strong">Listes de contacts</Sheet.Title>
              <Sheet.Close aria-label="Fermer" className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-mk-icon active:bg-mk-chip"><X className="size-5" /></Sheet.Close>
            </div>
            <Sheet.Description className="sr-only">Choisis les contacts à afficher.</Sheet.Description>
            <ul className="overflow-y-auto pb-2">
              <SheetOption label="Tous les contacts" count={facets?.total} active={!query.tag && !query.prospect} onClick={() => pick({})} />
              <SheetOption label="Avec un prospect" count={facets?.withProspect} active={query.prospect === "avec" && !query.tag} onClick={() => pick({ prospect: "avec" })} />
              <SheetOption label="Sans prospect" count={facets?.withoutProspect} active={query.prospect === "sans" && !query.tag} onClick={() => pick({ prospect: "sans" })} />
              <li className="px-5 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-mk-sub">Par étiquette</li>
              {facets ? (facets.tags.length ? facets.tags.map((t) => <SheetOption key={t.name} label={t.name} count={t.count} active={query.tag === t.name} onClick={() => pick({ tag: t.name })} tag />)
                : <li className="px-5 py-3 text-[15px] text-mk-sub">Aucune étiquette pour l&apos;instant.</li>)
                : <li className="flex items-center gap-2 px-5 py-3 text-[15px] text-mk-sub"><LoaderCircle className="size-4 animate-spin" />Chargement…</li>}
            </ul>
          </Sheet.Content>
        </Sheet.Portal>
      </Sheet.Root>
      {bulk.dialogs}
    </div>
  );
}

function SheetOption({ label, count, active, onClick, tag }: { label: string; count?: number; active: boolean; onClick: () => void; tag?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} aria-pressed={active} className="flex min-h-14 w-full items-center gap-3 px-5 text-left transition active:bg-mk-chip">
        {tag ? <Tag className="size-[18px] shrink-0 text-mk-icon" strokeWidth={1.8} /> : null}
        <span className={cn("min-w-0 flex-1 truncate text-[16px]", active ? "font-semibold text-mk-strong" : "font-medium text-mk-text")}>{label}</span>
        <span className="text-[15px] text-mk-sub tabular">{count ?? "…"}</span>
        <Check className={cn("size-5 shrink-0 text-accent-2", !active && "invisible")} strokeWidth={2.4} />
      </button>
    </li>
  );
}

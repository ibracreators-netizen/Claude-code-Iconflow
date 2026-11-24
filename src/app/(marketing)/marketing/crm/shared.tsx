"use client";
import * as React from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarDays, Check, ListChecks, MessageSquare, Phone, StickyNote, Tag, UserRound, X } from "lucide-react";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import type { Member, Stage } from "@/lib/marketing/types";
import { stageHex } from "@/lib/marketing/ui";
import { cn, fmt } from "@/lib/utils";
import { MkInitials } from "@/components/marketing/ui";
import type { LeadRef } from "./lead-dialogs";

/* ─────────────────────────── Noms, montants, références ─────────────────────────── */

/** Nom de la personne (fiche contact d'abord). */
export const nameOf = (p: ProspectRow) => p.contact?.name ?? p.name ?? p.contact?.email ?? p.email ?? "Sans nom";
/** Nom de l'affaire, comme le nom d'une opportunité dans LeadConnector : son titre s'il en a un, sinon la personne. */
export const dealName = (p: ProspectRow) => p.title?.trim() || nameOf(p);
export const amountOf = (p: ProspectRow) => p.signed_amount ?? p.value ?? null;
/** Montant au centime près (« 0,00 € »), comme LeadConnector. */
export const money = (v: number | null | undefined) => fmt.eurCents(v ?? 0);
export const phoneOf = (p: ProspectRow) => p.contact?.phone ?? p.phone ?? null;
export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;
export const refOf = (p: ProspectRow): LeadRef => ({ id: p.id, name: nameOf(p), email: p.contact?.email ?? p.email ?? null, company: p.contact?.company ?? p.marque ?? null, setter_id: p.setter_id ?? null, closer_id: p.closer_id ?? null, unsubscribed: !!p.unsubscribed_at });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
export const PIPELINE = "IconFlow — Ventes";

/* ─────────────────────────── Tri ─────────────────────────── */

export type SortKey = "created" | "name" | "stage" | "value" | "task" | "source" | "setter" | "closer";
export interface SortState { key: SortKey; dir: 1 | -1 }
export const SORT_PRESETS: Array<{ id: string; label: string; sort: SortState }> = [
  { id: "recent", label: "Date d'ajout : les plus récents", sort: { key: "created", dir: -1 } },
  { id: "ancien", label: "Date d'ajout : les plus anciens", sort: { key: "created", dir: 1 } },
  { id: "valeur", label: "Valeur : la plus haute", sort: { key: "value", dir: -1 } },
  { id: "nom", label: "Nom : de A à Z", sort: { key: "name", dir: 1 } },
  { id: "tache", label: "Tâche la plus proche", sort: { key: "task", dir: 1 } },
];
export const SORT_SHORT: Record<SortKey, string> = { created: "Date d'ajout", name: "Nom", stage: "Étape", value: "Valeur", task: "Tâche la plus proche", source: "Source", setter: "Setter", closer: "Closer" };
export const samePreset = (a: SortState, b: SortState) => a.key === b.key && a.dir === b.dir;

export function comparator(sort: SortState, ctx: { stagePos: Record<string, number>; memberName: Record<string, string> }) {
  const text = (a: string | null | undefined, b: string | null | undefined) => (a ? (b ? a.localeCompare(b, "fr") : -1) : b ? 1 : 0);
  const by: Record<SortKey, (a: ProspectRow, b: ProspectRow) => number> = {
    created: (a, b) => a.created_at.localeCompare(b.created_at),
    name: (a, b) => dealName(a).localeCompare(dealName(b), "fr"),
    stage: (a, b) => (ctx.stagePos[a.stage_id ?? ""] ?? 0) - (ctx.stagePos[b.stage_id ?? ""] ?? 0),
    value: (a, b) => (amountOf(a) ?? -1) - (amountOf(b) ?? -1),
    task: (a, b) => (a.nextTaskDue ?? "9999").localeCompare(b.nextTaskDue ?? "9999"),
    source: (a, b) => text(a.source, b.source),
    setter: (a, b) => text(a.setter_id ? ctx.memberName[a.setter_id] : null, b.setter_id ? ctx.memberName[b.setter_id] : null),
    closer: (a, b) => text(a.closer_id ? ctx.memberName[a.closer_id] : null, b.closer_id ? ctx.memberName[b.closer_id] : null),
  };
  // Les valeurs absentes restent en bas, quel que soit le sens (tâche, source, setter, closer).
  const keepLast = sort.key === "task" || sort.key === "source" || sort.key === "setter" || sort.key === "closer";
  return (a: ProspectRow, b: ProspectRow) => {
    const r = by[sort.key](a, b);
    if (keepLast && sort.dir === -1) {
      const empty = (p: ProspectRow) => (sort.key === "task" ? !p.nextTaskDue : sort.key === "source" ? !p.source : sort.key === "setter" ? !p.setter_id : !p.closer_id);
      if (empty(a) !== empty(b)) return empty(a) ? 1 : -1;
    }
    return r * sort.dir || b.created_at.localeCompare(a.created_at);
  };
}

/* ─────────────────────────── Affichage (gardé dans ce navigateur) ─────────────────────────── */

export const CARD_FIELDS = { source: "Source", value: "Valeur", company: "Entreprise", phone: "Téléphone", email: "Email", tags: "Étiquettes", owner: "Setter et closer", created: "Date d'ajout", icons: "Icônes d'action (appel, message, tâches…)" } as const;
export type CardField = keyof typeof CARD_FIELDS;
export const TABLE_COLUMNS = { stage: "Étape", value: "Valeur", source: "Source", setter: "Setter", closer: "Closer", created: "Créé le", task: "Prochaine tâche", phone: "Téléphone", company: "Entreprise", tags: "Étiquettes" } as const;
export type TableColumn = keyof typeof TABLE_COLUMNS;
export interface Prefs { fields: Record<CardField, boolean>; columns: Record<TableColumn, boolean>; sort: SortState; collapsed: string[] }
export const DEFAULT_PREFS: Prefs = {
  fields: { source: true, value: true, company: false, phone: false, email: false, tags: false, owner: false, created: false, icons: true },
  columns: { stage: true, value: true, source: true, setter: true, closer: true, created: true, task: true, phone: false, company: false, tags: false },
  sort: { key: "created", dir: -1 }, collapsed: [],
};
const PREFS_KEY = "iconflow-prospects-affichage", PREFS_EVENT = "iconflow-prospects-affichage-change";
const SORT_KEYS: SortKey[] = ["created", "name", "stage", "value", "task", "source", "setter", "closer"];
const readPrefs = (): string => { try { return window.localStorage.getItem(PREFS_KEY) ?? ""; } catch { return ""; } };
function parsePrefs(raw: string): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<Prefs>;
    const sort = p.sort && SORT_KEYS.includes(p.sort.key) && (p.sort.dir === 1 || p.sort.dir === -1) ? { key: p.sort.key, dir: p.sort.dir } : DEFAULT_PREFS.sort;
    return { fields: { ...DEFAULT_PREFS.fields, ...(p.fields ?? {}) }, columns: { ...DEFAULT_PREFS.columns, ...(p.columns ?? {}) }, sort, collapsed: Array.isArray(p.collapsed) ? p.collapsed.map(String) : [] };
  } catch { return DEFAULT_PREFS; }
}
const subscribePrefs = (cb: () => void) => { window.addEventListener(PREFS_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener("storage", cb); }; };
/** Réglages d'affichage gardés dans ce navigateur : la page reste utilisable si le stockage est bloqué. */
export function usePrefs(): [Prefs, (next: Prefs) => void] {
  const raw = React.useSyncExternalStore(subscribePrefs, readPrefs, () => "");
  const prefs = React.useMemo(() => parsePrefs(raw), [raw]);
  const save = React.useCallback((next: Prefs) => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ } window.dispatchEvent(new Event(PREFS_EVENT)); }, []);
  return [prefs, save];
}

/* ─────────────────────────── Petites briques ─────────────────────────── */

export function StageDot({ stage, className }: { stage: Stage | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: stageHex(stage) }} />;
}

/** Pastille d'étape (liste) : point de couleur + nom. */
export function StagePill({ stage }: { stage: Stage | null | undefined }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-mk-line bg-surface px-2.5 py-1 text-[12.5px] font-medium text-mk-text">
      <StageDot stage={stage} className="size-2" /><span className="truncate">{stage?.name ?? "Sans étape"}</span>
    </span>
  );
}

/** Le responsable de l'affaire (closer, sinon setter) en initiales ; sinon une silhouette pour attribuer. */
export function OwnerBadge({ p, memberName, onAssign, size = 28 }: { p: ProspectRow; memberName: Record<string, string>; onAssign: ((p: ProspectRow) => void) | null; size?: number }) {
  const owner = p.closer_id ?? p.setter_id ?? null;
  const who = [p.setter_id ? `Setter : ${memberName[p.setter_id] ?? "membre"}` : null, p.closer_id ? `Closer : ${memberName[p.closer_id] ?? "membre"}` : null].filter(Boolean).join(" · ");
  const inner = owner
    ? <MkInitials name={memberName[owner] ?? "?"} size={size} />
    : <span className="flex items-center justify-center rounded-full border border-dashed border-mk-input text-mk-icon" style={{ width: size, height: size }}><UserRound className="size-[60%]" strokeWidth={1.8} /></span>;
  if (!onAssign) return <span title={who || "Personne n'est attribué"} className="relative z-10 shrink-0">{inner}<span className="sr-only">{who || "Personne n'est attribué"}</span></span>;
  return (
    <button type="button" onClick={() => onAssign(p)} title={who ? `${who} — changer` : "Attribuer"} aria-label={who ? `${who}. Changer l'attribution de ${dealName(p)}` : `Attribuer ${dealName(p)}`} className="relative z-10 shrink-0 rounded-full transition hover:opacity-80">
      {inner}
    </button>
  );
}

/**
 * Rangée d'icônes d'une carte (comme LeadConnector). Ordinateur : appeler, écrire, étiquettes, notes, tâches, rendez-vous (16 px).
 * Téléphone (`mobile`) : appeler, écrire, étiquettes, tâches, en plus grand pour le doigt.
 */
export function CardIcons({ p, upcoming, onEmail, onTask, mobile, extra }: { p: ProspectRow; upcoming: boolean; onEmail: (p: ProspectRow) => void; onTask: (p: ProspectRow) => void; mobile?: boolean; extra?: React.ReactNode }) {
  const phone = phoneOf(p), email = p.contact?.email ?? p.email, tags = p.contact?.tags ?? [], name = dealName(p);
  const canMail = !!email && !p.unsubscribed_at;
  const box = cn("relative z-10 inline-flex items-center justify-center rounded-[6px] text-mk-icon transition hover:bg-mk-chip hover:text-mk-strong", mobile ? "size-10" : "size-7");
  const icon = mobile ? "size-[22px]" : "size-4";
  const off = "pointer-events-none opacity-35";
  const count = (n: number) => (n ? <span className={cn("absolute flex items-center justify-center rounded-full bg-accent px-1 font-semibold leading-none text-accent-fg tabular", mobile ? "right-0 top-0 h-[18px] min-w-[18px] text-[11px]" : "-right-1 -top-1 h-4 min-w-4 text-[10px]")}>{n > 99 ? "99+" : n}</span> : null);
  const tagText = tags.length ? `Étiquettes : ${tags.join(", ")}` : "Aucune étiquette";
  return (
    <div className={cn("flex items-center", mobile ? "-ml-2 gap-1" : "-ml-1 gap-1.5")}>
      {phone ? <a href={telHref(phone)} className={box} title={`Appeler ${phone}`} aria-label={`Appeler ${name}`}><Phone className={icon} strokeWidth={1.8} /></a>
        : <span className={cn(box, off)} title="Pas de téléphone" aria-hidden><Phone className={icon} strokeWidth={1.8} /></span>}
      <button type="button" disabled={!canMail} onClick={() => onEmail(p)} className={cn(box, "disabled:opacity-35")} title={canMail ? "Envoyer un email" : email ? "Désinscrit : aucun email possible" : "Pas d'email"} aria-label={`Écrire à ${name}`}><MessageSquare className={icon} strokeWidth={1.8} /></button>
      <span className={cn(box, "cursor-default hover:bg-transparent hover:text-mk-icon", !tags.length && "opacity-35")} title={tagText}>
        <Tag className={icon} strokeWidth={1.8} />{count(tags.length)}<span className="sr-only">{tagText}</span>
      </span>
      {!mobile ? (
        <Link href={`/marketing/crm/${p.id}`} className={cn(box, !p.notes && "opacity-35")} title={p.notes ? `Note : ${p.notes.slice(0, 120)}` : "Aucune note"} aria-label={p.notes ? `Voir la note de ${name}` : `Ouvrir ${name}`}><StickyNote className={icon} strokeWidth={1.8} /></Link>
      ) : null}
      <button type="button" onClick={() => onTask(p)} className={box} title={p.openTasks ? `${plural(p.openTasks, "tâche")} à faire — en ajouter une` : "Ajouter une tâche"} aria-label={`Tâches de ${name} : ${p.openTasks}. Ajouter une tâche`}><ListChecks className={icon} strokeWidth={1.8} />{count(p.openTasks)}</button>
      {!mobile ? (
        <Link href={`/marketing/crm/${p.id}`} className={cn(box, !upcoming && "opacity-35")} title={upcoming ? "Rendez-vous à venir" : "Aucun rendez-vous à venir"} aria-label={upcoming ? `Rendez-vous à venir pour ${name}` : `Ouvrir ${name}`}><CalendarDays className={icon} strokeWidth={1.8} />{upcoming ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-mk-success ring-2 ring-surface" /> : null}</Link>
      ) : null}
      {extra}
    </div>
  );
}

/* ─────────────────────────── Feuille du bas (téléphone) ─────────────────────────── */

/** Feuille qui monte du bas de l'écran (pipeline, filtres, tri, déplacer). Accessible : titre, Échap, focus gardé dedans. */
export function Sheet({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[640px] flex-col rounded-t-2xl bg-surface pb-[max(env(safe-area-inset-bottom),10px)] shadow-pop focus:outline-none data-[state=open]:animate-rise">
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-mk-input" aria-hidden />
          <div className="flex items-center gap-3 px-5 pb-1 pt-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[18px] font-semibold text-mk-strong">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Fermer" className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><X className="size-5" /></DialogPrimitive.Close>
          </div>
          {description ? <DialogPrimitive.Description className="px-5 pb-1 text-[14px] text-mk-sub">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{children}</div>
          {footer ? <div className="flex gap-3 border-t border-mk-line px-5 pt-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Ligne de choix dans une feuille : point de couleur ou icône, libellé, information, coche. */
export function SheetOption({ selected, onSelect, leading, label, meta, role = "radio" }: { selected?: boolean; onSelect: () => void; leading?: React.ReactNode; label: React.ReactNode; meta?: React.ReactNode; role?: "radio" | "button" }) {
  return (
    <button type="button" role={role === "radio" ? "radio" : undefined} aria-checked={role === "radio" ? !!selected : undefined} onClick={onSelect}
      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] text-mk-strong transition active:bg-mk-chip", selected && "font-semibold")}>
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta !== undefined ? <span className="shrink-0 text-[14px] text-mk-sub tabular">{meta}</span> : null}
      {role === "radio" ? <Check className={cn("size-5 shrink-0 text-accent-2", !selected && "invisible")} strokeWidth={2.2} /> : null}
    </button>
  );
}

/** Choix des membres pour un setter ou un closer (le media buyer ne prend pas de lead). */
export const assignable = (members: Member[]) => members.filter((m) => m.marketing_role !== "media_buyer");

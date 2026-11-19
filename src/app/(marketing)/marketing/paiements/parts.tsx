"use client";
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ListFilter, MoreVertical, Search, X, type LucideIcon } from "lucide-react";
import { Dropdown, DropdownCheckItem, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

/*
 * Briques de la page Paiements, au style LeadConnector : boutons 14 px arrondis 8 px, champs bordés,
 * pastilles de statut, tableau paginé, menu « ⋮ », fenêtre plein écran sur téléphone.
 */

export const BTN_PRIMARY = "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4";
export const BTN_SECONDARY = "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-text shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition hover:bg-mk-chip disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4";
/** Champ : 16 px sur téléphone (iOS ne zoome pas), 14 px sur ordinateur. */
export const INPUT = "h-12 w-full rounded-[10px] border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 lg:h-10 lg:rounded-[8px] lg:text-[14px]";

/** Titre d'un onglet sur ordinateur (28 px), sous-titre gris 16 px, action à droite. */
export function Heading({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 hidden items-start justify-between gap-6 lg:flex">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-mk-strong">{title}</h1>
        <p className="mt-1 text-[16px] text-mk-sub">{sub}</p>
      </div>
      {action}
    </div>
  );
}

/** Onglets du téléphone : pastilles qui défilent ; celle de l'onglet ouvert est ramenée dans l'écran. */
export function TabChips({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const nav = ref.current, el = nav?.querySelector<HTMLElement>("[aria-current=page]");
    if (nav && el && el.offsetLeft + el.offsetWidth > nav.clientWidth) nav.scrollLeft = el.offsetLeft - 16;
  }, []);
  return (
    <nav ref={ref} aria-label={label} className="relative -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold transition", t.active ? "bg-mk-pill text-mk-ink" : "bg-mk-chip text-mk-strong active:bg-mk-strip")}>{t.label}</Link>
      ))}
    </nav>
  );
}

/* ─── Copier un lien ─── */
async function writeClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* repli ci-dessous */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
export function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = React.useCallback(async (key: string, text: string) => {
    if (await writeClipboard(text)) { setCopied(key); toast.success("Lien copié"); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); }
    else toast.error("Copie impossible : sélectionne le lien et copie-le à la main.");
  }, []);
  return { copied, copy };
}
/** Bouton rond « copier » (tableau). */
export function CopyButton({ done, onClick, label = "Copier le lien" }: { done: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition", done ? "border-mk-success/40 bg-mk-success-soft text-mk-success" : "border-mk-input bg-surface text-mk-icon hover:border-accent/60 hover:text-accent-2")}>
      {done ? <Check className="size-4" strokeWidth={2.2} /> : <Copy className="size-[15px]" strokeWidth={1.8} />}
    </button>
  );
}

/* ─── Pastilles ─── */
export type PillTone = "success" | "neutral" | "link" | "warn" | "teal";
const PILL: Record<PillTone, string> = {
  success: "border-mk-success/35 bg-mk-success-soft text-mk-success",
  neutral: "border-mk-input bg-mk-chip text-mk-text",
  link: "border-mk-link/30 bg-[color-mix(in_oklab,var(--mk-link)_12%,transparent)] text-mk-link",
  warn: "border-mk-warn/35 bg-mk-warn-soft text-mk-warn",
  teal: "border-mk-teal/30 bg-mk-teal-soft text-mk-teal",
};
export function Pill({ tone, dot, children }: { tone: PillTone; dot?: boolean; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-medium", PILL[tone])}>{dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}{children}</span>;
}

/* ─── Menu « ⋮ » ─── */
export interface MenuItem { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean; separated?: boolean }
export function RowMenu({ items, label, className }: { items: MenuItem[]; label: string; className?: string }) {
  return (
    <Dropdown modal={false}>
      <DropdownTrigger asChild>
        <button type="button" aria-label={label} className={cn("inline-flex size-9 items-center justify-center rounded-[8px] text-mk-icon transition hover:bg-mk-chip data-[state=open]:bg-mk-chip", className)}><MoreVertical className="size-[18px]" strokeWidth={1.8} /></button>
      </DropdownTrigger>
      <DropdownContent className="min-w-[200px] rounded-[8px] p-1.5">
        {items.map((it) => (
          <React.Fragment key={it.label}>
            {it.separated ? <DropdownSeparator /> : null}
            <DropdownItem danger={it.danger} onSelect={it.onSelect} className="gap-2.5 rounded-[6px] px-2.5 py-2 text-[14px]"><it.icon />{it.label}</DropdownItem>
          </React.Fragment>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

/* ─── Barre d'outils du tableau (ordinateur) ─── */
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const showDay = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));
/** Plage de dates « Date de début → Date de fin », comme le sélecteur de LeadConnector. */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const set = from || to;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="inline-flex h-10 min-w-[300px] items-center gap-3 rounded-[8px] border border-mk-input bg-surface px-3.5 text-[14px] transition hover:border-accent/60 data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/20">
          <span className={cn("flex-1 text-left", from ? "text-mk-strong" : "text-mk-sub")}>{from ? showDay(from) : "Date de début"}</span>
          <ArrowRight className="size-4 text-mk-sub" aria-hidden />
          <span className={cn("flex-1 text-left", to ? "text-mk-strong" : "text-mk-sub")}>{to ? showDay(to) : "Date de fin"}</span>
          <CalendarDays className="size-[18px] text-mk-sub" strokeWidth={1.8} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[300px] rounded-[8px] border border-mk-line bg-surface p-4 shadow-pop animate-fade-in">
          <p className="mb-3 text-[14px] font-semibold text-mk-strong">Créés entre</p>
          <div className="space-y-3">
            <label className="block"><span className="mb-1 block text-[13px] font-medium text-mk-text">Date de début</span><input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className={INPUT} /></label>
            <label className="block"><span className="mb-1 block text-[13px] font-medium text-mk-text">Date de fin</span><input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className={INPUT} /></label>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" disabled={!set} onClick={() => onChange("", "")} className="text-[14px] font-medium text-mk-sub transition hover:text-mk-strong disabled:opacity-40">Effacer</button>
            <Popover.Close className={cn(BTN_PRIMARY, "h-9")}>Appliquer</Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function SearchBox({ value, onChange, placeholder = "Rechercher" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mk-sub" aria-hidden />
      <span className="sr-only">{placeholder}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-[8px] border border-mk-input bg-surface pl-9 pr-3 text-[14px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
    </label>
  );
}
/** Bouton « Filtres » : cases à cocher (Actif / Inactif, types de documents…). */
export function FilterMenu<T extends string>({ title, options, selected, onChange }: { title: string; options: Array<{ value: T; label: string }>; selected: T[]; onChange: (v: T[]) => void }) {
  return (
    <Dropdown modal={false}>
      <DropdownTrigger asChild>
        <button type="button" className={cn(BTN_SECONDARY, selected.length && "border-accent/60 text-accent-2")}>
          <ListFilter strokeWidth={1.8} />Filtres{selected.length ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">{selected.length}</span> : null}
        </button>
      </DropdownTrigger>
      <DropdownContent className="min-w-[200px] rounded-[8px] p-1.5">
        <DropdownLabel>{title}</DropdownLabel>
        {options.map((o) => (
          <DropdownCheckItem key={o.value} checked={selected.includes(o.value)} onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...selected, o.value] : selected.filter((s) => s !== o.value))} className="py-2 text-[14px]">{o.label}</DropdownCheckItem>
        ))}
        {selected.length ? <><DropdownSeparator /><DropdownItem onSelect={() => onChange([])} className="px-2.5 py-2 text-[14px]"><X />Retirer les filtres</DropdownItem></> : null}
      </DropdownContent>
    </Dropdown>
  );
}

/* ─── Pagination « Précédent 1 2 Suivant · 10 / page » ─── */
export const PAGE_SIZES = [10, 20, 50] as const;
export function Pager({ page, pages, size, onPage, onSize }: { page: number; pages: number; size: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const nums = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const nav = "inline-flex h-9 items-center gap-1 rounded-[8px] px-2.5 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip disabled:pointer-events-none disabled:text-mk-sub/60";
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-1">
        <button type="button" className={nav} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" />Précédent</button>
        {nums.map((n, i) => (
          <React.Fragment key={n}>
            {i > 0 && n - nums[i - 1] > 1 ? <span className="px-1 text-mk-sub">…</span> : null}
            <button type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
              className={cn("inline-flex size-9 items-center justify-center rounded-[8px] text-[14px] font-medium tabular transition", n === page ? "border border-accent/50 bg-accent-soft text-accent-2" : "text-mk-text hover:bg-mk-chip")}>{n}</button>
          </React.Fragment>
        ))}
        <button type="button" className={nav} disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant<ChevronRight className="size-4" /></button>
      </div>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Éléments par page</span>
        <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="h-9 appearance-none rounded-[8px] border border-mk-input bg-surface pl-3 pr-8 text-[14px] text-mk-text outline-none focus:border-accent">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-mk-sub" aria-hidden />
      </label>
    </div>
  );
}

/* ─── Fenêtre de saisie : centrée sur ordinateur, plein écran sur téléphone ─── */
export function FormDialog({ open, onOpenChange, title, description, children, onSubmit, submitLabel, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode;
  onSubmit: () => void; submitLabel: string; pending?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-surface focus:outline-none data-[state=open]:animate-rise lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[calc(100dvh-48px)] lg:w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[12px] lg:border lg:border-mk-line lg:shadow-pop">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (!pending) onSubmit(); }}>
            <div className="flex items-start gap-3 border-b border-mk-line px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] lg:px-6 lg:pb-4 lg:pt-5">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[18px] font-semibold text-mk-strong">{title}</DialogPrimitive.Title>
                {description ? <DialogPrimitive.Description className="mt-0.5 text-[14px] text-mk-sub">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
              </div>
              <DialogPrimitive.Close aria-label="Fermer" className="-mr-1.5 inline-flex size-10 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><X className="size-5" /></DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-6">{children}</div>
            <div className="flex items-center justify-end gap-3 border-t border-mk-line px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 lg:px-6 lg:py-4">
              <DialogPrimitive.Close type="button" className={cn(BTN_SECONDARY, "hidden lg:inline-flex")}>Annuler</DialogPrimitive.Close>
              <button type="submit" disabled={pending} className={cn(BTN_PRIMARY, "h-12 w-full text-[16px] font-semibold lg:h-10 lg:w-auto lg:text-[14px] lg:font-medium")}>{pending ? "Enregistrement…" : submitLabel}</button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
/** Champ de formulaire : libellé (astérisque rouge si obligatoire), aide ou erreur dessous. */
export function FormField({ label, required, hint, error, htmlFor, children }: { label: string; required?: boolean; hint?: React.ReactNode; error?: string | null; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-medium text-mk-text lg:text-[14px]">{label}{required ? <span className="ml-1 text-mk-required">*</span> : null}</label>
      {children}
      {error ? <p className="mt-1.5 text-[13px] text-mk-danger">{error}</p> : hint ? <p className="mt-1.5 text-[13px] text-mk-sub">{hint}</p> : null}
    </div>
  );
}

/** Lien https saisi : message d'erreur immédiat (le serveur revérifie). */
export function urlProblem(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^https:\/\//i.test(s)) return "Le lien doit commencer par « https:// ».";
  try { const u = new URL(s); if (!u.hostname.includes(".")) return "Ce lien n'est pas valide."; } catch { return "Ce lien n'est pas valide."; }
  return null;
}

/** Filtre et pagination partagés (liens, documents). */
export function usePaged<T>(rows: T[], deps: unknown[]) {
  const [size, setSize] = React.useState<number>(10);
  const [page, setPage] = React.useState(1);
  const [key, setKey] = React.useState("");
  const depKey = JSON.stringify(deps);
  if (key !== depKey) { setKey(depKey); setPage(1); }
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return { slice: rows.slice((cur - 1) * size, cur * size), page: cur, pages, size, setPage, setSize: (s: number) => { setSize(s); setPage(1); } };
}

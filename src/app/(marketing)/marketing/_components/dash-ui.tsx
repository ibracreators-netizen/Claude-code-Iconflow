import * as React from "react";
import Link from "next/link";
import { Info, MoveHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Briques des pages chiffrées de Marketing (Tableau de bord, KPI), au style LeadConnector :
 * en-tête de page, choix de période et filtres, cartes chiffres, cartes blanches, tableaux, notes.
 * Sans « use client » : utilisables telles quelles depuis les pages serveur. Couleurs : uniquement des jetons.
 */

/** Bouton principal (lien) : vert de l'app, arrondi 8 px, 14 px. */
export const BTN_PRIMARY = "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-accent px-4 text-[14px] font-medium text-accent-fg shadow-soft transition hover:brightness-110 [&_svg]:size-4";

/** En-tête de page (ordinateur) : titre 28 px, sous-titre gris, actions à droite. Sur téléphone, le titre est déjà dans l'en-tête du cadre. */
export function DashHeader({ title, sub, actions }: { title: string; sub: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="min-w-0">
        <h1 className="sr-only lg:not-sr-only lg:block lg:text-[28px] lg:font-semibold lg:leading-[1.25] lg:tracking-[-0.01em] lg:text-mk-strong">{title}</h1>
        <p className="mt-1 hidden text-[14px] text-mk-sub lg:block">{sub}</p>
      </div>
      {actions ? <div className="flex items-center gap-3 lg:shrink-0 lg:pt-1">{actions}</div> : null}
    </div>
  );
}

const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };
/** Choix de la période en segments (7 · 30 · 90 jours, ou « Aujourd'hui » avec `labelOf`) : pleine largeur sur téléphone. */
export function PeriodSwitch({ value, options, hrefOf, labelOf = (n) => `${n} jours` }: { value: number; options: readonly number[]; hrefOf: (n: number) => string; labelOf?: (n: number) => string }) {
  return <SegmentLinks label="Période" items={options.map((n) => ({ href: hrefOf(n), label: labelOf(n), active: n === value }))} />;
}

/** Segments de liens (période, filtre d'équipe) : l'option choisie en blanc sur fond gris ; pleine largeur sur téléphone. */
export function SegmentLinks({ items, label, className }: { items: Array<{ href: string; label: string; active: boolean }>; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("grid w-full gap-1 rounded-[10px] bg-mk-chip p-1 lg:inline-grid lg:w-auto", COLS[items.length] ?? "grid-flow-col", className)}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} scroll={false} aria-current={t.active ? "true" : undefined}
          className={cn("inline-flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-[8px] px-2.5 text-[14px] font-medium transition sm:px-3.5 lg:h-8 lg:text-[13px]",
            t.active ? "bg-surface text-mk-strong shadow-soft dark:bg-mk-strip" : "text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
      ))}
    </div>
  );
}

/** Onglets soulignés (ordinateur) : l'onglet ouvert en vert. Sur téléphone, les pastilles de `TabChips` prennent le relais. */
export function UnderlineTabs({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 hidden gap-7 border-b border-mk-line lg:flex">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
          className={cn("-mb-px border-b-2 pb-3 text-[14px] font-medium transition", t.active ? "border-accent text-accent-2" : "border-transparent text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
      ))}
    </nav>
  );
}

export type DashTone = "accent" | "success" | "warn";
const TONE: Record<DashTone, string> = {
  accent: "bg-accent-soft text-accent-2",
  success: "bg-mk-success-soft text-mk-success",
  warn: "bg-mk-warn-soft text-mk-warn",
};
/** Rond d'icône teinté. */
export function ToneIcon({ icon: Icon, tone = "accent", className }: { icon: LucideIcon; tone?: DashTone; className?: string }) {
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", TONE[tone], className)} aria-hidden><Icon className="size-[18px]" strokeWidth={1.9} /></span>;
}

/** Carte chiffre : libellé gris, gros chiffre, ligne d'explication dessous, rond d'icône à droite ; règle de calcul en petit si donnée. */
export function StatCard({ label, value, icon, tone = "accent", hint, rule, className }: {
  label: string; value: React.ReactNode; icon: LucideIcon; tone?: DashTone; hint?: React.ReactNode; rule?: string; className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl border border-mk-line bg-surface p-4 shadow-soft lg:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="pt-0.5 text-[13px] font-medium leading-snug text-mk-sub">{label}</p>
        <ToneIcon icon={icon} tone={tone} />
      </div>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.01em] text-mk-strong tabular-nums lg:text-[30px]">{value}</p>
      {hint ? <div className="mt-2.5 text-[13px] leading-snug text-mk-sub">{hint}</div> : null}
      {/* Règle de calcul : sous le chiffre sur ordinateur ; sur téléphone, la page la donne repliée sous les cartes. */}
      {rule ? <p className="mt-auto hidden pt-3 text-[12px] leading-snug text-mk-sub lg:block"><span className="block border-t border-mk-line pt-2.5">{rule}</span></p> : null}
    </div>
  );
}

/** Écart avec la période précédente : vert s'il monte, rouge s'il baisse. */
export function Delta({ value, unit, suffix }: { value: number; unit: string; suffix: string }) {
  const tone = value > 0 ? "text-mk-success" : value < 0 ? "text-mk-danger" : "text-mk-sub";
  return <span className="inline-flex flex-wrap items-baseline gap-x-1"><b className={cn("font-semibold tabular-nums", tone)}>{value > 0 ? "+" : value < 0 ? "−" : ""}{String(Math.abs(value)).replace(".", ",")} {unit}</b><span>{suffix}</span></span>;
}

/** Carte blanche : titre 16 px, sous-titre gris, action à droite. `flush` : le contenu (un tableau) va d'un bord à l'autre. */
export function Panel({ title, sub, action, children, className, flush, id }: {
  title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean; id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft", className)}>
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between lg:px-5 lg:pt-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-snug text-mk-strong">{title}</h2>
          {sub ? <p className="mt-0.5 text-[13px] leading-snug text-mk-sub">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={flush ? "mt-4" : "px-4 pb-4 pt-4 lg:px-5 lg:pb-5"}>{children}</div>
    </section>
  );
}

/** Légende discrète d'un graphique : pastille verte pour la série principale, grise pour la comparaison, vert clair pour une série intermédiaire. */
export function ChartLegend({ items }: { items: Array<{ label: string; muted?: boolean; soft?: boolean }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-mk-sub">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", i.muted ? "bg-muted-2" : i.soft ? "bg-accent/50" : "bg-accent")} aria-hidden />{i.label}</li>)}
    </ul>
  );
}

/** Rien à afficher dans une carte. */
export function PanelEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("py-12 text-center text-[14px] text-mk-sub", className)}>{children}</p>;
}

/** Note discrète (information, règle de lecture). */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("flex items-start gap-2 text-[13px] leading-relaxed text-mk-sub", className)}><Info className="mt-[3px] size-4 shrink-0" strokeWidth={1.8} aria-hidden /><span>{children}</span></p>;
}

/** Bandeau d'avertissement (ex. migration manquante). */
export function WarnBanner({ children }: { children: React.ReactNode }) {
  return <p role="status" className="mb-4 rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] text-mk-warn">{children}</p>;
}

/* ─── Tableaux au style LeadConnector : en-tête gris 12,5 px, lignes de 56 px, trait bas, survol gris ─── */
export const TABLE = "w-full text-left text-[14px]";
export const THEAD = "border-y border-mk-line bg-surface-2";
/** Cellule d'en-tête. Les premières et dernières colonnes s'alignent sur le titre de la carte. */
export const TH = "h-11 whitespace-nowrap px-3 align-middle text-[12.5px] font-medium text-mk-sub first:pl-4 last:pr-4 lg:first:pl-5 lg:last:pr-5";
/** Ligne : `group/row` sert aux cellules collées (STICKY_*), qui suivent le survol de la ligne. */
export const TR = "group/row h-14 border-b border-mk-line transition-colors last:border-b-0 hover:bg-surface-2";
export const TD = "px-3 py-2 text-mk-text tabular-nums first:pl-4 last:pr-4 lg:first:pl-5 lg:last:pr-5";
/** Téléphone : un tableau large défile dans sa carte ; on le dit. */
export function ScrollHint() {
  return <p className="flex items-center gap-1.5 px-4 pb-2.5 text-[12.5px] text-mk-sub lg:hidden"><MoveHorizontal className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />Fais glisser pour voir toutes les colonnes.</p>;
}
/*
 * Colonnes collées au bord quand le tableau défile (ordinateur) : le nom à gauche, la corbeille à droite. Le fond suit
 * la ligne (survol, ligne « toi », ligne de total) pour que rien ne se lise à travers.
 */
export const STICKY_LEFT = "lg:sticky lg:left-0 lg:z-[1] bg-surface group-hover/row:bg-surface-2 lg:shadow-[inset_-1px_0_0_var(--color-mk-line)]";
export const STICKY_RIGHT = "sticky right-0 z-[1] bg-surface group-hover/row:bg-surface-2 shadow-[inset_1px_0_0_var(--color-mk-line)]";
/**
 * Fond d'une cellule collée sur la ligne « toi » : la teinte de la ligne (accent-soft à 40 %, 60 % au survol) posée sur
 * un fond plein, pour la même couleur que le reste de la ligne en clair comme en sombre (où accent-soft est translucide).
 */
export const STICKY_ME = "bg-surface bg-[linear-gradient(color-mix(in_oklab,var(--color-accent-soft)_40%,transparent),color-mix(in_oklab,var(--color-accent-soft)_40%,transparent))] group-hover/row:bg-surface group-hover/row:bg-[linear-gradient(color-mix(in_oklab,var(--color-accent-soft)_60%,transparent),color-mix(in_oklab,var(--color-accent-soft)_60%,transparent))]";
/** En-tête et ligne de total : fond gris de l'en-tête. */
export const STICKY_HEAD = "bg-surface-2 group-hover/row:bg-surface-2";
/** Intitulé qui porte sa règle de calcul au survol (souligné en pointillés). */
export function RuleLabel({ rule, children }: { rule?: string; children: React.ReactNode }) {
  return rule ? <span title={rule} className="cursor-help underline decoration-mk-input decoration-dotted underline-offset-4">{children}</span> : <>{children}</>;
}

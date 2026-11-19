import * as React from "react";
import Link from "next/link";
import { ChevronRight, History, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Briques de l'espace Marketing, au style LeadConnector (tailles et couleurs relevées sur les captures).
 * Elles ne lisent aucune donnée et fonctionnent côté serveur comme côté navigateur.
 */

/** Carte blanche bordée, titre à gauche, action éventuelle à droite (ex. « Applications épinglées » + crayon). */
export function MkCard({ title, action, children, className, bodyClassName }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-xl border border-mk-line bg-surface shadow-soft", className)}>
      {title || action ? (
        <div className="flex items-center gap-3 px-4 pb-1 pt-4 sm:px-5">
          {title ? <h2 className="min-w-0 flex-1 text-[17px] font-semibold text-mk-text">{title}</h2> : <span className="flex-1" />}
          {action}
        </div>
      ) : null}
      <div className={cn("px-4 pb-4 pt-3 sm:px-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Icône ronde cerclée + libellé dessous (applications, actions rapides). */
export function MkRoundLink({ href, icon: Icon, label, onClick, solid, badge, external }: { href?: string; icon: LucideIcon; label: string; onClick?: () => void; solid?: boolean; badge?: number; external?: boolean }) {
  const inner = (
    <>
      <span className={cn("relative flex size-14 items-center justify-center rounded-full transition group-hover:scale-[1.04] group-active:scale-95",
        solid ? "bg-accent text-accent-fg" : "border border-mk-input bg-surface text-mk-icon group-hover:border-accent/60 group-hover:text-accent-2")}>
        <Icon className="size-6" strokeWidth={1.7} />
        {badge ? <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-mk-danger px-1 text-[11px] font-semibold text-white">{badge}</span> : null}
      </span>
      <span className="line-clamp-2 max-w-[84px] break-words text-center text-[12px] font-medium leading-tight text-mk-text hyphens-auto">{label}</span>
    </>
  );
  const cls = "group flex flex-col items-center gap-2 rounded-xl px-1 py-1 outline-offset-2";
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  if (external) return <a href={href} className={cls}>{inner}</a>;
  return <Link href={href ?? "#"} className={cls}>{inner}</Link>;
}
/** Grille d'icônes rondes : 4 par ligne sur téléphone, plus sur ordinateur. */
export function MkRoundGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-x-1 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">{children}</div>;
}

export type MkTone = "success" | "teal" | "warn" | "link";
const TONE: Record<MkTone, string> = {
  success: "bg-mk-success-soft text-mk-success",
  teal: "bg-mk-teal-soft text-mk-teal",
  warn: "bg-mk-warn-soft text-mk-warn",
  link: "bg-[color-mix(in_oklab,var(--mk-link)_14%,transparent)] text-mk-link",
};
/** Tuile de chiffre de l'accueil : bandeau gris (période), titre, pastille d'icône colorée, valeur. Toute la tuile est un lien. */
export function MkTile({ href, period, title, icon: Icon, tone, value, footer }: { href: string; period: string; title: string; icon: LucideIcon; tone: MkTone; value?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Link href={href} className="block overflow-hidden rounded-xl border border-mk-line bg-surface shadow-soft transition active:scale-[0.99] hover:border-mk-input">
      <span className="flex items-center gap-1.5 bg-mk-strip px-3 py-1 text-[12px] font-medium text-mk-text"><History className="size-3.5" strokeWidth={2} />{period}</span>
      <span className="flex min-h-[112px] flex-col p-3.5">
        <span className="flex items-start justify-between gap-2">
          <span className="text-[16px] font-medium leading-snug text-mk-text">{title}</span>
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE[tone])}><Icon className="size-[17px]" strokeWidth={2} /></span>
        </span>
        <span className="mt-auto pt-2">{value !== undefined ? <span className="block text-[30px] font-semibold leading-none tracking-[-0.01em] text-mk-text tabular">{value}</span> : null}{footer}</span>
      </span>
    </Link>
  );
}

/** Pastille ronde avec les initiales (listes de contacts, de leads). */
export function MkInitials({ name, size = 48, icon: Icon }: { name: string; size?: number; icon?: LucideIcon }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-mk-line bg-mk-chip font-semibold text-mk-icon" style={{ width: size, height: size, fontSize: Math.round(size * 0.33) }} aria-hidden>
      {initials}
      {Icon ? <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-mk-line bg-surface text-mk-icon"><Icon className="size-3" strokeWidth={2} /></span> : null}
    </span>
  );
}

/** Ligne de liste (contacts, leads, notifications) : pastille, titre, sous-titre, information à droite. Séparateur décalé. */
export function MkRow({ href, leading, title, subtitle, meta, trailing, className }: { href?: string; leading?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; meta?: React.ReactNode; trailing?: React.ReactNode; className?: string }) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1 border-b border-mk-line py-3.5 pr-1 group-last/list:border-b-0">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-mk-text">{title}</span>
          {meta ? <span className="shrink-0 text-[13px] text-mk-sub tabular">{meta}</span> : null}
        </span>
        {subtitle ? <span className="mt-0.5 block truncate text-[14px] text-mk-icon">{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );
  const cls = cn("group/row flex items-center gap-3.5 pl-4 pr-3 transition hover:bg-mk-chip/60 active:bg-mk-chip", className);
  return <li className="group/list">{href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
export function MkList({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <ul aria-label={label} className={cn("overflow-hidden rounded-xl border border-mk-line bg-surface", className)}>{children}</ul>;
}

/** Pastille de filtre (« Récent », « Non lu »…). */
export function MkChip({ active, children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition [&_svg]:size-4",
      active ? "bg-mk-pill text-mk-ink" : "bg-mk-chip text-mk-strong hover:bg-mk-strip", className)} {...props}>{children}</button>
  );
}
/** Rangée de pastilles qui défile à l'horizontale sur téléphone. */
export function MkChipRow({ children, label }: { children: React.ReactNode; label?: string }) {
  return <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">{children}</div>;
}

/** Champ de recherche (police 16 px : iOS ne zoome pas dessus). */
export function MkSearchField({ className, icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  return (
    <label className={cn("relative block", className)}>
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-mk-sub" strokeWidth={1.8} aria-hidden />
      <input type="search" className="h-12 w-full rounded-[10px] border border-mk-input bg-surface pl-11 pr-3 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" {...props} />
    </label>
  );
}

/** Groupe de réglages : titre au-dessus, carte blanche arrondie, lignes séparées. */
export function MkSettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      {title ? <h2 className="px-1 text-[17px] font-semibold text-mk-strong">{title}</h2> : null}
      <div className="overflow-hidden rounded-[20px] bg-surface [&>*+*]:border-t [&>*+*]:border-mk-line">{children}</div>
    </section>
  );
}
/** Ligne de réglage : pastille d'icône grise, libellé, sous-titre, chevron. */
export function MkSettingsRow({ href, icon: Icon, label, sub, right, onClick, external, danger }: { href?: string; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onClick?: () => void; external?: boolean; danger?: boolean }) {
  const body = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-icon-bg", danger ? "text-mk-logout" : "text-mk-icon")}><Icon className="size-5" strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[17px] font-medium", danger ? "text-mk-logout" : "text-mk-strong")}>{label}</span>
        {sub ? <span className="block truncate text-[14px] text-mk-sub">{sub}</span> : null}
      </span>
      {right ?? (href || onClick ? <ChevronRight className="size-5 shrink-0 text-mk-icon" /> : null)}
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-mk-chip/60 active:bg-mk-chip";
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  if (href && external) return <a href={href} className={cls}>{body}</a>;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}

/** Encadré « rien à afficher » : fond gris, filet vert-bleu à gauche, icône d'information (agenda vide de LeadConnector). */
export function MkEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-r-xl border-l-4 border-accent bg-mk-agenda px-4 py-5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mk-chip text-mk-sub"><Info className="size-[18px]" strokeWidth={1.8} /></span>
      <span className="text-[16px] font-medium text-mk-sub">{children}</span>
    </div>
  );
}

/** Bouton principal pleine largeur, en capitales (formulaires : « ENREGISTRER »). */
export function MkPrimaryButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("h-12 w-full rounded-lg bg-accent text-[16px] font-semibold uppercase tracking-[0.02em] text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40", className)} {...props}>{children}</button>;
}

/** Libellé de champ, avec astérisque rouge si obligatoire. */
export function MkFieldLabel({ children, required, htmlFor }: { children: React.ReactNode; required?: boolean; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-medium text-mk-text">{children}{required ? <span className="ml-1 text-mk-required">*</span> : null}</label>;
}

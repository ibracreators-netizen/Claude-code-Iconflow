import * as React from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MkInitials } from "@/components/marketing/ui";
import { cn } from "@/lib/utils";

/*
 * Briques d'affichage des pages Réglages, Ressources, Équipe et Emails automatiques, au thème de l'app Marketing
 * (LeadConnector) : cartes blanches bordées, titres 16 px, libellés gris 13 px, tableaux à en-tête gris, pastilles,
 * boutons arrondis 8 px (principal à l'accent vert, secondaire blanc bordé). Rien n'est lu ici : ce ne sont que des
 * classes et des composants d'affichage, utilisables côté serveur comme dans le navigateur.
 */

/* ─── Boutons : classes à poser sur <Button>, qui garde son état « chargement » ─── */
/** Principal (accent) : `<Button className={BTN}>`. 40 px de haut sur téléphone (facile à toucher), 36 px sur ordinateur. */
export const BTN = "h-10 rounded-[8px] px-4 text-[14px] font-medium lg:h-9 lg:px-3.5";
/** Secondaire blanc bordé : `<Button variant="outline" className={BTN_LIGHT}>`. */
export const BTN_LIGHT = cn(BTN, "border-mk-input bg-surface text-mk-text shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:bg-mk-chip");
/** Discret, sans bordure : `<Button variant="ghost" className={BTN_GHOST}>`. */
export const BTN_GHOST = cn(BTN, "px-3 text-mk-text hover:bg-mk-chip hover:text-mk-strong lg:px-3");
/** Bouton d'icône (monter, descendre, retirer…) : `<Button variant="ghost" size="icon-sm" className={BTN_ICON}>`. */
export const BTN_ICON = "size-10 shrink-0 rounded-[8px] text-mk-icon hover:bg-mk-chip hover:text-mk-strong lg:size-8";

/* ─── Champs ─── */
/** Champ : 48 px et texte 16 px sur téléphone (iOS ne zoome pas), 40 px et 14 px sur ordinateur. À poser sur <Input>. */
export const INPUT = "h-12 rounded-[10px] border-mk-input px-3.5 text-[16px] text-mk-strong placeholder:text-mk-sub focus:border-accent focus:ring-accent/20 lg:h-10 lg:rounded-[8px] lg:text-[14px]";
/** Liste déroulante : mêmes dimensions, avec la place du chevron. À poser sur <NativeSelect>. */
export const SELECT = cn(INPUT, "pr-9");
/** Case à cocher à la couleur d'accent. */
export const CHECKBOX = "size-[18px] shrink-0 accent-[var(--color-accent)]";

/** Libellé de champ (14 px) et aide grise (13 px). Même structure que <Field> : un clic sur le libellé place le curseur. */
export function KitField({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[14px] font-medium text-mk-text">{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-snug text-mk-sub">{hint}</span> : null}
    </label>
  );
}

/* ─── Cartes ─── */
/**
 * Ombre des cartes : la valeur Marketing de --shadow-soft (LeadConnector, très légère ; un filet en mode sombre).
 * L'utilitaire `shadow-soft` reprend, lui, la valeur de Studio, figée à la compilation.
 */
export const SHADOW = "shadow-[var(--shadow-soft)]";
/** Carte blanche bordée, arrondie, ombre légère. */
export const CARD = cn("rounded-xl border border-mk-line bg-surface", SHADOW);
/**
 * Carte blanche bordée : titre 16 px, description grise 14 px, actions à droite.
 * `flush` : le contenu touche les bords de la carte (tableaux), séparé de l'en-tête par un trait.
 */
export function Panel({ title, description, action, children, className, bodyClassName, flush }: {
  title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode;
  className?: string; bodyClassName?: string; flush?: boolean;
}) {
  const head = !!(title || description || action);
  return (
    <section className={cn(CARD, "min-w-0 overflow-hidden", className)}>
      {head ? (
        <div className={cn("flex flex-wrap items-start gap-x-4 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5", (flush || !children) && "pb-4 sm:pb-5")}>
          <div className="min-w-0 flex-1 basis-64">
            {title ? <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px] font-semibold leading-6 text-mk-strong">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[14px] leading-relaxed text-mk-sub">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn(flush ? (head ? "border-t border-mk-line" : "") : cn("px-4 pb-4 sm:px-5 sm:pb-5", head ? "pt-4" : "pt-4 sm:pt-5"), bodyClassName)}>{children}</div>
      ) : null}
    </section>
  );
}

/** Sous-titre à l'intérieur d'une carte (« Progression des membres »), en casse normale. */
export function SubTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-[14px] font-semibold text-mk-strong", className)}>{children}</h3>;
}

/** Chiffre clé : libellé gris 13 px, valeur 28 px en chiffres tabulaires, précision dessous. Lien si `href` (actif : bordure verte). */
export function StatTile({ label, value, hint, href, active, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; href?: string; active?: boolean; className?: string }) {
  const body = (
    <>
      <span className="block text-[13px] font-medium text-mk-sub">{label}</span>
      <span className="mt-1.5 block text-[28px] font-semibold leading-9 text-mk-strong tabular-nums">{value}</span>
      {hint ? <span className="mt-1 block text-[13px] leading-snug text-mk-sub">{hint}</span> : null}
    </>
  );
  const cls = cn(CARD, "block min-w-0 p-4 transition sm:p-5", active ? "border-accent ring-1 ring-accent/30" : href && "hover:border-mk-input", className);
  return href ? <Link href={href} aria-current={active ? "true" : undefined} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Encadré vide : pastille d'icône grise, titre 16 px, explication grise. */
export function EmptyBlock({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon ? <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon"><Icon className="size-[22px]" strokeWidth={1.7} /></span> : null}
      <p className="text-[16px] font-semibold text-mk-strong">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[14px] leading-relaxed text-mk-sub text-balance">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ─── Pastilles et encadrés ─── */
export type Tone = "success" | "neutral" | "warn" | "danger" | "teal" | "accent";
const PILL: Record<Tone, string> = {
  success: "border-mk-success/30 bg-mk-success-soft text-mk-success",
  neutral: "border-mk-input bg-mk-chip text-mk-text",
  warn: "border-mk-warn/30 bg-mk-warn-soft text-mk-warn",
  danger: "border-mk-danger/30 bg-mk-danger/10 text-mk-danger",
  teal: "border-mk-teal/30 bg-mk-teal-soft text-mk-teal",
  accent: "border-accent/30 bg-accent-soft text-accent-2",
};
/** Pastille de statut (« Actif », « Gagné », « En attente »…). */
export function Pill({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-medium leading-none", PILL[tone], className)}>{children}</span>;
}

const NOTICE: Record<Exclude<Tone, "accent">, string> = {
  neutral: "border-mk-line bg-surface-2 text-mk-text",
  success: "border-mk-success/30 bg-mk-success-soft text-mk-success",
  warn: "border-mk-warn/30 bg-mk-warn-soft text-mk-warn",
  danger: "border-mk-danger/30 bg-mk-danger/10 text-mk-danger",
  teal: "border-mk-teal/25 bg-mk-teal-soft text-mk-teal",
};
/** Encadré d'information (simulation, migration manquante, erreur de lecture…). */
export function Notice({ tone = "neutral", icon: Icon, title, children, className, role }: { tone?: Exclude<Tone, "accent">; icon?: LucideIcon; title?: React.ReactNode; children?: React.ReactNode; className?: string; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cn("flex items-start gap-3 rounded-[10px] border px-4 py-3 text-[14px] leading-relaxed", NOTICE[tone], className)}>
      {Icon ? <Icon className={cn("mt-0.5 size-[18px] shrink-0", tone === "neutral" && "text-mk-icon")} strokeWidth={1.8} aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className={cn("font-semibold", tone === "neutral" && "text-mk-strong")}>{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", tone === "neutral" && title && "text-mk-sub")}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Nom technique (variable, chemin d'adresse) : petite étiquette grise, dans la police de l'app. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-[6px] bg-mk-chip px-1.5 py-0.5 text-[0.92em] font-medium text-mk-strong [overflow-wrap:anywhere]", className)}>{children}</span>;
}

/* ─── Tableaux ─── */
/** Tableau LeadConnector : en-tête gris 12,5 px, lignes d'au moins 56 px avec un trait bas, survol gris. */
export const TABLE = "w-full text-left text-[14px]";
export const THEAD = "border-b border-mk-line bg-surface-2";
export const TH = "h-11 whitespace-nowrap px-4 text-left text-[12.5px] font-medium text-mk-sub sm:first:pl-5 sm:last:pr-5";
export const TR = "h-14 border-b border-mk-line transition-colors last:border-b-0 hover:bg-surface-2";
export const TD = "px-4 py-3 align-middle text-mk-text sm:first:pl-5 sm:last:pr-5";
/** Le tableau défile à l'horizontale dans sa carte, jamais la page. */
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto [scrollbar-width:thin]", className)}>{children}</div>;
}

/* ─── Navigation ─── */
/** Retour à la page parente (« ← Réglages »), sur ordinateur : sur téléphone, l'en-tête du cadre porte déjà la flèche de retour. */
export function BackLink({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-3 hidden lg:block">
      <Link href={href} aria-label={title} className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[8px] px-2 text-[14px] font-medium text-mk-sub transition hover:bg-mk-chip hover:text-mk-strong"><ArrowLeft className="size-4" aria-hidden />{label}</Link>
    </nav>
  );
}

/** Pastille-filtre en lien (« Tout », « Reçu »…) : active vert d'eau, sinon grise. */
export function ChipLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition", active ? "bg-mk-pill text-mk-ink" : "bg-mk-chip text-mk-strong hover:bg-mk-strip")}>{children}</Link>
  );
}

/** Choix en segments, en liens (rôle affiché) : fond gris, segment actif blanc. Pleine largeur sur téléphone. */
export function SegmentLinks({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] bg-mk-chip p-1 sm:inline-grid">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "true" : undefined}
          className={cn("inline-flex h-10 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-[14px] font-medium transition lg:h-9", t.active ? cn("bg-surface text-mk-strong", SHADOW) : "text-mk-sub hover:text-mk-strong")}>{t.label}</Link>
      ))}
    </nav>
  );
}

/* ─── Personnes ─── */
/** Photo du membre, sinon ses initiales sur fond gris (sans les signes : « Setter (essai) » donne « SE »). */
export function MemberAvatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  if (src) return <Avatar name={name} src={src} size={size} />;
  return <MkInitials name={name.replace(/[^\p{L}\p{N}\s]/gu, " ")} size={size} />;
}

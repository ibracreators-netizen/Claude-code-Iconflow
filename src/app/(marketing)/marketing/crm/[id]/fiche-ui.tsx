import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Briques de la fiche prospect, au style LeadConnector : champs h-12 bordés sur téléphone (texte 16 px, iOS ne zoome pas),
 * h-10 et texte 14 px sur ordinateur ; bouton principal à la couleur d'accent, bouton secondaire blanc bordé.
 */
const FIELD = "w-full rounded-lg border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 lg:text-[14px]";
export const INPUT = cn(FIELD, "h-12 lg:h-10");
export const TEXTAREA = cn(FIELD, "min-h-[96px] resize-y py-3 leading-relaxed");
export const BTN_PRIMARY = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-[14px] font-medium text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";
export const BTN_SECONDARY = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-mk-input bg-surface px-4 text-[14px] font-medium text-mk-text transition hover:bg-mk-chip disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";
export const BTN_LINK = "inline-flex items-center gap-1 whitespace-nowrap rounded-md text-[15px] font-medium text-accent-2 transition hover:underline disabled:opacity-40 lg:text-[14px] [&_svg]:size-4 [&_svg]:shrink-0";

/** Liste déroulante native (le téléphone ouvre son propre sélecteur), chevron à droite. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(INPUT, "appearance-none pr-10", className)} {...props}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-mk-sub" aria-hidden />
    </span>
  );
}

/** Titre de section d'un onglet (« À faire (2) »), action éventuelle à droite. */
export function TabHeading({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <h3 className="text-[16px] font-semibold text-mk-strong">{title}{count !== undefined ? <span className="ml-1 font-normal text-mk-sub">({count})</span> : null}</h3>
      {action}
    </div>
  );
}

/** « AAAA-MM-JJ » d'un instant, dans le fuseau d'affichage. */
export const dayKey = (iso: string | Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Un lien externe n'est rendu cliquable que s'il est en http(s). */
export const safeUrl = (v: string | null | undefined) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

import * as React from "react";
import { STAGE_COLORS } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/*
 * Petites briques partagées par la liste, la fiche et l'ajout d'un contact (côté serveur comme côté navigateur).
 */

type Named = { name?: string | null; email?: string | null; phone?: string | null };
export const contactName = (c: Named) => c.name?.trim() || c.email || c.phone || "Sans nom";

// Teintes moyennes de la palette des étapes : lisibles en clair comme en sombre.
const HUES = (["bleu", "violet", "vert", "orange", "rose", "jaune", "rouge"] as const).map((k) => STAGE_COLORS[k].hex);
const hueOf = (seed: string) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
function initialsOf(c: Named) {
  const name = c.name?.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (c.email?.[0] ?? "#").toUpperCase();
}

/** Rond d'initiales coloré (une couleur stable par contact), comme dans LeadConnector. */
export function ContactAvatar({ contact, seed, size = 32, className }: { contact: Named; seed: string; size?: number; className?: string }) {
  const hex = hueOf(seed);
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), color: hex, background: `color-mix(in oklab, ${hex} 17%, transparent)` }}>
      {initialsOf(contact)}
    </span>
  );
}

const dayFmt = new Map<string, Intl.DateTimeFormat>(), timeFmt = new Map<string, Intl.DateTimeFormat>();
/** « 19 nov. 2026 14:03 », dans le fuseau de l'espace. */
export function createdLabel(iso: string, tz: string) {
  if (!dayFmt.has(tz)) { dayFmt.set(tz, new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: tz })); timeFmt.set(tz, new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz })); }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${dayFmt.get(tz)!.format(d)} ${timeFmt.get(tz)!.format(d)}`;
}

const rtfAuto = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" }), rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "always" });
/** « il y a 1 semaine », « hier », « il y a 3 heures ». `now` est fixé par le serveur : même texte au rendu et dans le navigateur. */
export function agoLabel(iso: string | null | undefined, now: string) {
  if (!iso) return "";
  const s = (new Date(iso).getTime() - new Date(now).getTime()) / 1000, a = Math.abs(s);
  if (!Number.isFinite(s)) return "";
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86_400) return rtfAuto.format(Math.round(s / 86_400), "day");
  if (a < 30 * 86_400) return rtf.format(Math.round(s / (7 * 86_400)), "week");
  if (a < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), "month");
  return rtf.format(Math.round(s / (365 * 86_400)), "year");
}

/** Pastille d'étiquette grise. */
export function TagPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 max-w-[140px] items-center truncate rounded-full bg-mk-chip px-2.5 text-[12px] font-medium text-mk-text", className)}>{children}</span>;
}

/** Champ de formulaire LeadConnector : 48 px et texte 16 px sur téléphone (pas de zoom iOS), 40 px sur ordinateur. */
export const MK_FIELD = "h-12 w-full rounded-[10px] border border-mk-input bg-surface px-3.5 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-mk-danger lg:h-10 lg:rounded-lg lg:text-[14px]";
export const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

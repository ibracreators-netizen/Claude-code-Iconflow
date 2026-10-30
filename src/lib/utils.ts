import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("fr-FR");
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

type DateLike = string | number | Date | null | undefined;
const EMPTY = "—";

/** Date valide ou null : une valeur absente ou invalide (donnée legacy, colonne manquante) ne doit jamais faire planter un rendu. */
function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}
const safeNum = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const fmt = {
  eur: (v: number | null | undefined) => eur.format(safeNum(v)),
  eurCents: (v: number | null | undefined) => eurCents.format(safeNum(v)),
  num: (v: number | null | undefined) => num.format(safeNum(v)),
  pct: (v: number | null | undefined) => pct.format(safeNum(v)),
  compact: (v: number | null | undefined) =>
    new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(safeNum(v)),
  date: (d: DateLike, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) => {
    const date = toDate(d);
    return date ? new Intl.DateTimeFormat("fr-FR", opts).format(date) : EMPTY;
  },
  dateLong: (d: DateLike) => {
    const date = toDate(d);
    return date ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date) : EMPTY;
  },
  dateTime: (d: DateLike) => {
    const date = toDate(d);
    return date ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date) : EMPTY;
  },
  relative: (d: DateLike) => {
    const date = toDate(d);
    if (!date) return EMPTY;
    const diff = (date.getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
    return rtf.format(Math.round(diff / (86400 * 30)), "month");
  },
};

export function initials(name: string | null | undefined) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function uid(prefix = "") {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${r}` : r;
}

export function daysUntil(d: DateLike) {
  const date = toDate(d);
  return date ? Math.ceil((date.getTime() - Date.now()) / 86400000) : 0;
}

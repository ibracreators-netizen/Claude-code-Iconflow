/**
 * Jours du calendrier : des chaînes « AAAA-MM-JJ », lues dans le fuseau des réglages Marketing.
 * Les calculs se font à midi UTC : un changement d'heure ne décale jamais un jour. Fonctions pures (serveur et navigateur).
 */

export type CalView = "mois" | "semaine" | "liste";

const at = (d: string) => new Date(`${d}T12:00:00Z`);
const pad = (n: number) => String(n).padStart(2, "0");

export const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(at(s).getTime()) && at(s).toISOString().slice(0, 10) === s;
export const dayOf = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;
export const addDays = (d: string, n: number) => new Date(at(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** 0 = dimanche … 6 = samedi. */
export const weekday = (d: string) => at(d).getUTCDay();
export const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const daysInMonth = (d: string) => { const x = at(monthStart(d)); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0, 12)).getUTCDate(); };
export const monthEnd = (d: string) => `${d.slice(0, 7)}-${pad(daysInMonth(d))}`;
/** Premier jour du mois décalé de `n` mois. */
export const addMonths = (d: string, n: number) => { const x = at(monthStart(d)); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1, 12)).toISOString().slice(0, 10); };
export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
export const isWeekend = (d: string) => { const w = weekday(d); return w === 0 || w === 6; };
export const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86_400_000);

/** Jours chargés pour une vue : la grille complète du mois (lundi → dimanche), la semaine, ou 30 jours de liste. */
export function rangeOf(view: CalView, day: string): { first: string; last: string } {
  if (view === "semaine") { const m = mondayOf(day); return { first: m, last: addDays(m, 6) }; }
  if (view === "liste") return { first: day, last: addDays(day, 29) };
  return { first: mondayOf(monthStart(day)), last: addDays(mondayOf(monthEnd(day)), 6) };
}

const formats = new Map<string, Intl.DateTimeFormat>();
/** Date en français (« lun. 16 nov. 2026 »), sans dépendre du fuseau du navigateur. */
export function fmt(d: string, opts: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(opts);
  let f = formats.get(key);
  if (!f) { f = new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }); formats.set(key, f); }
  return f.format(at(d));
}

/** « 16 – 22 nov. 2026 », « 30 nov. – 6 déc. 2026 », « 29 déc. 2026 – 4 janv. 2027 ». */
export function spanLabel(a: string, b: string): string {
  const end = fmt(b, { day: "numeric", month: "short", year: "numeric" });
  if (sameMonth(a, b)) return `${Number(a.slice(8))} – ${end}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${fmt(a, { day: "numeric", month: "short" })} – ${end}`;
  return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${end}`;
}

export const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

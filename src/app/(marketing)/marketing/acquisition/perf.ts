/*
 * Tableau de bord : calculs purs sur les saisies déclarées et les appels à venir (aucune lecture ici).
 * Les jours sont des jours civils (AAAA-MM-JJ) dans le fuseau de l'espace, comme les saisies.
 */
import { declaredTotals, shiftDay } from "@/lib/marketing/kpi-links";
import { KPI_FIELDS, type KpiField } from "@/lib/marketing/types";
import type { DeclaredRow, Person, PersonRole, UpcomingCall } from "@/lib/marketing/dashboard-server";

/* ─────────────────────────── Période et filtre ─────────────────────────── */

export const PERIODS = [1, 7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
export const parsePeriod = (v: string): Period => (PERIODS as readonly number[]).includes(Number(v)) ? (Number(v) as Period) : 7;
export const periodLabel = (n: number) => (n === 1 ? "Aujourd'hui" : `${n} jours`);
/** « vs hier », « vs les 7 jours d'avant ». */
export const previousLabel = (n: number) => (n === 1 ? "vs hier" : `vs les ${n} jours d'avant`);

export interface PeriodRange { from: string; to: string; prevFrom: string; prevTo: string }
/** Période de `n` jours finissant aujourd'hui (incluse), et la période de même longueur juste avant. */
export function periodRange(today: string, n: number): PeriodRange {
  const from = shiftDay(today, -(n - 1)), prevTo = shiftDay(from, -1);
  return { from, to: today, prevFrom: shiftDay(prevTo, -(n - 1)), prevTo };
}
/** Jours de `from` à `to` inclus, dans l'ordre. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from, k = 0; d <= to && k < 400; d = shiftDay(d, 1), k++) out.push(d);
  return out;
}

export type TeamFilter = "tous" | "setters" | "closers";
export const TEAM_FILTERS: Array<[TeamFilter, string]> = [["tous", "Toute l'équipe"], ["setters", "Setters"], ["closers", "Closers"]];
export const parseTeam = (v: string): TeamFilter => (v === "setters" || v === "closers" ? v : "tous");
export const PERSON_ROLE: Record<PersonRole, string> = { setter: "Setter", closer: "Closer", media_buyer: "Media buyer", admin: "Admin", equipe: "Équipe" };
/** Une personne entre-t-elle dans le filtre ? « Toute l'équipe » : tout le monde. */
export const inTeam = (role: PersonRole | undefined, team: TeamFilter) => team === "tous" || (team === "setters" ? role === "setter" : role === "closer");

/** Indicateurs montrés : ceux du rôle filtré ; sinon tous (setters puis closers). */
export function fieldsFor(team: TeamFilter | "setter" | "closer"): KpiField[] {
  if (team === "setters" || team === "setter") return KPI_FIELDS.setter;
  if (team === "closers" || team === "closer") return KPI_FIELDS.closer;
  return [...KPI_FIELDS.setter, ...KPI_FIELDS.closer];
}

/* ─────────────────────────── Chiffres ─────────────────────────── */

/** Taux en pourcentage, au dixième ; `null` sans base (division par zéro). */
export const rate = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
export const inDays = (rows: DeclaredRow[], from: string, to: string) => rows.filter((r) => r.day >= from && r.day <= to);
export const totals = (rows: DeclaredRow[]) => declaredTotals(rows);

/**
 * Écart avec la période précédente. Pour un nombre : en pourcentage de la période d'avant (« nouveau » si elle était à zéro).
 * Pour un taux : en points. `null` : rien à comparer.
 */
export type Change = { kind: "pct" | "pt"; value: number } | { kind: "new" };
export function countChange(now: number, before: number): Change | null {
  if (before > 0) return { kind: "pct", value: Math.round(((now - before) / before) * 100) };
  return now > 0 ? { kind: "new" } : null;
}
export function rateChange(now: number | null, before: number | null): Change | null {
  return now === null || before === null ? null : { kind: "pt", value: Math.round((now - before) * 10) / 10 };
}

/** Courbe par jour : total de chaque indicateur demandé (zéro un jour sans saisie). */
export function dailySeries(rows: DeclaredRow[], days: string[], keys: string[]): Array<Record<string, number> & { day: string }> {
  const by = new Map(days.map((d) => [d, { day: d, ...Object.fromEntries(keys.map((k) => [k, 0])) } as Record<string, number> & { day: string }]));
  for (const r of rows) {
    const p = by.get(r.day); if (!p) continue;
    for (const k of keys) { const n = Number(r.metrics?.[k]); if (Number.isFinite(n) && n > 0) p[k] += Math.round(n); }
  }
  return [...by.values()];
}

export interface RankRow { person: Person; days: number; totals: Record<string, number>; pickup: number | null; conversation: number | null }
/**
 * Classement par personne sur la période : jours saisis, totaux, taux de décroché et de conversation.
 * Ordre : appels passés, puis relances, puis propositions, puis le nom.
 */
export function ranking(rows: DeclaredRow[], people: Person[]): RankRow[] {
  const groups = new Map<string, DeclaredRow[]>();
  for (const r of rows) groups.set(r.who, [...(groups.get(r.who) ?? []), r]);
  const out: RankRow[] = [];
  for (const p of people) {
    const mine = groups.get(p.who); if (!mine?.length) continue;
    const t = declaredTotals(mine);
    out.push({ person: p, days: new Set(mine.map((r) => r.day)).size, totals: t, pickup: rate(t.decroches, t.appels), conversation: rate(t.conversations, t.decroches) });
  }
  return out.sort((a, b) => b.totals.appels - a.totals.appels || b.totals.relances - a.totals.relances || b.totals.propositions - a.totals.propositions || a.person.name.localeCompare(b.person.name, "fr"));
}

/** Personnes attendues chaque jour qui n'ont rien saisi pour `today`, par nom. */
export function missingOn(people: Person[], rows: DeclaredRow[], today: string): Person[] {
  const done = new Set(rows.filter((r) => r.day === today).map((r) => r.who));
  return people.filter((p) => p.expected && !done.has(p.who)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/* ─────────────────────────── Appels à venir ─────────────────────────── */

/** « Aujourd'hui », « Demain », puis « Mercredi 26 novembre ». */
export function upcomingDayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  if (day === shiftDay(today, 1)) return "Demain";
  const t = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** Jour civil d'un instant dans un fuseau. */
export function dayInZone(iso: string, timezone: string): string {
  try { return new Intl.DateTimeFormat("fr-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); }
  catch { return iso.slice(0, 10); }
}
/** Appels regroupés par jour, dans l'ordre ; le premier jour qui en a vient en premier. */
export function groupCalls(calls: UpcomingCall[], timezone: string, today: string): Array<{ day: string; label: string; calls: UpcomingCall[] }> {
  const by = new Map<string, UpcomingCall[]>();
  // Un appel commencé la veille et encore en cours est rangé avec aujourd'hui.
  for (const c of calls) { const s = dayInZone(c.startsAt, timezone), d = s < today ? today : s; by.set(d, [...(by.get(d) ?? []), c]); }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, label: upcomingDayLabel(day, today), calls: list }));
}

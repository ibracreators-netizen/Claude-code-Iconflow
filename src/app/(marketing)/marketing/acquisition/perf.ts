/*
 * Tableau de bord : calculs purs sur les saisies déclarées et les appels à venir (aucune lecture ici).
 * Les jours sont des jours civils (AAAA-MM-JJ) dans le fuseau de l'espace, comme les saisies.
 */
import { CLOSER_FIELD, CLOSER_KEYS, CLOSER_RULES, closerRates, type CloserRates, type CloserTotals } from "@/lib/marketing/closer-report";
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

/**
 * Ce que montre le Tableau de bord : « setter » (filtre Setters, ou un setter connecté), « closer » (filtre Closers, ou
 * un closer connecté), « tous » (Toute l'équipe : l'essentiel des deux rôles).
 */
export type PerfMode = "setter" | "closer" | "tous";
export const perfMode = (own: "setter" | "closer" | null, team: TeamFilter): PerfMode =>
  own ?? (team === "setters" ? "setter" : team === "closers" ? "closer" : "tous");

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

/** Champs closer pris dans des totaux déclarés (declaredTotals les contient tous). */
export const closerPart = (t: Record<string, number>): CloserTotals => Object.fromEntries(CLOSER_KEYS.map((k) => [k, t[k] ?? 0])) as CloserTotals;

/* ─────────────────────────── Cartes ─────────────────────────── */

/** Une carte chiffre : total de la période, écart avec la période d'avant, et un taux (ou un panier moyen) dessous. */
export interface CardFigure { field: KpiField; value: number; change: Change | null; rate?: { label: string; value: number | null; change: Change | null; unit?: "euro"; rule?: string } }
const SETTER_FIELD = Object.fromEntries(KPI_FIELDS.setter.map((f) => [f.key, f])) as Record<string, KpiField>;
const card = (field: KpiField, cur: Record<string, number>, before: Record<string, number>): CardFigure => ({ field, value: cur[field.key] ?? 0, change: countChange(cur[field.key] ?? 0, before[field.key] ?? 0) });
const pickupRate = (cur: Record<string, number>, before: Record<string, number>) => ({ label: "Taux de décroché", rule: "Appels décrochés ÷ appels passés.", value: rate(cur.decroches, cur.appels), change: rateChange(rate(cur.decroches, cur.appels), rate(before.decroches, before.appels)) });
const conversationRate = (cur: Record<string, number>, before: Record<string, number>) => ({ label: "Taux de conversation", rule: "Conversations ÷ appels décrochés.", value: rate(cur.conversations, cur.decroches), change: rateChange(rate(cur.conversations, cur.decroches), rate(before.conversations, before.decroches)) });
const closerRate = (label: string, rule: string, key: keyof CloserRates, cur: CloserRates, before: CloserRates) => ({ label, rule, value: cur[key], change: rateChange(cur[key], before[key]) });

/** Setters : les quatre indicateurs, avec le taux de décroché et le taux de conversation. */
export function setterCards(cur: Record<string, number>, before: Record<string, number>): CardFigure[] {
  return KPI_FIELDS.setter.map((f) => {
    const c = card(f, cur, before);
    if (f.key === "decroches") c.rate = pickupRate(cur, before);
    if (f.key === "conversations") c.rate = conversationRate(cur, before);
    return c;
  });
}
/** Closers : appels prévus, show-up, pitchs, closes, cash collecté, CA signé (avec le panier moyen). */
export function closerCards(cur: Record<string, number>, before: Record<string, number>): CardFigure[] {
  const r = closerRates(closerPart(cur)), p = closerRates(closerPart(before)), F = CLOSER_FIELD;
  return [
    card(F.rdv_prevus, cur, before),
    { ...card(F.show_up, cur, before), rate: closerRate("Taux de show-up", CLOSER_RULES.showRate, "showRate", r, p) },
    { ...card(F.pitchs, cur, before), rate: closerRate("Taux de pitch", CLOSER_RULES.pitchRate, "pitchRate", r, p) },
    { ...card(F.closes, cur, before), rate: closerRate("Taux de closing", CLOSER_RULES.closeRate, "closeRate", r, p) },
    card(F.cash, cur, before),
    { ...card(F.ca_signe, cur, before), rate: { label: "Panier moyen", rule: CLOSER_RULES.average, value: r.average, change: null, unit: "euro" } },
  ];
}
/** Toute l'équipe : appels passés, conversations, show-up, pitchs, closes, cash collecté. */
export function teamCards(cur: Record<string, number>, before: Record<string, number>): CardFigure[] {
  const r = closerRates(closerPart(cur)), p = closerRates(closerPart(before)), F = CLOSER_FIELD;
  return [
    { ...card(SETTER_FIELD.appels, cur, before), rate: pickupRate(cur, before) },
    { ...card(SETTER_FIELD.conversations, cur, before), rate: conversationRate(cur, before) },
    { ...card(F.show_up, cur, before), rate: closerRate("Taux de show-up", CLOSER_RULES.showRate, "showRate", r, p) },
    { ...card(F.pitchs, cur, before), rate: closerRate("Taux de pitch", CLOSER_RULES.pitchRate, "pitchRate", r, p) },
    { ...card(F.closes, cur, before), rate: closerRate("Taux de closing", CLOSER_RULES.closeRate, "closeRate", r, p) },
    card(F.cash, cur, before),
  ];
}
export const cardsFor = (mode: PerfMode, cur: Record<string, number>, before: Record<string, number>) =>
  (mode === "setter" ? setterCards : mode === "closer" ? closerCards : teamCards)(cur, before);

/* ─────────────────────────── Classement ─────────────────────────── */

export interface RankRow { person: Person; days: number; totals: Record<string, number>; pickup: number | null; conversation: number | null; closer: CloserRates }
/**
 * Classement par personne sur la période : jours saisis, totaux et taux. Ordre selon ce qui est montré :
 * closers : closes, puis cash, puis CA signé ; setters : appels passés, relances, propositions ; toute l'équipe : comme
 * les setters, puis les closes. Le nom départage.
 */
export function ranking(rows: DeclaredRow[], people: Person[], mode: PerfMode = "tous"): RankRow[] {
  const groups = new Map<string, DeclaredRow[]>();
  for (const r of rows) groups.set(r.who, [...(groups.get(r.who) ?? []), r]);
  const out: RankRow[] = [];
  for (const p of people) {
    const mine = groups.get(p.who); if (!mine?.length) continue;
    const t = declaredTotals(mine);
    out.push({ person: p, days: new Set(mine.map((r) => r.day)).size, totals: t, pickup: rate(t.decroches, t.appels), conversation: rate(t.conversations, t.decroches), closer: closerRates(closerPart(t)) });
  }
  const order: string[] = mode === "closer" ? ["closes", "cash", "ca_signe"] : mode === "setter" ? ["appels", "relances", "propositions"] : ["appels", "relances", "propositions", "closes"];
  return out.sort((a, b) => {
    for (const k of order) { const d = (b.totals[k] ?? 0) - (a.totals[k] ?? 0); if (d) return d; }
    return a.person.name.localeCompare(b.person.name, "fr");
  });
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

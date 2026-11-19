/**
 * KPI de l'équipe commerciale : closing, setters, closers. Fonctions pures, sur des faits sans coordonnées
 * (les mêmes que l'entonnoir), plus le suivi quotidien déclaré par chaque membre.
 * Chaque chiffre a sa règle (KPI_RULES), affichée dans l'app. Aucun chiffre inventé : un taux sans base est vide.
 */
import type { FactAppointment, FactProspect, FactTask } from "./funnel";

export const KPI_RULES = {
  scheduled: "Rendez-vous de la période, hors annulés et reportés.",
  held: "Prospects dont un rendez-vous de la période a le résultat « présent » (ou dont l'appel est noté « présent » sur la fiche, sans rendez-vous enregistré).",
  noShow: "Rendez-vous de la période dont le résultat est « absent ».",
  showRate: "Présents ÷ (présents + absents). Les rendez-vous sans résultat saisi ne comptent pas.",
  pending: "Rendez-vous passés dont le résultat n'est pas encore saisi.",
  signed: "Parmi les appels tenus, prospects dont l'issue est « signé ».",
  closeRate: "Signés ÷ appels tenus de la période.",
  amount: "Somme des montants signés HT de ces prospects.",
  average: "Montant signé HT ÷ nombre de signatures.",
  assigned: "Prospects créés pendant la période et attribués au setter.",
  booked: "Parmi ces prospects, ceux qui ont au moins un rendez-vous non annulé.",
  bookingRate: "Leads avec rendez-vous ÷ leads attribués.",
  handled: "Prospects différents pour lesquels il a terminé une tâche « À appeler » ou une relance pendant la période.",
  declared: "Saisi par le membre dans le suivi quotidien. Déclaratif.",
} as const;

export interface ClosingKpi { scheduled: number; held: number; noShow: number; pending: number; showRate: number | null; signed: number; thinking: number; notSigned: number; closeRate: number | null; amount: number; average: number | null }
export interface CloserKpi extends ClosingKpi { id: string; name: string; declared: Record<string, number> }
export interface SetterKpi { id: string; name: string; assigned: number; booked: number; bookingRate: number | null; handled: number; shown: number; noShow: number; showRate: number | null; signed: number; amount: number; declared: Record<string, number> }
export interface WeekPoint { week: string; label: string; held: number; signed: number; rate: number | null; amount: number }
export interface SourceKpi { label: string; held: number; signed: number; rate: number | null; amount: number }
export interface Kpi { closing: ClosingKpi; weekly: WeekPoint[]; closers: CloserKpi[]; setters: SetterKpi[]; sources: SourceKpi[] }

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const money = (n: number) => Math.round(n * 100) / 100;
/** Lundi (UTC) de la semaine d'une date ISO. */
export function weekOf(iso: string): string {
  const d = new Date(iso); const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

interface Held { prospect: FactProspect; at: string; closer: string | null; setter: string | null }

export function buildKpi(input: {
  prospects: FactProspect[]; appointments: FactAppointment[]; tasks: FactTask[];
  entries: Array<{ profile_id: string; day: string; metrics: Record<string, number> }>;
  members: Array<{ id: string; name: string; marketing_role: string | null }>;
  wonStages?: string[]; from: string; to: string; now?: string;
}): Kpi {
  const { from, to } = input, now = input.now ?? new Date().toISOString();
  const within = (d: string | null | undefined) => !!d && d >= from && d < to;
  const prospect = new Map(input.prospects.map((p) => [p.id, p]));
  const name = new Map(input.members.map((m) => [m.id, m.name]));
  const won = new Set(input.wonStages ?? []);
  const isSigned = (p: FactProspect) => p.outcome === "signe" || (!!p.stage_id && won.has(p.stage_id));
  const withAppt = new Set(input.appointments.map((a) => a.prospect_id));
  const closerOf = (a: FactAppointment) => a.closer_id ?? prospect.get(a.prospect_id)?.closer_id ?? null;
  const setterOf = (a: FactAppointment) => a.setter_id ?? prospect.get(a.prospect_id)?.setter_id ?? null;

  // Rendez-vous de la période.
  const appts = input.appointments.filter((a) => within(a.starts_at));
  const live = appts.filter((a) => a.status !== "annule" && a.result !== "annule" && a.result !== "reporte");

  // Appels tenus : un par prospect, daté du premier rendez-vous « présent » de la période.
  const held = new Map<string, Held>();
  for (const a of [...appts].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    const p = prospect.get(a.prospect_id); if (a.result !== "present" || !p || held.has(p.id)) continue;
    held.set(p.id, { prospect: p, at: a.starts_at, closer: closerOf(a), setter: setterOf(a) });
  }
  // Appel noté « présent » à la main, sans aucun rendez-vous enregistré : daté du dernier changement d'étape.
  const manualAbsent: FactProspect[] = [];
  for (const p of input.prospects) {
    if (withAppt.has(p.id)) continue;
    const at = p.stage_changed_at ?? p.created_at; if (!within(at)) continue;
    if (p.call_result === "present" && !held.has(p.id)) held.set(p.id, { prospect: p, at, closer: p.closer_id, setter: p.setter_id });
    else if (p.call_result === "absent") manualAbsent.push(p);
  }

  const closingOf = (rows: Held[], scheduled: FactAppointment[], absentManual: number): ClosingKpi => {
    const shown = scheduled.filter((a) => a.result === "present").length + rows.filter((h) => !withAppt.has(h.prospect.id)).length;
    const noShow = scheduled.filter((a) => a.result === "absent").length + absentManual;
    const signed = rows.filter((h) => isSigned(h.prospect));
    const amount = money(signed.reduce((s, h) => s + (Number(h.prospect.signed_amount) || 0), 0));
    return {
      scheduled: scheduled.length + rows.filter((h) => !withAppt.has(h.prospect.id)).length + absentManual,
      held: rows.length, noShow, pending: scheduled.filter((a) => a.result === "a_venir" && a.starts_at < now).length,
      showRate: pct(shown, shown + noShow), signed: signed.length,
      thinking: rows.filter((h) => !isSigned(h.prospect) && h.prospect.outcome === "en_reflexion").length,
      notSigned: rows.filter((h) => !isSigned(h.prospect) && h.prospect.outcome === "non_signe").length,
      closeRate: pct(signed.length, rows.length), amount, average: signed.length ? money(amount / signed.length) : null,
    };
  };
  const all = [...held.values()];
  const closing = closingOf(all, live, manualAbsent.length);

  // Semaine par semaine.
  const weeks = new Map<string, Held[]>();
  // Jusqu'à la semaine en cours comprise (un lundi, la semaine vient de commencer : elle compte).
  for (let w = weekOf(from), last = weekOf(new Date(Date.parse(to) - 1).toISOString()); w <= last; w = new Date(Date.parse(w) + 7 * 86_400_000).toISOString().slice(0, 10)) weeks.set(w, []);
  for (const h of all) weeks.get(weekOf(h.at))?.push(h);
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const weekly: WeekPoint[] = [...weeks.entries()].map(([week, rows]) => {
    const signed = rows.filter((h) => isSigned(h.prospect));
    return { week, label: fmt.format(new Date(week)), held: rows.length, signed: signed.length, rate: pct(signed.length, rows.length), amount: money(signed.reduce((s, h) => s + (Number(h.prospect.signed_amount) || 0), 0)) };
  });

  // Suivi quotidien déclaré, sommé sur la période.
  const declared = new Map<string, Record<string, number>>();
  for (const e of input.entries) {
    if (e.day < from.slice(0, 10) || e.day > to.slice(0, 10)) continue;
    const sum = declared.get(e.profile_id) ?? {};
    for (const [k, v] of Object.entries(e.metrics ?? {})) { const n = Number(v); if (Number.isFinite(n) && n > 0) sum[k] = (sum[k] ?? 0) + n; }
    declared.set(e.profile_id, sum);
  }

  // Closers.
  const closerIds = new Set<string>(input.members.filter((m) => m.marketing_role === "closer").map((m) => m.id));
  for (const h of all) if (h.closer) closerIds.add(h.closer);
  for (const a of live) { const c = closerOf(a); if (c) closerIds.add(c); }
  const closers: CloserKpi[] = [...closerIds].map((id) => ({
    id, name: name.get(id) ?? "Membre", declared: declared.get(id) ?? {},
    ...closingOf(all.filter((h) => h.closer === id), live.filter((a) => closerOf(a) === id), manualAbsent.filter((p) => p.closer_id === id).length),
  })).sort((a, b) => b.amount - a.amount || b.signed - a.signed || b.held - a.held || a.name.localeCompare(b.name, "fr"));

  // Setters.
  const setterIds = new Set<string>(input.members.filter((m) => m.marketing_role === "setter").map((m) => m.id));
  const bookedProspects = new Set(input.appointments.filter((a) => a.status !== "annule" && a.result !== "annule").map((a) => a.prospect_id));
  for (const p of input.prospects) if (p.setter_id && within(p.created_at)) setterIds.add(p.setter_id);
  for (const a of live) { const s = setterOf(a); if (s) setterIds.add(s); }
  const handled = new Map<string, Set<string>>();
  for (const t of input.tasks) if (t.status === "faite" && t.done_by && t.prospect_id && (t.kind === "a_appeler" || t.kind === "relance") && within(t.done_at)) { const set = handled.get(t.done_by) ?? new Set<string>(); set.add(t.prospect_id); handled.set(t.done_by, set); }
  const setters: SetterKpi[] = [...setterIds].map((id) => {
    const mine = input.prospects.filter((p) => p.setter_id === id && within(p.created_at));
    const booked = mine.filter((p) => bookedProspects.has(p.id) || p.call_result === "present").length;
    const myAppts = live.filter((a) => setterOf(a) === id), shown = myAppts.filter((a) => a.result === "present").length, noShow = myAppts.filter((a) => a.result === "absent").length;
    const signed = all.filter((h) => h.setter === id && isSigned(h.prospect));
    return { id, name: name.get(id) ?? "Membre", assigned: mine.length, booked, bookingRate: pct(booked, mine.length), handled: handled.get(id)?.size ?? 0, shown, noShow, showRate: pct(shown, shown + noShow),
      signed: signed.length, amount: money(signed.reduce((s, h) => s + (Number(h.prospect.signed_amount) || 0), 0)), declared: declared.get(id) ?? {} };
  }).sort((a, b) => b.booked - a.booked || b.assigned - a.assigned || a.name.localeCompare(b.name, "fr"));

  // Taux de closing par source.
  const bySource = new Map<string, Held[]>();
  for (const h of all) { const k = (h.prospect.source ?? "").trim() || "(source inconnue)"; bySource.set(k, [...(bySource.get(k) ?? []), h]); }
  const sources: SourceKpi[] = [...bySource.entries()].map(([label, rows]) => {
    const signed = rows.filter((h) => isSigned(h.prospect));
    return { label, held: rows.length, signed: signed.length, rate: pct(signed.length, rows.length), amount: money(signed.reduce((s, h) => s + (Number(h.prospect.signed_amount) || 0), 0)) };
  }).sort((a, b) => b.held - a.held || a.label.localeCompare(b.label, "fr"));

  return { closing, weekly, closers, setters, sources };
}

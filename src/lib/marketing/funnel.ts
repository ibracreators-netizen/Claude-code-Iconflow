/**
 * Entonnoir de l'acquisition, par page d'entrée et par campagne. Fonctions pures : elles reçoivent des faits
 * SANS coordonnées (ni nom, ni email, ni téléphone) et rendent des chiffres. Utilisées par Données marketing,
 * Publicité et le classement ; vérifiables hors ligne (scripts/funnel-selfcheck.ts).
 */
export interface FactProspect {
  id: string; created_at: string; opted_in_at: string | null; source: string | null; site: string | null; landing_page: string | null; utm: Record<string, string> | null;
  stage_id: string | null; stage_changed_at?: string | null; call_result: string | null; outcome: string | null; signed_amount: number | null; value: number | null; setter_id: string | null; closer_id: string | null;
}
export interface FactAppointment { id: string; prospect_id: string; starts_at: string; created_at: string; status: string; result: string | null; source: string | null; setter_id: string | null; closer_id: string | null }
export interface FactTask { id: string; prospect_id: string | null; kind: string; status: string; assignee_id: string | null; done_by: string | null; done_at: string | null; created_at: string }
export interface AdInsight { day: string; campaign_id: string; campaign_name: string | null; spend: number; impressions: number; clicks: number }
export interface FunnelRow {
  key: string; label: string; leads: number; booked: number; showed: number; signed: number; amount: number;
  spend: number | null; costPerLead: number | null; costPerBooking: number | null;
}
export interface Funnel { rows: FunnelRow[]; total: FunnelRow; unattributedSpend: number; hasSpend: boolean }

export const NO_CAMPAIGN = "(sans campagne)", NO_PAGE = "(page d'entrée inconnue)";
/** Règles de calcul, affichées sous les chiffres. */
export const FUNNEL_RULES = {
  leads: "Prospects dont l'opt-in (ou, à défaut, la création) tombe dans la période.",
  booked: "Parmi ces leads, ceux qui ont au moins un rendez-vous non annulé.",
  showed: "Parmi ces leads, ceux dont un rendez-vous a le résultat « présent ».",
  signed: "Parmi ces leads, ceux dont l'issue est « signé » ou qui sont à une étape « Gagné ».",
  amount: "Somme des montants signés HT de ces leads.",
  spend: "Dépense Meta Ads des campagnes sur la période.",
  costPerLead: "Dépense divisée par le nombre de leads.",
  costPerBooking: "Dépense divisée par le nombre de leads ayant un rendez-vous.",
  byPage: "Par page d'entrée, la dépense d'une campagne est répartie entre les pages au prorata des leads qu'elle y a amenés.",
} as const;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const leadDate = (p: FactProspect) => p.opted_in_at ?? p.created_at;
export const campaignOf = (p: FactProspect) => (p.utm?.utm_campaign ?? p.utm?.campaign_id ?? "").trim() || NO_CAMPAIGN;
export const pageOf = (p: FactProspect) => (p.landing_page ?? "").split("?")[0].trim() || NO_PAGE;
const ratio = (a: number | null, b: number) => (a !== null && b > 0 ? Math.round((a / b) * 100) / 100 : null);

function emptyRow(key: string, label = key): FunnelRow { return { key, label, leads: 0, booked: 0, showed: 0, signed: 0, amount: 0, spend: null, costPerLead: null, costPerBooking: null }; }

/**
 * Entonnoir sur une période [from, to[ (dates ISO). `wonStages` : identifiants des étapes « Gagné ».
 * Cohorte : chaque lead est compté une fois, à sa date d'arrivée, et suivi jusqu'où il est allé depuis.
 */
export function buildFunnel(input: { prospects: FactProspect[]; appointments: FactAppointment[]; insights?: AdInsight[]; wonStages?: string[]; from: string; to: string; by: "landing_page" | "campaign" }): Funnel {
  const won = new Set(input.wonStages ?? []);
  const cohort = input.prospects.filter((p) => { const d = leadDate(p); return d >= input.from && d < input.to; });
  const appts = new Map<string, FactAppointment[]>();
  for (const a of input.appointments) { const list = appts.get(a.prospect_id) ?? []; list.push(a); appts.set(a.prospect_id, list); }
  const labelOf = input.by === "campaign" ? campaignOf : pageOf;
  // Une campagne se reconnaît sans tenir compte de la casse (« Sprint » et « sprint » sont la même).
  const keyOf = (p: FactProspect) => (input.by === "campaign" ? norm(campaignOf(p)) : pageOf(p));

  const rows = new Map<string, FunnelRow>();
  const leadsByCampaignPage = new Map<string, Map<string, number>>();   // campagne → page → leads
  const campaignIds = new Map<string, Set<string>>();                    // campagne (nom normalisé) → identifiants Meta vus dans les UTM
  for (const p of cohort) {
    const key = keyOf(p), row = rows.get(key) ?? emptyRow(key, labelOf(p));
    const mine = appts.get(p.id) ?? [];
    row.leads++;
    if (mine.some((a) => a.status !== "annule")) row.booked++;
    if (mine.some((a) => a.result === "present") || p.call_result === "present") row.showed++;
    if (p.outcome === "signe" || (p.stage_id && won.has(p.stage_id))) { row.signed++; row.amount += Number(p.signed_amount ?? 0) || 0; }
    rows.set(key, row);
    const camp = norm(campaignOf(p)), page = pageOf(p);
    const pages = leadsByCampaignPage.get(camp) ?? new Map<string, number>(); pages.set(page, (pages.get(page) ?? 0) + 1); leadsByCampaignPage.set(camp, pages);
    if (p.utm?.campaign_id) { const ids = campaignIds.get(camp) ?? new Set<string>(); ids.add(p.utm.campaign_id); campaignIds.set(camp, ids); }
  }

  // Dépense : par campagne (nom ou identifiant Meta), puis éventuellement répartie par page d'entrée.
  const insights = (input.insights ?? []).filter((i) => i.day >= input.from.slice(0, 10) && i.day < input.to.slice(0, 10));
  const hasSpend = insights.length > 0;
  let unattributed = 0;
  if (hasSpend) {
    const spendByCampaign = new Map<string, { spend: number; label: string }>();
    for (const i of insights) {
      // Une campagne Meta est rattachée à nos leads par son nom (utm_campaign) ou par son identifiant (campaign_id dans l'URL).
      const byId = [...campaignIds.entries()].find(([, ids]) => ids.has(i.campaign_id))?.[0];
      const camp = byId ?? norm(i.campaign_name) ?? i.campaign_id;
      const cur = spendByCampaign.get(camp) ?? { spend: 0, label: i.campaign_name ?? i.campaign_id };
      cur.spend += Number(i.spend) || 0; spendByCampaign.set(camp, cur);
    }
    for (const [camp, { spend, label }] of spendByCampaign) {
      if (input.by === "campaign") {
        const row = rows.get(camp) ?? emptyRow(camp, label);        // campagne qui dépense sans lead : on la montre quand même
        row.spend = (row.spend ?? 0) + spend; rows.set(camp, row);
      } else {
        const pages = leadsByCampaignPage.get(camp), total = pages ? [...pages.values()].reduce((s, n) => s + n, 0) : 0;
        if (!pages || !total) { unattributed += spend; continue; }
        for (const [page, n] of pages) { const row = rows.get(page) ?? emptyRow(page); row.spend = (row.spend ?? 0) + (spend * n) / total; rows.set(page, row); }
      }
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100, spend: r.spend === null ? (hasSpend ? 0 : null) : Math.round(r.spend * 100) / 100 }))
    .map((r) => ({ ...r, costPerLead: ratio(r.spend, r.leads), costPerBooking: ratio(r.spend, r.booked) }))
    .sort((a, b) => b.leads - a.leads || (b.spend ?? 0) - (a.spend ?? 0) || a.label.localeCompare(b.label, "fr"));
  const total = list.reduce((t, r) => ({ ...t, leads: t.leads + r.leads, booked: t.booked + r.booked, showed: t.showed + r.showed, signed: t.signed + r.signed, amount: t.amount + r.amount, spend: hasSpend ? (t.spend ?? 0) + (r.spend ?? 0) : null }), emptyRow("total", "Total"));
  if (hasSpend) total.spend = Math.round(((total.spend ?? 0) + unattributed) * 100) / 100;
  total.amount = Math.round(total.amount * 100) / 100;
  total.costPerLead = ratio(total.spend, total.leads); total.costPerBooking = ratio(total.spend, total.booked);
  return { rows: list, total, unattributedSpend: Math.round(unattributed * 100) / 100, hasSpend };
}

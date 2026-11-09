import "server-only";
/**
 * Agrégations du tableau de bord Marketing — fonction PURE, partagée par les deux
 * magasins (Supabase et démo). N'invente aucune donnée : tout vient des prospects,
 * rendez-vous et événements réels fournis en entrée.
 *
 * Honnêteté de l'entonnoir : les étapes « Opt-ins » et « RDV pris » reposent sur des
 * horodatages réels (opted_in_at, rendez-vous existants). L'étape « Convertis » ne
 * compte QUE les conversions attestées par un événement de statut horodaté ; tant
 * qu'aucun événement n'existe, `conversionMeasured` est faux et l'UI s'appuie sur la
 * répartition par statut sans parler de « taux de conversion ».
 */
import {
  PROSPECT_STATUS, type Appointment, type Breakdown, type FunnelStage,
  type MarketingDashboard, type Prospect, type ProspectEvent, type ProspectStatus, type TimePoint,
} from "./types";

const DAY = 86400000;
const fmtDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
function startOfUTCDay(d: Date) { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; }
function mondayOf(d: Date) { const x = startOfUTCDay(d); const wd = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - wd); return x; }

function breakdown(values: (string | null | undefined)[]): Breakdown[] {
  const m = new Map<string, number>();
  for (const v of values) { const key = (v && String(v).trim()) || ""; if (!key) continue; m.set(key, (m.get(key) ?? 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function buildDashboard(input: { prospects: Prospect[]; appointments: Appointment[]; events: ProspectEvent[]; periodDays: number; now: Date }): MarketingDashboard {
  const { prospects, appointments, events, periodDays, now } = input;
  const since = new Date(now.getTime() - periodDays * DAY);
  const tomorrow = startOfUTCDay(new Date(now.getTime() + DAY));

  // ── Opt-ins par jour sur la période (séries complètes, zéros inclus) ──
  const optByDay = new Map<string, number>();
  for (const p of prospects) {
    if (!p.opted_in_at) continue;
    const d = new Date(p.opted_in_at);
    if (d >= since && d <= now) { const k = dayKey(startOfUTCDay(d)); optByDay.set(k, (optByDay.get(k) ?? 0) + 1); }
  }
  const optins: TimePoint[] = [];
  for (let t = startOfUTCDay(since).getTime(); t <= now.getTime(); t += DAY) {
    const d = new Date(t); const k = dayKey(d);
    optins.push({ date: k, label: fmtDay.format(d), count: optByDay.get(k) ?? 0 });
  }

  // ── Répartition instantanée par statut (toujours disponible) ──
  const statusDistribution: Breakdown[] = (Object.keys(PROSPECT_STATUS) as ProspectStatus[])
    .map((s) => ({ key: s, label: PROSPECT_STATUS[s], count: prospects.filter((p) => p.status === s).length }));

  // ── Entonnoir par cohorte : prospects opted-in sur la période ──
  const cohort = prospects.filter((p) => p.opted_in_at && new Date(p.opted_in_at) >= since && new Date(p.opted_in_at) <= now);
  const apptProspectIds = new Set(appointments.map((a) => a.prospect_id));
  const booked = cohort.filter((p) => apptProspectIds.has(p.id)).length;
  const convertedIds = new Set(
    events.filter((e) => e.kind === "statut" && (e.data as { to?: string } | null)?.to === "converti").map((e) => e.prospect_id),
  );
  const converted = cohort.filter((p) => convertedIds.has(p.id)).length;
  const conversionMeasured = events.some((e) => e.kind === "statut");
  const funnel: FunnelStage[] = [
    { key: "optin", label: "Opt-ins", count: cohort.length, measured: true },
    { key: "rdv", label: "RDV pris", count: booked, measured: true },
    { key: "converti", label: "Convertis", count: converted, measured: conversionMeasured },
  ];

  // ── Répartitions par source / marque / campagne UTM (tout le pipeline) ──
  const sources = breakdown(prospects.map((p) => p.source));
  const marques = breakdown(prospects.map((p) => p.marque));
  const campaigns = breakdown(prospects.map((p) => (p.utm ? (p.utm.utm_campaign ?? p.utm.campaign ?? null) : null)));

  // ── RDV confirmés à venir, par semaine (8 semaines) ──
  const byWeek = new Map<string, number>();
  for (const a of appointments) {
    if (a.status !== "confirme" || new Date(a.starts_at) < now) continue;
    const k = dayKey(mondayOf(new Date(a.starts_at)));
    byWeek.set(k, (byWeek.get(k) ?? 0) + 1);
  }
  const firstMonday = mondayOf(now);
  const upcomingByWeek: TimePoint[] = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(firstMonday.getTime() + i * 7 * DAY); const k = dayKey(d);
    return { date: k, label: fmtDay.format(d), count: byWeek.get(k) ?? 0 };
  });

  const upcoming = appointments.filter((a) => a.status === "confirme" && new Date(a.starts_at) >= now).length;
  const relanceToday = prospects.filter((p) => p.next_action_at && new Date(p.next_action_at) < tomorrow && p.status !== "converti" && p.status !== "perdu").length;

  return {
    periodDays, generatedAt: now.toISOString(),
    totals: { prospects: prospects.length, optins: prospects.filter((p) => p.opted_in_at).length, upcoming, relanceToday },
    optins, statusDistribution, funnel, conversionMeasured, sources, marques, campaigns, upcomingByWeek,
  };
}

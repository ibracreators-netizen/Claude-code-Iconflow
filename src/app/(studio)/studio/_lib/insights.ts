import { computeKpis, type Brief, type Invoice, type Kpis, type Livrable, type Metric, type Task, invoiceTotals } from "@/lib/data/types";

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function last30(metrics: Metric[]): Kpis { return computeKpis(metrics.filter((m) => m.period_start >= daysAgoIso(35))); }

/** Série hebdo (12 dernières semaines) spend / revenue. */
export function weeklySeries(metrics: Metric[]) {
  const byWeek = new Map<string, { spend: number; revenue: number }>();
  metrics.forEach((m) => { const w = byWeek.get(m.period_start) ?? { spend: 0, revenue: 0 }; w.spend += m.spend; w.revenue += m.revenue; byWeek.set(m.period_start, w); });
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([date, v]) => ({
    label: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(date)), spend: Math.round(v.spend), revenue: Math.round(v.revenue),
  }));
}

export function billed30(invoices: Invoice[]) {
  const since = daysAgoIso(30);
  return invoices.filter((i) => i.type === "facture" && i.status === "payee" && (i.paid_at ?? i.issue_date) >= since).reduce((a, i) => a + invoiceTotals(i).ht, 0);
}

export interface InboxCounts { briefs: Brief[]; livrables: Livrable[]; tasks: Task[]; invoices: Invoice[] }
export function toTreat(briefs: Brief[], livrables: Livrable[], tasks: Task[], invoices: Invoice[]): InboxCounts {
  const today = todayIso();
  return {
    briefs: briefs.filter((b) => b.status === "attente_ibra"),
    livrables: livrables.filter((l) => l.status === "en_controle" || l.status === "correction"),
    tasks: tasks.filter((t) => t.status !== "termine" && !!t.due_date && t.due_date <= today).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    invoices: invoices.filter((i) => i.status === "en_retard" || (i.status === "envoyee" && i.due_date < today)),
  };
}

export function nextAction(c: { id: string }, briefs: Brief[], livrables: Livrable[], tasks: Task[]) {
  if (briefs.some((b) => b.client_id === c.id && b.status === "attente_ibra")) return { label: "Contrôler un script", href: "/studio/briefs?status=attente_ibra" };
  if (livrables.some((l) => l.client_id === c.id && (l.status === "en_controle" || l.status === "correction"))) return { label: "Contrôler un livrable", href: "/studio/livrables" };
  if (briefs.some((b) => b.client_id === c.id && b.status === "attente_client")) return { label: "Relancer le client (script)", href: `/studio/messages?client=${c.id}` };
  if (livrables.some((l) => l.client_id === c.id && l.status === "attente_client")) return { label: "Relancer le client (livrable)", href: `/studio/messages?client=${c.id}` };
  const t = tasks.find((x) => x.client_id === c.id && x.status !== "termine");
  if (t) return { label: t.title, href: "/studio/taches" };
  return { label: "Rien d'urgent", href: `/studio/clients/${c.id}` };
}

/** Fenêtre « 7 prochains jours » et salutation, calculées hors composant. */
export function upcomingWindow(days = 7) { const now = Date.now(); return { from: new Date(now).toISOString(), to: new Date(now + days * 86400000).toISOString() }; }
export function greeting() { const h = new Date().getHours(); return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; }

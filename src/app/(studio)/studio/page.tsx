import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Clapperboard, FileText, Receipt, Target, TrendingUp, Wallet, CheckSquare } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { fmt } from "@/lib/utils";
import { EVENT_KIND, computeKpis } from "@/lib/data/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Stat, Table, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { ClientChip } from "@/components/shared/client-chip";
import { DashboardChart } from "./dashboard-chart";
import { billed30, daysAgoIso, last30, nextAction, toTreat, weeklySeries } from "./_lib/insights";

export const metadata = { title: "Tableau de bord" };

export default async function StudioHome() {
  const store = await requireAgency();
  const [clients, briefs, livrables, tasks, invoices, metrics, management, activity, events] = await Promise.all([
    store.clients(), store.briefs(), store.livrables(), store.tasks(), store.invoices(), store.metrics({ from: daysAgoIso(90) }), store.management(),
    store.activity({ limit: 8 }), store.events({ from: new Date().toISOString(), to: new Date(Date.now() + 7 * 86400000).toISOString() }),
  ]);
  const active = clients.filter((c) => c.status === "active" || c.status === "onboarding");
  const kpi = last30(metrics);
  const budget = active.reduce((a, c) => a + c.monthly_budget, 0);
  const todo = toTreat(briefs, livrables, tasks, invoices);
  const todoCount = todo.briefs.length + todo.livrables.length + todo.tasks.length + todo.invoices.length;
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const firstName = (store.session.profile.display_name ?? "").split(" ")[0] || "Ibra";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const treatItems = [
    { icon: FileText, label: "Scripts à contrôler", count: todo.briefs.length, href: "/studio/briefs?status=attente_ibra", tone: "warning" as const },
    { icon: Clapperboard, label: "Livrables à contrôler", count: todo.livrables.length, href: "/studio/livrables", tone: "warning" as const },
    { icon: CheckSquare, label: "Tâches en retard", count: todo.tasks.length, href: "/studio/taches", tone: "danger" as const },
    { icon: Receipt, label: "Factures en retard", count: todo.invoices.length, href: "/studio/factures?status=en_retard", tone: "danger" as const },
  ];

  return (
    <>
      <PageHeader eyebrow="Espace agence" title={`${greet}, ${firstName}.`} description={todoCount ? `${todoCount} élément${todoCount > 1 ? "s" : ""} attendent ton intervention. Le reste tourne.` : "Rien n'attend ton intervention. Tout est sous contrôle."}
        actions={<Link href="/studio/inbox" className="inline-flex h-9 items-center gap-2 rounded-md bg-surface-2 px-3.5 text-sm font-medium hairline transition hover:bg-surface-3">Voir la file <ArrowRight className="size-4" /></Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clients actifs" value={active.length} icon={Building2} hint={`${clients.filter((c) => c.status === "onboarding").length} en onboarding`} />
        <Stat label="CA facturé · 30 j" value={fmt.eur(billed30(invoices))} icon={Wallet} hint="Factures payées, HT" />
        <Stat label="Budget ads géré / mois" value={fmt.eur(budget)} icon={Target} hint={`Spend 30 j : ${fmt.eur(kpi.spend)}`} />
        <Stat label="ROAS global · 30 j" value={kpi.roas ? `${kpi.roas.toFixed(2).replace(".", ",")}x` : "—"} icon={TrendingUp} tone="accent" hint={`CPA ${kpi.cpa ? fmt.eurCents(kpi.cpa) : "—"} · Hook rate ${fmt.pct(kpi.hook_rate)}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Spend vs revenu attribué" description="12 dernières semaines, tous clients" />
            <CardBody><DashboardChart data={weeklySeries(metrics)} /></CardBody>
          </Card>

          <Card>
            <CardHeader title="Santé des clients" description="Étape, santé et prochaine action" action={<Link href="/studio/clients" className="text-[13px] font-medium text-accent-2 hover:underline">Tous les clients</Link>} />
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead><tr><Th>Client</Th><Th>Étape</Th><Th>Santé</Th><Th className="text-right">Budget</Th><Th className="text-right">ROAS 30 j</Th><Th>Prochaine action</Th></tr></thead>
                <tbody>
                  {active.map((c) => {
                    const k = computeKpis(metrics.filter((m) => m.client_id === c.id && m.period_start >= daysAgoIso(35)));
                    const stage = management.find((m) => m.client_id === c.id)?.stage ?? "onboarding";
                    const na = nextAction(c, briefs, livrables, tasks);
                    return (
                      <Tr key={c.id}>
                        <Td><ClientChip name={c.name} logo={c.logo_url} href={`/studio/clients/${c.id}`} size={24} /></Td>
                        <Td><StatusBadge kind="stage" value={stage} /></Td>
                        <Td><StatusBadge kind="health" value={c.health} /></Td>
                        <Td className="text-right tabular">{fmt.eur(c.monthly_budget)}</Td>
                        <Td className="text-right tabular">{k.roas ? `${k.roas.toFixed(2).replace(".", ",")}x` : <span className="text-muted-2">—</span>}</Td>
                        <Td><Link href={na.href} className="inline-flex items-center gap-1 text-fg-2 transition hover:text-fg">{na.label}<ArrowRight className="size-3.5 opacity-60" /></Link></Td>
                      </Tr>
                    );
                  })}
                  {!active.length ? <tr><td colSpan={6}><EmptyState compact title="Aucun client actif" description="Crée ton premier client pour démarrer." /></td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="À traiter" description={todoCount ? `${todoCount} éléments` : "File vide"} />
            <CardBody className="space-y-1.5">
              {treatItems.map((t) => (
                <Link key={t.label} href={t.href} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-surface-2">
                  <span className={`flex size-8 items-center justify-center rounded-md ${t.count ? (t.tone === "danger" ? "bg-danger/12 text-danger" : "bg-warning/12 text-warning") : "bg-surface-2 text-muted"}`}><t.icon className="size-4" /></span>
                  <span className="flex-1 text-[13.5px]">{t.label}</span>
                  <Badge tone={t.count ? t.tone : "neutral"}>{t.count}</Badge>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="7 prochains jours" action={<Link href="/studio/planning" className="text-[13px] font-medium text-accent-2 hover:underline">Planning</Link>} />
            <CardBody className="space-y-2">
              {events.length ? events.slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
                  <span className="mt-0.5 flex size-8 shrink-0 flex-col items-center justify-center rounded-md bg-surface-2 text-[10px] font-semibold uppercase leading-none text-muted hairline"><span className="text-[13px] text-fg tabular">{new Date(e.starts_at).getDate()}</span>{fmt.date(e.starts_at, { month: "short" })}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px]">{e.title}</p>
                    <p className="text-[11.5px] text-muted">{EVENT_KIND[e.kind]} · {fmt.date(e.starts_at, { hour: "2-digit", minute: "2-digit" })}{e.client_id && clientNames[e.client_id] ? ` · ${clientNames[e.client_id]}` : ""}</p>
                  </div>
                </div>
              )) : <EmptyState compact icon={CalendarDays} title="Semaine calme" description="Aucun événement planifié." />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activité récente" />
            <CardBody><Timeline items={activity} clientNames={clientNames} compact /></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

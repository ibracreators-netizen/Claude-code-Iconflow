import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Coins, Crosshair, Eye, MousePointerClick, ShoppingBag, TrendingUp } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { allowedModules, hasFullAccess } from "@/lib/permissions";
import { computeKpis, type Integration, type Metric } from "@/lib/data/types";
import { embedCheck } from "@/lib/integrations/embed";
import type { EmbedStatus } from "@/lib/integrations/dashboard-url";
import { fmt } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { ChartLegend, TrendChart } from "@/components/shared/charts";
import { FilterBar } from "../_prod/filter-bar";
import { one, type SP } from "../_prod/params";
import { daysAgoIso } from "../_lib/insights";
import { MetricsDialog, RangeSegments } from "./performance-client";
import { ClientDashboardCards, type ClientCardData } from "./_components/client-cards";
import { ClientDashboard } from "./_components/client-dashboard";

export const metadata: Metadata = { title: "Performance" };

function weekLabel(d: string) { return fmt.date(d); }

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("performance");
  const me = store.session.profile;
  const allowed = allowedModules(me);
  // L'URL du tableau de bord vit sur la fiche client : modifiable avec le module Clients ou Pipeline (comme la base).
  const canEditUrl = allowed.includes("clients") || allowed.includes("pipeline");
  // Les connexions Meta ne sont lisibles que par un administrateur à accès complet.
  const admin = hasFullAccess(me);
  const range = ["30", "90", "all"].includes(one(sp.range)) ? one(sp.range) : "90";
  const clientFilter = one(sp.client);
  const from = range === "all" ? undefined : new Date(new Date().getTime() - Number(range) * 86400000).toISOString().slice(0, 10);
  const integrationsOf = (clientId?: string) => (admin ? store.integrations(clientId) : Promise.resolve([] as Integration[]));

  /* ─── Page d'un client : tableau de bord externe en plein cadre + métriques ─── */
  if (clientFilter) {
    const client = await store.client(clientFilter);
    if (!client) notFound();
    const [metrics, livrables, integrations, embed] = await Promise.all([
      store.metrics({ from, clientId: client.id }), store.livrables({ clientId: client.id }), integrationsOf(client.id),
      client.dashboard_url ? embedCheck(client.dashboard_url) : Promise.resolve<EmbedStatus>("ok"),
    ]);
    return <ClientDashboard client={client} metrics={metrics} livrables={livrables} range={range} embed={embed} canEditUrl={canEditUrl} metaConnected={integrations.some((i) => i.provider === "meta")} />;
  }

  /* ─── Vue d'ensemble : KPI agence, courbes, tableaux de bord clients ─── */
  const [clients, metrics, livrables, integrations] = await Promise.all([store.clients(), store.metrics({ from }), store.livrables(), integrationsOf()]);
  const kpis = computeKpis(metrics);
  const half = from ? new Date(new Date(from).getTime() + (new Date().getTime() - new Date(from).getTime()) / 2).toISOString().slice(0, 10) : null;
  const prev = half ? computeKpis(metrics.filter((m) => m.period_start < half)) : null;
  const cur = half ? computeKpis(metrics.filter((m) => m.period_start >= half)) : null;
  const delta = (k: keyof ReturnType<typeof computeKpis>, lowerIsBetter = false) => {
    if (!prev || !cur || !prev[k]) return undefined;
    const d = (cur[k] - prev[k]) / prev[k];
    return { value: `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)} %`, positive: lowerIsBetter ? d < 0 : d > 0 };
  };

  const weeks = [...new Set(metrics.map((m) => m.period_start))].sort();
  const weekly = weeks.map((w) => { const k = computeKpis(metrics.filter((m) => m.period_start === w)); return { label: weekLabel(w), spend: Math.round(k.spend), revenue: Math.round(k.revenue), hook: +(k.hook_rate * 100).toFixed(1), ctr: +(k.ctr * 100).toFixed(2) }; });

  const since30 = daysAgoIso(35);
  const connected = new Set(integrations.filter((i) => i.provider === "meta").map((i) => i.client_id));
  const cards: ClientCardData[] = clients.filter((c) => c.status !== "archived").map((c) => {
    const rows = metrics.filter((m) => m.client_id === c.id);
    const k = computeKpis(rows.filter((m) => m.period_start >= since30));
    const trend = weeks.map((w) => rows.filter((m) => m.period_start === w)).filter((r) => r.length).map((r) => computeKpis(r).roas);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2)), secondHalf = trend.slice(Math.floor(trend.length / 2));
    return { client: c, k, trend, up: avg(secondHalf) >= avg(firstHalf), hasData: rows.length > 0, metaConnected: connected.has(c.id) };
  }).sort((a, b) => b.k.spend - a.k.spend || a.client.name.localeCompare(b.client.name));

  return (
    <>
      <PageHeader eyebrow="Production" title="Performance" description="Hook rate, CTR, CPA, ROAS : ce qui décide de ce qu'on scale et de ce qu'on coupe."
        actions={<><RangeSegments value={range} /><MetricsDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} livrables={livrables.map((l) => ({ id: l.id, title: l.title, client_id: l.client_id }))} /></>} />

      <FilterBar className="mb-5" filters={[{ param: "client", label: "Ouvrir un client", options: clients.filter((c) => c.status !== "archived").map((c) => ({ value: c.id, label: c.name })) }]} />

      <div className="space-y-8">
        {metrics.length === 0 ? (
          <div className="card"><EmptyState icon={BarChart3} title="Aucune métrique sur cette période" description="Saisis les chiffres hebdomadaires ou relie les comptes Meta Ads des clients depuis le tableau de bord. Aucun chiffre n'est inventé." /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Dépense publicitaire" value={fmt.eur(kpis.spend)} icon={Coins} delta={delta("spend")} hint={`${weeks.length} semaine${weeks.length > 1 ? "s" : ""}`} />
              <Stat label="CA attribué" value={fmt.eur(kpis.revenue)} icon={ShoppingBag} delta={delta("revenue")} tone="accent" />
              <Stat label="ROAS" value={`${kpis.roas.toFixed(2)}x`} icon={TrendingUp} delta={delta("roas")} tone={kpis.roas >= 3 ? "accent" : kpis.roas >= 2 ? "neutral" : "warning"} hint="Objectif agence : ≥ 3x" />
              <Stat label="CPA" value={fmt.eurCents(kpis.cpa)} icon={Crosshair} delta={delta("cpa", true)} hint={`${fmt.num(kpis.purchases)} achats`} />
              <Stat label="Hook rate" value={fmt.pct(kpis.hook_rate)} icon={Eye} delta={delta("hook_rate")} hint="Thruplays 3 s / impressions" />
              <Stat label="CTR" value={fmt.pct(kpis.ctr)} icon={MousePointerClick} delta={delta("ctr")} />
              <Stat label="CPM" value={fmt.eurCents(kpis.cpm)} delta={delta("cpm", true)} />
              <Stat label="Impressions" value={fmt.compact(kpis.impressions)} hint={`${fmt.compact(kpis.clicks)} clics`} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Dépense et CA attribué" description="Par semaine" action={<ChartLegend series={[{ key: "spend", label: "Dépense" }, { key: "revenue", label: "CA attribué" }]} />} />
                <CardBody><TrendChart data={weekly} series={[{ key: "spend", label: "Dépense" }, { key: "revenue", label: "CA attribué" }]} format="eurCompact" /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Hook rate" description="% d'impressions regardées 3 s · par semaine" />
                <CardBody><TrendChart data={weekly} series={[{ key: "hook", label: "Hook rate" }]} kind="line" format="pctRaw" /></CardBody>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title="CTR" description="Clics / impressions · par semaine" />
                <CardBody><TrendChart data={weekly} series={[{ key: "ctr", label: "CTR" }]} kind="bar" height={180} format="pctRaw" /></CardBody>
              </Card>
            </div>
          </div>
        )}

        <section aria-labelledby="dashboards-title">
          <div className="mb-4">
            <h2 id="dashboards-title" className="text-[19px] font-semibold tracking-tight">Tableaux de bord clients</h2>
            <p className="mt-0.5 text-[13px] text-muted">KPI des 30 derniers jours, tendance du ROAS et tableau de bord externe de chaque client. Ouvre une carte pour l&apos;afficher en plein cadre.</p>
          </div>
          {cards.length ? <ClientDashboardCards items={cards} /> : <div className="card"><EmptyState icon={BarChart3} title="Aucun client actif" description="Crée un client pour suivre ses résultats ici." /></div>}
        </section>

        <p className="text-[12px] text-muted">Métriques saisies à la main ou synchronisées chaque nuit depuis Meta Ads : les comptes se relient depuis le <Link href="/studio" className="underline underline-offset-2">tableau de bord</Link> (carte « Connexions Meta Ads », administrateurs).</p>
      </div>
    </>
  );
}

export type { Metric };

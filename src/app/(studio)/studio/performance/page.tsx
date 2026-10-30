import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Coins, Crosshair, Eye, MousePointerClick, ShoppingBag, TrendingUp } from "lucide-react";
import { requireAgency } from "@/lib/auth/session";
import { computeKpis, type Metric } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat, Table, Td, Th, Tr } from "@/components/ui/misc";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientChip } from "@/components/shared/client-chip";
import { ChartLegend, Sparkline, TrendChart } from "@/components/shared/charts";
import { FilterBar } from "../_prod/filter-bar";
import { one, type SP } from "../_prod/params";
import { MetricsDialog, RangeSegments } from "./performance-client";

export const metadata: Metadata = { title: "Performance" };

function weekLabel(d: string) { return fmt.date(d); }

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await requireAgency("performance");
  const range = ["30", "90", "all"].includes(one(sp.range)) ? one(sp.range) : "90";
  const clientFilter = one(sp.client);
  const from = range === "all" ? undefined : new Date(new Date().getTime() - Number(range) * 86400000).toISOString().slice(0, 10);
  const [clients, metrics, livrables] = await Promise.all([store.clients(), store.metrics({ from, clientId: clientFilter || undefined }), store.livrables()]);
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

  const perClient = clients.map((c) => {
    const rows = metrics.filter((m) => m.client_id === c.id);
    if (!rows.length) return null;
    const k = computeKpis(rows);
    const trend = weeks.map((w) => computeKpis(rows.filter((m) => m.period_start === w)).roas);
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2)), secondHalf = trend.slice(Math.floor(trend.length / 2));
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return { client: c, k, trend, up: avg(secondHalf) >= avg(firstHalf) };
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.k.spend - a.k.spend);

  return (
    <>
      <PageHeader eyebrow="Production" title="Performance" description="Hook rate, CTR, CPA, ROAS : ce qui décide de ce qu'on scale et de ce qu'on coupe."
        actions={<><RangeSegments value={range} /><MetricsDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} livrables={livrables.map((l) => ({ id: l.id, title: l.title, client_id: l.client_id }))} /></>} />

      <FilterBar className="mb-5" filters={[{ param: "client", label: "Tous les clients", options: clients.map((c) => ({ value: c.id, label: c.name })) }]} />

      {metrics.length === 0 ? (
        <div className="card"><EmptyState icon={BarChart3} title="Aucune métrique sur cette période" description="Saisis les chiffres hebdomadaires Meta / TikTok par client (et par créative si possible). Aucun chiffre n'est inventé." /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Dépense publicitaire" value={fmt.eur(kpis.spend)} icon={Coins} delta={delta("spend")} hint={`${weeks.length} semaine${weeks.length > 1 ? "s" : ""}`} />
            <Stat label="CA attribué" value={fmt.eur(kpis.revenue)} icon={ShoppingBag} delta={delta("revenue")} tone="accent" />
            <Stat label="ROAS" value={`${kpis.roas.toFixed(2)}x`} icon={TrendingUp} delta={delta("roas")} tone={kpis.roas >= 3 ? "accent" : kpis.roas >= 2 ? "neutral" : "warning"} hint="Objectif agence : ≥ 3x" />
            <Stat label="CPA" value={fmt.eurCents(kpis.cpa)} icon={Crosshair} delta={delta("cpa", true)} hint={`${fmt.num(kpis.purchases)} achats`} />
            <Stat label="Hook rate" value={fmt.pct(kpis.hook_rate)} icon={Eye} delta={delta("hook_rate")} hint="Thruplays 3 s / impressions" />
            <Stat label="CTR" value={fmt.pct(kpis.ctr)} icon={MousePointerClick} delta={delta("ctr")} />
            <Stat label="CPM" value={fmt.eurCents(kpis.cpm)} delta={delta("cpm", true)} />
            <Stat label="Impressions" value={fmt.compact(kpis.impressions)} hint={`${fmt.compact(kpis.clicks)} clics`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
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

          <Table>
            <thead><tr><Th>Client</Th><Th className="text-right">Dépense</Th><Th className="text-right">Achats</Th><Th className="text-right">CPA</Th><Th className="text-right">ROAS</Th><Th className="text-right">Hook rate</Th><Th>Tendance ROAS</Th><Th>Santé</Th></tr></thead>
            <tbody>
              {perClient.map(({ client, k, trend, up }) => (
                <Tr key={client.id}>
                  <Td><ClientChip name={client.name} logo={client.logo_url} href={`/studio/clients/${client.id}`} size={24} /></Td>
                  <Td className="text-right tabular">{fmt.eur(k.spend)}</Td>
                  <Td className="text-right tabular">{fmt.num(k.purchases)}</Td>
                  <Td className="text-right tabular">{fmt.eurCents(k.cpa)}</Td>
                  <Td className={`text-right font-medium tabular ${k.roas >= 3 ? "text-success" : k.roas < 2 ? "text-danger" : ""}`}>{k.roas.toFixed(2)}x</Td>
                  <Td className="text-right tabular">{fmt.pct(k.hook_rate)}</Td>
                  <Td><Sparkline values={trend} positive={up} /></Td>
                  <Td><StatusBadge kind="health" value={client.health} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="text-[12px] text-muted">Données saisies manuellement par l&apos;agence. <Link href="/studio/parametres" className="underline underline-offset-2">Connexion Meta Ads</Link> à venir.</p>
        </div>
      )}
    </>
  );
}

export type { Metric };

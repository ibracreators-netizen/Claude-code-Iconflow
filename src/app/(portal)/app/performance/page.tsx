import Link from "next/link";
import { LineChart } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { computeKpis } from "@/lib/data/types";
import { fmt } from "@/lib/utils";
import { PageHeader, EmptyState, Table, Th, Td, Tr } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { TrendChart, ChartLegend } from "@/components/shared/charts";
import { KpiGrid } from "../_components/kpis";
import { KindFilter } from "../_components/kind-filter";

export const metadata = { title: "Performance" };

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range = (["30", "90", "all"].includes(r ?? "") ? r : "90") as "30" | "90" | "all";
  const store = await requireClient();
  const from = range === "all" ? undefined : daysAgo(Number(range));
  const [metrics, livrables] = await Promise.all([store.metrics({ clientId: store.clientId, from }), store.livrables({ clientId: store.clientId })]);
  const k = computeKpis(metrics);
  const weekly = Object.values(metrics.reduce<Record<string, { label: string; spend: number; revenue: number; impressions: number; thruplays: number }>>((acc, m) => {
    const key = m.period_start; const a = acc[key] ?? { label: fmt.date(m.period_start), spend: 0, revenue: 0, impressions: 0, thruplays: 0 };
    a.spend += m.spend; a.revenue += m.revenue; a.impressions += m.impressions; a.thruplays += m.thruplays_3s; acc[key] = a; return acc;
  }, {})).map((w) => ({ ...w, hook: w.impressions ? Math.round((w.thruplays / w.impressions) * 1000) / 10 : 0 }));
  const byLivrable = livrables.map((l) => ({ l, k: computeKpis(metrics.filter((m) => m.livrable_id === l.id)) })).filter((x) => x.k.spend > 0).sort((a, b) => b.k.spend - a.k.spend);
  const money = [{ key: "spend", label: "Budget investi" }, { key: "revenue", label: "Chiffre d'affaires attribué" }];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Résultats" title="Performance" description="Les chiffres de vos campagnes, en toute transparence : budget, ventes attribuées, coût par vente et retour sur dépense."
        actions={<KindFilter param="range" value={range} options={[{ value: "30", label: "30 jours" }, { value: "90", label: "90 jours" }, { value: "all", label: "Tout" }]} />} />
      {!metrics.length ? <div className="card"><EmptyState icon={LineChart} title="Pas encore de données" description="Vos données de performance apparaîtront ici dès la première campagne diffusée." /></div> : (
        <>
          <KpiGrid k={k} />
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3"><CardHeader title="Budget et chiffre d'affaires" description="Par semaine" action={<ChartLegend series={money} />} /><CardBody><TrendChart data={weekly} series={money} format="eurCompact" /></CardBody></Card>
            <Card className="lg:col-span-2"><CardHeader title="Hook rate" description="Part des vues qui dépassent 3 secondes" /><CardBody><TrendChart data={weekly} series={[{ key: "hook", label: "Hook rate" }]} kind="line" format="pctRaw" /></CardBody></Card>
          </div>
          {byLivrable.length ? (
            <Table>
              <thead><tr><Th>Créative</Th><Th className="text-right">Budget</Th><Th className="text-right">Ventes</Th><Th className="text-right">CPA</Th><Th className="text-right">ROAS</Th><Th className="text-right">Hook rate</Th></tr></thead>
              <tbody>{byLivrable.map(({ l, k }) => (
                <Tr key={l.id}><Td><Link href={`/app/livrables/${l.id}`} className="font-medium hover:underline underline-offset-4">{l.title}</Link></Td><Td className="text-right tabular">{fmt.eur(k.spend)}</Td><Td className="text-right tabular">{fmt.num(k.purchases)}</Td><Td className="text-right tabular">{k.cpa ? fmt.eurCents(k.cpa) : "—"}</Td><Td className="text-right tabular">{k.roas ? `${k.roas.toFixed(2)}x` : "—"}</Td><Td className="text-right tabular">{fmt.pct(k.hook_rate)}</Td></Tr>
              ))}</tbody>
            </Table>
          ) : null}
        </>
      )}
    </div>
  );
}

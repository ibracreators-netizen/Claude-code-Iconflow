"use client";
import { ChartLegend, TrendChart } from "@/components/shared/charts";

const series = [{ key: "spend", label: "Spend" }, { key: "revenue", label: "Revenu attribué" }];

export function DashboardChart({ data }: { data: Array<{ label: string; spend: number; revenue: number }> }) {
  if (!data.length) return <p className="py-10 text-center text-[13px] text-muted">Pas encore de métriques. Elles apparaîtront dès les premières remontées Meta.</p>;
  return (
    <div className="space-y-3">
      <ChartLegend series={series} />
      <TrendChart data={data} series={series} height={240} format="eurCompact" />
    </div>
  );
}

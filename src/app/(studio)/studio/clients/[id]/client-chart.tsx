"use client";
import { ChartLegend, TrendChart } from "@/components/shared/charts";
const series = [{ key: "spend", label: "Spend" }, { key: "revenue", label: "Revenu attribué" }];
export function ClientChart({ data }: { data: Array<{ label: string; spend: number; revenue: number }> }) {
  if (!data.length) return <p className="py-10 text-center text-[13px] text-muted">Aucune métrique remontée pour ce client.</p>;
  return <div className="space-y-3"><ChartLegend series={series} /><TrendChart data={data} series={series} height={220} format="eurCompact" /></div>;
}

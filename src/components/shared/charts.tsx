"use client";
/**
 * Graphiques (Recharts) alignés sur le design system.
 * Règles : un seul axe, marques fines, grille discrète, tooltip au survol,
 * texte en couleurs de texte (jamais la couleur de série), palette catégorielle validée.
 */
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/lib/hooks/use-local-pref";

/** Ordre catégoriel fixe (validé CVD/contraste pour chaque surface). */
export const SERIES_DARK = ["#2fa955", "#3a7fd0", "#c47f1e", "#9068d6"];
export const SERIES_LIGHT = ["#1f9d55", "#2b6fd6", "#b8740f", "#b0438f"];
export function useSeriesColors() { const [theme] = useTheme(); return theme === "dark" ? SERIES_DARK : SERIES_LIGHT; }

const axis = { fontSize: 11, fill: "var(--muted)" } as const;

function Tip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; format: (v: number, key?: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12px] shadow-pop">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-fg-2"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}<span className="ml-auto pl-4 font-medium tabular text-fg">{format(p.value, p.name)}</span></div>
      ))}
    </div>
  );
}

export interface SeriesDef { key: string; label: string }

export function TrendChart({ data, series, xKey = "label", height = 240, format = (v: number) => String(v), kind = "area", stacked }: {
  data: Array<Record<string, number | string>>; series: SeriesDef[]; xKey?: string; height?: number; format?: (v: number, key?: string) => string; kind?: "area" | "line" | "bar"; stacked?: boolean;
}) {
  const colors = useSeriesColors();
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />;
  const x = <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />;
  const y = <YAxis tick={axis} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => format(Number(v))} />;
  const tip = <Tooltip cursor={{ stroke: "var(--border-strong)", fill: "var(--surface-2)", opacity: 0.6 }} content={(p) => <Tip active={p.active} payload={p.payload as never} label={String(p.label ?? "")} format={(v, k) => format(v, series.find((s) => s.label === k)?.key)} />} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "bar" ? (
        <BarChart {...common} barCategoryGap="28%">{grid}{x}{y}{tip}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} stroke="var(--surface)" strokeWidth={stacked ? 2 : 0} />)}
        </BarChart>
      ) : kind === "line" ? (
        <LineChart {...common}>{grid}{x}{y}{tip}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />)}
        </LineChart>
      ) : (
        <AreaChart {...common}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.28} /><stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {grid}{x}{y}{tip}
          {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} fill={`url(#grad-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} stackId={stacked ? "a" : undefined} />)}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

/** Légende textuelle (obligatoire dès 2 séries). */
export function ChartLegend({ series }: { series: SeriesDef[] }) {
  const colors = useSeriesColors();
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-2">
      {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: colors[i % colors.length] }} />{s.label}</li>)}
    </ul>
  );
}

export function Sparkline({ values, height = 36, width = 120, positive }: { values: number[]; height?: number; width?: number; positive?: boolean }) {
  const colors = useSeriesColors();
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`).join(" ");
  const color = positive === undefined ? colors[0] : positive ? "var(--color-success)" : "var(--color-danger)";
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible"><polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts} /></svg>;
}

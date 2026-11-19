"use client";
import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Graphique des pages chiffrées de Marketing : la série principale prend le vert de l'app (var(--accent)),
 * une série de comparaison est grise (var(--muted-2)) ; grille très légère, sans fond, axes en gris.
 * Enveloppe propre à Marketing : le graphique commun (partagé avec Studio) garde ses couleurs.
 */

export interface MkSeries { key: string; label: string; muted?: boolean }
export type MkFormat = "num" | "pctRaw";
const FORMATS: Record<MkFormat, (v: number) => string> = {
  num: (v) => new Intl.NumberFormat("fr-FR").format(v),
  pctRaw: (v) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v)}\u202f%`,
};
const colorOf = (s: MkSeries) => (s.muted ? "var(--muted-2)" : "var(--accent)");
/** Graduations rondes de 0 au maximum (au plus 4 intervalles) : l'axe s'arrête juste au-dessus de la plus haute valeur. */
function niceTicks(max: number, integer: boolean): number[] {
  if (!(max > 0)) return integer ? [0, 1] : [0, 50, 100];
  const raw = max / 4, pow = 10 ** Math.floor(Math.log10(raw));
  const steps = (integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map((m) => m * pow);
  const step = integer ? Math.max(1, Math.ceil(steps.find((x) => x >= raw) ?? 10 * pow)) : steps.find((x) => x >= raw) ?? 10 * pow;
  const n = Math.max(1, Math.ceil(max / step - 1e-9));
  return Array.from({ length: n + 1 }, (_, i) => Number((i * step).toFixed(6)));
}
const tick = { fontSize: 12, fill: "var(--mk-sub)" } as const;

function Tip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ name: string; value: number | null; color: string }>; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-[8px] border border-mk-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <p className="mb-1 font-medium text-mk-strong">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-mk-text">
          <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}
          <span className="ml-auto pl-4 font-semibold text-mk-strong tabular-nums">{p.value === null || p.value === undefined ? "—" : format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function MkChart({ data, series, kind = "area", height = 240, format = "num", xKey = "label" }: {
  /** Une valeur `null` (pas de base, ex. semaine sans appel) laisse un vide plutôt qu'un zéro. */
  data: Array<Record<string, number | string | null>>; series: MkSeries[]; kind?: "area" | "line" | "bar"; height?: number; format?: MkFormat; xKey?: string;
}) {
  const fmt = FORMATS[format];
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const ticks = niceTicks(max, format === "num");
  const common = { data, margin: { top: 8, right: 4, bottom: 0, left: -6 } };
  const grid = <CartesianGrid vertical={false} stroke="var(--mk-line)" />;
  const x = <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} minTickGap={18} tickMargin={8} />;
  const y = <YAxis tick={tick} axisLine={false} tickLine={false} width={Math.max(34, Math.max(...ticks.map((t) => fmt(t).length)) * 7 + 14)} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0} tickFormatter={(v) => fmt(Number(v))} />;
  const tip = (
    <Tooltip cursor={kind === "bar" ? { fill: "var(--surface-2)" } : { stroke: "var(--mk-input)", strokeDasharray: "3 3" }}
      content={(p) => <Tip active={p.active} payload={p.payload as never} label={String(p.label ?? "")} format={fmt} />} />
  );
  const dot = { r: 4, strokeWidth: 2, stroke: "var(--surface)" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "bar" ? (
        <BarChart {...common} barCategoryGap="28%" barGap={4}>{grid}{x}{y}{tip}
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={colorOf(s)} radius={[4, 4, 0, 0]} maxBarSize={30} />)}
        </BarChart>
      ) : kind === "line" ? (
        <LineChart {...common}>{grid}{x}{y}{tip}
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorOf(s)} strokeWidth={2.25} dot={{ r: 3, strokeWidth: 0, fill: colorOf(s) }} activeDot={{ ...dot, fill: colorOf(s) }} />)}
        </LineChart>
      ) : (
        <AreaChart {...common}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: colorOf(s), stopOpacity: 0.2 }} /><stop offset="100%" style={{ stopColor: colorOf(s), stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          {grid}{x}{y}{tip}
          {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorOf(s)} strokeWidth={2.25} fill={`url(#${uid}-${s.key})`} dot={false} activeDot={{ ...dot, fill: colorOf(s) }} />)}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

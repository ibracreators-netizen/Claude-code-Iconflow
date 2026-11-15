"use client";
import * as React from "react";
import { useSeriesColors } from "@/components/shared/charts";
import type { OptinStack, StackBucket } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

const OTHER = "__autres";
const PLOT_H = 248;
const niceMax = (n: number) => { const steps = [4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 80, 100, 150, 200, 300, 500, 1000]; return steps.find((s) => s >= n) ?? Math.ceil(n / 500) * 500; };

/**
 * Opt-ins empilés par source. Couleur = identité de la source (ordre fixe, « Autres » en neutre),
 * écart de 2 px entre segments, grille discrète, repère « meilleur jour », infobulle au survol/focus.
 * Le texte reste en couleurs de texte ; la pastille porte l'identité.
 */
export function OptinStackChart({ stack }: { stack: OptinStack }) {
  const palette = useSeriesColors();
  const colorOf = React.useCallback((key: string) => (key === OTHER ? "var(--muted-2)" : palette[stack.keys.filter((k) => k.key !== OTHER).findIndex((k) => k.key === key) % palette.length]), [palette, stack.keys]);
  const [hover, setHover] = React.useState<number | null>(null);
  // Marge de 30 % au-dessus de la plus haute barre : le repère « meilleur jour » reste dans le tracé.
  const max = niceMax(Math.max(1, ...stack.buckets.map((b) => b.total)) * 1.3);
  const intervals = max % 4 === 0 ? 4 : max % 3 === 0 ? 3 : 5;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => (max / intervals) * i);
  const n = stack.buckets.length;
  const labelEvery = stack.bucket === "week" ? 1 : 7;
  const unit = stack.bucket === "week" ? "semaine" : "jour";
  const total = stack.buckets.reduce((s, b) => s + b.total, 0);
  const active: StackBucket | null = hover === null ? null : stack.buckets[hover];

  return (
    <div>
      <div className="relative rounded-[18px] border border-border bg-surface-2/60 px-3 pb-2 pt-4 sm:px-5">
        <div className="relative" style={{ height: PLOT_H }}>
          {/* Grille : pointillé de fond + lignes horizontales graduées */}
          <div className="pointer-events-none absolute inset-0 ml-8 opacity-70 [background-image:radial-gradient(circle,var(--border-strong)_1px,transparent_1px)] [background-size:16px_16px]" aria-hidden />
          {ticks.map((t) => (
            <div key={t} className="pointer-events-none absolute inset-x-0 flex items-center" style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }} aria-hidden>
              <span className="w-8 shrink-0 pr-2 text-right font-mono text-[10.5px] tabular text-muted">{t}</span>
              <span className={cn("h-px flex-1", t === 0 ? "bg-border-strong" : "border-t border-dashed border-border-strong/70")} />
            </div>
          ))}
          {/* Barres */}
          <div className="absolute inset-y-0 left-8 right-0 flex items-end" role="list" aria-label={`Opt-ins par ${unit} et par source`}>
            {stack.buckets.map((b, i) => {
              const isBest = !!stack.best && stack.best.date === b.date && b.total > 0;
              const parts = stack.keys.filter((k) => (b.values[k.key] ?? 0) > 0);
              return (
                <div key={b.date} role="listitem" tabIndex={0} aria-label={`${b.label} : ${b.total} opt-in${b.total > 1 ? "s" : ""}${parts.length ? ` (${parts.map((k) => `${k.label} ${b.values[k.key]}`).join(", ")})` : ""}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))} onFocus={() => setHover(i)} onBlur={() => setHover((h) => (h === i ? null : h))}
                  className={cn("group relative flex h-full flex-1 cursor-default flex-col items-center justify-end outline-none", hover === i && "bg-fg/[0.035]", "rounded-t-[8px] focus-visible:ring-2 focus-visible:ring-accent/40")}>
                  {isBest && hover !== i ? (
                    <div className={cn("pointer-events-none absolute z-10 flex flex-col whitespace-nowrap pb-1.5", i / n > 0.88 ? "right-0 items-end" : i / n < 0.08 ? "left-0 items-start" : "left-1/2 -translate-x-1/2 items-center")} style={{ bottom: `${(b.total / max) * 100}%` }}>
                      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-fg-2 shadow-soft"><span className="size-1.5 rounded-full bg-accent-2" />{stack.bucket === "week" ? "Meilleure semaine" : "Meilleur jour"}</span>
                      <span className="text-[11.5px] font-semibold tabular text-fg">{b.total} opt-ins</span>
                    </div>
                  ) : null}
                  <div className="flex w-full max-w-[40px] flex-col-reverse gap-[2px] px-[3px]" style={{ height: `${(b.total / max) * 100}%` }}>
                    {parts.map((k, pi) => (
                      <span key={k.key} className={cn("block w-full", pi === parts.length - 1 && "rounded-t-[5px]")} style={{ flexGrow: b.values[k.key], flexBasis: 0, background: colorOf(k.key) }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Infobulle */}
          {active && hover !== null ? (() => {
            const x = `calc(32px + (100% - 32px) * ${(hover + 0.5) / n})`;
            const tall = active.total / max > 0.42, rightHalf = hover / n > 0.5;
            const style: React.CSSProperties = tall
              ? { left: x, top: 6, transform: rightHalf ? "translateX(calc(-100% - 28px))" : "translateX(28px)" }
              : { left: x, bottom: `calc(${(active.total / max) * 100}% + 10px)`, transform: `translateX(${hover / n > 0.8 ? "-90%" : hover / n < 0.15 ? "-10%" : "-50%"})` };
            return (
              <div className="pointer-events-none absolute z-20 w-[224px] rounded-xl border border-border bg-surface px-3 py-2.5 text-[12px] shadow-pop" style={style}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 whitespace-nowrap"><span className="font-medium text-fg">{stack.bucket === "week" ? `Sem. du ${active.label}` : active.label}</span><span className="tabular text-muted">{active.total} opt-in{active.total > 1 ? "s" : ""}</span></div>
                {active.total === 0 ? <div className="text-muted">Aucun opt-in.</div> : stack.keys.filter((k) => (active.values[k.key] ?? 0) > 0).map((k) => (
                  <div key={k.key} className="flex items-center gap-2 py-0.5 text-fg-2"><span className="size-2 shrink-0 rounded-[3px]" style={{ background: colorOf(k.key) }} /><span className="truncate">{k.label}</span><span className="ml-auto pl-3 font-medium tabular text-fg">{active.values[k.key]}</span></div>
                ))}
              </div>
            );
          })() : null}
        </div>
        {/* Axe des dates */}
        <div className="ml-8 mt-2 flex" aria-hidden>
          {stack.buckets.map((b, i) => <span key={b.date} className="flex-1 overflow-visible whitespace-nowrap text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{(n - 1 - i) % labelEvery === 0 ? b.label : ""}</span>)}
        </div>
      </div>

      {/* Légende : toujours présente, avec le décompte de la période */}
      <ul className="mt-3 flex flex-wrap gap-2">
        {stack.keys.map((k) => (
          <li key={k.key} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-fg-2 shadow-soft">
            <span className="size-2 rounded-[3px]" style={{ background: colorOf(k.key) }} />{k.label}<span className="font-semibold tabular text-fg">{k.count}</span>
          </li>
        ))}
        <li className="inline-flex items-center px-1 text-[12.5px] text-muted">Total {total}</li>
      </ul>

      {/* Vue tableau (lecteurs d'écran) */}
      <table className="sr-only">
        <caption>Opt-ins par {unit} et par source</caption>
        <thead><tr><th>{stack.bucket === "week" ? "Semaine du" : "Jour"}</th>{stack.keys.map((k) => <th key={k.key}>{k.label}</th>)}<th>Total</th></tr></thead>
        <tbody>{stack.buckets.map((b) => <tr key={b.date}><td>{b.label}</td>{stack.keys.map((k) => <td key={k.key}>{b.values[k.key] ?? 0}</td>)}<td>{b.total}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

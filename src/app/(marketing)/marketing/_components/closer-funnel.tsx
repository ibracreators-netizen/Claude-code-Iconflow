import { closerFunnel, closerLosses, CLOSER_RULES, type CloserTotals } from "@/lib/marketing/closer-report";
import { cn } from "@/lib/utils";
import { Panel, PanelEmpty, RuleLabel } from "./dash-ui";

/*
 * Rapport des closers, partagé par KPI › Closers et le Tableau de bord : l'entonnoir des appels (prévus → show-up →
 * pitchs → closes) et ce qui n'a pas abouti (no-show, annulés, non qualifiés, en réflexion). Sans « use client ».
 * Couleurs : jetons seulement ; le volume en gris, les étapes en vert de plus en plus franc.
 */

const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")} %`);
const STEP_TONE = ["bg-muted-2", "bg-accent/45", "bg-accent/70", "bg-accent"];
const STEP_RULE: Record<string, string> = {
  show_up: "Show-up ÷ appels prévus.",
  pitchs: CLOSER_RULES.pitchRate,
  closes: CLOSER_RULES.pitchClose,
};

/** Barres horizontales : appels prévus → show-up → pitchs → closes, avec le nombre et la part de l'étape précédente. */
export function CloserFunnel({ totals, className }: { totals: CloserTotals; className?: string }) {
  const steps = closerFunnel(totals), max = Math.max(...steps.map((s) => s.count));
  return (
    <Panel className={className} title="Entonnoir des appels" sub="Du rendez-vous prévu à la vente, sur la période.">
      {max === 0 ? <PanelEmpty className="py-8">Aucun rendez-vous saisi sur la période.</PanelEmpty> : (
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.key}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                <span className="font-medium text-mk-text">{s.label}</span>
                <span className="text-mk-sub tabular-nums">
                  <b className="text-[15px] font-semibold text-mk-strong">{fr(s.count)}</b>
                  {s.previous ? <> · <RuleLabel rule={STEP_RULE[s.key]}>{pct(s.ofPrevious)} {s.previous}</RuleLabel></> : null}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-mk-chip" aria-hidden>
                <div className={cn("h-full rounded-full", STEP_TONE[i])} style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Ce qui n'a pas abouti : nombre et part (des prévus, des show-up ou des pitchs, selon la ligne). */
export function CloserLosses({ totals, className }: { totals: CloserTotals; className?: string }) {
  const rows = closerLosses(totals);
  return (
    <Panel className={className} title="Ce qui n'a pas abouti" sub="Les appels perdus en route, et ceux à relancer.">
      {rows.every((r) => r.count === 0) ? <PanelEmpty className="py-8">Rien sur la période.</PanelEmpty> : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
                <span className="text-mk-text">{r.label}</span>
                <span className="text-mk-sub tabular-nums"><b className="text-[15px] font-semibold text-mk-strong">{fr(r.count)}</b> · <RuleLabel rule={r.rule}>{pct(r.share)} {r.base}</RuleLabel></span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-mk-chip" aria-hidden><div className="h-full rounded-full bg-muted-2" style={{ width: `${Math.min(100, r.share ?? 0)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Les deux cartes côte à côte (l'une sous l'autre sur téléphone). */
export function CloserFunnelRow({ totals, className }: { totals: CloserTotals; className?: string }) {
  return (
    <div className={cn("grid gap-4 @min-[960px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]", className)}>
      <CloserFunnel totals={totals} />
      <CloserLosses totals={totals} />
    </div>
  );
}

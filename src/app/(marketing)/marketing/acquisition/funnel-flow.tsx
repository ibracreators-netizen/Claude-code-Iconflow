import type { FunnelStage } from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)} %`;
/** « Présents » → « présents », mais « RDV pris » reste tel quel. */
const lower = (l: string) => (/^[A-Z]{2}/.test(l) ? l : l.charAt(0).toLowerCase() + l.slice(1));
/** Le vert de l'app, de plus en plus léger d'une étape à l'autre. */
const FILL = ["bg-accent", "bg-accent/80", "bg-accent/60", "bg-accent/45"];

/**
 * Entonnoir de la cohorte en barres horizontales : la longueur de chaque barre suit le nombre de leads de l'étape
 * (base = leads de la période ; un trait minimal garde les petites valeurs visibles). Sous chaque étape, le taux de passage
 * depuis l'étape précédente et la part de la cohorte. Une étape non mesurée n'est PAS dessinée.
 */
export function FunnelFlow({ stages, periodDays }: { stages: FunnelStage[]; periodDays: number }) {
  const base = stages[0]?.count ?? 0;
  const baseLabel = lower(stages[0]?.label ?? "leads");
  const rateOf = (i: number): string => {
    const s = stages[i], prev = stages[i - 1];
    if (!s.measured) return "Non mesuré sur la période";
    if (i === 0) return "Base de la cohorte";
    const step = prev?.measured && prev.count > 0 ? `${pct(s.count, prev.count)} des ${lower(prev.label)}` : null;
    const share = base > 0 ? `${pct(s.count, base)} des ${baseLabel}` : null;
    if (i === 1 || !step) return share ?? "—";
    return share ? `${step} · ${share}` : step;
  };

  return (
    <ol className="space-y-5 lg:space-y-4" aria-label={`Entonnoir de la cohorte des ${periodDays} derniers jours`}>
      {stages.map((s, i) => {
        const width = s.measured && base > 0 && s.count > 0 ? Math.max(1.5, (s.count / base) * 100) : 0;
        return (
          <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 lg:grid-cols-[220px_minmax(0,1fr)_64px]">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-mk-strong">{s.label}</p>
              <p className="text-[13px] text-mk-sub">{rateOf(i)}</p>
            </div>
            <div className="order-last col-span-2 h-8 overflow-hidden rounded-[6px] bg-mk-chip lg:order-none lg:col-span-1 lg:h-10" aria-hidden>
              {width ? <div className={cn("h-full rounded-[6px]", FILL[i] ?? FILL[FILL.length - 1])} style={{ width: `${width}%` }} /> : null}
            </div>
            <p className="text-right text-[20px] font-semibold leading-none text-mk-strong tabular-nums">{s.measured ? fr(s.count) : "—"}</p>
          </li>
        );
      })}
    </ol>
  );
}

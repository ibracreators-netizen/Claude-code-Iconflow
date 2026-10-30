import { Activity, ShoppingBag, Target, TrendingUp, Wallet, MousePointerClick } from "lucide-react";
import { Stat } from "@/components/ui/misc";
import type { Kpis } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

export function KpiGrid({ k, compact }: { k: Kpis; compact?: boolean }) {
  const items = [
    { label: "Budget investi", value: fmt.eur(k.spend), icon: Wallet, tone: "neutral" as const },
    { label: "Ventes attribuées", value: fmt.num(k.purchases), icon: ShoppingBag, tone: "neutral" as const },
    { label: "Coût par vente (CPA)", value: k.cpa ? fmt.eurCents(k.cpa) : "—", icon: Target, tone: "accent" as const },
    { label: "Retour sur dépense (ROAS)", value: k.roas ? `${k.roas.toFixed(2)}x` : "—", icon: TrendingUp, tone: "accent" as const },
    { label: "Hook rate", value: fmt.pct(k.hook_rate), icon: Activity, tone: "neutral" as const, hint: "Part des vues qui dépassent 3 secondes" },
    { label: "Taux de clic", value: fmt.pct(k.ctr), icon: MousePointerClick, tone: "neutral" as const },
  ];
  const shown = compact ? items.slice(0, 4) : items;
  return <div className={`grid gap-3 ${compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>{shown.map((i) => <Stat key={i.label} {...i} />)}</div>;
}

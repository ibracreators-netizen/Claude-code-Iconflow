import Link from "next/link";
import { ArrowRight, LayoutDashboard, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/shared/charts";
import { StatusBadge } from "@/components/shared/status-badge";
import { dashboardProvider } from "@/lib/integrations/dashboard-url";
import type { Client, Kpis } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

export interface ClientCardData { client: Client; k: Kpis; trend: number[]; up: boolean; hasData: boolean; metaConnected: boolean }

const roas = (v: number) => (v ? `${v.toFixed(2).replace(".", ",")}x` : "—");

/** Une carte par client : KPI des 30 derniers jours, tendance du ROAS et tableau de bord externe. */
export function ClientDashboardCards({ items }: { items: ClientCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ client, k, trend, up, hasData, metaConnected }) => (
        <Link key={client.id} href={`/studio/performance?client=${client.id}`} className="card group flex flex-col p-5 transition hover:border-border-strong hover:shadow-pop">
          <div className="flex items-start gap-3">
            <Avatar name={client.name} src={client.logo_url} size={36} square />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold tracking-tight">{client.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge kind="health" value={client.health} />
                {client.dashboard_url ? <Badge tone="accent"><LayoutDashboard className="size-3" />{dashboardProvider(client.dashboard_url)}</Badge> : null}
                {metaConnected ? <Badge tone="info">Meta relié</Badge> : null}
              </div>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-2 transition group-hover:translate-x-0.5 group-hover:text-fg" />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-[11.5px] font-medium uppercase tracking-wider text-muted">Dépense · 30 j</dt><dd className="mt-0.5 text-[17px] font-semibold tabular tracking-tight">{hasData ? fmt.eur(k.spend) : "—"}</dd></div>
            <div><dt className="text-[11.5px] font-medium uppercase tracking-wider text-muted">ROAS</dt><dd className={`mt-0.5 text-[17px] font-semibold tabular tracking-tight ${!hasData || !k.roas ? "" : k.roas >= 3 ? "text-success" : k.roas < 2 ? "text-danger" : ""}`}>{hasData ? roas(k.roas) : "—"}</dd></div>
            <div><dt className="text-[11.5px] font-medium uppercase tracking-wider text-muted">CPA</dt><dd className="mt-0.5 text-[17px] font-semibold tabular tracking-tight">{hasData && k.cpa ? fmt.eurCents(k.cpa) : "—"}</dd></div>
            <div><dt className="text-[11.5px] font-medium uppercase tracking-wider text-muted">Hook rate</dt><dd className="mt-0.5 text-[17px] font-semibold tabular tracking-tight">{hasData ? fmt.pct(k.hook_rate) : "—"}</dd></div>
          </dl>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            {trend.length > 1 ? (
              <>
                <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${up ? "text-success" : "text-danger"}`}>{up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{up ? "ROAS en hausse" : "ROAS en baisse"}</span>
                <Sparkline values={trend} positive={up} width={100} height={28} />
              </>
            ) : (
              <span className="text-[12.5px] text-muted">{hasData ? "Tendance dès la 2e semaine" : "Aucune métrique sur la période"}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

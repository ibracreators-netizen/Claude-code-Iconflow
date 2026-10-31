import Link from "next/link";
import { ArrowLeft, Coins, Crosshair, ExternalLink, Eye, LayoutDashboard, ShoppingBag, TrendingUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { ChartLegend, TrendChart } from "@/components/shared/charts";
import { computeKpis, type Client, type Livrable, type Metric } from "@/lib/data/types";
import { dashboardProvider, type EmbedStatus } from "@/lib/integrations/dashboard-url";
import { fmt } from "@/lib/utils";
import { MetricsDialog, RangeSegments } from "../performance-client";
import { DashboardFrame } from "./dashboard-frame";
import { DashboardUrlDialog } from "./dashboard-url-dialog";

const RANGE_LABEL: Record<string, string> = { "30": "30 derniers jours", "90": "90 derniers jours", all: "toute la période" };

/**
 * Page d'un client dans Performance (/studio/performance?client=<id>) : son tableau de bord externe en plein cadre,
 * puis ses KPI et courbes issus des métriques (saisies ou synchronisées depuis Meta).
 */
export function ClientDashboard({ client, metrics, livrables, range, embed, canEditUrl, metaConnected }: {
  client: Client; metrics: Metric[]; livrables: Livrable[]; range: string; embed: EmbedStatus; canEditUrl: boolean; metaConnected: boolean;
}) {
  const url = client.dashboard_url;
  const provider = dashboardProvider(url);
  const k = computeKpis(metrics);
  const weeks = [...new Set(metrics.map((m) => m.period_start))].sort();
  const weekly = weeks.map((w) => { const x = computeKpis(metrics.filter((m) => m.period_start === w)); return { label: fmt.date(w), spend: Math.round(x.spend), revenue: Math.round(x.revenue), hook: +(x.hook_rate * 100).toFixed(1) }; });
  const money = [{ key: "spend", label: "Dépense" }, { key: "revenue", label: "CA attribué" }];
  let host: string | null = null;
  try { host = url ? new URL(url).hostname.replace(/^www\./, "") : null; } catch { host = null; }

  return (
    <>
      <PageHeader crumbs={[{ label: "Performance", href: "/studio/performance" }, { label: client.name }]}
        title={<span className="flex items-center gap-3">
          <Tooltip label="Retour aux tableaux de bord"><Link href="/studio/performance" aria-label="Retour aux tableaux de bord" className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-2 transition hover:bg-surface-2 hover:text-fg"><ArrowLeft className="size-5" /></Link></Tooltip>
          <Avatar name={client.name} src={client.logo_url} size={44} square className="text-[15px]" />{client.name}
        </span>}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge kind="health" value={client.health} />
          {metaConnected ? <Badge tone="info" dot>Meta Ads relié</Badge> : null}
          <span className="text-muted">{url ? `Tableau de bord ${provider} et métriques sur ${RANGE_LABEL[range] ?? range}.` : `Métriques sur ${RANGE_LABEL[range] ?? range}. Relie son tableau de bord (Looker Studio, Meta…) pour l'afficher ici en plein cadre.`}</span>
        </span>}
        actions={<>
          <RangeSegments value={range} />
          <MetricsDialog clients={[{ id: client.id, name: client.name }]} livrables={livrables.map((l) => ({ id: l.id, title: l.title, client_id: l.client_id }))} />
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLink />Ouvrir dans un nouvel onglet</a> : null}
        </>} />

      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader title={url ? `Tableau de bord ${provider}` : "Tableau de bord externe"} description={host ?? "Looker Studio, Meta ou tout autre outil accessible par une adresse web."}
            action={canEditUrl && url ? <DashboardUrlDialog clientId={client.id} url={url} /> : undefined} />
          {url ? (
            <DashboardFrame url={url} title={`Tableau de bord ${client.name}`} provider={provider} status={embed} />
          ) : (
            <EmptyState icon={LayoutDashboard} title="Aucun tableau de bord relié"
              description={canEditUrl ? "Colle l'adresse d'intégration d'un rapport Looker Studio (ou tout autre outil) : il s'affichera ici, en plein cadre." : "Un membre ayant accès aux Clients peut relier le tableau de bord de ce client."}
              action={canEditUrl ? <DashboardUrlDialog clientId={client.id} url={null} variant="add" /> : undefined} />
          )}
        </Card>

        {metrics.length ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Dépense publicitaire" value={fmt.eur(k.spend)} icon={Coins} hint={`${weeks.length} semaine${weeks.length > 1 ? "s" : ""}`} />
              <Stat label="ROAS" value={k.roas ? `${k.roas.toFixed(2).replace(".", ",")}x` : "—"} icon={TrendingUp} tone={k.roas >= 3 ? "accent" : k.roas >= 2 ? "neutral" : "warning"} hint={`CA attribué ${fmt.eur(k.revenue)}`} />
              <Stat label="CPA" value={k.cpa ? fmt.eurCents(k.cpa) : "—"} icon={Crosshair} hint={`${fmt.num(k.purchases)} achats`} />
              <Stat label="Hook rate" value={fmt.pct(k.hook_rate)} icon={Eye} hint={`CTR ${fmt.pct(k.ctr)} · CPM ${fmt.eurCents(k.cpm)}`} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Dépense et CA attribué" description="Par semaine" action={<ChartLegend series={money} />} />
                <CardBody><TrendChart data={weekly} series={money} format="eurCompact" /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Hook rate" description="% d'impressions regardées 3 s · par semaine" />
                <CardBody><TrendChart data={weekly} series={[{ key: "hook", label: "Hook rate" }]} kind="line" format="pctRaw" /></CardBody>
              </Card>
            </div>
          </>
        ) : (
          <div className="card"><EmptyState icon={ShoppingBag} title="Aucune métrique sur cette période" description={metaConnected ? "La synchronisation Meta n'a encore rien remonté : lance « Synchroniser » depuis le tableau de bord." : "Saisis les chiffres hebdomadaires ou relie le compte Meta Ads du client depuis le tableau de bord."} /></div>
        )}
      </div>
    </>
  );
}

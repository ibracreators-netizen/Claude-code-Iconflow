import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, PlugZap, Target, TrendingUp, AlarmClock } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PROSPECT_STATUS, type Breakdown, type FunnelStage, type ProspectStatus } from "@/lib/marketing/types";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TrendChart } from "@/components/shared/charts";

export const metadata: Metadata = { title: "Données marketing" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Chaque donnée affiche sa source et sa fraîcheur. Aucune donnée inventée. */
function Sourced({ source = "IconFlow Marketing", fresh = "à l'instant" }: { source?: string; fresh?: string }) {
  return <p className="mt-3 text-[11px] text-muted-2">Source : {source} · {fresh}</p>;
}
const tone = (s: ProspectStatus): "success" | "danger" | "info" | "warning" | "neutral" => (s === "converti" ? "success" : s === "perdu" ? "danger" : s === "reserve" ? "info" : s === "relance" ? "warning" : "neutral");

function BreakdownBars({ items, empty }: { items: Breakdown[]; empty: string }) {
  if (!items.length) return <p className="py-2 text-[12.5px] text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 8).map((i) => (
        <li key={i.key} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-24 shrink-0 truncate text-fg-2" title={i.label}>{i.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }} /></span>
          <span className="w-6 shrink-0 text-right tabular text-muted">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ stages, measured, periodDays }: { stages: FunnelStage[]; measured: boolean; periodDays: number }) {
  const base = stages[0]?.count || 0;
  return (
    <div className="space-y-2.5">
      {stages.map((s) => {
        const pct = base ? Math.round((s.count / base) * 100) : 0;
        const show = s.measured;
        return (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <span className="font-medium text-fg-2">{s.label}{!show ? <span className="ml-2 text-[11px] font-normal text-muted-2">(non mesuré)</span> : null}</span>
              <span className="tabular text-muted">{show ? `${s.count}${base && s.key !== "optin" ? ` · ${pct}%` : ""}` : "—"}</span>
            </div>
            <span className="block h-2.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${show && base ? Math.max(3, (s.count / base) * 100) : 0}%` }} /></span>
          </div>
        );
      })}
      <p className="pt-1 text-[11.5px] text-muted-2">
        Cohorte des opt-ins des {periodDays} derniers jours, suivie sur événements horodatés.
        {measured ? "" : " Conversion pas encore mesurée (aucun changement de statut horodaté) : voir la répartition par statut."}
      </p>
    </div>
  );
}

export default async function MarketingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const store = await requireMarketing("marketing_dashboard");
  const days = one(sp.days) === "90" ? 90 : 30;
  const [d, settings] = await Promise.all([store.dashboard({ days }), store.settings()]);
  const pill = (n: number) => `rounded-full px-3 py-1.5 text-[13px] transition ${days === n ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg"}`;

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Données marketing"
        description="Acquisition propre de l'agence. Chaque chiffre vient d'une source identifiée : aucune donnée de démonstration déguisée."
        actions={store.demo ? <DemoBadge /> : undefined} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardBody><Stat label="Prospects" value={d.totals.prospects} icon={Target} tone="accent" /><Sourced /></CardBody></Card>
        <Card><CardBody><Stat label="Opt-ins" value={d.totals.optins} icon={TrendingUp} /><Sourced /></CardBody></Card>
        <Card><CardBody><Stat label="RDV à venir" value={d.totals.upcoming} icon={CalendarCheck} /><Sourced /></CardBody></Card>
        <Card><CardBody><Stat label="À relancer" value={d.totals.relanceToday} hint={d.totals.relanceToday ? "Prochaine action due" : "Rien à relancer"} icon={AlarmClock} tone={d.totals.relanceToday ? "warning" : undefined} /><Sourced /></CardBody></Card>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="text-[12.5px] text-muted">Période</span>
        <Link href="/marketing?days=30" className={pill(30)}>30 jours</Link>
        <Link href="/marketing?days=90" className={pill(90)}>90 jours</Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Opt-ins dans le temps" description={`Nombre d'opt-ins par jour sur les ${days} derniers jours.`} />
          <CardBody>
            {d.optins.some((p) => p.count > 0)
              ? <TrendChart data={d.optins.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "Opt-ins" }]} xKey="label" format="num" kind="area" height={240} />
              : <p className="py-16 text-center text-[13px] text-muted">Aucun opt-in sur la période.</p>}
            <Sourced />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Parcours des opt-ins" description="Entonnoir par cohorte, sans extrapolation." />
          <CardBody><Funnel stages={d.funnel} measured={d.conversionMeasured} periodDays={days} /><Sourced /></CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Répartition par statut" description="Instantané du pipeline (état du moment, pas un taux de conversion)." />
          <CardBody>
            <ul className="space-y-2">
              {d.statusDistribution.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-[13.5px]"><span className="text-fg-2">{PROSPECT_STATUS[s.key as ProspectStatus] ?? s.label}</span><Badge tone={tone(s.key as ProspectStatus)}>{s.count}</Badge></li>
              ))}
            </ul>
            <Sourced />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="RDV à venir par semaine" description="Rendez-vous confirmés, 8 prochaines semaines." />
          <CardBody>
            {d.upcomingByWeek.some((w) => w.count > 0)
              ? <TrendChart data={d.upcomingByWeek.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "RDV" }]} xKey="label" format="num" kind="bar" height={220} />
              : <p className="py-16 text-center text-[13px] text-muted">Aucun rendez-vous confirmé à venir.</p>}
            <Sourced />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader title="Par source" description="Origine des prospects." /><CardBody><BreakdownBars items={d.sources} empty="Aucune source renseignée." /><Sourced /></CardBody></Card>
        <Card><CardHeader title="Par marque" description="Marque déclarée à l'opt-in." /><CardBody><BreakdownBars items={d.marques} empty="Aucune marque renseignée." /><Sourced /></CardBody></Card>
        <Card><CardHeader title="Par campagne (UTM)" description="utm_campaign relevé à l'arrivée." /><CardBody><BreakdownBars items={d.campaigns} empty="Aucune campagne UTM relevée." /><Sourced /></CardBody></Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="Publicité (Meta Ads)" description="Coût par lead, ROAS… nécessitent une connexion publicitaire." />
          <CardBody>
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong p-4">
              <PlugZap className="size-5 shrink-0 text-muted" />
              <div>
                <p className="text-[13.5px] font-medium">Non connecté</p>
                <p className="mt-1 text-[12.5px] text-muted">Aucune source publicitaire n&apos;est reliée à l&apos;espace Marketing. Tant qu&apos;elle ne l&apos;est pas, aucun chiffre de coût ou de ROAS n&apos;est affiché (pas de valeur inventée). Le module Performance de Studio reste inchangé.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {settings.availability.length === 0 || !settings.slot_minutes ? (
        <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning">Aucune disponibilité n&apos;est configurée : le calendrier ne propose aucun créneau. Règle tes disponibilités dans les réglages.</p>
      ) : null}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { crmPage, facts } from "@/lib/marketing/crm-server";
import { breakdown, buildFunnel, leadSeries, upcomingByWeek } from "@/lib/marketing/funnel";
import { euro, stageTone } from "@/lib/marketing/ui";
import type { Breakdown, FunnelStage, MarketingCounts } from "@/lib/marketing/types";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TrendChart } from "@/components/shared/charts";
import { cn } from "@/lib/utils";
import { FunnelFlow } from "./funnel-flow";
import { FunnelTable } from "./_components/funnel-table";
import { ComparePages } from "./compare-pages";

export const metadata: Metadata = { title: "Données marketing" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const plural = (n: number, s: string, p = `${s}s`) => `${fr(n)} ${n > 1 ? p : s}`;
const CAPS = "font-mono text-[10.5px] font-medium uppercase tracking-[0.16em]";

/** Chaque bloc affiche sa source et sa fraîcheur. Aucune donnée inventée. */
function Sourced({ className }: { className?: string }) {
  return <p className={cn("mt-3 text-[11px] text-muted-2", className)}>Source : IconFlow Marketing · à l&apos;instant</p>;
}
/** Titre de section : une question par bloc, ponctuée du point vert de la marque. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 mt-10 text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg sm:text-[34px]">{children}<span className="text-accent-2">.</span></h2>;
}
function Kpi({ label, value, hint, dark }: { label: string; value: React.ReactNode; hint: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-[20px] px-5 py-4 shadow-soft", dark ? "bg-rail text-rail-fg" : "border border-border bg-surface")}>
      <div className={cn(CAPS, dark ? "text-rail-muted" : "text-muted")}>{label}</div>
      <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular">{value}</div>
      <div className={cn("mt-2 text-[12.5px]", dark ? "text-rail-muted" : "text-muted")}>{hint}</div>
    </div>
  );
}
function BreakdownBars({ items, empty }: { items: Breakdown[]; empty: string }) {
  if (!items.length) return <p className="py-2 text-[12.5px] text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-2">
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

export default async function MarketingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_dashboard");
  const days = one(sp.days) === "90" ? 90 : one(sp.days) === "7" ? 7 : 30;
  const [f, counts] = await Promise.all([facts(crm), crm.store.counts().catch((): MarketingCounts => ({ prospects: 0, appointments: 0, emailsPending: 0 }))]);
  const now = new Date(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const base = { prospects: f.prospects, appointments: f.appointments, insights: f.insights, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to };
  const byPage = buildFunnel({ ...base, by: "landing_page" }), byCampaign = buildFunnel({ ...base, by: "campaign" });
  const t = byPage.total;
  const cohort = f.prospects.filter((p) => { const d = p.opted_in_at ?? p.created_at; return d >= from && d < to; });
  const series = leadSeries(cohort, days, now), weeks = upcomingByWeek(f.appointments, now);
  const upcoming = f.appointments.filter((a) => a.status === "confirme" && Date.parse(a.starts_at) > now.getTime()).length;
  const toFill = f.appointments.filter((a) => a.status === "confirme" && Date.parse(a.starts_at) < now.getTime() && (a.result ?? "a_venir") === "a_venir").length;
  const funnel: FunnelStage[] = [
    { key: "leads", label: "Leads", count: t.leads, measured: true }, { key: "rdv", label: "RDV pris", count: t.booked, measured: true },
    { key: "presents", label: "Présents", count: t.showed, measured: true }, { key: "signes", label: "Signés", count: t.signed, measured: true },
  ];
  const stageCounts = f.stages.filter((s) => s.active).map((s) => ({ stage: s, count: f.prospects.filter((p) => p.stage_id === s.id).length }));
  const sources = breakdown(cohort, (p) => p.source, "(source inconnue)");
  const can = (m: ModuleKey) => canAccess(crm.session.profile, m);
  const pill = (n: number) => cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition", days === n ? "bg-rail text-rail-fg shadow-soft" : "text-muted hover:text-fg");
  const signRate = t.leads > 0 ? Math.round((t.signed / t.leads) * 1000) / 10 : null;
  const actions = [
    { key: "rdv", caps: "Calendrier · cette semaine", n: weeks[0]?.count ?? 0, label: ["rendez-vous cette semaine", "rendez-vous cette semaine"], text: "Confirmés, à préparer avant l'appel.", href: "/marketing/calendrier", ok: can("marketing_calendrier") },
    { key: "resultats", caps: "Appels · résultats", n: toFill, label: ["résultat à saisir", "résultats à saisir"], text: "Appels passés dont le résultat n'est pas encore saisi.", href: "/marketing/espace", ok: can("marketing_espace") },
    { key: "reception", caps: "Réception · à vérifier", n: counts.inboxAttention ?? 0, label: ["lead à vérifier", "leads à vérifier"], text: "Lignes en erreur, suspectes ou bloquées.", href: "/marketing/reception", ok: can("marketing_reception") },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className={cn(CAPS, "flex items-center gap-2 text-fg-2")}><span className="size-1.5 rounded-full bg-accent-2" />IconFlow Marketing</div>
          <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.035em]">Données marketing</h1>
        </div>
        <div className="flex items-center gap-2">
          {crm.demo ? <DemoBadge /> : null}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-soft" role="group" aria-label="Période">
            {[7, 30, 90].map((n) => <Link key={n} href={`/marketing?days=${n}`} className={pill(n)} aria-current={days === n ? "true" : undefined}>{n} jours</Link>)}
          </div>
        </div>
      </div>

      {/* Bandeau : le résultat de la période, un seul chiffre */}
      <section className="relative overflow-hidden rounded-[26px] bg-rail px-6 py-7 text-rail-fg shadow-soft sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_140%_at_92%_30%,rgb(91_230_131/.42),transparent_60%),radial-gradient(45%_110%_at_60%_120%,rgb(47_107_63/.75),transparent_72%)]" />
        <div className="relative">
          <p className={cn(CAPS, "text-rail-muted")}>Ce que ton acquisition a produit · {days} derniers jours</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[76px] font-semibold leading-[0.9] tracking-[-0.05em] tabular sm:text-[92px]">{fr(t.booked)}</span>
            <span className="text-[17px] text-rail-muted">{t.booked > 1 ? "leads avec un rendez-vous" : "lead avec un rendez-vous"}</span>
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-1.5 text-[13.5px]">
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand" /><b className="font-semibold tabular">{fr(t.leads)}</b><span className="text-rail-muted">leads sur la période</span></li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-rail-muted" /><b className="font-semibold tabular">{fr(t.signed)}</b><span className="text-rail-muted">{t.signed > 1 ? "signés" : "signé"}{t.amount ? ` · ${euro.format(t.amount)} HT` : ""}</span></li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-rail-muted" /><b className="font-semibold tabular">{fr(upcoming)}</b><span className="text-rail-muted">RDV à venir</span></li>
          </ul>
        </div>
      </section>

      {/* 1 — Volume */}
      <SectionTitle>Leads dans le temps</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi dark label="Leads" value={fr(t.leads)} hint={`sur ${days} jours · ${fr(f.prospects.length)} au total`} />
        <Kpi label="RDV pris" value={fr(t.booked)} hint={t.leads ? `${Math.round((t.booked / t.leads) * 100)} % des leads` : "aucun lead"} />
        <Kpi label="Présents" value={fr(t.showed)} hint={t.booked ? `${Math.round((t.showed / t.booked) * 100)} % des RDV pris` : "aucun rendez-vous"} />
        <Kpi label="Signés" value={fr(t.signed)} hint={t.showed ? `${Math.round((t.signed / t.showed) * 100)} % des présents` : "aucun appel tenu"} />
        <Kpi label="Montant signé HT" value={t.amount ? euro.format(t.amount) : "—"} hint={t.spend === null ? "dépense publicitaire non connectée" : `dépense : ${euro.format(t.spend)}`} />
      </div>
      <div className="mt-3 rounded-[24px] border border-border bg-surface p-4 shadow-soft sm:p-5">
        <p className="mb-2 px-1 text-[13px] text-muted">Nombre de leads par jour sur les {days} derniers jours.</p>
        {series.some((p) => p.count > 0)
          ? <TrendChart data={series.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "Leads" }]} xKey="label" format="num" kind="area" height={260} />
          : <p className="py-20 text-center text-[13px] text-muted">Aucun lead sur la période.</p>}
        <Sourced />
      </div>

      {/* 2 — Parcours, par cohorte */}
      <SectionTitle>Du lead à la signature</SectionTitle>
      <div className="rounded-[24px] border border-border bg-surface p-5 shadow-soft sm:p-7">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            {signRate === null
              ? <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg">Aucun lead sur la période</p>
              : <p className="flex items-baseline gap-3"><span className="text-[56px] font-semibold leading-none tracking-[-0.05em] tabular text-accent-2">{String(signRate).replace(".", ",")} %</span><span className="text-[15px] font-medium text-fg">des leads ont signé</span></p>}
            <p className={cn(CAPS, "mt-2 text-muted")}>{plural(t.leads, "lead")} → {plural(t.signed, "signé")}</p>
          </div>
          <span className={cn(CAPS, "rounded-full border border-border bg-surface-2 px-3 py-1.5 text-muted")}>Cohorte · {days} derniers jours</span>
        </div>
        <FunnelFlow stages={funnel} periodDays={days} />

        <div className="mt-7 grid overflow-hidden rounded-[20px] bg-rail text-rail-fg md:grid-cols-3">
          {actions.map((a, i) => (
            <div key={a.key} className={cn("flex items-center gap-4 px-5 py-5", i > 0 && "border-t border-rail-line md:border-l md:border-t-0")}>
              <div className="min-w-0 flex-1">
                <div className={cn(CAPS, "text-rail-muted")}>{a.caps}</div>
                <div className="mt-2 flex items-baseline gap-2.5"><span className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular">{fr(a.n)}</span><span className="text-[13.5px] font-medium leading-tight">{a.n > 1 ? a.label[1] : a.label[0]}</span></div>
                <p className="mt-2 text-[12.5px] text-rail-muted">{a.text}</p>
              </div>
              {a.ok ? <Link href={a.href} aria-label={`Ouvrir : ${a.n > 1 ? a.label[1] : a.label[0]}`} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rail-fg text-rail transition hover:scale-105"><ArrowRight className="size-4" /></Link> : null}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-muted">
        Lecture : on suit les leads arrivés sur la période, et jusqu&apos;où chacun est allé depuis. Un lead compte une seule fois par étape.
        L&apos;épaisseur du flux est proportionnelle au volume, avec un trait minimal pour les petites valeurs. Les règles de calcul sont détaillées sous les tableaux ci-dessous.
      </p>

      {/* 3 — L'entonnoir par page d'entrée et par campagne */}
      <SectionTitle>Par page d&apos;entrée</SectionTitle>
      <Card><CardHeader title="Entonnoir par page d'entrée" description="La première page vue par le visiteur, sans ses paramètres. C'est ici que se comparent ta page avec optin et ta page sans optin." /><FunnelTable funnel={byPage} first="Page d'entrée" byPage /></Card>
      <Card className="mt-4"><CardHeader title="Comparer deux pages" description="Choisis deux pages d'entrée : les mêmes indicateurs, côte à côte." /><CardBody><ComparePages rows={byPage.rows} /></CardBody></Card>

      <SectionTitle>Par campagne</SectionTitle>
      <Card><CardHeader title="Entonnoir par campagne" description="Campagne relevée à l'arrivée du lead (utm_campaign, ou identifiant de campagne Meta)." /><FunnelTable funnel={byCampaign} first="Campagne" /></Card>
      {!byCampaign.hasSpend ? <p className="mt-3 text-[12.5px] text-muted">Dépense publicitaire non connectée : aucun coût n&apos;est affiché, plutôt qu&apos;un chiffre inventé. {can("marketing_publicite") ? <Link href="/marketing/publicite" className="text-accent-2 hover:underline">Désigner le compte Meta Ads de l&apos;agence</Link> : null}</p> : null}

      {/* 4 — Le pipeline aujourd'hui */}
      <SectionTitle>Ton pipeline aujourd&apos;hui</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Répartition par étape" description="État du moment, tous prospects confondus." />
          <CardBody>
            <ul className="space-y-2">{stageCounts.map(({ stage, count }) => <li key={stage.id} className="flex items-center justify-between text-[13.5px]"><span className="text-fg-2">{stage.name}</span><Badge tone={stageTone(stage)}>{count}</Badge></li>)}</ul>
            <Sourced />
          </CardBody>
        </Card>
        <Card><CardHeader title="Par source" description="Origine des leads de la période." /><CardBody><BreakdownBars items={sources} empty="Aucun lead sur la période." /><Sourced /></CardBody></Card>
        <Card>
          <CardHeader title="RDV à venir par semaine" description="Rendez-vous confirmés, 8 prochaines semaines." />
          <CardBody>
            {weeks.some((w) => w.count > 0)
              ? <TrendChart data={weeks.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "RDV" }]} xKey="label" format="num" kind="bar" height={200} />
              : <p className="py-16 text-center text-[13px] text-muted">Aucun rendez-vous confirmé à venir.</p>}
            <Sourced />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PlugZap } from "lucide-react";
import { requireMarketing } from "@/lib/marketing/session";
import { PROSPECT_STATUS, type Breakdown, type ProspectStatus } from "@/lib/marketing/types";
import { canAccess, type ModuleKey } from "@/lib/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/demo-badge";
import { TrendChart } from "@/components/shared/charts";
import { cn } from "@/lib/utils";
import { OptinStackChart } from "./optin-stack-chart";
import { FunnelFlow } from "./funnel-flow";

export const metadata: Metadata = { title: "Données marketing" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const plural = (n: number, s: string, p = `${s}s`) => `${fr(n)} ${n > 1 ? p : s}`;
const tone = (s: ProspectStatus): "success" | "danger" | "info" | "warning" | "neutral" => (s === "converti" ? "success" : s === "perdu" ? "danger" : s === "reserve" ? "info" : s === "relance" ? "warning" : "neutral");
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
          <span className="w-28 shrink-0 truncate text-fg-2" title={i.label}>{i.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }} /></span>
          <span className="w-6 shrink-0 text-right tabular text-muted">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function MarketingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const store = await requireMarketing("marketing_dashboard");
  const days = one(sp.days) === "90" ? 90 : 30;
  const [d, settings, counts] = await Promise.all([store.dashboard({ days }), store.settings(), store.counts()]);
  const [optin, rdv, converti] = d.funnel;
  const can = (m: ModuleKey) => canAccess(store.session.profile, m);
  const pill = (n: number) => cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition", days === n ? "bg-rail text-rail-fg shadow-soft" : "text-muted hover:text-fg");
  const convRate = d.conversionMeasured && optin.count > 0 ? Math.round((converti.count / optin.count) * 100) : null;
  const unit = d.optinStack.bucket === "week" ? "semaine" : "jour";
  const actions = [
    { key: "relance", caps: "Prospects · suivi", n: d.totals.relanceToday, label: ["prospect à relancer", "prospects à relancer"], text: "Prochaine action due aujourd'hui ou en retard.", href: "/marketing/prospects?view=pipeline", ok: can("marketing_prospects") },
    { key: "rdv", caps: "Calendrier · cette semaine", n: d.upcomingByWeek[0]?.count ?? 0, label: ["rendez-vous cette semaine", "rendez-vous cette semaine"], text: "Confirmés, à préparer avant l'appel.", href: "/marketing/calendrier", ok: can("marketing_calendrier") },
    { key: "emails", caps: "Relances · file d'attente", n: counts.emailsPending, label: ["email en attente", "emails en attente"], text: "Rappels de RDV et relances d'opt-in programmés.", href: "/marketing/relances", ok: can("marketing_relances") },
  ];

  return (
    <>
      {/* En-tête : contexte à gauche, période à droite */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className={cn(CAPS, "flex items-center gap-2 text-fg-2")}><span className="size-1.5 rounded-full bg-accent-2" />IconFlow Marketing</div>
          <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.035em]">Données marketing</h1>
        </div>
        <div className="flex items-center gap-2">
          {store.demo ? <DemoBadge /> : null}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-soft" role="group" aria-label="Période">
            <Link href="/marketing?days=30" className={pill(30)} aria-current={days === 30 ? "true" : undefined}>30 jours</Link>
            <Link href="/marketing?days=90" className={pill(90)} aria-current={days === 90 ? "true" : undefined}>90 jours</Link>
          </div>
        </div>
      </div>

      {/* Bandeau : le résultat de la période, un seul chiffre */}
      <section className="relative overflow-hidden rounded-[26px] bg-rail px-6 py-7 text-rail-fg shadow-soft sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_140%_at_92%_30%,rgb(91_230_131/.42),transparent_60%),radial-gradient(45%_110%_at_60%_120%,rgb(47_107_63/.75),transparent_72%)]" />
        <div className="relative">
          <p className={cn(CAPS, "text-rail-muted")}>Ce que ton acquisition a produit · {days} derniers jours</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[76px] font-semibold leading-[0.9] tracking-[-0.05em] tabular sm:text-[92px]">{fr(rdv.count)}</span>
            <span className="text-[17px] text-rail-muted">rendez-vous pris</span>
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-1.5 text-[13.5px]">
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-brand" /><b className="font-semibold tabular">{fr(optin.count)}</b><span className="text-rail-muted">opt-ins sur la période</span></li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-rail-muted" /><b className="font-semibold tabular">{d.conversionMeasured ? fr(converti.count) : "—"}</b><span className="text-rail-muted">{d.conversionMeasured ? (converti.count > 1 ? "devenus clients" : "devenu client") : "conversion non mesurée"}</span></li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-rail-muted" /><b className="font-semibold tabular">{fr(d.totals.upcoming)}</b><span className="text-rail-muted">RDV à venir</span></li>
          </ul>
        </div>
      </section>

      {/* 1 — Volume : opt-ins dans le temps, par source */}
      <SectionTitle>Opt-ins par {unit}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi dark label="Opt-ins" value={fr(optin.count)} hint={`sur ${days} jours · ${fr(d.totals.optins)} au total`} />
        <Kpi label="RDV pris" value={fr(rdv.count)} hint="opt-ins de la période avec un rendez-vous" />
        <Kpi label="Convertis" value={d.conversionMeasured ? fr(converti.count) : "—"} hint={d.conversionMeasured ? "passés à « converti » (horodaté)" : "pas encore mesuré"} />
        <Kpi label="À relancer" value={fr(d.totals.relanceToday)} hint={d.totals.relanceToday ? "prochaine action due" : "rien en retard"} />
      </div>
      <div className="mt-3 rounded-[24px] border border-border bg-surface p-4 shadow-soft sm:p-5">
        {optin.count > 0 ? <OptinStackChart stack={d.optinStack} /> : <p className="py-20 text-center text-[13px] text-muted">Aucun opt-in sur la période.</p>}
        <Sourced />
      </div>

      {/* 2 — Parcours : de l'opt-in au client, par cohorte */}
      <SectionTitle>De l&apos;opt-in au client</SectionTitle>
      <div className="rounded-[24px] border border-border bg-surface p-5 shadow-soft sm:p-7">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-baseline gap-3"><span className="text-[56px] font-semibold leading-none tracking-[-0.05em] tabular text-accent-2">{convRate === null ? "—" : `${convRate} %`}</span><span className="text-[15px] font-medium text-fg">{convRate === null ? "conversion pas encore mesurée" : "des opt-ins deviennent clients"}</span></p>
            <p className={cn(CAPS, "mt-2 text-muted")}>{plural(optin.count, "opt-in")} → {d.conversionMeasured ? plural(converti.count, "converti") : "non mesuré"}</p>
          </div>
          <span className={cn(CAPS, "rounded-full border border-border bg-surface-2 px-3 py-1.5 text-muted")}>Cohorte · {days} derniers jours</span>
        </div>
        <FunnelFlow stages={d.funnel} periodDays={days} />

        {/* Ce qu'il y a à faire maintenant */}
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
        Lecture : on suit les prospects qui ont fait leur opt-in sur la période. « RDV pris » compte ceux qui ont au moins un rendez-vous ; « Convertis » ne compte que les passages à « converti » horodatés.
        Une étape non mesurée n&apos;est pas dessinée. L&apos;épaisseur du flux est proportionnelle au volume, avec un trait minimal pour les petites valeurs. Ce n&apos;est pas la répartition des statuts du moment, affichée plus bas.
      </p>

      {/* 3 — Composition du pipeline */}
      <SectionTitle>Ton pipeline aujourd&apos;hui</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Répartition par statut" description="État du moment, pas un taux de conversion." />
          <CardBody>
            <ul className="space-y-2">
              {d.statusDistribution.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-[13.5px]"><span className="text-fg-2">{PROSPECT_STATUS[s.key as ProspectStatus] ?? s.label}</span><Badge tone={tone(s.key as ProspectStatus)}>{s.count}</Badge></li>
              ))}
            </ul>
            <Sourced />
          </CardBody>
        </Card>
        <Card><CardHeader title="Par marque" description="Marque déclarée à l'opt-in." /><CardBody><BreakdownBars items={d.marques} empty="Aucune marque renseignée." /><Sourced /></CardBody></Card>
        <Card><CardHeader title="Par campagne (UTM)" description="utm_campaign relevé à l'arrivée." /><CardBody><BreakdownBars items={d.campaigns} empty="Aucune campagne UTM relevée." /><Sourced /></CardBody></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="RDV à venir par semaine" description="Rendez-vous confirmés, 8 prochaines semaines." />
          <CardBody>
            {d.upcomingByWeek.some((w) => w.count > 0)
              ? <TrendChart data={d.upcomingByWeek.map((p) => ({ label: p.label, count: p.count }))} series={[{ key: "count", label: "RDV" }]} xKey="label" format="num" kind="bar" height={200} />
              : <p className="py-16 text-center text-[13px] text-muted">Aucun rendez-vous confirmé à venir.</p>}
            <Sourced />
          </CardBody>
        </Card>
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

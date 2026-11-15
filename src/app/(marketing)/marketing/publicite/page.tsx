import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, facts, isAdmin } from "@/lib/marketing/crm-server";
import { adAccountChoices, adsState } from "@/lib/marketing/ads";
import { buildFunnel } from "@/lib/marketing/funnel";
import { euro } from "@/lib/marketing/ui";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/shared/demo-badge";
import { cn } from "@/lib/utils";
import { FunnelTable } from "../_components/funnel-table";
import { AdAccountPicker } from "./publicite-client";

export const metadata: Metadata = { title: "Publicité" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS = [7, 30, 90] as const;

export default async function PublicitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const crm = await crmPage("marketing_publicite");
  const days = PERIODS.includes(Number(one(sp.jours)) as (typeof PERIODS)[number]) ? Number(one(sp.jours)) : 30;
  const admin = isAdmin(crm.session);
  const [f, state, choices, settings] = await Promise.all([facts(crm), adsState(), admin ? adAccountChoices() : Promise.resolve([]), crm.store.settings()]);
  const now = new Date(), from = new Date(now.getTime() - days * 86_400_000).toISOString(), to = new Date(now.getTime() + 60_000).toISOString();
  const base = { prospects: f.prospects, appointments: f.appointments, insights: f.insights, wonStages: f.stages.filter((s) => s.kind === "gagne").map((s) => s.id), from, to };
  const byCampaign = buildFunnel({ ...base, by: "campaign" }), byPage = buildFunnel({ ...base, by: "landing_page" });
  const t = byCampaign.total;
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(new Date(iso)) : null);
  const pill = (active: boolean) => cn("rounded-full px-3 py-1.5 text-[13px] transition", active ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-muted hover:text-fg");

  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Publicité" description="Le compte Meta Ads de l'agence : dépense, coût par lead et coût par rendez-vous, par campagne et par page d'entrée. Des chiffres uniquement, aucune coordonnée de contact."
        actions={crm.demo ? <DemoBadge /> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((d) => <Link key={d} href={`/marketing/publicite?jours=${d}`} aria-current={d === days ? "true" : undefined} className={pill(d === days)}>{d} jours</Link>)}
        <span className="ml-auto text-[12.5px] text-muted">{state.account_id ? `Compte : ${state.account_name ?? state.account_id} · lu le ${when(state.last_sync_at) ?? "pas encore"}` : "Aucun compte Meta Ads désigné"}</span>
      </div>
      {!state.account_id ? (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] text-warning">
          Dépense non connectée : le compte Meta Ads de l&apos;agence n&apos;est pas encore désigné. Les leads, rendez-vous et signatures ci-dessous sont réels ; les coûts s&apos;afficheront dès que le compte sera choisi{admin ? " (en bas de cette page)" : " par l'administrateur"}.
        </p>
      ) : state.last_error ? <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[13px] text-warning">La dernière lecture de Meta a échoué : {state.last_error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Dépense" value={t.spend === null ? "non connecté" : euro.format(t.spend)} hint={`${days} derniers jours`} />
        <Stat label="Leads" value={t.leads} hint="opt-ins de la période" />
        <Stat label="Coût par lead" value={t.costPerLead === null ? "—" : euro.format(t.costPerLead)} hint="dépense ÷ leads" />
        <Stat label="Rendez-vous pris" value={t.booked} hint={t.leads ? `${Math.round((t.booked / t.leads) * 100)} % des leads` : "aucun lead"} />
        <Stat label="Coût par rendez-vous" value={t.costPerBooking === null ? "—" : euro.format(t.costPerBooking)} hint="dépense ÷ leads avec RDV" />
      </div>

      <Card className="mt-4"><CardHeader title="Par campagne" description="Une campagne est rattachée à ses leads par son nom (utm_campaign) ou par son identifiant Meta (campaign_id dans l'adresse)." /><FunnelTable funnel={byCampaign} first="Campagne" /></Card>
      <Card className="mt-4"><CardHeader title="Par page d'entrée" description="La première page vue par le visiteur, sans ses paramètres." /><FunnelTable funnel={byPage} first="Page d'entrée" byPage /></Card>

      {admin ? (
        <section className="card mt-6 p-5">
          <h3 className="mb-1 text-[15px] font-semibold">Compte Meta Ads de l&apos;agence</h3>
          <p className="mb-4 text-[12.5px] text-muted">La connexion Meta déjà en place dans l&apos;app est réutilisée. Choisis ici lequel des comptes connectés est celui de l&apos;agence : sa dépense est lue par campagne et par jour, toutes les six heures. Si le compte de l&apos;agence n&apos;apparaît pas, connecte-le d&apos;abord dans Studio (tableau de bord, « Connexions Meta Ads »), sur une fiche client au nom de l&apos;agence.</p>
          {crm.demo ? <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">Choisir un compte demande une base reliée.</p>
            : <AdAccountPicker choices={choices.map((c) => ({ integration_id: c.integration_id, label: `${c.account_name ?? c.account_id}${c.client_name ? ` (fiche ${c.client_name})` : ""}` }))} current={state.integration_id} lastSync={when(state.last_sync_at)} lastError={state.last_error} />}
        </section>
      ) : null}
    </>
  );
}

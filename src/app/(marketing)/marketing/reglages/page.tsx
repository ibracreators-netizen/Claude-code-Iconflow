import type { Metadata } from "next";
import Link from "next/link";
import { crmPage, isAdmin, stagesFor } from "@/lib/marketing/crm-server";
import { buttonVariants } from "@/components/ui/button";
import type { Prospect } from "@/lib/marketing/types";
import { readBeat } from "@/lib/marketing/inbox";
import { schedulerState } from "@/lib/marketing/inbox-core";
import { isMailerConfigured } from "@/lib/email/mailer";
import { PageHeader } from "@/components/ui/misc";
import { ReglagesForm, type SchedulerInfo } from "./reglages-form";
import { PipelineStages } from "./pipeline-stages";
import { SourcesCard, type SourceInfo } from "./sources-card";
import { SpeedCard } from "./speed-card";
import { AdsCard, type AdsInfo } from "./ads-card";
import { adAccountChoices, adsState } from "@/lib/marketing/ads";
import { BTN_LIGHT, Panel } from "./kit";
import { cn } from "@/lib/utils";
import { bookingSource, sourceState } from "@/lib/marketing/sources/run";
import { systemDb } from "@/lib/marketing/crm-server";

export const metadata: Metadata = { title: "Réglages marketing" };

const when = (iso: string | null | undefined, tz: string) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso)) : "jamais");

export default async function ReglagesPage() {
  const crm = await crmPage("marketing_reglages");
  const store = crm.store;
  const [settings, beat, stages, prospects] = await Promise.all([store.settings(), readBeat(), stagesFor(crm), crm.db.list<Pick<Prospect, "stage_id">>("marketing_prospects", { columns: "stage_id" }).catch(() => [] as Array<Pick<Prospect, "stage_id">>)]);
  const counts: Record<string, number> = {};
  for (const p of prospects) if (p.stage_id) counts[p.stage_id] = (counts[p.stage_id] ?? 0) + 1;
  const state = schedulerState(beat);
  const last = when(beat?.last_run_at, settings.timezone);
  const scheduler: SchedulerInfo = state === "ok"
    ? { tone: "ok", verdict: `actif · dernier passage le ${last}`, note: beat?.ok === false && beat.detail ? `Dernier passage avec un souci : ${beat.detail}` : "Toutes les minutes : il transforme les leads reçus en prospects et applique les automatisations. Il n'écrit à un prospect que si une automatisation allumée le prévoit." }
    : state === "jamais"
      ? { tone: "warn", verdict: "jamais exécuté", note: "La tâche planifiée n'est pas installée, ou elle n'arrive pas à joindre l'app. Les leads reçus attendent dans Réception." }
      : { tone: "warn", verdict: `${state === "arrete" ? "arrêté" : "en retard"} · dernier passage le ${last}`, note: "Les leads reçus restent en sécurité dans Réception mais ne deviennent plus des prospects tout seuls. Une alerte est envoyée aux adresses ci-dessus quand il est arrêté." };
  // Outil de réservation : état lu avec la clé service (le repère de synchronisation n'est pas une donnée de membre).
  const adapter = bookingSource(), sys = systemDb();
  const src = sys ? await sourceState(sys, adapter).catch(() => null) : null;
  const runs = await crm.db.list<{ id: string; mode: string; ok: boolean; stats: { created?: number; updated?: number; leads?: number; tasks?: number; cancelled?: number } | null; error: string | null; started_at: string }>("marketing_source_runs", { where: [["eq", "source", adapter.source]], order: ["started_at", "desc"], limit: 8 }).catch(() => []);
  // Publicité Meta Ads (administrateur) : compte de l'agence, dernière lecture, dernière erreur.
  const admin = isAdmin(crm.session);
  const [ads, adChoices] = admin ? await Promise.all([adsState(), adAccountChoices()]) : ([null, []] as const);
  const adsInfo: AdsInfo | null = ads ? {
    demo: crm.demo, current: ads.integration_id, account: ads.account_id ? ads.account_name ?? ads.account_id : null,
    lastSync: ads.last_sync_at ? when(ads.last_sync_at, settings.timezone) : null, lastError: ads.last_error,
    choices: adChoices.map((c) => ({ integration_id: c.integration_id, label: `${c.account_name ?? c.account_id}${c.client_name ? ` (fiche ${c.client_name})` : ""}` })),
  } : null;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const source: SourceInfo = {
    label: adapter.label, keyRead: adapter.configured(), webhookRead: !!(process.env.ICLOSED_WEBHOOK_SECRET ?? "").trim(), webhookUrl: base ? `${base}/api/marketing/sources/webhook?cle=` : null,
    lastRun: src?.last_run_at ? when(src.last_run_at, settings.timezone) : null, lastOk: src?.last_ok ?? null, lastError: src?.last_error ?? null, loading: !!src?.more,
    runs: runs.map((r) => ({ id: r.id, when: when(r.started_at, settings.timezone), mode: r.mode === "webhook" ? "notification" : r.mode === "manuel" ? "à la main" : "planifié", ok: r.ok,
      summary: r.ok ? [`${r.stats?.created ?? 0} rendez-vous créés`, `${r.stats?.updated ?? 0} mis à jour`, `${r.stats?.leads ?? 0} contacts sans rendez-vous`, `${r.stats?.tasks ?? 0} tâches`].join(" · ") : r.error ?? "échec" })),
  };
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Réglages" description="Pipeline, alertes, planificateur et rappels. Aucune valeur n'est active tant que tu ne l'as pas réglée." />
      <div className="space-y-6">
        <PipelineStages stages={stages} counts={counts} />
        <SourcesCard info={source} />
        {adsInfo ? <div id="publicite" className="scroll-mt-20"><AdsCard info={adsInfo} /></div> : null}
        <Panel title="Automatisations" description={<>Six règles avec interrupteur et délais : attribution des leads, relances, rappel au closer, passage en « Gagné ». Avec le journal de ce qui s&apos;est exécuté.</>} action={<Link href="/marketing/reglages/automatisations" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>Régler les automatisations</Link>} />
        {admin ? (
          <Panel title="Équipe commerciale" description={<>Inviter un setter, un closer ou un media buyer, changer son rôle, retirer son accès. Ces comptes n&apos;ouvrent que l&apos;espace Marketing.</>} action={<Link href="/marketing/reglages/equipe" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>Gérer l&apos;équipe</Link>} />
        ) : null}
        {admin ? (
          <Panel title="Reprise des données GoHighLevel" description={<>Import des contacts et des opportunités depuis deux exports CSV. Rejouable, sans doublon, avec un rapport.</>} action={<Link href="/marketing/reglages/import" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>Ouvrir l&apos;import</Link>} />
        ) : null}
        <Panel title="Leads reçus (contrôle technique)" description={<>Chaque envoi de tes sites, avant son entrée dans le CRM : ce qui est arrivé, ce qui a été refusé, ce qui est en erreur. Utile seulement quand un lead manque.</>} action={<Link href="/marketing/reglages/reception" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>Ouvrir le contrôle</Link>} />
        <Panel title="Emails automatiques" description={<>La file des relances et des rappels programmés par les automatisations : en attente, envoyés, simulés, annulés.</>} action={<Link href="/marketing/relances" className={cn(buttonVariants({ variant: "outline", size: "sm" }), BTN_LIGHT)}>Voir la file</Link>} />
        <SpeedCard />
        <ReglagesForm initial={settings} scheduler={scheduler} mailer={isMailerConfigured()} />
      </div>
    </>
  );
}

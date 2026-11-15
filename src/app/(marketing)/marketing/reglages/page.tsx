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
import { bookingSource, sourceState } from "@/lib/marketing/sources/run";
import { systemDb } from "@/lib/marketing/crm-server";

export const metadata: Metadata = { title: "Réglages marketing" };

const when = (iso: string | null | undefined, tz: string) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso)) : "jamais");

export default async function ReglagesPage() {
  const crm = await crmPage("marketing_reglages");
  const store = crm.store;
  const [settings, beat, stages, prospects] = await Promise.all([store.settings(), readBeat(), stagesFor(crm), crm.db.list<Prospect>("marketing_prospects").catch(() => [] as Prospect[])]);
  const counts: Record<string, number> = {};
  for (const p of prospects) if (p.stage_id) counts[p.stage_id] = (counts[p.stage_id] ?? 0) + 1;
  const state = schedulerState(beat);
  const last = when(beat?.last_run_at, settings.timezone);
  const scheduler: SchedulerInfo = state === "ok"
    ? { tone: "ok", verdict: `actif · dernier passage le ${last}`, note: beat?.ok === false && beat.detail ? `Dernier passage avec un souci : ${beat.detail}` : "Toutes les minutes : il transforme les leads reçus en prospects. Il n'envoie aucun email aux prospects." }
    : state === "jamais"
      ? { tone: "warn", verdict: "jamais exécuté", note: "La tâche planifiée n'est pas installée, ou elle n'arrive pas à joindre l'app. Les leads reçus attendent dans Réception." }
      : { tone: "warn", verdict: `${state === "arrete" ? "arrêté" : "en retard"} · dernier passage le ${last}`, note: "Les leads reçus restent en sécurité dans Réception mais ne deviennent plus des prospects tout seuls. Une alerte est envoyée aux adresses ci-dessus quand il est arrêté." };
  // Outil de réservation : état lu avec la clé service (le repère de synchronisation n'est pas une donnée de membre).
  const adapter = bookingSource(), sys = systemDb();
  const src = sys ? await sourceState(sys, adapter).catch(() => null) : null;
  const runs = await crm.db.list<{ id: string; mode: string; ok: boolean; stats: { created?: number; updated?: number; leads?: number; tasks?: number; cancelled?: number } | null; error: string | null; started_at: string }>("marketing_source_runs", { where: [["eq", "source", adapter.source]], order: ["started_at", "desc"], limit: 8 }).catch(() => []);
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
        {isAdmin(crm.session) ? (
          <section className="card flex flex-wrap items-center gap-3 p-5">
            <div className="min-w-0 flex-1"><h3 className="text-[15px] font-semibold">Reprise des données GoHighLevel</h3><p className="text-[12.5px] text-muted">Import des contacts et des opportunités depuis deux exports CSV. Rejouable, sans doublon, avec un rapport.</p></div>
            <Link href="/marketing/reglages/import" className={buttonVariants({ variant: "secondary", size: "sm" })}>Ouvrir l&apos;import</Link>
          </section>
        ) : null}
        <ReglagesForm initial={settings} scheduler={scheduler} mailer={isMailerConfigured()} />
      </div>
    </>
  );
}

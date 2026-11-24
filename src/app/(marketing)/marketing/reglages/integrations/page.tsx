import type { Metadata } from "next";
import { crmPage, isAdmin, systemDb } from "@/lib/marketing/crm-server";
import { adAccountChoices, adsState } from "@/lib/marketing/ads";
import { bookingSource, sourceState } from "@/lib/marketing/sources/run";
import { googleEnv, googleReady, myGoogleAccount } from "@/lib/marketing/google/sync";
import { GOOGLE_CALLS_SETTING, GOOGLE_SOURCE, readGoogleCallsSetting } from "@/lib/marketing/google/calls-to-prospects";
import { canAccess } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/misc";
import { AdsCard, type AdsInfo } from "../ads-card";
import { SourcesCard, type SourceInfo } from "../sources-card";
import { GoogleCard } from "./google-card";

export const metadata: Metadata = { title: "Intégrations" };

type RunRow = { id: string; mode: string; ok: boolean; stats: { created?: number; updated?: number; leads?: number; tasks?: number; cancelled?: number; prospects?: number; contacts?: number } | null; error: string | null; started_at: string };
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Intégrations : Google Agenda (chacun relie le sien dans Calendrier), Meta Ads (administrateur) et, seulement s'il est
 * configuré sur l'hébergeur, l'outil de réservation iClosed.
 */
export default async function IntegrationsPage() {
  const crm = await crmPage("marketing_reglages");
  const profile = crm.session.profile;
  const admin = isAdmin(crm.session);
  const adapter = bookingSource();
  const iclosed = adapter.configured();
  const sys = iclosed ? systemDb() : null;
  const [settings, google, adsPair, src, runs, callsRaw, callsRun] = await Promise.all([
    crm.store.settings(),
    myGoogleAccount(crm.session.user.id).catch(() => null),
    admin ? Promise.all([adsState(), adAccountChoices()]) : Promise.resolve(null),
    sys ? sourceState(sys, adapter).catch(() => null) : Promise.resolve(null),
    iclosed ? crm.db.list<RunRow>("marketing_source_runs", { where: [["eq", "source", adapter.source]], order: ["started_at", "desc"], limit: 8 }).catch(() => [] as RunRow[]) : Promise.resolve([] as RunRow[]),
    crm.db.setting(GOOGLE_CALLS_SETTING).catch(() => null),
    admin ? crm.db.list<RunRow>("marketing_source_runs", { where: [["eq", "source", GOOGLE_SOURCE]], order: ["started_at", "desc"], limit: 1 }).catch(() => [] as RunRow[]) : Promise.resolve([] as RunRow[]),
  ]);
  const when = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(new Date(iso)) : null);

  const [ads, adChoices] = adsPair ?? [null, []];
  const adsInfo: AdsInfo | null = ads ? {
    demo: crm.demo, current: ads.integration_id, account: ads.account_id ? ads.account_name ?? ads.account_id : null,
    lastSync: when(ads.last_sync_at), lastError: ads.last_error,
    choices: adChoices.map((c) => ({ integration_id: c.integration_id, label: `${c.account_name ?? c.account_id}${c.client_name ? ` (fiche ${c.client_name})` : ""}` })),
  } : null;

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const source: SourceInfo | null = iclosed ? {
    label: adapter.label, keyRead: true, webhookRead: !!(process.env.ICLOSED_WEBHOOK_SECRET ?? "").trim(), webhookUrl: base ? `${base}/api/marketing/sources/webhook?cle=` : null,
    lastRun: when(src?.last_run_at), lastOk: src?.last_ok ?? null, lastError: src?.last_error ?? null, loading: !!src?.more,
    runs: runs.map((r) => ({ id: r.id, when: when(r.started_at) ?? "", mode: r.mode === "webhook" ? "notification" : r.mode === "manuel" ? "à la main" : "planifié", ok: r.ok,
      summary: r.ok ? [`${r.stats?.created ?? 0} rendez-vous créés`, `${r.stats?.updated ?? 0} mis à jour`, `${r.stats?.leads ?? 0} contacts sans rendez-vous`, `${r.stats?.tasks ?? 0} tâches`].join(" · ") : r.error ?? "échec" })),
  } : null;

  const account = google ?? { connected: false, email: null, status: null, calendars: [], lastSync: null, lastError: null };
  // Dernier import des appels Google qui a changé quelque chose (ou échoué), pour l'administrateur.
  const last = callsRun[0];
  const lastRun = last ? `Dernier import, ${when(last.started_at)} : ${last.ok
    ? [plural(last.stats?.created ?? 0, "rendez-vous créé", "rendez-vous créés"), plural(last.stats?.prospects ?? 0, "prospect créé", "prospects créés"), plural(last.stats?.contacts ?? 0, "contact créé", "contacts créés"), plural(last.stats?.updated ?? 0, "mis à jour", "mis à jour"), plural(last.stats?.cancelled ?? 0, "annulé", "annulés")].join(" · ")
    : `erreur (${(last.error ?? "inconnue").slice(0, 160)})`}.` : null;
  return (
    <>
      <PageHeader title="Intégrations" description="Les outils reliés à l'espace Marketing." />
      <div className="space-y-4 lg:space-y-6">
        <GoogleCard info={{ ready: googleReady(), demo: crm.demo, account, lastSync: when(account.lastSync), env: admin ? googleEnv() : null, canOpen: canAccess(profile, "marketing_calendrier"),
          calls: { enabled: readGoogleCallsSetting(callsRaw), canEdit: admin, lastRun } }} />
        {adsInfo ? <div id="publicite" className="scroll-mt-20"><AdsCard info={adsInfo} /></div> : null}
        {source ? <SourcesCard info={source} /> : null}
      </div>
    </>
  );
}

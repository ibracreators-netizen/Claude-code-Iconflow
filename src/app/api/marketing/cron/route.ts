import { NextResponse, type NextRequest } from "next/server";
import { processInbox, recordBeat } from "@/lib/marketing/inbox";
import { runBookingSync } from "@/lib/marketing/sources/run";
import { syncGoogleDue } from "@/lib/marketing/google/sync";
import { syncAgencyAds } from "@/lib/marketing/ads";
import { runAutomationsTick } from "@/lib/marketing/automations-server";
import { runOutbox } from "@/lib/marketing/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Passage du planificateur (toutes les minutes, voir supabase/ops/marketing_planificateur.sql).
 * Protégé par CRON_SECRET (Bearer). À chaque passage :
 *   1. les lignes « reçu » de leads_inbox deviennent des prospects (rejouable, sans doublon) ;
 *   2. l'outil de réservation est synchronisé (toutes les cinq minutes, si sa clé est posée) ;
 *   3. l'heure du passage est notée : Marketing › Réglages l'affiche et alerte si elle date.
 * Le passage est noté même si le traitement échoue.
 *
 * La file d'emails vers les prospects (relances, rappels) n'avance que si une automatisation allumée le
 * demande (règle 2, ou rappels de la règle 3), toutes deux éteintes par défaut. Installer le planificateur
 * ne fait donc partir aucun email vers un prospect tant que tu n'as pas allumé une de ces règles.
 */
async function handle(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET non configuré." }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (given !== secret) return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });

  const problems: string[] = [];
  const inbox = await processInbox({ limit: 100 }).catch((e) => ({ ran: false, reason: e instanceof Error ? e.message : String(e), processed: 0, traite: 0, erreur: 0, skipped: 0, stuck: 0 }));
  if (!inbox.ran) problems.push(`réception : ${inbox.reason ?? "inconnue"}`);
  if (inbox.stuck > 0) problems.push(`${inbox.stuck} lead(s) bloqué(s) en « reçu » depuis plus de 5 minutes`);

  // Outil de réservation : toutes les cinq minutes (ou à chaque passage tant qu'un premier chargement est en cours).
  const sync = await runBookingSync({ budgetMs: 25_000 }).catch((e) => ({ ran: true, ok: false, reason: e instanceof Error ? e.message : String(e), stats: null }));
  if (sync.ran && !sync.ok) problems.push(`réservations : ${"stats" in sync && sync.stats?.errors?.[0] ? sync.stats.errors[0] : ("reason" in sync ? sync.reason : null) ?? "synchronisation en échec"}`);

  // Agendas Google connectés : copie rafraîchie toutes les dix minutes (lecture seule). Un compte en échec n'arrête rien.
  await syncGoogleDue({ limit: 3 }).catch((e) => console.error("[google] synchronisation :", e instanceof Error ? e.message : e));

  // Dépense publicitaire du compte de l'agence : relue toutes les six heures (lecture seule côté Meta).
  await syncAgencyAds().catch((e) => console.error("[publicité] lecture :", e instanceof Error ? e.message : e));

  // Automatisations à délai (lead sans rendez-vous, appel sans résultat). La file d'emails vers les prospects
  // n'avance que si une règle allumée le demande, et reste en simulation tant que l'envoi réel n'est pas activé.
  const auto = await runAutomationsTick().catch((e) => { problems.push(`automatisations : ${e instanceof Error ? e.message : String(e)}`); return null; });
  if (auto?.outbox) await runOutbox({ limit: 50, worker: "cron" }).catch((e) => problems.push(`emails : ${e instanceof Error ? e.message : String(e)}`));

  const ok = problems.length === 0;
  await recordBeat({
    last_run_at: new Date().toISOString(), ok, detail: ok ? null : problems.join(" · ").slice(0, 400),
    inbox: { processed: inbox.processed, traite: inbox.traite, erreur: inbox.erreur, stuck: inbox.stuck },
    outbox: null,
  }).catch((e) => console.error("[planificateur] passage non noté :", e instanceof Error ? e.message : e));
  return NextResponse.json({ ok, problems, inbox, reservations: sync.ran ? { ok: sync.ok } : null }, { status: 200 });
}
export const POST = handle;
export const GET = handle;

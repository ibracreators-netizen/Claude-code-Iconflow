import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { sendEmail, MailerUncertain, MailerError, isMailerConfigured } from "@/lib/email/mailer";
import { buildEmailContent } from "./email-build";
import { demoRunOutbox } from "./demo-store";
import type { Appointment, MarketingSettings, Prospect, ScheduledEmail } from "./types";
import { DEFAULT_MARKETING_SETTINGS } from "./types";

export interface OutboxSummary { ran: boolean; reason?: string; claimed: number; sent: number; simulated: number; failed: number; uncertain: number; cancelled: number; live: boolean }

const MAX_ATTEMPTS = 3;
const mergeSettings = (raw: unknown): MarketingSettings => ({ ...DEFAULT_MARKETING_SETTINGS, ...((raw && typeof raw === "object" ? raw : {}) as Partial<MarketingSettings>) });

/**
 * Traite la file d'emails Marketing. DRY RUN par défaut (emails_live=false) : rien n'est envoyé, chaque ligne est
 * marquée comme simulée (ce qu'elle aurait envoyé reste visible). Réclamation par verrou (RPC, FOR UPDATE SKIP LOCKED).
 * Invariant : avant une relance, on relit l'état du prospect ; un prospect ayant un RDV confirmé ne reçoit pas la relance.
 */
export async function runOutbox(opts?: { limit?: number; worker?: string }): Promise<OutboxSummary> {
  if (!isSupabaseConfigured()) return demoRunOutbox(opts?.limit ?? 25);

  const admin = createAdminClient();
  if (!admin) return { ran: false, reason: "service_key_missing", claimed: 0, sent: 0, simulated: 0, failed: 0, uncertain: 0, cancelled: 0, live: false };
  const worker = opts?.worker ?? `w-${Math.random().toString(36).slice(2, 8)}`;

  const { data: cfgRow } = await admin.from("marketing_settings").select("value").eq("key", "config").maybeSingle();
  const settings = mergeSettings(cfgRow?.value);
  const live = settings.emails_live === true && isMailerConfigured();
  const target = (addr: string) => (settings.emails_live && settings.test_email ? settings.test_email : addr); // mode « adresse de test » seulement en live

  const { data: claimed, error } = await admin.rpc("marketing_claim_due_emails", { p_worker: worker, p_limit: opts?.limit ?? 25 });
  if (error) return { ran: false, reason: error.message, claimed: 0, sent: 0, simulated: 0, failed: 0, uncertain: 0, cancelled: 0, live };
  const rows = (claimed ?? []) as ScheduledEmail[];
  const sum: OutboxSummary = { ran: true, claimed: rows.length, sent: 0, simulated: 0, failed: 0, uncertain: 0, cancelled: 0, live };

  for (const row of rows) {
    const patch: Partial<ScheduledEmail> = { updated_at: new Date().toISOString() };
    try {
      const prospect = row.prospect_id ? ((await admin.from("marketing_prospects").select("*").eq("id", row.prospect_id).maybeSingle()).data as Prospect | null) : null;
      // Invariant relance : un prospect ayant un RDV confirmé ne reçoit pas la relance (décision relue maintenant).
      if (row.template === "relance_optin" && row.prospect_id) {
        const { count } = await admin.from("marketing_appointments").select("id", { count: "exact", head: true }).eq("prospect_id", row.prospect_id).eq("status", "confirme");
        if ((count ?? 0) > 0 || prospect?.unsubscribed_at) { await admin.from("marketing_scheduled_emails").update({ ...patch, status: "cancelled", last_error: prospect?.unsubscribed_at ? "Prospect désinscrit" : "RDV confirmé : relance annulée" }).eq("id", row.id); sum.cancelled++; continue; }
      }
      const appointment = row.appointment_id ? ((await admin.from("marketing_appointments").select("*").eq("id", row.appointment_id).maybeSingle()).data as Appointment | null) : null;
      if (appointment && appointment.status !== "confirme") { await admin.from("marketing_scheduled_emails").update({ ...patch, status: "cancelled", last_error: "RDV non confirmé" }).eq("id", row.id); sum.cancelled++; continue; }
      const content = buildEmailContent(row, { prospect, appointment, settings });
      if (!content) { await admin.from("marketing_scheduled_emails").update({ ...patch, status: "failed", last_error: "Aucune adresse email valide pour ce prospect" }).eq("id", row.id); sum.failed++; continue; }

      if (!live) { // DRY RUN : on n'envoie rien, on enregistre ce qui aurait été envoyé
        await admin.from("marketing_scheduled_emails").update({ ...patch, status: "sent", dry_run: true, sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
        sum.simulated++; continue;
      }
      try {
        const { id } = await sendEmail({ to: target(prospect!.email!), subject: content.subject, html: content.html, text: content.text }, { idempotencyKey: row.idempotency_key });
        await admin.from("marketing_scheduled_emails").update({ ...patch, status: "sent", dry_run: false, provider_message_id: id, sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
        sum.sent++;
      } catch (err) {
        if (err instanceof MailerUncertain) { // sort inconnu : surtout PAS de renvoi aveugle
          await admin.from("marketing_scheduled_emails").update({ ...patch, status: "uncertain", last_error: err.message }).eq("id", row.id);
          sum.uncertain++;
        } else {
          const msg = err instanceof MailerError ? err.message : String(err);
          const retry = row.attempts < MAX_ATTEMPTS;
          await admin.from("marketing_scheduled_emails").update({ ...patch, status: retry ? "pending" : "failed", last_error: msg, send_at: retry ? new Date(Date.now() + row.attempts * 5 * 60000).toISOString() : row.send_at }).eq("id", row.id);
          sum.failed++;
        }
      }
    } catch (err) {
      await admin.from("marketing_scheduled_emails").update({ ...patch, status: "failed", last_error: String((err as Error)?.message ?? err).slice(0, 300) }).eq("id", row.id);
      sum.failed++;
    }
  }
  return sum;
}

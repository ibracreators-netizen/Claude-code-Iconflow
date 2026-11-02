import "server-only";
import { rdvReminderEmail, optinRelanceEmail, type EmailContent } from "@/lib/email/templates";
import { formatSlot } from "./slots";
import type { Appointment, MarketingSettings, Prospect, ScheduledEmail } from "./types";

/** Base publique des liens d'email (NEXT_PUBLIC_APP_URL), sans barre finale. */
export function publicBase(): string { return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, ""); }
export function bookingPublicUrl(base = publicBase()): string | null { return base ? `${base}/reserver` : null; }
export function unsubscribeUrl(prospectId: string, base = publicBase()): string { return base ? `${base}/reserver/desinscription?p=${encodeURIComponent(prospectId)}` : "#"; }

/** Contenu d'un email de la file, ou null si impossible (pas d'adresse). `when` formaté dans le fuseau des réglages. */
export function buildEmailContent(row: Pick<ScheduledEmail, "template" | "params" | "prospect_id">, ctx: { prospect: Prospect | null; appointment: Appointment | null; settings: MarketingSettings }): EmailContent | null {
  const email = ctx.prospect?.email?.trim();
  if (!email) return null;
  if (row.template === "rappel_rdv") {
    const startIso = ctx.appointment?.starts_at;
    if (!startIso) return null;
    return rdvReminderEmail({ name: ctx.prospect?.name ?? null, when: formatSlot(startIso, ctx.settings.timezone), meetingUrl: ctx.appointment?.meeting_url ?? null });
  }
  if (row.template === "relance_optin") {
    return optinRelanceEmail({ name: ctx.prospect?.name ?? null, bookingUrl: ctx.settings.booking_public_enabled ? bookingPublicUrl() : null, unsubscribeUrl: unsubscribeUrl(row.prospect_id ?? "") });
  }
  return null;
}

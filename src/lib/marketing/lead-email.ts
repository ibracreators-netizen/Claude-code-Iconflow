import "server-only";
import { isMailerConfigured, MailerUncertain, sendEmail } from "@/lib/email/mailer";
import { escapeHtml } from "@/lib/email/templates";
import type { Crm } from "./crm-server";
import type { Contact, Prospect, ProspectEvent } from "./types";

/** Au-delà, on refuse : un CRM interne n'envoie pas d'emails en rafale. */
export const LEAD_EMAILS_PER_HOUR = 40;
export type LeadEmailStatus = "envoye" | "simule" | "incertain";

const line = (v: string, max: number) => v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
const text = (v: string, max: number) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").trim().slice(0, max);

/**
 * Envoie un email à un prospect depuis sa fiche, au nom du membre connecté (réponse à son adresse), et
 * l'écrit dans la chronologie. Sans service d'envoi configuré, l'email est simulé et noté comme tel.
 * Les réponses arrivent dans la boîte du membre, pas dans le CRM.
 */
export async function sendLeadEmail(crm: Crm, prospectId: string, input: { subject: string; body: string }): Promise<{ status: LeadEmailStatus; to: string }> {
  const prospect = await crm.db.get<Prospect>("marketing_prospects", prospectId);   // sous RLS : un commercial n'écrit qu'à ses prospects
  if (!prospect) throw new Error("Prospect introuvable.");
  const contact = prospect.contact_id ? await crm.db.get<Contact>("marketing_contacts", prospect.contact_id) : null;
  const to = (contact?.email ?? prospect.email ?? "").trim();
  if (!to) throw new Error("Ce contact n'a pas d'email.");
  if (prospect.unsubscribed_at) throw new Error("Ce contact s'est désinscrit : aucun email ne peut lui être envoyé.");
  const subject = line(input.subject ?? "", 200), body = text(input.body ?? "", 8000);
  if (!subject) throw new Error("Donne un objet à l'email.");
  if (body.length < 2) throw new Error("Écris le message avant de l'envoyer.");

  const me = crm.session.user.id, since = new Date(Date.now() - 3_600_000).toISOString();
  const recent = await crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["eq", "kind", "email"], ["eq", "created_by", me], ["gte", "created_at", since]], limit: LEAD_EMAILS_PER_HOUR + 1 }).catch(() => []);
  if (recent.length >= LEAD_EMAILS_PER_HOUR) throw new Error(`Tu as déjà envoyé ${LEAD_EMAILS_PER_HOUR} emails dans l'heure. Réessaie un peu plus tard.`);

  const author = crm.session.profile.display_name?.trim() || null;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#10160f">${body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
  let status: LeadEmailStatus = "simule", error: string | null = null;
  if (!crm.demo && isMailerConfigured()) {
    try { await sendEmail({ to, subject, html, text: body, replyTo: crm.session.user.email }); status = "envoye"; }
    catch (e) {
      if (e instanceof MailerUncertain) { status = "incertain"; error = e.message; }
      else throw new Error(e instanceof Error ? e.message : "Envoi impossible.");
    }
  }
  await crm.db.insert("marketing_prospect_events", { prospect_id: prospectId, kind: "email", data: { sujet: subject, corps: body.slice(0, 4000), a: to, statut: status, de: author, erreur: error }, created_by: me });
  return { status, to };
}

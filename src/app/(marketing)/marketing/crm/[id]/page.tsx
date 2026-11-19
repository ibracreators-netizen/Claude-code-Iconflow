import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crmPage, emailTemplates, isAdmin, members, salesRole, stagesFor } from "@/lib/marketing/crm-server";
import { isMailerConfigured } from "@/lib/email/mailer";
import type { Appointment, Contact, MarketingTask, Prospect, ProspectEvent } from "@/lib/marketing/types";
import { formatDateTimeInZone } from "@/lib/marketing/slots";
import { canAccess } from "@/lib/permissions";
import { ProspectView } from "./prospect-client";
import { ProspectTimeline } from "./prospect-timeline";
import { dayKey } from "./fiche-ui";
import { ClientProposals } from "../../reglages/automatisations/automations-client";

export const metadata: Metadata = { title: "Modifier le prospect" };

/** Fiche prospect (« Modifier l'opportunité » de LeadConnector). */
export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crm = await crmPage("marketing_prospects");
  const prospect = await crm.db.get<Prospect>("marketing_prospects", id);
  if (!prospect) notFound();
  const profile = crm.session.profile;
  const canCal = canAccess(profile, "marketing_calendrier"), canTasks = canAccess(profile, "marketing_taches"), canContacts = canAccess(profile, "marketing_contacts");
  const [settings, stages, team, templates, contact, events, tasks] = await Promise.all([
    crm.store.settings(), stagesFor(crm), members(), emailTemplates(),
    prospect.contact_id ? crm.db.get<Contact>("marketing_contacts", prospect.contact_id) : Promise.resolve(null),
    crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["eq", "prospect_id", id]], order: ["created_at", "desc"], limit: 300 }),
    canTasks ? crm.db.list<MarketingTask>("marketing_tasks", { where: [["eq", "prospect_id", id]], order: ["created_at", "desc"] }) : Promise.resolve([] as MarketingTask[]),
  ]);
  const external = settings.booking_mode !== "interne";
  const [appointments, slots] = canCal
    ? await Promise.all([crm.store.appointmentsForProspect(id), external ? Promise.resolve([]) : crm.store.availableSlots(21)])
    : [[] as Appointment[], []];
  const names = Object.fromEntries(team.map((m) => [m.id, m.name]));
  // Règle 6 : après une signature, l'administrateur valide ici (ou dans Réglages › Automatisations) la création du client dans Studio.
  const [proposal] = isAdmin(crm.session) ? await crm.db.list<{ id: string; created_at: string }>("marketing_client_proposals", { where: [["eq", "prospect_id", id], ["eq", "status", "en_attente"]], limit: 1 }).catch(() => []) : [];
  const sales = salesRole(crm.session);
  const now = new Date();
  // Remarques : les notes écrites à la main (le texte complet). Les modifications du champ « notes » restent dans l'historique.
  const notes = events.filter((e) => e.kind === "note" && typeof (e.data as Record<string, unknown> | null)?.texte === "string");

  return (
    <ProspectView
      prospect={prospect} contact={contact} stages={stages} members={team} names={names}
      tasks={tasks} notes={notes} appointments={appointments} slots={slots} slotMinutes={settings.slot_minutes} canBook={canCal && !external} bookingUrl={settings.booking_url}
      timezone={settings.timezone} today={dayKey(now, settings.timezone)} now={now.toISOString()} me={crm.session.user.id}
      perms={{ remove: !sales, assign: !sales, tasks: canTasks, calendar: canCal, contacts: canContacts }}
      mail={{ templates, mailReady: !crm.demo && isMailerConfigured(), canEditTemplates: isAdmin(crm.session), myName: profile.display_name ?? null }}
      history={<ProspectTimeline events={events} timezone={settings.timezone} names={names} />}
      proposal={proposal ? <ClientProposals rows={[{ id: proposal.id, prospectId: id, name: (contact?.company ?? contact?.name ?? prospect.name ?? "").trim() || null, email: contact?.email ?? prospect.email ?? null, amount: prospect.signed_amount ?? null, when: formatDateTimeInZone(proposal.created_at, settings.timezone) }]} /> : null}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crmPage, members, stagesFor } from "@/lib/marketing/crm-server";
import type { Contact, Prospect, ProspectEvent } from "@/lib/marketing/types";
import { stageHex } from "@/lib/marketing/ui";
import { canAccess } from "@/lib/permissions";
import { ProspectTimeline } from "../../crm/[id]/prospect-timeline";
import { ContactDetail, type ContactDeal } from "./contact-detail";

export const metadata: Metadata = { title: "Contact" };

/** Fiche contact : coordonnées, ses prospects (affaires) et l'historique de ces affaires. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, crm] = await Promise.all([params, crmPage("marketing_contacts")]);
  const contact = await crm.db.get<Contact>("marketing_contacts", id);
  if (!contact) notFound();
  const [settings, stages, team, prospects] = await Promise.all([
    crm.store.settings(), stagesFor(crm), members(),
    crm.db.list<Prospect>("marketing_prospects", { where: [["eq", "contact_id", id]], order: ["created_at", "desc"] }),
  ]);
  const events = prospects.length ? await crm.db.list<ProspectEvent>("marketing_prospect_events", { where: [["in", "prospect_id", prospects.map((p) => p.id)]], order: ["created_at", "desc"], limit: 200 }) : [];
  const names = Object.fromEntries(team.map((m) => [m.id, m.name]));
  const deals: ContactDeal[] = prospects.map((p) => {
    const stage = stages.find((s) => s.id === p.stage_id) ?? null;
    return { id: p.id, title: p.title ?? p.source ?? "Affaire", stage: stage?.name ?? "Sans étape", color: stageHex(stage), value: p.signed_amount ?? p.value ?? null, created_at: p.created_at };
  });
  return (
    <ContactDetail contact={contact} deals={deals} timezone={settings.timezone} now={new Date().toISOString()}
      canProspects={canAccess(crm.session.profile, "marketing_prospects")}
      history={<ProspectTimeline events={events} timezone={settings.timezone} names={names} />} />
  );
}

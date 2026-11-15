import type { Metadata } from "next";
import { Contact as ContactIcon } from "lucide-react";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import type { Contact, Prospect } from "@/lib/marketing/types";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { DemoBadge } from "@/components/shared/demo-badge";
import { ContactsTable, NewContactButton } from "./contacts-client";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const crm = await crmPage("marketing_contacts");
  const [contacts, prospects, settings] = await Promise.all([
    crm.db.list<Contact>("marketing_contacts", { order: ["created_at", "desc"] }),
    crm.db.list<Prospect>("marketing_prospects"),
    crm.store.settings(),
  ]);
  const deals: Record<string, number> = {};
  for (const p of prospects) if (p.contact_id) deals[p.contact_id] = (deals[p.contact_id] ?? 0) + 1;
  return (
    <>
      <PageHeader eyebrow="IconFlow Marketing" title="Contacts" description="Une fiche par personne. L'opt-in du site, l'import et l'outil de réservation alimentent tous la même fiche, rapprochée par email puis par téléphone."
        actions={<div className="flex items-center gap-2">{crm.demo ? <DemoBadge /> : null}<NewContactButton /></div>} />
      {contacts.length === 0 ? (
        <div className="card"><EmptyState icon={ContactIcon} title="Aucun contact" description="Un contact est créé tout seul à l'arrivée d'un lead. Tu peux aussi en ajouter un à la main." /></div>
      ) : <ContactsTable contacts={contacts} deals={deals} timezone={settings.timezone} canExport={isAdmin(crm.session)} />}
    </>
  );
}

import type { Metadata } from "next";
import { crmPage, isAdmin } from "@/lib/marketing/crm-server";
import { contactPage, parseContactQuery } from "@/lib/marketing/contacts-server";
import { ContactsView } from "./contacts-view";

export const metadata: Metadata = { title: "Contacts" };

/** Contacts : tableau paginé côté serveur sur ordinateur, liste « Charger plus » sur téléphone (comme LeadConnector). */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, crm] = await Promise.all([searchParams, crmPage("marketing_contacts")]);
  const query = parseContactQuery(sp);
  const { timezone } = await crm.store.settings();
  const { rows, total } = await contactPage(crm, query, timezone, { offset: (query.page - 1) * query.size, limit: query.size });
  return <ContactsView rows={rows} total={total} query={query} timezone={timezone} now={new Date().toISOString()} admin={isAdmin(crm.session)} />;
}

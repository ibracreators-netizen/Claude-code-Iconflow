import type { Metadata } from "next";
import { crmPage, salesRole } from "@/lib/marketing/crm-server";
import { NewContactForm } from "./new-contact-form";

export const metadata: Metadata = { title: "Ajouter un contact" };

export default async function NewContactPage() {
  const crm = await crmPage("marketing_contacts");
  return <NewContactForm sales={!!salesRole(crm.session)} />;
}
